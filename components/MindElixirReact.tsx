import type { MindElixirData, MindElixirInstance, Options } from "mind-elixir"
import MindElixir from "mind-elixir"
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react"

export type MindmapThemeType = "light" | "dark"

/**
 * MindElixir 构造时自己也读 prefers-color-scheme，这里保持一致，
 * 供外部在实例挂载前就能取到初值（否则光效会先按浅色闪一下再翻深色）。
 */
export function getMindmapThemeType(): MindmapThemeType {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

interface MindElixirReactProps {
  data: MindElixirData
  options?: Partial<Options>
  plugins?: any[]
  initScale?: number
  className?: string
  fitPage?: boolean
  /** 实例实际使用的主题变化时回调，供外部（如光效）跟随画布深浅 */
  onThemeChange?: (type: MindmapThemeType) => void
}

export interface MindElixirReactRef {
  instance: MindElixirInstance | null
}

const MindElixirReact = forwardRef<MindElixirReactRef, MindElixirReactProps>(
  (
    { data, options, plugins, initScale, className, fitPage, onThemeChange },
    ref
  ) => {
    const mindmapEl = useRef<HTMLDivElement>(null)
    const meInstance = useRef<MindElixirInstance | null>(null)
    const isInitialized = useRef<boolean>(false)
    // 用 ref 转存，避免调用方传内联函数时把实例重建掉
    const onThemeChangeRef = useRef(onThemeChange)
    onThemeChangeRef.current = onThemeChange

    useImperativeHandle(ref, () => ({
      instance: meInstance.current
    }))

    const sanitizeNodeData = (nodeData: MindElixirData["nodeData"]) => {
      if (!nodeData) return
      if (nodeData.children) {
        for (const child of nodeData.children) {
          sanitizeNodeData(child)
        }
      }
    }

    // Load MindElixir dynamically and initialize
    useEffect(() => {
      if (!mindmapEl.current || typeof window === "undefined") return

      const initializeMindElixir = async () => {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
        const changeTheme = (e: MediaQueryListEvent) => {
          const next = e.matches ? MindElixir.DARK_THEME : MindElixir.THEME
          meInstance.current?.changeTheme(next)
          onThemeChangeRef.current?.(next.type as MindmapThemeType)
        }

        const mergedOptions = {
          ...(options || {}),
          el: mindmapEl.current!
        }

        meInstance.current = new MindElixir(mergedOptions)

        // 构造时 MindElixir 已按系统偏好选好主题，这里回报一次实际值
        onThemeChangeRef.current?.(
          meInstance.current.theme.type as MindmapThemeType
        )

        // Install plugins
        if (plugins) {
          for (const plugin of plugins) {
            meInstance.current?.install(plugin)
          }
        }

        // Set initial scale
        if (initScale && meInstance.current) {
          meInstance.current.scaleVal = initScale
          meInstance.current.map.style.transform = `scale(${initScale})`
        }

        if (meInstance.current) {
          meInstance.current.map.style.opacity = "0"
        }

        mediaQuery.addEventListener("change", changeTheme)
        isInitialized.current = true

        // Initialize with data if available
        if (data && meInstance.current) {
          sanitizeNodeData(data.nodeData)
          meInstance.current.init(data)
          meInstance.current.toCenter()
          meInstance.current.scale(0.5)
          fitPage && meInstance.current.scaleFit()
          meInstance.current.map.style.opacity = "1"
        }

        // Return cleanup function
        return () => {
          mediaQuery.removeEventListener("change", changeTheme)
        }
      }

      let cleanup: (() => void) | undefined
      initializeMindElixir().then((cleanupFn) => {
        cleanup = cleanupFn
      })

      return () => {
        cleanup?.()
      }
    }, [options, plugins, initScale])

    // Data update effect
    useEffect(() => {
      if (!data || !meInstance.current || !isInitialized.current) return

      sanitizeNodeData(data.nodeData)
      meInstance.current.refresh(data)
      const getLastNode = (
        node: MindElixirData["nodeData"]
      ): MindElixirData["nodeData"] => {
        if (node.children && node.children.length > 0) {
          return getLastNode(node.children[node.children.length - 1])
        }
        return node
      }
      const lastNode = getLastNode(data.nodeData)
      if (lastNode.id) {
        const lastNodeEle = meInstance.current.findEle(lastNode.id)
        if (lastNodeEle) {
          meInstance.current.scrollIntoView(lastNodeEle)
        }
      }
    }, [data, fitPage])

    return (
      <div
        style={{
          height: "100%",
          width: "100%"
        }}
        ref={mindmapEl}
        className={className}
      />
    )
  }
)

MindElixirReact.displayName = "MindElixirReact"

export default MindElixirReact
