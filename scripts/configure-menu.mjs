#!/usr/bin/env node
/**
 * 一次性脚本：配置 QQ Bot 的单聊自定义菜单（C2C）与群聊指令面板（group）。
 *
 * 本脚本仅在本地运行，从环境变量读取凭证，不写入仓库、不进运行时逻辑。
 * 幂等策略：
 *   - 自定义菜单 PUT /v2/menu 整体覆盖（天然幂等）；
 *   - 指令面板先 GET /v2/panels?scope=group 查已有面板，命中（scope=group 且
 *     target_type=specific 且 group_openids 一致）则 PUT 更新，否则 POST 新建。
 *
 * 用法：
 *   QQ_BOT_ID=<AppID> QQ_BOT_SECRET=<AppSecret> GROUP_IDS='["<group_openid>"]' node scripts/configure-menu.mjs
 *
 * 依赖：Node >= 18（内置 fetch），无第三方依赖。
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 从仓库根目录的 .env 文件加载环境变量（仅作为兜底，不覆盖已存在的
 * process.env 值）。解析规则：`KEY=VALUE` 每行一个；忽略空行与 `#` 注释；
 * 键与值两端 trim；值允许包含 `=`（按第一个 `=` 切分）。
 */
function loadDotEnv() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = resolve(repoRoot, ".env");
  let content;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    // .env 不存在或不可读：静默跳过，依赖调用方设置的环境变量。
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!key) continue;
    // process.env 优先：已设置的值不被 .env 覆盖。
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const API_BASE = "https://api.bot.qq.com";

/** 与 src/config.ts 的 parseGroupIds 保持一致：JSON 数组或逗号分隔。 */
function parseGroupIds(raw) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return arr.filter((x) => typeof x === "string");
      }
    } catch {
      // 回退到逗号分隔，避免单一格式错误使脚本不可用。
    }
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 集合相等比较（忽略顺序与重复项）。 */
function sameGroupIds(a, b) {
  const sa = [...new Set(a)].sort();
  const sb = [...new Set(b)].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/**
 * 发起 QQ api-v2 请求。返回 { status, ok, body, text }。
 * 网络异常等不会抛出，而是返回失败对象，由调用方决定是否继续。
 */
async function request(method, path, token, body) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
  };
  if (token) headers.Authorization = `QQBot ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    return { status: 0, ok: false, body: null, text: `网络错误: ${String(e)}` };
  }

  let text = "";
  let json = null;
  try {
    text = await res.text();
  } catch {
    text = "";
  }
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, ok: res.ok, body: json, text };
}

function logRequest(method, path, result) {
  const payload = result.body !== null ? JSON.stringify(result.body) : result.text || "<空响应>";
  console.log(`  ${method} ${path} -> HTTP ${result.status} ${payload}`);
}

/**
 * QQ api-v2 部分接口以 HTTP 200 + body `code`/`err_code` 表示错误（而非非 2xx）。
 * 返回错误描述字符串；无错误时返回 null。
 */
function bodyError(body) {
  if (!body || typeof body !== "object") return null;
  const code = body.code ?? body.err_code ?? body.errcode;
  if (typeof code === "number" && code !== 0) {
    const msg = body.message ?? body.errmsg ?? body.err_msg ?? "";
    return `code=${code}${msg ? ` ${msg}` : ""}`.trim();
  }
  return null;
}

function isFailure(result) {
  return !result.ok || bodyError(result.body) !== null;
}

async function getRecordGroupIds(record, token) {
  if (Array.isArray(record.group_openids)) return record.group_openids;
  if (!record.panel_id) return [];
  const detail = await request(
    "GET",
    `/v2/panels/${encodeURIComponent(record.panel_id)}`,
    token,
  );
  logRequest("GET", `/v2/panels/${record.panel_id}`, detail);
  return Array.isArray(detail.body?.group_openids) ? detail.body.group_openids : [];
}

async function main() {
  loadDotEnv();
  const botId = (process.env.QQ_BOT_ID ?? "").trim();
  const botSecret = (process.env.QQ_BOT_SECRET ?? "").trim();
  const groupIdsRaw = process.env.GROUP_IDS ?? "";

  const missing = [];
  if (!botId) missing.push("QQ_BOT_ID");
  if (!botSecret) missing.push("QQ_BOT_SECRET");
  if (!groupIdsRaw.trim()) missing.push("GROUP_IDS");
  if (missing.length) {
    console.error(`[error] 缺少环境变量: ${missing.join("、")}`);
    console.error(
      "用法: QQ_BOT_ID=<AppID> QQ_BOT_SECRET=<AppSecret> GROUP_IDS='[\"<group_openid>\"]' node scripts/configure-menu.mjs",
    );
    process.exitCode = 1;
    return;
  }

  const groupIds = parseGroupIds(groupIdsRaw);
  if (!groupIds.length) {
    console.error("[error] GROUP_IDS 解析结果为空（支持 JSON 数组或逗号分隔）");
    process.exitCode = 1;
    return;
  }
  console.log(`群 openid 目标: ${JSON.stringify(groupIds)}`);

  const menuBody = {
    menu: {
      items: [
        { type: "send_message", name: "今日谜题", send_message: "/今日谜题" },
        { type: "send_message", name: "历史谜题", send_message: "/历史谜题" },
      ],
    },
  };

  const panelBody = {
    scope: "group",
    target_type: "specific",
    group_openids: groupIds,
    panel: {
      items: [
        { type: "command", name: "/今日谜题", desc: "获取今日谜题" },
        { type: "command", name: "/历史谜题", desc: "查看历史谜题" },
      ],
    },
  };

  // 1. 换取 access_token
  console.log("[1/4] 获取 access_token");
  const tokenRes = await request("POST", "/app/getAppAccessToken", null, {
    appId: botId,
    clientSecret: botSecret,
  });
  logRequest("POST", "/app/getAppAccessToken", tokenRes);
  const accessToken = tokenRes.body?.access_token;
  if (!tokenRes.ok || !accessToken) {
    const reason = bodyError(tokenRes.body) ?? `HTTP ${tokenRes.status}`;
    console.error(`[error] 获取 access_token 失败: ${reason}`);
    process.exitCode = 1;
    return;
  }

  // 2. 配置单聊自定义菜单（整体覆盖）
  console.log("[2/4] 配置单聊自定义菜单 (PUT /v2/menu)");
  const menuRes = await request("PUT", "/v2/menu", accessToken, menuBody);
  logRequest("PUT", "/v2/menu", menuRes);
  if (isFailure(menuRes)) {
    const reason = bodyError(menuRes.body) ?? `HTTP ${menuRes.status}`;
    console.error(`[error] 配置单聊自定义菜单失败: ${reason}`);
    process.exitCode = 1;
    return;
  }

  // 3. 查询已有群聊指令面板（幂等：命中则更新）
  console.log("[3/4] 查询已有群聊指令面板 (GET /v2/panels?scope=group&limit=50)");
  const listRes = await request(
    "GET",
    "/v2/panels?scope=group&limit=50",
    accessToken,
  );
  logRequest("GET", "/v2/panels?scope=group&limit=50", listRes);
  if (isFailure(listRes)) {
    const reason = bodyError(listRes.body) ?? `HTTP ${listRes.status}`;
    console.error(`[error] 查询群聊指令面板失败: ${reason}`);
    process.exitCode = 1;
    return;
  }

  const records = Array.isArray(listRes.body?.records) ? listRes.body.records : [];
  let existingPanelId = null;
  for (const record of records) {
    if (record?.scope !== "group") continue;
    if (record?.target_type !== "specific") continue;
    const recordGroups = await getRecordGroupIds(record, accessToken);
    if (sameGroupIds(recordGroups, groupIds)) {
      existingPanelId = record.panel_id;
      break;
    }
  }

  // 4. 创建或更新群聊指令面板
  if (existingPanelId) {
    console.log(
      `[4/4] 更新已有群聊指令面板 (PUT /v2/panels/${existingPanelId})`,
    );
    const updateRes = await request(
      "PUT",
      `/v2/panels/${encodeURIComponent(existingPanelId)}`,
      accessToken,
      panelBody,
    );
    logRequest("PUT", `/v2/panels/${existingPanelId}`, updateRes);
    if (isFailure(updateRes)) {
      const reason = bodyError(updateRes.body) ?? `HTTP ${updateRes.status}`;
      console.error(`[error] 更新群聊指令面板失败: ${reason}`);
      process.exitCode = 1;
      return;
    }
  } else {
    console.log("[4/4] 新建群聊指令面板 (POST /v2/panels)");
    const createRes = await request("POST", "/v2/panels", accessToken, panelBody);
    logRequest("POST", "/v2/panels", createRes);
    if (isFailure(createRes)) {
      const reason = bodyError(createRes.body) ?? `HTTP ${createRes.status}`;
      console.error(`[error] 新建群聊指令面板失败: ${reason}`);
      process.exitCode = 1;
      return;
    }
  }

  console.log("[done] 菜单与指令面板配置完成。");
}

main().catch((e) => {
  console.error(`[error] 未预期的错误: ${String(e)}`);
  process.exitCode = 1;
});
