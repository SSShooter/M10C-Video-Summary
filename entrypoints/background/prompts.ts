/**
 * AI提示词配置文件
 * 包含所有用于AI分析的系统提示词和用户提示词模板
 */
import { storage } from "@wxt-dev/storage"
import { getMatchedBrowserLanguage } from "~/utils/i18n"
import type { AIConfig } from "~/utils/ai-service"
import { DEFAULT_SUMMARY_PROMPT, resolveSummaryPrompt } from "~/utils/summary-prompt"
import { DEFAULT_MINDMAP_PROMPT, resolveMindmapPrompt } from "~/utils/mindmap-prompt"

// 语言映射表
const LANGUAGE_MAP: Record<string, string> = {
  "zh-CN": "中文",
  "zh-TW": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  pt: "Português",
  ru: "Русский"
}

// 获取用户设置 of 回复语言
async function getReplyLanguage(): Promise<string> {
  try {
    const config = await storage.getItem<AIConfig>("local:aiConfigV2")
    if (!config) return LANGUAGE_MAP["en"]
    let languageCode = config.replyLanguage
    if (!languageCode || languageCode === "auto") {
      languageCode = getMatchedBrowserLanguage(chrome.i18n.getUILanguage())
    }
    return LANGUAGE_MAP[languageCode] || LANGUAGE_MAP["en"]
  } catch (error) {
    console.error("Failed to get reply language:", error)
    return LANGUAGE_MAP["en"]
  }
}

export const PROMPTS = {
  /**
   * 字幕总结的系统提示词
   */
  SUBTITLE_SUMMARY_SYSTEM: async () => {
    const language = await getReplyLanguage()
    const config = await storage.getItem<AIConfig>("local:aiConfigV2")
    return resolveSummaryPrompt(config?.summaryPrompt || DEFAULT_SUMMARY_PROMPT, language)
  },

  /**
   * 字幕总结的用户提示词模板
   */
  SUBTITLE_SUMMARY_USER: (subtitles: string) =>
    `请分析以下内容：

**字幕内容：**
${subtitles}

请按照系统要求生成结构化的分析结果。`,

  /**
   * 思维导图的系统提示词
   */
  MINDMAP_SYSTEM: async () => {
    const language = await getReplyLanguage()
    const config = await storage.getItem<AIConfig>("local:aiConfigV2")
    return resolveMindmapPrompt(config?.mindmapPrompt || DEFAULT_MINDMAP_PROMPT, language)
  },

  /**
   * 视频字幕思维导图用户提示词模板
   */
  MINDMAP_VIDEO_USER: (subtitles: string, title?: string) =>
    `请根据以下内容生成思维导图：
${title ? `\n标题：${title}\n` : ""}
内容：
${subtitles}`,

  /**
   * 文章思维导图用户提示词模板
   */
  MINDMAP_ARTICLE_USER: (content: string, title: string) =>
    `请根据以下文章内容生成思维导图：

标题：${title}

内容：
${content}`
} as const
