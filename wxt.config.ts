import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    build: {
      rollupOptions: {
        plugins: [
          {
            name: 'replace-ort-wasm-with-cdn',
            generateBundle(_options, bundle) {
              const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
              // Find and remove the WASM asset, map hashed name to original name
              let hashedName = '';
              let originalName = '';
              for (const [fileName] of Object.entries(bundle)) {
                if (fileName.endsWith('.wasm') && fileName.includes('ort-wasm')) {
                  delete bundle[fileName];
                  hashedName = fileName;
                  // Remove Vite hash: ort-wasm-simd-threaded.jsep-B0T3yYHD.wasm -> ort-wasm-simd-threaded.jsep.wasm
                  originalName = fileName.replace(/-[A-Za-z0-9]+\.wasm$/, '.wasm');
                }
              }
              // Replace hashed filename with CDN URL in all JS chunks
              if (hashedName) {
                for (const [, chunk] of Object.entries(bundle)) {
                  if (chunk.type === 'chunk' && typeof chunk.code === 'string') {
                    chunk.code = chunk.code.replaceAll(hashedName, CDN_BASE + originalName);
                  }
                }
              }
            },
          },
        ],
      },
    },
  }),
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
    permissions: ['activeTab', 'storage', 'webRequest', 'declarativeNetRequest', 'offscreen'],
    // Allow WASM execution and CDN-loaded JSEP module required for @huggingface/transformers ONNX runtime.
    // ort-wasm-simd-threaded.jsep.mjs is dynamically imported from cdn.jsdelivr.net at runtime.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; object-src 'self'",
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
