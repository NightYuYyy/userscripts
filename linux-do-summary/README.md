# Linux.do 智能总结（原生风格）

在 linux.do 帖子页加一个侧边栏，用大模型总结帖子并支持追问。

- 匹配：`https://linux.do/*`
- 版本：5.3
- 原作者：半杯无糖、WolfHolo、徐夏烟（MIT）

## 用法

1. 安装脚本后打开任意帖子，页面右侧出现悬浮按钮，点击或按 `Ctrl+Shift+S` 打开侧边栏。
2. 首次使用点侧边栏的设置图标，填写 API 地址、API Key、模型名（默认 `deepseek-chat`，接口为 OpenAI 兼容格式）。
3. 点「总结」生成摘要，下方输入框可继续追问；`Esc` 关闭侧边栏。

## 配置项（存于 GM 存储）

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `apiUrl` | `https://api.openai.com/v1/chat/completions` | OpenAI 兼容接口地址 |
| `apiKey` | 空 | 密钥 |
| `model` | `deepseek-chat` | 模型名 |
| `useStream` | `true` | 是否流式输出 |

## 更新记录

- 5.3：当前版本，沉浸式原生风格 UI。
