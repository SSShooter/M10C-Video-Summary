# Bug: Screenshot Subtitle Panel Misaligned and Clipped

**Status:** Fixed  
**Date:** 2026-09-09  
**Affected Files:**  
- `components/SubtitlePanel.tsx`  
- `entrypoints/preview/App.tsx`  
- `entrypoints/preview/index.html`  
- `scripts/screenshot.mjs`  

---

## 1. 现象描述 (Description)

在进行自动化无头浏览器截图时，生成的组件面板截图（`subtitle_panel_*.png`）出现了两阶段的对齐问题：

1. **第一阶段（严重裁切偏斜）**：面板偏向屏幕右侧，右侧边框、关闭按钮及部分文本直接溢出视口被截断。
2. **第二阶段（微小偏移未完全居中）**：面板整体虽然完全在视口内，但左右留白不对称（左侧 76px，右侧 36px），未能实现完美的绝对水平居中。

---

## 2. 根本原因剖析 (Root Causes)

### 阶段一原因：原生组件固定定位与拖拽 Hook 干扰

1. **悬浮固定定位硬编码**：`SubtitlePanel` 作为视频播放器页面的悬浮窗口，默认写死了 `fixed top-[80px] right-[20px]`。
2. **拖拽存储数据格式冲突**：
   - 预览页面的 Mock 缓存写入了 `{ x: 50, y: 50 }`。
   - `useDraggable` Hook 期望读取的是 `{ top, left }`。
   - 读取后 `saved.left` 为 `undefined`，导致计算结果产生 `NaN`。`panelRef.current.style.left = "NaNpx"` 被浏览器忽略，但 `panelRef.current.style.right = "auto"` 却成功生效，导致右侧约束失效，元素回退至普通流在小视口中被挤出右侧屏幕。

### 阶段二原因：Chrome 最小视口宽度限制与截图像素裁切

1. **Tailwind Merge 与 `!` 前缀冲突**：
   - 试图通过 `className="!static !top-auto !right-auto"` 覆盖默认类名。
   - `tailwind-merge` 无法正常将带 `!` 的重要修饰符识别为与基础类冲突，导致 `fixed top-[80px] right-[20px]` 与 `!static` 并存。
2. **Chrome macOS 视口最小宽度机制（核心深层原因）**：
   - macOS 下的 Google Chrome（包括 `--headless=new`）对于视口宽度存在约 **500px** 的隐式最小宽度下限。
   - 当截图脚本指定 `--window-size=460,720` 时，Chrome 渲染页面的内部实际视口宽度依然被钳制为 **500px**。
   - 居中容器在 `500px` 视口下将宽度为 `350px` 的面板放置在中心，其左侧留白为 `(500 - 350) / 2 = 75px`。
   - 然而，`--screenshot` 依然严格按照指定的 `460px` 进行图像输出，相当于截取了视口左上角 `460x720` 的区域，把视口右侧 `40px` 直接裁剪掉了。
   - 结果：图像左留白为 `76px`，右留白变为 `75 - 40 ≈ 35px`，产生了左右视觉不均的现象。

---

## 3. 解决方案 (Fix)

### 1. 组件解耦并支持独立渲染（SubtitlePanel.tsx）
- 扩展 `SubtitlePanelProps`，增加 `className?: string`, `style?: React.CSSProperties`, `disableDrag?: boolean`。
- 当 `disableDrag=true` 时，不向 `useDraggable` 传递 storageKey，完全跳过拖拽监听与坐标恢复逻辑。
- 将传入的 `style` 直接合并至外层容器，支持直接声明式覆盖：
  ```tsx
  style={{ visibility: isPositionLoaded ? "visible" : "hidden", ...style }}
  ```

### 2. 预览容器样式重构（App.tsx & index.html）
- 移除多余的 `p-4` 内边距与背景色差异，统一 `body` 背景为 `bg-slate-50`。
- 在纯净预览模式（`pure=1`）下，传入内联样式强制脱离文档流浮动：
  ```tsx
  <SubtitlePanel
    ...
    disableDrag={true}
    className="static top-auto right-auto m-0 shadow-xl"
    style={{ position: "static", margin: "0 auto" }}
  />
  ```

### 3. 对齐视口黄金尺寸（scripts/screenshot.mjs）
- 针对 350x600 的面板尺寸，结合 Chrome 视口下限，将截图视口调整为 `500x750`。
- 此时各方向理论留白均为：
  - 水平方向：`(500 - 350) / 2 = 75px`
  - 垂直方向：`(750 - 600) / 2 = 75px`

---

## 4. 验证结果 (Verification)

使用 Python PIL 进行像素级边界检测：

```bash
python3 -c "
from PIL import Image
for name in ['subtitle_panel_subtitles.png', 'subtitle_panel_summary.png', 'subtitle_panel_mindmap.png']:
    im = Image.open('docs/screenshots/' + name).convert('RGB')
    ...
"
```

**输出测量结果：**
- `subtitle_panel_subtitles.png`: `left=76, right=76, top=76, bottom=76`
- `subtitle_panel_summary.png`: `left=76, right=76, top=76, bottom=76`
- `subtitle_panel_mindmap.png`: `left=76, right=76, top=76, bottom=76`

四周留白达到完全对称的 76 像素，投影及边框完整且无任何裁切。
