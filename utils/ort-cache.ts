const ORT_FILES = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'] as const

/**
 * Return the extension URLs for bundled ONNX runtime files.
 */
export function getOrtUrls() {
  return {
    mjsUrl: chrome.runtime.getURL(ORT_FILES[0]),
    wasmUrl: chrome.runtime.getURL(ORT_FILES[1]),
  }
}
