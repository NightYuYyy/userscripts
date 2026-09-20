# [银河奶牛] 库存物品一键自动出售

Milky Way Idle 库存物品一键出售。本目录存放不同版本，按需安装其一。

- 匹配：`https://www.milkywayidle.com/game*`

| 文件 | 版本 | 说明 |
| --- | --- | --- |
| `mwi-auto-sell-v1.user.js` | 1.0.7.1 | 第三方原版存档，作者 shenhuanjie（MIT），来源 [GreasyFork #536068](https://greasyfork.org/scripts/536068)。依赖 GM 存储与 Tailwind CDN。 |
| `mwi-auto-sell-v2.user.js` | 2.0.0 | 自写重构版，作者 zhengjiyong（MIT）。逐步轮询等待按钮出现，不用固定延迟，无 GM 权限依赖。 |

## 用法（两版相同）

1. 进入游戏库存页，选中一个物品。
2. 按 `S`：前往市场 → 新出售挂牌 → 价格 +1 → 最多 → 发布 → 关闭。
3. 中英文按浏览器语言自动切换。v2 的英文按钮文本尚未实机验证。

## v2 配置（脚本顶部 `CONFIG`）

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `hotkey` | `s` | 触发快捷键 |
| `stepTimeout` | `3000` | 每步等待按钮出现的最长毫秒数 |
| `pollInterval` | `50` | 轮询间隔毫秒 |
| `priceClicks` | `1` | 点击价格「+」的次数，0 表示按最佳出售报价挂牌 |

## 更新记录

- v2 2.0.0：重写。选择器来自 2026-09 实际 DOM 抓取。
- v1 1.0.7.1：原版存档。
