# 修复 cron 触发器表达式

## Goal

Cloudflare Workers 部署失败，因为 `wrangler.jsonc` 的 `triggers.crons` 中 `"0 2 * * 0,6"` 是非法 cron 字符串（Cloudflare Cron 不支持逗号分隔的星期值），报错 `invalid cron string: 0 2 * * 0,6 [code: 10100]`。将周末触发拆成两条独立表达式。

## Requirements

- `wrangler.jsonc` 中把 `"0 2 * * 0,6"` 拆成 `"0 2 * * 0"`（周日）和 `"0 2 * * 6"`（周六）。
- 同步更新 `README.md` 的 Cron 表与说明文字。
- 同步更新 `.trellis/spec/worker/qqbot-worker-contract.md` 的 Cron 节。

## Acceptance Criteria

- [ ] `wrangler.jsonc` 不再含 `,` 分隔的星期值，`triggers.crons` 共 3 条且都合法。
- [ ] `README.md` 与契约文档的 cron 描述与新表达式一致。
- [ ] `npm run build` 通过（wrangler deploy --dry-run 无 invalid cron 错误）。

## Definition of Done

- `npm run build` 成功，无 cron 校验错误。
- README 与契约文档同步。

## Out of Scope

- 不改动 `src/` 业务代码。
- 不处理日志中的 Worker 名 `qqbot-worker` vs `trofea` 不匹配警告（非失败原因）。

## Technical Notes

- 错误来源：`wrangler.jsonc:15` 的 `"0 2 * * 0,6"`。
- 工作日条目 `"0 0 * * 1-5"` 合法，无需改动。
- 受影响文件：`wrangler.jsonc`、`README.md`（第 82、84 行）、`.trellis/spec/worker/qqbot-worker-contract.md`（第 52 行）。
