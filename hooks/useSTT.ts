import { useState, useEffect, useCallback, useRef } from 'react'
import { storage } from '@wxt-dev/storage'
import { MSG, STT_STORAGE_KEY, DEFAULT_STT_CONFIG, type STTConfig } from '~/utils/stt-config'

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
        if (msg.status === 'transcribing') {
          resetWatchdog()
          setStatus('transcribing')
          if (typeof msg.progress === 'number') {
            setProgress(msg.progress)
          }
          if (typeof msg.time === 'number') {
            setChunkTime(msg.time)
          }
        }
        if (msg.status === 'ready') {
          stopPolling()
          setStatus('idle')
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
      // Then check cache and model status.
      // checkModel opens the side panel and retries while it opens.
      loadCache().then((cached) => {
        if (!cached) checkModel(5)
      })
    })

    return () => {
      clearWatchdog()
      stopPolling()
      chrome.runtime.onMessage.removeListener(listener)
    }
  }, [checkModel, loadCache])

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
      setStatus('recording')
      setResult(null)
      setChunks([])
      setProgress(0)
      setError(null)

      setStatus('transcribing')
      resetWatchdog()
      const savedConfig = await storage.getItem<STTConfig>(STT_STORAGE_KEY)
      const language = savedConfig?.language || DEFAULT_STT_CONFIG.language

      // Open side panel, then send STT_TRANSCRIBE with audio URL directly.
      // Side Panel fetches and decodes the audio itself — no need to pipe
      // the entire audio through Background as base64.
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })
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
  }, [getAudioUrl, clearCache])

  return { status, result, chunks, error, progress, chunkTime, transcribe, checkModel, clearCache }
}
