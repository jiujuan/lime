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

interface CanonicalAgentStateFact {
  message?: string;
  status: CanonicalAgentStatus;
}

interface CanonicalThreadExtra {
  agentPath?: string;
  agentState?: CanonicalAgentStateFact;
  lastTaskMessage?: string;
}

type CanonicalTurn = NonNullable<AppServerThread["turns"]>[number];

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
    summaries.set(thread.id, summaryFromThread(thread));
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

function summaryFromThread(
  thread: AppServerThread,
): CanonicalChildThreadSummary {
  const extra = readCanonicalThreadExtra(thread.extra);
  const path = extra.agentPath;
  const nickname = thread.agentNickname?.trim() || undefined;
  const role = thread.agentRole?.trim() || undefined;
  const taskSummary = extra.lastTaskMessage;
  const status = resolveCanonicalAgentStatus(thread, extra.agentState);
  const latestTurn = latestCanonicalTurn(thread);
  const statusMessage =
    extra.agentState?.message ||
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
      thread.id,
    parentThreadId: thread.parentThreadId ?? "",
    ...(path ? { path } : {}),
    ...(role ? { role } : {}),
    sessionId: thread.sessionId,
    status,
    ...(statusMessage ? { statusMessage } : {}),
    ...(taskSummary ? { taskSummary } : {}),
    threadId: thread.id,
    updatedAtMs: thread.updatedAt * 1_000,
  };
}

function resolveCanonicalAgentStatus(
  thread: AppServerThread,
  agentState: CanonicalAgentStateFact | undefined,
): CanonicalAgentStatus {
  if (agentState) {
    return agentState.status;
  }
  if (thread.status?.type === "active") {
    return "running";
  }
  if (thread.status?.type === "systemError") {
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

function latestCanonicalTurn(
  thread: AppServerThread,
): CanonicalTurn | undefined {
  return [...(thread.turns ?? [])].sort(
    (left, right) =>
      canonicalTurnTimestamp(right) - canonicalTurnTimestamp(left) ||
      right.id.localeCompare(left.id),
  )[0];
}

function canonicalTurnTimestamp(turn: CanonicalTurn): number {
  return turn.completedAt ?? turn.startedAt ?? 0;
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

function readCanonicalThreadExtra(value: unknown): CanonicalThreadExtra {
  if (!isRecord(value)) {
    return {};
  }
  const agentPath = readTrimmedString(value.agentPath);
  const lastTaskMessage = readTrimmedString(value.lastTaskMessage);
  const agentState = readCanonicalAgentState(value.agentState);
  return {
    ...(agentPath ? { agentPath } : {}),
    ...(agentState ? { agentState } : {}),
    ...(lastTaskMessage ? { lastTaskMessage } : {}),
  };
}

function readCanonicalAgentState(
  value: unknown,
): CanonicalAgentStateFact | undefined {
  if (!isRecord(value) || !isCanonicalAgentStatus(value.status)) {
    return undefined;
  }
  const message = readTrimmedString(value.message);
  return {
    status: value.status,
    ...(message ? { message } : {}),
  };
}

function isCanonicalAgentStatus(value: unknown): value is CanonicalAgentStatus {
  switch (value) {
    case "pendingInit":
    case "running":
    case "interrupted":
    case "completed":
    case "errored":
    case "shutdown":
    case "notFound":
      return true;
    default:
      return false;
  }
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
