import { useState, useEffect, useCallback, useRef } from 'react'
import { storage } from '@wxt-dev/storage'
import { MSG, STT_STORAGE_KEY, DEFAULT_STT_CONFIG, type STTConfig, STT_MODELS } from '~/utils/stt-config'

export type STTStatus = 'idle' | 'checking' | 'loading' | 'model-not-ready' | 'recording' | 'transcribing' | 'done' | 'error'

export interface STTChunk {
  text: string
  timestamp: [number, number]
}

/**
 * @param getAudioUrl - function that returns the audio stream URL from page data,
 *                       or null if not available
 * @param videoId - optional video ID for caching transcription results
 */
export function useSTT(getAudioUrl: () => string | null | Promise<string | null>, videoId?: string | null) {
  const [status, setStatus] = useState<STTStatus>('checking')
  const [result, setResult] = useState<string | null>(null)
  const [chunks, setChunks] = useState<STTChunk[]>([])
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [chunkTime, setChunkTime] = useState<number | null>(null)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabIdRef = useRef<number | null>(null)
  const pendingTranscribeRef = useRef<{ audioUrl: string; language: string } | null>(null)
  const hasTriggeredLoadRef = useRef<boolean>(false)
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }
  }, [])

  const startConnectionTimeout = useCallback(() => {
    clearConnectionTimeout()
    connectionTimeoutRef.current = setTimeout(() => {
      if (pendingTranscribeRef.current) {
        pendingTranscribeRef.current = null
        setError('Failed to connect to side panel')
        setStatus('error')
      }
    }, 15000)
  }, [clearConnectionTimeout])

  const runTranscribe = useCallback(async (audioUrl: string, language: string) => {
    try {
      setStatus('transcribing')
      resetWatchdog()
      const sttMsg = {
        type: MSG.STT_TRANSCRIBE,
        audioUrl,
        referer: window.location.href,
        language,
        sourceTabId: tabIdRef.current,
      }
      let retries = 0
      const maxRetries = 15
      const trySend = () => {
        chrome.runtime.sendMessage(sttMsg, (res) => {
          if (res?.received) return
          // Side panel is busy with another tab — abort immediately
          if (res?.busy) {
            clearWatchdog()
            setError('STT is busy with another tab')
            setStatus('error')
            return
          }
          retries++
          if (retries < maxRetries) {
            setTimeout(trySend, 800)
          }
        })
      }
      trySend()
    } catch (err: any) {
      clearWatchdog()
      setError(err.message)
      setStatus('error')
    }
  }, [])

  const clearWatchdog = () => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
  }

  const resetWatchdog = () => {
    clearWatchdog()
    watchdogRef.current = setTimeout(() => {
      setError('Transcription timed out — side panel may have been closed')
      setStatus('error')
    }, 300_000)
  }

  const stopPolling = () => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current)
      pollingRef.current = null
    }
  }

  const checkModel = useCallback((retriesLeft = 0) => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })
    chrome.runtime.sendMessage({ type: MSG.STT_CHECK_MODEL, sourceTabId: tabIdRef.current }, (res) => {
      if (res?.ready) {
        stopPolling()
        setStatus('idle')
      } else if (res?.reloading) {
        setStatus('loading')
        pollingRef.current = setTimeout(() => checkModel(), 3000)
      } else if (retriesLeft > 0) {
        pollingRef.current = setTimeout(() => checkModel(retriesLeft - 1), 1500)
      } else {
        stopPolling()
        setStatus('model-not-ready')
      }
    })
  }, [])

  const getCacheKey = () => videoId ? `local:stt_cache_${videoId}` as `local:${string}` : null

  const loadCache = useCallback(async () => {
    const key = getCacheKey()
    if (!key) return false
    const data = await storage.getItem<{ text: string; chunks: STTChunk[] }>(key)
    if (data?.text) {
      setResult(data.text)
      setChunks(data.chunks || [])
      setStatus('done')
      return true
    }
    return false
  }, [videoId])

  const saveCache = useCallback(async (text: string, chunks: STTChunk[]) => {
    const key = getCacheKey()
    if (!key) return
    await storage.setItem(key, { text, chunks })
  }, [videoId])

  useEffect(() => {
    const listener = (msg: any) => {
      // Ignore messages intended for other tabs
      if (msg.tabId !== undefined && msg.tabId !== null && tabIdRef.current !== null && msg.tabId !== tabIdRef.current) {
        return
      }
      console.log('[STT Hook] Received runtime message:', msg.type, 'status:', msg.status, 'progress:', msg.progress)
      if (msg.type === MSG.STT_RESULT) {
        clearWatchdog()
        setResult(msg.text)
        setChunks(msg.chunks || [])
        setStatus('done')
        setError(null)
        saveCache(msg.text, msg.chunks || [])
      }
      if (msg.type === MSG.STT_ERROR) {
        clearWatchdog()
        setError(msg.error)
        setStatus('error')
      }
      if (msg.type === MSG.STT_PROGRESS) {
        clearConnectionTimeout()

        if (msg.status === 'transcribing') {
          resetWatchdog()
          setStatus('transcribing')
          if (typeof msg.progress === 'number') {
            setProgress(msg.progress)
          }
          if (typeof msg.time === 'number') {
            setChunkTime(msg.time)
          }
        } else if (msg.status === 'ready') {
          stopPolling()
          setStatus('idle')
          const pending = pendingTranscribeRef.current
          if (pending) {
            pendingTranscribeRef.current = null
            runTranscribe(pending.audioUrl, pending.language)
          }
        } else if (msg.status === 'loading' || msg.status === 'downloading') {
          setStatus('loading')
          if (msg.status === 'downloading' && typeof msg.progress === 'number') {
            setProgress(msg.progress)
          }
        } else if (msg.status === 'not-downloaded') {
          const pending = pendingTranscribeRef.current
          if (pending && !hasTriggeredLoadRef.current) {
            hasTriggeredLoadRef.current = true
            storage.getItem<STTConfig>(STT_STORAGE_KEY).then((savedConfig) => {
              const modelSize = savedConfig?.modelSize || DEFAULT_STT_CONFIG.modelSize
              const model = STT_MODELS.find(m => m.id === modelSize)
              const modelRepo = model?.repo || DEFAULT_STT_CONFIG.modelSize
              chrome.runtime.sendMessage({ type: MSG.STT_LOAD_MODEL, modelRepo })
            })
            setStatus('loading')
          } else {
            setStatus('model-not-ready')
          }
        }
      }
    }
    chrome.runtime.onMessage.addListener(listener)

    // Get this content script's tab ID first (needed before checkModel
    // so the side panel knows which tab to send STT_PROGRESS(ready) to).
    chrome.runtime.sendMessage({ action: 'GET_TAB_ID' }, (res) => {
      if (res?.tabId) {
        tabIdRef.current = res.tabId
      }
      // Then check cache.
      loadCache().then((cached) => {
        if (!cached) {
          setStatus('idle')
        }
      })
    })

    return () => {
      clearWatchdog()
      stopPolling()
      clearConnectionTimeout()
      chrome.runtime.onMessage.removeListener(listener)
    }
  }, [checkModel, loadCache, runTranscribe, clearConnectionTimeout])

  const clearCache = useCallback(async () => {
    const key = getCacheKey()
    if (key) await storage.removeItem(key)
  }, [videoId])

  const transcribe = useCallback(async () => {
    const audioUrl = await getAudioUrl()
    if (!audioUrl) {
      setError('No audio URL found on this page')
      setStatus('error')
      return
    }

    try {
      await clearCache()
      setStatus('loading')
      setResult(null)
      setChunks([])
      setProgress(0)
      setError(null)

      const savedConfig = await storage.getItem<STTConfig>(STT_STORAGE_KEY)
      const language = savedConfig?.language || DEFAULT_STT_CONFIG.language
      const modelSize = savedConfig?.modelSize || DEFAULT_STT_CONFIG.modelSize
      const model = STT_MODELS.find(m => m.id === modelSize)
      const modelRepo = model?.repo || DEFAULT_STT_CONFIG.modelSize

      pendingTranscribeRef.current = { audioUrl, language }
      hasTriggeredLoadRef.current = false

      // Open side panel
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })

      // Start connection timeout check
      startConnectionTimeout()

      // Send a single check model message to see if side panel is already open and ready
      chrome.runtime.sendMessage({ type: MSG.STT_CHECK_MODEL, sourceTabId: tabIdRef.current }, (res) => {
        if (res) {
          clearConnectionTimeout()
          // Side panel is already busy with another tab — abort immediately
          if (res.busy) {
            pendingTranscribeRef.current = null
            setError('STT is busy with another tab')
            setStatus('error')
            return
          }
          if (res.ready) {
            const pending = pendingTranscribeRef.current
            if (pending) {
              pendingTranscribeRef.current = null
              runTranscribe(pending.audioUrl, pending.language)
            }
          } else {
            if (!hasTriggeredLoadRef.current) {
              hasTriggeredLoadRef.current = true
              chrome.runtime.sendMessage({ type: MSG.STT_LOAD_MODEL, modelRepo })
            }
            setStatus('loading')
          }
        }
      })
    } catch (err: any) {
      clearWatchdog()
      setError(err.message)
      setStatus('error')
    }
  }, [getAudioUrl, clearCache, runTranscribe, startConnectionTimeout, clearConnectionTimeout])

  return { status, result, chunks, error, progress, chunkTime, transcribe, checkModel, clearCache }
}
