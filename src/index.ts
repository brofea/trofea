import { handleWebhook } from "./adapter/webhook.js";
import { buildServices, handleVerifiedEvent, runDailyPush } from "./bootstrap.js";
import type { Env } from "./env.js";
import type { FetchLike } from "./types.js";
import { formatDate } from "./utils/date.js";

export interface Bindings {
  env: Env;
  fetchLike?: FetchLike;
}

export default {
  /** Webhook：QQ Bot 事件回调 + 命令被动回复。 */
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const fetchLike: FetchLike = { fetch };
    const services = buildServices(env, fetchLike);

    const rawBody = await req.text();
    const result = handleWebhook({
      botSecret: services.config.botSecret,
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
    await handleVerifiedEvent(services, result.event, new Date());
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
    const services = buildServices(env, fetchLike);
    const res = await runDailyPush(
      services,
      new Date(),
      (m, extra) => console.log(`[daily ${formatDate(new Date())}] ${m}`, extra ?? ""),
    );
    console.log("[cron] result", res);
  },
} satisfies ExportedHandler<Env>;
