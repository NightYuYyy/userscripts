# 网页智能总结 通用版

任意网页 AI 总结 + 追问。由 `linux-do-summary` 通用化改造而来，全网匹配。

- 匹配：`*://*/*`
- 版本：1.0
- 作者：半杯无糖、WolfHolo、徐夏烟（原版）；通用化改造 by DSH（MIT）

## 与 linux-do-summary 的差异

1. 全网匹配；内容提取分层：选中文字 > Discourse API > Readability > 内置启发式 > 整页兜底。
2. 任意 Discourse 论坛自动走 JSON API，保留楼层与回复链。
3. 请求用 `GM_xmlhttpRequest`，不受页面 CSP 限制，`fetch` 仅兜底。
4. 修复 SSE 跨包丢字、流式渲染 O(n²)；新增「停止」按钮。
5. 对话历史滑动窗口，超长内容自动截断（头 70% + 尾 30%）。

## 用法

1. 安装后任意页面按 `Ctrl+Shift+S` 或点悬浮按钮打开侧边栏。
2. 设置中填写 API 地址（默认 DeepSeek `https://api.deepseek.com/v1/chat/completions`）、API Key、模型名。
3. 选中一段文字再打开侧边栏可只总结选中内容。`Esc` 关闭。

## 配置项（存于 GM 存储）

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `apiUrl` | `https://api.deepseek.com/v1/chat/completions` | OpenAI 兼容接口地址 |
| `apiKey` | 空 | 密钥 |
| `model` | `deepseek-chat` | 模型名 |

## 更新记录

- 1.0：首个通用版。
