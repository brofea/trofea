import { ContentNotFoundError } from "../errors.js";
import type { ContentService } from "../content/service.js";
import { buildCommandMessage } from "../message/builder.js";
import type { OutboundMessage } from "../types.js";

/**
 * 指令路由（应用层）。
 *
 * 依赖 ContentService，产出平台无关 OutboundMessage。
 * 适配层负责把它发回（带 msg_id 被动回复）。
 *
 * 实现 PRD 指定的最小安全入口：/今日谜题、/聊天ID。
 */
export interface CommandRouterDeps {
  content: ContentService;
  /** 注入“当前时间”，便于单测冻结。 */
  today: Date;
  log: (msg: string, extra?: unknown) => void;
}

export interface CommandOutcome {
  message: OutboundMessage;
}

/** 命令上下文：群/发送者 openid，供 /聊天ID 拼装 ID 文本。 */
export interface CommandContext {
  groupOpenid?: string;
  userOpenid?: string;
}

const CMD_TODAY = "今日谜题";
const CMD_CHAT_ID = "聊天ID";

export class CommandRouter {
  constructor(private readonly deps: CommandRouterDeps) {}

  /** 解析命令文本（已去除 @bot 前缀）。未识别返回 null（调用方回 200 不回复）。 */
  async handle(raw: string, ctx: CommandContext = {}): Promise<CommandOutcome | null> {
    const input = raw.trim();
    if (!input.startsWith("/")) return null;
    const rest = input.slice(1).trim();
    const [cmd] = rest.split(/\s+/);
    if (cmd === CMD_TODAY) {
      return this.handleToday();
    }
    if (cmd === CMD_CHAT_ID) {
      return this.handleChatId(ctx);
    }
    return null;
  }

  /** /聊天ID：无需 content 依赖，直接用上下文拼装 ID 文本。 */
  private handleChatId(ctx: CommandContext): CommandOutcome {
    const lines: string[] = [];
    if (ctx.groupOpenid) lines.push(`群 openid: ${ctx.groupOpenid}`);
    if (ctx.userOpenid) lines.push(`发送者 openid: ${ctx.userOpenid}`);
    return {
      message: {
        kind: "text",
        text: lines.length > 0 ? lines.join("\n") : "未获取到 ID",
      },
    };
  }

  private async handleToday(): Promise<CommandOutcome> {
    const parsed = await this.deps.content.fetchContent(this.deps.today).catch(
      (e) => {
        if (e instanceof ContentNotFoundError) return null;
        throw e;
      },
    );
    if (!parsed) {
      return {
        message: { kind: "text", text: "今天还没有内容，休息一下吧" },
      };
    }
    return { message: buildCommandMessage(parsed) };
  }
}

export const COMMAND_NAMES = [CMD_TODAY, CMD_CHAT_ID] as const;
