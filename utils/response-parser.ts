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
    let cleaned = content
      .replace(/^```[\w]*\n?/gm, "") // Remove starting ```tag
      .replace(/```$/gm, "") // Remove ending ```
      .trim()

    // Fix root node: LLM often omits "- " on the first line
    if (cleaned && !cleaned.startsWith("- ")) {
      cleaned = "- " + cleaned
    }

    // 一级/根层级的总结会渲染成画布右侧的巨大浮块，必须剔除
    cleaned = ResponseParser.stripTopLevelSummaries(cleaned)

    return cleaned
  }

  /**
   * 去掉根层级和一级（根节点直接子节点所在层级）的 "}" 总结行。
   * Mind Elixir 会把总结渲染成独立的浮动节点，放在这两个层级时
   * 会撑出一大块脱离主干的文字，导致导图版面难看。
   */
  static stripTopLevelSummaries(plaintext: string): string {
    const SUMMARY_LINE = /^\s*(?:-\s*)?\}:?\d*/ // "- }" / "- }:2" / 缺 "- " 前缀的变体
    const MAX_TOP_INDENT = 2 // 0（根层级）与 2（一级节点层级）
    const indentOf = (line: string) => line.match(/^\s*/)?.[0].length ?? 0

    return plaintext
      .split("\n")
      .filter(
        (line) => !(SUMMARY_LINE.test(line) && indentOf(line) <= MAX_TOP_INDENT)
      )
      .join("\n")
  }
}
