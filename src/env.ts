/**
 * Worker 绑定接口。
 *
 * 非敏感变量在 wrangler.jsonc 的 `vars` 中配置；
 * 敏感凭证（QQ_BOT_ID、QQ_BOT_SECRET）用 `wrangler secret put` 注入。
 */
export interface Env {
  CONTENT_BASE_URL: string;
  GROUP_IDS: string;
  TIMEZONE: string;
  /** AppID（开放平台 AppID）。 */
  QQ_BOT_ID: string;
  /** AppSecret：同时用于 access_token 换取（clientSecret）与 Webhook Ed25519 签名校验。 */
  QQ_BOT_SECRET: string;
  /** 一次性调试开关：值为 "true"（不区分大小写）时打印群/用户 openid，用完关闭。 */
  DEBUG_LOG_IDS?: string;
}
