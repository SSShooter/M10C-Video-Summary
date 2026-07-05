import ReactDOM from "react-dom/client"
import { useEffect, useState } from "react"
import { SubtitlePanel } from "~/components/SubtitlePanel"
import { t } from "~/utils/i18n"
import mainStyles from "@/assets/style.css?inline"
import elixirStyles from "mind-elixir/style.css?inline"
import overrideStyles from "@/assets/mind-elixir-override.css?inline"
import sonnerStyles from "sonner/dist/styles.css?inline"


interface SubtitleItem {
  from: number
  to: number
  content: string
}

interface VideoInfo {
  bvid: string
  cid: number
  title: string
}

function BilibiliSubtitlePanel() {
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [currentBvid, setCurrentBvid] = useState<string | null>(null)

  // 从URL中提取BVID
  const extractBVID = (): string | null => {
    const url = window.location.href
    // 匹配标准视频页面 /video/BVxxxxxx
    const videoMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/)
    if (videoMatch) {
      return videoMatch[1]
    }
    // 匹配稍后再看等页面的 bvid 参数
    const bvidMatch = url.match(/[?&]bvid=(BV[a-zA-Z0-9]+)/)
    return bvidMatch ? bvidMatch[1] : null
  }

  // 获取视频信息
  const fetchVideoInfo = async (bvid: string): Promise<VideoInfo | null> => {
    try {
      const response = await fetch(
        `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
      )
      const data = await response.json()

      if (data.code === 0 && data.data) {
        return {
          bvid: bvid,
          cid: data.data.cid,
          title: data.data.title
        }
      }
      return null
    } catch (error) {
      console.error(t("getVideoInfoFailed"), error)
      return null
    }
  }

  // 获取用户cookies和必要的认证信息
  const getCookies = (): string => {
    return document.cookie
  }

  // 从页面 __playinfo__ 中提取音频 URL
  const getAudioUrlFromPlayInfo = async (): Promise<string | null> => {
    try {
      // 方式1：通过 Background Script 的 chrome.scripting.executeScript 读取主页面 window.__playinfo__ 属性（绕过 CSP）
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ action: "getBilibiliPlayInfo" }, (res) => {
          resolve(res)
        })
      })
      let playInfo = response?.success ? response.data : null

      if (!playInfo) {
        console.log("[Audio] 未获取到 __playinfo__")
        return null
      }

      console.log("[Audio] __playinfo__ 顶层 key:", Object.keys(playInfo))
      const dash = playInfo?.data?.dash
      if (!dash) {
        console.log("[Audio] 无 dash 数据，data keys:", Object.keys(playInfo?.data || {}))
        return null
      }

      const audioList = dash.audio
      console.log("[Audio] audio 数组长度:", audioList?.length)

      if (!audioList || audioList.length === 0) {
        console.log("[Audio] 无音频流，dash keys:", Object.keys(dash))
        return null
      }

      const audioUrl = audioList[0].baseUrl || audioList[0].base_url
      console.log("✅ 成功提取 B 站音频直链:", audioUrl)
      return audioUrl
    } catch (error) {
      console.error("[Audio] 解析 __playinfo__ 失败:", error)
      return null
    }
  }

  // 获取字幕数据
  const fetchSubtitles = async (bvid: string, cid: number) => {
    try {
      setLoading(true)
      setError(null)

      console.log("开始获取字幕，BVID:", bvid, "CID:", cid)

      // 构建请求头，包含用户认证信息
      const headers: HeadersInit = {
        "User-Agent": navigator.userAgent,
        Referer: window.location.href,
        Origin: "https://www.bilibili.com"
      }

      // 获取cookies
      const cookies = getCookies()
      if (cookies) {
        headers["Cookie"] = cookies
      }

      console.log("请求头:", headers)

      // 获取字幕列表 - 使用更完整的参数
      const playerUrl = `https://api.bilibili.com/x/player/wbi/v2?bvid=${bvid}&cid=${cid}&qn=64&fnver=0&fnval=4048&fourk=1`
      console.log("请求URL:", playerUrl)

      const playerResponse = await fetch(playerUrl, {
        method: "GET",
        headers: headers,
        credentials: "include"
      })

      console.log("播放器API响应状态:", playerResponse.status)
      const playerData = await playerResponse.json()
      console.log("播放器API响应数据:", playerData)

      if (playerData.code !== 0) {
        throw new Error(
          `获取播放器信息失败: ${playerData.message || playerData.code}`
        )
      }

      const subtitleList = playerData.data?.subtitle?.subtitles
      console.log("字幕列表:", subtitleList)

      // 获取第一个字幕文件
      if (!subtitleList || subtitleList.length === 0) {
        console.log("[Bilibili] 无字幕，设置提示信息")
        setError(t("noSubtitleOrLoginRequired"))
        setLoading(false)
        return
      }

      const subtitleUrl = subtitleList[0].subtitle_url
      console.log("字幕文件URL:", subtitleUrl)

      if (!subtitleUrl) {
        setError(t("invalidSubtitleUrl"))
        return
      }

      // 下载字幕文件
      const fullSubtitleUrl = subtitleUrl.startsWith("http")
        ? subtitleUrl
        : `https:${subtitleUrl}`
      console.log("完整字幕URL:", fullSubtitleUrl)

      const subtitleResponse = await fetch(fullSubtitleUrl, {
        headers: {
          Referer: "https://www.bilibili.com/",
          Origin: "https://www.bilibili.com"
        }
      })

      console.log("字幕文件响应状态:", subtitleResponse.status)
      const subtitleData = await subtitleResponse.json()
      console.log("字幕数据:", subtitleData)

      if (subtitleData.body && Array.isArray(subtitleData.body)) {
        setSubtitles(subtitleData.body)
        console.log(`字幕加载成功，共 ${subtitleData.body.length} 条`)
      } else {
        console.error("字幕数据不是数组格式:", subtitleData.body)
        setError(t("subtitleFormatError"))
      }
    } catch (error) {
      console.error(t("fetchSubtitlesFailed"), error)
      setError(t("noSubtitleOrLoginRequired") + " " + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // 跳转到指定时间
  const jumpToTime = (time: number) => {
    const video = document.querySelector("video") as HTMLVideoElement
    if (video) {
      video.currentTime = time
    }
  }

  // 关闭面板
  const handleClose = () => {
    setIsVisible(false)
  }

  // 加载视频字幕
  const loadVideoSubtitles = async (bvid: string) => {
    if (bvid === currentBvid) {
      return // 相同视频，不重复加载
    }

    console.log("检测到新视频，BVID:", bvid)
    setCurrentBvid(bvid)
    setSubtitles([]) // 清空旧字幕
    setError(null)

    const info = await fetchVideoInfo(bvid)
    if (info) {
      setVideoInfo(info)
      await fetchSubtitles(info.bvid, info.cid)
    }
  }

  useEffect(() => {
    // 初始加载
    const bvid = extractBVID()
    if (bvid) {
      loadVideoSubtitles(bvid)
    }

    // 监听URL变化（Bilibili是SPA，需要监听pushState/replaceState）
    let lastUrl = window.location.href
    const checkUrlChange = () => {
      const currentUrl = window.location.href
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl
        const newBvid = extractBVID()
        if (newBvid && newBvid !== currentBvid) {
          console.log("URL变化，检测到新BVID:", newBvid)
          loadVideoSubtitles(newBvid)
        }
      }
    }

    // 使用定时器检测URL变化（处理SPA导航）
    const urlCheckInterval = setInterval(checkUrlChange, 1000)

    // 同时监听popstate事件（处理浏览器前进后退）
    window.addEventListener("popstate", checkUrlChange)

    // 监听来自popup的消息
    const messageListener = (message: any) => {
      console.log("Bilibili content script received message:", message)
      if (message.type === "SHOW_SUBTITLE_PANEL") {
        console.log("Setting Bilibili panel to visible")
        setIsVisible(true)
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)

    return () => {
      clearInterval(urlCheckInterval)
      window.removeEventListener("popstate", checkUrlChange)
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [currentBvid])



  if (!isVisible) {
    return null
  }

  // 转换字幕格式以适配共用组件
  const convertedSubtitles = subtitles.map((subtitle) => ({
    from: subtitle.from,
    to: subtitle.to,
    content: subtitle.content
  }))

  // 转换视频信息格式
  const convertedVideoInfo = videoInfo
    ? {
        bvid: videoInfo.bvid,
        cid: videoInfo.cid,
        title: videoInfo.title
      }
    : null

  return (
    <SubtitlePanel
      key={videoInfo?.bvid || 'no-video'}
      subtitles={convertedSubtitles}
      loading={loading}
      error={error}
      videoInfo={convertedVideoInfo}
      onJumpToTime={jumpToTime}
      platform="bilibili"
      onClose={handleClose}
      getAudioUrl={getAudioUrlFromPlayInfo}
    />
  )
}

export default defineContentScript({
  matches: [
    "https://www.bilibili.com/video/*",
    "https://www.bilibili.com/list/watchlater*"
  ],
  async main(ctx) {
    console.log("Bilibili content script main started");
    const ui = await createShadowRootUi(ctx, {
      name: "bilibili-subtitle-panel",
      position: "overlay",
      zIndex: 2147483647,
      css: `${mainStyles}${elixirStyles}${overrideStyles}${sonnerStyles}`,
      onMount: (container) => {
        console.log("Bilibili UI mounting...");
        const root = ReactDOM.createRoot(container)
        root.render(<BilibiliSubtitlePanel />)
        return root
      },
      onRemove: (root) => {
        root?.unmount()
      }
    })
    ui.mount()
    console.log("Bilibili UI mounted");
  }
})
