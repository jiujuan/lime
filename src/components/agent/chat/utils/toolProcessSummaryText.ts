import { extractLimeToolMetadataBlock } from "../hooks/agentChatToolResult";
import { resolveRequiredAgentChatCopy } from "./agentChatCopy";
import {
  isLimeTaskProtocolFailure,
  resolveLimeTaskProtocolFailureDisplayText,
} from "./limeTaskProtocolNoise";
import { isUnifiedWebSearchToolName } from "./searchResultPreview";
import {
  getToolDisplayInfo,
  parseToolCallArguments,
  resolveToolFilePath,
  resolveToolPrimarySubject,
  type ToolCallArgumentValue,
} from "./toolDisplayInfo";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function readString(
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

export function collapseWhitespace(value: string): string {
  return value
    .replace(/\s+([，。！？、；：,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function shorten(
  value: string | null | undefined,
  maxLength = 80,
): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function stripFencedCode(value: string): string {
  return value.replace(/```[\s\S]*?```/g, "").trim();
}

function looksLikeCodeOrJson(value: string): boolean {
  return /^(?:[{[]|import\s|export\s|const\s|let\s|var\s|function\s|class\s|if\s*\(|for\s*\(|while\s*\(|return\s|<\w+)/i.test(
    value,
  );
}

function looksLikeOpaqueAck(value: string): boolean {
  return /^(?:ok|okay|done|success|completed|true|false|null|undefined)$/i.test(
    value.trim(),
  );
}

function looksLikeXmlOrHtmlDocument(value: string): boolean {
  const normalized = value.trim().slice(0, 600);
  return (
    /^<\?xml\b/i.test(normalized) ||
    /^<!doctype\s+html\b/i.test(normalized) ||
    /^<html\b/i.test(normalized) ||
    /^<rss\b/i.test(normalized) ||
    /^<feed\b/i.test(normalized) ||
    /<(rss|feed|channel|item|entry|html|body)\b/i.test(normalized)
  );
}

export function isLikelyWebRetrievalDiagnosticNoise(value: string): boolean {
  const normalized = collapseWhitespace(value).toLowerCase();
  return (
    looksLikeXmlOrHtmlDocument(value) ||
    /\b(?:timed?\s*out|timeout|deadline exceeded|network error|fetch failed|connection refused|connection reset|dns|ssl|tls|invalid url|unsupported url|404 not found|403 forbidden|429 too many requests|502 bad gateway|503 service unavailable)\b/i.test(
      normalized,
    ) ||
    /^(?:error|failed|request failed)[:：]/i.test(normalized)
  );
}

export function normalizePlainResultLine(
  value: string | null | undefined,
  maxLength = 96,
): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  const stripped = stripFencedCode(extractLimeToolMetadataBlock(raw).text);
  if (!stripped) {
    return null;
  }

  const line =
    stripped
      .split(/\r?\n/)
      .map((entry) => collapseWhitespace(entry))
      .find(Boolean) || "";
  if (
    !line ||
    looksLikeCodeOrJson(line) ||
    looksLikeOpaqueAck(line) ||
    looksLikeXmlOrHtmlDocument(line)
  ) {
    return null;
  }

  return shorten(line, maxLength);
}

function extractToolResultText(
  value: string | null | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  const normalized = extractLimeToolMetadataBlock(raw).text.trim();
  return normalized || null;
}

function isLikelyWebSearchRuntimeUnavailable(
  toolName: string,
  value: string,
): boolean {
  if (!isUnifiedWebSearchToolName(toolName)) {
    return false;
  }

  const normalized = collapseWhitespace(value).toLowerCase();
  if (!normalized.includes("websearch")) {
    return false;
  }

  return (
    (normalized.includes("-32603") && normalized.includes("-32002")) ||
    normalized.includes("tool not found") ||
    normalized.includes("tool failed") ||
    normalized.includes("未找到可执行的必需工具定义") ||
    normalized.includes("执行 websearch 预调用失败") ||
    normalized.includes("websearch 预调用失败")
  );
}

function stripRuntimeProtocolErrorPrefix(value: string): string | null {
  const stripped = value
    .replace(
      /^\s*(?:执行失败[:：]\s*)?(?:-32603\s*:\s*)?(?:-32002\s*:?\s*)?/i,
      "",
    )
    .replace(/^\s*(?:json-?rpc|runtime|tool)\s+error[:：]\s*/i, "")
    .trim();

  if (!stripped || stripped === value.trim()) {
    return null;
  }

  return stripped;
}

function isLikelyRuntimeProtocolError(value: string): boolean {
  return /(?:-32603|-32002|json-?rpc|tool failed|runtime error)/i.test(value);
}

function resolveRuntimeProtocolErrorSummaryText(
  toolName: string,
  value: string,
  maxLength: number,
): string | null {
  if (!isLikelyRuntimeProtocolError(value)) {
    return null;
  }

  const stripped = stripRuntimeProtocolErrorPrefix(value);
  if (stripped) {
    return normalizePlainResultLine(stripped, maxLength);
  }

  const display = getToolDisplayInfo(toolName, "failed");
  return shorten(
    resolveRequiredAgentChatCopy(
      "toolCall.processSummary.error.runtimeNoDetail",
      { label: display.label },
    ),
    maxLength,
  );
}

export function resolveToolErrorSummaryText(
  toolName: string,
  value: string | null | undefined,
  maxLength = 88,
): string | null {
  const normalized = extractToolResultText(value);
  if (!normalized) {
    return null;
  }

  if (isLikelyWebSearchRuntimeUnavailable(toolName, normalized)) {
    return shorten(
      resolveRequiredAgentChatCopy(
        "toolCall.processSummary.error.webSearchRuntimeUnavailable",
      ),
      maxLength,
    );
  }

  if (isLimeTaskProtocolFailure({ toolName, text: normalized })) {
    return shorten(
      resolveLimeTaskProtocolFailureDisplayText({
        toolName,
        text: normalized,
      }),
      maxLength,
    );
  }

  const protocolSummary = resolveRuntimeProtocolErrorSummaryText(
    toolName,
    normalized,
    maxLength,
  );
  if (protocolSummary) {
    return protocolSummary;
  }

  return normalizePlainResultLine(value, maxLength);
}

export function resolveToolErrorDetailText(
  toolName: string,
  value: string | null | undefined,
): string | null {
  const normalized = extractToolResultText(value);
  if (!normalized) {
    return null;
  }

  if (!isLikelyWebSearchRuntimeUnavailable(toolName, normalized)) {
    if (isLimeTaskProtocolFailure({ toolName, text: normalized })) {
      return resolveLimeTaskProtocolFailureDisplayText({
        toolName,
        text: normalized,
      });
    }

    const stripped = stripRuntimeProtocolErrorPrefix(normalized);
    if (stripped) {
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.error.withOriginal",
        { message: stripped, original: normalized },
      );
    }

    return normalized;
  }

  return resolveRequiredAgentChatCopy(
    "toolCall.processSummary.error.withOriginal",
    {
      message: resolveRequiredAgentChatCopy(
        "toolCall.processSummary.error.webSearchRuntimeUnavailable",
      ),
      original: normalized,
    },
  );
}

export function normalizeArgumentsRecord(
  value?: string | Record<string, unknown>,
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    return parseToolCallArguments(value) as Record<string, unknown>;
  }

  return value;
}

export function resolveToolSubject(
  toolName: string,
  argumentsValue?: string | Record<string, unknown>,
): string | null {
  const args = normalizeArgumentsRecord(argumentsValue);
  const toolArgs = args as Record<string, ToolCallArgumentValue>;
  return resolveToolPrimarySubject(
    toolName,
    toolArgs,
    resolveToolFilePath(toolArgs),
  );
}
