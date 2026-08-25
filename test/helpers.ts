import type { FetchLike, OutboundMessage, SendOptions } from "../src/types.js";

export function mockFetch(
  routes: Record<string, { status?: number; body?: string }>,
  networkError?: Error,
): FetchLike {
  return {
    fetch: async (input) => {
      if (networkError) throw networkError;
      const url = typeof input === "string" ? input : input.toString();
      const route = routes[url];
      if (!route) return new Response("not found", { status: 404 });
      return new Response(route.body ?? "", { status: route.status ?? 200 });
    },
  };
}

export function mockSender() {
  const calls = {
    group: [] as { id: string; message: OutboundMessage; options?: SendOptions }[],
    user: [] as { id: string; message: OutboundMessage; options?: SendOptions }[],
  };
  const sender = {
    async sendToGroup(id: string, message: OutboundMessage, options?: SendOptions) {
      calls.group.push({ id, message, options });
      return { ok: true, messageId: `group-${calls.group.length}` };
    },
    async sendToUser(id: string, message: OutboundMessage, options?: SendOptions) {
      calls.user.push({ id, message, options });
      return { ok: true, messageId: `user-${calls.user.length}` };
    },
  };
  return { calls, sender };
}
