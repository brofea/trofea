import { ContentNotFoundError, UpstreamError } from "../errors.js";
import type { ContentService } from "../content/service.js";
import type { OutboundMessage, SendResult } from "../types.js";
import { buildMessage } from "../message/builder.js";
import type { MessageSender } from "../adapter/types.js";

/**
 * 每日推送服务（应用层）。
 *
 * 依赖 ContentService 与 MessageSender 抽象，不直接接触 QQ API 或 fetch。
 * 错误策略（已批准决策）：当日缺失/上游不可用 → 记录诊断错误并跳过，
 * 不回退旧内容、不发未确认占位内容。
 */
export interface DailyDeps {
  content: ContentService;
  sender: MessageSender;
  groupIds: string[];
  log: (msg: string, extra?: unknown) => void;
}

export interface DailyResult {
  date: string;
  pushed: string[];
  skipped: boolean;
  reason?: string;
  results: SendResult[];
}

export class DailyService {
  constructor(private readonly deps: DailyDeps) {}

  /** 执行当日推送：拉取并构建当日内容消息 → 发往配置的群。 */
  async run(today: Date): Promise<DailyResult> {
    const { content, sender, groupIds, log } = this.deps;
    const dateStr = today.toISOString().slice(0, 10);

    let message: OutboundMessage | null = null;
    let skipped = false;
    let reason: string | undefined;
    let pushed: string[] = [];
    const results: SendResult[] = [];

    try {
      const parsed = await content.fetchContent(today);
      message = buildMessage(parsed);
    } catch (e) {
      skipped = true;
      if (e instanceof ContentNotFoundError) {
        reason = `当日内容不存在，跳过发送: ${e.date}`;
        log(reason);
      } else if (e instanceof UpstreamError) {
        reason = `上游不可用，跳过发送: ${e.message}`;
        log(reason);
      } else {
        reason = `内容解析失败，跳过发送: ${(e as Error).message}`;
        log(reason);
      }
    }

    if (message && groupIds.length > 0) {
      pushed = groupIds.slice();
      for (const gid of groupIds) {
        const r = await sender.sendToGroup(gid, message);
        results.push(r);
        if (!r.ok) log(`群 ${gid} 发送失败: ${r.error}`);
      }
    } else if (message) {
      reason = "未配置群 ID，未发送";
      log(reason);
    }

    return { date: dateStr, pushed, skipped, reason, results };
  }
}
