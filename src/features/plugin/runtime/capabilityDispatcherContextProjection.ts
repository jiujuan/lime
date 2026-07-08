import type { PluginTaskRecord } from "../types";
import {
  integerValue,
  isRecord,
  recordArray,
  recordArrayByKeys,
  recordNumberByKeys,
  recordObjectByKeys,
  recordString,
  recordStringByKeys,
} from "./capabilityDispatcherRecord";
import { readTaskThreadRead } from "./capabilityDispatcherRuntimeProjection";
import type {
  RuntimeContextProjection,
  RuntimeMemoryBudgetProjection,
  RuntimeMemoryProjection,
} from "./capabilityDispatcherRuntimeTypes";

function readTaskThreadDiagnostics(
  task: PluginTaskRecord,
): Record<string, unknown> | null {
  const threadRead = readTaskThreadRead(task);
  return isRecord(threadRead?.diagnostics) ? threadRead.diagnostics : null;
}

function readTaskContextSummary(
  task: PluginTaskRecord,
): Record<string, unknown> | null {
  return recordObjectByKeys(readTaskThreadRead(task), [
    "contextSummary",
    "context_summary",
  ]);
}

function readKnowledgeBindingKeys(task: PluginTaskRecord): string[] {
  return task.knowledge
    .map((binding) => binding.key.trim())
    .filter(Boolean)
    .sort();
}

function readThreadTurnIds(
  threadRead: Record<string, unknown> | null,
): string[] {
  return recordArray(threadRead, "turns")
    .filter(isRecord)
    .map(
      (turn) =>
        recordString(turn, "turn_id") ??
        recordString(turn, "turnId") ??
        recordString(turn, "id"),
    )
    .filter((item): item is string => Boolean(item));
}

function readContextSummaryRefs(
  summary: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown>[] {
  return recordArrayByKeys(summary, keys).filter(isRecord);
}

function readContextRefLabels(refs: Record<string, unknown>[]): string[] {
  return Array.from(
    new Set(
      refs
        .flatMap((ref) => [
          recordStringByKeys(ref, ["source_id", "sourceId"]),
          recordStringByKeys(ref, ["title"]),
          recordStringByKeys(ref, ["path"]),
          recordStringByKeys(ref, ["label"]),
          recordStringByKeys(ref, ["key"]),
        ])
        .filter((item): item is string => Boolean(item)),
    ),
  ).sort();
}

function readRuntimeMemoryBudget(
  summary: Record<string, unknown> | null,
): RuntimeMemoryBudgetProjection | undefined {
  const budget = recordObjectByKeys(summary, ["memoryBudget", "memory_budget"]);
  if (!budget) {
    return undefined;
  }
  return {
    usedTokens: recordNumberByKeys(budget, ["usedTokens", "used_tokens"]),
    maxTokens: recordNumberByKeys(budget, ["maxTokens", "max_tokens"]),
    status: recordStringByKeys(budget, ["status"]),
    source: recordStringByKeys(budget, ["source"]),
  };
}

function buildContextGateProjection(task: PluginTaskRecord) {
  const summary = readTaskContextSummary(task);
  const retrievalRefs = readContextSummaryRefs(summary, [
    "retrievalRefs",
    "retrieval_refs",
  ]);
  const missingContext = readContextSummaryRefs(summary, [
    "missingContext",
    "missing_context",
  ]);
  const teamMemoryRefs = readContextSummaryRefs(summary, [
    "teamMemoryRefs",
    "team_memory_refs",
  ]);
  const memoryBudget = readRuntimeMemoryBudget(summary);
  return {
    status: missingContext.length
      ? "needs_context"
      : (memoryBudget?.status ?? (summary ? "ready" : "unknown")),
    memoryBudget,
    retrievalRefs,
    missingContext,
    teamMemoryRefs,
    labels: readContextRefLabels([
      ...retrievalRefs,
      ...missingContext,
      ...teamMemoryRefs,
    ]),
  };
}

export function buildRuntimeMemoryProjection(
  task: PluginTaskRecord,
): RuntimeMemoryProjection {
  const diagnostics = readTaskThreadDiagnostics(task);
  const contextGate = buildContextGateProjection(task);
  return {
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    scope: "task",
    knowledgeBindingKeys: readKnowledgeBindingKeys(task),
    contextCompactionCount: integerValue(
      diagnostics?.context_compaction_count ??
        diagnostics?.contextCompactionCount,
    ),
    pendingRequestCount: integerValue(
      diagnostics?.pending_request_count ?? diagnostics?.pendingRequestCount,
    ),
    memoryBudget: contextGate.memoryBudget,
    contextRefLabels: contextGate.labels,
    retrievalRefCount: contextGate.retrievalRefs.length,
    missingContextCount: contextGate.missingContext.length,
    teamMemoryRefCount: contextGate.teamMemoryRefs.length,
    contextGateStatus: contextGate.status,
    source: "app_server_runtime_projection",
  };
}

export function buildRuntimeContextProjection(
  task: PluginTaskRecord,
): RuntimeContextProjection {
  const threadRead = readTaskThreadRead(task);
  const diagnostics = readTaskThreadDiagnostics(task);
  const contextGate = buildContextGateProjection(task);
  return {
    taskId: task.taskId,
    traceId: task.traceId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    workspaceId: task.provenance.workspaceId,
    threadId:
      recordString(threadRead, "thread_id") ??
      recordString(threadRead, "threadId"),
    turnIds: readThreadTurnIds(threadRead),
    knowledgeBindingKeys: readKnowledgeBindingKeys(task),
    toolKeys: [...task.tools].sort(),
    fileRefs: [...task.files].sort(),
    inputAttached: task.input !== undefined,
    expectedOutputAttached: task.expectedOutput !== undefined,
    pendingRequestCount: integerValue(
      diagnostics?.pending_request_count ?? diagnostics?.pendingRequestCount,
    ),
    contextGateStatus: contextGate.status,
    memoryBudget: contextGate.memoryBudget,
    retrievalRefCount: contextGate.retrievalRefs.length,
    missingContextCount: contextGate.missingContext.length,
    teamMemoryRefCount: contextGate.teamMemoryRefs.length,
    source: "app_server_runtime_projection",
  };
}
