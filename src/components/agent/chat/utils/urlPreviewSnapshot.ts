import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import {
  isLikelyWebRetrievalDiagnosticNoise,
} from "./toolProcessSummary";
import { isUnifiedWebFetchToolName } from "./toolNameFamily";
import { parseToolCallArguments } from "./toolDisplayInfo";
import {
  extractStructuredToolDetailText,
  normalizeToolResultDetailText,
  parseStructuredToolResult,
} from "./toolResultDetailText";
import type { SearchResultPreviewItem } from "./searchResultPreview";

export interface UrlPreviewSnapshot {
  content: string;
  title?: string;
  source: "web_fetch";
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeComparableUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    if (
      (parsed.pathname === "/" || parsed.pathname === "") &&
      !trimmed.endsWith("/")
    ) {
      parsed.pathname = "";
    }
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return trimmed.replace(/\/$/, "").toLowerCase();
  }
}

function resolveFetchTargetUrl(toolCall: ToolCallState): string | null {
  const args = parseToolCallArguments(toolCall.arguments);
  return (
    readString(args, [
      "url",
      "uri",
      "href",
      "link",
      "pageUrl",
      "page_url",
      "sourceUrl",
      "source_url",
      "targetUrl",
      "target_url",
    ]) ||
    readString(toolCall.result?.metadata || null, [
      "url",
      "uri",
      "href",
      "link",
      "pageUrl",
      "page_url",
      "sourceUrl",
      "source_url",
      "targetUrl",
      "target_url",
    ])
  );
}

function resolveFetchResultTitle(rawOutput: string): string | undefined {
  const parsed = parseStructuredToolResult(rawOutput);
  const record = asRecord(parsed);
  const nestedRecord =
    asRecord(record?.result) ||
    asRecord(record?.data) ||
    asRecord(record?.page) ||
    asRecord(record?.article) ||
    asRecord(record?.document);
  return (
    readString(record, ["title", "name", "headline"]) ||
    readString(nestedRecord, ["title", "name", "headline"]) ||
    undefined
  );
}

function resolveFetchResultContent(rawOutput: string): string | null {
  const parsed = parseStructuredToolResult(rawOutput);
  const normalized = parsed
    ? extractStructuredToolDetailText(parsed)
    : normalizeToolResultDetailText(rawOutput);
  const content = normalized?.trim();
  if (!content || content === rawOutput.trim()) {
    return content || null;
  }
  return content;
}

function isUsableSnapshotContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }
  if (isLikelyWebRetrievalDiagnosticNoise(trimmed)) {
    return false;
  }
  return true;
}

export function resolveUrlPreviewSnapshotFromToolCalls(params: {
  item: Pick<SearchResultPreviewItem, "url">;
  toolCalls?: ToolCallState[];
}): UrlPreviewSnapshot | null {
  const targetUrl = normalizeComparableUrl(params.item.url);
  if (!targetUrl) {
    return null;
  }

  for (const toolCall of params.toolCalls || []) {
    if (
      toolCall.status !== "completed" ||
      !toolCall.result?.success ||
      !isUnifiedWebFetchToolName(toolCall.name)
    ) {
      continue;
    }

    const fetchUrl = resolveFetchTargetUrl(toolCall);
    if (normalizeComparableUrl(fetchUrl || "") !== targetUrl) {
      continue;
    }

    const content = resolveFetchResultContent(toolCall.result.output);
    if (!content || !isUsableSnapshotContent(content)) {
      continue;
    }

    return {
      content,
      title: resolveFetchResultTitle(toolCall.result.output),
      source: "web_fetch",
    };
  }

  return null;
}

export function attachUrlPreviewSnapshotsToSearchResults(params: {
  items: SearchResultPreviewItem[];
  toolCalls?: ToolCallState[];
}): SearchResultPreviewItem[] {
  if (!params.items.length || !params.toolCalls?.length) {
    return params.items;
  }

  return params.items.map((item) => {
    const snapshot = resolveUrlPreviewSnapshotFromToolCalls({
      item,
      toolCalls: params.toolCalls,
    });
    if (!snapshot) {
      return item;
    }
    return {
      ...item,
      snapshotContent: snapshot.content,
      snapshotTitle: snapshot.title,
      snapshotSource: snapshot.source,
    };
  });
}
