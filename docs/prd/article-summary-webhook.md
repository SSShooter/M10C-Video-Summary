## Problem Statement

用户可以在文章页面生成 AI 摘要，但摘要目前只保留在浏览器扩展本地，无法按需发送到用户自己的 Blog、知识库或其他内容系统。用户需要手动复制摘要、文章地址和时间信息，再到外部系统中粘贴，流程重复且容易遗漏来源或时间。

用户希望在扩展配置页中设置一个 POST 接口地址和用于鉴权的 Header Token。当文章或视频摘要成功生成后，用户可以手动点击按钮，把来源 URL、摘要正文、总结时间等必要属性发送到该接口，并清楚知道发布是否成功。

## Solution

在配置页新增“Blog 发布配置”区域。用户可以配置 POST URL、鉴权 Header 名称和 Token，并保存到扩展本地存储。

当文章助手中存在完整摘要时，用户可以点击“发送到 Blog”。扩展仅在点击后通过 Background 网络层向配置的接口发送 JSON。请求包含文章 URL、文章标题、摘要正文和总结时间。发布成功或失败都在文章助手中显示明确反馈；发布失败不影响摘要查看和本地缓存，用户可以再次点击重试。

该功能应用于文章摘要和 YouTube/Bilibili 视频摘要，不发布思维导图。

## User Stories

1. As an article-summary user, I want to click a send-to-Blog button, so that I control exactly when a summary is published.
2. As an article-summary user, I want no request sent until I click the button, so that generating or viewing a summary has no external side effect.
3. As a self-hosted Blog owner, I want to configure a POST URL, so that the extension can send summaries to my own API.
4. As a self-hosted Blog owner, I want the configured URL to accept HTTP or HTTPS endpoints, so that I can use both local development and production services.
5. As a security-conscious user, I want invalid or unsupported URL schemes rejected, so that the extension does not post to unintended protocols.
6. As an API owner, I want to configure the authentication Header name, so that the extension can work with my API's existing authentication convention.
7. As an API owner, I want to configure the Header Token value, so that incoming requests can be authenticated.
8. As a user, I want the token field masked in the settings UI, so that it is not exposed during normal use.
9. As a user, I want the publish configuration persisted locally, so that I do not need to re-enter it after restarting the browser.
10. As a user, I want AI provider configuration and publish configuration saved independently in one settings workflow, so that changing one does not erase the other.
11. As a user, I want required publish fields validated before saving, so that an enabled but unusable configuration is not silently accepted.
12. As a user, I want a clear saved state, so that I know the publish configuration has been persisted.
13. As an article-summary user, I want a newly generated summary posted only after generation completes successfully, so that partial streaming content is never published.
14. As an article-summary user, I want the final rendered summary text posted exactly once per completed generation attempt, so that the destination does not receive stream fragments.
15. As an article-summary user, I want regenerated summaries treated as new publication attempts, so that my external system can receive the latest result.
16. As an article-summary user, I want a cached summary to be sendable with the same button, so that I can publish it without regenerating.
17. As an API consumer, I want the article URL included in every payload, so that I can associate the summary with its source.
18. As an API consumer, I want the article title included in every payload, so that I can display and index the content meaningfully.
19. As an API consumer, I want the summary body included in every payload, so that I can publish or store the generated content.
20. As an API consumer, I want the summary completion time included as an ISO 8601 UTC timestamp, so that time handling is unambiguous.
21. As an API consumer, I want a payload schema version and event type, so that I can evolve my receiving endpoint without guessing the request shape.
22. As an API consumer, I want a stable source identifier, so that I can distinguish M10C events from other integrations.
23. As an API consumer, I want each click to represent one explicit delivery attempt, so that request behavior is predictable.
24. As a user, I want the configured token sent only in the configured request Header, so that it is not exposed in the URL or JSON body.
25. As a user, I want successful publication confirmed in the article assistant, so that I know the external system accepted the summary.
26. As a user, I want failed publication reported with a useful HTTP or network error, so that I can diagnose configuration or endpoint problems.
27. As a user, I want publication failure not to erase the generated summary or its cache, so that AI generation work is preserved.
28. As a user, I want to retry a failed publication manually, so that transient failures can be recovered without regenerating the summary.
29. As an API owner, I want non-2xx responses treated as failures, so that rejected requests are not shown as successful.
30. As a user, I want retry to happen only when I click again, so that the extension never repeats a request without my action.
31. As a user, I want no automatic retry loop, so that a broken endpoint does not cause repeated background traffic.
32. As a user, I want posting to happen from the extension Background context, so that page CORS restrictions do not break the integration.
33. As a user, I want the publication request to have a finite timeout, so that a stalled endpoint does not leave the UI indefinitely pending.
34. As a security-conscious user, I want tokens and full authorization headers omitted from logs and error messages, so that credentials are not leaked during debugging.
35. As an international user, I want all new configuration labels, validation messages, and publication statuses localized through the extension's existing i18n system, so that the feature matches the rest of the product.
36. As a user upgrading the extension, I want existing AI settings to continue working without migration errors, so that this optional feature is backward compatible.
37. As a user without publish configuration, I want article summary generation to behave exactly as it does today, so that the new integration is opt-in.
38. As a maintainer, I want the publishing contract isolated from AI provider logic, so that external posting failures cannot affect AI generation.
39. As a maintainer, I want typed configuration, request, response, and status contracts, so that content scripts and Background messaging remain understandable.
40. As a maintainer, I want external behavior covered by tests at the highest practical boundary, so that implementation refactors do not invalidate the test suite.

## Implementation Decisions

- 扩展现有本地配置，新增独立且可选的 Blog 发布配置：POST URL、Header 名称和 Token。现有 AI 服务商配置保持向后兼容。
- 在 Options 页面中增加独立配置区域，不与某个 AI 服务商绑定。Header 名称默认使用 `Authorization`；Token 按用户输入原样发送，不自动添加 `Bearer ` 前缀。
- 发送时 POST URL、Header 名称和 Token 均为必填。URL 必须能正确解析，并且协议只能为 `http:` 或 `https:`。
- 使用扩展现有本地存储保存配置。Token 输入框使用密码类型，默认不以明文显示已保存内容。
- 仅在用户点击“发送到 Blog”时发布。流式片段、摘要完成事件、生成错误、缓存摘要加载、Tab 切换和面板重新打开均不触发。
- 通过现有摘要生成配置边界向共享摘要组件传递来源标题和 URL，文章与视频摘要复用同一发布入口。
- 外部请求统一由 Background 上下文通过专用 runtime 消息执行，Content Script 不直接请求目标接口。
- 请求使用 `POST`、`Content-Type: application/json` 和用户配置的自定义 Header。Token 不出现在 URL 或 JSON Body 中。
- 请求体严格只包含 `title` 和 `content`。`content` 是 Markdown 文档，内部统一包含一级标题、来源 URL、总结时间和 AI 总结正文；结构化 JSON 摘要会转换为“内容摘要、关键要点、主要话题”章节。
- `summarizedAt` 是 AI 生成完成时记录的 UTC ISO 8601 时间。
- HTTP 2xx 均视为成功；网络错误、超时和非 2xx 响应视为失败，不要求成功响应具有固定 JSON 格式。
- 请求必须有有限超时时间，建议默认 15 秒。
- 先保存摘要本地缓存，再执行发布。发布失败不得回滚、清空摘要，也不得把 AI 摘要生成本身标记为失败。
- 发布 UI 状态与 AI 生成状态分离为 idle、posting、succeeded、failed。失败时在面板打开期间保留请求载荷，并提供手动重试。
- 显示简洁的本地化成功/失败反馈。错误可包含目标主机、HTTP 状态和安全的响应文本，但必须隐藏 Token 和鉴权 Header 值。
- 本期不自动发送或自动重试，每次请求都必须来自用户点击。
- 沿用当前 Manifest 已声明的 HTTP/HTTPS Host Permissions，不新增特定域名权限请求。
- 为所有当前支持语言补充配置、校验、发布状态、成功、失败和重试相关文案。
- 禁止输出完整发布配置或完整请求 Header 到日志。

## Testing Decisions

- 主要测试边界是最高层的“用户点击发送摘要”工作流：分别给定文章或视频来源元数据和完整摘要，观察 Background POST 请求及用户可见发布状态。
- 测试只断言外部行为，不绑定 React 状态结构、私有方法、Helper 调用次数或存储实现细节。
- 仓库当前没有自动化测试框架或测试文件，需要增加兼容 TypeScript/Vite 的轻量测试运行器和浏览器扩展 API Mock。
- 验证摘要生成完成、重新生成、加载缓存和打开面板均不会发出 POST。
- 验证点击按钮后发出一次 POST，并包含配置 URL、自定义 Header、JSON Content-Type、完整必要字段和 ISO 时间。
- 验证缺失配置时不发送请求并显示失败反馈，同时摘要仍被保留。
- 验证加载缓存摘要后也能手动发送。
- 验证失败后再次点击会产生一次新的明确请求。
- 验证空 URL、无效 URL、不支持的协议、空 Header 名称和空 Token 的配置校验。
- 验证 HTTP 2xx 成功，以及非 2xx、网络错误和超时失败。
- 验证发布失败仍保留摘要并显示重试操作。
- 验证 Token 不出现在载荷、URL、日志或用户可见错误中。
- 验证加载只有 AI 配置、没有发布字段的旧配置时保持兼容。
- 独立测试 Background 消息契约并 Mock `fetch`；端到端组件测试只覆盖一个文章工作流。这是唯一增加的低层测试边界，因为网络层和 Content Script UI 位于不同扩展上下文。
- 现有代码没有测试先例；实现时参考项目现有的 Storage、Background runtime 消息、摘要完成和 Toast 反馈模式。

## Out of Scope

- 发布思维导图或思维导图图片。
- 支持 POST 以外的 HTTP 方法。
- 配置多个任意 Header。
- 配置任意请求体模板或字段映射。
- OAuth、Cookie 登录、签名算法或刷新 Token 流程。
- 从外部 Blog 拉取、编辑、删除或反向同步文章。
- 发布历史页面或持久化重试队列。
- 自动重试、指数退避或离线后台同步。
- 在浏览器平台现有存储保护之外额外加密本地配置。
- 在现有文章检测结果之外进一步发现 canonical URL。
- 强制目标接口返回特定 JSON Schema。

## Further Notes

- 仓库当前没有该领域的项目级术语表或 ADR。本文沿用现有产品术语：Options 页面、Article Assistant、AI Summary、Background 上下文和本地缓存。
- 仓库远端指向 GitHub，但没有工程技能的问题跟踪器配置文件。本文依据远端和技能默认值，使用 GitHub Issues 与 `ready-for-agent` 标签约定。
- 示例请求：

```json
{
  "title": "Example article",
  "content": "# Example article\n\n> 来源：[https://example.com/posts/ai](https://example.com/posts/ai)\n\n> 总结时间：2026-07-12T08:00:00.000Z\n\n---\n\n## 内容摘要\n\nThe completed AI summary..."
}
```

- 每次按钮点击都会产生一次请求，接收端可按文章 URL 和总结时间自行处理重复数据。
