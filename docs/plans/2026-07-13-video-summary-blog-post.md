# Video Summary Blog Post Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow YouTube and Bilibili summaries to use the existing manual Send to Blog flow.

**Architecture:** Generalize the shared summary publishing metadata from article-specific names to source title and URL. The article and video panels pass their own metadata into the same component, which sends the same `{ title, content }` Blog request through Background.

**Tech Stack:** WXT, React, TypeScript, Chrome Extension runtime messaging.

---

### Task 1: Generalize summary publishing

**Files:**
- Modify: `components/SummaryDisplay.tsx`
- Modify: `entrypoints/article-mindmap.content.tsx`
- Modify: `entrypoints/background/index.ts`
- Modify: `utils/blog-content.ts`

1. Rename article-specific publishing metadata to source metadata.
2. Rename the runtime action and URL field to generic summary publishing names.
3. Keep the Blog request body strictly `{ title, content }`.

### Task 2: Enable video summaries

**Files:**
- Modify: `components/SubtitlePanel.tsx`

1. Pass the current video title and URL to the shared summary component.
2. Preserve manual-only sending behavior for cached and newly generated summaries.

### Task 3: Verify and package Chrome

1. Run `pnpm compile`.
2. Run `pnpm build`.
3. Run `pnpm zip` and report the Chrome ZIP path and checksum.

