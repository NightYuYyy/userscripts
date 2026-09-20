# AutoHotkey

桌面小工具脚本，全部 AutoHotkey v2，双击运行。开机自启：把 `.ahk` 的快捷方式放进 `shell:startup`。

| 脚本 | 用途 | 操作 |
| --- | --- | --- |
| `wezterm-toggle.ahk` | `Ctrl+Space` 呼出/隐藏 WezTerm，未启动则拉起 | 托盘退出 |
| `badge.ahk` | 右下角置顶半透明小角标，每 5 秒读同目录 `badge.txt` 显示 | 左键拖动，右键退出 |
| `reclaude-badge.ahk` | ReClaude 拼车 5h 额度卡片：剩余额度 + 已用进度条 + 每秒跳动的刷新倒计时 + 号状态；用量高变黄/红 | 左键拖动，右键退出 |

`badge.txt` 是数据源示例，任何程序往里写字角标就跟着变；要接 HTTP 改 `GetText()`。

`reclaude-badge.ahk` 走 ReClaude API Key（`Authorization: Bearer`，不依赖 cookie）。首次运行会弹框要 Key（`rck_` 开头，ReClaude 设置页生成），存进同目录 `reclaude-badge.ini`（已 gitignore，不进仓库）。`state != active` 或请求失败时角标变红。跨平台同款：Mac 用 curl/SwiftBar 打同一接口 `GET /api/v1/carpool/quota` 即可（AutoHotkey 仅 Windows）。
