import { pipeline, env } from '@huggingface/transformers'
import { MSG } from '~/utils/stt-config'

env.allowLocalModels = false

// ─── Critical: Patch WebGPU before any ONNX/transformers initialization ────────
//
// The JSEP WASM binary (ort-wasm-simd-threaded.jsep.wasm) calls
// navigator.gpu.requestAdapter() during WebAssembly.instantiate() via Asyncify.
// In Chrome extension offscreen documents, this call NEVER resolves, causing
// pipeline() to hang indefinitely.
//
// Fix: make requestAdapter() return null immediately → JSEP detects "no GPU"
// and falls back to pure CPU execution without hanging.
try {
  if ((navigator as any).gpu) {
    const _originalGPU = (navigator as any).gpu
    ;(navigator as any).gpu = {
      ..._originalGPU,
      requestAdapter: () => {
        console.log('[STT] WebGPU requestAdapter() intercepted → returning null to prevent hang')
        return Promise.resolve(null)
      },
    }
    console.log('[STT] WebGPU patched to prevent offscreen hang')
  }
} catch (e) {
  console.log('[STT] WebGPU patch skipped:', e)
}

let transcriber: any = null
let isModelReady = false
let currentModelRepo: string | null = null

async function loadModel(modelRepo: string) {
  if (isModelReady && currentModelRepo === modelRepo) {
    chrome.runtime.sendMessage({ type: MSG.STT_PROGRESS, status: 'ready', progress: 100 })
    return
  }

  if (transcriber && currentModelRepo !== modelRepo) {
    transcriber = null
    isModelReady = false
  }

  try {
    console.log('[STT] Starting model load:', modelRepo)

    chrome.runtime.sendMessage({ type: MSG.STT_PROGRESS, status: 'loading', progress: 0 })

    // Heartbeat every 2s so UI knows the process is alive
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null
    let done = false

    heartbeatInterval = setInterval(() => {
      if (done) return
      chrome.runtime.sendMessage({ type: MSG.STT_PROGRESS, status: 'loading', progress: 100 })
    }, 2000)

    const TIMEOUT_MS = 3 * 60 * 1000
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Model load timed out after 3 minutes')), TIMEOUT_MS)
    )

    console.log('[STT] Calling pipeline() ...')
    try {
      transcriber = await Promise.race([
        pipeline('automatic-speech-recognition', modelRepo, {
          dtype: 'q4',
          device: 'wasm',
          progress_callback: (progress: any) => {
            if (progress.status === 'progress' && typeof progress.progress === 'number') {
              chrome.runtime.sendMessage({
                type: MSG.STT_PROGRESS,
                status: 'downloading',
                progress: Math.round(progress.progress),
              })
            } else if (progress.status === 'done') {
              console.log('[STT] File done:', progress.file)
              chrome.runtime.sendMessage({
                type: MSG.STT_PROGRESS,
                status: 'loading',
                progress: 100,
              })
            } else if (progress.status === 'initiate') {
              console.log('[STT] Initiating:', progress.file)
            } else if (progress.status === 'ready') {
              console.log('[STT] Component ready:', progress.file)
            }
          },
        }),
        timeoutPromise,
      ])
      console.log('[STT] pipeline() resolved successfully')
    } finally {
      done = true
      if (heartbeatInterval) clearInterval(heartbeatInterval)
    }

    isModelReady = true
    currentModelRepo = modelRepo
    console.log('[STT] Model loaded successfully')
    chrome.runtime.sendMessage({ type: MSG.STT_PROGRESS, status: 'ready', progress: 100 })
  } catch (err: any) {
    console.error('[STT] Model load failed:', err?.message, err?.stack)
    isModelReady = false
    transcriber = null
    chrome.runtime.sendMessage({ type: MSG.STT_ERROR, error: err?.message || String(err) })
  }
}

async function base64ToFloat32Array(base64String: string): Promise<Float32Array> {
  const response = await fetch(base64String)
  const arrayBuffer = await response.arrayBuffer()

  const audioContext = new AudioContext({ sampleRate: 16000 })
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  const float32Array = audioBuffer.getChannelData(0)
  const copy = new Float32Array(float32Array)
  audioContext.close()

  return copy
}

async function transcribe(audioBase64: string, language: string) {
  if (!isModelReady || !transcriber) {
    chrome.runtime.sendMessage({ type: MSG.STT_ERROR, error: 'Model not loaded' })
    return
  }

  try {
    chrome.runtime.sendMessage({ type: MSG.STT_PROGRESS, status: 'transcribing', progress: 0 })

    const audioData = await base64ToFloat32Array(audioBase64)

    const options: any = {}
    if (language && language !== 'auto') {
      options.language = language
    }

    const result = await transcriber(audioData, options)
    const text = result?.text || ''

    console.log('[STT] Transcription complete, length:', text.length)
    chrome.runtime.sendMessage({ type: MSG.STT_RESULT, text })
  } catch (err: any) {
    console.error('[STT] Transcription failed:', err)
    chrome.runtime.sendMessage({ type: MSG.STT_ERROR, error: err.message })
  }
}

async function deleteModel(modelRepo: string) {
  try {
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      if (name.includes('transformers') || name.includes(modelRepo)) {
        await caches.delete(name)
        console.log('[STT] Deleted cache:', name)
      }
    }

    transcriber = null
    isModelReady = false
    currentModelRepo = null

    chrome.runtime.sendMessage({ type: MSG.STT_PROGRESS, status: 'deleted', progress: 0 })
  } catch (err: any) {
    console.error('[STT] Delete model failed:', err)
    chrome.runtime.sendMessage({ type: MSG.STT_ERROR, error: err.message })
  }
}

chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  if (msg.type === MSG.STT_LOAD_MODEL) {
    loadModel(msg.modelRepo)
    sendResponse({ received: true })
  }

  if (msg.type === MSG.STT_TRANSCRIBE) {
    transcribe(msg.audioBase64, msg.language)
    sendResponse({ received: true })
  }

  if (msg.type === MSG.STT_CHECK_MODEL) {
    sendResponse({ ready: isModelReady, modelRepo: currentModelRepo })
  }

  if (msg.type === MSG.STT_DELETE_MODEL) {
    deleteModel(msg.modelRepo)
    sendResponse({ received: true })
  }
})

console.log('[STT] Offscreen document initialized')
