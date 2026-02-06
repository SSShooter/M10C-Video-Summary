import { Storage } from "@plasmohq/storage"

export interface AIConfig {
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

class AIService {
  private storage = new Storage()

  async getConfig(): Promise<AIConfig | null> {
    try {
      return await this.storage.get("aiConfig")
    } catch (error) {
      console.error("获取AI配置失败:", error)
      return null
    }
  }

  // 格式化字幕文本用于AI分析
  formatSubtitlesForAI(subtitles: any[]): string {
    if (!Array.isArray(subtitles)) {
      console.error("formatSubtitlesForAI: 输入参数不是数组:", subtitles)
      return ""
    }

    return subtitles
      .map((subtitle) => {
        const text = subtitle.text || subtitle.content || ""
        return text.trim()
      })
      .filter((text) => text.length > 0)
      .join(" ")
  }
}

export const aiService = new AIService()
