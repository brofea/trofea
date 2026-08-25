# 凭证简化为 QQ_BOT_ID + QQ_BOT_SECRET 两个变量

## Goal

QQ 机器人只提供 AppID + AppSecret 两个凭证。当前代码把 AppSecret 拆成 `QQ_CLIENT_SECRET`（换 token）和 `QQ_BOT_SECRET`（webhook 签名）两个变量，加上 `QQ_APP_ID` 共三个，造成误导。简化为两个环境变量：`QQ_BOT_ID`（AppID）与 `QQ_BOT_SECRET`（AppSecret，同时用于 access_token 换取与 webhook Ed25519 签名校验）。

## Requirements

- `Env` 只保留 `QQ_BOT_ID: string` 与 `QQ_BOT_SECRET: string`；删除 `QQ_APP_ID`、`QQ_CLIENT_SECRET`。
- `AppConfig` 改为 `botId: string` 与 `botSecret: string`；`loadConfig` 校验两者非空，缺一抛错。
- `QQBotAdapter` 构造参数改为 `botId` + `botSecret`，调用 `getAppAccessToken` 时 body 仍为 `{ appId, clientSecret }`（`appId = botId`、`clientSecret = botSecret`）。
- `src/index.ts` 组装与 webhook 校验统一用 `config.botSecret`。
- 同步更新：`src/env.ts`、`src/config.ts`、`src/adapter/qqbot.ts`、`src/index.ts`、`test/entry.test.ts`、`README.md`、`docs/PRD.md`、`.trellis/spec/worker/qqbot-worker-contract.md`。

## Acceptance Criteria

- [ ] 代码中不再出现 `QQ_APP_ID` / `QQ_CLIENT_SECRET` / `qqAppId` / `qqClientSecret`。
- [ ] 仅两个凭证变量 `QQ_BOT_ID`、`QQ_BOT_SECRET`，token 换取与签名校验共用 `QQ_BOT_SECRET`。
- [ ] `npm run typecheck`、`npm test`、`npm run build` 通过。

## Definition of Done

- 三查全绿。
- README / PRD / 契约文档同步。

## Out of Scope

- 不改动签名算法与发送逻辑本身。
- 不改变 QQ 官方 access_token 请求体的字段名（仍为 appId/clientSecret）。

## Technical Approach

- 变量重命名 + 复用：`botSecret` 一值两用。
- 文档与契约同步更新说明。

## Technical Notes

- 官方 `sign.html`：Bot Secret 即 AppSecret，用于 Ed25519 签名。
- 官方 `webhook.html` 示例仅 `appid` + `secret` 两个凭证。
- 受影响文件见 Requirements。
