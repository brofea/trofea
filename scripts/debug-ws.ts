import WebSocket from "ws";
import { loadDotEnv, requireBotEnv } from "./env.js";
import { QQApiClient } from "../src/adapter/api.js";

loadDotEnv();
const { appId, appSecret } = requireBotEnv();
const client = new QQApiClient(appId, appSecret, { fetch });
const intents = 2 ** 25 + 2 ** 30;

let reconnectTimer: NodeJS.Timeout | undefined;

async function connect(): Promise<void> {
  const token = await client.getAccessToken();
  const gatewayResponse = await fetch("https://api.sgroup.qq.com/gateway", {
    headers: { Authorization: `QQBot ${token}` },
  });
  if (!gatewayResponse.ok) {
    throw new Error(`获取 WebSocket gateway 失败: HTTP ${gatewayResponse.status}`);
  }
  const gateway = (await gatewayResponse.json()) as { url?: string };
  if (!gateway.url) throw new Error("QQ gateway 响应缺少 url");

  const socket = new WebSocket(gateway.url, {
    headers: { Authorization: `QQBot ${token}` },
  });
  let sequence: number | null = null;
  let heartbeat: NodeJS.Timeout | undefined;

  socket.on("open", () => {
    console.log("[ws] connected");
  });

  socket.on("message", (raw) => {
    const payload = JSON.parse(raw.toString()) as {
      op?: number;
      s?: number;
      t?: string;
      d?: unknown;
    };
    if (typeof payload.s === "number") sequence = payload.s;

    if (payload.op === 10) {
      const hello = payload.d as { heartbeat_interval?: number } | undefined;
      const interval = hello?.heartbeat_interval ?? 45000;
      heartbeat = setInterval(() => {
        socket.send(JSON.stringify({ op: 1, d: sequence }));
      }, interval);
      socket.send(JSON.stringify({
        op: 2,
        d: {
          token: `QQBot ${token}`,
          intents,
          shard: [0, 1],
          properties: { $os: process.platform, $browser: "trofea", $device: "trofea" },
        },
      }));
      return;
    }
    if (payload.op === 0) {
      const data = payload.d as Record<string, unknown> | undefined;
      console.log(JSON.stringify({
        time: new Date().toISOString(),
        eventType: payload.t,
        content: typeof data?.content === "string" ? data.content : undefined,
        messageId: typeof data?.id === "string" ? data.id : undefined,
        userOpenid: getNestedString(data, ["author", "user_openid"]),
        groupOpenid: typeof data?.group_openid === "string" ? data.group_openid : undefined,
        raw: payload,
      }, null, 2));
    }
  });

  socket.on("error", (error) => console.error("[ws] error", error));
  socket.on("close", () => {
    if (heartbeat) clearInterval(heartbeat);
    console.log("[ws] disconnected, reconnecting in 3s");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect().catch(reportAndReconnect);
    }, 3000);
  });
}

function getNestedString(value: Record<string, unknown> | undefined, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

function reportAndReconnect(error: unknown): void {
  console.error("[ws] connection failed", error);
  if (!reconnectTimer) reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void connect().catch(reportAndReconnect);
  }, 3000);
}

void connect().catch(reportAndReconnect);
