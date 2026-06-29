/**
 * Whisper STT Web Worker — built as a WXT unlisted script.
 *
 * WXT bundles this as a standalone JS file at `/whisper-worker.js`
 * inside the extension directory. The side panel loads it via
 * `new Worker(chrome.runtime.getURL('/whisper-worker.js'))`.
 *
 * This avoids the cross-origin issues that Vite's `new URL()` Worker
 * pattern causes in Chrome extension dev mode (script served from
 * http://localhost vs. page origin chrome-extension://).
 */
import { pipeline, env } from '@huggingface/transformers'

export default defineUnlistedScript(() => {
  let transcriber: any = null
  let isModelReady = false
  let currentModelRepo: string | null = null

  // ─── Message handler ───────────────────────────────────────────────────────
  self.onmessage = async (e: MessageEvent) => {
    const msg = e.data

    switch (msg.type) {
      case 'init':
        initRuntime(msg.mjsUrl, msg.wasmUrl)
        break
      case 'loadModel':
        await loadModel(msg.modelRepo)
        break
      case 'transcribe':
        await transcribe(msg.audioData, msg.language)
        break
      case 'deleteModel':
        await deleteModel(msg.modelRepo)
        break
      case 'checkModel':
        self.postMessage({ type: 'modelStatus', ready: isModelReady, modelRepo: currentModelRepo })
        break
    }
  }

  // ─── ONNX Runtime setup ────────────────────────────────────────────────────
  function initRuntime(mjsUrl: string, wasmUrl: string) {
    env.allowLocalModels = false
    env.backends.onnx.wasm.numThreads = 1
    env.backends.onnx.wasm.wasmPaths = { mjs: mjsUrl, wasm: wasmUrl }

    // Patch WebGPU to prevent hangs in extension context
    try {
      if ((navigator as any).gpu) {
        const _originalGPU = (navigator as any).gpu
        ;(navigator as any).gpu = {
          ..._originalGPU,
          requestAdapter: () => {
            console.log('[STT Worker] WebGPU requestAdapter() intercepted → returning null')
            return Promise.resolve(null)
          },
        }
      }
    } catch (_e) {
      // WebGPU not available, skip
    }

    console.log('[STT Worker] ONNX Runtime initialized')
  }

  // ─── Model loading ─────────────────────────────────────────────────────────
  async function loadModel(modelRepo: string) {
    if (isModelReady && currentModelRepo === modelRepo) {
      self.postMessage({ type: 'progress', status: 'ready', progress: 100, modelRepo })
      return
    }

    if (transcriber && currentModelRepo !== modelRepo) {
      transcriber = null
      isModelReady = false
    }

    try {
      console.log('[STT Worker] Starting model load:', modelRepo)
      self.postMessage({ type: 'progress', status: 'loading', progress: 0 })

      let heartbeatInterval: ReturnType<typeof setInterval> | null = null
      let done = false
      heartbeatInterval = setInterval(() => {
        if (done) return
        self.postMessage({ type: 'progress', status: 'loading', progress: 100 })
      }, 2000)

      const TIMEOUT_MS = 3 * 60 * 1000
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Model load timed out after 3 minutes')), TIMEOUT_MS)
      )

      try {
        transcriber = await Promise.race([
          pipeline('automatic-speech-recognition', modelRepo, {
            dtype: 'q4',
            device: 'wasm',
            progress_callback: (progress: any) => {
              if (progress.status === 'progress' && typeof progress.progress === 'number') {
                self.postMessage({
                  type: 'progress',
                  status: 'downloading',
                  progress: Math.round(progress.progress),
                })
              } else if (progress.status === 'done') {
                self.postMessage({
                  type: 'progress',
                  status: 'loading',
                  progress: 100,
                })
              }
            },
          }),
          timeoutPromise,
        ])
      } finally {
        done = true
        if (heartbeatInterval) clearInterval(heartbeatInterval)
      }

      isModelReady = true
      currentModelRepo = modelRepo
      console.log('[STT Worker] Model loaded successfully')
      self.postMessage({ type: 'progress', status: 'ready', progress: 100, modelRepo })
    } catch (err: any) {
      console.error('[STT Worker] Model load failed:', err?.message)
      isModelReady = false
      transcriber = null
      self.postMessage({ type: 'error', error: err?.message || String(err), fatal: true })
    }
  }

  // ─── Transcription ─────────────────────────────────────────────────────────
  async function transcribe(audioData: Float32Array, language: string) {
    if (!isModelReady || !transcriber) {
      self.postMessage({ type: 'error', error: 'Model not loaded', fatal: true })
      return
    }

    const keepAlive = setInterval(() => {
      self.postMessage({ type: 'progress', status: 'transcribing', progress: 100 })
    }, 10000)

    try {
      self.postMessage({ type: 'progress', status: 'transcribing', progress: 0 })
      console.log(
        '[STT Worker] Audio samples:',
        audioData.length,
        'duration:',
        (audioData.length / 16000).toFixed(1),
        's'
      )

      const options: any = {}
      if (language && language !== 'auto') {
        options.language = language
      } else {
        // Whisper auto-detection is heavily English-biased.
        // Use browser language as a hint for better accuracy.
        const browserLang = navigator.language?.split('-')[0]
        if (browserLang && browserLang !== 'en') {
          options.language = browserLang
        }
      }

      console.log('[STT Worker] Starting Whisper inference, language:', options.language || 'auto')
      const result = await transcriber(audioData, {
        ...options,
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
      })
      const text = result?.text || ''
      const chunks = result?.chunks || []
      console.log('[STT Worker] Transcription complete, length:', text.length, 'chunks:', chunks.length)
      self.postMessage({ type: 'result', text, chunks })
    } catch (err: any) {
      console.error('[STT Worker] Transcription failed:', err)
      self.postMessage({ type: 'error', error: err.message })
    } finally {
      clearInterval(keepAlive)
    }
  }

  // ─── Model deletion ────────────────────────────────────────────────────────
  async function deleteModel(modelRepo: string) {
    try {
      const cacheNames = await caches.keys()
      for (const name of cacheNames) {
        if (name.includes('transformers') || name.includes(modelRepo)) {
          await caches.delete(name)
        }
      }
      transcriber = null
      isModelReady = false
      currentModelRepo = null
      self.postMessage({ type: 'progress', status: 'deleted', progress: 0 })
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.message })
    }
  }
})
