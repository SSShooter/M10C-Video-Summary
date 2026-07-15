interface StructuredSummary {
  summary?: unknown
  key_points?: unknown
  main_topics?: unknown
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function formatSummaryBody(rawSummary: string): string {
  const trimmed = rawSummary.trim()
  if (!trimmed) return ""

  try {
    const parsed = JSON.parse(trimmed) as StructuredSummary
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""
    const keyPoints = asStringArray(parsed.key_points)
    const mainTopics = asStringArray(parsed.main_topics)
    const sections: string[] = []

    if (summary) sections.push(`## 内容摘要\n\n${summary}`)
    if (keyPoints.length > 0) {
      sections.push(`## 关键要点\n\n${keyPoints.map((item) => `- ${item}`).join("\n")}`)
    }
    if (mainTopics.length > 0) {
      sections.push(`## 主要话题\n\n${mainTopics.map((item) => `- ${item}`).join("\n")}`)
    }

    if (sections.length > 0) return sections.join("\n\n")
  } catch {
    // Existing summaries may already be Markdown or plain text.
  }

  return trimmed
}

export function buildBlogMarkdown({
  title,
  sourceUrl,
  summary,
  summarizedAt
}: {
  title: string
  sourceUrl: string
  summary: string
  summarizedAt: string
}): string {
  const displayTitle = title.trim() || "文章总结"
  const summaryBody = formatSummaryBody(summary)

  return [
    `# ${displayTitle}`,
    `> 来源：[${sourceUrl}](${sourceUrl})`,
    `> 总结时间：${summarizedAt}`,
    "---",
    summaryBody
  ]
    .filter(Boolean)
    .join("\n\n")
}
