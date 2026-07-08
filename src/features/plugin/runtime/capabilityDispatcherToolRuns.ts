import type {
  PluginRuntimeProcessTimelineItem,
  PluginTaskRecord,
} from "../types";
import { capabilityMatchToken } from "./capabilityDispatcherClawCapabilities";
import {
  isRecord,
  recordArray,
  recordArrayByKeys,
  recordObjectByKeys,
  readString,
  recordStringByKeys,
  recordValueByKeys,
} from "./capabilityDispatcherRecord";
import {
  readTaskRuntimeProcess,
  readTaskThreadRead,
  TOOL_INTEGRATION_SPECS,
} from "./capabilityDispatcherRuntimeProjection";
import type {
  RuntimeAggregateProjectionSource,
  RuntimeConnectorProjection,
  RuntimeMcpToolProjection,
  RuntimeToolRunProjection,
  ToolIntegrationCapability,
} from "./capabilityDispatcherRuntimeTypes";

function classifyToolIntegrationCapability(
  value: string,
): ToolIntegrationCapability | null {
  const token = capabilityMatchToken(value);
  if (!token) {
    return null;
  }
  if (token.includes("mcp")) {
    return "lime.mcp";
  }
  if (
    token.includes("terminal") ||
    token.includes("shell") ||
    token.includes("powershell")
  ) {
    return "lime.terminal";
  }
  if (token.includes("connector")) {
    return "lime.connectors";
  }
  const capability = (
    Object.entries(TOOL_INTEGRATION_SPECS) as Array<
      [
        ToolIntegrationCapability,
        (typeof TOOL_INTEGRATION_SPECS)[ToolIntegrationCapability],
      ]
    >
  ).find(([, spec]) =>
    spec.keywords.some((keyword) =>
      token.includes(capabilityMatchToken(keyword)),
    ),
  )?.[0];
  return capability ?? null;
}

function normalizeToolIntegrationName(value: string): string {
  return value
    .replace(/^Tool\s*[·:]\s*/i, "")
    .replace(/^执行参数流\s*[·:]\s*/i, "")
    .replace(/^执行结果流\s*[·:]\s*/i, "")
    .trim();
}

function buildDeclaredToolRun(
  task: PluginTaskRecord,
  toolName: string,
): RuntimeToolRunProjection | null {
  const capability = classifyToolIntegrationCapability(toolName);
  if (!capability) {
    return null;
  }
  return {
    runId: `${task.taskId}:${capability}:${capabilityMatchToken(toolName)}:declared`,
    capability,
    toolName,
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: "declared",
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    title: `Tool intent · ${toolName}`,
    statusText: "已声明",
    message:
      "Plugin task 声明了该 ToolRuntime intent，实际执行仍由 Lime AgentRuntime 管理。",
    source: "app_server_runtime_process",
  };
}

function buildTimelineToolRun(
  task: PluginTaskRecord,
  item: PluginRuntimeProcessTimelineItem,
  index: number,
): RuntimeToolRunProjection | null {
  const surface = [item.title, item.message, item.detail, item.meta]
    .filter(Boolean)
    .join(" ");
  const capability = classifyToolIntegrationCapability(surface);
  if (!capability) {
    return null;
  }
  const toolName = normalizeToolIntegrationName(
    item.title || item.meta || surface,
  );
  return {
    runId:
      readString(item.meta) ??
      `${task.taskId}:${capability}:${capabilityMatchToken(toolName)}:${index}`,
    capability,
    toolName,
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status === "running" ? "observed" : task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    title: item.title,
    statusText: item.statusText,
    message: item.message,
    detail: item.detail,
    source: "app_server_runtime_process",
  };
}

function buildThreadReadToolRun(
  task: PluginTaskRecord,
  call: Record<string, unknown>,
  index: number,
): RuntimeToolRunProjection | null {
  const toolName =
    recordStringByKeys(call, ["toolName", "tool_name", "name"]) ??
    recordStringByKeys(recordObjectByKeys(call, ["function"]), ["name"]);
  if (!toolName) {
    return null;
  }
  const capability = classifyToolIntegrationCapability(toolName);
  if (!capability) {
    return null;
  }
  const status =
    recordStringByKeys(call, ["status", "state"]) ??
    (task.status === "succeeded" ? "completed" : task.status);
  return {
    runId:
      recordStringByKeys(call, ["runId", "run_id", "id", "toolCallId"]) ??
      `${task.taskId}:${capability}:${capabilityMatchToken(toolName)}:${index}:thread`,
    capability,
    toolName,
    taskId: task.taskId,
    taskKind: task.taskKind,
    status:
      status === "completed" || status === "declared" || status === "observed"
        ? status
        : task.status,
    startedAt:
      recordStringByKeys(call, ["startedAt", "started_at"]) ?? task.startedAt,
    finishedAt:
      recordStringByKeys(call, ["finishedAt", "finished_at", "completedAt"]) ??
      task.finishedAt,
    title: recordStringByKeys(call, ["title"]) ?? `Tool · ${toolName}`,
    statusText:
      recordStringByKeys(call, ["statusText", "status_text"]) ?? "已记录",
    message:
      recordStringByKeys(call, ["message"]) ??
      "AgentRuntime threadRead 记录了该工具调用。",
    detail: recordStringByKeys(call, ["detail"]),
    input: recordValueByKeys(call, ["input", "args", "arguments"]),
    output: recordValueByKeys(call, ["output", "result"]),
    source: "app_server_runtime_thread_read",
  };
}

function collectThreadReadToolRuns(
  task: PluginTaskRecord,
): RuntimeToolRunProjection[] {
  const threadRead = readTaskThreadRead(task);
  const candidates = [
    ...recordArrayByKeys(threadRead, ["toolCalls", "tool_calls"]),
    ...recordArray(threadRead, "turns")
      .filter(isRecord)
      .flatMap((turn) => recordArrayByKeys(turn, ["toolCalls", "tool_calls"])),
  ];
  return candidates
    .filter(isRecord)
    .map((call, index) => buildThreadReadToolRun(task, call, index))
    .filter((item): item is RuntimeToolRunProjection => Boolean(item));
}

export function buildRuntimeToolRuns(
  tasks: PluginTaskRecord[],
  capability?: ToolIntegrationCapability,
): RuntimeToolRunProjection[] {
  const runs = tasks.flatMap((task) => {
    const process = readTaskRuntimeProcess(task);
    const declared = task.tools
      .map((toolName) => buildDeclaredToolRun(task, toolName))
      .filter((item): item is RuntimeToolRunProjection => Boolean(item));
    const observed = (process?.timeline ?? [])
      .filter((item) => item.kind === "tool" || item.kind === "execution")
      .map((item, index) => buildTimelineToolRun(task, item, index))
      .filter((item): item is RuntimeToolRunProjection => Boolean(item));
    const threadRead = collectThreadReadToolRuns(task);
    return [...observed, ...threadRead, ...declared];
  });
  return runs
    .filter((run) => !capability || run.capability === capability)
    .sort((left, right) =>
      String(right.finishedAt ?? right.startedAt).localeCompare(
        String(left.finishedAt ?? left.startedAt),
      ),
    );
}

function mergeRuntimeProjectionSource(
  current: RuntimeAggregateProjectionSource,
  next: RuntimeToolRunProjection["source"],
): RuntimeAggregateProjectionSource {
  return current === next ? current : "mixed";
}

function parseMcpToolName(toolName: string): {
  serverId: string;
  toolId: string;
} {
  const normalized = toolName
    .replace(/^Tool\s*[·:]\s*/i, "")
    .replace(/^mcp[:./-]/i, "mcp__")
    .trim();
  const match = /^mcp__([^_]+)__(.+)$/i.exec(normalized);
  if (match) {
    return {
      serverId: match[1],
      toolId: match[2],
    };
  }
  return {
    serverId: "unknown",
    toolId: normalized || toolName,
  };
}

export function buildRuntimeMcpTools(
  runs: RuntimeToolRunProjection[],
): RuntimeMcpToolProjection[] {
  const tools = new Map<string, RuntimeMcpToolProjection>();
  runs.forEach((run) => {
    const parsed = parseMcpToolName(run.toolName);
    const key = `${parsed.serverId}\u0000${parsed.toolId}`;
    const lastSeenAt = String(run.finishedAt ?? run.startedAt);
    const existing = tools.get(key);
    if (existing) {
      existing.runIds = Array.from(new Set([...existing.runIds, run.runId]));
      existing.taskIds = Array.from(new Set([...existing.taskIds, run.taskId]));
      existing.source = mergeRuntimeProjectionSource(
        existing.source,
        run.source,
      );
      if (lastSeenAt > existing.lastSeenAt) {
        existing.lastSeenAt = lastSeenAt;
      }
      return;
    }
    tools.set(key, {
      toolName: run.toolName,
      serverId: parsed.serverId,
      toolId: parsed.toolId,
      runIds: [run.runId],
      taskIds: [run.taskId],
      lastSeenAt,
      source: run.source,
    });
  });
  return Array.from(tools.values()).sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

function parseConnectorToolName(toolName: string): {
  connectorId: string;
  actionId?: string;
} {
  const normalized = toolName
    .replace(/^Tool\s*[·:]\s*/i, "")
    .replace(/^connector[:./-]/i, "connector__")
    .trim();
  const match = /^connector__([^_]+)__(.+)$/i.exec(normalized);
  if (match) {
    return {
      connectorId: match[1],
      actionId: match[2],
    };
  }
  return {
    connectorId: normalized || toolName,
  };
}

export function buildRuntimeConnectors(
  runs: RuntimeToolRunProjection[],
): RuntimeConnectorProjection[] {
  const connectors = new Map<string, RuntimeConnectorProjection>();
  runs.forEach((run) => {
    const parsed = parseConnectorToolName(run.toolName);
    const connectorId = parsed.connectorId;
    const lastSeenAt = String(run.finishedAt ?? run.startedAt);
    const existing = connectors.get(connectorId);
    if (existing) {
      existing.actionIds = Array.from(
        new Set(
          parsed.actionId
            ? [...existing.actionIds, parsed.actionId]
            : existing.actionIds,
        ),
      ).sort();
      existing.runIds = Array.from(new Set([...existing.runIds, run.runId]));
      existing.taskIds = Array.from(new Set([...existing.taskIds, run.taskId]));
      existing.source = mergeRuntimeProjectionSource(
        existing.source,
        run.source,
      );
      if (lastSeenAt > existing.lastSeenAt) {
        existing.lastSeenAt = lastSeenAt;
      }
      return;
    }
    connectors.set(connectorId, {
      connectorId,
      actionIds: parsed.actionId ? [parsed.actionId] : [],
      runIds: [run.runId],
      taskIds: [run.taskId],
      lastSeenAt,
      source: run.source,
    });
  });
  return Array.from(connectors.values()).sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}
