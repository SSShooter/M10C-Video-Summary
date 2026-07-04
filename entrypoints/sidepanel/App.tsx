import { useEffect, useState, useCallback, useRef } from 'react'
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

// ─── Whisper engine (Web Worker) ─────────────────────────────────────────────
// Broadcast to both local listeners (sttEvents) and other extension contexts (chrome.runtime)
function broadcast(msg: any) {
  sttEvents.emit(msg)
  chrome.runtime.sendMessage(msg)
}

// Mirror of Worker model state for synchronous checks from other extension contexts
let isModelReady = false
let currentModelRepo: string | null = null

// AudioContext is not available in Workers, so audio decoding stays on the main thread
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
  const workerRef = useRef<Worker | null>(null)

  // Initialize Whisper Worker
  useEffect(() => {
    const worker = new Worker(
      chrome.runtime.getURL('/whisper-worker.js')
    )

    // Send ONNX Runtime WASM URLs to Worker (chrome.runtime.getURL not available in Workers)
    const { mjsUrl, wasmUrl } = getOrtUrls()
    worker.postMessage({ type: 'init', mjsUrl, wasmUrl })

    // Handle messages from Worker
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      console.log('[STT App] Worker message:', msg.type, 'status:', msg.status, 'progress:', msg.progress)

      if (msg.type === 'progress') {
        // Update mirrored state
        if (msg.status === 'ready') {
          isModelReady = true
          if (msg.modelRepo) currentModelRepo = msg.modelRepo
          chrome.storage.local.set({ sttModelDownloaded: true, sttModelRepo: msg.modelRepo })
        } else if (msg.status === 'deleted') {
          isModelReady = false
          currentModelRepo = null
          chrome.storage.local.remove(['sttModelDownloaded', 'sttModelRepo'])
        }
        console.log('[STT App] Broadcasting progress:', msg.progress)
        broadcast({
          type: MSG.STT_PROGRESS,
          status: msg.status,
          progress: msg.progress,
          chunks: msg.chunks
        })
      } else if (msg.type === 'result') {
        broadcast({ type: MSG.STT_RESULT, text: msg.text, chunks: msg.chunks })
        setLastResult(msg.text)
        setLastChunks(msg.chunks)
      } else if (msg.type === 'error') {
        // Only reset model state on fatal errors (e.g. model load failure),
        // not on transient errors (e.g. transcription failure)
        if (msg.fatal) isModelReady = false
        broadcast({ type: MSG.STT_ERROR, error: msg.error })
      } else if (msg.type === 'modelStatus') {
        isModelReady = msg.ready
        currentModelRepo = msg.modelRepo
      }
    }

    worker.onerror = (err) => {
      console.error('[STT] Worker error:', err)
      broadcast({ type: MSG.STT_ERROR, error: 'Worker crashed: ' + (err.message || 'unknown error') })
    }

    workerRef.current = worker

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const loadModel = useCallback((modelRepo: string) => {
    if (!workerRef.current) return
    workerRef.current.postMessage({ type: 'loadModel', modelRepo })
  }, [])

  const transcribe = useCallback(async (audioBase64: string, language: string) => {
    if (!workerRef.current) {
      broadcast({ type: MSG.STT_ERROR, error: 'Worker not initialized' })
      return
    }

    try {
      // Decode audio on main thread (AudioContext is not available in Workers)
      broadcast({ type: MSG.STT_PROGRESS, status: 'transcribing', progress: 0 })
      const audioData = await base64ToFloat32Array(audioBase64)
      console.log('[STT] Audio decoded, samples:', audioData.length, 'duration:', (audioData.length / 16000).toFixed(1), 's')

      // Transfer Float32Array buffer to Worker (zero-copy)
      workerRef.current.postMessage(
        { type: 'transcribe', audioData, language },
        [audioData.buffer]
      )
    } catch (err: any) {
      console.error('[STT] Audio decode failed:', err)
      broadcast({ type: MSG.STT_ERROR, error: 'Audio decode failed: ' + err.message })
    }
  }, [])

  const deleteModel = useCallback((modelRepo: string) => {
    if (!workerRef.current) return
    workerRef.current.postMessage({ type: 'deleteModel', modelRepo })
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
