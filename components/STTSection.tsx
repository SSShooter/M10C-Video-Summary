import { useEffect, useState, useCallback } from "react"
import { Download, Trash2, RefreshCw, CheckCircle, Circle, Loader2 } from "lucide-react"
import { storage } from "@wxt-dev/storage"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "~/components/ui/select"
import { cn } from "~/lib/utils"
import { t } from "~/utils/i18n"
import { useSTTEngine } from "~/contexts/stt-engine"
import { sttEvents } from "~/utils/stt-events"
import {
  STT_MODELS,
  STT_LANGUAGES,
  STT_STORAGE_KEY,
  DEFAULT_STT_CONFIG,
  MSG,
  type STTConfig,
  type STTModelStatus
} from "~/utils/stt-config"

export function STTSection() {
  const [config, setConfig] = useState<STTConfig>(DEFAULT_STT_CONFIG)
  const [status, setStatus] = useState<STTModelStatus>('not-downloaded')
  const [progress, setProgress] = useState(0)
  const [loadingSeconds, setLoadingSeconds] = useState(0)
  const engine = useSTTEngine()

  // Load saved config on mount and auto-load model if previously downloaded
  useEffect(() => {
    let cancelled = false

    async function init() {
      const [saved, modelCheck] = await Promise.all([
        storage.getItem<STTConfig>(STT_STORAGE_KEY),
        engine
          ? engine.checkModel()
          : chrome.runtime.sendMessage({ type: MSG.STT_CHECK_MODEL }),
      ])

      if (cancelled) return
      if (saved) setConfig(saved)

      if ((modelCheck as any)?.ready) {
        setStatus('ready')
        setProgress(100)
        chrome.runtime.sendMessage({ type: MSG.STT_PROGRESS, status: 'ready' })
        return
      }

      // Auto-load from cache if previously downloaded
      const data = await chrome.storage.local.get(['sttModelDownloaded', 'sttModelRepo'])
      if (cancelled) return
      if (!data.sttModelDownloaded || !data.sttModelRepo) {
        chrome.runtime.sendMessage({ type: MSG.STT_PROGRESS, status: 'not-downloaded' })
        return
      }

      const modelSize = saved?.modelSize || DEFAULT_STT_CONFIG.modelSize
      const model = STT_MODELS.find(m => m.id === modelSize)
      if (model && data.sttModelRepo === model.repo) {
        setStatus('loading')
        setProgress(0)
        chrome.runtime.sendMessage({ type: MSG.STT_PROGRESS, status: 'loading' })
        if (engine) {
          engine.loadModel(data.sttModelRepo)
        } else {
          chrome.runtime.sendMessage({ type: MSG.STT_LOAD_MODEL, modelRepo: data.sttModelRepo })
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  // Listen for STT progress messages
  useEffect(() => {
    const handleMsg = (msg: any) => {
      if (msg.type === MSG.STT_PROGRESS) {
        if (msg.status === 'ready' || msg.status === 'deleted') {
          toast.dismiss()
          setStatus(msg.status === 'ready' ? 'ready' : 'not-downloaded')
          setProgress(msg.status === 'ready' ? 100 : 0)
        } else if (msg.status === 'downloading') {
          setStatus('downloading')
          setProgress(msg.progress || 0)
        } else if (msg.status === 'loading') {
          setStatus('loading')
          setProgress(100)
        } else if (msg.status === 'transcribing') {
          setStatus('transcribing')
        }
      }
      if (msg.type === MSG.STT_RESULT) {
        toast.dismiss()
        setStatus('ready')
      }
      if (msg.type === MSG.STT_ERROR) {
        toast.dismiss()
        setStatus('not-downloaded')
        setProgress(0)
        toast.error(msg.error || 'STT error')
      }
    }
    // In side panel: listen to local events (chrome.runtime.sendMessage
    // doesn't deliver to the sender, so we need sttEvents)
    const unsub = engine ? sttEvents.on(handleMsg) : () => {}
    // In options page: listen to chrome.runtime messages from side panel
    chrome.runtime.onMessage.addListener(handleMsg)
    return () => {
      unsub()
      chrome.runtime.onMessage.removeListener(handleMsg)
    }
  }, [])

  // Elapsed timer while model is initializing or transcribing
  useEffect(() => {
    if (status !== 'loading' && status !== 'transcribing') {
      setLoadingSeconds(0)
      return
    }
    const timer = setInterval(() => setLoadingSeconds(s => s + 1), 1000)
    return () => clearInterval(timer)
  }, [status])

  const saveConfig = useCallback(async (newConfig: STTConfig) => {
    setConfig(newConfig)
    await storage.setItem(STT_STORAGE_KEY, newConfig)
  }, [])

  const handleModelChange = (modelSize: string) => {
    saveConfig({ ...config, modelSize })
    // Reset status when model changes
    if (status === 'ready') {
      setStatus('not-downloaded')
      setProgress(0)
    }
  }

  const handleLanguageChange = (language: string) => {
    saveConfig({ ...config, language })
  }

  const handleDownload = () => {
    const model = STT_MODELS.find(m => m.id === config.modelSize)
    if (!model) return

    setStatus('downloading')
    setProgress(0)
    if (engine) {
      engine.loadModel(model.repo)
    } else {
      chrome.runtime.sendMessage({ type: MSG.STT_LOAD_MODEL, modelRepo: model.repo })
    }
    toast.loading(t('sttDownloading'))
  }

  const handleDelete = () => {
    const model = STT_MODELS.find(m => m.id === config.modelSize)
    if (!model) return

    if (engine) {
      engine.deleteModel(model.repo)
    } else {
      chrome.runtime.sendMessage({ type: MSG.STT_DELETE_MODEL, modelRepo: model.repo })
    }
    setStatus('not-downloaded')
    setProgress(0)
    toast.success(t('sttModelDeleted'))
  }

  const handleReset = () => {
    if (engine) {
      engine.terminateSTT()
    } else {
      chrome.runtime.sendMessage({ type: MSG.STT_TERMINATE })
    }
    setStatus('not-downloaded')
    setProgress(0)
    setLoadingSeconds(0)
    toast.info(t('sttTerminate') || 'STT Terminated')
  }

  const selectedModel = STT_MODELS.find(m => m.id === config.modelSize)

  const statusIndicator = () => {
    if (status === 'ready') {
      return (
        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
          <CheckCircle className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">{t('sttModelReady')}</span>
        </div>
      )
    }
    if (status === 'downloading') {
      return (
        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs font-medium">{t('sttDownloading')} {progress}%</span>
        </div>
      )
    }
    if (status === 'loading') {
      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
            <span className="text-xs font-medium">{t('sttInitializing')} {loadingSeconds > 0 ? `${loadingSeconds}s` : ''}</span>
          </div>
          {loadingSeconds > 15 && (
            <span className="text-[10px] text-muted-foreground pl-5">{t('sttInitializingTip')}</span>
          )}
        </div>
      )
    }
    if (status === 'transcribing') {
      return (
        <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs font-medium">{t('sttTranscribing')} {loadingSeconds > 0 ? `${loadingSeconds}s` : ''}</span>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Circle className="h-3.5 w-3.5" />
        <span className="text-xs">{t('sttNotDownloaded')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 border-t border-border pt-5 mt-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t('sttSettings')}</h3>
        {statusIndicator()}
      </div>

      {/* Progress bar */}
      {(status === 'downloading' || status === 'loading' || status === 'transcribing') && (
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-300 ease-out rounded-full",
              status === 'transcribing' ? "bg-amber-500 animate-pulse" :
              status === 'loading' ? "bg-blue-500 animate-pulse" : "bg-primary"
            )}
            style={{ width: status === 'transcribing' ? '100%' : `${progress}%` }}
          />
        </div>
      )}

      {/* Model selection */}
      <div className="space-y-1">
        <Label className="text-sm font-medium text-foreground">{t('sttModel')}</Label>
        <Select value={config.modelSize} onValueChange={handleModelChange}>
          <SelectTrigger className="h-10 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STT_MODELS.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label} ({model.sizeLabel})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {t('sttModelSizeTip')}
        </p>
      </div>

      {/* Language selection */}
      <div className="space-y-1">
        <Label className="text-sm font-medium text-foreground">{t('sttLanguage')}</Label>
        <Select value={config.language} onValueChange={handleLanguageChange}>
          <SelectTrigger className="h-10 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STT_LANGUAGES.map((lang) => (
              <SelectItem key={lang.id} value={lang.id}>
                {lang.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {t('sttLanguageTip')}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {status !== 'ready' ? (
          <>
            <Button
              onClick={handleDownload}
              disabled={status === 'downloading' || status === 'loading' || status === 'transcribing'}
              className="gap-1.5 h-9 text-xs"
            >
              {(status === 'downloading' || status === 'loading' || status === 'transcribing') ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>
                {status === 'downloading' ? t('sttDownloading')
                  : status === 'loading' ? t('sttInitializing')
                  : status === 'transcribing' ? t('sttTranscribing')
                  : t('sttDownloadModel')}
              </span>
            </Button>
            {(status === 'downloading' || status === 'loading' || status === 'transcribing') && (
              <Button
                variant="outline"
                onClick={handleReset}
                className="gap-1.5 h-9 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{t('sttTerminate')}</span>
              </Button>
            )}
          </>
        ) : (
          <Button
            variant="destructive"
            onClick={handleDelete}
            className="gap-1.5 h-9 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{t('sttDeleteModel')}</span>
          </Button>
        )}
      </div>
    </div>
  )
}
