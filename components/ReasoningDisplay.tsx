import { Brain } from "lucide-react"
import React, { useEffect, useRef } from "react"

import { ScrollArea } from "~components/ui/scroll-area"
import { t } from "~utils/i18n"

interface ReasoningDisplayProps {
  reasoning: string
}

export function ReasoningDisplay({ reasoning }: ReasoningDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [reasoning])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-muted-foreground">
      <div className="mb-4 text-center">
        {reasoning ? (
          <div className="animate-pulse flex items-center gap-2 mb-2 justify-center text-sm font-medium text-blue-600 dark:text-blue-400">
            <Brain className="w-4 h-4" />
            {t("thinking")}
          </div>
        ) : (
          <div className="animate-pulse flex items-center gap-2 mb-2 justify-center text-sm font-medium text-muted-foreground">
            <Brain className="w-4 h-4" />
            {t("connecting")}
          </div>
        )}
      </div>
      {reasoning && (
        <ScrollArea className="w-full h-full max-h-[300px]">
          <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {reasoning}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
