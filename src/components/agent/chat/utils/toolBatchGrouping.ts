import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { AgentThreadItem } from "../types";
import {
  classifyMcpToolOperationKind,
  isBrowserToolName,
  normalizeToolNameKey,
  parseToolCallArguments,
  resolveToolFilePath,
  type ToolCallArgumentValue,
} from "./toolDisplayInfo";
import {
  formatSearchSourceLabelFromUrl,
  resolveSearchResultPreviewItemsFromText,
} from "./searchResultPreview";
import {
  isUnifiedWebFetchToolName,
  isUnifiedWebSearchToolName,
} from "./toolNameFamily";

export type ToolBatchKind = "exploration" | "browser" | "web_search";

export interface ToolBatchSummaryDescriptor {
  kind: ToolBatchKind;
  title: string;
  supportingLines: string[];
  supportingSections?: ToolBatchSummarySection[];
  countLabel: string;
  rawDetailLabel: string;
  hasRunning?: boolean;
}

export type ToolBatchSummarySectionKind =
  | "web_search_sources"
  | "web_fetch_pages";

export interface ToolBatchSummarySection {
  kind: ToolBatchSummarySectionKind;
  lines: string[];
}

type ToolOperationKind =
  | "read"
  | "search"
  | "web_search"
  | "web_fetch"
  | "list"
  | "browser"
  | "mutation"
  | "absorbed"
  | "other";

type ToolLikeStatus =
  | ToolCallState["status"]
  | AgentThreadItem["status"]
  | null
  | undefined;

interface ToolBatchAccumulator {
  readCount: number;
  searchCount: number;
  webSearchCount: number;
  webFetchCount: number;
  listCount: number;
  browserCount: number;
  mutationCount: number;
  webSearchFailedCount: number;
  significantCount: number;
  absorbedCount: number;
  otherCount: number;
  hasRunning: boolean;
  latestHint: string | null;
  latestWebSearchHint: string | null;
  webSearchHints: string[];
  webFetchHints: string[];
  searchHints: string[];
  browserHints: string[];
}

interface ToolLikeDescriptor {
  toolName: string;
  argumentsValue?: string | Record<string, ToolCallArgumentValue>;
  command?: string | null;
  query?: string | null;
  output?: string | null;
  status?: ToolLikeStatus;
}

type ThreadProcessBatchItem = Extract<
  AgentThreadItem,
  { type: "tool_call" | "command_execution" | "web_search" }
>;

function shorten(
  value: string | null | undefined,
  maxLength = 72,
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

function formatShortSourceHint(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  if (/^https?:\/\//i.test(normalized)) {
    return shorten(formatSearchSourceLabelFromUrl(normalized), 56);
  }
  return shorten(normalized, 56);
}

function asRecord(value: unknown): Record<string, ToolCallArgumentValue> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    const parsed = parseToolCallArguments(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, ToolCallArgumentValue>;
  }

  return {};
}

function isThreadProcessBatchItem(
  item: AgentThreadItem,
): item is ThreadProcessBatchItem {
  return (
    item.type === "tool_call" ||
    item.type === "command_execution" ||
    item.type === "web_search"
  );
}

function readString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readFirstString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const first = value.find(
        (item) => typeof item === "string" && item.trim(),
      );
      if (typeof first === "string") {
        return first.trim();
      }
    }
  }
  return null;
}

function nestedRecord(
  record: Record<string, ToolCallArgumentValue>,
  key: string,
): Record<string, ToolCallArgumentValue> | null {
  const value = record[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, ToolCallArgumentValue>;
}

function resolveWebSearchActionDetail(
  args: Record<string, ToolCallArgumentValue>,
): string | null {
  const action = nestedRecord(args, "action");
  const actionQuery = action
    ? readFirstString(action, ["query", "url", "pattern", "queries"])
    : null;
  const directQuery = readFirstString(args, [
    "query",
    "q",
    "pattern",
    "search",
    "url",
    "href",
    "queries",
  ]);
  return actionQuery || directQuery;
}

function isRunningToolLikeStatus(status?: ToolLikeStatus): boolean {
  return status === "running" || status === "in_progress";
}

function pushUniqueHint(target: string[], hint: string | null): void {
  if (!hint || target.includes(hint)) {
    return;
  }
  target.push(hint);
}

function resolveResultHints(output: string | null | undefined): string[] {
  return resolveSearchResultPreviewItemsFromText(output)
    .slice(0, 3)
    .map((item) => item.title || item.hostname || item.url)
    .filter((hint): hint is string => Boolean(hint?.trim()));
}

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

function resolveBashLikeKind(command: string): ToolOperationKind {
  const normalized = command.trim().toLowerCase();
  if (!normalized) {
    return "other";
  }

  if (
    /\b(rg|grep|findstr|ag|ack)\b/.test(normalized) ||
    /\bselect-string\b/.test(normalized)
  ) {
    return "search";
  }

  if (/\b(ls|tree|dir|fd|find)\b/.test(normalized)) {
    return "list";
  }

  if (/\b(cat|head|tail|sed|awk|more|less|wc)\b/.test(normalized)) {
    return "read";
  }

  return "other";
}

function resolveToolOperationKind(
  descriptor: ToolLikeDescriptor,
): ToolOperationKind {
  const normalizedName = normalizeToolNameKey(descriptor.toolName);
  const args = asRecord(descriptor.argumentsValue);
  const mcpOperationKind = classifyMcpToolOperationKind(descriptor.toolName);

  if (
    normalizedName === "toolsearch" ||
    normalizedName === "repl" ||
    normalizedName === "listskills" ||
    normalizedName === "loadskill"
  ) {
    return "absorbed";
  }

  if (normalizedName === "resolvelibraryid") {
    return "search";
  }

  if (normalizedName === "querydocs") {
    return "read";
  }

  if (isUnifiedWebSearchToolName(descriptor.toolName)) {
    return "web_search";
  }

  if (isUnifiedWebFetchToolName(descriptor.toolName)) {
    return "web_fetch";
  }

  if (mcpOperationKind) {
    return mcpOperationKind;
  }

  if (isBrowserToolName(normalizedName)) {
    return "browser";
  }

  if (
    normalizedName.includes("search") ||
    normalizedName.includes("grep") ||
    normalizedName.includes("query") ||
    normalizedName.includes("find") ||
    normalizedName.includes("fetch") ||
    normalizedName === "web"
  ) {
    return "search";
  }

  if (
    normalizedName.includes("glob") ||
    normalizedName.includes("list") ||
    normalizedName.includes("dir")
  ) {
    return "list";
  }

  if (
    normalizedName.includes("read") ||
    normalizedName.includes("view") ||
    normalizedName.includes("cat") ||
    normalizedName.includes("open")
  ) {
    return "read";
  }

  if (
    normalizedName.includes("bash") ||
    normalizedName.includes("shell") ||
    normalizedName.includes("exec") ||
    normalizedName.includes("command")
  ) {
    const command =
      descriptor.command ||
      readString(args, ["command", "cmd", "script"]) ||
      "";
    return resolveBashLikeKind(command);
  }

  return "other";
}

function resolveLatestHint(
  descriptor: ToolLikeDescriptor,
  operationKind: ToolOperationKind,
): string | null {
  const args = asRecord(descriptor.argumentsValue);
  if (operationKind === "search" || operationKind === "web_search") {
    const webSearchDetail =
      operationKind === "web_search"
        ? resolveWebSearchActionDetail(args)
        : null;
    return shorten(
      descriptor.query ||
        webSearchDetail ||
        readString(args, [
          "query",
          "q",
          "pattern",
          "search",
          "url",
          "href",
          "libraryName",
          "library_name",
          "name",
        ]),
      56,
    );
  }

  if (operationKind === "web_fetch") {
    return formatShortSourceHint(
      descriptor.query ||
        readString(args, ["query", "q", "pattern", "search", "url", "href"]),
    );
  }

  if (operationKind === "read" || operationKind === "list") {
    const filePath = resolveToolFilePath(args);
    if (filePath) {
      return shorten(fileNameFromPath(filePath), 48);
    }
    return shorten(
      readString(args, [
        "path",
        "file_path",
        "directory",
        "query",
        "q",
        "libraryId",
        "library_id",
        "libraryName",
        "library_name",
      ]),
      48,
    );
  }

  if (operationKind === "browser") {
    return shorten(
      readString(args, [
        "url",
        "pageUrl",
        "page_url",
        "selector",
        "target",
        "label",
      ]),
      56,
    );
  }

  const command =
    descriptor.command || readString(args, ["command", "cmd", "script"]);
  return shorten(command, 56);
}

function accumulateBatch(entries: ToolLikeDescriptor[]): ToolBatchAccumulator {
  const accumulator: ToolBatchAccumulator = {
    readCount: 0,
    searchCount: 0,
    webSearchCount: 0,
    webFetchCount: 0,
    listCount: 0,
    browserCount: 0,
    mutationCount: 0,
    webSearchFailedCount: 0,
    significantCount: 0,
    absorbedCount: 0,
    otherCount: 0,
    hasRunning: false,
    latestHint: null,
    latestWebSearchHint: null,
    webSearchHints: [],
    webFetchHints: [],
    searchHints: [],
    browserHints: [],
  };

  for (const entry of entries) {
    if (isRunningToolLikeStatus(entry.status)) {
      accumulator.hasRunning = true;
    }
    const operationKind = resolveToolOperationKind(entry);
    switch (operationKind) {
      case "read":
        accumulator.readCount += 1;
        accumulator.significantCount += 1;
        break;
      case "search":
        accumulator.searchCount += 1;
        accumulator.significantCount += 1;
        break;
      case "web_search":
        accumulator.webSearchCount += 1;
        accumulator.significantCount += 1;
        if (entry.status === "failed") {
          accumulator.webSearchFailedCount += 1;
        }
        break;
      case "web_fetch":
        accumulator.webFetchCount += 1;
        accumulator.searchCount += 1;
        accumulator.significantCount += 1;
        break;
      case "list":
        accumulator.listCount += 1;
        accumulator.significantCount += 1;
        break;
      case "browser":
        accumulator.browserCount += 1;
        accumulator.significantCount += 1;
        break;
      case "mutation":
        accumulator.mutationCount += 1;
        accumulator.significantCount += 1;
        accumulator.otherCount += 1;
        break;
      case "absorbed":
        accumulator.absorbedCount += 1;
        break;
      default:
        accumulator.otherCount += 1;
        break;
    }

    const hint = resolveLatestHint(entry, operationKind);
    if (hint) {
      accumulator.latestHint = hint;
      if (operationKind === "web_search") {
        accumulator.latestWebSearchHint = hint;
        pushUniqueHint(accumulator.webSearchHints, hint);
      }
      if (operationKind === "web_fetch") {
        pushUniqueHint(accumulator.webFetchHints, hint);
      }
      if (operationKind === "search") {
        pushUniqueHint(accumulator.searchHints, hint);
      }
      if (operationKind === "browser") {
        pushUniqueHint(accumulator.browserHints, hint);
      }
    }

    if (operationKind === "web_search") {
      for (const resultHint of resolveResultHints(entry.output)) {
        pushUniqueHint(accumulator.webSearchHints, resultHint);
      }
    }
  }

  return accumulator;
}

function buildWebSearchDescriptor(
  accumulator: ToolBatchAccumulator,
  entries: ToolLikeDescriptor[],
): ToolBatchSummaryDescriptor | null {
  const {
    readCount,
    searchCount,
    webSearchCount,
    listCount,
    browserCount,
    mutationCount,
    significantCount,
    otherCount,
  } = accumulator;
  const hasOnlyWebSearchCompanions =
    searchCount === accumulator.webFetchCount &&
    readCount === 0 &&
    listCount === 0 &&
    browserCount === 0 &&
    mutationCount === 0 &&
    otherCount === 0 &&
    significantCount === webSearchCount + accumulator.webFetchCount;
  if (webSearchCount < 1 || !hasOnlyWebSearchCompanions) {
    return null;
  }

  const webFetchCount = accumulator.webFetchCount;
  const hasRunningWebRetrieval = entries.some((entry) => {
    const operationKind = resolveToolOperationKind(entry);
    return (
      (operationKind === "web_search" || operationKind === "web_fetch") &&
      isRunningToolLikeStatus(entry.status)
    );
  });

  const supportingLines =
    accumulator.webSearchHints.length > 0 ||
    accumulator.webFetchHints.length > 0
      ? [...accumulator.webSearchHints, ...accumulator.webFetchHints].slice(
          0,
          7,
        )
      : [
          webFetchCount > 0
            ? `搜索网页 ${webSearchCount} 次，读取网页 ${webFetchCount} 次`
            : `搜索网页 ${webSearchCount} 次`,
        ];
  const supportingSections: ToolBatchSummarySection[] = [];
  if (accumulator.webSearchHints.length > 0) {
    supportingSections.push({
      kind: "web_search_sources",
      lines: accumulator.webSearchHints.slice(0, 5),
    });
  }
  if (accumulator.webFetchHints.length > 0) {
    supportingSections.push({
      kind: "web_fetch_pages",
      lines: accumulator.webFetchHints.slice(0, 5),
    });
  }
  if (
    accumulator.latestWebSearchHint &&
    !supportingLines.some((line) =>
      line.includes(accumulator.latestWebSearchHint || ""),
    )
  ) {
    supportingLines.push(`最新线索：${accumulator.latestWebSearchHint}`);
  }

  const statusPrefix = hasRunningWebRetrieval ? "正在搜索网页" : "已搜索网页";
  const title =
    webSearchCount === 1 &&
    webFetchCount === 0 &&
    accumulator.latestWebSearchHint
      ? hasRunningWebRetrieval
        ? `${statusPrefix} ${accumulator.latestWebSearchHint}`
        : `${statusPrefix}：${accumulator.latestWebSearchHint}`
      : webFetchCount > 0
        ? `${statusPrefix} ${webSearchCount} 次，读取网页 ${webFetchCount} 次`
        : `${statusPrefix} ${webSearchCount} 次`;

  return {
    kind: "web_search",
    title,
    supportingLines,
    supportingSections:
      supportingSections.length > 1 ? supportingSections : undefined,
    countLabel:
      webFetchCount > 0
        ? `搜 ${webSearchCount} / 读 ${webFetchCount}`
        : `${webSearchCount} 次`,
    rawDetailLabel: hasRunningWebRetrieval
      ? webFetchCount > 0
        ? "展开查看搜索与读取进度"
        : "展开查看搜索进度"
      : webFetchCount > 0
        ? "展开查看搜索与读取来源"
        : "展开查看搜索来源",
    hasRunning: hasRunningWebRetrieval,
  };
}

function buildExplorationDescriptor(
  accumulator: ToolBatchAccumulator,
): ToolBatchSummaryDescriptor | null {
  const {
    readCount,
    searchCount,
    webSearchCount,
    listCount,
    significantCount,
    otherCount,
  } = accumulator;
  if (
    significantCount < 2 ||
    otherCount > 0 ||
    accumulator.browserCount > 0 ||
    accumulator.mutationCount > 0 ||
    webSearchCount > 0
  ) {
    return null;
  }

  const title =
    readCount > 0 && searchCount > 0
      ? "已探索项目"
      : readCount > 0
        ? "已查看关键文件"
        : searchCount > 0
          ? "已搜索关键线索"
          : "已查看目录结构";

  const detailParts: string[] = [];
  if (readCount > 0) {
    detailParts.push(`查看了 ${readCount} 个文件`);
  }
  if (searchCount > 0) {
    detailParts.push(`搜索 ${searchCount} 次`);
  }
  if (listCount > 0) {
    detailParts.push(`列了 ${listCount} 个目录`);
  }

  const countParts: string[] = [];
  if (readCount > 0) {
    countParts.push(`读 ${readCount}`);
  }
  if (searchCount > 0) {
    countParts.push(`搜 ${searchCount}`);
  }
  if (listCount > 0) {
    countParts.push(`列 ${listCount}`);
  }

  const supportingLines =
    detailParts.length > 0 ? [detailParts.join("，")] : [];
  if (accumulator.latestHint) {
    supportingLines.push(`最新线索：${accumulator.latestHint}`);
  }

  return {
    kind: "exploration",
    title,
    supportingLines,
    countLabel: countParts.join(" / ") || `${significantCount} 步`,
    rawDetailLabel: "展开查看探索明细",
    hasRunning: accumulator.hasRunning,
  };
}

function buildBrowserDescriptor(
  accumulator: ToolBatchAccumulator,
): ToolBatchSummaryDescriptor | null {
  if (
    accumulator.browserCount < 2 ||
    accumulator.otherCount > 0 ||
    accumulator.readCount > 0 ||
    accumulator.searchCount > 0 ||
    accumulator.webSearchCount > 0 ||
    accumulator.listCount > 0 ||
    accumulator.mutationCount > 0
  ) {
    return null;
  }

  const supportingLines =
    accumulator.browserHints.length > 0
      ? accumulator.browserHints.slice(0, 4)
      : [`检查了 ${accumulator.browserCount} 个页面步骤`];
  if (
    accumulator.latestHint &&
    !supportingLines.some((line) => line.includes(accumulator.latestHint || ""))
  ) {
    supportingLines.push(`最近目标：${accumulator.latestHint}`);
  }

  return {
    kind: "browser",
    title: "已检查页面",
    supportingLines,
    countLabel: `${accumulator.browserCount} 步`,
    rawDetailLabel: "展开查看页面操作明细",
    hasRunning: accumulator.hasRunning,
  };
}

function buildDescriptorFromEntries(
  entries: ToolLikeDescriptor[],
): ToolBatchSummaryDescriptor | null {
  if (entries.length < 1) {
    return null;
  }

  const accumulator = accumulateBatch(entries);
  const webSearchDescriptor = buildWebSearchDescriptor(accumulator, entries);
  if (webSearchDescriptor || entries.length < 2) {
    return webSearchDescriptor;
  }

  return (
    buildExplorationDescriptor(accumulator) ||
    buildBrowserDescriptor(accumulator)
  );
}

export function summarizeStreamingToolBatch(
  toolCalls: ToolCallState[],
): ToolBatchSummaryDescriptor | null {
  return buildDescriptorFromEntries(
    toolCalls.map((toolCall) => ({
      toolName: toolCall.name,
      argumentsValue: toolCall.arguments,
      output: toolCall.result?.output || toolCall.result?.error || null,
      status: toolCall.status,
    })),
  );
}

export function summarizeThreadProcessBatch(
  items: AgentThreadItem[],
): ToolBatchSummaryDescriptor | null {
  const processItems = items.filter(isThreadProcessBatchItem);
  if (processItems.length < 1 || processItems.length !== items.length) {
    return null;
  }

  const descriptors: ToolLikeDescriptor[] = processItems.map((item) => {
    if (item.type === "command_execution") {
      const argumentsValue: Record<string, ToolCallArgumentValue> = {
        command: item.command,
        cwd: item.cwd,
      };
      return {
        toolName: "exec_command",
        command: item.command,
        argumentsValue,
      };
    }

    if (item.type === "web_search") {
      const argumentsValue: Record<string, ToolCallArgumentValue> = {
        action: item.action || "",
        query: item.query || item.action || "",
      };
      return {
        toolName: "web_search",
        query: item.query || item.action || null,
        output: item.output || null,
        argumentsValue,
        status: item.status,
      };
    }

    return {
      toolName: item.tool_name,
      argumentsValue:
        item.arguments && typeof item.arguments === "object"
          ? (item.arguments as Record<string, ToolCallArgumentValue>)
          : item.arguments === undefined
            ? undefined
            : String(item.arguments),
      output:
        typeof item.output === "string"
          ? item.output
          : typeof item.error === "string"
            ? item.error
            : null,
      status: item.status,
    };
  });

  return buildDescriptorFromEntries(descriptors);
}
