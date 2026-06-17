import type {
  AgentRuntimeEventProjection,
  AgentRuntimeExecutionEvent,
  AgentUiMcpOperationKind,
  AgentUiMcpServerView,
  AgentUiMcpSurfaceModel,
  AgentUiMcpToolCallView,
  AgentUiToolCallEventView,
  AgentUiToolCallView,
  AgentUiToolFamily,
  AgentUiToolSurfaceModel,
} from "@limecloud/agent-ui-contracts";

import {
  compactProjectionFields,
  definedString,
  readNumberField,
  readRecord,
  readStringArrayField,
  readStringField,
  truncateText,
} from "./normalization.js";

const EMPTY_MCP_SURFACE: AgentUiMcpSurfaceModel = {
  hasMcp: false,
  servers: [],
  tools: [],
  activeToolIds: [],
  failedToolIds: [],
  completedToolIds: [],
};

const EMPTY_TOOL_SURFACE: AgentUiToolSurfaceModel = {
  calls: [],
  activeCallIds: [],
  failedCallIds: [],
  completedCallIds: [],
  byFamily: {},
};

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  );
}

function payloadRecord(event: AgentRuntimeExecutionEvent): Record<string, unknown> | undefined {
  return readRecord(event.payload);
}

function nestedPayloadRecord(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  return readRecord(record?.[key]);
}

function payloadText(
  event: AgentRuntimeExecutionEvent,
  keys: string[],
): string | undefined {
  const payload = payloadRecord(event);
  const metadata = nestedPayloadRecord(payload, "metadata");
  const rawPayload = readRecord(payload?.rawPayload);
  const rawMetadata = nestedPayloadRecord(rawPayload, "metadata");
  return readStringField(payload, keys) ??
    readStringField(metadata, keys) ??
    readStringField(rawPayload, keys) ??
    readStringField(rawMetadata, keys);
}

function payloadTextArray(
  event: AgentRuntimeExecutionEvent,
  keys: string[],
): string[] {
  const payload = payloadRecord(event);
  const metadata = nestedPayloadRecord(payload, "metadata");
  const rawPayload = readRecord(payload?.rawPayload);
  const rawMetadata = nestedPayloadRecord(rawPayload, "metadata");
  return uniqueStrings([
    ...readStringArrayField(payload, keys),
    ...readStringArrayField(metadata, keys),
    ...readStringArrayField(rawPayload, keys),
    ...readStringArrayField(rawMetadata, keys),
  ]);
}

export interface ParsedMcpToolName {
  serverId: string;
  toolName: string;
}

export function parseAgentUiMcpToolName(toolName: string): ParsedMcpToolName | undefined {
  const normalized = toolName.trim();
  if (!normalized.toLowerCase().startsWith("mcp__")) return undefined;
  const parts = normalized.split("__");
  if (parts.length < 3) return undefined;
  return {
    serverId: parts[1] || "unknown",
    toolName: parts.slice(2).join("__") || "tool",
  };
}

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function classifyAgentUiMcpOperationKind(
  toolName: string,
): AgentUiMcpOperationKind | undefined {
  const parsed = parseAgentUiMcpToolName(toolName);
  const innerName = parsed?.toolName ?? toolName;
  const normalized = innerName.trim().toLowerCase();
  const compact = normalizeLookup(innerName);
  if (!parsed && compact !== "mcp" && compact !== "mcptool" && compact !== "mcpauthtool") {
    return undefined;
  }
  if (compact === "mcpauth" || compact === "mcpauthtool") return "auth";
  if (compact.includes("prompt")) return "prompt";
  if (compact.includes("resource")) return "resource";
  if (/(^|_)(browser|navigate|click|screenshot|snapshot|page)(_|$)/.test(normalized)) return "browser";
  if (/(^|_)(create|update|delete|write|send|post|mutate|execute|run)(_|$)/.test(normalized)) return "mutation";
  if (/(^|_)(search|find|lookup|query)(_|$)/.test(normalized)) return "search";
  if (/(^|_)list(_|$)/.test(normalized)) return "list";
  if (/(^|_)(get|read|fetch|open)(_|$)/.test(normalized)) return "read";
  return "tool";
}

function normalizeToolFamily(toolName: string, explicitFamily?: string): AgentUiToolFamily {
  if (explicitFamily) return explicitFamily;
  const normalized = toolName.trim().toLowerCase();
  if (normalized.startsWith("mcp__")) return "mcp";
  if (/(^|[._-])web[._-]?search($|[._-])/.test(normalized) || normalized === "websearch") return "webSearch";
  if (/(^|[._-])web[._-]?fetch($|[._-])/.test(normalized) || normalized === "webfetch") return "webFetch";
  if (normalized.includes("bash") || normalized.includes("shell") || normalized.includes("exec")) return "command";
  if (normalized.includes("browser") || normalized.includes("navigate") || normalized.includes("click")) return "browser";
  if (normalized.includes("read") || normalized.includes("write") || normalized.includes("edit") || normalized.includes("file")) return "file";
  if (normalized.includes("skill") || normalized.includes("loadskill") || normalized.includes("listskills")) return "skill";
  return "tool";
}

function toolNameForEvent(event: AgentRuntimeExecutionEvent): string {
  return payloadText(event, [
    "toolName",
    "tool_name",
    "name",
    "tool",
    "functionName",
    "function_name",
  ]) ?? event.title ?? "unknown-tool";
}

function toolCallIdForEvent(event: AgentRuntimeExecutionEvent, index: number): string {
  return event.toolCallId ??
    payloadText(event, [
      "toolCallId",
      "tool_call_id",
      "callId",
      "call_id",
      "id",
    ]) ??
    `${toolNameForEvent(event)}:${event.turnId ?? event.runId ?? "turn"}:${index}`;
}

function toolInputPreview(event: AgentRuntimeExecutionEvent): string | undefined {
  return truncateText(
    payloadText(event, [
      "input",
      "arguments",
      "args",
      "inputSummary",
      "input_summary",
      "accumulatedInputPreview",
      "accumulated_input_preview",
    ]),
  );
}

function toolOutputPreview(event: AgentRuntimeExecutionEvent): string | undefined {
  return truncateText(
    payloadText(event, [
      "output",
      "result",
      "summary",
      "message",
      "outputPreview",
      "output_preview",
      "deltaPreview",
      "delta_preview",
    ]) ?? event.detail,
  );
}

function toolErrorPreview(event: AgentRuntimeExecutionEvent): string | undefined {
  return truncateText(
    payloadText(event, [
      "error",
      "errorPreview",
      "error_preview",
      "failureCategory",
      "failure_category",
    ]),
  );
}

function toolArtifactRefs(event: AgentRuntimeExecutionEvent): string[] {
  return uniqueStrings([
    ...(event.artifactRefs ?? []),
    ...payloadTextArray(event, ["artifactRefs", "artifact_refs"]),
    payloadText(event, ["artifactRef", "artifact_ref", "artifactId", "artifact_id"]),
  ]);
}

function toolEvidenceRefs(event: AgentRuntimeExecutionEvent): string[] {
  return uniqueStrings([
    ...(event.evidenceRefs ?? []),
    ...payloadTextArray(event, ["evidenceRefs", "evidence_refs"]),
    payloadText(event, ["evidenceRef", "evidence_ref", "evidenceId", "evidence_id"]),
  ]);
}

function eventView(event: AgentRuntimeExecutionEvent): AgentUiToolCallEventView {
  return compactProjectionFields({
    id: event.id,
    eventId: event.id,
    eventClass: event.eventClass,
    status: event.status,
    phase: event.phase,
    title: event.title,
    detail: event.detail,
    createdAt: event.createdAt,
    completedAt: event.completedAt,
  });
}

function buildMcpToolView(
  tool: Omit<AgentUiToolCallView, "mcp">,
): AgentUiMcpToolCallView | undefined {
  if (tool.family !== "mcp") return undefined;
  const parsed = parseAgentUiMcpToolName(tool.toolName);
  const serverId = definedString(tool.mcpServerId) ??
    parsed?.serverId ??
    "unknown";
  const toolName = parsed?.toolName ?? tool.toolName;
  return compactProjectionFields({
    id: tool.id,
    serverId,
    fullName: tool.toolName,
    toolName,
    operationKind: classifyAgentUiMcpOperationKind(tool.toolName) ?? "tool",
    status: tool.status,
    title: tool.title,
    detail: tool.detail,
    eventIds: [...tool.eventIds],
    artifactRefs: [...tool.artifactRefs],
    evidenceRefs: [...tool.evidenceRefs],
  });
}

function isToolProjection(event: AgentRuntimeEventProjection): boolean {
  return event.surface === "tool" ||
    event.source.kind === "tool" ||
    event.source.kind === "skill" ||
    (event.source.eventClass ?? "").startsWith("tool.") ||
    event.source.phase === "tool_running";
}

export function projectAgentUiToolSurface<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  events: readonly AgentRuntimeEventProjection<TEvent>[],
): AgentUiToolSurfaceModel {
  if (!events.length) return EMPTY_TOOL_SURFACE;
  const byId = new Map<string, AgentUiToolCallView>();

  events.forEach((projection, index) => {
    if (!isToolProjection(projection)) return;
    const source = projection.source;
    const toolCallId = toolCallIdForEvent(source, index);
    const existing = byId.get(toolCallId);
    const toolName = toolNameForEvent(source);
    const explicitFamily = payloadText(source, ["toolFamily", "tool_family"]);
    const family = normalizeToolFamily(toolName, explicitFamily);
    const mcpServerId = payloadText(source, ["mcpServer", "mcp_server", "serverId", "server_id"]);
    const artifactRefs = toolArtifactRefs(source);
    const evidenceRefs = toolEvidenceRefs(source);
    const inputPreview = toolInputPreview(source);
    const outputPreview = toolOutputPreview(source);
    const errorPreview = toolErrorPreview(source);
    const progress = readNumberField(payloadRecord(source), ["progress"]);
    const total = readNumberField(payloadRecord(source), ["total"]);

    if (!existing) {
      const next: AgentUiToolCallView = compactProjectionFields({
        id: toolCallId,
        toolCallId,
        toolName,
        displayName: toolName,
        family,
        operationKind: family === "mcp" ? classifyAgentUiMcpOperationKind(toolName) : undefined,
        mcpServerId,
        status: source.status,
        phase: source.phase,
        title: projection.title,
        detail: projection.detail ?? outputPreview ?? errorPreview,
        inputPreview,
        outputPreview,
        errorPreview,
        progress,
        total,
        startedAt: source.createdAt,
        completedAt: source.completedAt,
        artifactRefs,
        evidenceRefs,
        eventIds: [source.id],
        events: [eventView(source)],
        skillSlug: payloadText(source, ["skillSlug", "skill_slug", "slug"]),
      });
      const mcp = buildMcpToolView(next);
      byId.set(toolCallId, mcp ? { ...next, mcp } : next);
      return;
    }

    existing.toolName = toolName || existing.toolName;
    existing.displayName = existing.toolName;
    existing.family = family || existing.family;
    existing.operationKind = existing.operationKind ?? (family === "mcp" ? classifyAgentUiMcpOperationKind(toolName) : undefined);
    existing.mcpServerId = mcpServerId ?? existing.mcpServerId;
    existing.status = source.status;
    existing.phase = source.phase ?? existing.phase;
    existing.title = projection.title || existing.title;
    existing.detail = projection.detail ?? outputPreview ?? errorPreview ?? existing.detail;
    existing.inputPreview = inputPreview ?? existing.inputPreview;
    existing.outputPreview = outputPreview ?? existing.outputPreview;
    existing.errorPreview = errorPreview ?? existing.errorPreview;
    existing.progress = progress ?? existing.progress;
    existing.total = total ?? existing.total;
    existing.startedAt = existing.startedAt ?? source.createdAt;
    existing.completedAt = source.completedAt ?? existing.completedAt;
    existing.artifactRefs = uniqueStrings([...existing.artifactRefs, ...artifactRefs]);
    existing.evidenceRefs = uniqueStrings([...existing.evidenceRefs, ...evidenceRefs]);
    existing.eventIds = uniqueStrings([...existing.eventIds, source.id]);
    existing.events = [...existing.events, eventView(source)];
    existing.skillSlug = payloadText(source, ["skillSlug", "skill_slug", "slug"]) ?? existing.skillSlug;
    const mcp = buildMcpToolView(existing);
    existing.mcp = mcp ?? existing.mcp;
  });

  const calls = Array.from(byId.values());
  const byFamily: Record<string, number> = {};
  for (const call of calls) {
    byFamily[call.family] = (byFamily[call.family] ?? 0) + 1;
  }
  return {
    calls,
    activeCallIds: calls.filter((call) => call.status === "running" || call.status === "pending").map((call) => call.id),
    failedCallIds: calls.filter((call) => call.status === "failed" || call.status === "blocked").map((call) => call.id),
    completedCallIds: calls.filter((call) => call.status === "completed").map((call) => call.id),
    byFamily,
  };
}

export function projectAgentUiMcpSurface(
  toolSurface: AgentUiToolSurfaceModel,
): AgentUiMcpSurfaceModel {
  const tools = toolSurface.calls
    .map((call) => call.mcp)
    .filter((call): call is AgentUiMcpToolCallView => Boolean(call));
  if (!tools.length) return EMPTY_MCP_SURFACE;

  const serverById = new Map<string, AgentUiMcpServerView>();
  for (const tool of tools) {
    const current = serverById.get(tool.serverId);
    const nextStatus = tool.status === "failed" || tool.status === "blocked"
      ? tool.status
      : current?.status === "failed" || current?.status === "blocked"
        ? current.status
        : tool.status === "running" || tool.status === "pending"
          ? tool.status
          : current?.status ?? tool.status;
    serverById.set(tool.serverId, {
      id: tool.serverId,
      label: tool.serverId,
      status: nextStatus,
      toolCount: (current?.toolCount ?? 0) + 1,
      activeToolCount:
        (current?.activeToolCount ?? 0) +
        (tool.status === "running" || tool.status === "pending" ? 1 : 0),
      failedToolCount:
        (current?.failedToolCount ?? 0) +
        (tool.status === "failed" || tool.status === "blocked" ? 1 : 0),
      eventIds: uniqueStrings([...(current?.eventIds ?? []), ...tool.eventIds]),
    });
  }

  return {
    hasMcp: true,
    servers: Array.from(serverById.values()),
    tools,
    activeToolIds: tools.filter((tool) => tool.status === "running" || tool.status === "pending").map((tool) => tool.id),
    failedToolIds: tools.filter((tool) => tool.status === "failed" || tool.status === "blocked").map((tool) => tool.id),
    completedToolIds: tools.filter((tool) => tool.status === "completed").map((tool) => tool.id),
  };
}
