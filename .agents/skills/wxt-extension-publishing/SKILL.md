---
name: WXT Extension Publishing
description: Step-by-step instructions on how to package and publish a WXT-based browser extension to the Chrome, Firefox, and Edge stores using the `wxt submit` command.
---

# WXT Extension Publishing

This skill details the correct workflow for initializing authentication credentials and submitting a WXT browser extension to the Chrome Web Store. 

## 1. Google Cloud Console Preparation
To use the automated submission API, you must have an OAuth Client ID configured correctly:
1. Go to your [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Click **+ CREATE CREDENTIALS** and choose **OAuth client ID**.
3. **CRITICAL STEP**: For the **Application type**, you must select **Desktop app** (桌面应用). If you select "Web application", the authorization flow will fail with a `redirect_uri_mismatch` error (`urn:ietf:wg:oauth:2.0:oob` is only allowed for native desktop apps).
4. Save your **Client ID** and **Client Secret**.

## 2. Initialize Submission Configuration
Run the initialization command interactively:
```bash
pnpm wxt submit init
```
> **⚠️ Always use `pnpm`, never `pnpx`:** `pnpx` (i.e., `pnpm dlx`) fetches the **latest** `wxt` and `publish-browser-extension` from the npm registry, ignoring the project's pinned versions. The latest CLI can be incompatible — e.g., `pnpx wxt submit init` silently exits with no output. `pnpm wxt ...` runs the project-local binary and is the only reliable way to run these commands.

During the prompt:
1. Select the stores you want to configure (e.g., `Chrome Web Store`).
2. Enter your extension ID (found on the Chrome Developer Dashboard).
3. Enter your **Client ID** and **Client Secret** (created as a "Desktop app" in step 1).
4. When asked `Generate new refresh token?`, select **Yes**.
5. The console will output an authorization URL starting with `https://accounts.google.com/o/oauth2/auth...`.
6. Open the link in a browser, log in with your developer account, and grant access.
7. Copy the **Auth Code** provided on the success page and paste it back into your terminal.

> **💡 Pro-Tip for Firefox (`FIREFOX_EXTENSION_ID`):**  
> If you are configuring Firefox and your Firefox Addon UUID contains curly braces (e.g., `{c8efa7cc-...}`), the underlying publishing tool currently has a bug that strips the braces and causes `404 Not Found` API errors. To fix this, use your extension's **URL Slug** (e.g., `m10c-web-page-video-to-mindmap`) as the `FIREFOX_EXTENSION_ID` instead of the UUID.

> **💡 Note for Edge (`EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`):**  
> For the Edge Addons store, you'll need the **Product ID** (found at the top of your Edge Developer Dashboard) and API Credentials (Client ID and API Key v1.1). Follow Microsoft's documentation to generate the API credentials in the Partner Center.

This process will successfully write the configurations, including `CHROME_REFRESH_TOKEN` and `EDGE_API_KEY`, to a local `.env.submit` file.

> **Security Note:** Ensure that `.env.submit` and `.env.submit.backup-*` are added to your `.gitignore` to prevent leaking tokens.

## 3. Package the Extension
Before submitting, build and package the extension into a `.zip` file:
```bash
pnpm run zip
# or simply run: wxt zip
```
The packaged file will be generated in the `.output/` folder (e.g., `.output/m10c-video-summary-extension-3.0.1-chrome.zip`).

## 4. Submit for Review
Finally, use the `wxt submit` CLI (which utilizes `publish-browser-extension` under the hood) to upload the zip to the stores and submit it for review:

```bash
# Submit only to Chrome:
pnpm wxt submit --chrome-zip .output/<YOUR_EXTENSION_ZIP_FILE_NAME>-chrome.zip

# Submit to Chrome and Edge:
pnpm wxt submit \
  --chrome-zip .output/<YOUR_EXTENSION_ZIP_FILE_NAME>-chrome.zip \
  --edge-zip .output/<YOUR_EXTENSION_ZIP_FILE_NAME>-chrome.zip
```

The CLI will check the ZIP files, fetch the required access tokens/APIs, upload the ZIPs, and automatically submit them for review.
