import { QQBotAdapter } from "./adapter/qqbot.js";
import type { WebhookEvent } from "./adapter/types.js";
import { CommandRouter } from "./commands/router.js";
import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { ContentService } from "./content/service.js";
import { DailyService } from "./daily/service.js";
import type { DailyResult } from "./daily/service.js";
import type { Env } from "./env.js";
import type { FetchLike } from "./types.js";

/**
 * 组装后的运行时服务：Cloudflare Worker 与腾讯云 SCF 两个入口共用，
 * 避免各自重复拼装依赖图导致漂移（code-reuse 指南）。
 */
export interface Services {
  config: AppConfig;
  content: ContentService;
  sender: QQBotAdapter;
}

/**
 * 组装依赖图。集中在一处，便于单测替换 fetch 与注入冻结时间。
 * 业务层只依赖 MessageSender / ContentService 抽象，不耦合 QQBotAdapter。
 */
export function buildServices(env: Env, fetchLike: FetchLike): Services {
  const config = loadConfig(env);
  const content = new ContentService(config.contentBaseUrl, fetchLike);
  const sender = new QQBotAdapter(config.botId, config.botSecret, fetchLike);
  return { config, content, sender };
}

/**
 * 已验签事件的后续处理：调试开关打印 openid + 群 @ 指令路由。
 * 两个运行时入口共用，保证行为一致。
 */
export async function handleVerifiedEvent(
  services: Services,
  event: WebhookEvent | null,
  now: Date,
): Promise<void> {
  const { config, content, sender } = services;
  if (!event) {
    // 解析失败的未知事件不崩溃。
    return;
  }
  // 一次性调试开关：开启时打印群/用户 openid（不含消息正文），用于首次部署发现 ID。
  if (
    config.debugLogIds &&
    (event.type === "GROUP_AT_MESSAGE_CREATE" || event.type === "C2C_MESSAGE_CREATE")
  ) {
    if (event.type === "GROUP_AT_MESSAGE_CREATE") {
      console.log(
        `[debug-ids] ${event.type} groupOpenid=${event.groupOpenid ?? ""} userOpenid=${event.userOpenid ?? ""}`,
      );
    } else {
      console.log(`[debug-ids] ${event.type} userOpenid=${event.userOpenid ?? ""}`);
    }
  }
  // 仅处理群 @ 消息中的命令（最小安全入口）。
  if (event.type === "GROUP_AT_MESSAGE_CREATE" && event.content && event.groupOpenid) {
    const router = new CommandRouter({
      content,
      today: now,
      log: (m) => console.log(m),
    });
    try {
      const outcome = await router.handle(event.content);
      if (outcome) {
        await sender.sendToGroup(event.groupOpenid, outcome.message, {
          msgId: event.msgId,
        });
      }
    } catch (e) {
      console.error(`命令处理失败: ${(e as Error).message}`);
    }
  }
}

/** 执行每日推送（两个运行时入口共用）。 */
export async function runDailyPush(
  services: Services,
  now: Date,
  log: (msg: string, extra?: unknown) => void,
): Promise<DailyResult> {
  const daily = new DailyService({
    content: services.content,
    sender: services.sender,
    groupIds: services.config.groupIds,
    log,
  });
  return daily.run(now);
}
