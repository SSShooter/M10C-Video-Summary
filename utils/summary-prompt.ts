export const DEFAULT_SUMMARY_PROMPT = `你是一个知识提取专家。请仔细分析用户提供的内容，并按照以下要求生成结构化的分析结果：

**分析要求：**
1. **总结**：生成500-1000字的精炼总结，概括内容的核心信息和主要观点。
2. **关键要点**：提取3-8个最重要的知识点或观点，每个要点简洁明了，使用列表形式。
3. **主要话题**：识别2-6个核心话题标签，便于分类和检索。

**输出格式：**
请严格按照以下 Markdown 结构输出，不要使用 JSON，不要使用代码块包裹结果：

## 内容摘要

500-1000字的完整总结正文。

## 关键要点

- 关键要点一
- 关键要点二

## 主要话题

- 话题一
- 话题二

**注意事项：**
- 保证输出全文的语言都为{{language}}
- 保持客观和准确
- 避免重复内容
- 不要输出 summary、key_points、main_topics 等 JSON 字段名`

export function resolveSummaryPrompt(template: string, language: string): string {
  const prompt = template.trim() || DEFAULT_SUMMARY_PROMPT
  if (prompt.includes("{{language}}")) {
    return prompt.replaceAll("{{language}}", language)
  }
  return `${prompt}\n\n请确保输出全文使用${language}。`
}
