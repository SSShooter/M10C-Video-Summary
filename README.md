<p align="center">
  <img src="./assets/icon.png" width="120" alt="M10C Logo" />
</p>

<h1 align="center">M10C</h1>

<p align="center">
  A browser extension that analyzes video and article content to generate summaries and mind maps.
</p>

<p align="center">
  <a href="./README.zh.md">简体中文</a> | English
</p>

---

![M10C Main Image](./assets/Main.jpg)

### 📥 Download Links

- **Chrome Web Store**: [M10C Web Page Video to MindMap](https://chromewebstore.google.com/detail/m10c-web-page-video-to-mi/ioadcalaliollffeejdkcncckkjieobp?hl=en-US&utm_source=mind-elixir-desktop)
- **Firefox Add-ons**: [M10C Web Page Video to MindMap](https://addons.mozilla.org/en-US/firefox/addon/m10c-web-page-video-to-mindmap/)
- **Microsoft Edge Add-ons**: [M10C Web Page Video to MindMap](https://microsoftedge.microsoft.com/addons/detail/lmefhcbjkfhafclalgjjjleppfolkmdk)

A Chrome extension that analyzes video and article content to generate summaries and mind maps.

## 🏪 Store Listing Description

> The following content can be copied directly into the extension description of Chrome Web Store / Firefox Add-ons / Edge Add-ons.

A 40-minute video, and you really only need 3 takeaways. A 3,000-word article, and only one paragraph actually concerns you.

M10C is a browser extension that turns YouTube & Bilibili videos and web articles into AI summaries and mind maps in one click — read the key points first, then decide if it's worth your time.

**✨ What you can do with it**

- 🎬 **Videos: read the summary before committing** — automatically reads subtitles and generates overviews and key points in one click; click any point to jump straight to that moment in the video, no more scrubbing
- 📄 **Articles: read long posts in one screen** — auto-extracts the article body and lays out main viewpoints, key information, and topic tags
- 🧠 **Mind maps: keep what you've learned** — summaries become structured, interactive mind maps you can edit and export, so knowledge doesn't evaporate
- 🆓 **Generated content, free to fetch** — content generated via the built-in hosted model (Star Compute) is saved to the cloud; when a video or article has been analyzed before, you can fetch the ready-made result for free instead of paying to generate it again (5 free fetches per month)
- 🔒 **Your API Key never leaves your browser** — bring your own key (Google Gemini is free; OpenAI, Claude and more supported), or skip setup entirely by logging in with a Mind Elixir account and using the built-in hosted model

**Getting started:** install, open any video or article, click "Generate Mind Map" — M10C handles the rest.

## 🚀 Three Core Features

### 🎬 Intelligent Video Content Summarization

**Supported Platforms:** [![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com) [![Bilibili](https://img.shields.io/badge/Bilibili-00AEEC?style=for-the-badge&logo=bilibili&logoColor=white)](https://www.bilibili.com)

- Automatically extracts video subtitle content
- One-click AI-powered video content summarization including overview, key points, and main topics
- Click subtitles to jump directly to corresponding video timestamps, improving viewing efficiency
- Smart caching mechanism to avoid duplicate generation and save API call costs

![M10C Feature1](./assets/Feat1.jpg)

### 📄 Intelligent Article Content Analysis

**Comprehensive Text Content Processing Capabilities**

- Supports automatic extraction and analysis of web article content
- Uses multiple AI services for content summarization and analysis
- Provides structured content analysis including main viewpoints, key information, and topic tags
- Supports multiple AI model selection to meet different accuracy and cost requirements

![M10C Feature2](./assets/Feat2.jpg)

### 🧠 Visual Mind Map Generation

**Transform Content into Intuitive Mind Maps**

- Automatically generates structured mind maps based on video or article content
- Supports mind map export and save functionality
- Provides clear information hierarchy for better understanding and memory
- Integrates professional mind map components with interactive browsing and editing support

![M10C Feature3](./assets/Feat3.jpg)

## ✨ Technical Highlights

- 🔒 **Privacy & Security**: API Keys stored locally only, no server uploads
- 💾 **Smart Caching, Free Re-fetch**: Content generated with the built-in hosted model is saved to the cloud, so when you hit the same video or article again you can fetch the ready-made result for free instead of generating it twice (5 free fetches per month)
- 🌐 **Multi-Platform Support**: YouTube, Bilibili, and other mainstream video platforms
- ⚡ **High Performance**: Optimized data processing and rendering mechanisms

## Configuration Guide

### AI Service Configuration

> 📖 **Detailed Guide**: Check [AI Service Usage Guide](./guide/index.md) for complete AI service selection and configuration recommendations

**Quick Recommendations:**

- 🌟 **First Choice**: Google Gemini (Free, excellent results)
- 🔄 **Alternative**: SiliconFlow, OpenRouter
- 💰 **Premium**: OpenAI GPT or Anthropic Claude (Paid, best performance)

### 🌟 No-Key Solution (Star Compute)

If you don't have your own AI service provider API Key, or don't want to go through complex configuration, you can log in to your Mind Elixir account and use the **Built-in Hosted Model (Star Compute)**:
- ⚡ **Out of the Box**: No API Key configuration required, just log in and use it directly.
- 🪙 **Pay-as-you-go**: Deducts from your Star balance, 10 Stars can process approximately 80 long videos.
- 🔄 **Cross-App Sharing**: Star balance is shared across the entire Mind Elixir ecosystem (e.g., also usable in [Ebook to Mindmap](https://ebook2me-next.mind-elixir.com)).
- ⏳ **Never Expires**: Stars purchased or obtained never expire.

*To recharge or manage Stars, please visit [Mind Elixir](https://app.mind-elixir.com/recharge).*

## Technical Architecture

### Project Structure

```
video-mindmap/
├── contents/                 # Content scripts
│   ├── youtube-subtitle.tsx  # YouTube subtitle processing
│   └── bilibili-subtitle.tsx # Bilibili subtitle processing
├── utils/                    # Utility functions
│   ├── ai-service.ts        # AI service interface
│   └── subtitle-utils.ts    # Subtitle processing tools
├── config/                   # Configuration files
│   └── platforms.ts         # Platform configuration
├── options.tsx              # Configuration page
├── popup.tsx                # Popup window
└── package.json             # Project configuration
```

### Core Technologies

- **Framework**: React 18 + TypeScript
- **Build Tool**: Plasmo Framework
- **Storage**: Chrome Storage API
- **Network Requests**: Fetch API
- **Styling**: Inline styles (to avoid style conflicts)

## Important Notes

### Privacy & Security

- API Keys are stored only in the local browser and are never uploaded to any server
- Subtitle content is only sent to selected AI service providers when using AI summarization
- The extension does not collect or store users' personal information

### Usage Limitations

- AI summarization features require valid API Keys and network connection
- Different AI service providers have different usage limits and billing methods
- Some videos may not have subtitles or subtitle extraction may fail

## Troubleshooting

### Common Issues

1. **Subtitles Not Displaying**

   - Check if the video has subtitles available
   - Refresh the page and try again

2. **AI Summarization Failed**

   - Check if the API Key is correct
   - Check network connection
   - Check the AI service provider's service status