import type { AgentThreadItem } from "../types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function isImportedSourceMetadata(metadata: unknown): boolean {
  const record = asRecord(metadata);
  if (!record) {
    return false;
  }

  return (
    record.imported === true ||
    record.imported_synthetic === true ||
    record.importedSynthetic === true ||
    record.source_client === "codex" ||
    record.sourceClient === "codex"
  );
}

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
