import type { ConversationImportRuntimeEventDetail } from "@/lib/api/conversationImport";

export type ImportedRuntimeEventPayloadSummary =
  | { kind: "empty" }
  | { kind: "record"; fieldCount: number }
  | { kind: "array"; itemCount: number }
  | { kind: "scalar"; valueType: string; length?: number };

export interface ImportedRuntimeEventDisplay {
  id: string;
  eventType: string;
  eventTypeLabel: string;
  kind: ImportedRuntimeEventKind;
  title: ImportedRuntimeEventLocalizedText;
  description?: string;
  status?: ImportedRuntimeEventStatusDisplay;
  facts: ImportedRuntimeEventFact[];
  turnNumber: number;
  eventNumber: number;
  sourceEventNumber: number;
  payloadSummary: ImportedRuntimeEventPayloadSummary;
  payloadPreview: string;
  payloadPreviewTruncated: boolean;
}

export type ImportedRuntimeEventKind =
  | "mcp_tool"
  | "dynamic_tool"
  | "image_view"
  | "image_generation"
  | "context_compaction"
  | "review"
  | "subagent"
  | "collaboration"
  | "web_search"
  | "patch"
  | "command"
  | "approval"
  | "reasoning"
  | "message"
  | "plan"
  | "tool"
  | "event";

export interface ImportedRuntimeEventLocalizedText {
  key: string;
  defaultValue: string;
}

export interface ImportedRuntimeEventStatusDisplay {
  key: string;
  defaultValue: string;
  tone: "running" | "completed" | "failed" | "muted";
}

export interface ImportedRuntimeEventFact {
  id: string;
  label: ImportedRuntimeEventLocalizedText;
  value: string;
}

const DEFAULT_PAYLOAD_PREVIEW_LIMIT = 2_000;
const PAYLOAD_PREVIEW_KEYS = [
  "type",
  "role",
  "status",
  "statusLabel",
  "status_label",
  "name",
  "toolName",
  "tool_name",
  "server",
  "namespace",
  "command",
  "cwd",
  "arguments",
  "action",
  "query",
  "path",
  "prompt",
  "model",
  "summary",
  "text",
  "message",
  "detail",
  "outputPreview",
  "output",
  "result",
  "contentItems",
  "content_items",
  "revisedPrompt",
  "revised_prompt",
  "savedPath",
  "saved_path",
  "exitCode",
  "exit_code",
  "sourceEventType",
];
const PAYLOAD_PREVIEW_DENY_KEYS = new Set([
  "sourcePath",
  "source_path",
  "sourceThreadId",
  "source_thread_id",
  "threadId",
  "thread_id",
  "sessionId",
  "session_id",
  "sourceProvenance",
  "source_provenance",
  "senderThreadId",
  "sender_thread_id",
  "receiverThreadId",
  "receiver_thread_id",
  "receiverThreadIds",
  "receiver_thread_ids",
  "newThreadId",
  "new_thread_id",
]);
const TEXT_PREVIEW_LIMIT = 140;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEventTypeLabel(eventType: string): string {
  const normalized = eventType.trim().replace(/[_.-]+/g, " ");
  return normalized || "event";
}

function summarizePayload(payload: unknown): ImportedRuntimeEventPayloadSummary {
  if (payload === null || payload === undefined) {
    return { kind: "empty" };
  }
  if (Array.isArray(payload)) {
    return { kind: "array", itemCount: payload.length };
  }
  if (isRecord(payload)) {
    return { kind: "record", fieldCount: Object.keys(payload).length };
  }
  if (typeof payload === "string") {
    return { kind: "scalar", valueType: "string", length: payload.length };
  }
  return { kind: "scalar", valueType: typeof payload };
}

function safePayloadPreviewValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 499)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map(safePayloadPreviewValue);
  }
  if (isRecord(value)) {
    return sanitizePayloadRecord(value, false);
  }
  return value;
}

function sanitizePayloadRecord(
  record: Record<string, unknown>,
  useWhitelist = true,
): Record<string, unknown> {
  const preview: Record<string, unknown> = {};
  const keys = useWhitelist ? PAYLOAD_PREVIEW_KEYS : Object.keys(record);
  for (const key of keys) {
    if (PAYLOAD_PREVIEW_DENY_KEYS.has(key)) {
      continue;
    }
    const value = record[key];
    if (value !== undefined) {
      preview[key] = safePayloadPreviewValue(value);
    }
  }
  if (Object.keys(preview).length > 0) {
    return preview;
  }
  return {
    fields: Object.keys(record).length,
  };
}

export function formatImportedRuntimePayloadPreview(
  payload: unknown,
  maxLength = DEFAULT_PAYLOAD_PREVIEW_LIMIT,
): { text: string; truncated: boolean } {
  const safePayload = isRecord(payload)
    ? sanitizePayloadRecord(payload, true)
    : safePayloadPreviewValue(payload);
  const serialized =
    typeof safePayload === "string"
      ? safePayload
      : JSON.stringify(safePayload, null, 2) ?? String(safePayload);
  if (serialized.length <= maxLength) {
    return { text: serialized, truncated: false };
  }
  return {
    text: `${serialized.slice(0, Math.max(0, maxLength - 1))}…`,
    truncated: true,
  };
}

function localizedText(
  suffix: string,
  defaultValue: string,
): ImportedRuntimeEventLocalizedText {
  return {
    key: `generalWorkbench.taskRail.importedRuntime.${suffix}`,
    defaultValue,
  };
}

function statusText(
  suffix: string,
  defaultValue: string,
  tone: ImportedRuntimeEventStatusDisplay["tone"],
): ImportedRuntimeEventStatusDisplay {
  return {
    key: `generalWorkbench.taskRail.importedRuntime.status.${suffix}`,
    defaultValue,
    tone,
  };
}

function factLabel(
  suffix: string,
  defaultValue: string,
): ImportedRuntimeEventLocalizedText {
  return localizedText(`fact.${suffix}`, defaultValue);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength = TEXT_PREVIEW_LIMIT): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function recordString(
  record: Record<string, unknown> | null | undefined,
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

function nestedRecord(
  record: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  const value = record?.[key];
  return isRecord(value) ? value : null;
}

function recordValue(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): unknown {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }
  return undefined;
}

function stringifyValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(safePayloadPreviewValue(value));
  } catch {
    return String(value);
  }
}

function fact(
  id: string,
  suffix: string,
  defaultLabel: string,
  value: unknown,
  maxLength = 96,
): ImportedRuntimeEventFact | null {
  const text = stringifyValue(value);
  if (!text) {
    return null;
  }
  return {
    id,
    label: factLabel(suffix, defaultLabel),
    value: truncateText(text, maxLength),
  };
}

function compactFacts(
  facts: Array<ImportedRuntimeEventFact | null>,
): ImportedRuntimeEventFact[] {
  const seen = new Set<string>();
  const compacted: ImportedRuntimeEventFact[] = [];
  for (const item of facts) {
    if (!item || !item.value) {
      continue;
    }
    const signature = `${item.id}:${item.value}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    compacted.push(item);
  }
  return compacted;
}

function normalizeStatus(
  status: string | null,
  success: unknown,
): ImportedRuntimeEventStatusDisplay | undefined {
  if (success === false) {
    return statusText("failed", "失败", "failed");
  }
  const normalized = status?.trim().toLowerCase();
  switch (normalized) {
    case "in_progress":
    case "running":
    case "started":
    case "pending":
      return statusText("running", "进行中", "running");
    case "completed":
    case "success":
    case "succeeded":
    case "applied":
      return statusText("completed", "已完成", "completed");
    case "failed":
    case "error":
    case "errored":
      return statusText("failed", "失败", "failed");
    case "canceled":
    case "cancelled":
    case "aborted":
    case "interrupted":
      return statusText("canceled", "已中断", "muted");
    default:
      return success === true
        ? statusText("completed", "已完成", "completed")
        : undefined;
  }
}

function resolveKind(params: {
  eventType: string;
  sourceEventType: string | null;
  toolName: string | null;
}): ImportedRuntimeEventKind {
  const eventType = params.eventType;
  const sourceEventType = params.sourceEventType ?? "";
  const toolName = params.toolName ?? "";
  if (
    sourceEventType.startsWith("mcp_tool_call") ||
    toolName.startsWith("mcp__")
  ) {
    return "mcp_tool";
  }
  if (sourceEventType.startsWith("dynamic_tool_call")) {
    return "dynamic_tool";
  }
  if (
    sourceEventType === "view_image_tool_call" ||
    toolName === "view_image"
  ) {
    return "image_view";
  }
  if (
    sourceEventType.startsWith("image_generation") ||
    toolName === "image_generation"
  ) {
    return "image_generation";
  }
  if (eventType.startsWith("plan.")) {
    return "plan";
  }
  if (
    eventType.startsWith("context.compaction") ||
    sourceEventType === "context_compacted"
  ) {
    return "context_compaction";
  }
  if (
    sourceEventType === "entered_review_mode" ||
    sourceEventType === "exited_review_mode"
  ) {
    return "review";
  }
  if (
    eventType === "subagent.activity" ||
    sourceEventType.includes("sub_agent_activity")
  ) {
    return "subagent";
  }
  if (sourceEventType.startsWith("collab_")) {
    return "collaboration";
  }
  if (toolName === "web_search" || eventType === "web_search") {
    return "web_search";
  }
  if (eventType.startsWith("patch.")) {
    return "patch";
  }
  if (eventType.startsWith("command.")) {
    return "command";
  }
  if (eventType.startsWith("action.")) {
    return "approval";
  }
  if (eventType.startsWith("reasoning.")) {
    return "reasoning";
  }
  if (eventType.startsWith("message.")) {
    return "message";
  }
  if (eventType.startsWith("tool.")) {
    return "tool";
  }
  return "event";
}

const KIND_TITLES: Record<
  ImportedRuntimeEventKind,
  ImportedRuntimeEventLocalizedText
> = {
  mcp_tool: localizedText("kind.mcpTool", "MCP 工具"),
  dynamic_tool: localizedText("kind.dynamicTool", "动态工具"),
  image_view: localizedText("kind.imageView", "图片查看"),
  image_generation: localizedText("kind.imageGeneration", "图片生成"),
  context_compaction: localizedText("kind.contextCompaction", "上下文压缩"),
  review: localizedText("kind.review", "代码审查"),
  subagent: localizedText("kind.subagent", "子任务活动"),
  collaboration: localizedText("kind.collaboration", "协作任务"),
  web_search: localizedText("kind.webSearch", "联网搜索"),
  patch: localizedText("kind.patch", "补丁"),
  command: localizedText("kind.command", "命令"),
  approval: localizedText("kind.approval", "权限确认"),
  reasoning: localizedText("kind.reasoning", "思考记录"),
  message: localizedText("kind.message", "消息"),
  plan: localizedText("kind.plan", "计划"),
  tool: localizedText("kind.tool", "工具"),
  event: localizedText("kind.event", "运行事件"),
};

function firstDescription(
  record: Record<string, unknown> | null,
  candidates: unknown[],
): string | undefined {
  for (const candidate of candidates) {
    const text = stringifyValue(candidate);
    if (text) {
      return truncateText(text);
    }
  }
  return (
    recordString(record, ["detail", "summary", "message", "text"]) ??
    undefined
  );
}

function buildSemanticDisplay(eventType: string, payload: unknown) {
  const record = isRecord(payload) ? payload : null;
  const argumentsRecord =
    nestedRecord(record, "arguments") ?? nestedRecord(record, "args");
  const sourceEventType = recordString(record, ["sourceEventType"]);
  const toolName = recordString(record, [
    "toolName",
    "tool_name",
    "name",
    "tool",
  ]);
  const kind = resolveKind({ eventType, sourceEventType, toolName });
  const status = normalizeStatus(
    recordString(record, ["status", "statusLabel", "status_label"]),
    recordValue(record, ["success"]),
  );
  const command = recordString(record, [
    "command",
    "canonicalCommand",
    "commandSummary",
  ]);
  const path =
    recordString(record, ["path", "savedPath", "saved_path"]) ??
    recordString(argumentsRecord, ["path", "savedPath", "saved_path"]);
  const query =
    recordString(record, ["query"]) ?? recordString(argumentsRecord, ["query"]);
  const output = recordValue(record, ["outputPreview", "output", "result"]);
  const description = firstDescription(record, [
    command,
    query,
    path,
    recordString(argumentsRecord, ["prompt"]),
    recordString(record, ["prompt", "revisedPrompt", "revised_prompt"]),
    kind === "collaboration" ? null : output,
  ]);
  const facts = compactFacts([
    fact("tool", "tool", "工具", toolName),
    fact("server", "server", "服务", recordString(record, ["server"])),
    fact(
      "namespace",
      "namespace",
      "命名空间",
      recordString(record, ["namespace"]),
    ),
    fact("command", "command", "命令", command, 120),
    fact("query", "query", "查询", query, 120),
    fact("path", "path", "路径", path, 120),
    fact(
      "model",
      "model",
      "模型",
      recordString(record, ["model"]) ?? recordString(argumentsRecord, ["model"]),
    ),
    fact(
      "status",
      "status",
      "状态",
      recordString(record, ["status", "statusLabel", "status_label"]),
    ),
    fact("sourceEvent", "sourceEvent", "来源事件", sourceEventType),
    kind === "collaboration"
      ? null
      : fact("output", "output", "输出", output, 140),
    ...buildKindSpecificFacts({
      kind,
      record,
      argumentsRecord,
    }),
  ]);

  return {
    kind,
    title: KIND_TITLES[kind],
    description,
    status,
    facts,
  };
}

function buildKindSpecificFacts(params: {
  kind: ImportedRuntimeEventKind;
  record: Record<string, unknown> | null;
  argumentsRecord: Record<string, unknown> | null;
}): Array<ImportedRuntimeEventFact | null> {
  const { kind, record, argumentsRecord } = params;
  switch (kind) {
    case "command":
      return [
        fact("cwd", "cwd", "工作目录", recordString(record, ["cwd", "workdir"])),
        fact(
          "arguments",
          "arguments",
          "参数",
          recordValue(record, ["arguments"]) ??
            recordValue(argumentsRecord, ["arguments"]),
          120,
        ),
      ];
    case "mcp_tool":
      return [
        fact("server", "server", "服务", recordString(record, ["server"])),
        fact(
          "tool",
          "tool",
          "工具",
          recordString(record, ["toolName", "name", "tool"]),
        ),
      ];
    case "dynamic_tool":
      return [
        fact(
          "namespace",
          "namespace",
          "命名空间",
          recordString(record, ["namespace"]),
        ),
        fact(
          "tool",
          "tool",
          "工具",
          recordString(record, ["toolName", "name", "tool"]),
        ),
      ];
    case "image_view":
      return [fact("path", "path", "路径", recordString(record, ["path"]))];
    case "image_generation":
      return [
        fact(
          "prompt",
          "prompt",
          "提示",
          recordString(argumentsRecord, ["prompt"]) ??
            recordString(record, ["prompt"]),
          120,
        ),
        fact(
          "savedPath",
          "savedPath",
          "保存路径",
          recordString(record, ["savedPath", "saved_path"]),
          120,
        ),
        fact(
          "revisedPrompt",
          "revisedPrompt",
          "修订提示",
          recordString(record, ["revisedPrompt", "revised_prompt"]),
          120,
        ),
      ];
    case "context_compaction":
      return [
        fact("stage", "stage", "阶段", recordString(record, ["stage"])),
        fact("trigger", "trigger", "触发", recordString(record, ["trigger"])),
        fact(
          "detail",
          "detail",
          "说明",
          recordString(record, ["detail", "message", "summary"]),
          120,
        ),
      ];
    case "review":
      return [
        fact(
          "review",
          "review",
          "审查",
          recordString(record, ["text", "summary", "message", "review"]),
          120,
        ),
      ];
    case "subagent":
      return [
        fact("title", "title", "标题", recordString(record, ["title"])),
        fact("role", "role", "角色", recordString(record, ["role"])),
        fact("model", "model", "模型", recordString(record, ["model"])),
        fact(
          "summary",
          "summary",
          "摘要",
          recordString(record, ["summary", "message", "prompt"]),
          120,
        ),
      ];
    case "collaboration":
      return [
        fact(
          "reasoningEffort",
          "reasoningEffort",
          "思考强度",
          recordString(record, ["reasoningEffort", "reasoning_effort"]),
        ),
        fact(
          "statusLabel",
          "statusLabel",
          "状态标签",
          recordString(record, ["statusLabel", "status_label"]),
          96,
        ),
      ];
    case "web_search":
      return [
        fact("query", "query", "查询", recordString(record, ["query"])),
        fact("action", "action", "动作", recordString(record, ["action"])),
      ];
    case "patch":
      return [
        fact(
          "paths",
          "paths",
          "路径",
          stringifyValue(recordValue(record, ["paths", "changedFiles"])),
          120,
        ),
        fact("status", "status", "状态", recordString(record, ["status"])),
      ];
    case "approval":
      return [
        fact("tool", "tool", "工具", recordString(record, ["toolName", "tool_name", "name"])),
        fact("prompt", "prompt", "提示", recordString(record, ["prompt"]), 120),
        fact("command", "command", "命令", recordValue(record, ["arguments"]), 120),
      ];
    case "reasoning":
      return [
        fact(
          "summary",
          "summary",
          "摘要",
          recordString(record, ["summary", "text", "message"]),
          120,
        ),
      ];
    case "message":
      return [
        fact("phase", "phase", "阶段", recordString(record, ["phase"])),
        fact("text", "text", "正文", recordString(record, ["text"]), 120),
      ];
    case "plan":
      return [
        fact(
          "plan",
          "plan",
          "步骤",
          Array.isArray(recordValue(record, ["plan"]))
            ? `${(recordValue(record, ["plan"]) as unknown[]).length} 项`
            : null,
        ),
        fact(
          "explanation",
          "explanation",
          "说明",
          recordString(record, ["explanation"]),
          120,
        ),
      ];
    case "tool":
      return [
        fact(
          "tool",
          "tool",
          "工具",
          recordString(record, ["toolName", "tool_name", "name", "tool"]),
        ),
      ];
    case "event":
    default:
      return [];
  }
}

export function buildImportedRuntimeEventDisplay(
  event: ConversationImportRuntimeEventDetail,
  options: { payloadPreviewLimit?: number } = {},
): ImportedRuntimeEventDisplay {
  const payloadPreview = formatImportedRuntimePayloadPreview(
    event.payload,
    options.payloadPreviewLimit,
  );
  const semantic = buildSemanticDisplay(event.eventType, event.payload);

  return {
    id: [
      event.sourceEventIndex,
      event.turnIndex,
      event.eventIndex,
      event.eventType,
    ].join(":"),
    eventType: event.eventType,
    eventTypeLabel: normalizeEventTypeLabel(event.eventType),
    kind: semantic.kind,
    title: semantic.title,
    description: semantic.description,
    status: semantic.status,
    facts: semantic.facts,
    turnNumber: event.turnIndex + 1,
    eventNumber: event.eventIndex + 1,
    sourceEventNumber: event.sourceEventIndex + 1,
    payloadSummary: summarizePayload(event.payload),
    payloadPreview: payloadPreview.text,
    payloadPreviewTruncated: payloadPreview.truncated,
  };
}
