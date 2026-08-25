# QQ Bot Worker Contracts

## 1. Scope / Trigger

适用于本项目的 Cloudflare Worker 入口、每日推送、GitHub Raw 内容读取、Front Matter 解析和 QQ Bot HTTP 适配。该规范在新增或修改环境变量、Cron、Webhook、消息发送接口时必须同步检查。

## 2. Signatures

```ts
interface MessageSender {
  sendToGroup(groupId: string, message: OutboundMessage, opts?: SendOptions): Promise<SendResult>;
  sendToUser(userOpenid: string, message: OutboundMessage, opts?: SendOptions): Promise<SendResult>;
}

function parseFrontMatter(markdown: string): ParsedContent;
function buildMessage(content: ParsedContent): OutboundMessage;
function verifyWebhookSignature(input: {
  botSecret: string;
  signatureHex: string;
  timestamp: string;
  rawBody: string;
}): boolean;
function signCallbackVerification(input: {
  botSecret: string;
  eventTs: string;
  plainToken: string;
}): string;
```

## 3. Contracts

### Environment

- `CONTENT_BASE_URL`: GitHub Raw 内容目录；Worker 追加 `YYYY-MM-DD.md`。
- `GROUP_IDS`: JSON 数组或逗号分隔的群 `openid`。
- `TIMEZONE`: 当前部署提示值，MVP 按北京时间 UTC+8 解释日期。
- `QQ_BOT_ID`（AppID）、`QQ_BOT_SECRET`（AppSecret，access_token 与 webhook 签名共用）: Secret，不提交到仓库。
- `DEBUG_LOG_IDS`: 一次性调试开关（`vars`，默认 `"false"`）。值为 `"true"`（不区分大小写）时，群 @ 事件打印 `groupOpenid` + `userOpenid`，私聊事件打印 `userOpenid`，均含事件类型、不含消息正文；其它值/缺省不打印。

### Content

输入 Markdown 必须以 YAML Front Matter 包围：`type` 必须为 `puzzle`、`knowledge` 或 `story`；`puzzle` 必须有字符串 `source`，其他类型可省略；正文原样保留。

### Webhook

- 回调校验请求：`{"op":13,"d":{"plain_token":"...","event_ts":"..."}}`，不要求 `X-Signature-*` 头。响应为 `{"plain_token":"...","signature":"..."}`。
- 回调校验签名：用 Secret 派生 Ed25519 私钥，对 `event_ts + plain_token` 签名并返回小写 hex。
- 普通事件：使用 `X-Signature-Timestamp + 原始请求体` 验证 `X-Signature-Ed25519`，缺失/非法时返回 HTTP 401。
- 已验证的未知事件返回 200 且不发送消息；群 @ 与私聊事件均路由命令（`/今日谜题`、`/聊天ID`）。
- `/聊天ID` 命令（群聊与私聊均可用，无需 content 依赖）：群 @ 回复「群 openid: xxx」+「发送者 openid: xxx」，私聊回复「发送者 openid: xxx」；无上下文时回复「未获取到 ID」。命令始终可用，不受 `DEBUG_LOG_IDS` 开关控制。
- 事件解析提取 `author.user_openid`（群 @ / 私聊）与 `author.member_openid`（群 @）到 `WebhookEvent.userOpenid` / `memberOpenid`，供调试日志与 `/聊天ID` 命令使用。

### Cron

- 工作日 08:00 北京时间：`0 0 * * MON-FRI`。
- 周末 10:00 北京时间：周六 `0 2 * * SAT`、周日 `0 2 * * SUN`。
- Cloudflare Cron 的星期字段是 1-7（1=周日、7=周六），与标准 cron 的 0=周日不同；本项目用 3 字母缩写（`MON-FRI` / `SAT` / `SUN`）表达星期以避免歧义。
- 当日文件不存在、上游失败或内容无效时记录诊断错误并跳过发送，不回退旧内容。

### 部署形态

同一套业务逻辑（webhook 验签、每日推送、内容解析、QQ 发送）在两个运行时上运行，入口分别为 `src/index.ts`（Cloudflare Worker）与 `scf/index.ts`（腾讯云 SCF），依赖图经 `src/bootstrap.ts` 的 `buildServices` / `handleVerifiedEvent` / `runDailyPush` 共用，行为保持一致。

- Cloudflare Worker：`scheduled` 由 `wrangler.jsonc` 的 5 字段 cron 触发（`0 0 * * MON-FRI`、`0 2 * * SAT`、`0 2 * * SUN`，星期用 3 字母缩写）。
- 腾讯云 SCF：单事件函数，`main_handler` 按 `event.Type === "Timer"` 分流到每日推送，其余按函数 URL HTTP 事件处理。定时触发器用 7 字段 cron `秒 分 时 日 月 星期 年`，星期 `0-6`/`SUN-SAT`（0=周日），按 UTC+8 运行：工作日 08:00 `0 0 8 ? * MON-FRI *`、周六 10:00 `0 0 10 ? * SAT *`、周日 10:00 `0 0 10 ? * SUN *`。函数 URL 事件中 `event.body` 为原始字符串（非 base64），`event.headers` key 可能全小写（签名头需大小写不敏感查找），响应返回集成响应 `{ statusCode, headers, body }`。

## 4. Validation & Error Matrix

| 条件 | 行为 |
| --- | --- |
| 缺失/非法 `type` | `FrontMatterError`，不发送 |
| `puzzle` 缺失 `source` | `FrontMatterError`，不发送 |
| GitHub 404 | `ContentNotFoundError`，Cron 跳过 |
| GitHub 其他非 2xx/网络失败 | `UpstreamError`，Cron 跳过 |
| op=13 缺 `plain_token` 或 `event_ts` | 不当作校验请求，进入普通签名校验并拒绝 |
| 普通 Webhook 缺失/错误签名 | 401 |
| 未知但已验签事件 | 200，不回复 |
| 未配置群 ID | 记录原因，不发送 |

## 5. Good / Base / Bad Cases

- Good：`puzzle` 文件含合法 source；Cron 构建 `【今日谜题】`、Markdown 正文和指定结尾，逐个发送到 `GROUP_IDS`。
- Base：`knowledge`/`story` 可没有 source；消息只含对应标题和正文。
- Bad：将 op=13 当成普通事件要求 `X-Signature-*`，或只返回 `{challenge}`；这会导致 QQ 回调地址配置失败。

## 6. Tests Required

- Front Matter：三种 type、缺 type、未知 type、puzzle 缺 source、坏 YAML、正文保留。
- 消息构建：标题、正文、puzzle 结尾和非 puzzle 无额外结尾。
- 内容服务：日期 URL、404、非 2xx、网络错误。
- Daily：成功推送、多群、缺失/上游错误跳过、业务层不泄漏 QQ 字段。
- Webhook：独立复算 op=13 `event_ts + plain_token` 签名；无签名头握手成功；普通事件缺失/篡改签名拒绝；未知事件不崩溃。
- 命令：`/聊天ID` 在群 / 私聊 / 无上下文三种输入下返回正确 ID 文本；`QQBotAdapter.sendToUser` 构造正确 URL（`POST /v2/users/<openid>/messages`）与 `Authorization: QQBot <token>` 头并回填 `messageId`。
- 工程：`npm test`、`npm run typecheck`、`npm run build` 必须通过。

## 7. Wrong vs Correct

### Wrong

```ts
if (!signature || !timestamp) return new Response("invalid signature", { status: 401 });
if (payload.op === 13) return Response.json({ challenge: payload.d.challenge });
```

### Correct

```ts
if (payload.op === 13 && payload.d?.plain_token && payload.d?.event_ts) {
  return Response.json({
    plain_token: payload.d.plain_token,
    signature: signCallbackVerification({
      botSecret,
      eventTs: payload.d.event_ts,
      plainToken: payload.d.plain_token,
    }),
  });
}
if (!verifyWebhookSignature({ botSecret, signatureHex, timestamp, rawBody })) {
  return new Response("invalid signature", { status: 401 });
}
```
