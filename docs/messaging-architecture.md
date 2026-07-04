# 消息通信架构文档

> 本文档描述 M10C-Video-Summary 扩展中 **Side Panel**、**Background**（Service Worker）、**Content Script（页面）** 三者之间的数据交流关系。

---

## 一、架构全貌

```
┌─────────────────────────────────────────────────────────────────────┐
│  浏览器页面（youtube.com / bilibili.com）                            │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Content Script（youtube-subtitle / bilibili-subtitle）       │  │
│  │  · 注入 Shadow DOM UI（SubtitlePanel + useSTT hook）          │  │
│  │  · 监听 chrome.runtime.onMessage + tabs.onMessage              │  │
│  │  · 将音频 URL 直接发送给 Side Panel 自行下载                    │  │
│  │  · 直接向 Side Panel 发送 STT_TRANSCRIBE（runtime.sendMessage）│  │
│  │  · 直接接收 Side Panel 的 STT_PROGRESS / STT_RESULT / STT_ERR  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
          ▲ sendMessage / onMessage
          │             ╲  tabs.sendMessage（STT 结果）
          │              ╲
┌─────────┴───────────────╳───────────────────────────────────────────┐
│  Background Service Worker（background/index.ts）                   │
│  · 拦截 YouTube timedtext 网络请求，提取字幕 URL                      │
│  · 代理 AI 流式请求（AI_STREAM 长连接 Port）                          │
│  · 音频由 Side Panel 直接 fetch 下载（不再经 Background）        │
│  · 打开 Side Panel（OPEN_SIDE_PANEL）                               │
│  · 管理 chrome.storage.local（subtitleUrl / sttPendingOp 等）        │
└─────────────────────────────────────────────────────────────────────┘
          ▲ sendMessage / onMessage（STT 命令，含 sourceTabId）
          │
┌─────────┴───────────────────────────────────────────────────────────┐
│  Side Panel（sidepanel/App.tsx）                                     │
│  · 持有 whisper-worker（Web Worker）                                 │
│  · 接收 STT 命令，驱动 Worker 做模型加载 / 转写                        │
│  · 通过 broadcast() 把结果发给 sttEvents + tabs.sendMessage（直达 CS）│
│  · 通过 STTEngineContext 向内部组件（STTSection）暴露控制接口           │
└─────────────────────────────────────────────────────────────────────┘
          ▲ postMessage / onmessage
          │
┌─────────┴───────────────────────────────────────────────────────────┐
│  Whisper Web Worker（whisper-worker.ts）                             │
│  · 在独立线程执行 @huggingface/transformers Whisper 推理              │
│  · 向 Side Panel 主线程回传 progress / result / error                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 二、消息类型速查表

所有 STT 相关消息类型定义在 [`utils/stt-config.ts`](../utils/stt-config.ts)：

| 常量                | 值                  | 方向 / 说明                                      |
|---------------------|---------------------|--------------------------------------------------|
| `MSG.STT_LOAD_MODEL`  | `STT_LOAD_MODEL`  | Content/Options → Background → Side Panel：加载模型 |
| `MSG.STT_TRANSCRIBE`  | `STT_TRANSCRIBE`  | Content Script → Background → Side Panel：发起转写 |
| `MSG.STT_CHECK_MODEL` | `STT_CHECK_MODEL` | 任意 → Side Panel（同步查询当前模型状态）            |
| `MSG.STT_DELETE_MODEL`| `STT_DELETE_MODEL`| Content/Options → Background → Side Panel：删除模型 |
| `MSG.STT_PROGRESS`    | `STT_PROGRESS`    | Side Panel → Background → Content Script（进度回传）|
| `MSG.STT_RESULT`      | `STT_RESULT`      | Side Panel → Background → Content Script（结果回传）|
| `MSG.STT_ERROR`       | `STT_ERROR`       | Side Panel → Background → Content Script（错误回传）|

其他消息类型（非 STT）：

| 消息类型                  | 发送方          | 接收方         | 说明                           |
|---------------------------|-----------------|----------------|--------------------------------|
| `OPEN_SIDE_PANEL`         | Content Script  | Background     | 触发打开 Side Panel（无字幕时） |
| `SHOW_SUBTITLE_PANEL`     | Background      | Content Script | Popup 点击后显示字幕面板        |
| `SUBTITLE_URL_CAPTURED`   | Background      | Content Script | 字幕 URL 拦截成功通知           |
| `FETCH_AUDIO_BASE64`      | Content Script  | Background     | 代理下载音频并转 Base64          |
| `FETCH_AUDIO_BLOB`        | Content Script  | Background     | 代理下载音频返回大小            |
| `getCapturedSubtitleUrl`  | Content Script  | Background     | 查询已捕获的 YouTube 字幕 URL   |
| `clearCapturedSubtitleUrl`| Content Script  | Background     | 清除缓存的字幕 URL              |
| `formatSubtitles`         | Content Script  | Background     | 格式化字幕供 AI 使用            |
| `checkMindmapCache`       | Content Script  | Background     | 检查后端是否有缓存思维导图      |
| `fetchCachedMindmap`      | Content Script  | Background     | 拉取后端缓存的思维导图          |
| AI_STREAM Port（`summarizeSubtitlesStream` / `generateMindmapStream`）| Content Script | Background | 长连接流式 AI 请求 |

---

## 三、STT 完整数据流

### 3.1 用户在 Content Script 中点击"转写"按钮

```
SubtitlePanel（Content Script）
  └─ useSTT.transcribe()
       1. chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })
            → Background 打开 Side Panel
       2. chrome.runtime.sendMessage({ type: STT_TRANSCRIBE, audioUrl, referer, language, sourceTabId })
            → （带重试）直接发送给 Side Panel（runtime.sendMessage 可直接到达扩展页面）
            → Side Panel 收到后：
                a. 记录 sourceTabId（用于结果回传）
                b. 用 fetch(audioUrl, { referer }) 直接下载音频（不再经过 Background！）
                c. AudioContext 解码音频为 Float32Array
                d. 发 STT_PROGRESS(transcribing) 广播
                e. worker.postMessage({ type: 'transcribe', audioData })
```

### 3.2 Whisper Worker 推理过程

```
Whisper Worker（独立线程）
  ├─ 每完成一个 30s chunk：postMessage({ type: 'progress', status: 'transcribing', progress: chunkCount })
  ├─ 推理完成：postMessage({ type: 'result', text, chunks })
  └─ 出错：postMessage({ type: 'error', error, fatal? })
```

### 3.3 Side Panel 接收 Worker 消息并广播

```
sidepanel/App.tsx（worker.onmessage）
  ├─ msg.type === 'progress'
  │     broadcast({ type: STT_PROGRESS, status, progress, chunks })
  │       ├─ sttEvents.emit()   → STTSection（Side Panel 内部 UI）
  │       ├─ chrome.tabs.sendMessage(currentContentTabId, msg)
  │       │     → 直达 Content Script → useSTT hook
  │       ├─ chrome.runtime.sendMessage(msg)
  │       │     → Background（仅 relay status=ready/deleted 给 active tab）
  │       └─ chrome.runtime.sendMessage(msg)
  │             → 通知 Options 等其他扩展页面
  │
  ├─ msg.type === 'result'
  │     broadcast({ type: STT_RESULT, text, chunks })
  │       → 同上路径 → useSTT 更新 result / chunks，缓存到 storage
  │
  └─ msg.type === 'error'
        broadcast({ type: STT_ERROR, error })
          → 同上路径 → useSTT 更新 error 状态
```

### 3.4 Background 的 STT 角色（大幅简化）

```
Background 的 STT 角色现在非常轻量：

  ✓ chrome.sidePanel.open()              — 收到 OPEN_SIDE_PANEL 时打开面板
  ✓ relay STT_PROGRESS(ready/deleted)     — 模型就绪时 relay 给 active tab（初始阶段 Side Panel 尚不知 tabId）
  ✓ chrome.storage.local.sttPendingOp     — Options/Popup 页面的 STT 操作暂存
  ✓ GET_TAB_ID                            — 返回 Content Script 的 tabId
  ✗ 不再 relay STT_PROGRESS(transcribing) / STT_RESULT / STT_ERROR
  ✗ 不再保存/读取 sttTranscribeTabId
  ✗ 不再转发 STT_TRANSCRIBE
  ✗ 不再代理音频下载（FETCH_AUDIO_BASE64 已移除）
```

---

## 四、AI 摘要 / 思维导图数据流

Content Script 通过 **Long-lived Port（`AI_STREAM`）** 与 Background 通信，避免流式响应超时：

```
Content Script（SubtitlePanel / MindmapDisplay）
  └─ chrome.runtime.connect({ name: 'AI_STREAM' })
       └─ port.postMessage({ action: 'summarizeSubtitlesStream' / 'generateMindmapStream', subtitles, ... })
            → Background（onConnect 监听器）
                 1. 从 storage 读取 AI 配置（aiConfigV2）
                 2. 向 AI Provider API 发起 SSE 流式请求
                 3. 每收到一段 chunk：port.postMessage({ type: 'chunk', content, reasoning })
                 4. 完成：port.postMessage({ type: 'done' })
                 5. 报错：port.postMessage({ type: 'error', error })
                 6. Port 断开（用户关闭面板）→ AbortController.abort()
            ← Content Script 监听 port.onMessage 更新 UI 状态
```

---

## 五、YouTube 字幕捕获数据流

```
Background（webRequest.onBeforeRequest）
  监听 https://www.youtube.com/api/timedtext*
  ├─ 捕获到含 pot 参数的 URL
  ├─ 存入内存 capturedSubtitleUrl + chrome.storage.local
  └─ chrome.tabs.sendMessage(activeTab, { type: 'SUBTITLE_URL_CAPTURED', url })

Content Script（youtube-subtitle）
  监听 chrome.runtime.onMessage
  ├─ 收到 SUBTITLE_URL_CAPTURED → fetch 字幕 JSON → 解析 → setSubtitles()
  └─ 若 15s 内未收到 → setError() → 显示 STT 按钮
```

---

## 六、chrome.storage.local 键值汇总

| Key                    | 写入方            | 读取方                 | 说明                             |
|------------------------|-------------------|------------------------|----------------------------------|
| `capturedSubtitleUrl`  | Background        | Background / Content   | YouTube 字幕 URL 缓存            |
| `sttPendingOp`         | Background        | Side Panel（mount 时） | 待执行的 STT 操作（非 TRANSCRIBE）|
| `sttModelDownloaded`   | Side Panel        | STTSection             | 标记模型已下载                   |
| `sttModelRepo`         | Side Panel        | STTSection             | 已下载的模型 repo                |
| `stt_cache_<videoId>`  | useSTT（Content） | useSTT（Content）      | 视频转写结果缓存                 |
| `aiConfigV2`           | Options Page      | Background             | AI Provider 配置                 |
| `sttConfig`（local:）  | STTSection        | useSTT / STTSection    | 用户选择的模型大小和语言          |

---

## 七、关键设计决策说明

### 7.1 为什么音频下载也从 Background 移到 Side Panel？
之前音频经 Background 代理下载后转 Base64，再通过 `runtime.sendMessage` 传递给 Side Panel，音频数据需两次跨上下文传输（Content Script → Background → Side Panel）。现在 Content Script 将音频 URL 直接发给 Side Panel，由 Side Panel 自行 `fetch`，音频数据只在 Side Panel 内落地，避免 Base64 编解码和重复传输开销。

### 7.2 STT 直连 + Background 备选的设计
`chrome.runtime.sendMessage` 从扩展页面（Side Panel）发出的消息**不能直接到达 Content Script**，因此 Side Panel 通过 `chrome.tabs.sendMessage(tabId, msg)` 直接发送给指定 Tab 的 Content Script。

但初始阶段（首次 `STT_CHECK_MODEL` 时）Side Panel 尚不知道 Content Script 的 tabId，所以模型就绪广播（`STT_PROGRESS(ready)`）同时走 `chrome.runtime.sendMessage` 作为备选——Background relay 给 active tab。一旦 Content Script 发起 `STT_TRANSCRIBE` 或 `STT_CHECK_MODEL`（带 `sourceTabId`），后续所有 STT 消息都走 `tabs.sendMessage` 直连，不再经过 Background。

### 7.3 为什么 Side Panel 用 sttEvents 而不只用 runtime.onMessage？
`chrome.runtime.sendMessage` 不会把消息回传给自身（发送方不是接收方），Side Panel 内部的 `STTSection` 组件需要实时感知进度，因此引入了轻量级的本地事件总线 `sttEvents`（[utils/stt-events.ts](../utils/stt-events.ts)）。

### 7.4 为什么音频解码在 Side Panel 主线程而不在 Worker 中？
`AudioContext` API 在 Web Worker 上下文中不可用，因此音频（无论是 Base64 解码还是 URL `fetch` 解码）→ `Float32Array` 的步骤必须在 Side Panel 主线程完成，再通过 `Transferable`（零拷贝）传入 Worker。

### 7.5 AI 流式请求为何用 Long-lived Port 而不用 sendMessage？
`chrome.runtime.sendMessage` 有约 30 秒超时限制，长视频摘要生成可能超时，因此使用 `chrome.runtime.connect` 建立持久连接，并在 Port 断开时自动取消（`AbortController`）。

---

## 八、文件索引

| 文件 | 职责 |
|------|------|
| [`entrypoints/background/index.ts`](../entrypoints/background/index.ts) | Service Worker：AI 流式请求、字幕 URL 拦截、打开 Side Panel |
| [`entrypoints/sidepanel/App.tsx`](../entrypoints/sidepanel/App.tsx) | Side Panel 主组件：持有 Worker，接收 STT 命令并广播结果 |
| [`entrypoints/whisper-worker.ts`](../entrypoints/whisper-worker.ts) | Web Worker：Whisper 模型加载与推理 |
| [`entrypoints/bilibili-subtitle.content.tsx`](../entrypoints/bilibili-subtitle.content.tsx) | B 站 Content Script |
| [`entrypoints/youtube-subtitle.content.tsx`](../entrypoints/youtube-subtitle.content.tsx) | YouTube Content Script |
| [`hooks/useSTT.ts`](../hooks/useSTT.ts) | Content Script 侧 STT 状态管理 Hook |
| [`components/STTSection.tsx`](../components/STTSection.tsx) | Side Panel 内 STT 设置 UI |
| [`utils/stt-config.ts`](../utils/stt-config.ts) | MSG 常量、模型/语言配置 |
| [`utils/stt-events.ts`](../utils/stt-events.ts) | Side Panel 内部本地事件总线 |
| [`contexts/stt-engine.tsx`](../contexts/stt-engine.tsx) | Side Panel → STTSection 的 React Context 接口 |
