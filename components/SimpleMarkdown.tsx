import React from "react"

export const SimpleMarkdown = ({ content }: { content: string }) => {
  if (!content) return null

  // Split content by lines but keep code blocks together? For simplicity, line by line.
  const lines = content.split("\n")
  const elements = []
  let listBuffer: React.ReactNode[] = []

  const flushList = (keyPrefix: string) => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`${keyPrefix}-list`} className="list-disc pl-5 my-2 text-sm">
          {listBuffer}
        </ul>
      )
      listBuffer = []
    }
  }

  lines.forEach((line, index) => {
    const key = `line-${index}`
    const trimmed = line.trim()

    if (trimmed.startsWith("# ")) {
      flushList(key)
      elements.push(
        <h1 key={key} className="text-xl font-bold mt-4 mb-2 text-blue-800">
          {trimmed.replace(/^#\s+/, "")}
        </h1>
      )
    } else if (trimmed.startsWith("### ")) {
      flushList(key)
      elements.push(
        <h3 key={key} className="text-base font-bold mt-4 mb-2 text-blue-600">
          {trimmed.replace(/^###\s+/, "")}
        </h3>
      )
    } else if (trimmed.startsWith("## ")) {
      flushList(key)
      elements.push(
        <h2 key={key} className="text-lg font-bold mt-4 mb-2 text-blue-700">
          {trimmed.replace(/^##\s+/, "")}
        </h2>
      )
    } else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      flushList(key)
      elements.push(
        <p key={key} className="font-bold my-2 text-sm">
          {trimmed.replace(/^\*\*/, "").replace(/\*\*$/, "")}
        </p>
      )
    } else if (trimmed.startsWith("- ")) {
      const content = trimmed.replace(/^- /, "")
      // Convert bold inside list items
      const parts = content.split(/(\*\*.*?\*\*)/g).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="text-blue-600">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return part
      })
      listBuffer.push(<li key={key}>{parts}</li>)
    } else if (trimmed === "") {
      flushList(key)
      if (index < lines.length - 1 && lines[index + 1].trim() === "") {
        // Double newline, maybe add spacing
        elements.push(<br key={key} />)
      }
    } else {
      flushList(key)
      // Standard paragraph, check for bold
      if (trimmed.length > 0) {
        const parts = line.split(/(\*\*.*?\*\*)/g).map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i}>{part.slice(2, -2)}</strong>
          }
          // Simple hash tag highlighting
          if (part.includes("#")) {
            return part.split(/(#\S+)/g).map((subPart, j) => {
              if (subPart.startsWith("#")) {
                return (
                  <span key={`${i}-${j}`} className="text-blue-500">
                    {subPart}
                  </span>
                )
              }
              return subPart
            })
          }
          return part
        })
        elements.push(
          <p key={key} className="my-1 text-sm leading-relaxed text-gray-800">
            {parts.flat()}
          </p>
        )
      }
    }
  })

  flushList("end")

  return <div>{elements}</div>
}

export default SimpleMarkdown
