import React, { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Check, Copy } from "lucide-react"

import { Storage } from "@plasmohq/storage"

import { Button } from "~components/ui/button"
import { ScrollArea } from "~components/ui/scroll-area"
import { t } from "~utils/i18n"

export interface SummaryGenerateConfig {
  action: string
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
}

const SimpleMarkdown = ({ content }: { content: string }) => {
  if (!content) return null

  // Split content by lines but keep code blocks together? For simplicity, line by line.
  const lines = content.split("\n")
  const elements = []
  let listBuffer: React.ReactNode[] = []

  const flushList = (keyPrefix: string) => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`${keyPrefix}-list`} className="list-disc pl-5 my-2 text-sm">
          {listBuffer}
        </ul>
      )
      listBuffer = []
    }
  }

  lines.forEach((line, index) => {
    const key = `line-${index}`
    const trimmed = line.trim()

    if (trimmed.startsWith("# ")) {
      flushList(key)
      elements.push(
        <h1 key={key} className="text-xl font-bold mt-4 mb-2 text-blue-800">
          {trimmed.replace(/^#\s+/, "")}
        </h1>
      )
    } else if (trimmed.startsWith("### ")) {
      flushList(key)
      elements.push(
        <h3 key={key} className="text-base font-bold mt-4 mb-2 text-blue-600">
          {trimmed.replace(/^###\s+/, "")}
        </h3>
      )
    } else if (trimmed.startsWith("## ")) {
      flushList(key)
      elements.push(
        <h2 key={key} className="text-lg font-bold mt-4 mb-2 text-blue-700">
          {trimmed.replace(/^##\s+/, "")}
        </h2>
      )
    } else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      flushList(key)
      elements.push(
        <p key={key} className="font-bold my-2 text-sm">
          {trimmed.replace(/^\*\*/, "").replace(/\*\*$/, "")}
        </p>
      )
    } else if (trimmed.startsWith("- ")) {
      const content = trimmed.replace(/^- /, "")
      // Convert bold inside list items
      const parts = content.split(/(\*\*.*?\*\*)/g).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="text-blue-600">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return part
      })
      listBuffer.push(<li key={key}>{parts}</li>)
    } else if (trimmed === "") {
      flushList(key)
      if (index < lines.length - 1 && lines[index + 1].trim() === "") {
        // Double newline, maybe add spacing
        elements.push(<br key={key} />)
      }
    } else {
      flushList(key)
      // Standard paragraph, check for bold
      if (trimmed.length > 0) {
        const parts = line.split(/(\*\*.*?\*\*)/g).map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i}>{part.slice(2, -2)}</strong>
          }
           // Simple hash tag highlighting
          if (part.includes("#")) {
             return part.split(/(#\S+)/g).map((subPart, j) => {
                if(subPart.startsWith("#")) {
                  return <span key={`${i}-${j}`} className="text-blue-500">{subPart}</span>
                }
                return subPart
             });
          }
          return part
        })
        elements.push(
          <p key={key} className="my-1 text-sm leading-relaxed text-gray-800">
            {parts.flat()}
          </p>
        )
      }
    }
  })

  flushList("end")

  return <div>{elements}</div>
}

export function SummaryDisplay({
  generateConfig,
  cacheKey,
  generateButtonText,
  noSummaryText,
  generatePromptText
}: SummaryDisplayProps) {
  const [markdownContent, setMarkdownContent] = useState<string>("")
  const [aiLoading, setAiLoading] = useState(false)
  const [cacheLoaded, setCacheLoaded] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
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


  
  // 监听 markdownContent 变化并在完成时保存缓存? 
  // onMessage 'done' handler uses current markdownContent state closure which might be stale!
  // Uses functional update for setMarkdownContent, but saveCacheData needs latest.
  // Better use a ref for accumulating content or useEffect to save when loading becomes false.
  
  const contentRef = useRef("")
  useEffect(() => {
      contentRef.current = markdownContent
  }, [markdownContent])

  // Enhance port listener to use ref
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
    contentRef.current = ""
    setCacheLoaded(false)
    
    if (portRef.current) portRef.current.disconnect()
    
    const port = chrome.runtime.connect({ name: "AI_STREAM" })
    portRef.current = port
    
    port.onMessage.addListener((msg) => {
        if (msg.type === "chunk") {
            const newChunk = msg.content || ""
            setMarkdownContent(prev => prev + newChunk)
        } else if (msg.type === "done") {
             setAiLoading(false)
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
    
     // ... rest as before ...
     const messageData: any = {
        action: "summarizeSubtitlesStream",
        ...generateConfig.additionalData
      }
      if (generateConfig.action === "summarizeSubtitles") {
        messageData.subtitles = content
      } else {
         messageData.subtitles = content
         if (generateConfig.getTitle) {
             // prompt might only use subtitles arg? 
             // background/index.ts: PROMPTS.SUBTITLE_SUMMARY_USER(msg.subtitles)
             // So we must put content in subtitles field.
          }
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

      <div className="flex-1 overflow-auto">
        <ScrollArea className="h-full">
          {!markdownContent && !aiLoading && (
            <div className="text-center py-[40px] px-[20px] text-gray-600">
              <div className="mb-[12px]">
                {noSummaryText || t("noAiSummary")}
              </div>
              <div className="text-[12px]">
                {generatePromptText || t("clickToGenerateVideoSummary")}
              </div>
            </div>
          )}

          {aiLoading && !markdownContent && (
             <div className="text-center py-[40px] px-[20px] text-gray-600">
              {t("generatingAiSummary")}
            </div>
          )}

          {(markdownContent || (aiLoading && markdownContent)) && (
            <div className="prose p-[12px] bg-blue-50 rounded-[6px]">
              <div className="flex justify-between items-center mb-[12px]">
                <h4 className="m-0 text-[14px] text-blue-500 font-semibold">
                  {t("aiContentSummaryTitle")}
                </h4>
                {cacheLoaded && (
                  <span className="text-[12px] text-blue-500 bg-blue-50 py-[2px] px-[6px] rounded-full border border-blue-300">
                    {t("cached")}
                  </span>
                )}
              </div>
              
              <SimpleMarkdown content={markdownContent} />
              
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
