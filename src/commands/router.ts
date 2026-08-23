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
 * 仅实现 PRD 指定的最小安全入口：/今日谜题。
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

const CMD_TODAY = "今日谜题";

export class CommandRouter {
  constructor(private readonly deps: CommandRouterDeps) {}

  /** 解析命令文本（已去除 @bot 前缀）。未识别返回 null（调用方回 200 不回复）。 */
  async handle(raw: string): Promise<CommandOutcome | null> {
    const input = raw.trim();
    if (!input.startsWith("/")) return null;
    const rest = input.slice(1).trim();
    const [cmd] = rest.split(/\s+/);
    if (cmd === CMD_TODAY) {
      return this.handleToday();
    }
    return null;
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

export const COMMAND_NAMES = [CMD_TODAY] as const;
