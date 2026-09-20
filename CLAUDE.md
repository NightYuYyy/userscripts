# AGENTS.md

个人油猴脚本仓库。本文件与 `CLAUDE.md` 内容保持一致，修改一个必须同步另一个。

## 仓库结构

- 每个脚本一个目录，目录名与脚本文件名用 kebab-case，脚本以 `.user.js` 结尾。
- 每个脚本目录必须有 `README.md`：用途、匹配站点、用法、配置项、更新记录。
- 根 `README.md` 的脚本表格由 `scripts/gen-readme.mjs` 生成，位于 `<!-- scripts:start -->` 与 `<!-- scripts:end -->` 之间，不要手改。
- 无依赖、无构建，Node 22+ 仅用于运行生成脚本。

## 修改脚本时

1. 更新脚本头部 `@version`（语义化版本）。`@name`、`@description`、`@match` 是根 README 表格的来源，保持准确。
2. 更新该目录 `README.md` 的用法、配置项和「更新记录」。
3. 运行 `node scripts/gen-readme.mjs` 刷新根 README。
4. 提交信息格式：`<script-dir>: <改动摘要>`，例如 `page-summary: 修复 SSE 丢字`。

## 新增脚本时

1. 新建目录 `<script-name>/`，放入 `<script-name>.user.js`，头部元数据完整（`@name`、`@namespace`、`@version`、`@description`、`@match`、`@grant`、`@license`）。
2. 新建该目录 `README.md`（可参考 `page-summary/README.md`）。
3. 运行 `node scripts/gen-readme.mjs`。

## 约束

- 不提交任何 API Key、Token；密钥只通过 `GM_setValue` 存在用户本地。
- 引入第三方脚本时保留原作者、许可证与来源链接。
- 不引入打包器、lint 或测试框架，除非用户明确要求。
