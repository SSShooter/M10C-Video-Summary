import * as React from "react"
import { Check, ChevronDown, RefreshCw } from "lucide-react"

import { AnchorDropdown } from "~/components/ui/anchor-dropdown"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"

export interface SearchableDropdownItem {
  key: string
  label: string
}

export interface SearchableDropdownProps {
  id?: string
  /** 输入框里显示的文本，同时用作列表的过滤词 */
  value: string
  onValueChange: (value: string) => void
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
  invalid?: boolean
  /** 右侧图标换成转圈（数据还在加载） */
  loading?: boolean
  open: boolean
  items: SearchableDropdownItem[]
  /** 当前选中项，用于打勾与高亮 */
  selectedKey?: string | null
  onSelect: (item: SearchableDropdownItem) => void
  /** 列表顶部的说明条，例如「12 模型选择」 */
  listHeader?: React.ReactNode
  emptyText: string
  inputRef?: React.Ref<HTMLInputElement>
  anchorRef: React.RefObject<HTMLDivElement>
  contentRef: React.MutableRefObject<HTMLDivElement | null>
}

/**
 * 可搜索的下拉选择：输入框本身既是触发器也是搜索框，输入即过滤，点击列表项选中。
 *
 * 弹窗内使用同为 portal 浮层（AnchorDropdown），不会被 DialogBody 的 overflow 裁剪。
 */
export function SearchableDropdown({
  id,
  value,
  onValueChange,
  onFocus,
  onBlur,
  placeholder,
  className,
  invalid,
  loading,
  open,
  items,
  selectedKey,
  onSelect,
  listHeader,
  emptyText,
  inputRef,
  anchorRef,
  contentRef
}: SearchableDropdownProps) {
  return (
    <div ref={anchorRef} className="relative">
      <Input
        id={id}
        ref={inputRef}
        className={cn(
          "h-10 text-sm rounded-lg pr-9",
          invalid && "border-destructive focus-visible:ring-destructive",
          className
        )}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {loading ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ChevronDown
            className={cn(
              "h-4 w-4 opacity-50 transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </span>

      <AnchorDropdown
        open={open}
        anchorRef={anchorRef}
        contentRef={contentRef}>
        {listHeader ? (
          <div className="shrink-0 px-3 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border flex items-center justify-between">
            {listHeader}
          </div>
        ) : null}
        <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
          {items.map((item) => {
            const selected = selectedKey === item.key
            return (
              <div
                key={item.key}
                className={cn(
                  "flex items-center px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent transition-colors",
                  selected && "bg-accent font-medium"
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(item)
                }}>
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    selected ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </div>
            )
          })}
          {items.length === 0 && (
            <div className="py-5 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>{emptyText}</span>
            </div>
          )}
        </div>
      </AnchorDropdown>
    </div>
  )
}
