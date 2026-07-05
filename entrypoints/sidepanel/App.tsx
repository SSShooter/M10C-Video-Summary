import { useEffect, useCallback, useRef } from 'react'

import { STTSection } from '~/components/STTSection'
import { Toaster } from '~/components/ui/sonner'
import { t } from '~/utils/i18n'
import { MSG } from '~/utils/stt-config'
import { getOrtUrls } from '~/utils/ort-cache'
import { STTEngineContext, type STTEngine } from '~/contexts/stt-engine'
import { sttEvents } from '~/utils/stt-events'

// ─── Whisper engine (Web Worker) ─────────────────────────────────────────────
// Track the content script tab that initiated transcription, so STT results
// can be sent directly via tabs.sendMessage instead of routing through background.
let currentContentTabId: number | null = null

function broadcast(msg: any) {
  const msgWithTab = { ...msg, tabId: currentContentTabId }
  sttEvents.emit(msgWithTab)
  // Side panel → content script must use tabs.sendMessage.
  if (currentContentTabId) {
    chrome.tabs.sendMessage(currentContentTabId, msgWithTab).catch(() => {})
  }
  // Also broadcast to other extension contexts (Options page, Background, etc.)
  chrome.runtime.sendMessage(msgWithTab)
}

// Mirror of Worker model state for synchronous checks from other extension contexts
let isModelReady = false
let currentModelRepo: string | null = null
// Global transcription mutex — prevents a second tab from hijacking the worker
let isTranscribing = false

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

async function fetchAudioToFloat32Array(audioUrl: string, referer?: string): Promise<Float32Array> {
  const headers: Record<string, string> = {}
  if (referer) headers['Referer'] = referer
  const response = await fetch(audioUrl, { headers })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const arrayBuffer = await response.arrayBuffer()
  const audioContext = new AudioContext({ sampleRate: 16000 })
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  const float32Array = audioBuffer.getChannelData(0)
  const copy = new Float32Array(float32Array)
  audioContext.close()
  return copy
}

export default function SidePanelApp() {
  const workerRef = useRef<Worker | null>(null)

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      console.log('[STT App] Terminating active Whisper worker')
      workerRef.current.terminate()
      workerRef.current = null
    }
    isModelReady = false
    currentModelRepo = null
  }, [])

  const initWorker = useCallback(() => {
    terminateWorker()

    console.log('[STT App] Initializing new Whisper worker')
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
        } else if (msg.status === 'transcribing') {
          isTranscribing = true
        }
        console.log('[STT App] Broadcasting progress:', msg.progress)
        const progressPercent = msg.totalDuration > 0 ? Math.round((msg.time / msg.totalDuration) * 100) : undefined
        broadcast({
          type: MSG.STT_PROGRESS,
          status: msg.status,
          progress: msg.progress,
          ...(progressPercent !== undefined && { progressPercent }),
          time: msg.time
        })
      } else if (msg.type === 'result') {
        isTranscribing = false
        broadcast({ type: MSG.STT_RESULT, text: msg.text, chunks: msg.chunks })
      } else if (msg.type === 'error') {
        // Only reset model state on fatal errors (e.g. model load failure),
        // not on transient errors (e.g. transcription failure)
        if (msg.fatal) isModelReady = false
        isTranscribing = false
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
  }, [terminateWorker])

  // Initialize Whisper Worker and query active tab
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        currentContentTabId = tabs[0].id
      }
    })

    initWorker()

    return () => {
      terminateWorker()
    }
  }, [initWorker, terminateWorker])

  const loadModel = useCallback((modelRepo: string) => {
    if (!workerRef.current) return
    workerRef.current.postMessage({ type: 'loadModel', modelRepo })
  }, [])

  const transcribe = useCallback(async (params: { audioBase64?: string; audioUrl?: string; referer?: string; language: string }) => {
    if (!workerRef.current) {
      broadcast({ type: MSG.STT_ERROR, error: 'Worker not initialized' })
      return
    }

    // Set mutex immediately — before any async work — so concurrent requests
    // from other tabs are blocked even during audio fetch/decode.
    isTranscribing = true

    try {
      // Phase 1: fetch + decode audio — broadcast 'recording' so the page
      // shows a spinner instead of leaving the user wondering why nothing happens.
      broadcast({ type: MSG.STT_PROGRESS, status: 'recording', progress: 0 })

      let audioData: Float32Array
      if (params.audioUrl) {
        audioData = await fetchAudioToFloat32Array(params.audioUrl, params.referer)
      } else if (params.audioBase64) {
        audioData = await base64ToFloat32Array(params.audioBase64)
      } else {
        throw new Error('No audio source provided')
      }

      console.log('[STT] Audio decoded, samples:', audioData.length, 'duration:', (audioData.length / 16000).toFixed(1), 's')

      // Phase 2: hand off decoded audio to Worker — now switch to 'transcribing'.
      broadcast({ type: MSG.STT_PROGRESS, status: 'transcribing', progress: 0 })
      workerRef.current.postMessage(
        { type: 'transcribe', audioData, language: params.language },
        [audioData.buffer]
      )
    } catch (err: any) {
      console.error('[STT] Audio decode failed:', err)
      isTranscribing = false
      broadcast({ type: MSG.STT_ERROR, error: 'Audio decode failed: ' + err.message })
    }
  }, [])

  const deleteModel = useCallback((modelRepo: string) => {
    if (!workerRef.current) return
    workerRef.current.postMessage({ type: 'deleteModel', modelRepo })
  }, [])

  const terminateSTT = useCallback(() => {
    const wasModelReady = isModelReady
    const prevModelRepo = currentModelRepo

    isTranscribing = false
    initWorker()
    broadcast({ type: MSG.STT_ERROR, error: 'STT terminated by user' })

    if (wasModelReady && prevModelRepo) {
      console.log('[STT App] Auto-reloading model after worker termination:', prevModelRepo)
      loadModel(prevModelRepo)
    } else {
      chrome.storage.local.get('sttModelRepo', (data) => {
        if (wasModelReady && data.sttModelRepo) {
          console.log('[STT App] Auto-reloading model from storage after worker termination:', data.sttModelRepo)
          loadModel(data.sttModelRepo)
        }
      })
    }
  }, [initWorker, loadModel])

  // Listen for STT messages directly from content scripts (via runtime.sendMessage)
  useEffect(() => {
    const listener = (msg: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      if (msg.type === MSG.STT_TRANSCRIBE) {
        // Reject if a transcription is already running (prevent cross-tab hijack)
        if (isTranscribing) {
          sendResponse({ received: false, busy: true })
          return
        }
        // Capture the source tab ID so broadcast() can send results back directly
        if (msg.sourceTabId) {
          currentContentTabId = msg.sourceTabId
        } else if (sender.tab?.id) {
          currentContentTabId = sender.tab.id
        }
        transcribe({
          audioBase64: msg.audioBase64,
          audioUrl: msg.audioUrl,
          referer: msg.referer,
          language: msg.language,
        })
        sendResponse({ received: true })
      }
      if (msg.type === MSG.STT_LOAD_MODEL) {
        loadModel(msg.modelRepo)
        sendResponse({ received: true })
      }
      if (msg.type === MSG.STT_CHECK_MODEL) {
        // Only take ownership of this tab if we are not mid-transcription.
        // If we are busy, do NOT update currentContentTabId — otherwise the
        // ongoing transcription's progress would be broadcast to the wrong tab.
        if (msg.sourceTabId && !isTranscribing) {
          currentContentTabId = msg.sourceTabId
        }
        sendResponse({ ready: isModelReady, modelRepo: currentModelRepo, busy: isTranscribing })
      }
      if (msg.type === MSG.STT_DELETE_MODEL) {
        deleteModel(msg.modelRepo)
        sendResponse({ received: true })
      }
      if (msg.type === MSG.STT_TERMINATE) {
        terminateSTT()
        sendResponse({ received: true })
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [loadModel, transcribe, deleteModel, terminateSTT])

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
    terminateSTT,
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

      <Toaster />
    </div>
  )
}
