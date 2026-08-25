# 下一阶段开工提示词

请先阅读 `docs/PRD.md`、`.trellis/spec/worker/` 和当前工作区状态，按 PRD 实现/补齐腾讯云 SCF QQ Bot。不要恢复 Cloudflare Worker、Wrangler 或旧环境变量。

严格按以下 Trellis 小任务顺序执行，每个任务完成后先运行相关测试和 `npm run typecheck`，通过后再进入下一个：

1. **工程与 SCF 入口**：确认五个环境变量、`scf/index.ts`、Function URL/Timer 分流和 `npm run build:scf` ZIP 产物。
2. **内容与消息核心**：完成日期、GitHub Raw、Front Matter、三种消息模板和库存提醒。
3. **QQ 适配层**：完成 Token/OpenAPI、群/C2C 主动消息、命令被动回复和 WebHook 验签/ACK。
4. **业务命令与定时任务**：完成 `/今日谜题`、`/历史谜题`、每日群推送、未来七天库存检查。
5. **本地工具**：完成 `setup:menu` 和 `debug:ws`，菜单只发送两个文本命令。
6. **质量收尾**：补齐测试，运行 `npm test`、`npm run typecheck`、`npm run build:scf`，检查 ZIP 根目录和 README。

保持实现轻量，不新增数据库、消息队列、复杂 Interaction 模型、消息智能拆分或降级系统。每个小任务只改其范围内的文件，并在任务记录中写明完成内容、验证命令和遗留问题。
