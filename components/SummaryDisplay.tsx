import { Brain, Check, Copy } from "lucide-react"
import React, { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Storage } from "@plasmohq/storage"

import { Button } from "~components/ui/button"
import { ScrollArea } from "~components/ui/scroll-area"
import { t } from "~utils/i18n"

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
}

export function SummaryDisplay({
  generateConfig,
  cacheKey,
  generateButtonText,
  noSummaryText
}: SummaryDisplayProps) {
  const [markdownContent, setMarkdownContent] = useState<string>("")
  const [aiLoading, setAiLoading] = useState(false)
  const [cacheLoaded, setCacheLoaded] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [reasoning, setReasoning] = useState("")

  const storage = new Storage({
    area: "local"
  })
  const portRef = useRef<chrome.runtime.Port | null>(null)

  // 加载缓存数据
  const loadCacheData = async () => {
    if (!cacheKey) return

    try {
      const cached = await storage.get<{
        content: string
        timestamp: number
      }>(cacheKey)
      if (cached && cached.content) {
        const isExpired = Date.now() - cached.timestamp > 24 * 60 * 60 * 1000 // 24小时过期
        if (!isExpired) {
          setMarkdownContent(cached.content)
          setCacheLoaded(true)
        }
      }
    } catch (error) {
      console.error("加载缓存失败:", error)
    }
  }

  // 保存缓存数据
  const saveCacheData = async (content: string) => {
    if (!cacheKey) return

    try {
      const cacheData = {
        content,
        timestamp: Date.now()
      }
      await storage.set(cacheKey, cacheData)
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

  const contentRef = useRef("")
  useEffect(() => {
    contentRef.current = markdownContent
  }, [markdownContent])

  const generateSummary = async (forceRegenerate = false) => {
    if (!generateConfig) return
    if (!forceRegenerate && markdownContent && !aiLoading) return

    const content = generateConfig.getContent()
    if (!content) {
      toast.error("没有内容可以生成总结")
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
          setMarkdownContent((prev) => prev + newChunk)
        }
      } else if (msg.type === "done") {
        setAiLoading(false)
        setReasoning("")
        saveCacheData(contentRef.current)
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
          <div className="text-[12px]">{t("clickToGenerateVideoSummary")}</div>
        </div>
      )}

      {aiLoading && !markdownContent && (
        <ReasoningDisplay reasoning={reasoning} />
      )}

      {(markdownContent || (aiLoading && markdownContent)) && (
        <div className="flex-1 overflow-auto">
          <ScrollArea className="h-full">
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
