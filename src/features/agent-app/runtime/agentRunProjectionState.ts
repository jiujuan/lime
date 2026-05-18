import {
  buildAgentAppAgentUiProjectionEvents,
  type AgentAppAgentUiProjectionBridgeOptions,
} from "./agentUiProjectionBridge";
import {
  buildAgentAppRunProjectionViewModel,
  type AgentAppRunProjectionViewModel,
} from "./agentUiProjectionViewModel";

export interface AgentRunProjectionStateOptions {
  startSequence?: number;
}

export function buildAgentRunProjectionViewModelFromState(
  state: unknown,
  options: AgentRunProjectionStateOptions = {},
): AgentAppRunProjectionViewModel {
  const context = buildProjectionBridgeContext(state, options);
  const events = collectAgentRunProjectionSourceEvents(state);
  const projectionEvents = buildAgentAppAgentUiProjectionEvents({
    ...context,
    events,
  });
  return buildAgentAppRunProjectionViewModel(projectionEvents);
}

export function collectAgentRunProjectionSourceEvents(state: unknown): unknown[] {
  const root = isRecord(state) ? state : {};
  const runtimeFacts = recordValue(root, "runtimeFacts");
  const task = recordValue(root, "task");
  const snapshot = recordValue(root, "snapshot");
  return [
    ...readEventArrays(root),
    ...readRuntimeProcessTimelineEvents(root, "root"),
    ...readRuntimeMetricEvents(root, "root"),
    ...readNestedEventArrays(root, "runtimeFacts"),
    ...(runtimeFacts ? readRuntimeMetricEvents(runtimeFacts, "runtimeFacts") : []),
    ...readNestedEventArrays(root, "task"),
    ...(task ? readRuntimeMetricEvents(task, "task") : []),
    ...readNestedEventArrays(root, "snapshot"),
    ...(snapshot ? readRuntimeMetricEvents(snapshot, "snapshot") : []),
  ];
}

function buildProjectionBridgeContext(
  state: unknown,
  options: AgentRunProjectionStateOptions,
): Omit<AgentAppAgentUiProjectionBridgeOptions, "events"> {
  const root = isRecord(state) ? state : {};
  const task = recordValue(root, "task");
  const snapshot = recordValue(root, "snapshot");
  return {
    appId: readString(root, "appId") ?? readString(root, "app_id"),
    taskId:
      readString(root, "taskId") ??
      readString(task, "taskId") ??
      readString(snapshot, "taskId"),
    sessionId:
      readString(root, "sessionId") ??
      readString(task, "sessionId") ??
      readString(snapshot, "sessionId"),
    threadId:
      readString(root, "threadId") ??
      readString(task, "threadId") ??
      readString(snapshot, "threadId"),
    runId:
      readString(root, "runtimeEventName") ??
      readString(root, "runId") ??
      readString(task, "runtimeEventName") ??
      readString(snapshot, "runtimeEventName"),
    turnId:
      readString(root, "turnId") ??
      readString(task, "turnId") ??
      readString(snapshot, "turnId"),
    timestamp:
      readString(root, "updatedAt") ??
      readString(root, "openedAt") ??
      readString(snapshot, "updatedAt"),
    startSequence: options.startSequence,
  };
}

function readNestedEventArrays(
  value: Record<string, unknown>,
  key: string,
): unknown[] {
  const nested = recordValue(value, key);
  if (!nested) {
    return [];
  }
  return [
    ...readEventArrays(nested),
    ...readRuntimeProcessTimelineEvents(nested, key),
  ];
}

function readEventArrays(value: Record<string, unknown>): unknown[] {
  return [
    ...readArray(value, "events"),
    ...readArray(value, "taskEvents"),
    ...readArray(value, "agentUiEvents"),
    ...readArray(value, "projectionEvents"),
  ];
}

function readArray(value: Record<string, unknown>, key: string): unknown[] {
  const item = value[key];
  return Array.isArray(item) ? item : [];
}

function readRuntimeProcessTimelineEvents(
  value: Record<string, unknown>,
  sourceKey: string,
): unknown[] {
  const process =
    recordValue(value, "runtimeProcess") ?? recordValue(value, "process");
  if (!process) {
    return [];
  }
  return readArray(process, "timeline")
    .map((item, index) =>
      timelineRecordToProjectionSourceEvent(item, index, sourceKey),
    )
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function readRuntimeMetricEvents(
  value: Record<string, unknown>,
  sourceKey: string,
): Record<string, unknown>[] {
  const process = recordValue(value, "runtimeProcess") ?? recordValue(value, "process");
  const model = readMetricModel(value) ?? readMetricModel(process);
  const usage = readMetricUsage(value) ?? readMetricUsage(process);
  const cost = readMetricCost(value) ?? readMetricCost(process);

  if (!model && !usage && !cost) {
    return [];
  }

  return [{
    id: `${sourceKey}:runtime-metrics`,
    eventType: "task:metricChanged",
    status: "recorded",
    payload: {
      metricName: "runtime_usage_cost",
      providerName: model?.providerName,
      modelName: model?.modelName,
      usage,
      cost,
    },
  }];
}

function readMetricModel(
  value: Record<string, unknown> | null,
): { providerName?: string; modelName?: string } | null {
  if (!value) {
    return null;
  }
  const modelRouting = recordValue(value, "modelRouting");
  const route = firstRecord(arrayValue(modelRouting ?? {}, "routes"));
  const routeModel = route ? recordValue(route, "model") ?? route : null;
  const models = recordValue(value, "models");
  const listedModel = firstRecord(arrayValue(models ?? {}, "models"));
  const directModel = recordValue(value, "model");
  const model = routeModel ?? listedModel ?? directModel ?? value;
  const providerName =
    readString(model, "provider") ??
    readString(model, "providerName") ??
    readString(model, "selectedProvider");
  const modelName =
    readString(model, "model") ??
    readString(model, "modelName") ??
    readString(model, "selectedModel") ??
    readString(model, "label");
  return providerName || modelName
    ? {
        providerName: providerName ?? undefined,
        modelName: modelName ?? undefined,
      }
    : null;
}

function readMetricUsage(
  value: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  const tokenUsage = recordValue(value, "tokenUsage");
  return recordValue(tokenUsage ?? {}, "totals")
    ?? recordValue(firstRecord(arrayValue(tokenUsage ?? {}, "tasks")) ?? {}, "usage")
    ?? recordValue(value, "usage");
}

function readMetricCost(
  value: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  const costSummary = recordValue(value, "costSummary");
  return recordValue(costSummary ?? {}, "cost")
    ?? recordValue(firstRecord(arrayValue(costSummary ?? {}, "tasks")) ?? {}, "cost")
    ?? recordValue(value, "cost");
}

function arrayValue(
  value: Record<string, unknown>,
  key: string,
): unknown[] {
  const item = value[key];
  return Array.isArray(item) ? item : [];
}

function firstRecord(value: unknown[]): Record<string, unknown> | null {
  const first = value.find(isRecord);
  return first ?? null;
}

function timelineRecordToProjectionSourceEvent(
  value: unknown,
  index: number,
  sourceKey: string,
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind = readString(value, "kind") ?? "progress";
  const title = readString(value, "title");
  const message = readString(value, "message") ?? title;
  const status =
    readString(value, "status") ??
    readString(value, "statusText") ??
    readString(value, "state");
  const id =
    readString(value, "id") ??
    readString(value, "eventId") ??
    `${sourceKey}:timeline:${index}`;
  const payload = {
    source: "runtimeProcess.timeline",
    timelineKind: kind,
    title,
  };

  if (kind === "tool" || kind === "skill") {
    const toolName = readTimelineToolName(value, title, kind);
    if (!toolName && !message) {
      return null;
    }
    return {
      id,
      eventType: "task:toolCall",
      status,
      message,
      toolName,
      toolCallId:
        readString(value, "toolCallId") ??
        readString(value, "callId") ??
        readString(value, "toolId") ??
        id,
      payload,
    };
  }

  if (kind === "output") {
    return {
      id,
      eventType: "task:partialArtifact",
      status,
      message,
      payload: {
        ...payload,
        streamKind: "assistant_text_delta",
        delta: message,
      },
    };
  }

  if (kind === "thinking" || kind === "reasoning") {
    return {
      id,
      eventType: "task:partialArtifact",
      status,
      message,
      payload: {
        ...payload,
        streamKind: "thinking_delta",
        delta: message,
      },
    };
  }

  if (!message && !status) {
    return null;
  }
  return {
    id,
    eventType: "task:status",
    status,
    message,
    payload,
  };
}

function readTimelineToolName(
  value: Record<string, unknown>,
  title: string | null,
  kind: string,
): string | undefined {
  const explicit =
    readString(value, "toolName") ??
    readString(value, "tool_name") ??
    readString(value, "name") ??
    readString(value, "tool");
  if (explicit) {
    return kind === "skill" && !explicit.startsWith("Skill(")
      ? `Skill(${explicit})`
      : explicit;
  }
  const match = title?.match(/^(?:工具|Tool|技能|Skill)\s*·\s*(.+)$/);
  const fromTitle = match?.[1]?.trim();
  if (!fromTitle) {
    return undefined;
  }
  return kind === "skill" ? `Skill(${fromTitle})` : fromTitle;
}

function readString(
  value: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const item = value?.[key];
  return typeof item === "string" && item.trim() ? item.trim() : null;
}

function recordValue(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const item = value[key];
  return isRecord(item) ? item : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
