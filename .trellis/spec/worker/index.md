# Cloudflare Worker

本项目的 Worker 业务代码位于 `src/`，按入口、应用服务、内容解析和 QQ 适配层分离。

## Quality Check

- 运行 `npm test`、`npm run typecheck` 和 `npm run build`。
- 检查 `src/index.ts` 到 `src/daily/`、`src/content/`、`src/message/`、`src/adapter/` 的数据流是否仍通过平台无关契约。
- 回调地址校验（`op=13`）必须先于普通事件签名校验处理；普通事件缺失或非法签名必须拒绝。
- 不在仓库写入 QQ Secret、`.dev.vars` 或 Wrangler 生成目录。
- 变更环境变量、Cron 或 QQ 请求字段时同步更新 `README.md` 与契约文档。

## Guidelines

- [QQ Bot Worker Contracts](./qqbot-worker-contract.md)
