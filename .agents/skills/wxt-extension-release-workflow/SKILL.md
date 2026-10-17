---
name: WXT Extension Release Workflow
description: A complete step-by-step workflow for upgrading the extension version, documenting updates in CHANGELOG.md, packaging the extension for Chrome, Firefox, and Edge, and submitting the release to the web stores in a single workflow.
---

# WXT Extension Release Workflow

This skill outlines the standard, unified workflow to release a new version of the extension to the **Chrome Web Store**, **Firefox Addon Store**, and **Microsoft Edge Addons Store** simultaneously.

## 1. Version Bumping
Before releasing, determine the appropriate semantic version bump (Major, Minor, or Patch) based on the changes made, and update it:

1. Open [package.json](file:///Users/darksouls/projects/m10c/package.json).
2. Locate the `"version"` field:
   ```json
   "version": "3.1.1"
   ```
3. Increment the version accordingly and save the file.

## 2. Update the Changelog
Document all notable changes under the new version in [CHANGELOG.md](file:///Users/darksouls/projects/m10c/CHANGELOG.md).

1. Add a new section at the top of the file, right below `# Changelog` and the introduction:
   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD

   ### Added
   - Description of new features...

   ### Fixed / Refactored
   - Description of bug fixes or enhancements...
   ```
2. Follow semantic labeling (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) and ensure a clean separator `---` between releases.

## 3. Package and Zip the Extension
WXT packages the extension separately for Chromium (MV3) and Firefox (MV2). Microsoft Edge is Chromium-based and uses the exact same build artifact (`-chrome.zip`) as Chrome. Mozilla Firefox strictly requires uploading the source code for bundled extensions.

1. **Build for Chrome and Edge**:
   ```bash
   pnpm run zip
   ```
   This compiles the project and generates `.output/m10c-video-summary-extension-<version>-chrome.zip`.

2. **Build for Firefox**:
   ```bash
   pnpm run zip:firefox
   ```
   This compiles the Firefox version and generates:
   - The extension zip: `.output/m10c-video-summary-extension-<version>-firefox.zip`
   - The sources zip: `.output/m10c-video-summary-extension-<version>-sources.zip`

Verify that all three files are successfully generated in the `.output/` directory before proceeding.

## 4. Multi-Store Submission
Use the unified WXT submit tool to upload the zip packages to the Chrome Web Store, Firefox Addon Store, and Microsoft Edge Addons Store in parallel.

1. Ensure the submission secrets are set in `.env.submit` (never commit this file to git).
2. Run the submission command:
   ```bash
   pnpm wxt submit \
     --chrome-zip .output/m10c-video-summary-extension-<version>-chrome.zip \
     --firefox-zip .output/m10c-video-summary-extension-<version>-firefox.zip \
     --firefox-sources-zip .output/m10c-video-summary-extension-<version>-sources.zip \
     --edge-zip .output/m10c-video-summary-extension-<version>-chrome.zip
   ```

WXT will automatically read `.env.submit` to acquire tokens and API keys, upload all files in parallel, wait for Firefox validation (verifying `0 errors`), and submit the updates for store review.

## 5. Git Tagging & Automated GitHub Release
After a successful submission, create and push an annotated git tag.

1. Commit the version bump and changelog changes (if not already committed):
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: release v<version>"
   ```
2. Create an annotated tag:
   ```bash
   git tag -a v<version> -m "v<version>"
   ```
3. Push the tag to the remote:
   ```bash
   git push origin v<version>
   ```

The tag should follow the format `v<MAJOR>.<MINOR>.<PATCH>` (e.g., `v3.1.1`) to match the version in `package.json`.

> **💡 Automated GitHub Release:**  
> Pushing the tag (`v*`) automatically triggers the GitHub Actions workflow in [.github/workflows/release.yml](file:///Users/darksouls/projects/m10c/.github/workflows/release.yml). The workflow will:
> 1. Build the Chrome MV3 and Firefox MV2 extension ZIPs in CI.
> 2. Automatically parse the corresponding version notes from [CHANGELOG.md](file:///Users/darksouls/projects/m10c/CHANGELOG.md).
> 3. Create the GitHub Release and upload all `.output/*.zip` artifacts.
