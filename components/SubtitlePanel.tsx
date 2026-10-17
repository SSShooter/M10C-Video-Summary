import React, { useRef, useState, useEffect } from "react";
import { storage } from "@wxt-dev/storage";
import { GripVertical } from "lucide-react";
import brandLogoUrl from "~/assets/logo-64.png?inline";

import { Button } from "~components/ui/button";
import { Toaster } from "~components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~components/ui/tabs";
import { cn } from "~/lib/utils";
import { t, getMatchedBrowserLanguage } from "~utils/i18n";
import { useDraggable } from "~hooks/useDraggable";
import { getDefaultModel, isMindElixirModel, loadAIModelsConfig } from "~utils/ai-service";

import { MindmapDisplay, type MindmapGenerateConfig } from "./MindmapDisplay";
import { SummaryDisplay, type SummaryGenerateConfig } from "./SummaryDisplay";
import { ScrollArea } from "./ui/scroll-area";

export interface SubtitleItem {
  from?: number;
  to?: number;
  start?: number;
  dur?: number;
  content?: string;
  text?: string;
}

// 自动跟踪开关的持久化键
const AUTO_TRACK_STORAGE_KEY = "local:subtitle_auto_track";

// Use VideoInfo from subtitle-utils

export interface SubtitlePanelProps {
  subtitles: SubtitleItem[];
  loading: boolean;
  error: string | null;
  videoInfo: VideoInfo | null;
  onJumpToTime: (time: number) => void;
  platform: "bilibili" | "youtube";
  onClose: () => void;
  defaultTab?: "subtitles" | "summary" | "mindmap";
  className?: string;
  style?: React.CSSProperties;
  disableDrag?: boolean;
}

export function SubtitlePanel({
  subtitles,
  loading,
  error,
  videoInfo,
  onJumpToTime,
  platform,
  onClose,
  defaultTab = "subtitles",
  className,
  style,
  disableDrag = false,
}: SubtitlePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { onMouseDown, isPositionLoaded } = useDraggable(
    panelRef,
    disableDrag ? undefined : "video_panel_pos"
  );
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [isByok, setIsByok] = useState(false);
  const [configuredLanguage, setConfiguredLanguage] = useState<string | null>(null);
  const [autoTrack, setAutoTrack] = useState(false);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState(-1);
  const subtitleListRef = useRef<HTMLDivElement>(null);
  const subtitleItemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const currentUrl = window.location.href;

  // 读取上次保存的自动跟踪开关状态（默认关闭）
  useEffect(() => {
    storage
      .getItem<boolean>(AUTO_TRACK_STORAGE_KEY)
      .then((saved) => {
        if (typeof saved === "boolean") setAutoTrack(saved);
      })
      .catch(() => {});
  }, []);

  // Detect BYOK and get configured reply language
  useEffect(() => {
    loadAIModelsConfig().then((config) => {
      if (!config) return;
      const model = getDefaultModel(config);
      if (model && !isMindElixirModel(model)) {
        setIsByok(true);
      } else {
        setIsByok(false);
      }

      let lang = config.replyLanguage;
      if (!lang || lang === "auto") {
        lang = getMatchedBrowserLanguage();
      }
      setConfiguredLanguage(lang);
    }).catch(() => {});
  }, []);

  // 获取思维导图缓存键
  const getMindmapCacheKey = () => {
    if (platform === "bilibili" && videoInfo?.bvid) {
      return `mindmap_${videoInfo.bvid}`;
    } else if (platform === "youtube" && videoInfo?.videoId) {
      return `mindmap_${videoInfo.videoId}`;
    }
    return undefined;
  };

  // 获取AI总结缓存键
  const getSummaryCacheKey = () => {
    if (platform === "bilibili" && videoInfo?.bvid) {
      return `summary_${videoInfo.bvid}`;
    } else if (platform === "youtube" && videoInfo?.videoId) {
      return `summary_${videoInfo.videoId}`;
    }
    return undefined;
  };

  // 格式化时间
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 获取字幕时间
  const getSubtitleTime = (subtitle: SubtitleItem) => {
    if (platform === "bilibili") {
      return {
        start: subtitle.from || 0,
        end: subtitle.to || 0,
      };
    } else {
      return {
        start: subtitle.start || 0,
        end: (subtitle.start || 0) + (subtitle.dur || 0),
      };
    }
  };

  // 获取字幕内容
  const getSubtitleContent = (subtitle: SubtitleItem) => {
    return subtitle.content || subtitle.text || "";
  };

  // 获取所有字幕文本
  const getAllSubtitlesText = () => {
    if (subtitles.length === 0) return null;
    return subtitles
      .map((subtitle) => getSubtitleContent(subtitle))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  };

  // 切换自动跟踪开关并持久化
  const toggleAutoTrack = () => {
    setAutoTrack((prev) => {
      const next = !prev;
      storage.setItem(AUTO_TRACK_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  };

  // 自动跟踪：跟随 <video> 播放进度定位当前字幕
  useEffect(() => {
    if (!autoTrack || activeTab !== "subtitles" || subtitles.length === 0) return;

    const updateActiveIndex = () => {
      const video = document.querySelector("video") as HTMLVideoElement | null;
      if (!video || video.paused) return;
      const currentTime = video.currentTime;
      if (!Number.isFinite(currentTime)) return;

      let index = -1;
      for (let i = 0; i < subtitles.length; i++) {
        if (getSubtitleTime(subtitles[i]).start <= currentTime) {
          index = i;
        } else {
          break;
        }
      }
      setActiveSubtitleIndex((prev) => (prev === index ? prev : index));
    };

    updateActiveIndex();
    const timer = window.setInterval(updateActiveIndex, 400);
    return () => window.clearInterval(timer);
  }, [autoTrack, activeTab, subtitles]);

  // 自动跟踪：把当前字幕滚动到列表中部（已在中部区间内则不打扰阅读）
  useEffect(() => {
    if (!autoTrack || activeTab !== "subtitles" || activeSubtitleIndex < 0) return;
    const container = subtitleListRef.current;
    const item = subtitleItemRefs.current[activeSubtitleIndex];
    if (!container || !item) return;

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]"
    );
    if (!viewport) return;

    const viewportRect = viewport.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const upperBound = viewportRect.top + viewportRect.height * 0.2;
    const lowerBound = viewportRect.bottom - viewportRect.height * 0.2;

    if (itemRect.top >= upperBound && itemRect.bottom <= lowerBound) return;

    const delta =
      itemRect.top - viewportRect.top - (viewportRect.height - itemRect.height) / 2;
    viewport.scrollTo({
      top: viewport.scrollTop + delta,
      behavior: "smooth",
    });
  }, [autoTrack, activeTab, activeSubtitleIndex]);

  // AI总结生成配置
  const summaryGenerateConfig: SummaryGenerateConfig = {
    getContent: getAllSubtitlesText,
    additionalData: {},
  };

  // 思维导图生成配置
  const mindmapGenerateConfig: MindmapGenerateConfig = {
    action: "generateMindmapStream",
    getContent: getAllSubtitlesText,
    getTitle: () => videoInfo?.title || "",
    additionalData: {
      // Passed to background script so it can include in the LLM request body
      // for backend caching (only used by Mind Elixir model, stripped otherwise)
      videoUrl: currentUrl,
      language: configuredLanguage,
    },
  };

  return (
    <div
      ref={panelRef}
      className={cn(
        "w-[350px] h-[600px] bg-white border border-gray-300 rounded p-2 shadow-lg fixed top-[80px] right-[20px] z-[9999] overflow-hidden flex flex-col",
        className
      )}
      style={{ visibility: isPositionLoaded ? "visible" : "hidden", ...style }}
    >
      <div className="mb-[12px]">
        <div className="flex justify-between items-center mb-[8px]">
          <div className="flex items-center gap-[6px] select-none">
            <img
              src={brandLogoUrl}
              alt="M10C"
              className="w-[20px] h-[20px] rounded-[5px] shadow-sm"
              draggable={false}
            />
            <h3 className="m-0 text-[16px] font-semibold text-gray-900">
              {platform === "bilibili"
                ? t("videoAssistant")
                : t("youtubeSubtitle")}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 cursor-grab active:cursor-grabbing text-gray-500"
              onMouseDown={onMouseDown}
              title={t("drag")}
            >
              <GripVertical className="w-4 h-4" />
            </Button>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 text-gray-500"
              title={t("close")}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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
        {videoInfo && (
          <div className="text-[12px] text-gray-600 leading-relaxed">
            {videoInfo.title}
          </div>
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="subtitles">{t("subtitles")}</TabsTrigger>
          <TabsTrigger value="summary">{t("aiSummary")}</TabsTrigger>
          <TabsTrigger value="mindmap">{t("mindmap")}</TabsTrigger>
        </TabsList>

        <TabsContent
          value="subtitles"
          forceMount={true}
          className={cn(
            "overflow-hidden mt-2 flex-1 flex flex-col",
            activeTab !== "subtitles" && "hidden",
          )}
        >
          {loading && (
            <div className="text-center p-[20px] text-gray-600">
              {t("loading")}
            </div>
          )}

          {error && (
            <div className="text-center p-[20px]">
              <div className="text-red-500 mb-4">{error}</div>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {t("refreshPage")}
              </Button>
            </div>
          )}

          {subtitles.length > 0 && (
            <div ref={subtitleListRef} className="flex-1 min-h-0 flex flex-col">
              <div className="flex h-8 shrink-0 items-center justify-between rounded-md bg-gray-50 px-2 mb-2 select-none">
                <span className="text-[12px] text-gray-600">{t("autoTrack")}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoTrack}
                  aria-label={t("autoTrack")}
                  title={t("autoTrackHint")}
                  onClick={toggleAutoTrack}
                  className={cn(
                    "relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1",
                    autoTrack ? "bg-blue-500" : "bg-gray-300"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-[14px] w-[14px] rounded-full bg-white shadow transition-transform duration-200",
                      autoTrack ? "translate-x-[16px]" : "translate-x-[2px]"
                    )}
                  />
                </button>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                {subtitles.map((subtitle, index) => {
                  const time = getSubtitleTime(subtitle);
                  const content = getSubtitleContent(subtitle);
                  const isActive = autoTrack && index === activeSubtitleIndex;
                  return (
                    <div
                      key={index}
                      ref={(el) => {
                        subtitleItemRefs.current[index] = el;
                      }}
                      className={cn(
                        "py-[8px] border-b border-gray-100 cursor-pointer transition-colors duration-200 hover:bg-gray-50",
                        isActive && "bg-blue-50"
                      )}
                      onClick={() => onJumpToTime(time.start)}
                    >
                      <div
                        className={cn(
                          "text-[12px] mb-[4px] font-medium",
                          isActive ? "text-blue-600" : "text-blue-500"
                        )}
                      >
                        {formatTime(time.start)} - {formatTime(time.end)}
                      </div>
                      <div className="text-[14px] text-gray-900 leading-relaxed">
                        {content}
                      </div>
                    </div>
                  );
                })}
              </ScrollArea>
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="summary"
          forceMount={true}
          className={cn(
            "overflow-hidden mt-2 flex-1 flex flex-col",
            activeTab !== "summary" && "hidden",
          )}
        >
          <SummaryDisplay
            generateConfig={summaryGenerateConfig}
            cacheKey={getSummaryCacheKey()}
          />
        </TabsContent>

        <TabsContent
          value="mindmap"
          forceMount={true}
          className={cn(
            "overflow-hidden mt-2 flex-1 flex flex-col",
            activeTab !== "mindmap" && "hidden",
          )}
        >
          <MindmapDisplay
            panelRef={panelRef}
            generateConfig={mindmapGenerateConfig}
            cacheKey={getMindmapCacheKey()}
            show={activeTab === "mindmap"}
            videoUrl={currentUrl}
            isByok={isByok}
            language={configuredLanguage}
          />
        </TabsContent>
      </Tabs>
      <Toaster />
    </div>
  );
}
