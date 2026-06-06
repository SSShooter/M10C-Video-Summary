/**
 * AI提示词配置文件
 * 包含所有用于AI分析的系统提示词和用户提示词模板
 */
import { storage } from "@wxt-dev/storage"
import { getMatchedBrowserLanguage } from "~/utils/i18n"

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

// 获取用户设置 of 回复语言
async function getReplyLanguage(): Promise<string> {
  try {
    const config = await storage.getItem<AIConfig>("local:aiConfig")
    let languageCode = config?.replyLanguage
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
    return `你是一个知识提取专家。请仔细分析用户提供的内容，并按照以下要求生成结构化的分析结果：

**分析要求：**
1. **总结**：生成500-1000字的精炼总结，概括视频的核心内容 and 主要观点。
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
- Core Topic Title
  - Main Point A
    - Detail A-1
    - Detail A-2
    - }:2 Summary of previous 2 nodes
  - Main Point B [^id1]
    - Sub-point B-1 {"color": "#e87a90"}
    - Sub-point B-2 {"background": "#ecf0f1", "color": "#333333"}
    - Sub-point B-3 [^id2]
    - } Summary of all previous siblings
  - > [^id1] <-Relation-> [^id2]

Rules:
1. The root node (zero indentation) MUST be the core topic extracted from the content. NEVER use generic placeholders like "Root" as the root text. There MUST be exactly one unique root node at the beginning. The entire content MUST stem from this single root. Multiple nodes at zero indentation are STRICTLY FORBIDDEN.
2. Use indentation (exactly 2 spaces per level) to represent hierarchy.
3. Every node line MUST start with "- " (dash followed by a space).
4. Use "[^id]" at the end of a node topic to define a unique ID for cross-referencing.
5. Use JSON-like syntax at the end of a node topic for styling: {"color": "#hex", "background": "#hex", "fontSize": "16"}. Use this feature with extreme restraint. By default, do NOT add colors or background styles to standard nodes. Only apply styling to highly critical or special nodes that require strong visual emphasis.
6. Summary nodes:
   - Use "} Summary Text" to summarize ALL previous siblings at the same level.
   - Use "}:n Summary Text" to summarize the previous n siblings at the same level.
7. Relationship links (can be placed on any line):
   - Bidirectional: "> [^id1] <-Label-> [^id2]"
   - Unidirectional: "> [^id1] >-Label-> [^id2]"
8. Output MUST be in ${language}.
9. Do NOT wrap the output in markdown code blocks. Just valid plaintext.
`
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
