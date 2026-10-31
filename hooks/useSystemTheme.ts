import { useEffect, useState } from "react"

export type ColorScheme = "light" | "dark"

const DARK_QUERY = "(prefers-color-scheme: dark)"

function getSystemScheme(): ColorScheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light"
}

/**
 * 跟随系统外观。注入面板挂在宿页面里，不能沿用宿站点的配色，
 * 所以自己读 prefers-color-scheme，并在系统切换时同步更新。
 */
export function useSystemTheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(getSystemScheme)

  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_QUERY)
    const update = (event: MediaQueryListEvent) => {
      setScheme(event.matches ? "dark" : "light")
    }

    // 首帧到 effect 之间系统可能已经切过，这里补一次
    setScheme(mediaQuery.matches ? "dark" : "light")
    mediaQuery.addEventListener("change", update)
    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  return scheme
}
