import {
  CONTENT_TITLE,
  PUZZLE_ENCOURAGEMENT,
  type OutboundMessage,
  type ParsedContent,
} from "../types.js";

export function buildMessage(content: ParsedContent): OutboundMessage {
  const parts = [CONTENT_TITLE[content.type], "", content.body];
  if (content.type === "puzzle") {
    parts.push(
      "",
      PUZZLE_ENCOURAGEMENT,
      `原题链接：${content.source ?? ""}`,
    );
  }
  return { kind: "markdown", text: parts.join("\n") };
}

export function buildCommandMessage(content: ParsedContent): OutboundMessage {
  const message = buildMessage(content);
  if (content.type === "puzzle") return message;
  return { kind: "markdown", text: `${message.text}\n\n今天没有谜题，休息一下吧` };
}

export function buildInventoryWarning(
  count: number,
  missingDates: string[],
): OutboundMessage {
  return {
    kind: "text",
    text: [
      "【每日内容机器人提醒】",
      "",
      `未来 7 天仅准备了 ${count}/7 份内容。`,
      "",
      "缺少日期：",
      ...missingDates,
      "",
      "请及时补充 GitHub 内容。",
    ].join("\n"),
  };
}
