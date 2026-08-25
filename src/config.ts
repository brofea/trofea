import type { Env } from "./env.js";

export interface AppConfig {
  contentBaseUrl: string;
  groupIds: string[];
  appId: string;
  appSecret: string;
  adminOpenid: string;
}

function parseGroupIds(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function loadConfig(env: Env): AppConfig {
  const contentBaseUrl = env.CONTENT_BASE_URL.trim().replace(/\/+$/, "");
  const groupIds = parseGroupIds(env.GROUP_IDS ?? "");
  const appId = env.QQ_BOT_APP_ID.trim();
  const appSecret = env.QQ_BOT_APP_SECRET.trim();
  const adminOpenid = env.ADMIN_OPENID.trim();

  const missing = [
    ["CONTENT_BASE_URL", contentBaseUrl],
    ["GROUP_IDS", groupIds.length > 0 ? "configured" : ""],
    ["QQ_BOT_APP_ID", appId],
    ["QQ_BOT_APP_SECRET", appSecret],
    ["ADMIN_OPENID", adminOpenid],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`配置缺失: ${missing.join(", ")}`);
  }

  return { contentBaseUrl, groupIds, appId, appSecret, adminOpenid };
}
