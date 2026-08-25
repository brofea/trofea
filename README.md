# 香芋派，菠萝派的替身

## 目前功能

基于 Cloudflare Worker 的 QQ Bot 后端：每日按北京时间从公开 GitHub 仓库读取 Markdown，向配置的 QQ 群推送「今日谜题 / 今日知识 / 今日故事」，并通过 QQ Bot Webhook 处理群内指令。

QQ 平台细节被隔离在适配层；业务层（内容获取、Front Matter 解析、消息构建、指令、调度）只依赖平台无关接口，便于未来扩展其它消息平台。

---

## 架构

```
GitHub Raw ── ContentService ── MessageBuilder ── DailyService ──┐
                                          │                      │
                                    CommandRouter                ▼
                                          │              MessageSender (接口)
 QQ Bot Webhook ── Webhook 校验/路由 ──────┘                      │
                                                                 ▼
                                                           QQBotAdapter
                                                          (token / 群消息)
                                                                 │
                                                          QQ Bot OpenAPI
```

- `src/types.ts` — 领域契约（`ParsedContent`、`OutboundMessage`、`MessageSender` 输入），平台无关。
- `src/errors.ts` — 诊断错误（上游/缺失/解析/命令/适配）。
- `src/config.ts` / `src/env.ts` — Env → 强类型 `AppConfig`。
- `src/utils/date.ts` — 北京时间（UTC+8）日期工具。
- `src/utils/frontmatter.ts` — YAML Front Matter 解析（`js-yaml`）。
- `src/content/service.ts` — 从 `CONTENT_BASE_URL/YYYY-MM-DD.md` 获取并解析。
- `src/message/builder.ts` — 三种消息模板（保留 Markdown 正文）。
- `src/daily/service.ts` — 调度编排：当日内容 → 配置的群。
- `src/commands/router.ts` — `/今日谜题`、`/聊天ID` 指令。
- `src/adapter/qqbot.ts` — `QQBotAdapter`：access_token 缓存、v2 群/私聊消息发送。
- `src/adapter/webhook.ts` — Ed25519 事件签名校验、回调地址校验签名、事件解析。
- `src/adapter/types.ts` — `MessageSender` 接口、`WebhookEvent`。
- `src/index.ts` — Worker 入口（`fetch` + `scheduled`）。

---

## 内容格式

文件名：`YYYY-MM-DD.md`（按北京时间）。

```md
---
type: puzzle
source: https://example.com/problem
---

这里是 Markdown 正文，**完整保留**。
```

| 字段     | 必填 | 规则                                   |
| -------- | ---- | -------------------------------------- |
| `type`   | 是   | `puzzle` / `knowledge` / `story`       |
| `source` | 否   | `type=puzzle` 时必填（原题链接）       |

### 消息模板（PRD §5）

```
【今日XX】

<Markdown 正文>

<结尾>
```

- `puzzle` 结尾：`欢迎各位使用尝试实现，有任何疑问欢迎提问！` + `原题链接：` + `source`
- `knowledge` / `story`：无额外结尾。

---

## Cron 计划（北京时间 → UTC）

Cloudflare Cron 使用 UTC。北京时间 UTC+8 的换算：

| 北京时间        | UTC             | Cron 表达式       |
| --------------- | --------------- | ----------------- |
| 工作日 08:00    | 00:00 周一–周五 | `0 0 * * MON-FRI` |
| 周六 10:00      | 02:00 周六      | `0 2 * * SAT`     |
| 周日 10:00      | 02:00 周日      | `0 2 * * SUN`     |

三条表达式都在 `wrangler.jsonc` 的 `triggers.crons` 中，Cloudflare 会按各自时间触发 `scheduled`。Cloudflare Cron 的星期字段是 1-7（1=周日、7=周六），与标准 cron 的 0=周日不同，因此本项目用 3 字母缩写表达星期以避免歧义。代码内一律以 UTC+8 解释“今天”。

### 错误策略（已批准决策）

- 当日内容 `404` 或上游不可用 → 记录诊断错误并**跳过本次发送**，不回退旧内容、不发占位内容。

---

## 环境变量

### 非敏感变量（`wrangler.jsonc` 的 `vars`，或 Dashboard 配置）

| 变量               | 说明                                          | 示例                                              |
| ------------------ | --------------------------------------------- | ------------------------------------------------- |
| `CONTENT_BASE_URL` | GitHub Raw 内容目录（末尾可带可不带 `/`）      | `https://raw.githubusercontent.com/user/repo/main/content/` |
| `GROUP_IDS`        | 群 openid，JSON 数组或逗号分隔                 | `["group_openid_1","group_openid_2"]`             |
| `TIMEZONE`         | 提示用，代码内固定 UTC+8                       | `Asia/Shanghai`                                   |
| `DEBUG_LOG_IDS`    | 一次性调试开关：`"true"`（不区分大小写）时在群 @ / 私聊事件打印群/用户 openid，用完改回 `"false"` | `false`                                           |

### 敏感凭证（用 Secret 注入，不要写入仓库）

```bash
npx wrangler secret put QQ_BOT_ID      # 开放平台 AppID
npx wrangler secret put QQ_BOT_SECRET  # 开放平台 AppSecret（access_token 与 webhook 签名共用）
```

> `QQ_BOT_SECRET`（AppSecret）一值两用：作为 `clientSecret` 调用 `https://api.bot.qq.com/app/getAppAccessToken` 换取 `access_token`（默认 7200s，缓存到过期前 60s 刷新）；同时用于事件签名校验（`X-Signature-Ed25519` / `X-Signature-Timestamp`）与回调地址校验签名（`event_ts + plain_token`），均按官方算法从 secret 派生 Ed25519 密钥。
本地开发可用 `.dev.vars`（已被 `.gitignore` 忽略）：

```ini
QQ_BOT_ID=your_app_id
QQ_BOT_SECRET=your_app_secret
```

---

## QQ Bot 协议说明

适配层按当前官方 QQ 机器人开放平台协议实现（核对自 https://bot.q.qq.com/wiki/develop/api-v2/ ）：

- **鉴权**：`POST https://api.bot.qq.com/app/getAppAccessToken`，body `{ appId, clientSecret }` → `{ access_token, expires_in }`。调用 OpenAPI 时头 `Authorization: QQBot <access_token>`。
- **发群消息**：`POST https://api.bot.qq.com/v2/groups/{group_openid}/messages`，body `{ msg_type, markdown|content, msg_id?, msg_seq? }`（`msg_type=2` Markdown / `0` 纯文本）。
- **发私聊消息**：`POST https://api.bot.qq.com/v2/users/{user_openid}/messages`，body 字段与群消息一致，用于 C2C 被动回复（`/聊天ID` 等）。
- **Webhook 事件签名校验**：Ed25519。`seed = 重复 botSecret 至 ≥32 字节取前 32`；`publicKey = Ed25519.fromSeed(seed)`；`msg = timestamp + rawBody`；`verify(publicKey, msg, hexDecode(X-Signature-Ed25519))`。缺失/非法签名一律 401。
- **回调地址校验**：配置回调时 QQ 发 `{"op":13,"d":{"plain_token","event_ts"}}`（不带 `X-Signature` 头），Worker 用 Bot Secret 派生的私钥对 `event_ts + plain_token` 签名，回填 `{"plain_token","signature"}`（hex）。此校验在事件签名校验之前处理。

### 与 PRD 抽象的关系

PRD 要求“发送接口不把业务层锁死在平台字段名上”。`MessageSender` 接口只接受 `OutboundMessage`（`kind` + `text`）与目标 openid 参数（群 `sendToGroup` / 私聊 `sendToUser`），`msg_type` / `markdown` / `group_openid` 等 QQ 字段仅存在于 `QQBotAdapter`，业务层无感知。

> **已知限制**：群消息 Markdown（`msg_type=2`）需机器人在开放平台具备 Markdown 权限并通过审核；被动回复需在群内 @ 机器人事件中携带 `msg_id`（5 分钟有效，每条最多回复 5 次）。若后续 QQ Markdown 兼容不足，在适配层增加转换层即可，业务层与消息模板不变。

---

## 指令（最小安全入口）

处理群 `GROUP_AT_MESSAGE_CREATE` 与私聊 `C2C_MESSAGE_CREATE` 事件中的命令文本（群消息已去除 `<@!数字>` 前缀）：

- `/今日谜题` — 返回当日内容；若当日非 `puzzle`，按 PRD §6.2 追加 `今天没有谜题，休息一下吧`。
- `/聊天ID` — 直接回复 openid，无需日志：
  - 群 @：回复「群 openid: xxx」+「发送者 openid: xxx」
  - 私聊：回复「发送者 openid: xxx」

未识别命令/不支持事件：返回 200 不回复，不崩溃。

---

## 本地验证

```bash
# 1. 安装依赖
npm install

# 2. 类型检查
npm run typecheck        # npx tsc --noEmit

# 3. 单元 + handler 测试（56 项，覆盖解析/构建/日期/调度/上游错误/适配器请求/webhook）
npm test                 # vitest run

# 4. 构建校验（不部署，验证 Worker 在运行时可编译且 wrangler 配置/绑定/cron 正确）
npm run build            # wrangler deploy --dry-run --outdir dist

# 5. 本地起 Worker（需要 .dev.vars 里的真实/沙箱凭证）
npm run dev              # wrangler dev
```

测试覆盖（`test/*.test.ts`）：

| 文件              | 覆盖                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `frontmatter`     | 三类型解析、缺 type、未知 type、puzzle 缺 source、坏 YAML、正文保留 |
| `message`         | 三模板标题/正文/结尾、命令消息追加休息提示                       |
| `date`            | UTC→UTC+8、`formatDate`                                          |
| `content`         | URL 构造、404/5xx/网络错误/空体                                   |
| `adapter`         | token 获取+缓存、群请求体、失败诊断、Ed25519 签名往返、回调地址校验签名、事件路由 |
| `daily`           | 多群推送、缺失/上游错误跳过、不泄漏平台字段                       |
| `router`          | `/今日谜题`、`/聊天ID`（群/私聊/无上下文）、未知命令不回复            |
| `entry`           | 401 无签名、回调地址校验回填、未知事件不崩溃、`DEBUG_LOG_IDS` 调试开关打印 openid |

> 真实 QQ API 鉴权/消息发送受外部凭据限制，未在 CI 联网验证；适配器以契约级桩（记录 fetch 调用 + 真实 Ed25519 签名往返）覆盖。

---

## 部署

```bash
# 1. 配置非敏感变量（已在 wrangler.jsonc 的 vars 中，按需改默认值）
# 2. 注入敏感凭证
npx wrangler secret put QQ_BOT_ID
npx wrangler secret put QQ_BOT_SECRET

# 3. 部署
npm run deploy          # wrangler deploy

# 4. 在 QQ 开放平台管理端配置 Webhook 回调地址
#    https://<your-worker>.workers.dev/
#    并记录/确认 AppSecret（与 QQ_BOT_SECRET 一致）
```

Cron 由 Cloudflare 按 `wrangler.jsonc` 的 `triggers.crons` 自动调度，无需额外配置。

---

## 部署到腾讯云 SCF（事件函数 + 函数 URL + 定时触发器）

`.workers.dev` 被墙导致 QQ 平台无法配置回调地址时，可改为部署到腾讯云 SCF。业务层（webhook 验签、每日推送、内容解析、QQ 发送）均平台无关，本项目新增 `scf/index.ts` 入口与 `build:scf` 打包脚本，Cloudflare 入口（`src/index.ts` + `wrangler.jsonc`）保持不变，两个运行时并存。

### 运行环境

- 函数类型：**事件函数**（Web 函数不支持定时触发器）。
- 运行时：Node.js（20.19 或 18.15 均可），时区设为 `Asia/Shanghai`（不影响内容日期，代码内固定按 UTC+8 解释）。
- 执行方法：`index.main_handler`（入口模块为 CommonJS，由 esbuild 打包输出）。

### 环境变量

与 Cloudflare 部署相同的 6 个变量，在函数「环境变量」中配置：

| 变量               | 说明                                   |
| ------------------ | -------------------------------------- |
| `CONTENT_BASE_URL` | GitHub Raw 内容目录（末尾可带可不带 `/`） |
| `GROUP_IDS`        | 群 openid，JSON 数组或逗号分隔          |
| `TIMEZONE`         | 提示用，代码内固定 UTC+8                |
| `QQ_BOT_ID`        | 开放平台 AppID（敏感）                  |
| `QQ_BOT_SECRET`    | 开放平台 AppSecret（敏感，一值两用）    |
| `DEBUG_LOG_IDS`    | 一次性调试开关，`"true"` 开启            |

### 函数 URL 触发器（Webhook 回调）

1. 为函数创建「函数 URL」触发器，得到形如 `https://<app-id>-<url-id>.<region>.tencentscf.com` 的地址。
2. 将该地址填入 QQ 开放平台的 Webhook 回调地址。
3. 回调地址校验（`op=13`）与事件签名校验逻辑沿用 Cloudflare 版本：入口从事件 `headers`/`body`/`httpMethod` 提取请求并调用 `handleWebhook`，按集成响应 `{ statusCode, headers, body }` 返回。

### 定时触发器（每日推送）

腾讯云定时触发器 cron 为 **7 字段** `秒 分 时 日 月 星期 年`，星期字段 `0-6`/`SUN-SAT`（**0=周日**），按 **UTC+8（北京时间）** 运行：

| 北京时间       | Cron（7 字段）        |
| -------------- | --------------------- |
| 工作日 08:00   | `0 0 8 ? * MON-FRI *` |
| 周六 10:00     | `0 0 10 ? * SAT *`    |
| 周日 10:00     | `0 0 10 ? * SUN *`    |

> 注意：日字段用 `?` 表示“不指定”，避免与星期字段同时指定具体值时产生“或”关系。

### 上传 zip 步骤

```bash
# 1. 打包：产出单文件 dist-scf/index.js（bundle 了 js-yaml 与 tweetnacl，无需上传 node_modules）
npm run build:scf

# 2. 将 dist-scf/index.js 压缩为 zip（入口文件必须位于 zip 根目录，文件名 index.js）
#    Windows 示例（PowerShell）：
#    Compress-Archive -Path dist-scf/index.js -DestinationPath scf.zip
#    该命令生成的 zip 中 index.js 位于根目录（单文件不包外层目录），符合 SCF 要求。

# 3. 在控制台/API 上传 zip，并确认：
#    - 执行方法：index.main_handler
#    - 运行时：Node.js
#    - 时区：Asia/Shanghai
```

---

## 依赖决策

| 依赖          | 用途                        | 选择理由                                   |
| ------------- | --------------------------- | ------------------------------------------ |
| `js-yaml`     | Front Matter YAML 解析       | 成熟、纯 JS、Workers 兼容                  |
| `tweetnacl`   | Webhook Ed25519 签名校验     | 纯 JS、Workers 兼容、自带类型              |

未引入：数据库 SDK、其他消息平台 SDK、QQ 专用 SDK、Markdown→纯文本转换层（按 PRD 第一版完整保留 Markdown）。

`compatibility_flags: ["nodejs_compat"]` 以兼容上述库的 Node 风格全局。

---

## 项目限制 / 警告

- 群 Markdown 发送需平台权限；未通过审核时该类型消息会被拒，需在开放平台申请或退化为纯文本。
- Webhook 端口限制：QQ 仅允许 `80/443/8080/8443`；Workers 默认 443，符合要求。
- 主动群消息受 QQ 频控（未认证 30 qpm，单群每日 1000 条）；每日单次推送远低于上限。
- 单群配置为 MVP；发送接口已参数化群标识，扩展多群无需改业务层。
- 未来日期查询被显式拒绝；日期格式与取值双重校验。
