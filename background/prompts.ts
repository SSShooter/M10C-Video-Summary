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
1. **总结(summary)**：生成150-300字的精炼总结，概括视频的核心内容和主要观点
2. **关键要点(keyPoints)**：提取3-8个最重要的知识点或观点，每个要点简洁明了
3. **主要话题(topics)**：识别2-6个核心话题标签，便于分类和检索

**输出格式：**
请严格按照JSON格式输出，确保格式正确：
{
  "summary": "视频内容的精炼总结",
  "keyPoints": ["关键要点1", "关键要点2", "关键要点3"],
  "topics": ["话题标签1", "话题标签2", "话题标签3"]
}

**注意事项：**
- 输出语言：${language}
- 保持客观和准确
- 避免重复内容
- 确保JSON格式正确`
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
\`\`\`ts
export interface NodeObj {
  topic: string
  id: string
  tags?: string[]
  children?: NodeObj[]
}
// 总结父id的第start到end个节点的内容
export interface Summary {
  id: string
  label: string
  /**
   * parent node id of the summary
   */
  parent: string
  /**
   * start index of the summary
   */
  start: number
  /**
   * end index of the summary
   */
  end: number
}

export interface Arrow {
  id: string
  /**
   * label of arrow
   */
  label: string
  /**
   * id of start node
   */
  from: string
  /**
   * id of end node
   */
  to: string
  /**
   * whether the arrow is bidirectional
   */
  bidirectional?: boolean
}
\`\`\`

使用符合  {
  nodeData: NodeObj
  arrows?: Arrow[]
  summaries?: Summary[]
} 格式的 JSON 回复用户，这是一个表达**思维导图数据**的递归结构。

**注意！！nodeData、arrows、summaries 三者的同一层级！！**

**提醒**：
- 节点 ID 使用递增数字即可
- 注意不要一昧使用兄弟节点关系，适当应用父子级别的分层
- 只能向根节点插入 tags，tag 必须是普适的，不是独特的，用于用户快速找到同类内容
- Summary 是总结多个同父节点的子节点的工具，会使用花括号把总结文本显示在指定子节点侧边，因为节点存在两侧分布的情况，禁止总结根节点
- Arrow 可以添加连接节点的箭头，label 说明两个节点的联系，delta 的默认值为 50,50
- **Arrow 仅能用于连接不同章节或段落的内容**
- 适当添加 Summary 和 Arrow

**注意事项：**
- 输出语言：${language}
- 确保JSON格式正确，不要返回任何JSON以外的内容
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
