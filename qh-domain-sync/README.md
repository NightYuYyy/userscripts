# qh 域名池同步 → GPT_Execl

从临时邮箱平台 **qh（mail.aixhan.com）** 拉取域名列表，按「上传日期」筛选后，一键导入到 **GPT_Execl 后台（`152.53.54.94:8000`）** 的 MoeMail 域名池。

## 匹配站点

- `http://152.53.54.94:8000/*`、`https://152.53.54.94:8000/*`（GPT_Execl 后台，导入目标）
- 跨域访问 `mail.aixhan.com`（数据来源，通过 `@connect` + `GM_xmlhttpRequest`）

## 为什么需要它

- qh 的域名由 AutoDNS **按天分批新增**（目前 5000+ 个），手动搬运不现实。
- qh 的域名管理接口 `/api/v1/domains` **只认登录 JWT，不认 API Key**，所以脚本用账号密码自动换 JWT。
- GPT_Execl 域名池支持 `*.xxx.sbs` 通配（注册时随机生成子域名），与 qh 域名格式天然一致，原样导入即可。

## 用法

1. 安装脚本后打开 `http://152.53.54.94:8000/` 任意页面（需已登录后台，脚本靠该 session cookie 写入）。
2. 右下角出现「⇪ 同步 qh 域名」按钮，点击打开面板。
3. 首次使用会弹窗要求输入 qh 用户名和密码（存本地浏览器，见下）。
4. 首次打开会全量拉取一次并**缓存到本地**；之后打开秒开（读缓存，不重新拉）。域名按**上传日期**（浏览器本地时区）分组列出，每组显示数量及「池中已有」数。
   - **增量刷新**：从最新往下翻，遇到已缓存域名即停 —— 通常只拉 1 页而非 26 页，用于日常同步新增的域名批次。
   - **全量重建**：忽略缓存整表重拉，用于同步 qh 上已删除的域名。
5. 勾选要导入的日期（默认全选，可「全选 / 全不选」）。
6. 选择写入方式：
   - **覆盖池**：用所选域名整包替换当前池（qh 作为唯一来源；被移除域名的注册统计会被后端一并清理）。
   - **追加去重**：把所选域名并入现有池，重复自动去重，不删除现有域名。
7. 点「导入到 :8000 域名池」，写入成功后 3 秒自动刷新页面。

## 配置项（均存于油猴 `GM_setValue`，仅本地，不外发第三方、不进仓库）

| 键 | 说明 | 默认 |
| --- | --- | --- |
| `qh_base` | qh 平台地址 | `https://mail.aixhan.com` |
| `qh_user` | qh 登录用户名 | 首次弹窗输入 |
| `qh_pass` | qh 登录密码 | 首次弹窗输入 |
| `qh_jwt` | 缓存的 JWT，距过期不足 1 天时自动重新登录 | 自动 |
| `qh_domains` | 缓存的全量域名（`{name,createdAt}` 列表） | 自动 |
| `qh_domains_ts` | 缓存最后刷新时间 | 自动 |

面板底部「重置 qh 凭据（并清缓存）」可清除本地保存的用户名、密码、JWT 及域名缓存。

## 接口说明

**数据来源 qh：**
- `POST /api/v1/auth/login` `{username,password}` → `data.token`（JWT，约 30 天）
- `GET /api/v1/domains?limit=200&offset=N` + `Authorization: Bearer <JWT>`；每页封顶 200，`data.total` 为总数，`data.items[].{name,createdAt,enabled,catchAll}`

**导入目标 GPT_Execl：**
- `GET /api/settings` → `settings.moemail_domains`（换行分隔，追加模式据此合并）
- `POST /api/settings` `{settings:{moemail_domains,moemail_domain}}`（按键增量 upsert，靠 session cookie 鉴权）

## 更新记录

- **1.1.0**：新增本地缓存与**增量拉取**。开面板读缓存秒开；「增量刷新」利用 qh 列表按 createdAt 倒序的特性，翻到已缓存域名即停（实测：缺最新一天只拉 2 页，缓存已最新只拉 1 页，替代原来固定 26 页全量）；保留「全量重建」同步删除。
- **1.0.0**：首个版本。qh 登录换 JWT + 分页拉全量域名，按上传日期分组筛选，覆盖/追加两种写入方式导入 GPT_Execl 域名池。
