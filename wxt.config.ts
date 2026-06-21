import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  dev: {
    server: {
      port: 3030,
    },
  },
  webExt: {
    disabled: true,
  },
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    permissions: ['activeTab', 'storage', 'webRequest', 'declarativeNetRequest', 'sidePanel'],
    // Allow WASM execution for @huggingface/transformers ONNX runtime.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    declarative_net_request: {
      rule_resources: [{
        id: 'ruleset_1',
        enabled: true,
        path: 'rules.json'
      }]
    },
    host_permissions: [
      'https://*/*',
      'http://*/*',
      'https://api.bilibili.com/*',
      'https://www.bilibili.com/*',
      'https://*.bilivideo.com/*',
      'https://www.youtube.com/*',
      'https://youtube.com/*',
    ],
    action: {
      default_title: 'Video Mindmap',
    },
    options_ui: {
      page: 'entrypoints/options/index.html',
      open_in_tab: true,
    },
    browser_specific_settings: {
      gecko: {
        data_collection_permissions: {
          required: ["browsingActivity", "websiteContent"],
          // optional: ["technicalAndInteraction"]
        }
      }
    }
  },
});
