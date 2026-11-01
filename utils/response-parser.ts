/**
 * 通用的AI响应解析工具类
 */

// 行尾的内联样式 JSON，例如 {"color": "#e87a90"}
const TRAILING_STYLE = /\s*\{[^}]*\}\s*$/
// 合法写法：节点引用 ID 位于文本末尾
const TRAILING_REF_ID = /\[\^([\w-]+)\]$/

const indentOf = (line: string) => line.match(/^\s*/)?.[0].length ?? 0
const bodyOf = (line: string) => line.trim().replace(/^-\s*/, "")
/** "> ..." 关系行 与 "} ..." 总结行都不是普通节点 */
const isMarkerLine = (body: string) =>
  body.startsWith(">") || body.startsWith("}")
const refIdTokens = (text: string) =>
  Array.from(text.matchAll(/\[\^([\w-]+)\]/g), (m) => m[1])
const stripRefIds = (text: string) => text.replace(/\[\^[\w-]+\]/g, "")

/** 把行尾样式 JSON 与正文拆开，保留原始长度以免切片错位 */
function splitTrailingStyle(body: string): { text: string; style: string } {
  const matched = body.match(TRAILING_STYLE)
  if (!matched) return { text: body.trim(), style: "" }
  return {
    text: body.slice(0, body.length - matched[0].length).trim(),
    style: matched[0].trim()
  }
}

/** 给节点行补上 ID，ID 必须排在样式 JSON 之前 */
function appendRefId(line: string, id: string): string {
  const { text, style } = splitTrailingStyle(bodyOf(line))
  return `${" ".repeat(indentOf(line))}- ${text} [^${id}]${style ? ` ${style}` : ""}`
}

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

    cleaned = ResponseParser.normalizeNodeRefIds(cleaned)

    // 一级/根层级的总结会渲染成画布右侧的巨大浮块，必须剔除
    cleaned = ResponseParser.stripTopLevelSummaries(cleaned)

    return cleaned
  }

  /**
   * 修正模型写歪的 [^id]：
   * - ID 出现在文本开头/中间时挪到行尾，否则 Mind Elixir 只认行尾 ID，
   *   会把 "[^amygdala]" 当正文画进节点里；
   * - 只有 ID、没有正文的空节点行（如 "-  [^origin]"）合并到上级节点，
   *   既不会留下空白节点，也保住了关系线的锚点；
   * - 关系线引用了不存在的 ID 时直接丢弃，Mind Elixir 会静默断开它们；
   * - 同一个 ID 被两个节点复用时，废弃的那个退化为别名，关系线跟着改写。
   */
  static normalizeNodeRefIds(plaintext: string): string {
    const lines = plaintext.split("\n")
    // 纯 ID 行：行号 -> 待提升的 ID
    const blankIdLines = new Map<number, { indent: number; id: string }>()

    // 第一轮：把位置不对的 ID 挪到行尾
    for (let i = 0; i < lines.length; i++) {
      const body = bodyOf(lines[i])
      if (!body || isMarkerLine(body)) continue

      const { text: core, style } = splitTrailingStyle(body)
      const ids = refIdTokens(core)
      if (!ids.length) continue

      // 去掉所有 ID 后还剩多少正文，决定这行是节点、还是纯 ID 的锚点
      const text = stripRefIds(core).replace(/\s+/g, " ").trim()
      const trailingId = TRAILING_REF_ID.test(core)
        ? ids[ids.length - 1]
        : undefined
      if (!text) {
        blankIdLines.set(i, {
          indent: indentOf(lines[i]),
          id: trailingId ?? ids[0]
        })
        continue
      }
      // 完全合法的写法：唯一 ID 就在行尾
      if (trailingId && ids.length === 1) continue

      const id = trailingId ?? ids[0]
      lines[i] = `${" ".repeat(indentOf(lines[i]))}- ${text} [^${id}]${
        style ? ` ${style}` : ""
      }`
    }

    // 第二轮：纯 ID 行要么提升到上级节点，要么退化为已有 ID 的别名
    const aliases = new Map<string, string>()
    for (const [index, { indent, id }] of blankIdLines) {
      let owner = -1
      let ownerId: string | undefined
      for (let j = index - 1; j >= 0; j--) {
        if (blankIdLines.has(j)) continue
        const body = bodyOf(lines[j])
        // 总结/关系行不承载 ID，继续往上找真正的父节点
        if (!body || isMarkerLine(body)) continue
        if (indentOf(lines[j]) >= indent) continue
        const existing = splitTrailingStyle(body).text.match(TRAILING_REF_ID)
        if (existing) ownerId = existing[1]
        else owner = j
        break
      }
      if (owner >= 0) lines[owner] = appendRefId(lines[owner], id)
      else if (ownerId) aliases.set(id, ownerId)
      // 既没有上级节点也没有可替代的 ID，只能丢弃，后面的关系线也会一并失效
    }

    const resolveAlias = (id: string) => {
      let current = id
      for (let guard = 0; guard < 10; guard++) {
        const next = aliases.get(current)
        if (!next || next === current) break
        current = next
      }
      return current
    }

    // 第三轮：重写关系线，并丢掉两端不成立的链路
    const defined = new Set<string>()
    for (let i = 0; i < lines.length; i++) {
      if (blankIdLines.has(i)) continue
      const body = bodyOf(lines[i])
      if (!body || isMarkerLine(body)) continue
      const matched = splitTrailingStyle(body).text.match(TRAILING_REF_ID)
      if (matched) defined.add(matched[1])
    }

    const result: string[] = []
    for (let i = 0; i < lines.length; i++) {
      if (blankIdLines.has(i)) continue
      const body = bodyOf(lines[i])
      if (!body.startsWith(">")) {
        result.push(lines[i])
        continue
      }
      const arrow = body.replace(
        /\[\^([\w-]+)\]/g,
        (token, id: string) => `[^${resolveAlias(id)}]`
      )
      const ids = refIdTokens(arrow)
      if (ids.length < 2 || !ids.every((id) => defined.has(id))) continue
      result.push(`${" ".repeat(indentOf(lines[i]))}- ${arrow}`)
    }

    return result.join("\n")
  }

  /**
   * 去掉根层级和一级（根节点直接子节点所在层级）的 "}" 总结行。
   * Mind Elixir 会把总结渲染成独立的浮动节点，放在这两个层级时
   * 会撑出一大块脱离主干的文字，导致导图版面难看。
   */
  static stripTopLevelSummaries(plaintext: string): string {
    const SUMMARY_LINE = /^\s*(?:-\s*)?\}:?\d*/ // "- }" / "- }:2" / 缺 "- " 前缀的变体
    const MAX_TOP_INDENT = 2 // 0（根层级）与 2（一级节点层级）

    return plaintext
      .split("\n")
      .filter(
        (line) => !(SUMMARY_LINE.test(line) && indentOf(line) <= MAX_TOP_INDENT)
      )
      .join("\n")
  }
}
