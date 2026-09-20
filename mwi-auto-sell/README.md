# [银河奶牛] 库存物品一键自动出售

Milky Way Idle 库存物品一键出售。本目录存放不同版本，按需安装其一。

- 匹配：`https://www.milkywayidle.com/game*`

| 文件 | 版本 | 说明 |
| --- | --- | --- |
| `mwi-auto-sell-v1.user.js` | 1.0.7.1 | 第三方原版存档，作者 shenhuanjie（MIT），来源 [GreasyFork #536068](https://greasyfork.org/scripts/536068)。依赖 GM 存储与 Tailwind CDN。 |
| `mwi-auto-sell-v2.user.js` | 2.0.0 | 自写重构版，作者 zhengjiyong（MIT）。逐步轮询等待按钮出现，不用固定延迟，无 GM 权限依赖。 |
| `mwi-auto-sell-v3.user.js` | 3.0.0 | 接口版，作者 zhengjiyong（MIT）。拦截游戏 WebSocket，直接发 `get_market_item_order_books` 取最低卖价、发 `post_market_order` 挂牌，不点任何 UI。推荐。 |

## 用法（三版相同）

1. 进入游戏库存页，选中一个物品。
2. 按 `S`。v1/v2 模拟点击：前往市场 → 新出售挂牌 → 价格 +1 → 最多 → 发布 → 关闭；v3 直接走接口，界面不动，右上角提示结果。
3. 中英文按浏览器语言自动切换。v2 的英文按钮文本尚未实机验证。
4. 三版都绑定 `S`，只安装其一。v3 的按键监听在捕获阶段并阻止传播，即使与旧版共存也只会触发 v3。

## v3 说明

- 价格：与手动点「+」一致，取当前订单簿最低卖价；没有卖单时退到最高买价；两者都没有则报错不挂牌。
- 数量：整组库存，精确值来自 `init_character_data` / `items_updated` 消息，不受界面缩写（如 `683M`）影响。
- 强化等级：从选中物品 DOM 的 `Item_enhancementLevel__` 徽标读取，无徽标按 0。
- 报文格式取自游戏 JS 包 `sendPostMarketOrder` 定义，与客户端自身发送的一致。
- 配置：`CONFIG.hotkey`（默认 `s`）、`CONFIG.replyTimeout`（等待服务器回复毫秒数，默认 3000）。

## v2 配置（脚本顶部 `CONFIG`）

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `hotkey` | `s` | 触发快捷键 |
| `stepTimeout` | `3000` | 每步等待按钮出现的最长毫秒数 |
| `pollInterval` | `50` | 轮询间隔毫秒 |
| `priceClicks` | `1` | 点击价格「+」的次数，0 表示按最佳出售报价挂牌 |

## 更新记录

- v3 3.0.0：接口版。WebSocket 直发，不点 UI；捕获阶段热键避免与旧版冲突。
- v2 2.0.0：重写。选择器来自 2026-09 实际 DOM 抓取。
- v1 1.0.7.1：原版存档。
