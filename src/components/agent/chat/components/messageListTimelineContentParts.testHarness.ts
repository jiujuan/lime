import type { AgentThreadItem, Message } from "../types";

export const TOOL_START_TIME = new Date("2026-06-20T12:00:00.000Z");
export const TOOL_FETCH_START_TIME = new Date("2026-06-20T12:00:01.000Z");

export function buildThreadItems(
  items: Array<Record<string, unknown> & { turn_id: string; thread_id?: string }>,
): AgentThreadItem[] {
  return items.map((item) => ({
    ...item,
    thread_id: item.thread_id ?? `thread-${item.turn_id}`,
  })) as AgentThreadItem[];
}

export type { Message };
