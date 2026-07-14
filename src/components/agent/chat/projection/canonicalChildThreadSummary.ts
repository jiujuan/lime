import type { AppServerThread } from "@/lib/api/appServer";

export type CanonicalAgentStatus =
  | "pendingInit"
  | "running"
  | "interrupted"
  | "completed"
  | "errored"
  | "shutdown"
  | "notFound";

export interface CanonicalChildThreadSummary {
  modelProvider?: string;
  name: string;
  parentThreadId: string;
  path?: string;
  role?: string;
  sessionId: string | null;
  status: CanonicalAgentStatus;
  statusMessage?: string;
  taskSummary?: string;
  threadId: string;
  updatedAtMs: number;
}

export interface CanonicalChildThreadCounts {
  active: number;
  failed: number;
  interrupted: number;
  queued: number;
  running: number;
  settled: number;
  total: number;
}

interface SelectCanonicalChildThreadSummariesOptions {
  parentThreadId: string;
  referencedChildThreadIds?: Iterable<string>;
  threads: AppServerThread[];
}

export function selectCanonicalChildThreadSummaries({
  parentThreadId,
  referencedChildThreadIds = [],
  threads,
}: SelectCanonicalChildThreadSummariesOptions): CanonicalChildThreadSummary[] {
  const normalizedParentThreadId = parentThreadId.trim();
  if (!normalizedParentThreadId) {
    return [];
  }

  const summaries = new Map<string, CanonicalChildThreadSummary>();
  for (const thread of threads) {
    if (thread.parentThreadId !== normalizedParentThreadId) {
      continue;
    }
    summaries.set(thread.threadId, summaryFromThread(thread));
  }
  for (const childThreadId of referencedChildThreadIds) {
    const normalizedChildThreadId = childThreadId.trim();
    if (!normalizedChildThreadId || summaries.has(normalizedChildThreadId)) {
      continue;
    }
    summaries.set(normalizedChildThreadId, {
      name: normalizedChildThreadId,
      parentThreadId: normalizedParentThreadId,
      sessionId: null,
      status: "notFound",
      statusMessage: "Canonical child thread not found",
      threadId: normalizedChildThreadId,
      updatedAtMs: 0,
    });
  }

  return [...summaries.values()].sort(compareChildSummaries);
}

export function summarizeCanonicalChildThreads(
  children: CanonicalChildThreadSummary[],
): CanonicalChildThreadCounts {
  let queued = 0;
  let running = 0;
  let active = 0;
  let interrupted = 0;
  let settled = 0;
  let failed = 0;

  for (const child of children) {
    switch (child.status) {
      case "pendingInit":
        queued += 1;
        active += 1;
        break;
      case "running":
        running += 1;
        active += 1;
        break;
      case "interrupted":
        interrupted += 1;
        break;
      case "completed":
      case "shutdown":
        settled += 1;
        break;
      case "errored":
      case "notFound":
        failed += 1;
        break;
    }
  }

  return {
    active,
    failed,
    interrupted,
    queued,
    running,
    settled,
    total: children.length,
  };
}

function summaryFromThread(thread: AppServerThread): CanonicalChildThreadSummary {
  const path = thread.agentPath?.trim() || undefined;
  const nickname = thread.agentNickname?.trim() || undefined;
  const role = thread.agentRole?.trim() || undefined;
  const taskSummary = thread.lastTaskMessage?.trim() || undefined;
  const status = resolveCanonicalAgentStatus(thread);
  const latestTurn = latestCanonicalTurn(thread);
  const statusMessage =
    thread.agentState?.message?.trim() ||
    (status === "errored" ? latestTurn?.error?.message?.trim() : undefined);

  return {
    ...(thread.modelProvider?.trim()
      ? { modelProvider: thread.modelProvider.trim() }
      : {}),
    name:
      nickname ??
      thread.name?.trim() ??
      lastPathSegment(path) ??
      thread.preview?.trim() ??
      thread.threadId,
    parentThreadId: thread.parentThreadId ?? "",
    ...(path ? { path } : {}),
    ...(role ? { role } : {}),
    sessionId: thread.sessionId,
    status,
    ...(statusMessage ? { statusMessage } : {}),
    ...(taskSummary ? { taskSummary } : {}),
    threadId: thread.threadId,
    updatedAtMs: thread.updatedAtMs,
  };
}

function resolveCanonicalAgentStatus(
  thread: AppServerThread,
): CanonicalAgentStatus {
  if (thread.agentState) {
    return thread.agentState.status;
  }
  if (thread.status.type === "active") {
    return "running";
  }
  if (thread.status.type === "systemError") {
    return "errored";
  }

  switch (latestCanonicalTurn(thread)?.status) {
    case "inProgress":
      return "running";
    case "interrupted":
      return "interrupted";
    case "failed":
      return "errored";
    case "completed":
      return "completed";
    default:
      return "pendingInit";
  }
}

function latestCanonicalTurn(thread: AppServerThread) {
  return [...(thread.turns ?? [])].sort(
    (left, right) =>
      right.updatedAtMs - left.updatedAtMs ||
      right.turnId.localeCompare(left.turnId),
  )[0];
}

function compareChildSummaries(
  left: CanonicalChildThreadSummary,
  right: CanonicalChildThreadSummary,
): number {
  return (
    (left.path ?? left.name).localeCompare(right.path ?? right.name) ||
    left.threadId.localeCompare(right.threadId)
  );
}

function lastPathSegment(path: string | undefined): string | undefined {
  return path?.split("/").filter(Boolean).at(-1);
}
