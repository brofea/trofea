import type { FetchLike } from "../src/types.js";

/** 构造可控 fetch：按 URL 映射到 status + body。 */
export function mockFetch(
  routes: Record<string, { status?: number; body?: string }>,
  opts?: { networkError?: (url: string) => Error | undefined },
): FetchLike {
  return {
    fetch: async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const netErr = opts?.networkError?.(url);
      if (netErr) throw netErr;
      const route = routes[url];
      if (!route) {
        return new Response("not found", { status: 404 });
      }
      return new Response(route.body ?? "", {
        status: route.status ?? 200,
      });
    },
  };
}

/** 记录调用的 MessageSender 桩。 */
export function mockSender() {
  const calls: {
    group: { id: string; text: string; msgId?: string }[];
  } = { group: [] };
  return {
    calls,
    sender: {
      async sendToGroup(
        groupId: string,
        message: { text: string },
        opts?: { msgId?: string },
      ) {
        calls.group.push({ id: groupId, text: message.text, msgId: opts?.msgId });
        return { ok: true, messageId: `msg-${calls.group.length}` };
      },
    },
  };
}
