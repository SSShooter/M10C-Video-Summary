import { PROMPTS } from "./prompts"
import { storage } from "@wxt-dev/storage"
import { t, getMatchedBrowserLanguage } from "~/utils/i18n"
import type { AIConfig } from "~/utils/ai-service"
import { DEFAULT_MIND_ELIXIR_PROVIDER } from "~/utils/ai-service"
import { buildBlogMarkdown } from "~/utils/blog-content"
import { consumeSseLines, flushSseBuffer } from "~/utils/sse-stream"

interface APIRequestConfig {
  url: string
  headers: Record<string, string>
  body: any
}

interface StreamChunk {
  content: string | null
  reasoning: string | null
}

interface ProviderHandler {
  getDefaultBaseUrl(): string
  buildRequestConfig(
    baseUrl: string,
    systemPrompt: string,
    userPrompt: string,
    model: string,
    apiKey: string,
    stream?: boolean
  ): APIRequestConfig
  extractContent(response: any): string
  /**
   * Parse a single SSE data line or stream chunk.
   * Returns the extracted text delta and reasoning delta.
   */
  parseStreamChunk(chunk: any): StreamChunk
}

// 提供商配置类
class OpenAIProvider implements ProviderHandler {
  getDefaultBaseUrl(): string {
    return "https://api.openai.com/v1"
  }

  buildRequestConfig(
    baseUrl: string,
    systemPrompt: string,
    userPrompt: string,
    model: string,
    apiKey: string,
    stream: boolean = false
  ): APIRequestConfig {

    const messages = []
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt })
    }
    messages.push({ role: "user", content: userPrompt })

    return {
      url: `${baseUrl}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: {
        model: model,
        messages: messages,
        stream: stream
      }
    }
  }

  parseStreamChunk(chunk: any): StreamChunk {
    return {
      content: chunk?.choices?.[0]?.delta?.content || null,
      reasoning:
        chunk?.choices?.[0]?.delta?.reasoning_content ||
        chunk?.choices?.[0]?.delta?.reasoning ||
        null
    }
  }

  extractContent(response: any): string {
    return response.choices[0]?.message?.content || ""
  }
}

class GeminiProvider implements ProviderHandler {
  getDefaultBaseUrl(): string {
    return "https://generativelanguage.googleapis.com/v1beta"
  }

  buildRequestConfig(
    baseUrl: string,
    systemPrompt: string,
    userPrompt: string,
    model: string,
    apiKey: string,
    stream: boolean = false
  ): APIRequestConfig {
    const fullModelName = model.startsWith("models/")
      ? model
      : `models/${model}`

    // Gemini 不支持分离的系统提示词，需要合并
    const combinedPrompt = systemPrompt
      ? `${systemPrompt}\n\n${userPrompt}`
      : userPrompt

    const action = stream ? "streamGenerateContent" : "generateContent"
    const queryParams = stream ? `key=${apiKey}&alt=sse` : `key=${apiKey}`

    return {
      url: `${baseUrl}/${fullModelName}:${action}?${queryParams}`,
      headers: {
        "Content-Type": "application/json"
      },
      body: {
        contents: [
          {
            parts: [{ text: combinedPrompt }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      }
    }
  }

  parseStreamChunk(chunk: any): StreamChunk {
    return {
      content: chunk?.candidates?.[0]?.content?.parts?.[0]?.text || null,
      reasoning: null // Gemini currently doesn't separate reasoning in standard API this way
    }
  }

  extractContent(response: any): string {
    return response.candidates[0]?.content?.parts[0]?.text || ""
  }
}

class ClaudeProvider implements ProviderHandler {
  getDefaultBaseUrl(): string {
    return "https://api.anthropic.com/v1"
  }

  buildRequestConfig(
    baseUrl: string,
    systemPrompt: string,
    userPrompt: string,
    model: string,
    apiKey: string,
    stream: boolean = false
  ): APIRequestConfig {

    return {
      url: `${baseUrl}/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: {
        model: model,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        stream: stream
      }
    }
  }

  parseStreamChunk(chunk: any): StreamChunk {
    if (chunk?.type === "content_block_delta") {
      return {
        content: chunk?.delta?.text || null,
        reasoning: null // Claude reasoning not standard via this field yet
      }
    }
    return { content: null, reasoning: null }
  }

  extractContent(response: any): string {
    return response.content[0]?.text || ""
  }
}

const BACKEND_BASE_URL = import.meta.env.WXT_BACKEND_BASE_URL

// Default fallback endpoint powered by Mind Elixir Star balance.
// Used when the user has not configured a personal AI provider.
const DEFAULT_MIND_ELIXIR_CONFIG: AIConfig = {
  activeProvider: "mind-elixir",
  replyLanguage: "auto",
  providers: {
    "mind-elixir": DEFAULT_MIND_ELIXIR_PROVIDER
  }
}

class BackgroundAIService {
  private providerHandlers: Record<string, ProviderHandler> = {
    "mind-elixir": new OpenAIProvider(),
    openai: new OpenAIProvider(),
    "openai-compatible": new OpenAIProvider(),
    gemini: new GeminiProvider(),
    claude: new ClaudeProvider(),
    openrouter: new OpenAIProvider()
  }

  async getConfig(): Promise<AIConfig | null> {
    try {
      const config = await storage.getItem<AIConfig>("local:aiConfigV2")
      if (!config) return null
      if (!config.replyLanguage || config.replyLanguage === "auto") {
        config.replyLanguage = getMatchedBrowserLanguage(chrome.i18n.getUILanguage())
      }
      return config
    } catch (error) {
      console.error("获取AI配置失败:", error)
      return null
    }
  }

  /**
   * 流式API调用
   */
  async streamAI(
    systemPrompt: string,
    userPrompt: string,
    onChunk: (chunk: StreamChunk) => void,
    onDone: () => void,
    onError: (error: string) => void,
    signal?: AbortSignal,
    extraBodyFields?: Record<string, string>,
    onFreeGeneration?: () => void
  ): Promise<void> {
    try {
      let config = await this.getConfig()
      const originalProvider = config?.activeProvider || "mind-elixir"
      let providerCfg = config?.providers?.[originalProvider]
      let apiKey = providerCfg?.apiKey

      // Fall back to the built-in Mind Elixir endpoint when:
      // (a) the user has not configured any provider,
      // (b) the user explicitly selected the "mind-elixir" provider, or
      // (c) the active provider has no saved config.
      const isMindElixir = !config || !providerCfg || originalProvider === "mind-elixir"

      if (isMindElixir) {
        config = {
          ...DEFAULT_MIND_ELIXIR_CONFIG,
          replyLanguage: getMatchedBrowserLanguage(chrome.i18n.getUILanguage())
        }
        providerCfg = config.providers["mind-elixir"]
        apiKey = providerCfg.apiKey!
      }

      if (!config) {
        throw new Error("AI configuration is missing")
      }

      if (!apiKey || !apiKey.trim()) {
        throw new Error("API Key is missing")
      }

      const handler = this.providerHandlers[config.activeProvider]
      if (!handler) {
        throw new Error(`不支持的AI服务商: ${config.activeProvider}`)
      }

      const model = providerCfg?.model || ""
      const baseUrl = providerCfg?.baseUrl || handler.getDefaultBaseUrl()
      const requestConfig = handler.buildRequestConfig(
        baseUrl,
        systemPrompt,
        userPrompt,
        model,
        apiKey,
        true
      )

      const response = await fetch(requestConfig.url, {
        method: "POST",
        headers: requestConfig.headers,
        body: JSON.stringify(
          isMindElixir && extraBodyFields
            ? { ...requestConfig.body, ...extraBodyFields }
            : requestConfig.body
        ),
        signal // Pass signal to fetch
      })

      // Check if this was a free generation
      const isFreeGeneration = isMindElixir && response.headers.get("X-Free-Generation") === "true"
      if (isFreeGeneration && onFreeGeneration) {
        onFreeGeneration()
      }

      if (!response.ok) {
        const text = await response.text()
        if (response.status === 402 && isMindElixir) {
          throw new Error(t("mindElixirInsufficientBalance"))
        }
        if ((response.status === 403 || response.status === 401) && isMindElixir) {
          throw new Error(t("mindElixirLoginRequired"))
        }

        const displayProvider = isMindElixir ? "Mind Elixir" : (originalProvider || "AI")
        throw new Error(
          t("apiRequestFailed", [
            displayProvider,
            response.status.toString(),
            response.statusText || "",
            text || ""
          ])
        )
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("无法获取响应流")
      }

      const decoder = new TextDecoder()
      let buffer = ""

      const processSseLine = (line: string) => {
        const trimmedLine = line.trim()
        if (!trimmedLine || !trimmedLine.startsWith("data: ")) return

        const dataStr = trimmedLine.slice(6)
        if (dataStr === "[DONE]") return

        try {
          const data = JSON.parse(dataStr)
          const chunkData = handler.parseStreamChunk(data)
          if (chunkData.content || chunkData.reasoning) {
            onChunk(chunkData)
          }
        } catch (e) {
          console.warn("Failed to parse stream chunk:", e)
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const consumed = consumeSseLines(buffer, chunk)
        buffer = consumed.buffer
        consumed.lines.forEach(processSseLine)
      }

      buffer += decoder.decode()
      flushSseBuffer(buffer).forEach(processSseLine)

      onDone()
    } catch (error) {
      console.error("Stream error:", error)
      onError(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * 格式化字幕数据供AI分析使用
   * @param subtitles 字幕数组
   * @returns 格式化后的字幕文本
   */
  formatSubtitlesForAI(subtitles: any[]): string {
    if (!Array.isArray(subtitles) || subtitles.length === 0) {
      throw new Error("字幕数据为空或格式不正确")
    }

    const formattedText = subtitles
      .map((subtitle) => {
        // 支持多种字幕格式
        const text =
          subtitle.text || subtitle.content || subtitle.transcript || ""
        return text.trim()
      })
      .filter((text) => text.length > 0)
      // 去除重复的相邻文本
      .filter((text, index, array) => {
        if (index === 0) return true
        return text !== array[index - 1]
      })
      // 合并短句，避免过度分割
      .reduce((acc: string[], current: string) => {
        if (acc.length === 0) {
          acc.push(current)
        } else {
          const last = acc[acc.length - 1]
          // 如果当前句子很短且上一句也很短，则合并
          if (current.length < 20 && last.length < 50) {
            acc[acc.length - 1] = last + " " + current
          } else {
            acc.push(current)
          }
        }
        return acc
      }, [])
      .join(" ")
      // 清理多余的空格和标点
      .replace(/\s+/g, " ")
      .trim()

    // 限制长度，但保持句子完整性
    if (formattedText.length <= 8000) {
      return formattedText
    }

    // 如果超长，尝试在句号处截断
    const truncated = formattedText.substring(0, 8000)
    const lastPeriod = truncated.lastIndexOf("。")
    const lastSpace = truncated.lastIndexOf(" ")

    const cutPoint =
      lastPeriod > 7000 ? lastPeriod + 1 : lastSpace > 7000 ? lastSpace : 8000

    return formattedText.substring(0, cutPoint).trim()
  }
}

export default defineBackground(() => {
  const backgroundAIService = new BackgroundAIService()
  let capturedSubtitleUrl: string | null = null

  // 监听YouTube的timedtext API请求
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const url = new URL(details.url)

      // 检查是否是YouTube的timedtext API请求
      if (
        url.hostname === "www.youtube.com" &&
        url.pathname === "/api/timedtext"
      ) {
        // 检查是否包含pot参数（表示这是一个有效的字幕请求）
        if (url.searchParams.has("pot")) {
          console.log("捕获到YouTube字幕URL:", details.url)
          capturedSubtitleUrl = details.url

          // 通知content script字幕URL已捕获
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs
                .sendMessage(tabs[0].id, {
                  type: "SUBTITLE_URL_CAPTURED",
                  url: details.url
                })
                .catch(() => {
                  // 忽略发送失败的错误（可能content script还未加载）
                })
            }
          })
        }
      }
    },
    {
      urls: ["https://www.youtube.com/api/timedtext*"]
    }
  )

  // Listen for messages from content scripts
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "formatSubtitles") {
      const formatted = backgroundAIService.formatSubtitlesForAI(
        request.subtitles
      )
      sendResponse({ success: true, data: formatted })
    }

    if (request.action === "getCapturedSubtitleUrl") {
      sendResponse({ success: true, data: capturedSubtitleUrl })
    }

    if (request.action === "clearCapturedSubtitleUrl") {
      capturedSubtitleUrl = null
      sendResponse({ success: true })
    }

    if (request.action === "publishSummaryToBlog") {
      const publish = async () => {
        const config = await backgroundAIService.getConfig()
        const publishConfig = config?.blogPublish
        const postUrl = publishConfig?.postUrl?.trim()
        const headerName = publishConfig?.headerName?.trim()
        const token = publishConfig?.token?.trim()

        if (!postUrl || !headerName || !token) {
          throw new Error(t("blogPublishNotConfigured"))
        }

        let url: URL
        try {
          url = new URL(postUrl)
        } catch {
          throw new Error(t("blogPublishInvalidUrl"))
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error(t("blogPublishInvalidUrl"))
        }

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)

        try {
          const headers = new Headers({ "Content-Type": "application/json" })
          headers.set(headerName, token)
          const response = await fetch(url.toString(), {
            method: "POST",
            headers,
            body: JSON.stringify({
              title: request.title,
              content: buildBlogMarkdown({
                title: request.title,
                sourceUrl: request.sourceUrl,
                summary: request.summary,
                summarizedAt: request.summarizedAt
              })
            }),
            signal: controller.signal
          })

          if (!response.ok) {
            throw new Error(`${t("blogPublishFailed")} (HTTP ${response.status})`)
          }
        } finally {
          clearTimeout(timeout)
        }
      }

      publish()
        .then(() => sendResponse({ success: true }))
        .catch((error) => {
          const message =
            error instanceof DOMException && error.name === "AbortError"
              ? t("blogPublishTimeout")
              : error instanceof Error
                ? error.message
                : t("blogPublishFailed")
          sendResponse({ success: false, error: message })
        })
      return true
    }

    if (request.action === "checkMindmapCache") {
      const { videoUrl, language } = request
      const checkUrl = new URL(`${BACKEND_BASE_URL}/api/public/mindmap/check`)
      checkUrl.searchParams.set("videoUrl", videoUrl)
      if (language) checkUrl.searchParams.set("language", language)

      const finalUrl = checkUrl.toString()

      fetch(finalUrl, {
        credentials: "include"
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`)
          }
          const data = await res.json()
          sendResponse({ success: true, data })
        })
        .catch((err) => {
          console.warn("[Background] checkMindmapCache failed:", err)
          sendResponse({ success: false, error: err.message })
        })
      return true // Keep the message channel open for async response
    }

    if (request.action === "fetchCachedMindmap") {
      const { videoUrl, language } = request
      const fetchUrl = new URL(`${BACKEND_BASE_URL}/api/v1/mindmap/fetch`)
      fetchUrl.searchParams.set("videoUrl", videoUrl)
      if (language) fetchUrl.searchParams.set("language", language)

      const finalFetchUrl = fetchUrl.toString()

      fetch(finalFetchUrl, {
        credentials: "include"
      })
        .then(async (res) => {
          if (res.status === 429) {
            sendResponse({ success: false, status: 429 })
            return
          }
          if (res.status === 404) {
            sendResponse({ success: false, status: 404 })
            return
          }
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`)
          }
          const data = await res.json()
          sendResponse({ success: true, data })
        })
        .catch((err) => {
          console.warn("[Background] fetchCachedMindmap failed:", err)
          sendResponse({ success: false, error: err.message })
        })
      return true // Keep the message channel open for async response
    }
  })

  // Handle streaming connections
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "AI_STREAM") {
      let controller: AbortController | null = null

      port.onDisconnect.addListener(() => {
        console.log("Port disconnected, aborting stream")
        if (controller) {
          controller.abort()
          controller = null
        }
      })

      const safePostMessage = (msg: any) => {
        try {
          port.postMessage(msg)
        } catch (e) {
          // Ignore disconnected port errors
          console.warn("Failed to post message to port (disconnected?):", e)
        }
      }

      port.onMessage.addListener(async (msg) => {
        // Abort previous request if new one comes on same port (unlikely but safe)
        if (controller) {
          controller.abort()
        }
        controller = new AbortController()
        const signal = controller.signal

        if (msg.action === "summarizeSubtitlesStream") {
          try {
            const systemPrompt = await PROMPTS.SUBTITLE_SUMMARY_SYSTEM()
            const userPrompt = PROMPTS.SUBTITLE_SUMMARY_USER(msg.subtitles)

            await backgroundAIService.streamAI(
              systemPrompt,
              userPrompt,
              (chunk) => {
                safePostMessage({
                  type: "chunk",
                  content: chunk.content,
                  reasoning: chunk.reasoning
                })
              },
              () => {
                safePostMessage({ type: "done" })
                controller = null
              },
              (error) => {
                if (signal.aborted) return
                safePostMessage({ type: "error", error })
                controller = null
              },
              signal
            )
          } catch (error) {
            if (signal.aborted) return
            safePostMessage({
              type: "error",
              error: error instanceof Error ? error.message : String(error)
            })
            controller = null
          }
        }

        if (
          msg.action === "generateMindmapStream" ||
          msg.action === "generateArticleMindmapStream"
        ) {
          try {
            const mindmapPrompt = await PROMPTS.MINDMAP_SYSTEM()
            const userPrompt =
              msg.action === "generateMindmapStream"
                ? PROMPTS.MINDMAP_VIDEO_USER(msg.subtitles, msg.title)
                : PROMPTS.MINDMAP_ARTICLE_USER(msg.content, msg.title)

            // Build extra body fields for backend mindmap caching.
            // Only injected when using Mind Elixir model and a video URL is provided
            // (article mindmaps are not cached on the backend).
            const extraBodyFields: Record<string, string> | undefined =
              msg.videoUrl && msg.action === "generateMindmapStream"
                ? {
                    _videoUrl: msg.videoUrl,
                    _language: msg.language || getMatchedBrowserLanguage(chrome.i18n.getUILanguage())
                  }
                : undefined

            await backgroundAIService.streamAI(
              mindmapPrompt,
              userPrompt,
              (chunk) => {
                safePostMessage({
                  type: "chunk",
                  content: chunk.content,
                  reasoning: chunk.reasoning
                })
              },
              () => {
                safePostMessage({ type: "done" })
                controller = null
              },
              (error) => {
                if (signal.aborted) return
                safePostMessage({ type: "error", error })
                controller = null
              },
              signal,
              extraBodyFields,
              () => {
                // Notify content script that this was a free generation
                safePostMessage({ type: "freeGenerationUsed" })
              }
            )
          } catch (error) {
            if (signal.aborted) return
            safePostMessage({
              type: "error",
              error: error instanceof Error ? error.message : String(error)
            })
            controller = null
          }
        }
      })
    }
  })
})
