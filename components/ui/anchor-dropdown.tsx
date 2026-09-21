import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "~/lib/utils"

/** 距视口边缘的安全间距 */
const VIEWPORT_MARGIN = 8
/** 浮层与锚点之间的间隙 */
const ANCHOR_GAP = 6
/** 下方可用空间低于该值时尝试向上翻转 */
const MIN_SPACE_BELOW = 220
/** 最小可用高度，避免被压得过扁 */
const MIN_HEIGHT = 120

export interface AnchorDropdownProps {
  open: boolean
  /** 定位锚点，一般是包裹触发器/输入框的容器 */
  anchorRef: React.RefObject<HTMLElement>
  /** 回传浮层 DOM，便于外部做 outside-click 判断 */
  contentRef?: React.MutableRefObject<HTMLDivElement | null>
  className?: string
  children: React.ReactNode
}

/**
 * 渲染到 document.body 的下拉浮层。
 *
 * 与直接用 `absolute` 定位不同，它不会被祖先的 `overflow: hidden / auto`
 * （例如 DialogBody 的滚动容器）裁剪，超出弹窗的部分依然可见；
 * 同时跟随锚点实时定位，空间不足时自动向上展开。
 */
export function AnchorDropdown({
  open,
  anchorRef,
  contentRef,
  className,
  children
}: AnchorDropdownProps) {
  const localRef = React.useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = React.useState<React.CSSProperties | null>(null)

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      localRef.current = node
      if (contentRef) contentRef.current = node
    },
    [contentRef]
  )

  const updatePosition = React.useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()

    const spaceBelow =
      window.innerHeight - rect.bottom - VIEWPORT_MARGIN - ANCHOR_GAP
    const spaceAbove = rect.top - VIEWPORT_MARGIN - ANCHOR_GAP
    const flip = spaceBelow < MIN_SPACE_BELOW && spaceAbove > spaceBelow

    setStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(MIN_HEIGHT, flip ? spaceAbove : spaceBelow),
      ...(flip
        ? { bottom: window.innerHeight - rect.top + ANCHOR_GAP }
        : { top: rect.bottom + ANCHOR_GAP })
    })
  }, [anchorRef])

  React.useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }
    updatePosition()
    const raf = requestAnimationFrame(updatePosition)
    // 捕获阶段监听，覆盖 DialogBody 等内部滚动容器
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
    }
  }, [open, updatePosition])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      ref={setRefs}
      style={{ ...style, visibility: style ? "visible" : "hidden" }}
      className={cn(
        "fixed z-[60] flex flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg animate-in fade-in-50 zoom-in-95 duration-100",
        className
      )}>
      {children}
    </div>,
    document.body
  )
}
