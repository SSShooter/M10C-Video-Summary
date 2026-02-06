import styleOverride from "data-text:./mind-elixir-css-override.css"
import tailwindStyles from "data-text:~style.css"
import styleText from "data-text:mind-elixir/style.css"
import sonnerStyle from "data-text:sonner/dist/styles.css"
import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo"
import { useEffect, useRef, useState } from "react"

import { SubtitlePanel } from "~components/SubtitlePanel"
import { t } from "~utils/i18n"

export const config: PlasmoCSConfig = {
  matches: [
    "https://www.bilibili.com/video/*",
    "https://www.bilibili.com/list/watchlater*"
  ],
  all_frames: false
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = tailwindStyles + styleText + styleOverride + sonnerStyle
  return style
}

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
        console.log(
          t("subtitleLoadedCount", subtitleData.body.length.toString())
        )
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

  useEffect(() => {
    const bvid = extractBVID()
    if (bvid) {
      fetchVideoInfo(bvid).then(async (info) => {
        if (info) {
          setVideoInfo(info)
          fetchSubtitles(info.bvid, info.cid)
        }
      })
    }

    // 监听来自popup的消息
    const messageListener = (message: any) => {
      if (message.type === "SHOW_SUBTITLE_PANEL") {
        setIsVisible(true)
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [])

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
      subtitles={convertedSubtitles}
      loading={loading}
      error={error}
      videoInfo={convertedVideoInfo}
      onJumpToTime={jumpToTime}
      platform="bilibili"
      onClose={handleClose}
    />
  )
}

export default BilibiliSubtitlePanel
