import type { ContentType, OutboundMessage, ParsedContent } from "../types.js";
import { CONTENT_TITLE, PUZZLE_ENCOURAGEMENT } from "../types.js";

/**
 * 消息构建器：领域规则集中于此（code-reuse 指南）。
 *
 * 模板（PRD §5）：
 *   【今日XX】
 *
 *   Markdown正文
 *
 *   结尾内容
 *
 * 第一版完整保留 Markdown 正文，不做平台转换。
 * 若未来 QQ Markdown 兼容不足，在适配层加转换，而非改这里。
 */

/** puzzle 结尾：鼓励语 + 原题链接。 */
function puzzleEnding(source: string): string {
  return `${PUZZLE_ENCOURAGEMENT}\n\n原题链接：\n${source}`;
}

/** 非 puzzle 类型默认无额外结尾（PRD §5.4）。 */
function endingFor(content: ParsedContent): string {
  if (content.type === "puzzle") {
    return puzzleEnding(content.source ?? "");
  }
  return "";
}

export function buildMessage(content: ParsedContent): OutboundMessage {
  const title = CONTENT_TITLE[content.type];
  const ending = endingFor(content);
  const parts = [title, "", content.body];
  if (ending) {
    parts.push("", ending);
  }
  return { kind: "markdown", text: parts.join("\n") };
}

/**
 * 指令场景：今日内容非 puzzle 时，按 PRD §6.2 返回对应内容并追加
 * “今天没有谜题，休息一下吧”。
 */
export function buildCommandMessage(content: ParsedContent): OutboundMessage {
  const base = buildMessage(content);
  if (content.type === "puzzle") {
    return base;
  }
  return { kind: base.kind, text: `${base.text}\n\n今天没有谜题，休息一下吧` };
}

export type { ContentType };
