---
name: m10c-release-cards
description: 为 M10C 生成/导出小红书发布卡片（release-cards/ 纯 HTML + JSON）。触发词：发布卡片、release cards、更新卡片、发版配图、截图发布图、release poster。涵盖新增版本数据文件、本地预览、浏览器导出 1080×1440 PNG 并归档到 screenshots/release/<version>/。
agent_created: true
---

# M10C Release Cards

`/Users/darksouls/projects/m10c/release-cards/` 是纯 HTML + JSON 的发布卡片生成器（无 React、无构建）。

## 结构

```
release-cards/
├── index.html                 # 样式 + 3 个卡片模板（cover / list / install），一般不用改
├── icon.png                   # 从 assets/icon.png 复制
└── releases/
    ├── index.json             # {"latest":"3.6.0","versions":["3.6.0"]}
    ├── <version>.zh.json      # 中文数据
    ├── <version>.en.json      # 英文数据
    ├── _template.zh.json      # 中文空白模板
    └── _template.en.json      # 英文空白模板
```

URL 参数：`?v=3.6.0` 指定版本，`?lang=en` 英文（默认 zh）。**必须带 lang 后缀**：页面请求的是 `releases/<v>.<lang>.json`。

## 发新版三步

1. 复制 `releases/_template.zh.json` / `_template.en.json` → 改名 `<version>.zh.json` / `<version>.en.json`，填 `version` / `date` / `cards`。
2. 把版本号加进 `releases/index.json` 的 `versions`，并把 `latest` 改成它。
3. 预览 + 导出（见下）。

## 卡片模板

| kind | 用途 | 必填字段 |
|---|---|---|
| `cover` | 封面：logo 块 + 大版本号 + 钩子（第二行淡紫高亮）+ 日期 + 数量胶囊 | `label` `hook[2]` `sub` `count` |
| `list` | 更新列表：序号 + 标签胶囊 + 标题 + 一句话 | `label` `headline[1]` `items[{tag,title,desc}]` |
| `install` | 商店入口列表 + 搜索提示 | `label` `headline[2]` `platforms[{name}]` `searchHint` `foot` |

- `accent`：`violet`（默认，M10C 主题色 `#A18BFF`）/ `indigo` / `amber` / `rose` / `ink`。
- `install.note` 可选，不填则不渲染黑色提示条。
- 标签胶囊（`NEW` / `IMPROVED`）按语言固定宽度，保证标题左对齐：英文 `min-width: 80px`、中文 `44px`（见 index.html 里 `body[data-lang=...] .ls-item .tg`）。新增更长的标签（如 `FIXED` 之外的长词）要同步加宽。
- 卡片 540×720，`padding 52/48`，内缩 20px 细框；无 border/shadow，便于干净截图。
- 数据 JSON 用 `fetch(..., { cache: 'no-store' })` 加载：本地改完 JSON 若不加这个，浏览器启发式缓存会让你看到旧内容（表现为"改了数据页面没变"），排查时容易误判成文件没保存。

## 写作约束（踩过的坑）

- **中英文都要检查溢出**：`document.querySelectorAll('.card')` 的 `scrollHeight - clientHeight` 必须全为 0。英文文案更长，index.html 里对 `body[data-lang="en"]` 的 `.ls-item` 已单独收紧（padding 11px、标题 17.5px、说明 12.5px）；再超就把 desc 压到一行。
- 列表卡最多 6 条（中文）或 5 条（英文），再多就溢出。
- 文案用陈述句，**不用命令/祈使语气**（"装上，或者直接更新" ❌ → "新版本已经上架，随时可以更新" ✅）。
- 每张卡内容不重复，不讲基础功能，只讲本版新变化。

## 本地预览

```bash
cd /Users/darksouls/projects/m10c/release-cards && python3 -m http.server 4173
# 中文 http://localhost:4173/  英文 http://localhost:4173/?lang=en
```

## 导出 PNG（chrome-devtools MCP）

页面里每张卡下面有「下载 PNG · 1080×1440」按钮，用 snapdom（CDN `@zumer/snapdom@1.9.13`）在页内以 2x 导出卡片元素本身，无页面背景。CDN 拿不到时按钮不渲染（这是唯一依赖外网的地方）。

1. `new_page("http://localhost:4173/?lang=zh")` → `take_snapshot()` → 依次 `click` 三个按钮（每次 ~1s，按钮会显示"导出中…"）。
2. 换 `?lang=en` 再来一次。
3. 文件落在 **`~/Downloads`**，文件名 = `data-card` 值且**没有扩展名**（如 `m10c-3.6.0-zh-01-cover`）。
4. 归档改名（`{lang}-{NN}-{kind}.png`）：

```bash
cd /Users/darksouls/projects/m10c && mkdir -p screenshots/release/v<version>
cd ~/Downloads && for f in m10c-<version>-*; do
  lang=$(echo "$f" | cut -d- -f3); nn=$(echo "$f" | cut -d- -f4); name=$(echo "$f" | cut -d- -f5)
  cp "$f" "/Users/darksouls/projects/m10c/screenshots/release/v<version>/${lang}-${nn}-${name}.png"
done
```

⚠️ 版本号含点号（`3.6.0`）不含连字符，所以 `cut -d-` 的字段是：1=前缀 `m10c`、2=版本、3=lang、4=序号、5=kind。**先 `cut` 后 `ls` 验证名字**，别用 4/5/6。

5. 校验全部 1080×1440：

```bash
python3 -c "import struct,sys;d=open(sys.argv[1],'rb').read();print(struct.unpack('>II',d[16:24]))" <file.png>
```

⚠️ **重复导出会改文件名**：`~/Downloads` 里已有同名文件时，Chrome 会把新文件存成 `m10c-3.6 (1).0-zh-01-cover`（` (1)` 插在第一个点后面，因为文件名没有扩展名）。所以二次导出后 `ls -lt ~/Downloads | head` 先确认实际文件名再 `cp`，或者导出前先把旧的同名文件移走。

6. `Read` 其中几张图目视确认：logo 在位、淡紫 `#A18BFF` 正确、四角是纸张色 `#F4F2ED`（不能有页面深灰背景）、文字没截断、标签胶囊宽度一致（英文 `NEW` 与 `IMPROVED` 等宽、标题左对齐）。

7. 归档核对无误后，清理 `~/Downloads` 里的原始导出文件（用 `mv` 到 `~/.Trash` 而非 `rm`，文件名后加时间戳避免废纸篓冲突）。清理前先 `ls -l` 归档目录，确认 6 张都在且大小与 Downloads 原文件一致。

`screenshots/` 是工作产物目录，不是版本管理的资源。
