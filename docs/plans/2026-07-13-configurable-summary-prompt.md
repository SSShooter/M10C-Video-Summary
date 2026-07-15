# Configurable Summary Prompt Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the built-in summary and mindmap Prompts in Options and let saved values override them for article and video generation.

**Architecture:** Move the built-in summary Prompt template to a shared utility. Options initializes the field from the saved value or built-in template; Background resolves the same saved template at generation time and applies the configured reply language.

**Tech Stack:** WXT, React, TypeScript, `@wxt-dev/storage`.

---

### Task 1: Shared Prompt contract

1. Add a shared default summary Prompt template and language interpolation helper.
2. Extend `AIConfig` with one optional `summaryPrompt` value.
3. Make Background use the saved Prompt or the built-in default.

### Task 2: Options UI

1. Add a multiline Prompt editor showing the built-in Prompt by default.
2. Save edits through the existing Save Configuration action.
3. Add a restore-default command and Chinese-only labels.

### Task 3: Verify and package Chrome

1. Run `pnpm compile`.
2. Run `pnpm build`.
3. Run `pnpm zip` and report the Chrome package checksum.
