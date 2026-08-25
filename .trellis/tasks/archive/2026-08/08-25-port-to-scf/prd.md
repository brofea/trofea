# 移植到腾讯云 SCF（事件函数 + 函数URL + 定时触发器）

## Goal

`.workers.dev` 被墙导致 QQ 平台无法配置回调地址，改为部署到腾讯云 SCF。本项目现有业务层（webhook 验签、每日推送、内容解析、QQ 发送）均平台无关，只需新增 Node 运行时的入口胶水与打包脚本，保留 Cloudflare 入口不动。

## What I already know

- 业务层可复用：`handleWebhook`、`signCallbackVerification`、`loadConfig`、`QQBotAdapter`（注入 `fetchLike`）、`ContentService`、`DailyService`、`CommandRouter` 均不依赖 Worker 类型。
- `src/index.ts` 是 Worker 入口（`fetch`/`scheduled`），内部的 `buildServices` 未导出；SCF 入口需自己组装同样 6 行依赖图（或抽公共函数）。
- `src/content/service.ts:31` 有 Cloudflare 专有 `cf: { cacheTtl: 60 }`，Node fetch 不识别，需移除。
- `src/utils/date.ts` 基于 `getTime()+8h` 的 UTC 组件，与运行时 TZ 无关，SCF 时区设 Asia/Shanghai 不影响内容日期。
- 依赖仅 `js-yaml` + `tweetnacl`，可被 esbuild 打进单文件，zip 无需 node_modules。
- SCF 约束：Web 函数不支持定时触发器；函数 URL 可绑事件函数；API 网关已下线。
- 用户控制台已选：地域上海、运行环境待改 Node、时区 Asia/Shanghai、事件函数模板（`index.main_handler`）。

## Requirements

1. 新增 SCF 入口 `scf/index.ts`：
   - `main_handler(event, context)` 兼容两路触发：
     - **函数 URL（HTTP webhook）**：从事件中取 `headers`/`body`/`httpMethod`，调 `handleWebhook`，按集成响应格式返回 `{ statusCode, headers, body }`；op=13 回调校验与事件签名校验逻辑沿用。
     - **定时触发器（Timer）**：识别 Timer 事件后执行每日推送（`DailyService.run(new Date())`）。
   - 组装依赖图（config/content/sender），复用现有模块。
2. 移除 `src/content/service.ts` 的 `cf` 字段（改用标准 RequestInit）。
3. 新增打包脚本：esbuild 将 `scf/index.ts` 打包为单文件 CJS `dist-scf/index.js`（`platform=node`，bundle js-yaml + tweetnacl）。
4. 文档：README 增加「部署到腾讯云 SCF」一节（环境变量、函数 URL 回调地址、定时触发器 cron、上传 zip 步骤）；契约文档补充 SCF 部署说明。
5. 保留 `src/index.ts`（Cloudflare 入口）与 wrangler 配置不动，双运行时并存。

## Acceptance Criteria

- [ ] `npm run typecheck`、`npm test`、`npm run build`（wrangler dry-run）仍通过。
- [ ] `npm run build:scf` 产出单文件 `dist-scf/index.js`，本地用 Node 起 HTTP 服务能正确响应 op=13 校验（用官方示例 secret 复算签名一致）。
- [ ] 函数 URL 触发与 Timer 触发在同一个 `main_handler` 中分流正确。
- [ ] 文档与契约同步。

## Definition of Done

- 三查全绿 + build:scf 可运行验证。
- README / 契约文档更新。

## Out of Scope

- 不改签名算法、发送逻辑、内容解析逻辑。
- 不删除 Cloudflare 部署配置。
- 不做固定公网 IP、VPC、KMS 等高级配置。

## Technical Approach

- 事件函数单函数承载 webhook + 定时；入口 `main_handler` 按事件类型分流。
- esbuild bundle 单文件，避免上传 node_modules。
- 保留 Cloudflare 入口，新增 `scf/` 目录与 `build:scf` 脚本。

## Decision (ADR-lite)

- Context：腾讯云 Web 函数不支持定时触发器。
- Decision：单事件函数 + 函数URL触发器 + 定时触发器；打包用 esbuild CJS 单文件。
- Consequences：webhook 与定时共用一个入口，需按事件类型分流；zip 极简（单 JS）。

## Technical Notes

- 函数 URL 事件：`event.body`（原始字符串，非 base64）、`event.headers`（扁平对象，key 可能小写，需大小写不敏感查找 `X-Signature-*`）、`event.httpMethod`、`event.path`、`event.queryString`。
- 集成响应：返回 `{ statusCode, headers, body }`（兼容 APIGW 4 字段）。
- Timer 事件：`{ Type:"Timer", TriggerName, Time, Message }`，用 `event.Type === "Timer"` 分流到每日推送。
- 定时 cron：7 字段 `秒 分 时 日 月 星期 年`，星期 `0-6`/`SUN-SAT`（0=周日），按 UTC+8 运行：
  - 工作日 08:00 → `0 0 8 ? * MON-FRI *`
  - 周六 10:00 → `0 0 10 ? * SAT *`
  - 周日 10:00 → `0 0 10 ? * SUN *`
- Node 运行时：入口必须 CommonJS `exports.main_handler`，handler 字符串 `index.main_handler`；打包用 esbuild CJS 单文件（bundle js-yaml + tweetnacl）。
- 受影响文件：`scf/index.ts`（新增）、`src/content/service.ts`、`package.json`、`README.md`、`.trellis/spec/worker/qqbot-worker-contract.md`。

## Research References

- [`research/scf-function-url-and-timer.md`](research/scf-function-url-and-timer.md) — 函数URL事件/响应格式、Timer 事件、cron 7 字段表达式、Node CJS 入口要求。
