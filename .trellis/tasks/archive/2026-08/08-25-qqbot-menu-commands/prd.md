# 一次性脚本配置 QQ Bot 菜单与指令面板

## Goal

用户群聊需要「指令面板」按钮、单聊需要「底部自定义菜单」，且希望**本机拿 AppID + AppSecret 直接配置**，不污染机器人运行时逻辑。实现为一个独立一次性 Node 脚本，调用 QQ api-v2 的菜单/面板 REST 接口完成配置。

## What I already know

- 鉴权：`POST https://api.bot.qq.com/app/getAppAccessToken`，body `{ appId, clientSecret }` → `access_token`；后续接口带 `Authorization: QQBot <token>`。
- 自定义菜单（仅 C2C）：`PUT /v2/menu`，body `{ menu: { items: [{ type, name, send_message?, link?, sub_menu_items? }] } }`；`type` 可选 `switch/send_message/link/menu`；整体覆盖。
- 指令面板（支持 group）：`POST /v2/panels`，body `{ scope, target_type, group_openids?, panel: { items: [{ type, name, desc?, only_admin?, link? }] } }`；`type=command` 点击后填入输入框；group 支持 `target_type=specific` + `group_openids`。
- 现有命令：`/今日谜题`、`/聊天ID`（PRD 另规划 `/历史谜题`，暂未实现）。
- 项目 `package.json` 已 `"type": "module"`；已有 `esbuild`、`tsx` 未引入（可用 node 直接跑 .mjs）。

## Requirements

1. 新增一次性脚本 `scripts/configure-menu.mjs`（Node ESM，零依赖或仅用内置 fetch）：
   - 从环境变量读取 `QQ_BOT_ID`、`QQ_BOT_SECRET`（脚本内不硬编码 secret，也不写入仓库任何文件）。
   - 换取 access_token。
   - 配置单聊自定义菜单（`PUT /v2/menu`）：项含「今日谜题」(`send_message=/今日谜题`)、「历史谜题」(`send_message=/历史谜题`)。
   - 配置群聊指令面板（`POST /v2/panels`）：`scope=group`、`target_type=specific`、`group_openids` 取自环境变量 `GROUP_IDS`（JSON 数组或逗号分隔，复用与 `loadConfig` 相同的解析），面板项含「今日谜题」(`type=command`, `name=/今日谜题`)、「历史谜题」(`type=command`, `name=/历史谜题`)。
   - 幂等/覆盖策略：菜单 PUT 为整体覆盖（天然幂等）；面板 POST 会新建——脚本用 `GET /v2/panels?scope=group` 查已有面板，若已存在则 `PUT /v2/panels/{panel_id}` 更新，否则 `POST /v2/panels` 新建。
   - 打印每步结果（HTTP 状态 + 响应体），失败时非零退出并打印诊断。
2. README 增加「配置菜单/指令面板」说明：本地运行 `QQ_BOT_ID=... QQ_BOT_SECRET=... GROUP_IDS=... node scripts/configure-menu.mjs`。

## Acceptance Criteria

- [ ] 脚本本地运行能成功换取 token、配置 C2C 菜单与 group 面板，控制台/客户端可见。
- [ ] 重复运行不产生重复面板（幂等）。
- [ ] 脚本不写入 secret 到仓库、不提交 `.env` 等敏感文件。
- [ ] 脚本仅为本机工具，不影响 `npm run build` / `npm run build:scf` / 运行时逻辑。

## Definition of Done

- 脚本可运行且幂等；README 同步。

## Out of Scope

- 不改机器人运行时命令路由逻辑。
- 不做消息内嵌键盘（keyboard / INTERACTION_CREATE 回调）——本任务仅菜单 + 面板。
- 不做 `/历史谜题` 命令实现（脚本仍配置该按钮，用户明确要求；点击暂无响应）。

## Technical Approach

- 独立 `.mjs` 脚本 + Node 内置 fetch，零新增依赖。
- 复用与 `loadConfig` 一致的 `GROUP_IDS` 解析逻辑（在脚本内内联简单实现，避免依赖 TS 编译）。

## Decision (ADR-lite)

- Context：菜单/面板是带 token 的 REST 配置，本机即可完成。
- Decision：一次性 Node 脚本（`scripts/configure-menu.mjs`）配置，不进运行时。
- Consequences：配置与运行分离，secret 不落盘；脚本幂等（菜单覆盖 + 面板查重建）。

## Technical Notes

- Research: [`research/qqbot-menu-command-api.md`](research/qqbot-menu-command-api.md) — 菜单 `PUT /v2/menu`、面板 `/v2/panels` CRUD、鉴权、错误码。
- 受影响文件：`scripts/configure-menu.mjs`（新增）、`README.md`。
- 注意：面板 `type=command` 的指令文本字段文档未明确（疑用 `name` 兼作），脚本按 `name="/今日谜题"` 配置，需实测确认。
