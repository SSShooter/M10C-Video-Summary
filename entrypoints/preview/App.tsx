import React, { useState, useRef, useEffect } from "react"
import { storage } from "@wxt-dev/storage"
import { MindmapDisplay } from "~/components/MindmapDisplay"
import { SummaryDisplay } from "~/components/SummaryDisplay"
import { SubtitlePanel } from "~/components/SubtitlePanel"
import { mockMindmapData, mockSummaryMarkdown, mockSubtitles } from "./mockData"

export default function App() {
  const [seeded, setSeeded] = useState(false)
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null
  const initialView = (urlParams?.get("view") as any) || "mindmap"
  const panelTabParam = urlParams?.get("tab") || "mindmap"
  const initialMode = urlParams?.get("mode") || (urlParams?.get("full") === "1" ? "full" : "card")
  const [activeView, setActiveView] = useState<"panel" | "mindmap" | "summary">(initialView)
  const [panelMode, setPanelMode] = useState<"card" | "full">(initialMode as any)
  const mindmapPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeView === "panel" && panelTabParam) {
      const timer = setTimeout(() => {
        const tabs = Array.from(document.querySelectorAll<HTMLElement>('button[role="tab"], [data-radix-collection-item]'))
        const target = tabs.find((el) => {
          const text = el.textContent || ""
          if (panelTabParam === "mindmap") return text.includes("思维导图")
          if (panelTabParam === "summary") return text.includes("总结")
          if (panelTabParam === "subtitles") return text.includes("字幕")
          return false
        })
        if (target) target.click()
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [activeView, panelTabParam])


  useEffect(() => {
    async function seed() {
      try {
        console.log("Seeding storage...")
        await storage.setItem("local:preview_mindmap", {
          mindmapData: mockMindmapData,
          timestamp: Date.now()
        })
        await storage.setItem("local:mindmap_preview", {
          mindmapData: mockMindmapData,
          timestamp: Date.now()
        })
        await storage.setItem("local:preview_summary", {
          content: mockSummaryMarkdown,
          timestamp: Date.now()
        })
        await storage.setItem("local:summary_preview", {
          content: mockSummaryMarkdown,
          timestamp: Date.now()
        })
        console.log("Seeded storage successfully!")
        setSeeded(true)
      } catch (err) {
        console.error("Seed error:", err)
        setSeeded(true)
      }
    }
    seed()
  }, [])

  if (!seeded) {
    return <div className="p-6 text-sm text-slate-500">正在准备 Mock 缓存...</div>
  }

  const isPure = urlParams?.get("pure") === "1"
  const isFull = panelMode === "full"

  const containerClasses = isPure
    ? isFull
      ? "w-screen h-screen bg-white m-0 p-0 overflow-hidden"
      : "min-h-screen bg-slate-50 text-slate-900 p-0 flex items-center justify-center"
    : "min-h-screen bg-slate-50 text-slate-900 p-6"

  return (
    <div className={containerClasses}>
      {/* 顶部简易切换 */}
      {!isPure && (
        <div className="max-w-6xl mx-auto mb-6 flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveView("mindmap")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeView === "mindmap"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              原生思维导图组件 (MindmapDisplay)
            </button>
            <button
              onClick={() => setActiveView("summary")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeView === "summary"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              原生 AI 总结组件 (SummaryDisplay)
            </button>
            <button
              onClick={() => setActiveView("panel")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeView === "panel"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              原生完整面板组件 (SubtitlePanel)
            </button>

            {activeView === "panel" && (
              <div className="ml-4 flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button
                  onClick={() => setPanelMode("card")}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    panelMode === "card"
                      ? "bg-white text-indigo-700 shadow-sm font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  卡片悬浮模式 (带外边距与圆角)
                </button>
                <button
                  onClick={() => setPanelMode("full")}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    panelMode === "full"
                      ? "bg-white text-indigo-700 shadow-sm font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  全图直角模式 (无圆角全屏)
                </button>
              </div>
            )}
          </div>
          <span className="text-xs text-slate-400 font-medium">
            M10C 原生 TSX 组件挂载 • Mock 数据
          </span>
        </div>
      )}

      <div className={isPure ? (isFull ? "w-full h-full" : "w-full flex items-center justify-center") : "max-w-6xl mx-auto"}>
        {/* 1. 原生 MindmapDisplay 组件 */}
        {activeView === "mindmap" && (
          <div
            id="capture-mindmap"
            ref={mindmapPanelRef}
            className="w-full h-[650px] bg-white border border-slate-200 rounded-xl shadow-lg p-4 flex flex-col"
          >
            <MindmapDisplay
              panelRef={mindmapPanelRef}
              cacheKey="preview_mindmap"
              show={true}
              videoUrl="https://www.bilibili.com/video/BVpreview"
              isByok={true}
            />
          </div>
        )}

        {/* 2. 原生 SummaryDisplay 组件 */}
        {activeView === "summary" && (
          <div
            id="capture-summary"
            className="max-w-3xl mx-auto h-[650px] bg-white border border-slate-200 rounded-xl shadow-lg p-6 flex flex-col"
          >
            <SummaryDisplay cacheKey="preview_summary" />
          </div>
        )}

        {/* 3. 原生 SubtitlePanel 组件 */}
        {activeView === "panel" && (
          isFull ? (
            <div
              id="capture-panel"
              className={isPure ? "w-full h-full overflow-hidden" : "w-[500px] h-[750px] mx-auto border border-slate-200 overflow-hidden shadow-sm"}
            >
              <SubtitlePanel
                subtitles={mockSubtitles}
                loading={false}
                error={null}
                videoInfo={{
                  bvid: "preview",
                  cid: 1,
                  title: "AI 赋能的现代软件工程与架构演进"
                }}
                onJumpToTime={() => {}}
                platform="bilibili"
                onClose={() => {}}
                defaultTab={(panelTabParam as any) || "subtitles"}
                disableDrag={true}
                className="w-full h-full static top-auto right-auto m-0 rounded-none border-0 shadow-none p-3.5"
                style={{
                  position: "static",
                  width: "100%",
                  height: "100%",
                  borderRadius: 0,
                  border: "none",
                  boxShadow: "none",
                  margin: 0
                }}
              />
            </div>
          ) : (
            <div id="capture-panel" className="flex items-center justify-center">
              <SubtitlePanel
                subtitles={mockSubtitles}
                loading={false}
                error={null}
                videoInfo={{
                  bvid: "preview",
                  cid: 1,
                  title: "AI 赋能的现代软件工程与架构演进"
                }}
                onJumpToTime={() => {}}
                platform="bilibili"
                onClose={() => {}}
                defaultTab={(panelTabParam as any) || "subtitles"}
                disableDrag={true}
                className="static top-auto right-auto m-0 shadow-xl"
                style={{ position: "static", margin: "0 auto" }}
              />
            </div>
          )
        )}
      </div>
    </div>
  )
}
