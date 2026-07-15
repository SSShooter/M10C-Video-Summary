import { Check, Copy, Send } from "lucide-react"
import React, { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { storage } from "@wxt-dev/storage"
import { Button } from "~/components/ui/button"
import { ScrollArea } from "~/components/ui/scroll-area"
import { t } from "~/utils/i18n"

import { ReasoningDisplay } from "./ReasoningDisplay"
import { SimpleMarkdown } from "./SimpleMarkdown"

export interface SummaryGenerateConfig {
  getContent: () => string | null
  getTitle?: () => string
  additionalData?: Record<string, any>
}

interface SummaryDisplayProps {
  generateConfig?: SummaryGenerateConfig
  cacheKey?: string
  generateButtonText?: string
  noSummaryText?: string
  generatePromptText?: string
  publishSource?: {
    sourceUrl: string
    title: string
  }
}

export function SummaryDisplay({
  generateConfig,
  cacheKey,
  generateButtonText,
  noSummaryText,
  generatePromptText,
  publishSource
}: SummaryDisplayProps) {
  const [markdownContent, setMarkdownContent] = useState<string>("")
  const [aiLoading, setAiLoading] = useState(false)
  const [cacheLoaded, setCacheLoaded] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [reasoning, setReasoning] = useState("")
  const [summaryTimestamp, setSummaryTimestamp] = useState<number | null>(null)
  const [publishing, setPublishing] = useState(false)

  const portRef = useRef<chrome.runtime.Port | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // 加载缓存数据
  const loadCacheData = async () => {
    if (!cacheKey) return

    try {
      const cached = await storage.getItem<{
        content: string
        timestamp: number
      }>(`local:${cacheKey}`)
      if (cached && cached.content) {
        const isExpired = Date.now() - cached.timestamp > 24 * 60 * 60 * 1000 // 24小时过期
        if (!isExpired) {
          setMarkdownContent(cached.content)
          setSummaryTimestamp(cached.timestamp)
          setCacheLoaded(true)
        }
      }
    } catch (error) {
      console.error("加载缓存失败:", error)
    }
  }

  // 保存缓存数据
  const saveCacheData = async (content: string, timestamp: number) => {
    if (!cacheKey) return

    try {
      const cacheData = {
        content,
        timestamp
      }
      await storage.setItem(`local:${cacheKey}`, cacheData)
    } catch (error) {
      console.error("保存缓存失败:", error)
    }
  }

  const handleCopy = () => {
    if (!markdownContent) return
    navigator.clipboard.writeText(markdownContent)
    setIsCopied(true)
    toast.success("Success")
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handlePublish = async () => {
    if (!publishSource || !markdownContent || publishing) return

    setPublishing(true)
    try {
      const response = await chrome.runtime.sendMessage({
        action: "publishSummaryToBlog",
        sourceUrl: publishSource.sourceUrl,
        title: publishSource.title,
        summary: markdownContent,
        summarizedAt: new Date(summaryTimestamp || Date.now()).toISOString()
      })

      if (!response?.success) {
        throw new Error(response?.error || t("blogPublishFailed"))
      }
      toast.success(t("blogPublishSucceeded"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("blogPublishFailed"))
    } finally {
      setPublishing(false)
    }
  }

  const contentRef = useRef("")
  useEffect(() => {
    contentRef.current = markdownContent
  }, [markdownContent])

  // 自动滚动到底部
  useEffect(() => {
    if (markdownContent) {
      const scrollElement = scrollAreaRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }
    }
  }, [markdownContent])

  const generateSummary = async (forceRegenerate = false) => {
    if (!generateConfig) return
    if (!forceRegenerate && markdownContent && !aiLoading) return

    const content = generateConfig.getContent()
    if (!content) {
      toast.error(t("noContentAvailable"))
      return
    }

    setAiLoading(true)
    setMarkdownContent("")
    setReasoning("")
    contentRef.current = ""
    setCacheLoaded(false)

    if (portRef.current) portRef.current.disconnect()

    const port = chrome.runtime.connect({ name: "AI_STREAM" })
    portRef.current = port

    port.onMessage.addListener((msg) => {
      if (msg.type === "chunk") {
        if (msg.reasoning) {
          setReasoning((prev) => prev + msg.reasoning)
        }
        if (msg.content) {
          setReasoning("")
          const newChunk = msg.content || ""
          setMarkdownContent((prev) => {
            const next = prev + newChunk
            contentRef.current = next
            return next
          })
        }
      } else if (msg.type === "done") {
        const completedAt = Date.now()
        setAiLoading(false)
        setReasoning("")
        setSummaryTimestamp(completedAt)
        saveCacheData(contentRef.current, completedAt)
        toast.success(t("aiSummaryGenerated"))
        port.disconnect()
        portRef.current = null
      } else if (msg.type === "error") {
        setAiLoading(false)
        toast.error(msg.error || t("summaryFailed"))
        port.disconnect()
        portRef.current = null
      }
    })

    const messageData: any = {
      action: "summarizeSubtitlesStream",
      ...generateConfig.additionalData,
      subtitles: content
    }
    port.postMessage(messageData)
  }

  // 加载缓存数据
  useEffect(() => {
    loadCacheData()
  }, [cacheKey])

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex mb-2 gap-2 justify-between">
        <Button
          className="flex-grow"
          onClick={() => generateSummary(!!markdownContent)}
          disabled={aiLoading}
          size="sm"
          title={
            aiLoading
              ? t("summarizing")
              : markdownContent
                ? t("regenerate")
                : generateButtonText || t("generateAiSummary")
          }>
          {aiLoading
            ? t("summarizing")
            : markdownContent
              ? t("regenerate")
              : generateButtonText || t("generateAiSummary")}
        </Button>
        {markdownContent && publishSource && (
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={publishing}
            className="px-3 shrink-0"
            title={t("sendToBlog")}>
            <Send className="h-4 w-4" />
            <span className="ml-1">
              {publishing ? t("sendingToBlog") : t("sendToBlog")}
            </span>
          </Button>
        )}
        {markdownContent && (
          <Button
            size="sm"
            onClick={handleCopy}
            className="px-3 shrink-0"
            title="Copy">
            {isCopied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {!markdownContent && !aiLoading && (
        <div className="text-center py-[40px] px-[20px] text-gray-600">
          <div className="mb-[12px]">{noSummaryText || t("noAiSummary")}</div>
          <div className="text-[12px]">{generatePromptText || t("clickToGenerateVideoSummary")}</div>
        </div>
      )}

      {aiLoading && !markdownContent && (
        <ReasoningDisplay reasoning={reasoning} />
      )}

      {(markdownContent || (aiLoading && markdownContent)) && (
        <div className="flex-1 overflow-auto">
          <ScrollArea className="h-full" ref={scrollAreaRef}>
            <div className="relative prose p-[12px] border border-gray-300 rounded-[6px]">
              {cacheLoaded && (
                <span className="absolute top-2 right-2 z-10 text-[12px] text-blue-500 bg-blue-50 py-[1px] px-[6px] rounded-full border border-blue-300 h-fit">
                  {t("cached")}
                </span>
              )}
              <SimpleMarkdown content={markdownContent} />
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
