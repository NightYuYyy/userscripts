# ReClaude 额度悬浮角标

任意网页右下角悬浮显示 ReClaude 拼车 5 小时额度、下次刷新倒计时、号状态。全局可用(`@match *://*/*`)。

## 认证:API Key(不用 cookie)

走 ReClaude 公开接口 `GET /api/v1/carpool/quota`,`Authorization: Bearer <key>`。用 `GM_xmlhttpRequest` + `@connect www.reclaude.ai`,不依赖登录 cookie,所以不受同源/SameSite 限制,任何网页都能显示。

获取 Key:登录 https://www.reclaude.ai → 设置页生成 API Key(`rck_` 开头)。

## 用法

1. 安装脚本。
2. 油猴菜单 →「设置 API Key」→ 粘贴 `rck_...`,保存后即显示。
3. 角标可拖动(记住位置);菜单「显示/隐藏角标」可收起。

Key 只通过 `GM_setValue` 存在本地浏览器,不写进脚本、不进仓库。

## 显示内容

- `剩余 $X / 上限` —— `quota_usd - used_usd`
- `刷新 Hh Mm` —— 距 `resets_at_ms` 的倒计时
- `⚠ <state>` + 变红 —— `state != active`(停用/异常);HTTP 错误或离线也变红

## 配置

脚本顶部 `REFRESH_MS`(默认 60s)。数据源固定为拼车 5h 额度接口;如需别的窗口(周额度等)改 `API` 与 `paint()`。

## 更新记录

- 1.0 首版:API Key 认证,全局悬浮,拖动记忆位置,菜单设置 Key/显隐。
