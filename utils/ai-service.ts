import { storage } from "@wxt-dev/storage"

export interface ProviderConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface AIConfig {
  activeProvider: string
  replyLanguage?: string
  providers: Record<string, ProviderConfig>
}

class AIService {
  async getConfig(): Promise<AIConfig | null> {
    try {
      return await storage.getItem<AIConfig>("local:aiConfigV2")
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
