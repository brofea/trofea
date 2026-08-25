# 新增消息 ID 调试日志开关

## Goal

部署后暂时不知道群 openid 和用户 openid。需要一个开关：开启后，每当有人 @机器人（GROUP_AT_MESSAGE_CREATE）或私聊机器人（C2C_MESSAGE_CREATE），把群 openid 与发送者 openid 打印到 Cloudflare 日志；拿到 ID 后即可关闭，只一次性使用。

## What I already know

- 入口 `src/index.ts` 的 `fetch` 已解析 Webhook 事件，但只路由 `GROUP_AT_MESSAGE_CREATE` 命令，私聊事件（C2C）目前不处理。
- `parseWebhookEvent`（`src/adapter/webhook.ts`）只提取 `groupOpenid`、`msgId`、`content`，**未提取发送者 author 的 openid**。
- 事件结构：群 @ 消息含 `d.group_openid`、`d.author.member_openid`、`d.author.user_openid`；私聊含 `d.author.user_openid`。
- 非敏感配置放 `wrangler.jsonc` 的 `vars`；`Env`/`AppConfig` 在 `src/env.ts`/`src/config.ts`。
- 规范要求：变更环境变量时同步 `README.md` 与 `.trellis/spec/worker/qqbot-worker-contract.md`。

## Assumptions (temporary)

- 只打印 ID，不打印消息正文。

## Open Questions

- （已解决）开关机制 → 环境变量 `DEBUG_LOG_IDS`。
- （已解决）打印字段 → 群 openid + 发送者 user_openid。

## Requirements

- 新增环境变量 `DEBUG_LOG_IDS`（默认关闭），值为 `"true"`（不区分大小写）时开启。
- 开启时，收到 `GROUP_AT_MESSAGE_CREATE`（群 @）打印 `群 openid` + 发送者 `user_openid` + 事件类型。
- 开启时，收到 `C2C_MESSAGE_CREATE`（私聊）打印发送者 `user_openid` + 事件类型。
- `parseWebhookEvent` 增加提取 `author.user_openid`（群事件下同时可提取 `author.member_openid`）。
- 关闭时（缺省/非 `"true"`）不打印任何 ID。
- 变更环境变量，同步 `wrangler.jsonc`、`README.md`、`.trellis/spec/worker/qqbot-worker-contract.md`。

## Acceptance Criteria

- [ ] `DEBUG_LOG_IDS=true` 时，群 @ / 私聊事件在日志能看到群 openid 与发送者 user_openid。
- [ ] `DEBUG_LOG_IDS` 缺省或非 `"true"` 时不打印。
- [ ] 不影响现有签名校验、命令路由、消息发送行为。
- [ ] lint / typecheck / build / test 通过。

## Definition of Done

- lint / typecheck / build / test 通过。
- README 与契约文档同步。

## Out of Scope

- 不改动命令路由与消息发送逻辑。
- 不新增管理员白名单等鉴权。

## Technical Approach

- `Env` 增 `DEBUG_LOG_IDS?: string`；`AppConfig` 增 `debugLogIds: boolean`。
- `loadConfig` 解析：`(env.DEBUG_LOG_IDS ?? "").trim().toLowerCase() === "true"`。
- `parseWebhookEvent` 从 `data.author.user_openid` 提取 `userOpenid`（群事件下可选提取 `member_openid`）。
- `src/index.ts` 的 `fetch` 中，当 `config.debugLogIds` 为真且事件为群 @ / 私聊时，`console.log` 打印事件类型、群 openid、发送者 openid；打印放在签名校验之后、路由之前，命中才打印。

## Decision (ADR-lite)

- Context：部署初期未知群/用户 ID。
- Decision：用 `DEBUG_LOG_IDS` 环境变量做一次性调试开关；只打印 ID 不打印正文。
- Consequences：用完需手动关闭/删除变量；无动态开关逻辑。

## Technical Notes

- 受影响文件：`src/index.ts`、`src/adapter/webhook.ts`、`src/env.ts`、`src/config.ts`、`wrangler.jsonc`、`README.md`、`.trellis/spec/worker/qqbot-worker-contract.md`。
