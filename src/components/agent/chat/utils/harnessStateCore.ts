import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { AgentRuntimeStatus, Message } from "../types";
import type { HarnessFileKind, ToolCallEntry } from "./harnessStateTypes";

export function extractLatestRuntimeStatus(
  messages: Message[],
): AgentRuntimeStatus | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.runtimeStatus) {
      return message.runtimeStatus;
    }
  }

  return null;
}

export const PLANNING_TOOL_NAMES = new Set([
  "taskcreate",
  "tasklist",
  "taskget",
  "taskupdate",
]);
export const TODO_SNAPSHOT_TOOL_NAMES = new Set([
  "taskcreate",
  "tasklist",
  "taskupdate",
]);

export const FILESYSTEM_TOOL_NAMES = new Set([
  "read",
  "readfile",
  "write",
  "writefile",
  "edit",
  "editfile",
  "multiedit",
  "glob",
  "grep",
  "ls",
  "list",
  "listdirectory",
  "createfile",
]);

export const WEB_TOOL_RE = /^(websearch|webfetch)|browser|playwright/i;
export const HARNESS_OUTPUT_SIGNAL_LIMIT = 8;
export const SKILL_TOOL_NAMES = new Set(["skill", "threestageworkflow"]);
const LIME_TOOL_METADATA_BEGIN = "[Lime 工具元数据开始]";
const LIME_TOOL_METADATA_END = "[Lime 工具元数据结束]";

export function normalizeToolName(value: string): string {
  const normalized = value
    .replace(/[\s_-]+/g, "")
    .trim()
    .toLowerCase();
  if (normalized === "task") {
    return "bash";
  }
  if (normalized === "killshell") {
    return "taskstop";
  }
  if (normalized === "todowrite" || normalized === "writetodos") {
    return "taskupdate";
  }
  return normalized;
}

export function parseJsonValue(raw?: string): unknown {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;

  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function resolveTimestamp(...values: unknown[]): number {
  for (const value of values) {
    const normalized = normalizeDate(value);
    if (normalized) {
      return normalized.getTime();
    }
  }
  return 0;
}

export function collectToolCalls(messages: Message[]): ToolCallEntry[] {
  return messages
    .flatMap((message) =>
      (message.toolCalls || []).map((toolCall) => ({
        toolCall,
        messageTimestamp: message.timestamp,
      })),
    )
    .sort((left, right) => {
      const leftTime = resolveTimestamp(
        left.toolCall.startTime,
        left.messageTimestamp,
      );
      const rightTime = resolveTimestamp(
        right.toolCall.startTime,
        right.messageTimestamp,
      );
      return leftTime - rightTime;
    });
}

export function summarizeToolOutput(
  toolCall: ToolCallState,
): string | undefined {
  const value =
    toolCall.result?.output?.trim() || toolCall.result?.error?.trim();
  if (!value) return undefined;
  return value.length > 160 ? `${value.slice(0, 160)}...` : value;
}

export function stripAuxiliaryOutput(raw?: string): string {
  if (!raw) return "";

  let normalized = raw;
  const beginIndex = normalized.lastIndexOf(LIME_TOOL_METADATA_BEGIN);
  const endIndex = normalized.lastIndexOf(LIME_TOOL_METADATA_END);

  if (beginIndex >= 0 && endIndex >= beginIndex) {
    normalized =
      normalized.slice(0, beginIndex) +
      normalized.slice(endIndex + LIME_TOOL_METADATA_END.length);
  }

  normalized = normalized.replace(
    /^\[Lime Offload\]\s*完整输出已转存到文件：.+$/gm,
    "",
  );

  return normalized.trim();
}

export function buildTextPreview(
  raw?: string,
  options?: {
    maxLines?: number;
    maxChars?: number;
  },
): string | undefined {
  const normalized = stripAuxiliaryOutput(raw);
  if (!normalized) {
    return undefined;
  }

  const maxLines = options?.maxLines ?? 8;
  const maxChars = options?.maxChars ?? 480;
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, all) => line.length > 0 || all.length === 1)
    .slice(0, maxLines);

  const preview = lines.join("\n").trim();
  if (!preview) {
    return undefined;
  }

  return preview.length > maxChars
    ? `${preview.slice(0, maxChars).trimEnd()}…`
    : preview;
}

export function maybeKeepTextContent(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }

  const normalized = stripAuxiliaryOutput(raw);
  if (!normalized || normalized.length > 64 * 1024) {
    return undefined;
  }

  return normalized;
}

export function extractMetadata(
  toolCall: ToolCallState,
): Record<string, unknown> | null {
  const direct = asRecord(toolCall.result?.metadata);
  if (direct) return direct;

  const output = toolCall.result?.output;
  if (!output) return null;
  const beginIndex = output.lastIndexOf(LIME_TOOL_METADATA_BEGIN);
  const endIndex = output.lastIndexOf(LIME_TOOL_METADATA_END);
  if (beginIndex < 0 || endIndex < beginIndex) {
    return null;
  }

  const raw = output
    .slice(beginIndex + LIME_TOOL_METADATA_BEGIN.length, endIndex)
    .trim();
  if (!raw) return null;

  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function extractRegexValue(
  pattern: RegExp,
  text?: string,
): string | undefined {
  if (!text) return undefined;
  const match = text.match(pattern);
  const value = match?.[1]?.trim();
  return value || undefined;
}

export function parseNumberFromText(
  pattern: RegExp,
  text?: string,
): number | undefined {
  const value = extractRegexValue(pattern, text);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseBooleanFromText(
  pattern: RegExp,
  text?: string,
): boolean | undefined {
  const value = extractRegexValue(pattern, text);
  if (!value) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || path;
}

export function extractContentFromRecord(
  record: Record<string, unknown> | null,
): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of [
    "content",
    "new_str",
    "newText",
    "text",
    "body",
    "value",
  ]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return undefined;
}

export function extractSearchQuery(
  record: Record<string, unknown> | null,
): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of [
    "q",
    "query",
    "question",
    "search",
    "keywords",
    "keyword",
    "url",
  ]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function resolveFileKind(
  path: string,
  preferred?: HarnessFileKind,
): HarnessFileKind {
  if (preferred) {
    return preferred;
  }

  const extension = fileNameFromPath(path).split(".").pop()?.toLowerCase();
  if (!extension) {
    return "other";
  }

  if (["log", "out", "err"].includes(extension)) {
    return "log";
  }

  if (
    [
      "rs",
      "ts",
      "tsx",
      "js",
      "jsx",
      "py",
      "go",
      "java",
      "c",
      "cpp",
      "h",
      "json",
      "yaml",
      "yml",
      "toml",
      "sql",
      "sh",
      "bash",
      "zsh",
      "html",
      "css",
      "scss",
      "xml",
    ].includes(extension)
  ) {
    return "code";
  }

  if (
    ["md", "markdown", "txt", "pdf", "doc", "docx", "csv", "rtf"].includes(
      extension,
    )
  ) {
    return "document";
  }

  return "other";
}
