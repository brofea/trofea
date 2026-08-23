import type { Env } from "./env.js";

/**
 * 将 Worker 绑定的 Env 解析为强类型运行配置。
 *
 * 集中解析的好处（code-reuse 指南）：所有模块只看 AppConfig，
 * 不各自重复解析 `GROUP_IDS` JSON、不各自假设字段缺失默认值。
 */
export interface AppConfig {
  contentBaseUrl: string;
  groupIds: string[];
  qqAppId: string;
  qqClientSecret: string;
  qqBotSecret: string;
  timezone: string;
}


function parseGroupIds(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  // 兼容 JSON 数组与逗号分隔两种写法。
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(arr)) throw new Error("not array");
      return arr.filter((x): x is string => typeof x === "string");
    } catch {
      // 回退到逗号分隔，避免单一格式错误使整个 Worker 不可用。
    }
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env: Env): AppConfig {
  const rawBaseUrl = env.CONTENT_BASE_URL ?? "";
  if (!rawBaseUrl) {
    throw new Error("配置缺失: CONTENT_BASE_URL");
  }
  const contentBaseUrl = rawBaseUrl.replace(/\/?$/, "/");
  if (!env.QQ_APP_ID || !env.QQ_CLIENT_SECRET) {
    throw new Error("配置缺失: QQ_APP_ID / QQ_CLIENT_SECRET");
  }
  return {
    contentBaseUrl,
    groupIds: parseGroupIds(env.GROUP_IDS ?? ""),
    qqAppId: env.QQ_APP_ID,
    qqClientSecret: env.QQ_CLIENT_SECRET,
    qqBotSecret: env.QQ_BOT_SECRET ?? "",
    timezone: env.TIMEZONE ?? "Asia/Shanghai",
  };
}
