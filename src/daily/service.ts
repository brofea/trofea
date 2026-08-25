import { ContentNotFoundError, FrontMatterError, UpstreamError } from "../errors.js";
import type { MessageSender } from "../adapter/types.js";
import type { ContentService } from "../content/service.js";
import { buildInventoryWarning, buildMessage } from "../message/builder.js";
import type { SendResult } from "../types.js";
import { addDays, formatDate } from "../utils/date.js";

export interface DailyDeps {
  content: ContentService;
  sender: MessageSender;
  groupIds: string[];
  adminOpenid: string;
  log: (message: string, extra?: unknown) => void;
}

export interface DailyResult {
  date: string;
  pushed: string[];
  skipped: boolean;
  reason?: string;
  inventoryCount: number;
  inventoryMissing: string[];
  results: SendResult[];
}

export class DailyService {
  constructor(private readonly deps: DailyDeps) {}

  async run(now: Date): Promise<DailyResult> {
    const { content, sender, groupIds, adminOpenid, log } = this.deps;
    const date = formatDate(now);
    const results: SendResult[] = [];
    const pushed: string[] = [];
    let skipped = false;
    let reason: string | undefined;

    try {
      const today = await content.fetchContent(now);
      const message = buildMessage(today);
      for (const groupId of groupIds) {
        try {
          const result = await sender.sendToGroup(groupId, message);
          results.push(result);
          if (result.ok) pushed.push(groupId);
          else log(`群 ${groupId} 发送失败`, result.error);
        } catch (error) {
          log(`群 ${groupId} 发送异常`, String(error));
        }
      }
    } catch (error) {
      skipped = true;
      if (error instanceof ContentNotFoundError) {
        reason = `当日内容不存在，跳过发送: ${error.date}`;
      } else if (error instanceof UpstreamError) {
        reason = `上游不可用，跳过发送: ${error.message}`;
      } else {
        reason = `内容解析失败，跳过发送: ${(error as Error).message}`;
      }
      log(reason);
    }

    const inventory = await this.checkInventory(now, log);
    if (!inventory.unavailable && inventory.count < 7) {
      const warning = buildInventoryWarning(inventory.count, inventory.missing);
      try {
        const result = await sender.sendToUser(adminOpenid, warning);
        if (!result.ok) log("管理员库存提醒失败", result.error);
      } catch (error) {
        log("管理员库存提醒异常", String(error));
      }
    }

    return {
      date,
      pushed,
      skipped,
      reason,
      inventoryCount: inventory.count,
      inventoryMissing: inventory.missing,
      results,
    };
  }

  private async checkInventory(
    today: Date,
    log: (message: string, extra?: unknown) => void,
  ): Promise<{ count: number; missing: string[]; unavailable: boolean }> {
    let count = 0;
    const missing: string[] = [];
    for (let offset = 1; offset <= 7; offset += 1) {
      const date = addDays(today, offset);
      const dateText = formatDate(date);
      try {
        await this.deps.content.fetchContent(date);
        count += 1;
      } catch (error) {
        if (error instanceof ContentNotFoundError || error instanceof FrontMatterError) {
          missing.push(dateText);
        } else if (error instanceof UpstreamError) {
          log(`库存检查上游不可用，跳过本次提醒: ${dateText}`, error.message);
          return { count, missing, unavailable: true };
        } else {
          log(`库存检查失败，跳过本次提醒: ${dateText}`, String(error));
          return { count, missing, unavailable: true };
        }
      }
    }
    return { count, missing, unavailable: false };
  }
}
