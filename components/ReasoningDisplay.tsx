import { Brain } from "lucide-react"
import React from "react"

import { ScrollArea } from "~components/ui/scroll-area"
import { t } from "~utils/i18n"

interface ReasoningDisplayProps {
  reasoning: string
}

export function ReasoningDisplay({ reasoning }: ReasoningDisplayProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-gray-600">
      <div className="mb-4 text-center">
        {reasoning ? (
          <div className="animate-pulse flex items-center gap-2 mb-2 justify-center text-sm font-medium text-blue-600">
            <Brain className="w-4 h-4" />
            {t("thinking")}
          </div>
        ) : (
          <div className="animate-pulse flex items-center gap-2 mb-2 justify-center text-sm font-medium text-gray-500">
            <Brain className="w-4 h-4" />
            {t("connecting")}
          </div>
        )}
      </div>
      {reasoning && (
        <ScrollArea className="w-full h-full max-h-[300px] border rounded-md bg-gray-50/50 p-4">
          <div className="text-xs text-gray-500 whitespace-pre-wrap font-mono leading-relaxed">
            {reasoning}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
