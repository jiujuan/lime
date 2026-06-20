import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import { resolveRequiredAgentChatCopy } from "./agentChatCopy";
import { normalizeToolNameKey } from "./toolDisplaySubject";

type MemoryToolOperation = "list" | "read" | "search" | "add_note";

export interface MemoryToolEvidence {
  operation: MemoryToolOperation;
  path?: string;
  scope?: string;
  hitCount?: number;
  entryCount?: number;
  citation?: string;
  truncated: boolean;
  hasNextCursor: boolean;
  summary: string;
  lines: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readBoolean(
  record: Record<string, unknown> | null,
  keys: string[],
): boolean {
  if (!record) {
    return false;
  }
  return keys.some((key) => record[key] === true);
}

function readArrayLength(
  record: Record<string, unknown> | null,
  key: string,
): number | undefined {
  const value = record?.[key];
  return Array.isArray(value) ? value.length : undefined;
}

function readCitation(record: Record<string, unknown> | null): string | null {
  const citation = asRecord(record?.citation);
  const path = readString(citation, ["path"]);
  const startLine = citation?.startLine;
  const endLine = citation?.endLine;

  if (!path) {
    return null;
  }

  if (
    typeof startLine === "number" &&
    Number.isFinite(startLine) &&
    typeof endLine === "number" &&
    Number.isFinite(endLine)
  ) {
    return `${path}:${startLine}-${endLine}`;
  }

  return path;
}

function resolveOperation(
  toolName: string,
  metadata: Record<string, unknown> | null,
): MemoryToolOperation | null {
  const operation = readString(metadata, ["operation"]);
  if (
    operation === "list" ||
    operation === "read" ||
    operation === "search" ||
    operation === "add_note"
  ) {
    return operation;
  }

  const normalizedName = normalizeToolNameKey(toolName);
  if (normalizedName === "memorylist") return "list";
  if (normalizedName === "memoryread") return "read";
  if (normalizedName === "memorysearch") return "search";
  if (normalizedName === "memoryaddnote") return "add_note";
  return null;
}

function buildSummary(params: {
  operation: MemoryToolOperation;
  path?: string;
  hitCount?: number;
  entryCount?: number;
}): string {
  const path =
    params.path ||
    resolveRequiredAgentChatCopy("toolCall.memoryEvidence.defaultPath");
  switch (params.operation) {
    case "list":
      return resolveRequiredAgentChatCopy(
        "toolCall.memoryEvidence.summary.list",
        {
          count: params.entryCount ?? 0,
          path,
        },
      );
    case "read":
      return resolveRequiredAgentChatCopy(
        "toolCall.memoryEvidence.summary.read",
        {
          path,
        },
      );
    case "search":
      return resolveRequiredAgentChatCopy(
        "toolCall.memoryEvidence.summary.search",
        { count: params.hitCount ?? 0 },
      );
    case "add_note":
      return resolveRequiredAgentChatCopy(
        "toolCall.memoryEvidence.summary.addNote",
        { path },
      );
  }
}

export function resolveMemoryToolEvidence(
  toolCall: ToolCallState,
): MemoryToolEvidence | null {
  const metadata = {
    ...(asRecord(toolCall.metadata) || {}),
    ...(asRecord(toolCall.result?.metadata) || {}),
  };
  const metadataRecord = Object.keys(metadata).length > 0 ? metadata : null;
  const operation = resolveOperation(toolCall.name, metadataRecord);
  if (!operation) {
    return null;
  }

  const path = readString(metadataRecord, ["path"]);
  const scope = readString(metadataRecord, [
    "rootScope",
    "root_scope",
    "scope",
  ]);
  const hitCount = readArrayLength(metadataRecord, "hits");
  const entryCount = readArrayLength(metadataRecord, "entries");
  const citation = readCitation(metadataRecord);
  const truncated = readBoolean(metadataRecord, ["truncated"]);
  const hasNextCursor = Boolean(
    readString(metadataRecord, ["nextCursor", "next_cursor"]),
  );
  const lines = [
    scope
      ? resolveRequiredAgentChatCopy("toolCall.memoryEvidence.scope", {
          scope,
        })
      : null,
    path
      ? resolveRequiredAgentChatCopy("toolCall.memoryEvidence.path", { path })
      : null,
    typeof hitCount === "number"
      ? resolveRequiredAgentChatCopy("toolCall.memoryEvidence.hits", {
          count: hitCount,
        })
      : null,
    typeof entryCount === "number"
      ? resolveRequiredAgentChatCopy("toolCall.memoryEvidence.entries", {
          count: entryCount,
        })
      : null,
    citation
      ? resolveRequiredAgentChatCopy("toolCall.memoryEvidence.citation", {
          citation,
        })
      : null,
    truncated || hasNextCursor
      ? resolveRequiredAgentChatCopy("toolCall.memoryEvidence.truncated")
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    operation,
    path: path || undefined,
    scope: scope || undefined,
    hitCount,
    entryCount,
    citation: citation || undefined,
    truncated,
    hasNextCursor,
    summary: buildSummary({
      operation,
      path: path || undefined,
      hitCount,
      entryCount,
    }),
    lines,
  };
}
