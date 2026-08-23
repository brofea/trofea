# 每日题目推荐 QQ Bot Worker

## Goal

开发一个基于 Cloudflare Worker 的 QQ Bot 后端，每日从公开 GitHub 仓库读取 Markdown 内容，按工作日/周末 Cron 计划向配置的 QQ 群推送编程题目、知识分享或技术故事，并通过适配层隔离 QQ 平台细节。

## Requirements

- 使用 TypeScript、Cloudflare Workers、Cron Trigger、QQ Bot API 与 GitHub Raw Content API。
- 分为 QQ Bot 兼容层和业务逻辑层：兼容层负责 WebHook 事件解析与消息发送，业务层负责内容获取、Markdown 解析、消息构建、指令与每日推送。
- 内容文件名为 `YYYY-MM-DD.md`，顶部使用 YAML Front Matter：`type` 必填且仅允许 `puzzle`、`knowledge`、`story`；`source` 可选，但 `puzzle` 必须存在。
- 从可配置的 GitHub Raw URL 读取当天内容；群 ID 直接使用 Cloudflare Worker 环境变量配置，不使用数据库。
- 使用 Cron Trigger：工作日 08:00，周末 10:00；时区和配置方式应在 Worker 配置中明确。
- 消息统一保留 Markdown 正文：`【今日XX】` + 正文 + 类型对应结尾。
- `puzzle` 标题为 `【今日谜题】`，末尾包含指定的鼓励语与 `source` 原题链接；`knowledge` 和 `story` 分别使用 `【今日知识】`、`【今日故事】`，无额外结尾。
- 第一版尽量完整保留 Markdown；只有发现 QQ Markdown 兼容问题时才增加转换层。
- 为核心业务逻辑和边界条件提供自动化测试，并提供本地开发/验证所需的配置说明。

## Acceptance Criteria

- [ ] Worker 项目可安装依赖、通过类型检查/构建，并能在 Cloudflare Workers 运行时启动。
- [ ] 有清晰的 QQ Bot 适配层接口，业务层不直接耦合 QQ API 请求细节。
- [ ] 能正确解析三种合法内容类型、必填/可选 Front Matter，并对未知类型、缺失 `type`、谜题缺失 `source` 和无效日期给出明确错误。
- [ ] 能按日期生成 GitHub Raw 内容 URL，并在 GitHub 请求失败或内容不存在时返回可诊断的错误。
- [ ] 三种消息模板的标题、正文和 puzzle 结尾与 PRD 一致，并保留 Markdown 正文。
- [ ] Cron handler 能区分工作日/周末推送时间，并只向环境变量配置的 QQ 群发送。
- [ ] WebHook handler 能解析至少基础 QQ Bot 事件并路由到业务逻辑；不支持的事件不会导致 Worker 崩溃。
- [ ] 自动化测试覆盖 Front Matter/消息构建/日期调度/适配器调用等核心路径。
- [ ] README 或等价文档说明环境变量、Wrangler 配置、Cron 计划、GitHub 内容格式、运行测试与部署步骤。

## Definition of Done

- 实现仅围绕本 PRD，不引入数据库、其他消息平台或超出 MVP 的 Markdown 转换。
- 通过项目可用的 lint、类型检查、构建和测试命令；若受外部凭据限制无法运行真实 QQ API，提供 mock/契约级验证并明确记录限制。
- 不提交密钥、真实 QQ 群凭据或无关生成文件。
- 保留现有用户未提交的 `docs/PRD.md`，不覆盖其内容。

## Technical Approach

- 以小型 TypeScript Worker 为实现基础，优先使用最少依赖；若需 YAML 解析库，应说明选择并锁定版本。
- 通过接口抽象 QQ Bot 发送能力，Cron 与 WebHook 共用应用层服务。
- 将日期计算、内容获取、Front Matter 解析、消息构建设计为可单测的纯函数/服务。
- 使用 Wrangler 配置 Cron 和非敏感变量，敏感凭据通过 Secret 配置；群 ID 可用逗号分隔环境变量。

## Decision (ADR-lite)

**Context**: 需要在空仓库中交付一个可部署的 QQ Bot Worker，同时保持业务逻辑与平台适配解耦。

**Decision**: MVP 使用 Cloudflare Worker 原生 Fetch/Scheduled handler、GitHub Raw URL、轻量 Front Matter 解析与 QQ Bot 适配接口；不接数据库，不实现额外消息平台，不预先做 Markdown 到纯文本转换。

**Consequences**: 代码和部署面较小、测试容易隔离；真实 QQ API 的鉴权/消息协议需要按官方配置注入，后续若 Markdown 兼容性不足再增加独立转换层。

## Parent Decisions for MVP

- 时间按北京时间（UTC+8）解释；Cloudflare Cron 使用对应 UTC 表达式，并在代码/文档中明确这一换算。
- 当日 Markdown 不存在或上游不可用时，记录可诊断错误并跳过本次发送；不回退到旧内容、不发送未经确认的占位内容。
- Webhook 先实现 QQ Bot 官方要求的基础校验/握手与最小安全事件路由；若 PRD 没有指定复杂指令，不扩展权限、回放或管理指令。可实现一个最小的今日内容查询入口，但必须保持在现有业务服务之上。
- 按当前官方 QQ Bot 群消息协议实现鉴权与请求格式；实现前由 Agent 核对最新官方文档，若协议与 PRD 的抽象冲突，保持适配层隔离并在报告中标明。
- 允许引入一个成熟、Workers 兼容的 YAML 解析依赖，优先保证 Front Matter 边界行为；不引入数据库或额外平台 SDK。
- 单群配置仍按 MVP 实现，但内部发送接口可接受群标识参数，避免把业务层锁死在某个 QQ 字段名上。

## Out of Scope

- 数据库、内容后台、管理面板和持久化推送状态。
- 其他消息平台适配器。
- 自动生成内容、内容编辑器和 GitHub 写入权限。
- 第一版的完整 Markdown 到 QQ 专用格式转换。
- 未在 PRD 中指定的复杂 QQ 指令、权限系统和多租户配置。

## Technical Notes

- 用户原始计划：`docs/PRD.md`；该文件保持不变。
- 当前仓库为单仓库，现有代码仅包含 Trellis 基础设施，业务项目需从零搭建。
- 适用的共享规范：`.trellis/spec/guides/index.md`、`code-reuse-thinking-guide.md`、`cross-layer-thinking-guide.md`。
