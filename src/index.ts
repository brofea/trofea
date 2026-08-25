import { QQBotAdapter } from "./adapter/qqbot.js";
import { handleWebhook } from "./adapter/webhook.js";
import { loadConfig } from "./config.js";
import { CommandRouter } from "./commands/router.js";
import { ContentService } from "./content/service.js";
import { DailyService } from "./daily/service.js";
import type { Env } from "./env.js";
import type { FetchLike } from "./types.js";
import { formatDate } from "./utils/date.js";

export interface Bindings {
  env: Env;
  fetchLike?: FetchLike;
}

/**
 * 组装依赖图。集中在一处，便于单测替换 fetch 与注入冻结时间。
 * 业务层只依赖 MessageSender / ContentService 抽象，不耦合 QQBotAdapter。
 */
function buildServices(env: Env, fetchLike: FetchLike) {
  const config = loadConfig(env);
  const content = new ContentService(config.contentBaseUrl, fetchLike);
  const sender = new QQBotAdapter(
    config.botId,
    config.botSecret,
    fetchLike,
  );
  return { config, content, sender };
}

export default {
  /** Webhook：QQ Bot 事件回调 + 命令被动回复。 */
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const fetchLike: FetchLike = { fetch };
    const { config, content, sender } = buildServices(env, fetchLike);

    const rawBody = await req.text();
    const result = handleWebhook({
      botSecret: config.botSecret,
      signatureHex: req.headers.get("X-Signature-Ed25519") ?? "",
      timestamp: req.headers.get("X-Signature-Timestamp") ?? "",
      rawBody,
    });
    if (result.kind === "rejected") {
      return new Response("invalid signature", { status: 401 });
    }
    if (result.kind === "verification") {
      // 回调地址校验：回填 plain_token + 用 Bot Secret 派生私钥签名的 signature。
      return Response.json(
        { plain_token: result.plainToken, signature: result.signature },
        { status: 200 },
      );
    }
    const event = result.event;
    if (!event) {
      // 解析失败的未知事件不崩溃。
      return new Response("ok", { status: 200 });
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
        today: new Date(),
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
    // 其它事件：不崩溃、不回复。
    return new Response("ok", { status: 200 });
  },

  /** Cron：每日推送。工作日 08:00 / 周末 10:00（北京时间）。 */
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const fetchLike: FetchLike = { fetch };
    const { config, content, sender } = buildServices(env, fetchLike);
    const daily = new DailyService({
      content,
      sender,
      groupIds: config.groupIds,
      log: (m, extra) => console.log(`[daily ${formatDate(new Date())}] ${m}`, extra ?? ""),
    });
    const res = await daily.run(new Date());
    console.log("[cron] result", res);
  },
} satisfies ExportedHandler<Env>;
