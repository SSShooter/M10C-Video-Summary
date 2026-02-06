/**
 * 通用的AI响应解析工具类
 */
export class ResponseParser {
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
