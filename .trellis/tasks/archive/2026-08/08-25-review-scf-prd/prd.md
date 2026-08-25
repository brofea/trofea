# brainstorm: 评审腾讯云 SCF PRD

## Goal

评审 `docs/PRD.md` 从 Cloudflare Worker 迁移到腾讯云 SCF 的新方案，确认业务范围、平台假设、QQ 接入方式、部署/运维边界和验收标准是否足够明确，为后续实现前的定稿提供依据。

## What I already know

* 用户希望把项目从 Cloudflare Worker 全面重构为腾讯云 SCF。
* 当前待审文档为 `docs/PRD.md`，工作区已有用户未提交修改；本次不直接改动该文件。
* PRD 目标是无数据库、GitHub Raw 内容源、QQ 官方机器人、每日群推送、两个历史/今日命令、本地菜单配置和 WebSocket 调试工具。
* 仓库当前同时存在 Cloudflare 入口 `src/index.ts`、SCF 入口 `scf/index.ts` 以及 `build:scf`，现有代码仍保留双运行时。
* 当前仓库环境变量命名为 `QQ_BOT_ID` / `QQ_BOT_SECRET` 等，PRD 改为 `QQ_BOT_APP_ID` / `QQ_BOT_APP_SECRET`，需要在定稿时决定是否统一迁移。

## Assumptions (temporary)

* 目标是线上只保留腾讯云 SCF 运行时，Cloudflare 入口和 Wrangler 配置应从产品交付范围中移除或明确保留为过渡代码。
* QQ 仍使用官方机器人开放平台，Webhook 用于生产，WebSocket 仅用于本地调试。
* 本次先完成 PRD 评审与问题收敛，不进入代码实现。

## User Decisions Recorded

* PRD 不描述当前仓库代码删除或清理；这属于后续执行提示词中的迁移步骤。
* 每日主动群消息和库存不足管理员 C2C 消息按 QQ Bot API 的直接调用能力设计，不作为 PRD 的上线阻塞项。
* MVP 保持轻量，不设计复杂的消息长度处理、降级策略或复杂 Interaction 领域模型。
* 菜单点击按发送对应命令文本处理，与手工输入命令共用业务逻辑。
* SCF 交付物通过一条构建命令生成可直接上传的 ZIP 包。
* Webhook 普通事件在同一次 SCF 调用内完成轻量业务后返回 ACK，不引入异步 Worker、队列或自调用。

## Open Questions

* Timer 的实际时区配置和 ZIP 上传后的 SCF 运行时版本是否按部署环境固定？

## Requirements (evolving)

* 评审应区分：明确合理项、必须修正的文档矛盾、需要用户拍板的产品/平台决策。
* 评审结论需引用具体 PRD 章节/行号，并指出与现有仓库实现的偏差。
* 对腾讯云 SCF 与 QQ 官方平台的关键事实进行权威资料核验。
* 根据用户反馈收敛 PRD，保留轻量 MVP，不把仓库清理写入产品文档。

## Acceptance Criteria (evolving)

* [ ] 输出总体结论和阻塞级风险。
* [ ] 列出必须修正文档项。
* [ ] 列出需要用户确认的决策项，并给出推荐选项。
* [ ] 列出可延后到实现阶段的非阻塞项。
* [ ] 初始评审阶段不修改 `docs/PRD.md`；用户授权后仅修改 PRD，不修改应用代码。

## Definition of Done (team quality bar)

* 结论有代码、文档或官方平台资料依据。
* 评审边界、风险和下一步清楚，足以继续一轮需求确认。
* 未启动实现、部署或外部平台写操作。

## Out of Scope (explicit)

* 不实现 SCF 入口、QQ 适配器或本地脚本。
* 不修改 `docs/PRD.md`。
* 不部署函数、不配置 QQ 回调、不创建腾讯云资源。

## Technical Notes

* Repo root: `C:/Users/admin/trofea`
* PRD under review: `docs/PRD.md`
* Existing SCF entry: `scf/index.ts`
* Existing project contract: `.trellis/spec/worker/qqbot-worker-contract.md`

## Research References

* `research/platform-facts.md` records the official SCF and QQ Bot platform checks used for this review.
* No changes were made to `docs/PRD.md` or application code during the review.
