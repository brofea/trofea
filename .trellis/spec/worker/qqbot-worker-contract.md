# QQ Bot Worker Contracts

## 1. Scope / Trigger

适用于本项目的 Cloudflare Worker 入口、每日推送、GitHub Raw 内容读取、Front Matter 解析和 QQ Bot HTTP 适配。该规范在新增或修改环境变量、Cron、Webhook、消息发送接口时必须同步检查。

## 2. Signatures

```ts
interface MessageSender {
  sendToGroup(groupId: string, message: OutboundMessage, opts?: SendOptions): Promise<SendResult>;
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
- `QQ_APP_ID`、`QQ_CLIENT_SECRET`、`QQ_BOT_SECRET`: Secret，不提交到仓库。

### Content

输入 Markdown 必须以 YAML Front Matter 包围：`type` 必须为 `puzzle`、`knowledge` 或 `story`；`puzzle` 必须有字符串 `source`，其他类型可省略；正文原样保留。

### Webhook

- 回调校验请求：`{"op":13,"d":{"plain_token":"...","event_ts":"..."}}`，不要求 `X-Signature-*` 头。响应为 `{"plain_token":"...","signature":"..."}`。
- 回调校验签名：用 Secret 派生 Ed25519 私钥，对 `event_ts + plain_token` 签名并返回小写 hex。
- 普通事件：使用 `X-Signature-Timestamp + 原始请求体` 验证 `X-Signature-Ed25519`，缺失/非法时返回 HTTP 401。
- 已验证的未知事件返回 200 且不发送消息；群 @ 事件只路由最小 `/今日谜题` 指令。

### Cron

- 工作日 08:00 北京时间：`0 0 * * 1-5`。
- 周末 10:00 北京时间：周日 `0 2 * * 0`、周六 `0 2 * * 6`。
- Cloudflare Cron 不支持星期字段的逗号分隔（如 `0,6`），必须拆成多条表达式。
- 当日文件不存在、上游失败或内容无效时记录诊断错误并跳过发送，不回退旧内容。

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
