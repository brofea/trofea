# QQ Bot SCF Contracts

## 1. Scope / Trigger

适用于腾讯云 SCF 事件函数入口、Timer 每日推送、GitHub Raw 内容读取、Front Matter 解析和 QQ Bot HTTP 适配。

入口为 `scf/index.ts`，构建后的 Handler 为 `index.main_handler`。同一个事件函数配置 Function URL 与 Timer Trigger。

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

## 3. Environment

线上只配置五个业务变量：

- `CONTENT_BASE_URL`: GitHub Raw 内容目录。
- `GROUP_IDS`: 逗号分隔的群 `openid`。
- `QQ_BOT_APP_ID`: QQ Bot AppID。
- `QQ_BOT_APP_SECRET`: QQ Bot AppSecret，同时用于 Token 和 WebHook 签名。
- `ADMIN_OPENID`: 库存不足提醒的管理员 C2C OpenID。

不提交 `.env`、AppSecret 或 Access Token。

## 4. Content

输入 Markdown 必须包含 YAML Front Matter：`type` 为 `puzzle`、`knowledge` 或 `story`；`puzzle` 必须有 `source`；正文原样保留。

文件不存在或 Front Matter 无效视为缺失/无效内容。GitHub 网络失败是上游错误，不应误判为库存缺失。

`/历史谜题 <date>` 必须返回指定日期的内容：当内容为 `knowledge` 或 `story` 时，返回原有 Markdown，且在标题前加上 `这一天没有谜题`；仅在内容缺失时返回无内容提示。

## 5. WebHook

- `op=13` 回调校验优先于普通签名校验；用 `event_ts + plain_token` 签名并返回 `plain_token` 与 `signature`。
- 普通事件使用 `X-Signature-Timestamp + 原始 body` 验证 `X-Signature-Ed25519`；缺失或非法时返回 HTTP 401。
- 已验证的普通事件由同一次 SCF 调用完成轻量业务后返回 `{"op":12,"d":0}`。
- 未知但已验签事件返回成功 ACK，不发送消息。
- Function URL 为公开访问，安全边界由 QQ WebHook 签名验证提供。

## 6. QQ API

- Token：`https://bots.qq.com/app/getAppAccessToken`。
- OpenAPI：`https://api.sgroup.qq.com`。
- 群消息：`POST /v2/groups/{group_openid}/messages`。
- C2C 消息：`POST /v2/users/{openid}/messages`。
- 命令回复携带 `msg_id`；Timer 群推送和管理员库存提醒不携带 `msg_id`。

## 7. Timer

- 工作日 08:00、周末 10:00，日期业务逻辑固定按 `Asia/Shanghai` 计算。
- Timer 事件的 `Time` 字段不作为业务日期来源。
- 当日内容缺失或无效时跳过群推送；库存检查仍然执行。
- 多群发送逐群独立，失败只记录日志，不实现持久化重试和去重。

## 8. Tests Required

- Front Matter：三种 type、缺 type、未知 type、puzzle 缺 source、坏 YAML、正文保留。
- 消息构建：三种标题、puzzle 结尾、命令场景非 puzzle 提示、库存提醒。
- 命令路由：历史 puzzle 的完整渲染不变；历史 `knowledge` 和 `story` 在 `这一天没有谜题` 提示后保留标题和正文。
- 内容服务：北京时间日期 URL、404、非 2xx、网络错误。
- QQ Adapter：Token/OpenAPI 两个地址、群/C2C 路径、被动 `msg_id`、主动消息。
- WebHook：op=13、普通事件签名、非法签名、未知事件 ACK。
- SCF：Timer 分流、Function URL 请求头大小写不敏感、标准响应。
- 工程：`npm test`、`npm run typecheck`、`npm run build:scf` 必须通过。
