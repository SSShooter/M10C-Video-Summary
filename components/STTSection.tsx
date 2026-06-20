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

  // Load saved config on mount
  useEffect(() => {
    storage.getItem<STTConfig>(STT_STORAGE_KEY).then((saved) => {
      if (saved) setConfig(saved)
    })

    // Check if model is already loaded in offscreen
    chrome.runtime.sendMessage({ type: MSG.STT_CHECK_MODEL }, (response) => {
      if (response?.ready) {
        setStatus('ready')
        setProgress(100)
      }
    })
  }, [])

  // Listen for STT progress messages
  useEffect(() => {
    const listener = (msg: any) => {
      if (msg.type === MSG.STT_PROGRESS) {
        if (msg.status === 'ready' || msg.status === 'deleted') {
          setStatus(msg.status === 'ready' ? 'ready' : 'not-downloaded')
          setProgress(msg.status === 'ready' ? 100 : 0)
        } else if (msg.status === 'downloading') {
          setStatus('downloading')
          setProgress(msg.progress || 0)
        } else if (msg.status === 'loading') {
          setStatus('loading')
          setProgress(100)
        }
      }
      if (msg.type === MSG.STT_ERROR) {
        setStatus('not-downloaded')
        setProgress(0)
        toast.error(msg.error || 'STT error')
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  // Elapsed timer while model is initializing
  useEffect(() => {
    if (status !== 'loading') {
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
    chrome.runtime.sendMessage({ type: MSG.STT_LOAD_MODEL, modelRepo: model.repo })
    toast.loading(t('sttDownloading'))
  }

  const handleDelete = () => {
    const model = STT_MODELS.find(m => m.id === config.modelSize)
    if (!model) return

    chrome.runtime.sendMessage({ type: MSG.STT_DELETE_MODEL, modelRepo: model.repo })
    setStatus('not-downloaded')
    setProgress(0)
    toast.success(t('sttModelDeleted'))
  }

  const handleReset = () => {
    // Force UI back to not-downloaded without touching the offscreen cache
    // User can then retry download with fresh state
    setStatus('not-downloaded')
    setProgress(0)
    setLoadingSeconds(0)
    toast.info(t('sttReset') || 'Reset')
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
      {(status === 'downloading' || status === 'loading') && (
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-300 ease-out rounded-full",
              status === 'loading' ? "bg-blue-500 animate-pulse" : "bg-primary"
            )}
            style={{ width: `${progress}%` }}
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
              disabled={status === 'downloading' || status === 'loading'}
              className="gap-1.5 h-9 text-xs"
            >
              {(status === 'downloading' || status === 'loading') ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>
                {status === 'downloading' ? t('sttDownloading')
                  : status === 'loading' ? t('sttInitializing')
                  : t('sttDownloadModel')}
              </span>
            </Button>
            {(status === 'downloading' || status === 'loading') && (
              <Button
                variant="outline"
                onClick={handleReset}
                className="gap-1.5 h-9 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{t('sttReset')}</span>
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
