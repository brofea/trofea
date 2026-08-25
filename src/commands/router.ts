import { ContentNotFoundError } from "../errors.js";
import type { ContentService } from "../content/service.js";
import { buildCommandMessage, buildMessage } from "../message/builder.js";
import type { OutboundMessage } from "../types.js";
import { formatDate, parseDateString } from "../utils/date.js";

export interface CommandRouterDeps {
  content: ContentService;
  today: Date;
}

export interface CommandOutcome {
  message: OutboundMessage;
}

const TODAY_COMMAND = "今日谜题";
const HISTORY_COMMAND = "历史谜题";

export class CommandRouter {
  constructor(private readonly deps: CommandRouterDeps) {}

  async handle(raw: string): Promise<CommandOutcome | null> {
    const input = raw.trim();
    if (!input.startsWith("/")) return null;

    const parts = input.slice(1).trim().split(/\s+/).filter(Boolean);
    const command = parts[0];
    if (command === TODAY_COMMAND) return this.handleToday();
    if (command === HISTORY_COMMAND) return this.handleHistory(parts[1]);
    return null;
  }

  private async handleToday(): Promise<CommandOutcome> {
    try {
      const content = await this.deps.content.fetchContent(this.deps.today);
      return { message: buildCommandMessage(content) };
    } catch (error) {
      if (error instanceof ContentNotFoundError) {
        return { message: { kind: "text", text: "今天没有内容，休息一下吧。" } };
      }
      throw error;
    }
  }

  private async handleHistory(dateText?: string): Promise<CommandOutcome> {
    if (!dateText) {
      return {
        message: {
          kind: "text",
          text: "使用方法：\n\n/历史谜题 YYYY-MM-DD\n\n例如：\n/历史谜题 2026-08-20",
        },
      };
    }

    const date = parseDateString(dateText);
    if (!date) {
      return {
        message: {
          kind: "text",
          text: "日期格式错误，请使用：/历史谜题 YYYY-MM-DD",
        },
      };
    }

    if (dateText > formatDate(this.deps.today)) {
      return { message: { kind: "text", text: "未来的谜题还不能偷看哦。" } };
    }

    try {
      const content = await this.deps.content.fetchContent(date);
      if (content.type !== "puzzle") {
        return { message: { kind: "text", text: "这一天没有谜题。" } };
      }
      return { message: buildMessage(content) };
    } catch (error) {
      if (error instanceof ContentNotFoundError) {
        return { message: { kind: "text", text: "这一天没有内容。" } };
      }
      throw error;
    }
  }
}

export const COMMAND_NAMES = [TODAY_COMMAND, HISTORY_COMMAND] as const;
