import yaml from "js-yaml";
import { FrontMatterError } from "../errors.js";
import { CONTENT_TYPES, type ContentType, type ParsedContent } from "../types.js";

interface FrontMatter {
  type?: unknown;
  source?: unknown;
}

const FRONT_MATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * 解析 Markdown Front Matter（`---` 围栏 YAML）。
 *
 * 边界行为（cross-layer 指南：在入口处统一校验）：
 * - 无 Front Matter → 缺 type 错误。
 * - type 非字符串或不在白名单 → 错误。
 * - puzzle 无 source → 错误。
 * - 非 puzzle 有 source → 允许（PRD 未禁止）。
 * - body 为空字符串 → 允许（不在此层判定）。
 */
export function parseFrontMatter(markdown: string): ParsedContent {
  const match = FRONT_MATTER_RE.exec(markdown);
  if (!match) {
    throw new FrontMatterError("缺少 YAML Front Matter 或围栏格式不正确");
  }
  const [, yamlBlock, body = ""] = match;

  let parsed: unknown;
  try {
    parsed = yaml.load(yamlBlock, { schema: yaml.FAILSAFE_SCHEMA });
  } catch (e) {
    throw new FrontMatterError("YAML 解析失败", e);
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FrontMatterError("Front Matter 必须是 YAML 对象");
  }
  const fm = parsed as FrontMatter;

  if (fm.type == null || typeof fm.type !== "string") {
    throw new FrontMatterError("缺少必填字段 type");
  }
  if (!CONTENT_TYPES.includes(fm.type as ContentType)) {
    throw new FrontMatterError(
      `未知 type: ${fm.type}，仅允许 puzzle|knowledge|story`,
    );
  }
  const type = fm.type as ContentType;

  const source = typeof fm.source === "string" ? fm.source : undefined;
  if (type === "puzzle" && !source) {
    throw new FrontMatterError("type=puzzle 必须提供 source 原题链接");
  }

  return { type, source, body, raw: markdown };
}
