import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function loadDotEnv(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let text: string;
  try {
    text = readFileSync(resolve(root, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    const index = value.indexOf("=");
    if (index <= 0) continue;
    const key = value.slice(0, index).trim();
    if (process.env[key] === undefined) process.env[key] = value.slice(index + 1).trim();
  }
}

export function groupIds(): string[] {
  return (process.env.GROUP_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function requireBotEnv(): { appId: string; appSecret: string } {
  const appId = (process.env.QQ_BOT_APP_ID ?? "").trim();
  const appSecret = (process.env.QQ_BOT_APP_SECRET ?? "").trim();
  if (!appId || !appSecret) {
    throw new Error("缺少 QQ_BOT_APP_ID 或 QQ_BOT_APP_SECRET");
  }
  return { appId, appSecret };
}
