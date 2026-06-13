import iconBase64 from "~/assets/icon.png"
import { useEffect, useState } from "react"
import { storage } from "@wxt-dev/storage"

import { Button } from "~/components/ui/button"
import type { AIConfig } from "~/utils/ai-service"
import { t } from "~/utils/i18n"

function IndexPopup() {
  const [aiEnabled, setAiEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  const [isVideoPage, setIsVideoPage] = useState(false)
  const [isArticlePage, setIsArticlePage] = useState(false)
  const [panelTriggering, setPanelTriggering] = useState(false)

  useEffect(() => {
    console.log("Popup mounted");
    loadAIStatus()
    getCurrentPageInfo()
  }, [])

  const loadAIStatus = async () => {
    try {
      console.log("Loading AI status...");
      const config = await storage.getItem<AIConfig>("local:aiConfigV2")
      console.log("AI Config:", config);
      if (!config) return;
      // mind-elixir provider uses the built-in backend — no API key needed.
      // If there is no saved config at all, background also falls back to the
      // built-in endpoint, so treat that as enabled too.
      const isMindElixirProvider =
        !config || config.activeProvider === "mind-elixir"
      // 检查是否有配置的API密钥
      const hasApiKey =
        config?.providers?.[config.activeProvider]?.apiKey
      setAiEnabled(isMindElixirProvider || !!hasApiKey)
    } catch (error) {
      console.error("加载AI配置失败:", error)
    } finally {
      setLoading(false)
    }
  }

  const getCurrentPageInfo = async () => {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs) {
        console.warn("chrome.tabs is not available");
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          const url = tabs[0].url
          console.log("Current URL:", url);

          // 检测是否为视频页面
          const isVideo =
            url.includes("youtube.com/watch") ||
            url.includes("bilibili.com/video") ||
            url.includes("bilibili.com/list/watchlater")
          setIsVideoPage(isVideo)

          // 检测是否为文章页面（排除视频网站）
          const isArticle =
            !isVideo &&
            !url.includes("youtube.com") &&
            !url.includes("bilibili.com") &&
            !url.startsWith("chrome://") &&
            !url.startsWith("chrome-extension://")
          setIsArticlePage(isArticle)
        }
      })
    } catch (error) {
      console.error("获取页面信息失败:", error)
    }
  }

  const triggerPanel = async () => {
    try {
      setPanelTriggering(true)
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          console.log("Sending message to tab:", tabs[0].id, "isVideoPage:", isVideoPage, "isArticlePage:", isArticlePage);
          if (isVideoPage) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "SHOW_SUBTITLE_PANEL"
            })
          }
          if (isArticlePage) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "SHOW_ARTICLE_MINDMAP_PANEL"
            })
          }
        }
      })

      // 延迟关闭popup，让用户看到启动状态
      setTimeout(() => {
        window.close()
      }, 500)
    } catch (error) {
      console.error("显示面板失败:", error)
      setPanelTriggering(false)
    }
  }

  const openOptionsPage = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") })
  }

  const getPageTypeInfo = () => {
    if (isVideoPage) {
      return {
        type: t("videoPage"),
        icon: "🎥",
        description: t("videoPageDescription"),
        actionText: t("startSubtitlePanel"),
        available: true
      }
    } else if (isArticlePage) {
      return {
        type: t("articlePage"),
        icon: "📄",
        description: t("articlePageDescription"),
        actionText: t("generateMindmap"),
        available: true
      }
    } else {
      return {
        type: t("unsupportedPage"),
        icon: "❌",
        description: t("unsupportedPageDescription"),
        actionText: t("cannotUse"),
        available: false
      }
    }
  }

  const pageInfo = getPageTypeInfo()

  return (
    <div className="w-96 bg-blue-100">
      {/* 头部区域 */}
      <div className="bg-gradient-to-r from-purple-950 to-indigo-950 p-3 text-white">
        <div className="flex items-center mb-2">
          <img
            src={iconBase64}
            alt="Video Mindmap"
            className="w-8 h-8 mr-2 rounded-lg shadow-lg"
          />
          <div>
            <h1 className="m-0 text-base font-semibold">{t("popupTitle")}</h1>
            <p className="m-0 text-xs text-purple-100">{t("popupSubtitle")}</p>
          </div>
        </div>

        {/* 页面类型指示器 */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-lg mr-2">{pageInfo.icon}</span>
              <div>
                <div className="text-xs font-medium">{pageInfo.type}</div>
                <div className="text-xs text-purple-100">
                  {pageInfo.description}
                </div>
              </div>
            </div>
            <div
              className={`w-2 h-2 rounded-full ${pageInfo.available ? "bg-green-400" : "bg-red-400"}`}></div>
          </div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="p-3">
        {/* AI状态卡片 */}
        <div className="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <div className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center mr-2">
                <span className="text-purple-600 text-xs">🤖</span>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-800">
                  {t("aiServiceStatus")}
                </div>
                <div className="text-xs text-gray-500">
                  {t("intelligentAnalysis")}
                </div>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center">
                <div className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mr-1"></div>
                <span className="text-xs text-gray-600">{t("detecting")}</span>
              </div>
            ) : (
              <div
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  aiEnabled
                    ? "bg-green-100 text-green-700 border border-green-200"
                    : "bg-orange-100 text-orange-700 border border-orange-200"
                }`}>
                {aiEnabled ? t("configured") : t("notConfigured")}
              </div>
            )}
          </div>

          {!aiEnabled && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
              <div className="text-xs text-orange-700">
                {t("configureAiTip")}
              </div>
            </div>
          )}
        </div>

        {/* 快速操作区域 */}
        <div className="space-y-2">
          <Button
            onClick={triggerPanel}
            disabled={!pageInfo.available || panelTriggering}
            variant={pageInfo.available ? "default" : "secondary"}
            className="w-full">
            {panelTriggering ? (
              <>
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                <span>{t("starting")}</span>
              </>
            ) : (
              <>
                <span>{pageInfo.actionText}</span>
              </>
            )}
          </Button>

          <Button
            onClick={openOptionsPage}
            variant="outline"
            className="w-full">
            <span>
              {aiEnabled ? t("aiConfigManagement") : t("configureAiService")}
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default IndexPopup
