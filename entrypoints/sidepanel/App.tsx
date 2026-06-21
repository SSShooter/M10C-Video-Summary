import { useEffect, useState, useCallback, useRef } from 'react'
import { pipeline, env } from '@huggingface/transformers'
import { toast } from 'sonner'
import { storage } from '@wxt-dev/storage'

import { STTSection } from '~/components/STTSection'
import { Toaster } from '~/components/ui/sonner'
import { ScrollArea } from '~/components/ui/scroll-area'
import { t } from '~/utils/i18n'
import { MSG, STT_STORAGE_KEY, DEFAULT_STT_CONFIG, type STTConfig } from '~/utils/stt-config'
import { getOrtUrls } from '~/utils/ort-cache'
import { STTEngineContext, type STTEngine } from '~/contexts/stt-engine'
import { sttEvents } from '~/utils/stt-events'

// ─── ONNX Runtime setup ──────────────────────────────────────────────────────
env.allowLocalModels = false
const { mjsUrl, wasmUrl } = getOrtUrls()
env.backends.onnx.wasm.numThreads = 1
env.backends.onnx.wasm.wasmPaths = { mjs: mjsUrl, wasm: wasmUrl }

// Patch WebGPU to prevent hangs in extension context
try {
  if ((navigator as any).gpu) {
    const _originalGPU = (navigator as any).gpu
    ;(navigator as any).gpu = {
      ..._originalGPU,
      requestAdapter: () => {
        console.log('[STT] WebGPU requestAdapter() intercepted → returning null')
        return Promise.resolve(null)
      },
    }
  }
} catch (e) {
  // WebGPU not available, skip
}

// ─── Whisper engine ──────────────────────────────────────────────────────────
// Broadcast to both local listeners (sttEvents) and other extension contexts (chrome.runtime)
function broadcast(msg: any) {
  sttEvents.emit(msg)
  chrome.runtime.sendMessage(msg)
}

let transcriber: any = null
let isModelReady = false
let currentModelRepo: string | null = null

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

export default function SidePanelApp() {
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [lastChunks, setLastChunks] = useState<{ text: string; timestamp: [number, number] }[]>([])

  const loadModel = useCallback(async (modelRepo: string) => {
    if (isModelReady && currentModelRepo === modelRepo) {
      broadcast({ type: MSG.STT_PROGRESS, status: 'ready', progress: 100 })
      return
    }

    if (transcriber && currentModelRepo !== modelRepo) {
      transcriber = null
      isModelReady = false
    }

    try {
      console.log('[STT] Starting model load:', modelRepo)
      broadcast({ type: MSG.STT_PROGRESS, status: 'loading', progress: 0 })

      let heartbeatInterval: ReturnType<typeof setInterval> | null = null
      let done = false
      heartbeatInterval = setInterval(() => {
        if (done) return
        broadcast({ type: MSG.STT_PROGRESS, status: 'loading', progress: 100 })
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
                broadcast({
                  type: MSG.STT_PROGRESS,
                  status: 'downloading',
                  progress: Math.round(progress.progress),
                })
              } else if (progress.status === 'done') {
                broadcast({
                  type: MSG.STT_PROGRESS,
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
      console.log('[STT] Model loaded successfully')
      broadcast({ type: MSG.STT_PROGRESS, status: 'ready', progress: 100 })
    } catch (err: any) {
      console.error('[STT] Model load failed:', err?.message)
      isModelReady = false
      transcriber = null
      broadcast({ type: MSG.STT_ERROR, error: err?.message || String(err) })
    }
  }, [])

  const transcribe = useCallback(async (audioBase64: string, language: string) => {
    if (!isModelReady || !transcriber) {
      broadcast({ type: MSG.STT_ERROR, error: 'Model not loaded' })
      return
    }

    const keepAlive = setInterval(() => {
      broadcast({ type: MSG.STT_PROGRESS, status: 'transcribing', progress: 100 })
    }, 10000)

    try {
      broadcast({ type: MSG.STT_PROGRESS, status: 'transcribing', progress: 0 })
      const audioData = await base64ToFloat32Array(audioBase64)
      console.log('[STT] Audio decoded, samples:', audioData.length, 'duration:', (audioData.length / 16000).toFixed(1), 's')
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
      console.log('[STT] Starting Whisper inference, language:', options.language || 'auto')
      const result = await transcriber(audioData, {
        ...options,
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
      })
      const text = result?.text || ''
      const chunks = result?.chunks || []
      console.log('[STT] Transcription complete, length:', text.length, 'chunks:', chunks.length)
      broadcast({ type: MSG.STT_RESULT, text, chunks })
      setLastResult(text)
      setLastChunks(chunks)
    } catch (err: any) {
      console.error('[STT] Transcription failed:', err)
      broadcast({ type: MSG.STT_ERROR, error: err.message })
    } finally {
      clearInterval(keepAlive)
    }
  }, [])

  const deleteModel = useCallback(async (modelRepo: string) => {
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
      broadcast({ type: MSG.STT_PROGRESS, status: 'deleted', progress: 0 })
    } catch (err: any) {
      broadcast({ type: MSG.STT_ERROR, error: err.message })
    }
  }, [])

  // Listen for STT messages from content scripts (direct broadcast)
  useEffect(() => {
    const listener = (msg: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
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
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [loadModel, transcribe, deleteModel])

  // Pick up pending STT operations written by the background script.
  // When the options page or popup triggers an STT action, the background
  // stores it in chrome.storage.local and opens this side panel.
  useEffect(() => {
    chrome.storage.local.get('sttPendingOp', (data) => {
      if (!data.sttPendingOp) return
      const op = data.sttPendingOp
      chrome.storage.local.remove('sttPendingOp')
      console.log('[STT] Processing pending operation:', op.type)
      if (op.type === MSG.STT_LOAD_MODEL) loadModel(op.modelRepo)
      if (op.type === MSG.STT_DELETE_MODEL) deleteModel(op.modelRepo)
      // STT_TRANSCRIBE is not stored (audio too large) — handled via message listener
    })
  }, [loadModel, deleteModel])

  const engine: STTEngine = {
    loadModel,
    deleteModel,
    checkModel: async () => ({ ready: isModelReady, modelRepo: currentModelRepo }),
  }

  return (
    <div className="h-screen bg-background text-foreground p-4 flex flex-col overflow-hidden">
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-lg font-bold">{t('extensionName')}</h1>
        <p className="text-xs text-muted-foreground">{t('sttSettings')}</p>
      </div>

      <STTEngineContext.Provider value={engine}>
        <STTSection />
      </STTEngineContext.Provider>

      {lastResult && (
        <div className="mt-4 flex-1 flex flex-col overflow-hidden min-h-0">
          <h3 className="text-sm font-semibold mb-2 flex-shrink-0">{t('sttTranscribe')}</h3>
          <ScrollArea className="flex-1 rounded border p-3 min-h-0">
            {lastChunks.length > 0 ? (
              lastChunks.map((chunk, i) => {
                const fmt = (t: number) => {
                  const m = Math.floor(t / 60)
                  const s = Math.floor(t % 60)
                  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                }
                return (
                  <div key={i} className="py-2 border-b border-gray-100">
                    <div className="text-xs text-blue-500 mb-1 font-medium">
                      {fmt(chunk.timestamp[0])} - {fmt(chunk.timestamp[1])}
                    </div>
                    <div className="text-sm text-gray-900 leading-relaxed">
                      {chunk.text}
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{lastResult}</p>
            )}
          </ScrollArea>
        </div>
      )}

      <Toaster />
    </div>
  )
}
