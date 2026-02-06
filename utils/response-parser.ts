import type {
  MindmapData,
  ParseOptions,
  ParseResult,
  SubtitleSummary,
  ValidatorFunction
} from "./types"

/**
 * 通用的AI响应解析工具类
 */
export class ResponseParser {
  /**
   * 通用JSON解析方法，支持多种格式的JSON提取
   */
  static parseJSON<T>(
    content: string,
    validator: ValidatorFunction<T>,
    options: ParseOptions = {}
  ): ParseResult<T> {
    const { logWarnings = true } = options
    const warnings: string[] = []

    if (!content) {
      throw new Error("AI响应内容为空")
    }

    // 尝试直接解析
    try {
      const parsed = JSON.parse(content)
      if (validator(parsed)) {
        return {
          data: parsed,
          method: "direct",
          hasWarnings: false,
          warnings: []
        }
      }
    } catch {
      if (logWarnings) {
        warnings.push("直接JSON解析失败")
      }
    }

    // 尝试提取JSON代码块
    const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonBlockMatch) {
      try {
        const parsed = JSON.parse(jsonBlockMatch[1].trim())
        if (validator(parsed)) {
          return {
            data: parsed,
            method: "codeblock",
            hasWarnings: warnings.length > 0,
            warnings
          }
        }
      } catch {
        if (logWarnings) {
          warnings.push("JSON代码块解析失败")
        }
      }
    }

    // 尝试提取花括号内的JSON
    const jsonMatch = content.match(/{[\s\S]*}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (validator(parsed)) {
          return {
            data: parsed,
            method: "bracket",
            hasWarnings: warnings.length > 0,
            warnings
          }
        }
      } catch {
        if (logWarnings) {
          warnings.push("花括号JSON解析失败")
        }
      }
    }

    // 如果所有JSON解析都失败，抛出错误
    throw new Error("无法解析AI响应为有效的JSON格式")
  }

  /**
   * 解析思维导图响应
   */
  static parseMindmapResponse(
    content: string,
    options: ParseOptions = {}
  ): any {
    return this.parseJSON(content, this.isValidMindmapData, options).data
  }

  /**
   * 解析字幕总结响应
   */
  static parseSubtitleSummaryResponse(
    content: string,
    options: ParseOptions = {}
  ): SubtitleSummary {
    const { enableTextFallback = true } = options

    try {
      return this.parseJSON(content, this.isValidSubtitleSummary, options).data
    } catch (error) {
      if (enableTextFallback) {
        return this.parseTextResponse(content)
      }
      throw error
    }
  }

  /**
   * 验证思维导图数据格式
   */
  static isValidMindmapData(obj: any): obj is MindmapData {
    return (
      obj &&
      typeof obj === "object" &&
      obj.nodeData &&
      typeof obj.nodeData === "object" &&
      typeof obj.nodeData.topic === "string" &&
      typeof obj.nodeData.id === "string"
    )
  }

  /**
   * 验证解析结果是否符合SubtitleSummary接口
   */
  static isValidSubtitleSummary(obj: any): obj is SubtitleSummary {
    return (
      obj &&
      typeof obj === "object" &&
      typeof obj.summary === "string" &&
      Array.isArray(obj.keyPoints) &&
      Array.isArray(obj.topics) &&
      obj.keyPoints.every((item: any) => typeof item === "string") &&
      obj.topics.every((item: any) => typeof item === "string")
    )
  }

  /**
   * 当JSON解析失败时的备用文本解析方法
   */
  static parseTextResponse(content: string): SubtitleSummary {
    console.warn("JSON解析失败，使用文本解析备用方案")

    const lines = content.split("\n").filter((line) => line.trim())

    // 尝试从文本中提取结构化信息
    let summary = ""
    let keyPoints: string[] = []
    let topics: string[] = []

    // 查找总结部分
    const summaryMatch = content.match(/(?:总结|summary)[：:](.*?)(?=\n|$)/i)
    if (summaryMatch) {
      summary = summaryMatch[1].trim()
    } else {
      summary = content.substring(0, 200) + (content.length > 200 ? "..." : "")
    }

    // 查找关键要点
    const keyPointsSection = content.match(
      /(?:关键要点|要点|keypoints?)[：:]([\s\S]*?)(?=(?:话题|topics?)[：:]|$)/i
    )
    if (keyPointsSection) {
      keyPoints = keyPointsSection[1]
        .split("\n")
        .map((line) => line.replace(/^[\d\-\*\s]+/, "").trim())
        .filter((line) => line.length > 0)
        .slice(0, 6)
    } else {
      keyPoints = lines
        .slice(0, 4)
        .map((line) => line.replace(/^[\d\-\*\s]+/, "").trim())
        .filter((line) => line.length > 0)
    }

    // 查找话题标签
    const topicsSection = content.match(/(?:话题|topics?)[：:]([\s\S]*?)$/i)
    if (topicsSection) {
      topics = topicsSection[1]
        .split(/[,，\n]/)
        .map((topic) => topic.replace(/^[\d\-\*\s]+/, "").trim())
        .filter((topic) => topic.length > 0)
        .slice(0, 5)
    } else {
      topics = ["视频内容分析", "知识提取"]
    }

    return {
      summary: summary || "视频内容总结",
      keyPoints: keyPoints.length > 0 ? keyPoints : ["内容要点提取"],
      topics: topics.length > 0 ? topics : ["视频分析"]
    }
  }

  /**
   * 去除Markdown代码块标记，返回纯文本内容
   */
  static cleanMindmapResponse(content: string): string {
    if (!content) return ""
    // 移除开头和结尾的 ```, ```plaintext, ```json 等
    return content
      .replace(/^```[\w]*\n?/gm, "") // Remove starting ```tag
      .replace(/```$/gm, "") // Remove ending ```
      .trim()
  }
}
