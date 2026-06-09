# Free Generation Quota Feature - Requirements Document

## 1. Background & Motivation

Currently, the m10c extension has two generation paths when using the Mind Elixir backend:

1. **Cached content fetch** (`GET /api/v1/mindmap/fetch`): Downloads an already-generated mindmap from the server cache. Limited to 5 free downloads per month per user (`video_mindmap_quotas` in MongoDB).
2. **AI generation** (`POST /api/v1/chat/completions`): Generates new content via LLM proxy. Requires Star balance (paid currency). No free tier.

**Problem**: There is no way to offer free AI generation as a promotional tool. The admin cannot say "users registered before date X get Z free generations before date Y."

**Goal**: Add a manageable free generation quota system that allows the admin to create time-limited promotional campaigns, granting eligible users a certain number of free AI generations (without consuming Stars).

## 2. Core Concepts

### 2.1 Existing vs New Quota System

| Aspect | Existing (Cached Download) | New (Free Generation) |
|---|---|---|
| What it gates | Downloading cached mindmaps | AI generation via LLM proxy |
| Scope | Per-month, all users | Per-campaign, eligible users only |
| Quota | Fixed 5/month | Admin-configurable per campaign |
| Storage | MongoDB `video_mindmap_quotas` | MongoDB `free_generation_campaigns` + `free_generation_usage` |
| Reset | Auto monthly | Campaign expiration date |

### 2.2 Priority Rule

**Cached content retrieval always takes priority over free generation.**

When a user clicks the generate button for a video:
1. If cached mindmap exists on server -> use cached download path (consumes monthly download quota)
2. If no cached mindmap -> check free generation quota -> if available, generate for free
3. If no free quota -> fall back to Star balance (existing behavior)

This means: free generation quota is only consumed when generating NEW content, not when downloading existing cached content.

## 3. Data Models

### 3.1 Campaign (MongoDB: `free_generation_campaigns`)

```go
type FreeGenerationCampaign struct {
    ID          primitive.ObjectID `bson:"_id,omitempty"`
    Name        string             `bson:"name"`        // Campaign name for admin reference
    QuotaPerUser int               `bson:"quotaPerUser"` // Free generations per eligible user
    MaxRegisteredAt time.Time       `bson:"maxRegisteredAt"` // Users registered before this date are eligible
    ExpiresAt   time.Time          `bson:"expiresAt"`    // Campaign expiration date
    Active      bool               `bson:"active"`       // Admin can enable/disable
    CreatedAt   time.Time          `bson:"createdAt"`
}
```

- `maxRegisteredAt`: Only users with `user.createdAt < maxRegisteredAt` are eligible
- `expiresAt`: After this date, the campaign is inactive regardless of `active` flag
- `active`: Allows admin to manually disable a campaign without deleting it

### 3.2 Usage Tracking (MongoDB: `free_generation_usage`)

```go
type FreeGenerationUsage struct {
    ID         primitive.ObjectID `bson:"_id,omitempty"`
    UserID     primitive.ObjectID `bson:"userId"`
    CampaignID primitive.ObjectID `bson:"campaignId"`
    UsedCount  int                `bson:"usedCount"`
}
```

- One record per (userId, campaignId) pair
- `UsedCount` incremented on each free generation
- Unique index on `(userId, campaignId)`

### 3.3 Indexes

```go
// free_generation_campaigns
{ "active": 1, "expiresAt": 1 }

// free_generation_usage
{ "userId": 1, "campaignId": 1 }  // unique
```

## 4. Backend API Changes (mind-elixir-go)

### 4.1 Modify: `GET /api/public/mindmap/check`

**Existing behavior**: Returns `{ available: bool, remaining?: int }` where `remaining` is the cached download quota.

**New behavior**: Additionally return `freeGeneration` field with free generation quota info.

Response shape:
```json
{
  "available": true,
  "remaining": 3,
  "freeGeneration": {
    "remaining": 5,
    "expiresAt": "2026-07-01T00:00:00Z",
    "campaignName": "June Promotion"
  }
}
```

`freeGeneration` is `null` when:
- User is not authenticated
- User is not eligible for any active campaign
- No active campaign exists

Logic: Find the best active campaign where `user.createdAt < campaign.maxRegisteredAt` and `campaign.expiresAt > now` and `campaign.active == true`. Return the campaign with the most remaining quota.

### 4.2 Modify: `POST /api/v1/chat/completions`

**Existing behavior**: Checks Star balance, deducts Stars after generation.

**New behavior**: Before checking Star balance, check if user has available free generation quota from an active campaign. If yes, skip Star balance check and deduction. After generation, increment the usage count instead.

Modified flow:
1. Identify user from JWT (existing)
2. **NEW**: Check for eligible active free generation campaign
3. **NEW**: If eligible campaign found and user has remaining quota -> skip Star check, mark as free generation
4. If no eligible campaign -> check Star balance (existing)
5. Proxy to LLM endpoint (existing)
6. **NEW**: If was free generation -> increment `free_generation_usage.usedCount` instead of deducting Stars
7. If was Star-based -> deduct Stars (existing)

Response header: Add `X-Free-Generation: true` header when the request was served via free quota, so the frontend can update the UI.

### 4.3 New: `GET /api/v1/free-generation/quota`

Returns the current user's free generation quota across all eligible active campaigns.

Response:
```json
{
  "campaigns": [
    {
      "campaignId": "...",
      "name": "June Promotion",
      "total": 10,
      "used": 3,
      "remaining": 7,
      "expiresAt": "2026-07-01T00:00:00Z"
    }
  ],
  "totalRemaining": 7
}
```

### 4.4 New: Admin Endpoints

For simplicity, admin endpoints are protected by a shared secret (`ADMIN_SECRET` env var) via `X-Admin-Secret` header.

#### `POST /api/admin/free-generation/campaigns`

Create a new campaign.

Request:
```json
{
  "name": "June Promotion",
  "quotaPerUser": 10,
  "maxRegisteredAt": "2026-06-01T00:00:00Z",
  "expiresAt": "2026-07-01T00:00:00Z",
  "active": true
}
```

#### `GET /api/admin/free-generation/campaigns`

List all campaigns (including inactive/expired).

#### `PATCH /api/admin/free-generation/campaigns/:id`

Update a campaign (e.g., toggle active, change quota).

#### `DELETE /api/admin/free-generation/campaigns/:id`

Delete a campaign.

#### `GET /api/admin/free-generation/campaigns/:id/usage`

Get usage stats for a campaign (how many users used it, total consumption).

## 5. Frontend Changes (m10c extension)

### 5.1 Background Script: New Message Handler

Add `checkFreeGenerationQuota` action in `entrypoints/background/index.ts`:

```typescript
if (request.action === "checkFreeGenerationQuota") {
  // Call GET /api/v1/free-generation/quota
  // Return the quota info to content script
}
```

### 5.2 Modify: `checkMindmapCache` Response Handling

In `MindmapDisplay.tsx`, when the `checkMindmapCache` response includes `freeGeneration`, store it in state:

```typescript
const [freeGenerationQuota, setFreeGenerationQuota] = useState<{
  remaining: number
  expiresAt: string
  campaignName: string
} | null>(null)
```

### 5.3 Modify: Tooltip Content

Current tooltip only shows when `showContentReadyButton` is true (cached content available).

New behavior: Also show tooltip when:
- Provider is mind-elixir (not BYOK)
- `freeGenerationQuota` is not null and `remaining > 0`
- No cached content available (or cached content already loaded)

Tooltip text examples:
- Cached content available: "本月剩余 3 次免费下载" (existing)
- Free generation available: "可免费生成 5 次 (截至 7月1日)"
- Both available: Show cached download count (higher priority)

### 5.4 Modify: Generate Button

When free generation quota is available and no cached content exists, the button should indicate free generation:

- Button text: "免费生成" (instead of default "生成思维导图")
- Tooltip: "可免费生成 $1 次 (有效期至 $2)"

### 5.5 Modify: `chatCompletions` Response Handling

In `background/index.ts`, when the LLM response includes `X-Free-Generation: true` header, notify the content script so it can decrement the displayed free quota count.

### 5.6 i18n Keys

Add to `messages.json` (zh_CN and en):

```json
"freeGenerationAvailable": {
  "message": "可免费生成 $1 次（有效期至 $2）",
  "description": "Tooltip showing free generation quota"
},
"freeGenerationBtn": {
  "message": "免费生成",
  "description": "Button text when free generation is available"
},
"freeGenerationExhausted": {
  "message": "免费生成次数已用完，将消耗星星",
  "description": "Toast when free generation quota is exhausted"
}
```

## 6. User Flow

### Flow 1: User with cached content available + free generation quota

1. User opens video page, m10c checks cache -> cached mindmap exists
2. Button shows "内容已准备好" with tooltip "本月剩余 3 次免费下载"
3. User clicks -> downloads cached content (monthly download quota decremented)
4. Free generation quota is NOT touched

### Flow 2: User without cached content + with free generation quota

1. User opens video page, m10c checks cache -> no cached mindmap
2. m10c checks free generation quota -> 5 remaining
3. Button shows "免费生成" with tooltip "可免费生成 5 次（有效期至 7月1日）"
4. User clicks -> AI generates mindmap (free, no Star deduction)
5. Free generation quota decremented to 4
6. Generated mindmap is saved to server cache for future users

### Flow 3: User without cached content + without free generation quota

1. User opens video page, m10c checks cache -> no cached mindmap
2. No eligible free generation campaign
3. Button shows "生成思维导图" (existing behavior)
4. User clicks -> AI generates mindmap (Star balance deducted)

### Flow 4: Cached content + free generation both available

1. Cached content takes priority in button display
2. User sees "内容已准备好" button
3. Clicking downloads cached content (uses monthly download quota)
4. Free generation quota remains untouched for when cached content is not available

## 7. Implementation Plan

### Phase 1: Backend (mind-elixir-go)

1. Add MongoDB models for `FreeGenerationCampaign` and `FreeGenerationUsage`
2. Create indexes
3. Implement campaign CRUD admin endpoints
4. Implement `GET /api/v1/free-generation/quota` endpoint
5. Modify `GET /api/public/mindmap/check` to include `freeGeneration` field
6. Modify `POST /api/v1/chat/completions` to check and consume free generation quota before Star balance

### Phase 2: Frontend (m10c)

1. Add `freeGenerationQuota` state to `MindmapDisplay.tsx`
2. Parse `freeGeneration` from `checkMindmapCache` response
3. Modify button label logic to show "免费生成" when applicable
4. Modify tooltip content to show free generation info
5. Handle `X-Free-Generation` header in streaming response
6. Add i18n keys
7. Add background script message handler for `checkFreeGenerationQuota` (optional, for explicit quota check)

## 8. Edge Cases

1. **Campaign expires mid-session**: Frontend should re-check quota on each page load. If campaign expires between check and click, backend returns normal Star-based flow.
2. **User registers after `maxRegisteredAt`**: Not eligible, `freeGeneration` is null in check response.
3. **Multiple active campaigns**: Use the one with the most remaining quota for the user. (Simplification: could also use the one expiring soonest.)
4. **Free generation fails (LLM error)**: Do NOT decrement the usage count. Only count successful generations.
5. **Streaming interrupted**: If the stream is aborted before completion, do not count as a usage. Backend should only increment usage after successful stream completion.
