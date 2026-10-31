import React, { useEffect, useRef, useState } from "react"

import { cn } from "~/lib/utils"

/**
 * AI 生成光效（Siri Glow）
 *
 * 视觉参考 demo/siri-glow.html：光雾从顶边中点漫下来 → 光雾到 45% 时点亮
 * 六色旋转光环 → 生成结束后光环停留一会儿再淡出。
 *
 * 这里只做一层抽象：图层结构、时序编排、降级策略全在组件内部，
 * 调用方只需要给出「是否在生成」这一个布尔值。
 *
 *   <GenerationGlow active={aiLoading} streaming={aiLoading}>
 *     ...内容...
 *   </GenerationGlow>
 *
 * 样式见 assets/style.css 的 "AI 生成光效" 段，参数用 CSS 变量覆盖：
 *   --m10c-ring-width / --m10c-ring-blur / --m10c-ring-speed
 *   --m10c-wave-duration / --m10c-wave-blur / --m10c-surface
 */

/**
 * 状态类必须由 React 持有：直接改 classList 会被下一次 className 重设整段抹掉
 * （例如深色画布切换时 tone 变化，恰好发生在生成中出现画布的那一刻）。
 */
interface GlowPhase {
  /** 光雾 + 一次性收缩 */
  waving: boolean
  /** 六色光环常亮 */
  ring: boolean
}

const IDLE_PHASE: GlowPhase = { waving: false, ring: false }

/** 光雾铺满后，光环亮起到完全淡出的停留时间（ms） */
const DEFAULT_FADE_DELAY = 1100

/** 兜底时长，与 CSS 里 --m10c-wave-duration 的默认值保持一致 */
const FALLBACK_WAVE_MS = 1400

export interface GenerationGlowProps {
  /** 生成中：false → true 播光雾，true → false 收光环 */
  active: boolean
  /** 流式输出中：在最后一个块级元素尾部挂一个闪烁光标 */
  streaming?: boolean
  /**
   * 容器内实际的底色深浅。光环在深底上要走另一套参数
   * （小模糊 + 高饱和 + 加色混合），否则会糊成一层彩灰。
   */
  tone?: "light" | "dark"
  /** 生成结束后光环停留多久再淡出（ms） */
  fadeDelay?: number
  className?: string
  children?: React.ReactNode
}

/**
 * 从计算样式里读光雾时长，允许业务侧用 CSS 变量覆盖，
 * 组件不再重复维护一份时长常量。
 */
function readWaveDuration(el: HTMLElement): number {
  const raw = getComputedStyle(el)
    .getPropertyValue("--m10c-wave-duration")
    .trim()
  const value = parseFloat(raw)
  if (!Number.isFinite(value)) return FALLBACK_WAVE_MS
  return raw.endsWith("ms") ? value : value * 1000
}

export function GenerationGlow({
  active,
  streaming = false,
  tone = "light",
  fadeDelay = DEFAULT_FADE_DELAY,
  className,
  children
}: GenerationGlowProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<number[]>([])
  const rafRef = useRef<number | null>(null)
  // 初值给 false：容器在生成开始那一刻才挂载时，也能正常播一次光雾
  const prevActiveRef = useRef(false)
  const [phase, setPhase] = useState<GlowPhase>(IDLE_PHASE)

  useEffect(() => {
    const el = frameRef.current
    if (!el) return

    // 只在 active 真正翻转时编排动画，重复渲染不重播
    if (active === prevActiveRef.current) return
    prevActiveRef.current = active

    const clearScheduled = () => {
      timersRef.current.forEach((id) => window.clearTimeout(id))
      timersRef.current = []
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    const later = (fn: () => void, ms: number) => {
      timersRef.current.push(window.setTimeout(fn, ms))
    }

    clearScheduled()
    const waveMs = readWaveDuration(el)

    if (!active) {
      // 生成结束：光环先保持常亮，再靠 CSS transition 淡出；
      // 光雾若还没走完，让它自己收尾，别中途掐断
      later(() => setPhase((prev) => ({ ...prev, ring: false })), fadeDelay)
      later(
        () => setPhase(IDLE_PHASE),
        Math.max(waveMs + 400, fadeDelay + 700)
      )
      return
    }

    // 先回到空闲态、等浏览器真正提交（画到 DOM）后再挂状态类，
    // 动画才会重播——等价于原来的强制回流，只是要跨两帧才看得到提交
    setPhase(IDLE_PHASE)
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null

        // 降低动效偏好下不播光雾，直接给到终态
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setPhase({ waving: false, ring: true })
          return
        }

        setPhase({ waving: true, ring: false })

        // 光雾漫到中段时点亮光环，衔接"能量灌入"的亮度脉冲
        later(
          () => setPhase({ waving: true, ring: true }),
          waveMs * 0.45
        )
        // 光雾结束后收掉雾，光环保持常亮直到生成结束
        later(
          () => setPhase((prev) => ({ ...prev, waving: false })),
          waveMs + 400
        )
      })
    })
  }, [active, fadeDelay])

  // 卸载时清掉计时器与帧回调，避免往已卸载的组件上写状态
  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id))
      timersRef.current = []
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={frameRef}
      className={cn(
        "m10c-glow-frame",
        tone === "dark" && "m10c-is-dark",
        phase.waving && "m10c-is-waving",
        phase.waving && "m10c-is-generating",
        phase.ring && "m10c-is-ring",
        className
      )}>
      <div className="m10c-glow-wave" aria-hidden="true" />
      <div className="m10c-glow-seed" aria-hidden="true" />
      <div className="m10c-glow-ring" aria-hidden="true" />
      <div className="m10c-glow-edge" aria-hidden="true" />
      <div
        className={cn(
          "m10c-glow-content",
          streaming && "m10c-is-streaming"
        )}>
        {children}
      </div>
    </div>
  )
}

export default GenerationGlow
