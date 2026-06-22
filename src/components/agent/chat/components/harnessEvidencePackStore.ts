import { useSyncExternalStore } from "react";
import type { AgentRuntimeEvidencePack } from "@/lib/api/agentRuntime";

interface EvidencePackLookup {
  sessionId?: string | null;
  threadId?: string | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const packsBySessionId = new Map<string, AgentRuntimeEvidencePack>();
const packsByThreadId = new Map<string, AgentRuntimeEvidencePack>();

function normalizeKey(value?: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function emitEvidencePackStoreChange() {
  listeners.forEach((listener) => listener());
}

function subscribeEvidencePackStore(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readHarnessEvidencePackSnapshot({
  sessionId,
  threadId,
}: EvidencePackLookup): AgentRuntimeEvidencePack | null {
  const normalizedSessionId = normalizeKey(sessionId);
  if (normalizedSessionId) {
    const pack = packsBySessionId.get(normalizedSessionId);
    if (pack) {
      return pack;
    }
  }

  const normalizedThreadId = normalizeKey(threadId);
  return normalizedThreadId
    ? packsByThreadId.get(normalizedThreadId) ?? null
    : null;
}

export function recordHarnessEvidencePack(pack: AgentRuntimeEvidencePack) {
  const sessionId = normalizeKey(pack.session_id);
  if (sessionId) {
    packsBySessionId.set(sessionId, pack);
  }

  const threadId = normalizeKey(pack.thread_id);
  if (threadId) {
    packsByThreadId.set(threadId, pack);
  }

  emitEvidencePackStoreChange();
}

export function clearHarnessEvidencePackStore() {
  packsBySessionId.clear();
  packsByThreadId.clear();
  emitEvidencePackStoreChange();
}

export function resolveHarnessEvidenceThreadId(
  threadItems?: readonly { thread_id?: string | null }[],
): string | null {
  if (!threadItems) {
    return null;
  }
  for (let index = threadItems.length - 1; index >= 0; index -= 1) {
    const threadId = normalizeKey(threadItems[index]?.thread_id);
    if (threadId) {
      return threadId;
    }
  }
  return null;
}

export function useHarnessEvidencePackSnapshot(
  lookup: EvidencePackLookup,
): AgentRuntimeEvidencePack | null {
  return useSyncExternalStore(
    subscribeEvidencePackStore,
    () => readHarnessEvidencePackSnapshot(lookup),
    () => readHarnessEvidencePackSnapshot(lookup),
  );
}
