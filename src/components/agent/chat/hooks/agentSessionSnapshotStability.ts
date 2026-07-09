import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import type { AgentSessionSnapshot } from "./agentSessionState";

function normalizeDateValue(value: Date | string | number | null | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? null;
}

function stableStringify(value: unknown): string {
  if (typeof value === "undefined") {
    return "undefined";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      const record = value as Record<string, unknown>;
      return `${JSON.stringify(key)}:${stableStringify(record[key])}`;
    })
    .join(",")}}`;
}

function messageSignature(message: Message): string {
  return stableStringify({
    ...message,
    timestamp: normalizeDateValue(message.timestamp),
  });
}

function turnSignature(turn: AgentThreadTurn): string {
  return stableStringify(turn);
}

function itemSignature(item: AgentThreadItem): string {
  return stableStringify(item);
}

function arraysEquivalentBySignature<T>(
  left: readonly T[],
  right: readonly T[],
  signature: (value: T) => string,
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const rightItem = right[index];
    return rightItem !== undefined && signature(item) === signature(rightItem);
  });
}

export function reuseStableAgentSessionSnapshotReferences(
  snapshot: AgentSessionSnapshot,
  current: {
    messages: readonly Message[];
    threadItems: readonly AgentThreadItem[];
    threadTurns: readonly AgentThreadTurn[];
  },
): AgentSessionSnapshot {
  const messages = arraysEquivalentBySignature(
    current.messages,
    snapshot.messages,
    messageSignature,
  )
    ? (current.messages as Message[])
    : snapshot.messages;
  const threadTurns = arraysEquivalentBySignature(
    current.threadTurns,
    snapshot.threadTurns,
    turnSignature,
  )
    ? (current.threadTurns as AgentThreadTurn[])
    : snapshot.threadTurns;
  const threadItems = arraysEquivalentBySignature(
    current.threadItems,
    snapshot.threadItems,
    itemSignature,
  )
    ? (current.threadItems as AgentThreadItem[])
    : snapshot.threadItems;

  if (
    messages === snapshot.messages &&
    threadTurns === snapshot.threadTurns &&
    threadItems === snapshot.threadItems
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    messages,
    threadTurns,
    threadItems,
  };
}
