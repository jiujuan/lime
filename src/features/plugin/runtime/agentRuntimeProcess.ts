import type {
  PluginRuntimeProcessTimelineItem,
  PluginRuntimeProcessView,
} from "../types";
import {
  escapeRegExp,
  findFirstObjectByKeys,
  isRecord,
  numberValue,
  parseJsonObject,
  readRuntimeEvent,
  readRuntimeEventType,
  readString,
  recordValue,
} from "./agentRuntimeProcessAccess";
import {
  extractCostFromProcess,
  extractCostState,
  extractModelFromProcess,
  extractUsageFromProcess,
  extractUsageObject,
  formatAgentRuntimeCostText,
  formatAgentRuntimeUsageText,
  isTerminalProcess,
} from "./agentRuntimeProcessMetrics";
import {
  collectInvokedSkillNamesFromRuntimeValue,
  collectRequiredSkillNames,
  extractInvokedSkillNameFromEvent,
  extractSkillNameFromEvent,
  extractToolNameFromEvent,
  formatToolName,
  formatToolTitle,
  uniqueSkillNames,
} from "./agentRuntimeProcessSkills";
import { buildHostManagedGenerationTimelineItems } from "./hostManagedGenerationProcess";

export interface BuildAgentRuntimeProcessViewOptions {
  events?: unknown[];
  task?: unknown;
  snapshot?: unknown;
  expectedOutput?: unknown;
  lastInput?: unknown;
  contract?: unknown;
}

export function buildAgentRuntimeProcessView({
  events = [],
  task = null,
  snapshot = null,
  expectedOutput = null,
  lastInput = null,
  contract = null,
}: BuildAgentRuntimeProcessViewOptions = {}): PluginRuntimeProcessView {
  const safeEvents = Array.isArray(events) ? events : [];
  const taskRecord = isRecord(task) ? task : null;
  const resolvedExpectedOutput =
    expectedOutput ?? (taskRecord ? taskRecord.expectedOutput : undefined);
  const resolvedLastInput =
    lastInput ?? (taskRecord ? taskRecord.input : undefined);
  const declaredSkillNames = uniqueSkillNames([
    ...collectRequiredSkillNames(task),
    ...collectRequiredSkillNames(resolvedLastInput),
    ...collectRequiredSkillNames(resolvedExpectedOutput),
  ]);
  const invokedSkillNames = uniqueSkillNames(
    [
      ...safeEvents.map(extractInvokedSkillNameFromEvent),
      ...collectInvokedSkillNamesFromRuntimeValue(task, declaredSkillNames),
      ...collectInvokedSkillNamesFromRuntimeValue(snapshot, declaredSkillNames),
    ],
    declaredSkillNames,
  );
  const timeline = appendMissingSkillTimelineItems(
    buildTimelineItems(safeEvents, task, snapshot),
    ...invokedSkillNames,
  );
  const skillNames = uniqueSkillNames([
    ...declaredSkillNames,
    ...invokedSkillNames,
  ]);
  const usage = extractUsageFromProcess(safeEvents, snapshot, task);
  const cost = extractCostFromProcess(safeEvents, snapshot, task);
  const model = extractModelFromProcess(safeEvents, task, snapshot);
  const terminal = isTerminalProcess({
    task,
    snapshot,
    events: safeEvents,
    contract,
  });

  return {
    timeline,
    streamText: collectStream(safeEvents, "assistant_text"),
    thinkingText: collectStream(safeEvents, "thinking"),
    executionText: collectExecutionStream(safeEvents),
    skillNames,
    invokedSkillNames,
    model,
    usage,
    cost,
    terminal,
    collapsedByDefault: terminal,
    routingCount: timeline.filter((item) => item.kind === "routing").length,
    executionCount: timeline.filter((item) =>
      ["skill", "tool", "execution"].includes(item.kind),
    ).length,
    artifactCount: timeline.filter((item) => item.kind === "artifact").length,
  };
}

export function normalizeAgentRuntimeProcessTimelineItem(
  event: unknown,
): PluginRuntimeProcessTimelineItem | null {
  if (!isRecord(event)) {
    return null;
  }

  const stream = readStreamEvent(event);
  if (stream?.text) {
    const config = {
      thinking: ["thinking", "思考过程", "流式思考"],
      assistant_text: ["output", "成稿流式输出", "生成中"],
      tool_input: ["execution", "执行参数流", "输入中"],
      tool_output: ["execution", "执行结果流", "输出中"],
    }[stream.kind] ?? ["progress", "运行片段", "更新中"];
    return {
      kind: config[0] as PluginRuntimeProcessTimelineItem["kind"],
      title: stream.toolName ? `${config[1]} · ${stream.toolName}` : config[1],
      statusText: config[2],
      message: clipText(stream.text, 140),
      detail: "",
      meta: stream.streamKind ?? "",
      collapseKey: `stream:${stream.kind}:${stream.toolName || "main"}`,
    };
  }

  const runtimeEvent = readRuntimeEvent(event);
  const runtimeType = readRuntimeEventType(event, runtimeEvent);
  const eventType = String(
    event.eventType ?? event.type ?? runtimeType ?? "",
  ).toLowerCase();
  const message = String(
    event.message ?? runtimeType ?? event.eventType ?? "任务进度已更新",
  ).trim();
  const statusText = statusTextFor(
    readString(event, "status") ||
      readString(recordValue(event, "payload"), "status"),
  );
  const toolName = extractToolNameFromEvent(event);
  const skillName = extractSkillNameFromEvent(event);
  const detail = extractEventDetail(event);
  const runtimeSurface = `${eventType} ${runtimeType} ${message}`;

  if (message === "任务状态：idle") {
    return {
      kind: "progress",
      title: "接收任务",
      statusText: "已接收",
      message: "AI 同事已接收任务，等待运行进度回写。",
      detail,
    };
  }
  if (
    /routing|candidate|model_change/.test(runtimeType) ||
    /routing/.test(message)
  ) {
    return {
      kind: "routing",
      title: "模型路由",
      statusText: "已决策",
      message: routingLabel(runtimeEvent) || message,
      detail,
      collapseKey: "runtime:routing",
    };
  }
  if (/cost_estimated|cost_recorded/.test(runtimeType)) {
    const cost = extractCostState(runtimeEvent);
    return {
      kind: "metrics",
      title: "消耗统计",
      statusText: runtimeType === "cost_recorded" ? "已记录" : "预估中",
      message: formatAgentRuntimeCostText(cost),
      detail: "",
      collapseKey: runtimeType,
    };
  }
  if (/task_profile|taskprofileresolved/.test(runtimeType)) {
    return {
      kind: "progress",
      title: "任务识别",
      statusText: "已识别",
      message,
      detail,
      collapseKey: "runtime:task-profile",
    };
  }
  if (toolName || eventType.includes("tool")) {
    const title = formatToolTitle(toolName, skillName);
    return {
      kind: title.startsWith("Skill ·") ? "skill" : "tool",
      title,
      statusText,
      message: normalizeToolMessage(message, statusText),
      detail,
      meta:
        readString(event, "toolId") ||
        readString(runtimeEvent, "tool_id") ||
        readString(runtimeEvent, "toolId"),
    };
  }
  if (
    eventType.includes("artifact") ||
    /artifact/.test(runtimeType) ||
    /artifact|workspacePatch|contentFactoryWorkspacePatch/i.test(message)
  ) {
    return {
      kind: "artifact",
      title: "产物回写",
      statusText,
      message: runtimeAssetLabel(event) || message,
      detail,
    };
  }
  if (
    eventType.includes("evidence") ||
    /evidence|verification/i.test(runtimeType)
  ) {
    return {
      kind: "artifact",
      title: "证据记录",
      statusText,
      message: evidenceLabel(event) || message,
      detail,
    };
  }
  if (
    /missing|blocked|review|action_required|actionrequired/i.test(
      runtimeSurface,
    )
  ) {
    return {
      kind: "blocked",
      title: "等待确认",
      statusText,
      message: normalizeConfirmationMessage(message),
      detail,
    };
  }
  if (
    /failed|failure|error|incident|warning|cancel/.test(
      runtimeSurface.toLowerCase(),
    )
  ) {
    return {
      kind: "warning",
      title: "运行提醒",
      statusText,
      message,
      detail,
    };
  }
  if (
    /completed|complete|done|turn_completed|turncompleted/.test(
      runtimeSurface.toLowerCase(),
    )
  ) {
    const usage = extractUsageObject(runtimeEvent);
    return {
      kind: "completed",
      title: "回合完成",
      statusText: "已完成",
      message: usage
        ? `AgentRuntime 本轮输出已结束，${formatAgentRuntimeUsageText(usage)}`
        : message,
      detail,
      collapseKey: "runtime:done",
    };
  }
  if (/streamTask|getTask|plugin-runtime/i.test(message)) {
    return {
      kind: "progress",
      title: "同步运行事件",
      statusText,
      message: "正在同步 Lime 运行事件。",
      detail,
    };
  }
  if (/running|started|queued/i.test(message)) {
    return {
      kind: "execution",
      title: "执行阶段",
      statusText,
      message: "AI 同事正在执行本轮任务。",
      detail,
    };
  }
  return {
    kind: "progress",
    title: "运行进度",
    statusText,
    message,
    detail,
  };
}

function buildTimelineItems(
  events: unknown[],
  task: unknown,
  snapshot: unknown,
): PluginRuntimeProcessTimelineItem[] {
  const items: PluginRuntimeProcessTimelineItem[] = [];
  const seen = new Set<string>();
  for (const item of buildHostManagedGenerationTimelineItems(task, snapshot)) {
    const signature = timelineItemSignature(item);
    seen.add(signature);
    items.push(item);
  }
  for (const event of events) {
    const item = normalizeAgentRuntimeProcessTimelineItem(event);
    if (!item) {
      continue;
    }
    const signature = timelineItemSignature(item);
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    items.push(item);
  }
  return items;
}

function timelineItemSignature(item: PluginRuntimeProcessTimelineItem): string {
  return [
    item.kind,
    item.title,
    item.statusText,
    item.message,
    item.detail,
    item.meta,
    item.collapseKey,
  ].join("|");
}

function appendMissingSkillTimelineItems(
  timeline: PluginRuntimeProcessTimelineItem[],
  ...invokedSkillNames: string[]
): PluginRuntimeProcessTimelineItem[] {
  const missingSkillNames = uniqueSkillNames(invokedSkillNames).filter(
    (skillName) =>
      !timeline.some((item) => timelineItemMentionsSkill(item, skillName)),
  );
  if (!missingSkillNames.length) {
    return timeline;
  }
  return [
    ...timeline,
    ...missingSkillNames.map((skillName) => ({
      kind: "skill" as const,
      title: `Skill · ${skillName}`,
      statusText: "已记录",
      message: "AgentRuntime 已记录业务 Skill 调用。",
      detail: "",
      meta: skillName,
      collapseKey: `skill:${skillName}`,
    })),
  ];
}

function timelineItemMentionsSkill(
  item: PluginRuntimeProcessTimelineItem,
  skillName: string,
): boolean {
  if (item.kind !== "skill") {
    return false;
  }
  const surface = [item.title, item.message, item.detail, item.meta]
    .filter(Boolean)
    .join(" ");
  return new RegExp(
    `(^|[^\\w@:/.-])${escapeRegExp(skillName)}([^\\w@:/.-]|$)`,
  ).test(surface);
}

function collectStream(
  events: unknown[],
  targetKind: AgentRuntimeStreamKind,
): string {
  return events
    .map(readStreamEvent)
    .filter((item): item is AgentRuntimeStreamEvent =>
      Boolean(item?.kind === targetKind && item.text),
    )
    .map((item) => item.text)
    .join("");
}

function collectExecutionStream(events: unknown[]): string {
  return events
    .map(readStreamEvent)
    .filter((item): item is AgentRuntimeStreamEvent =>
      Boolean(
        item && ["tool_input", "tool_output"].includes(item.kind) && item.text,
      ),
    )
    .map((item) => {
      const label = item.kind === "tool_input" ? "输入" : "输出";
      return `${label}${item.toolName ? ` · ${item.toolName}` : ""}\n${item.text}`;
    })
    .join("\n\n");
}

type AgentRuntimeStreamKind =
  | "assistant_text"
  | "thinking"
  | "tool_input"
  | "tool_output";

interface AgentRuntimeStreamEvent {
  kind: AgentRuntimeStreamKind;
  text: string;
  toolName?: string;
  streamKind?: string;
}

function readStreamEvent(event: unknown): AgentRuntimeStreamEvent | null {
  if (!isRecord(event)) {
    return null;
  }
  const payload = recordValue(event, "payload");
  const runtimeEvent = readRuntimeEvent(event);
  const streamKind =
    readString(payload, "streamKind") ||
    readString(payload, "stream_kind") ||
    readString(event, "streamKind");
  const runtimeType = readRuntimeEventType(event, runtimeEvent);
  const text =
    readString(payload, "delta") ||
    readString(payload, "text") ||
    readString(runtimeEvent, "delta") ||
    readString(runtimeEvent, "text") ||
    readString(runtimeEvent, "arguments") ||
    readString(runtimeEvent, "accumulated_arguments") ||
    readString(runtimeEvent, "accumulatedArguments") ||
    (runtimeType === "text_delta_batch" ? readString(event, "message") : "");
  if (!text) {
    return null;
  }
  const toolName = formatToolName(
    extractToolNameFromEvent(event),
    extractSkillNameFromEvent(event),
  );
  const base = { text, toolName, streamKind };
  if (
    streamKind === "assistant_text_delta" ||
    streamKind === "assistant_text_batch" ||
    runtimeType === "text_delta" ||
    runtimeType === "text_delta_batch"
  ) {
    return { ...base, kind: "assistant_text" };
  }
  if (
    streamKind === "thinking_delta" ||
    runtimeType === "thinking_delta" ||
    runtimeType === "reasoning_delta"
  ) {
    return { ...base, kind: "thinking" };
  }
  if (streamKind === "tool_input_delta" || runtimeType === "tool_input_delta") {
    return { ...base, kind: "tool_input" };
  }
  if (
    streamKind === "tool_output_delta" ||
    runtimeType === "tool_output_delta"
  ) {
    return { ...base, kind: "tool_output" };
  }
  if (event.eventType === ["task", `partial${"Art"}ifact`].join(":")) {
    return { ...base, kind: "assistant_text" };
  }
  return null;
}

function normalizeToolMessage(message: string, statusText: string): string {
  const text = String(message || "").trim();
  if (
    !text ||
    /^工具\s+\S+\s+(running|completed|failed|started)$/i.test(text)
  ) {
    return `状态：${statusText}`;
  }
  return text;
}

function normalizeConfirmationMessage(message: string): string {
  return /missingContext|blocked|request|review|action/i.test(message)
    ? "AI 同事需要补充确认，已在当前工单等待处理。"
    : message;
}

function extractEventDetail(event: Record<string, unknown>): string {
  const runtimeEvent = readRuntimeEvent(event);
  const payload = recordValue(event, "payload");
  const result = recordValue(runtimeEvent, "result");
  const detail =
    readString(runtimeEvent, "arguments") ||
    readString(runtimeEvent, "accumulated_arguments") ||
    readString(runtimeEvent, "accumulatedArguments") ||
    readString(result, "output") ||
    readString(result, "error") ||
    readString(payload, "summary") ||
    "";
  return detail ? clipText(formatMaybeJsonText(detail), 520) : "";
}

function routingLabel(runtimeEvent: Record<string, unknown>): string {
  const decision =
    findFirstObjectByKeys(runtimeEvent, [
      "routing_decision",
      "routingDecision",
    ]) ?? runtimeEvent;
  const provider =
    readString(decision, "selected_provider") ||
    readString(decision, "selectedProvider");
  const model =
    readString(decision, "selected_model") ||
    readString(decision, "selectedModel") ||
    readString(runtimeEvent, "model");
  const candidateCount = numberValue(
    decision.candidate_count ?? decision.candidateCount,
  );
  const selected = [provider, model].filter(Boolean).join("/");
  if (selected && candidateCount) {
    return `已从 ${candidateCount} 个候选中选择 ${selected}`;
  }
  if (selected) {
    return `已选择 ${selected}`;
  }
  if (candidateCount) {
    return `已找到 ${candidateCount} 个候选模型`;
  }
  return "";
}

function runtimeAssetLabel(event: Record<string, unknown>): string {
  const payload = recordValue(event, "payload");
  const artifact =
    recordValue(payload, "artifact") ??
    recordValue(readRuntimeEvent(event), "artifact");
  return (
    readString(event, "artifactRef") ||
    readString(payload, "artifactRef") ||
    readString(artifact, "file_path") ||
    readString(artifact, "filePath") ||
    readString(artifact, "kind") ||
    ""
  );
}

function evidenceLabel(event: Record<string, unknown>): string {
  const payload = recordValue(event, "payload");
  return (
    readString(event, "evidenceRef") ||
    readString(payload, "evidenceRef") ||
    readString(payload, "message") ||
    ""
  );
}

function statusTextFor(status: string): string {
  const normalized = String(status || "").toLowerCase();
  if (
    [
      "completed",
      "complete",
      "succeeded",
      "success",
      "done",
      "recorded",
      "verified",
    ].includes(normalized)
  ) {
    return "已完成";
  }
  if (["running", "streaming", "started", "thinking"].includes(normalized)) {
    return "正在执行";
  }
  if (["queued", "pending"].includes(normalized)) {
    return "等待中";
  }
  if (["failed", "failure", "error"].includes(normalized)) {
    return "执行失败";
  }
  if (["cancelled", "canceled"].includes(normalized)) {
    return "已中断";
  }
  return "已更新";
}

function formatMaybeJsonText(text: string): string {
  const parsed = parseJsonObject(String(text || "").trim());
  return parsed ? JSON.stringify(parsed, null, 2) : String(text || "");
}

function clipText(value: string, maxChars: number): string {
  const text = String(value || "");
  return text.length > maxChars
    ? `${text.slice(-maxChars)}\n…已截取最近输出`
    : text;
}
