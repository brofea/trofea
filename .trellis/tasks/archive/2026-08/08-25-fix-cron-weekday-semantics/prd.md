# 修复 cron 星期字段语义（Cloudflare 1-7）

## Goal

Cloudflare Cron 的星期字段是 **1=周日 … 7=周六**（Quartz 风格），不同于标准 cron 的 0=周日。当前 `wrangler.jsonc` 里：
- `0 2 * * 0`（周日）→ `0` 非法，部署报 `invalid cron string: 0 2 * * 0 [code: 10100]`。
- `0 0 * * 1-5`（想表达周一~周五）→ 在 Cloudflare 语义下其实是周日~周四，语义错误。
- `0 2 * * 6`（想表达周六）→ 在 Cloudflare 语义下是周五，语义错误。

改用 Cloudflare 官方推荐的 3 字母缩写，消除歧义并修复语义。

## What I already know

- Cloudflare Cron 官方文档：Weekdays 取值 1-7（1=Sunday, 7=Saturday），并建议用 `SUN`…`SAT` 缩写避免歧义；支持 `, - / L #`。
- 当前三条：`0 0 * * 1-5`、`0 2 * * 0`、`0 2 * * 6`（见 `wrangler.jsonc:11-18`）。
- 文档同步位置：`README.md:79-85`、`.trellis/spec/worker/qqbot-worker-contract.md:51-56`。
- 契约文档里还有一句“不支持逗号分隔”的过时结论，应改为正确的 1-7 语义说明。

## Requirements

- `wrangler.jsonc` 三条 cron 改为：
  - 工作日 08:00 北京时间（UTC 00:00, Mon-Fri）→ `0 0 * * MON-FRI`
  - 周六 10:00 北京时间（UTC 02:00）→ `0 2 * * SAT`
  - 周日 10:00 北京时间（UTC 02:00）→ `0 2 * * SUN`
- 同步更新 `README.md` Cron 表与说明、`.trellis/spec/worker/qqbot-worker-contract.md` Cron 节。
- 契约文档把“不支持逗号”的过时结论替换为“星期字段 1-7（1=周日），建议用缩写”。

## Acceptance Criteria

- [ ] `wrangler.jsonc` 三条 cron 全部合法且语义正确（Mon-Fri / SAT / SUN）。
- [ ] `npm run build`（wrangler deploy --dry-run）无 `invalid cron string` 错误。
- [ ] README 与契约文档描述与配置一致。

## Definition of Done

- `npm run build` 通过，无 cron 校验错误。
- README 与契约文档同步。

## Out of Scope

- 不改动 `src/` 业务代码与调度处理逻辑。
- 不处理 Worker 名 `qqbot-worker` vs `trofea` 不匹配警告。

## Technical Approach

- 用 3 字母缩写（`MON-FRI` / `SAT` / `SUN`）替换数字星期字段，官方推荐且无歧义。
- 三条均保留 5 字段格式。

## Decision (ADR-lite)

- Context：Cloudflare 星期字段 1-7（1=周日），标准 cron 0-6 的写法会错位或报错。
- Decision：统一改用 3 字母缩写表达星期。
- Consequences：语义自文档化，避免未来数字误读；无运行时影响。

## Technical Notes

- 参考：https://developers.cloudflare.com/workers/configuration/cron-triggers/（"Weekdays: 1-7, case-insensitive 3-letter abbreviations ... 1 = Sunday to 7 = Saturday"）。
- 受影响文件：`wrangler.jsonc`、`README.md`、`.trellis/spec/worker/qqbot-worker-contract.md`。
