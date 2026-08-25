import { QQBotAdapter } from "./adapter/qqbot.js";
import type { MessageSender, WebhookEvent } from "./adapter/types.js";
import { CommandRouter } from "./commands/router.js";
import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { ContentService } from "./content/service.js";
import { DailyService } from "./daily/service.js";
import type { DailyResult } from "./daily/service.js";
import type { Env } from "./env.js";
import type { FetchLike } from "./types.js";

export interface Services {
  config: AppConfig;
  content: ContentService;
  sender: MessageSender;
}

export function buildServices(env: Env, fetchLike: FetchLike): Services {
  const config = loadConfig(env);
  return {
    config,
    content: new ContentService(config.contentBaseUrl, fetchLike),
    sender: new QQBotAdapter(config.appId, config.appSecret, fetchLike),
  };
}

export async function handleVerifiedEvent(
  services: Services,
  event: WebhookEvent | null,
  now: Date,
): Promise<void> {
  if (!event) return;
  if (event.type !== "GROUP_AT_MESSAGE_CREATE" && event.type !== "C2C_MESSAGE_CREATE") {
    return;
  }
  if (!event.content) return;

  const isGroup = event.type === "GROUP_AT_MESSAGE_CREATE";
  const target = isGroup ? event.groupOpenid : event.userOpenid;
  if (!target) return;

  const router = new CommandRouter({ content: services.content, today: now });
  const outcome = await router.handle(event.content);
  if (!outcome) return;

  const result = isGroup
    ? await services.sender.sendToGroup(target, outcome.message, { msgId: event.msgId })
    : await services.sender.sendToUser(target, outcome.message, { msgId: event.msgId });
  if (!result.ok) {
    console.error(`[command] reply failed: ${result.error ?? "unknown error"}`);
  }
}

export function runDailyPush(
  services: Services,
  now: Date,
  log: (message: string, extra?: unknown) => void,
): Promise<DailyResult> {
  return new DailyService({
    content: services.content,
    sender: services.sender,
    groupIds: services.config.groupIds,
    adminOpenid: services.config.adminOpenid,
    log,
  }).run(now);
}
