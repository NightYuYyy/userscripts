# userscripts

个人油猴（Tampermonkey / Violentmonkey）脚本仓库。每个脚本一个目录，目录内有独立 README 说明用法。

## 脚本列表

<!-- scripts:start -->
| 脚本 | 版本 | 匹配 | 说明 | 安装 |
| --- | --- | --- | --- | --- |
| [Linux.do 智能总结 原生](linux-do-summary/) | 5.3 | `https://linux.do/*` | Linux.do 帖子总结 - 沉浸式原生风格版 | [安装](https://raw.githubusercontent.com/NightYuYyy/userscripts/main/linux-do-summary/linux-do-summary.user.js) |
| [\[银河奶牛\]库存物品一键自动出售（极速版）](mwi-auto-sell/) | 1.0.7.1 | `https://www.milkywayidle.com/game*` | 一键自动出售库存中指定物品，智能优化操作延迟，提升游戏效率，在原有插件的基础上优化了出售物品的速度，快捷键:S | [安装](https://raw.githubusercontent.com/NightYuYyy/userscripts/main/mwi-auto-sell/mwi-auto-sell.user.js) |
| [网页智能总结 通用版](page-summary/) | 1.0 | `*://*/*` | 任意网页 AI 总结 + 追问 - 论坛/文章/整页自动识别，Discourse 站点走专线 API | [安装](https://raw.githubusercontent.com/NightYuYyy/userscripts/main/page-summary/page-summary.user.js) |
<!-- scripts:end -->

## 安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey。
2. 点击上表「安装」链接，脚本管理器会自动弹出安装页。

## 目录结构

```
<script-name>/
  <script-name>.user.js   # 脚本本体，目录名与文件名用 kebab-case
  README.md               # 该脚本的用法、配置、更新记录
scripts/gen-readme.mjs    # 从各脚本头部元数据重新生成上面的表格
```

新增或修改脚本后运行 `node scripts/gen-readme.mjs` 刷新本表。
