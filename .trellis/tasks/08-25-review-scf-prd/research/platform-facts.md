# 腾讯云 SCF 与 QQ Bot 平台核查

本文件记录 2026-08-25 对 `docs/PRD.md` 评审时核查的官方资料与结论。它服务于评审任务，不替代产品 PRD。

## SCF

- [腾讯云云函数 URL 触发器](https://cloud.tencent.com/document/product/583/96099)：事件函数可以同时配置定时触发器与函数 URL；函数 URL 请求会以事件对象传入 `body`、`headers`、`httpMethod`、`path`、`queryString`，函数 URL 需要返回标准的 `statusCode`、`headers`、`body` 结构。
- [云函数触发器类型选择](https://cloud.tencent.com/document/product/583/73483)：需要同时承载 Timer 和 HTTP Function URL 时，事件函数比 Web 函数更匹配；事件函数的函数 URL 为同步调用，Timer 为异步调用。
- [Timer 触发器](https://cloud.tencent.com/document/product/583/9708)：定时表达式为秒、分、时、日、月、周、年七段格式；星期使用 `0-6`（0 为周日）或英文缩写。Timer 的 `Time` 字段是触发器创建时间，不应被业务当作本次执行时间。
- [云函数调用类型与异步调用](https://cloud.tencent.com/document/product/583/9694)：同步调用会等待函数结果，异步调用返回 RequestId 并由平台处理后续执行，因此不能把“返回响应后继续执行”的裸 Promise 当作可靠的异步队列。
- [函数 URL 鉴权](https://cloud.tencent.com/document/product/583/96100)：函数 URL 可配置 CAM 鉴权或公开访问。QQ Webhook 应采用公开 URL 加 QQ 自身 Ed25519 签名校验，而不是把 QQ 请求当作 CAM 请求。
- [Node.js 运行环境](https://intl.cloud.tencent.com/zh/document/product/583/11060)：当前文档列出 Node.js 20.19 与 18.15 等运行时；新项目应在 PRD 中固定版本，而不是只在 esbuild 中指定 target。

## QQ Bot

- 腾讯官方 Node SDK 的 [API 客户端](https://github.com/tencent-connect/qqbot-nodejs/blob/main/src/protocol/api/api-client.ts) 使用 `https://api.sgroup.qq.com` 作为 OpenAPI 基础地址。
- 腾讯官方 Node SDK 的 [Access Token 实现](https://github.com/tencent-connect/qqbot-nodejs/blob/main/src/protocol/api/token.ts) 使用 `https://bots.qq.com/app/getAppAccessToken` 获取 Token。项目当前把 Token 与 OpenAPI 都指向 `https://api.bot.qq.com`，需要在迁移中修正并加测试。
- 腾讯官方 Node SDK 的 [Webhook transport](https://github.com/tencent-connect/qqbot-nodejs/blob/main/src/protocol/transport/webhook.ts) 对普通事件先返回 `{"op":12,"d":0}`，再异步分发业务；`op=13` 单独返回 `plain_token` 与签名。PRD 必须明确这个 ACK 与异步处理契约。
- 腾讯官方 Node SDK 的 [消息 API](https://github.com/tencent-connect/qqbot-nodejs/blob/main/src/protocol/api/messages.ts) 区分带 `msg_id` 的被动回复与不带 `msg_id` 的主动消息。每日群推送和管理员 C2C 告警属于后者，不能只靠一个可选 `msgId` 参数模糊处理。
- 腾讯官方旧版 [BotGo SCF 部署说明](https://github.com/tencent-connect/botgo/blob/master/README.md) 曾要求固定公网出口 IP 并配置 QQ IP 白名单；是否仍适用于目标机器人和当前接入方式，需要在目标账号上实测确认。

## 评审结论

1. “事件函数 + Function URL + Timer”本身是 SCF 支持的组合。
2. 当前 PRD 缺少 Webhook 快速 ACK 与可靠异步分发的设计；建议采用入口函数加异步 Worker，或在单函数约束下显式自调用。
3. 每日主动群推送、库存不足的主动 C2C 告警是上线前置验证项；不能仅凭 API 路径存在就视为可用。
4. 当前仓库仍是 Cloudflare 与 SCF 双运行时，且实现尚未覆盖 PRD 中的历史命令、库存检查、主动消息语义和新端点；本轮只做评审，不进行实现迁移。
