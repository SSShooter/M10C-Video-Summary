/**
 * AI提示词配置文件
 * 包含所有用于AI分析的系统提示词和用户提示词模板
 */

import { Storage } from "@plasmohq/storage"

// 语言映射表
const LANGUAGE_MAP: Record<string, string> = {
  auto: chrome.i18n.getUILanguage(),
  "zh-CN": "中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  pt: "Português",
  ru: "Русский"
}

interface AIConfig {
  provider: string
  apiKeys: {
    openai?: string
    gemini?: string
    claude?: string
    "openai-compatible"?: string
  }
  model: string
  baseUrl?: string
  baseUrls?: {
    openai?: string
    gemini?: string
    claude?: string
    "openai-compatible"?: string
  }
  customModel?: string
  replyLanguage?: string
}

// 获取用户设置的回复语言
async function getReplyLanguage(): Promise<string> {
  try {
    const storage = new Storage()
    const config = await storage.get<AIConfig>("aiConfig")
    const languageCode = config?.replyLanguage || "auto"
    return LANGUAGE_MAP[languageCode] || LANGUAGE_MAP["auto"]
  } catch (error) {
    console.error("Failed to get reply language:", error)
    return LANGUAGE_MAP["auto"]
  }
}

export const PROMPTS = {
  /**
   * 字幕总结的系统提示词
   */
  SUBTITLE_SUMMARY_SYSTEM: async () => {
    const language = await getReplyLanguage()
    return `你是一个知识提取专家。请仔细分析用户提供的内容，并按照以下要求生成结构化的分析结果：

**分析要求：**
1. **总结**：生成500-1000字的精炼总结，概括视频的核心内容和主要观点。
2. **关键要点**：提取3-8个最重要的知识点或观点，每个要点简洁明了，使用列表形式。
3. **主要话题**：识别2-6个核心话题标签，便于分类和检索。

**输出格式：**
请直接使用**Markdown**格式输出，不要包含任何JSON结构或其他无关内容。

**注意事项：**
- 保证输出全文的语言都为${language}
- 保持客观和准确
- 避免重复内容`
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
   * 思维导图生成的提示词
   */
  MINDMAP_GENERATION: async () => {
    const language = await getReplyLanguage()
    return `
You are a mindmap generator.
You should output the mindmap in a specific plaintext format that can be parsed line by line.

Format Definition:
- Root Node
  - Child Node 1
    - Child Node 1-1
    - Child Node 1-2
    - }:2 Summary of first two nodes
  - Child Node 2
    - Child Node 2-1 [^id1]
    - Child Node 2-2 [^id2]
    - Child Node 2-3 {color: #e87a90}
    - > [^id1] <-Bidirectional Link-> [^id2]

Rules:
1. Use indentation (2 spaces) to represent hierarchy.
2. Use "- " for nodes.
3. Use "[^id]" to define ID for a node if it needs to be referenced by links.
4. Use "{color: #hex}" to define color for a node.
5. Use "}:n Label" to summarize the last n nodes.
6. Use "> [^id1] <-Label-> [^id2]" for bidirectional links.
7. Use "> [^id1] >-Label-> [^id2]" for one-way links.
8. Output MUST be in ${language}.
9. Do NOT wrap the output in markdown code blocks. Just valid plaintext.
`
  },

  /**
   * 视频字幕思维导图用户提示词模板
   */
  MINDMAP_VIDEO_USER: (subtitles: string) =>
    `请根据以下内容生成思维导图：

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
