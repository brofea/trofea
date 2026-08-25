import { QQApiClient, readResponseBody } from "../src/adapter/api.js";
import { groupIds, loadDotEnv, requireBotEnv } from "./env.js";

loadDotEnv();

const ids = groupIds();
if (ids.length === 0) {
  throw new Error("缺少 GROUP_IDS，格式：group_openid_1,group_openid_2");
}

const { appId, appSecret } = requireBotEnv();
const client = new QQApiClient(appId, appSecret, { fetch });

const menu = {
  menu: {
    items: [
      { type: "send_message", name: "今日谜题", send_message: "/今日谜题" },
      { type: "send_message", name: "历史谜题", send_message: "/历史谜题" },
    ],
  },
};

const panel = {
  scope: "group",
  target_type: "specific",
  group_openids: ids,
  panel: {
    items: [
      { type: "command", name: "/今日谜题", desc: "获取今日谜题" },
      { type: "command", name: "/历史谜题", desc: "查看历史谜题" },
    ],
  },
};

async function expectOk(method: string, path: string, body?: unknown): Promise<Record<string, unknown> | null> {
  const response = await client.request(method, path, body);
  const result = await readResponseBody(response);
  console.log(`${method} ${path} -> ${response.status}`);
  if (!response.ok) {
    throw new Error(`${method} ${path} 失败: HTTP ${response.status}`);
  }
  return result;
}

await expectOk("PUT", "/v2/menu", menu);
const panels = await expectOk("GET", "/v2/panels?scope=group&limit=50");
const records = Array.isArray(panels?.records) ? panels.records : [];
const existing = records.find((record) => {
  if (!record || typeof record !== "object") return false;
  const value = record as Record<string, unknown>;
  return value.scope === "group" && value.target_type === "specific" &&
    Array.isArray(value.group_openids) && sameIds(value.group_openids, ids);
});

if (existing && typeof existing === "object" && typeof (existing as Record<string, unknown>).panel_id === "string") {
  await expectOk("PUT", `/v2/panels/${encodeURIComponent((existing as Record<string, string>).panel_id)}`, panel);
} else {
  await expectOk("POST", "/v2/panels", panel);
}

console.log("菜单与群组面板配置完成。");

function sameIds(left: unknown[], right: string[]): boolean {
  const a = left.filter((value): value is string => typeof value === "string").sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
