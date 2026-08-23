/**
 * Worker 绑定接口。
 *
 * 非敏感变量在 wrangler.jsonc 的 `vars` 中配置；
 * 敏感凭证（QQ_CLIENT_SECRET、QQ_BOT_SECRET）用 `wrangler secret put` 注入。
 */
export interface Env {
  CONTENT_BASE_URL: string;
  GROUP_IDS: string;
  TIMEZONE: string;
  QQ_APP_ID: string;
  QQ_CLIENT_SECRET: string;
  /** Webhook 签名校验用的 Bot Secret（Ed25519 seed 来源）。 */
  QQ_BOT_SECRET: string;
}
