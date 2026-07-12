import type { AgentThreadItem } from "../types";
import type {
  AgentRuntimeThreadReadModel,
  AgentSessionExecutionRuntime,
} from "@/lib/api/agentRuntime";
import { isImportedSourceExecutionRuntime } from "./sessionExecutionRuntime";
import { isImportedSourceMetadata } from "./importedSourceMetadata";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export { isImportedSourceMetadata } from "./importedSourceMetadata";

export function isImportedSourceProcessItem(item: AgentThreadItem): boolean {
  if (
    item.type !== "agent_message" &&
    item.type !== "plan" &&
    item.type !== "reasoning" &&
    item.type !== "tool_call" &&
    item.type !== "command_execution" &&
    item.type !== "patch" &&
    item.type !== "web_search" &&
    item.type !== "approval_request" &&
    item.type !== "request_user_input" &&
    item.type !== "subagent_activity" &&
    item.type !== "context_compaction"
  ) {
    return false;
  }

  return isImportedSourceMetadata(item.metadata);
}

export function hasImportedSourceProcessItem(
  items: readonly AgentThreadItem[] | undefined,
): boolean {
  return Boolean(items?.some(isImportedSourceProcessItem));
}

function hasImportedSourceRecordSignal(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return (
    isImportedSourceMetadata(record) ||
    Boolean(record.imported_continuation) ||
    Boolean(record.importedContinuation) ||
    Boolean(record.imported_thread_settings) ||
    Boolean(record.importedThreadSettings) ||
    Boolean(record.importedRuntimeProjection)
  );
}

export function hasImportedSourceThreadReadSignal(
  threadRead?: AgentRuntimeThreadReadModel | null,
): boolean {
  if (!threadRead) {
    return false;
  }

  return (
    hasImportedSourceRecordSignal(threadRead) ||
    hasImportedSourceRecordSignal(threadRead.diagnostics) ||
    hasImportedSourceRecordSignal(threadRead.runtime_summary)
  );
}

export function hasImportedRuntimeDetailSignal({
  threadItems,
  executionRuntime,
  threadRead,
}: {
  threadItems?: readonly AgentThreadItem[];
  executionRuntime?: AgentSessionExecutionRuntime | null;
  threadRead?: AgentRuntimeThreadReadModel | null;
}): boolean {
  return (
    hasImportedSourceProcessItem(threadItems) ||
    isImportedSourceExecutionRuntime(executionRuntime) ||
    hasImportedSourceThreadReadSignal(threadRead)
  );
}
