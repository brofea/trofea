# 新增 /聊天ID 命令：机器人直接回复群/用户 openid

## Goal

腾讯云 SCF 日志查看需额外付费，`DEBUG_LOG_IDS` 打印的 ID 看不到。改为**命令式获取**：群聊或私聊里发 `/聊天ID`，机器人直接在聊天里回复群 openid 与发送者 openid，零日志依赖。

## What I already know

- 命令路由 `CommandRouter.handle(raw)` 目前只识别 `/今日谜题`，且 `handleVerifiedEvent` 只处理 `GROUP_AT_MESSAGE_CREATE`，私聊 `C2C_MESSAGE_CREATE` 未进命令路由。
- `MessageSender`（`src/adapter/types.ts`）只有 `sendToGroup`，无私聊发送。
- `QQBotAdapter` 已封装 v2 群消息 `POST /v2/groups/{group_openid}/messages`；私聊对称接口为 `POST /v2/users/{user_openid}/messages`（body 字段与群消息类似）。
- `parseWebhookEvent` 已提取 `groupOpenid`（仅群）与 `userOpenid`（群 @ 与私聊均有）。

## Requirements

1. 新增命令 `/聊天ID`（群聊与私聊均可用）。
   - 群聊：@机器人 + `/聊天ID` → 回复「群 openid: xxx」+「发送者 openid: xxx」。
   - 私聊：`/聊天ID` → 回复「发送者 openid: xxx」。
2. `MessageSender` 新增 `sendToUser(userOpenid, message, opts?)`；`QQBotAdapter` 实现 C2C 发送 `POST /v2/users/{user_openid}/messages`，复用 `buildBody`/`ensureToken`。
3. `handleVerifiedEvent` 同时处理群 @ 与私聊事件的命令路由，发送到正确目标（群 → `sendToGroup`，私聊 → `sendToUser`），都带 `msgId` 被动回复。
4. `CommandRouter` 支持上下文（groupOpenid/userOpenid）以拼装 ID 文本；`/聊天ID` 无需 content 依赖。
5. 保留 `DEBUG_LOG_IDS` 的 `console.log` 逻辑不变（作为日志兜底）。

## Acceptance Criteria

- [ ] 群里 @机器人发 `/聊天ID` 能收到群 openid + 发送者 openid。
- [ ] 私聊发 `/聊天ID` 能收到发送者 openid。
- [ ] `/今日谜题` 行为不变；未知命令不回复。
- [ ] `npm run typecheck`、`npm test`、`npm run build`、`npm run build:scf` 通过。

## Definition of Done

- 四查全绿；README / 契约文档同步（新增命令说明）。

## Out of Scope

- 不改签名校验、每日推送、`/今日谜题` 逻辑。
- 不移除 `DEBUG_LOG_IDS` 日志开关。

## Technical Approach

- 命令 `/聊天ID` 进 `CommandRouter`，`handle` 增加可选上下文参数拼 ID 文本。
- `MessageSender` 增 `sendToUser`，`QQBotAdapter` 对称实现 C2C 发送。
- `handleVerifiedEvent` 对群/私聊统一走命令路由，按事件类型选发送目标。

## Decision (ADR-lite)

- Context：日志查看付费，`DEBUG_LOG_IDS` 打印不可见。
- Decision：改为显式 `/聊天ID` 命令获取 ID，群聊私聊均支持；`DEBUG_LOG_IDS` 保留为日志兜底。
- Consequences：命令始终可用（不受开关控制），群 openid 对群内成员可见（可接受，非高敏感）。

## Technical Notes

- 受影响文件：`src/commands/router.ts`、`src/adapter/types.ts`、`src/adapter/qqbot.ts`、`src/bootstrap.ts`、`README.md`、`.trellis/spec/worker/qqbot-worker-contract.md`、`test/`（新增命令与私聊发送测试）。
