# userscripts

个人油猴（Tampermonkey / Violentmonkey）脚本仓库。每个脚本一个目录，目录内有独立 README 说明用法。

## 脚本列表

<!-- scripts:start -->
| 脚本 | 版本 | 匹配 | 说明 | 安装 |
| --- | --- | --- | --- | --- |
| [Linux.do 智能总结 原生](linux-do-summary/) | 5.3 | `https://linux.do/*` | Linux.do 帖子总结 - 沉浸式原生风格版 | [安装](https://raw.githubusercontent.com/NightYuYyy/userscripts/main/linux-do-summary/linux-do-summary.user.js) |
| [\[银河奶牛\]库存物品一键自动出售（极速版）](mwi-auto-sell/) | 1.0.7.1 | `https://www.milkywayidle.com/game*` | 一键自动出售库存中指定物品，智能优化操作延迟，提升游戏效率，在原有插件的基础上优化了出售物品的速度，快捷键:S | [安装](https://raw.githubusercontent.com/NightYuYyy/userscripts/main/mwi-auto-sell/mwi-auto-sell-v1.user.js) |
| [\[银河奶牛\]库存物品一键自动出售（极速版）v2](mwi-auto-sell/) | 2.0.0 | `https://www.milkywayidle.com/game*` | 选中库存物品后按 S：前往市场 → 新出售挂牌 → 价格+1 → 最多 → 发布 → 关闭。逐步轮询等待按钮出现，无固定延迟。 | [安装](https://raw.githubusercontent.com/NightYuYyy/userscripts/main/mwi-auto-sell/mwi-auto-sell-v2.user.js) |
| [\[银河奶牛\]库存物品一键自动出售（接口版）v3](mwi-auto-sell/) | 3.1.0 | `https://www.milkywayidle.com/game*` | 选中库存物品后按 S 按最低卖价挂牌整组，按 D 即时卖给最高买单。直接走游戏 WebSocket，不点任何按钮。 | [安装](https://raw.githubusercontent.com/NightYuYyy/userscripts/main/mwi-auto-sell/mwi-auto-sell-v3.user.js) |
| [网页智能总结 通用版](page-summary/) | 1.0 | `*://*/*` | 任意网页 AI 总结 + 追问 - 论坛/文章/整页自动识别，Discourse 站点走专线 API | [安装](https://raw.githubusercontent.com/NightYuYyy/userscripts/main/page-summary/page-summary.user.js) |
| [ReClaude 额度悬浮角标](reclaude-quota-badge/) | 1.0 | `*://*/*` | 任意网页右下角悬浮显示 ReClaude 拼车 5h 剩余额度 + 刷新倒计时 + 号状态。走 API Key(Bearer),不依赖 cookie,全局可用。菜单里设置 Key / 显隐。 | [安装](https://raw.githubusercontent.com/NightYuYyy/userscripts/main/reclaude-quota-badge/reclaude-quota-badge.user.js) |
<!-- scripts:end -->

## 安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey。
2. 点击上表「安装」链接，脚本管理器会自动弹出安装页。

## 目录结构

```
<script-name>/
  <script-name>.user.js   # 脚本本体，目录名与文件名用 kebab-case；多版本用 -v1/-v2 后缀并列
  README.md               # 该脚本的用法、配置、更新记录
scripts/gen-readme.mjs    # 从各脚本头部元数据重新生成上面的表格
```

新增或修改脚本后运行 `node scripts/gen-readme.mjs` 刷新本表。
