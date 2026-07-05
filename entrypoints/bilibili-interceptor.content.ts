export default defineContentScript({
  matches: [
    "https://www.bilibili.com/video/*",
    "https://www.bilibili.com/list/watchlater*"
  ],
  world: "MAIN",
  runAt: "document_start",
  main() {
    console.log("[Interceptor] Bilibili playurl interceptor initialized in MAIN world");

    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const input = args[0];
      let url = '';
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.href;
      } else if (input && typeof input === 'object' && 'url' in input) {
        url = (input as any).url;
      }

      if (url && (url.includes('api.bilibili.com/x/player/wbi/playurl') || url.includes('api.bilibili.com/x/player/playurl'))) {
        try {
          const response = await originalFetch.apply(this, args);
          const clone = response.clone();
          clone.json().then(data => {
            if (data && data.code === 0 && data.data) {
              console.log('[Interceptor] Captured Bilibili playurl via fetch:', data);
              (window as any).__playurl_playinfo__ = data;
              (window as any).__playinfo__ = data;
            }
          }).catch(err => {
            console.error('[Interceptor] Failed to parse playurl JSON from fetch:', err);
          });
          return response;
        } catch (err) {
          return originalFetch.apply(this, args);
        }
      }
      return originalFetch.apply(this, args);
    };

    // Intercept XMLHttpRequest requests
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: any[]) {
      (this as any)._url = typeof url === 'string' ? url : (url instanceof URL ? url.href : String(url));
      return originalOpen.apply(this, [method, url, ...rest] as any);
    };

    XMLHttpRequest.prototype.send = function(...args: any[]) {
      this.addEventListener('load', function() {
        const url = (this as any)._url;
        if (url && (url.includes('api.bilibili.com/x/player/wbi/playurl') || url.includes('api.bilibili.com/x/player/playurl'))) {
          try {
            const data = JSON.parse(this.responseText);
            if (data && data.code === 0 && data.data) {
              console.log('[Interceptor] Captured Bilibili playurl via XHR:', data);
              (window as any).__playurl_playinfo__ = data;
              (window as any).__playinfo__ = data;
            }
          } catch (err) {
            console.error('[Interceptor] Failed to parse playurl JSON from XHR:', err);
          }
        }
      });
      return originalSend.apply(this, args);
    };
  }
});
