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
    permissions: ['activeTab', 'storage', 'webRequest'],
    host_permissions: [
      'https://*/*',
      'http://*/*',
      'https://api.bilibili.com/*',
      'https://www.bilibili.com/*',
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
