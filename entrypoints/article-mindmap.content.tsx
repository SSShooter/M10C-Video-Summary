import ReactDOM from "react-dom/client"
import { useEffect, useRef, useState } from "react"
import { cn } from "~/lib/utils"
import {
  MindmapDisplay,
  type MindmapGenerateConfig
} from "~/components/MindmapDisplay"
import {
  SummaryDisplay,
  type SummaryGenerateConfig
} from "~/components/SummaryDisplay"
import { Button } from "~/components/ui/button"
import { Toaster } from "~/components/ui/sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { GripVertical } from "lucide-react"
import { useDraggable } from "~/hooks/useDraggable"
import { detectArticle, type ArticleInfo } from "~/utils/article-detector"
import { detectAndConvertArticle } from "~/utils/html-to-markdown"
import { t } from "~/utils/i18n"
import mainStyles from "@/assets/style.css?inline"
import elixirStyles from "mind-elixir/style.css?inline"
import overrideStyles from "@/assets/mind-elixir-override.css?inline"
import sonnerStyles from "sonner/dist/styles.css?inline"

function ArticleMindmapPanelContent({
  articleInfo,
  setIsVisible
}: {
  articleInfo: ArticleInfo
  setIsVisible: (v: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState("summary")
  const panelRef = useRef<HTMLDivElement>(null)
  const { onMouseDown, isPositionLoaded } = useDraggable(panelRef, "article_panel_pos")

  // 获取文章内容
  const getArticleContent = () => {
    if (!articleInfo) return null

    // 使用智能HTML到Markdown转换
    let markdownContent = detectAndConvertArticle()

    // 如果智能检测失败，使用原始文本内容
    if (!markdownContent) {
      markdownContent = articleInfo.content
    }

    return markdownContent
  }

  // AI总结生成配置
  const summaryGenerateConfig: SummaryGenerateConfig = {
    getContent: getArticleContent,
    getTitle: () => articleInfo?.title || "",
    additionalData: {}
  }

  // 思维导图生成配置
  const mindmapGenerateConfig: MindmapGenerateConfig = {
    action: "generateArticleMindmapStream",
    getContent: getArticleContent,
    getTitle: () => articleInfo?.title || "",
    additionalData: {}
  }

  // 获取AI总结缓存键
  const getSummaryCacheKey = () => {
    if (!articleInfo) return undefined
    return `summary_${btoa(articleInfo.url)}`
  }

  // 获取思维导图缓存键
  const getMindmapCacheKey = () => {
    if (!articleInfo) return undefined
    return `mindmap_${btoa(articleInfo.url)}`
  }

  return (
    <div
      ref={panelRef}
      className="w-[350px] h-[600px] bg-white border border-gray-300 rounded p-2 shadow-lg fixed top-[80px] right-[20px] z-[9999] overflow-hidden flex flex-col"
      style={{ visibility: isPositionLoaded ? "visible" : "hidden" }}>
      <div className="mb-[12px]">
        <div className="flex justify-between items-center mb-[8px]">
          <h3 className="m-0 text-[16px] font-semibold text-gray-900 select-none">
            {t("articleAssistant")}
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 cursor-grab active:cursor-grabbing text-gray-500"
              onMouseDown={onMouseDown}
              title={t("drag")}>
              <GripVertical className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => setIsVisible(false)}
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 text-gray-500"
              title={t("close")}>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </Button>
          </div>
        </div>
        <div className="text-[12px] text-gray-600 leading-relaxed">
          {articleInfo.title}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="summary">{t("aiSummary")}</TabsTrigger>
          <TabsTrigger value="mindmap">{t("mindmap")}</TabsTrigger>
        </TabsList>

        <TabsContent 
          value="summary" 
          forceMount={true}
          className={cn(
            "overflow-hidden mt-2",
            activeTab !== "summary" && "hidden"
          )}>
          <SummaryDisplay
            generateConfig={summaryGenerateConfig}
            cacheKey={getSummaryCacheKey()}
            publishSource={{
              sourceUrl: articleInfo.url,
              title: articleInfo.title
            }}
            noSummaryText={t("noAiSummary")}
            generatePromptText={t("clickToGenerateArticleSummary")}
          />
        </TabsContent>

        <TabsContent 
          value="mindmap" 
          forceMount={true}
          className={cn(
            "overflow-hidden mt-2",
            activeTab !== "mindmap" && "hidden"
          )}>
          <MindmapDisplay
            panelRef={panelRef}
            generateConfig={mindmapGenerateConfig}
            cacheKey={getMindmapCacheKey()}
            show={activeTab === "mindmap"}
          />
        </TabsContent>
      </Tabs>
      <Toaster />
    </div>
  )
}

function ArticleMindmapPanel() {
  const [articleInfo, setArticleInfo] = useState<ArticleInfo | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  // 监听来自popup的消息
  useEffect(() => {
    const messageListener = (message: any) => {
      console.log("Article content script received message:", message);
      if (message.type === "SHOW_ARTICLE_MINDMAP_PANEL") {
        console.log("Setting Article panel to visible");
        setIsVisible(true)
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)
    return () => chrome.runtime.onMessage.removeListener(messageListener)
  }, [articleInfo])

  // 初始化检测文章信息（但不显示面板）
  useEffect(() => {
    const initDetection = async () => {
      try {
        const detected = detectArticle()
        if (detected) {
          setArticleInfo(detected)
        }
      } catch (error) {
        console.error(t("articleDetectionFailed"), error)
      }
    }

    // 延迟执行，确保页面加载完成
    const timer = setTimeout(initDetection, 2000)
    return () => clearTimeout(timer)
  }, [])

  if (!isVisible || !articleInfo) {
    return null
  }

  return (
    <ArticleMindmapPanelContent
      articleInfo={articleInfo}
      setIsVisible={setIsVisible}
    />
  )
}

export default defineContentScript({
  matches: ["<all_urls>"],
  excludeMatches: [
    "https://www.youtube.com/*",
    "https://www.bilibili.com/*",
    "https://youtube.com/*"
  ],
  async main(ctx) {
    console.log("Article content script main started");
    const ui = await createShadowRootUi(ctx, {
      name: "article-mindmap-panel",
      position: "overlay",
      zIndex: 2147483647,
      css: `${mainStyles}${elixirStyles}${overrideStyles}${sonnerStyles}`,
      onMount: (container) => {
        console.log("Article UI mounting...");
        const root = ReactDOM.createRoot(container)
        root.render(<ArticleMindmapPanel />)
        return root
      },
      onRemove: (root) => {
        root?.unmount()
      }
    })
    ui.mount()
    console.log("Article UI mounted");
  }
})
