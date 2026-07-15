# Article Summary Blog Post Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to configure a Blog POST endpoint and manually send a completed article summary to it.

**Architecture:** Store an optional Blog publishing config beside the existing AI config. The article summary UI sends a typed runtime message only when the user clicks the send button; the Background context reads the saved credentials and performs the cross-origin POST.

**Tech Stack:** WXT, React, TypeScript, Chrome Extension runtime messaging, `@wxt-dev/storage`, existing UI and i18n helpers.

---

### Task 1: Configuration contract and Options UI

**Files:**
- Modify: `utils/ai-service.ts`
- Modify: `entrypoints/options/App.tsx`
- Modify: `public/_locales/*/messages.json`

1. Add a typed optional Blog publishing configuration with `postUrl`, `headerName`, and `token`.
2. Add an Options section with URL, Header name, and masked Token inputs.
3. Save the fields through the existing `local:aiConfigV2` flow without affecting provider configuration.
4. Run `pnpm compile`; expect no TypeScript errors.

### Task 2: Background publishing boundary

**Files:**
- Modify: `entrypoints/background/index.ts`

1. Add a runtime message for manually publishing an article summary.
2. Validate saved configuration and require an HTTP(S) URL.
3. POST JSON containing article URL, title, summary, and ISO summary time with the configured Header Token.
4. Return a safe success/error response without exposing the token.
5. Run `pnpm compile`; expect no TypeScript errors.

### Task 3: Manual send interaction

**Files:**
- Modify: `components/SummaryDisplay.tsx`
- Modify: `entrypoints/article-mindmap.content.tsx`
- Modify: `public/_locales/*/messages.json`

1. Pass article URL and title into the summary component.
2. Show a send-to-Blog button only when a complete summary exists.
3. Send only on click, including for a summary loaded from cache.
4. Disable the button during the request and show localized success/failure feedback.
5. Verify generating, regenerating, loading cache, and opening the panel never send automatically.

### Task 4: Verification

**Files:**
- Review all changed files.

1. Run `pnpm compile`; expect success.
2. Run `pnpm build`; expect successful Chrome extension build.
3. Inspect the diff for accidental automatic-send paths and credential logging.

