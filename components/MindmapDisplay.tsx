import { downloadMethodList } from "@mind-elixir/export-mindmap"
import { launchMindElixir } from "@mind-elixir/open-desktop"
import { Download, ExternalLink, Maximize } from "lucide-react"
import type { MindElixirData } from "mind-elixir"
import { plaintextToMindElixir } from "mind-elixir/plaintextConverter"
import React, { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { storage } from "@wxt-dev/storage"
import MindElixirReact, {
  type MindElixirReactRef
} from "~/components/MindElixirReact"
import { ReasoningDisplay } from "~/components/ReasoningDisplay"
import { Button } from "~/components/ui/button"
import { Tooltip } from "~/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger
} from "~/components/ui/dropdown-menu"
import { fullscreen } from "~/utils/fullscreen"
import { t } from "~/utils/i18n"
import { options } from "~/utils/mind-elixir"
import { ResponseParser } from "~/utils/response-parser"

export interface MindmapGenerateConfig {
  action: string
  getContent: () => string | null
  getTitle?: () => string
  additionalData?: Record<string, any>
}

interface MindmapDisplayProps {
  panelRef: React.RefObject<HTMLDivElement>
  generateButtonText?: string
  noMindmapText?: string
  // 新增的生成配置
  generateConfig?: MindmapGenerateConfig
  cacheKey?: string
  show?: boolean
  // 服务端缓存检测
  videoUrl?: string
  isByok?: boolean
  language?: string
}

export function MindmapDisplay({
  panelRef,
  generateButtonText,
  noMindmapText,
  generateConfig,
  cacheKey,
  show,
  videoUrl,
  isByok,
  language
}: MindmapDisplayProps) {
  const mindmapRef = useRef<MindElixirReactRef>(null)
  const [mindElixirLoading, setMindElixirLoading] = useState(false)
  const [mindmapLoading, setMindmapLoading] = useState(false)
  const [mindmapData, setMindmapData] = useState<MindElixirData | null>(null)
  const [cacheLoaded, setCacheLoaded] = useState(false)
  const [reasoning, setReasoning] = useState("")
  // Server-side cache state (Mind Elixir model only, non-BYOK)
  const [serverCacheAvailable, setServerCacheAvailable] = useState<boolean | null>(null)
  const [serverCacheFetching, setServerCacheFetching] = useState(false)
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null)
  const [checkingCache, setCheckingCache] = useState(false)
  const [freeGenerationQuota, setFreeGenerationQuota] = useState<{
    remaining: number
    expiresAt: string
    campaignName: string
  } | null>(null)

  const BACKEND_BASE_URL = import.meta.env.WXT_BACKEND_BASE_URL as string


  // tab hidden cause render error, so refresh to fix it when tab is shown
  useEffect(() => {
    if (show) {
      mindmapRef.current?.instance?.refresh()
      mindmapRef.current?.instance?.toCenter()
    }
  }, [show])

  // Check server cache on mount (non-BYOK video mindmap only)
  useEffect(() => {
    if (isByok || !videoUrl || !BACKEND_BASE_URL) return
    // Only check for video platform URLs (YouTube / Bilibili)
    const isVideoUrl =
      videoUrl.includes("youtube.com") ||
      videoUrl.includes("youtu.be") ||
      videoUrl.includes("bilibili.com")
    if (!isVideoUrl) return

    setCheckingCache(true)
    chrome.runtime.sendMessage(
      {
        action: "checkMindmapCache",
        videoUrl,
        language
      },
      (response) => {
        setCheckingCache(false)
        if (chrome.runtime.lastError) {
          console.warn("[MindmapDisplay] checkMindmapCache message failed:", chrome.runtime.lastError)
          return
        }
        if (response && response.success) {
          if (response.data?.available) {
            setServerCacheAvailable(true)
          }
          if (typeof response.data?.remaining === "number") {
            setRemainingAttempts(response.data.remaining)
          }
          if (response.data?.freeGeneration) {
            setFreeGenerationQuota(response.data.freeGeneration)
          }
        }
      }
    )
  }, [videoUrl, isByok])

  // 加载缓存数据
  const loadCacheData = async () => {
    if (!cacheKey) return

    try {
      const cached = await storage.getItem<{
        mindmapData: MindElixirData
        timestamp: number
      }>(`local:${cacheKey}`)
      if (cached && cached.mindmapData) {
        const isExpired = Date.now() - cached.timestamp > 24 * 60 * 60 * 1000 // 24小时过期
        if (!isExpired) {
          setMindmapData(cached.mindmapData)
          setCacheLoaded(true)
        }
      }
    } catch (error) {
      console.error("加载缓存失败:", error)
    }
  }

  // 保存缓存数据
  const saveCacheData = async (mindmapData: MindElixirData) => {
    if (!cacheKey) return

    try {
      const cacheData = {
        mindmapData,
        timestamp: Date.now()
      }
      await storage.setItem(`local:${cacheKey}`, cacheData)
    } catch (error) {
      console.error("保存缓存失败:", error)
    }
  }

  const generateMindmap = async (forceRegenerate = false) => {
    if (!generateConfig) {
      console.error("generateConfig is required for internal generation")
      return
    }

    // 如果不是强制重新生成且已有缓存数据，直接使用缓存
    if (!forceRegenerate && mindmapData) {
      return
    }

    const content = generateConfig.getContent()
    if (!content) {
      toast.error(t("noContentAvailable"))
      return
    }

    try {
      setMindmapLoading(true)
      setMindmapData(null) // Clear previous data
      setReasoning("")

      const messageData: any = {
        action: generateConfig.action,
        ...generateConfig.additionalData
      }

      // 根据不同的action设置不同的内容字段
      if (generateConfig.action === "generateArticleMindmapStream") {
        messageData.content = content
      } else {
        messageData.subtitles = content
      }

      if (generateConfig.getTitle) {
        messageData.title = generateConfig.getTitle()
      }

      // Establish streaming connection
      const port = chrome.runtime.connect({ name: "AI_STREAM" })
      port.postMessage(messageData)

      let accumulatedPlaintext = ""
      let lastRenderTime = 0
      const RENDER_THROTTLE_MS = 500 // 500ms throttle

      port.onMessage.addListener(async (msg) => {
        if (msg.type === "chunk") {
          if (msg.reasoning) {
            setReasoning((prev) => prev + msg.reasoning)
          }

          if (msg.content) {
            // Once we start receiving content, we clear reasoning (it's transient)
            // But we might want to do it only once. Since reasoning and content usually don't mix interleaved in a way that we want to show reasoning flashes.
            // When we get first content chunk, we can clear reasoning.
            setReasoning("") // Ensuring reasoning is hidden when content starts

            accumulatedPlaintext += msg.content || ""

            // Throttle rendering
            const now = Date.now()
            if (now - lastRenderTime > RENDER_THROTTLE_MS) {
              try {
                // Import lazily or assumes imported
                const cleanedText =
                  ResponseParser.cleanMindmapResponse(accumulatedPlaintext)
                const data = plaintextToMindElixir(cleanedText)
                setMindmapData(data)
                lastRenderTime = now
              } catch (e) {
                // Ignore parse errors during streaming (incomplete data)
                console.warn("Stream parse error:", e)
              }
            }
          }
        } else if (msg.type === "done") {
          // Final render
          try {
            setReasoning("") // Ensure reasoning is gone
            console.log("Final render", accumulatedPlaintext)
            const cleanedText =
              ResponseParser.cleanMindmapResponse(accumulatedPlaintext)
            const data = plaintextToMindElixir(cleanedText)
            setMindmapData(data)
            await saveCacheData(data)
            setCacheLoaded(false)
          } catch (e) {
            console.error("Final parse error:", e)
            toast.error(t("generateMindmapFailed"))
          } finally {
            setMindmapLoading(false)
            port.disconnect()
          }
        } else if (msg.type === "error") {
          console.error("生成思维导图失败:", msg.error)
          toast.error(msg.error || t("generateMindmapFailed"))
          setMindmapLoading(false)
          port.disconnect()
        } else if (msg.type === "freeGenerationUsed") {
          // Decrement the free generation quota display
          setFreeGenerationQuota((prev) => {
            if (!prev) return null
            const newRemaining = prev.remaining - 1
            if (newRemaining <= 0) {
              toast.info(t("freeGenerationExhausted"))
              return null
            }
            return { ...prev, remaining: newRemaining }
          })
        }
      })
    } catch (error) {
      console.error("启动生成思维导图失败:", error)
      toast.error(error instanceof Error ? error.message : t("generateMindmapFailed"))
      setMindmapLoading(false)
    }
  }

  const openInMindElixir = async () => {
    if (mindmapData) {
      setMindElixirLoading(true)
      toast.loading(t("opening"))

      try {
        await launchMindElixir(mindmapData)
        toast.dismiss()
        toast.success(t("openedSuccessfully"))
      } catch (error) {
        console.error("打开 Mind Elixir 失败:", error)
        toast.dismiss()
        toast.error(
          error instanceof Error ? error.message : t("openMindElixirFailed")
        )
      } finally {
        setMindElixirLoading(false)
      }
    }
  }

  // 加载缓存数据
  useEffect(() => {
    loadCacheData()
  }, [cacheKey])

  // 从服务端获取已缓存的思维导图
  const fetchCachedMindmap = async () => {
    if (!videoUrl || !BACKEND_BASE_URL) return
    setServerCacheFetching(true)
    try {
      chrome.runtime.sendMessage(
        {
          action: "fetchCachedMindmap",
          videoUrl,
          language
        },
        async (response) => {
          if (chrome.runtime.lastError) {
            console.error("[MindmapDisplay] fetchCachedMindmap message failed:", chrome.runtime.lastError)
            toast.error(t("generateMindmapFailed"))
            setServerCacheFetching(false)
            return
          }

          if (!response || !response.success) {
            if (response?.status === 429) {
              setQuotaExceeded(true)
              toast.error(t("downloadQuotaExceeded"))
            } else if (response?.status === 404) {
              setServerCacheAvailable(false)
            } else {
              toast.error(response?.error || t("generateMindmapFailed"))
            }
            setServerCacheFetching(false)
            return
          }

          try {
            const data = response.data
            const cleaned = ResponseParser.cleanMindmapResponse(data.mindmapText)
            const parsed = plaintextToMindElixir(cleaned)
            setMindmapData(parsed)
            setServerCacheAvailable(false) // hide Content Ready button once loaded
            if (typeof data.remaining === "number") {
              setRemainingAttempts(data.remaining)
            }
            await saveCacheData(parsed)
          } catch (err) {
            console.error("[MindmapDisplay] parsing fetched cached mindmap failed:", err)
            toast.error(t("generateMindmapFailed"))
          } finally {
            setServerCacheFetching(false)
          }
        }
      )
    } catch (err) {
      console.error("[MindmapDisplay] fetchCachedMindmap failed:", err)
      toast.error(t("generateMindmapFailed"))
      setServerCacheFetching(false)
    }
  }

  // 生成思维导图
  const handleGenerate = () => {
    if (generateConfig) {
      generateMindmap(!!mindmapData)
    }
  }

  // Generate button (shown when no mindmap data)
  const showContentReadyButton =
    !isByok &&
    serverCacheAvailable &&
    !mindmapData &&
    !mindmapLoading &&
    !quotaExceeded

  const generateButtonLabel = (() => {
    if (mindmapLoading) return t("generating")
    if (serverCacheFetching || checkingCache) return t("fetchingCachedMindmap")
    if (showContentReadyButton) return t("contentReady")
    if (!isByok && freeGenerationQuota && freeGenerationQuota.remaining > 0) {
      return t("freeGenerationBtn")
    }
    return generateButtonText || t("generateMindmapBtn")
  })()

  const generateTooltipContent = (() => {
    if (showContentReadyButton && remainingAttempts !== null) {
      return t("remainingAttemptsTooltip", String(remainingAttempts))
    }
    if (!isByok && freeGenerationQuota && freeGenerationQuota.remaining > 0) {
      const expiryDate = new Date(freeGenerationQuota.expiresAt).toLocaleDateString()
      return t("freeGenerationAvailable", [String(freeGenerationQuota.remaining), expiryDate])
    }
    return null
  })()

  const generateButtonDisabled = mindmapLoading || serverCacheFetching || checkingCache || quotaExceeded

  const handleGenerateClick = () => {
    if (showContentReadyButton) {
      fetchCachedMindmap()
    } else if (generateConfig) {
      generateMindmap(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex mb-2 gap-2 justify-between">
        {!mindmapData ? (
          <Tooltip content={generateTooltipContent} className="flex-grow">
            <Button
              className="flex-grow w-full"
              onClick={handleGenerateClick}
              disabled={generateButtonDisabled}
              size="sm"
              title={generateTooltipContent ? undefined : generateButtonLabel}>
              {generateButtonLabel}
            </Button>
          </Tooltip>
        ) : (
          <>
            <Button
              className="flex-grow w-full"
              onClick={() => generateMindmap(true)}
              disabled={mindmapLoading}
              size="sm">
              {mindmapLoading ? t("generating") : t("regenerate")}
            </Button>
            <Button
              onClick={openInMindElixir}
              disabled={mindElixirLoading}
              size="sm"
              title={mindElixirLoading ? t("opening") : t("openInMindElixir")}>
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => {
                fullscreen(mindmapRef.current?.instance!)
              }}
              size="sm"
              title={t("fullscreen")}>
              <Maximize className="w-4 h-4" />
            </Button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" title={t("download") || "下载"}>
                  <Download className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuPortal container={panelRef.current}>
                <DropdownMenuContent align="end">
                  {downloadMethodList.map((method) => (
                    <DropdownMenuItem
                      key={method.type}
                      onClick={() => {
                        if (mindmapRef.current?.instance) {
                          method.download(mindmapRef.current.instance)
                        }
                      }}>
                      {method.type}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenu>
          </>
        )}
      </div>

      {!mindmapData && !mindmapLoading && (
        <div className="text-center py-[40px] px-[20px] text-gray-600">
          <div className="mb-[12px]">{noMindmapText || t("noMindmap")}</div>
          <div className="text-[12px]">
            {t("clickToGenerateArticleMindmap")}
          </div>
        </div>
      )}

      {mindmapLoading && !mindmapData && (
        <ReasoningDisplay reasoning={reasoning} />
      )}

      {mindmapData && (
        <div className="relative flex-1 w-full border border-gray-300 rounded-[6px] overflow-hidden">
          {cacheLoaded && (
            <span className="absolute top-2 right-2 z-10 text-[12px] text-blue-500 bg-blue-50 py-[1px] px-[6px] rounded-full border border-blue-300 h-fit">
              {t("cached")}
            </span>
          )}
          <MindElixirReact
            data={mindmapData}
            ref={mindmapRef}
            options={options}
          />
        </div>
      )}
    </div>
  )
}
