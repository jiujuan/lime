/**
 * @file 文件改动摘要（前端）
 * @description 解析工具结果里的 `file_change` metadata，聚合成消息级的文件改动汇总，
 *   供 StreamingRenderer 渲染「N 个文件已更改 (+X −Y) · 在此审查」卡。
 *
 * 数据来源优先级：
 * 1. 后端工具结果 metadata.file_change（write/edit/batch_edit，跨模型一致）；
 * 2. 回退：工具参数（content / old_str / new_str / edits[]）本地近似计算；
 * 3. 再回退：metadata.old_length/new_length 仅给粗略增删。
 *
 * 与后端 `tools/file/diff_summary.rs` 的结构保持一致。
 */

import type {
  AgentThreadPatchApplyStatus,
  AgentThreadPatchChange,
  AgentToolCallState,
} from "@/lib/api/agentProtocol";
import { buildCanvasWorkbenchDiff } from "./canvasWorkbenchDiff";

export type FileChangeKind = "add" | "update" | "delete";
export type FileChangeDiffLineKind = "context" | "add" | "remove";

export interface FileChangeDiffLine {
  kind: FileChangeDiffLineKind;
  value: string;
  oldLine?: number;
  newLine?: number;
}

export interface FileChangeSummary {
  path: string;
  movePath?: string;
  fileStatus?: AgentThreadPatchApplyStatus;
  kind: FileChangeKind;
  linesAdded: number;
  linesRemoved: number;
  diff: FileChangeDiffLine[];
  truncated: boolean;
  /** 来源：backend = 后端 file_change；approx = 前端近似 */
  source: "backend" | "approx";
  /** 工具调用状态，用于"写入中/失败"呈现 */
  status: AgentToolCallState["status"];
}

export interface FileChangesAggregate {
  files: FileChangeSummary[];
  totalAdded: number;
  totalRemoved: number;
  fileCount: number;
}

function normalizeToolNameForFileMutation(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/**
 * 判断工具是否为文件改动类（write/create/save/edit/patch/update/replace 等）。
 * 与后端工具命名约定对齐；从 agentStreamEventProcessor 抽出共享，避免重复定义。
 */
export function isFileMutationToolName(toolName: string): boolean {
  const normalized = normalizeToolNameForFileMutation(toolName);
  return [
    "write",
    "create",
    "save",
    "output",
    "edit",
    "patch",
    "update",
    "replace",
  ].some((keyword) => normalized.includes(keyword));
}

function parseToolArguments(
  raw: string | undefined,
): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function coerceString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function coerceNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function diffLinesFromCanvas(
  previous: string,
  current: string,
): FileChangeDiffLine[] {
  return buildCanvasWorkbenchDiff(previous, current).map((line) => ({
    kind: line.type,
    value: line.value,
  }));
}

function countDiff(diff: FileChangeDiffLine[]): {
  added: number;
  removed: number;
} {
  let added = 0;
  let removed = 0;
  for (const line of diff) {
    if (line.kind === "add") added += 1;
    else if (line.kind === "remove") removed += 1;
  }
  return { added, removed };
}

const MAX_DIFF_LINES = 400;

function canonicalDiffLines(diff: string): FileChangeDiffLine[] {
  return diff
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("@@"))
    .map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        return { kind: "add" as const, value: line.slice(1) };
      }
      if (line.startsWith("-") && !line.startsWith("---")) {
        return { kind: "remove" as const, value: line.slice(1) };
      }
      return {
        kind: "context" as const,
        value: line.startsWith(" ") ? line.slice(1) : line,
      };
    });
}

export function aggregateCanonicalPatchChanges(
  changes: AgentThreadPatchChange[],
  status: AgentToolCallState["status"],
  fileStatus?: AgentThreadPatchApplyStatus,
): FileChangesAggregate {
  return aggregateFileChangeSummaries(
    changes.flatMap((change) => {
      const path = change.path.trim();
      const kind = change.kind?.type;
      if (!path || (kind !== "add" && kind !== "delete" && kind !== "update")) {
        return [];
      }
      const fullDiff = canonicalDiffLines(change.diff);
      const { added, removed } = countDiff(fullDiff);
      const movePath =
        kind === "update" && typeof change.kind.move_path === "string"
          ? change.kind.move_path.trim()
          : "";
      return [
        {
          path,
          ...(movePath ? { movePath } : {}),
          ...(fileStatus ? { fileStatus } : {}),
          kind,
          linesAdded: added,
          linesRemoved: removed,
          diff: fullDiff.slice(0, MAX_DIFF_LINES),
          truncated: fullDiff.length > MAX_DIFF_LINES,
          source: "backend" as const,
          status,
        },
      ];
    }),
  );
}

function normalizeBackendDiffLine(value: unknown): FileChangeDiffLine | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  const text = coerceString(record.value) ?? "";
  if (kind === "context" || kind === "add" || kind === "remove") {
    const oldLine = coerceNumber(record.old_line ?? record.oldLine);
    const newLine = coerceNumber(record.new_line ?? record.newLine);
    return {
      kind,
      value: text,
      ...(oldLine !== undefined ? { oldLine } : {}),
      ...(newLine !== undefined ? { newLine } : {}),
    };
  }
  return null;
}

/** 从后端 metadata.file_change 解析摘要；结构不符返回 null。 */
function parseBackendFileChange(
  metadata: Record<string, unknown> | undefined,
  status: AgentToolCallState["status"],
): FileChangeSummary | null {
  const raw = metadata?.file_change;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const path = coerceString(record.path);
  const kind = record.kind;
  if (!path || (kind !== "add" && kind !== "update" && kind !== "delete")) {
    return null;
  }
  const diff = Array.isArray(record.diff)
    ? record.diff
        .map(normalizeBackendDiffLine)
        .filter((line): line is FileChangeDiffLine => line !== null)
    : [];
  return {
    path,
    kind,
    linesAdded: coerceNumber(record.lines_added) ?? 0,
    linesRemoved: coerceNumber(record.lines_removed) ?? 0,
    diff,
    truncated: record.truncated === true,
    source: "backend",
    status,
  };
}

function resolveArgPath(
  args: Record<string, unknown> | null,
): string | undefined {
  if (!args) return undefined;
  for (const key of ["path", "file_path", "filePath", "filename", "file"]) {
    const value = coerceString(args[key]);
    if (value) return value;
  }
  return undefined;
}

/** 后端未提供 file_change 时，从工具参数本地近似计算。 */
function approximateFromArguments(
  toolCall: AgentToolCallState,
): FileChangeSummary | null {
  const args = parseToolArguments(toolCall.arguments);
  const path = resolveArgPath(args);
  if (!path) {
    return null;
  }

  // Write 类：content 全量当新增
  const content = coerceString(args?.content ?? args?.text ?? args?.contents);
  if (content !== undefined) {
    const diff = diffLinesFromCanvas("", content).slice(0, MAX_DIFF_LINES);
    const { added, removed } = countDiff(diffLinesFromCanvas("", content));
    return {
      path,
      kind: "add",
      linesAdded: added,
      linesRemoved: removed,
      diff,
      truncated: diff.length >= MAX_DIFF_LINES,
      source: "approx",
      status: toolCall.status,
    };
  }

  // Edit 单条：old_str -> new_str
  const oldStr = coerceString(args?.old_str ?? args?.old_string);
  const newStr = coerceString(args?.new_str ?? args?.new_string);
  if (oldStr !== undefined && newStr !== undefined) {
    const full = diffLinesFromCanvas(oldStr, newStr);
    const { added, removed } = countDiff(full);
    return {
      path,
      kind: "update",
      linesAdded: added,
      linesRemoved: removed,
      diff: full.slice(0, MAX_DIFF_LINES),
      truncated: full.length > MAX_DIFF_LINES,
      source: "approx",
      status: toolCall.status,
    };
  }

  // Edit 批量：edits[] 逐条累加
  const edits = Array.isArray(args?.edits) ? args?.edits : undefined;
  if (edits && edits.length > 0) {
    const diff: FileChangeDiffLine[] = [];
    let added = 0;
    let removed = 0;
    for (const edit of edits) {
      if (!edit || typeof edit !== "object") continue;
      const record = edit as Record<string, unknown>;
      const o = coerceString(record.old_str ?? record.old_string) ?? "";
      const n = coerceString(record.new_str ?? record.new_string) ?? "";
      const part = diffLinesFromCanvas(o, n);
      const counts = countDiff(part);
      added += counts.added;
      removed += counts.removed;
      diff.push(...part);
    }
    return {
      path,
      kind: "update",
      linesAdded: added,
      linesRemoved: removed,
      diff: diff.slice(0, MAX_DIFF_LINES),
      truncated: diff.length > MAX_DIFF_LINES,
      source: "approx",
      status: toolCall.status,
    };
  }

  // 仅有 old_length/new_length：粗略增删，无逐行 diff
  return null;
}

/** 解析单个文件工具调用为 FileChangeSummary。无法解析返回 null。 */
export function parseFileChangeFromToolCall(
  toolCall: AgentToolCallState,
): FileChangeSummary | null {
  const backend = parseBackendFileChange(
    toolCall.result?.metadata,
    toolCall.status,
  );
  if (backend) {
    return backend;
  }
  return approximateFromArguments(toolCall);
}

function mergeSummary(
  previous: FileChangeSummary,
  next: FileChangeSummary,
): FileChangeSummary {
  // 同一 path 多次写入：后端摘要优先，否则取较新的一次（累计行数）。
  if (next.source === "backend" && previous.source !== "backend") {
    return next;
  }
  if (previous.source === "backend" && next.source !== "backend") {
    return { ...previous, status: next.status };
  }
  return {
    ...next,
    linesAdded: previous.linesAdded + next.linesAdded,
    linesRemoved: previous.linesRemoved + next.linesRemoved,
    kind: previous.kind === "add" ? "add" : next.kind,
  };
}

/**
 * 把一组文件改动工具调用聚合成消息级汇总（按 path 合并、保序）。
 */
export function aggregateFileChanges(
  toolCalls: AgentToolCallState[],
): FileChangesAggregate {
  return aggregateFileChangeSummaries(
    toolCalls.flatMap((toolCall) => {
      if (!isFileMutationToolName(toolCall.name)) {
        return [];
      }
      const summary = parseFileChangeFromToolCall(toolCall);
      return summary ? [summary] : [];
    }),
  );
}

export function aggregateFileChangeSummaries(
  summaries: FileChangeSummary[],
): FileChangesAggregate {
  const order: string[] = [];
  const byPath = new Map<string, FileChangeSummary>();

  for (const summary of summaries) {
    const existing = byPath.get(summary.path);
    if (existing) {
      byPath.set(summary.path, mergeSummary(existing, summary));
    } else {
      order.push(summary.path);
      byPath.set(summary.path, summary);
    }
  }

  const files = order
    .map((path) => byPath.get(path))
    .filter((file): file is FileChangeSummary => file !== undefined);
  const totalAdded = files.reduce((sum, file) => sum + file.linesAdded, 0);
  const totalRemoved = files.reduce((sum, file) => sum + file.linesRemoved, 0);

  return {
    files,
    totalAdded,
    totalRemoved,
    fileCount: files.length,
  };
}
