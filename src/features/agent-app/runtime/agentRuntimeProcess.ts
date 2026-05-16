import type {
  AgentAppRuntimeProcessCost,
  AgentAppRuntimeProcessModel,
  AgentAppRuntimeProcessTimelineItem,
  AgentAppRuntimeProcessUsage,
  AgentAppRuntimeProcessView,
} from "../types";

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
}: BuildAgentRuntimeProcessViewOptions = {}): AgentAppRuntimeProcessView {
  const safeEvents = Array.isArray(events) ? events : [];
  const timeline = buildTimelineItems(safeEvents);
  const invokedSkillNames = uniqueTextValues(
    safeEvents.map(extractSkillNameFromEvent),
  );
  const taskRecord = isRecord(task) ? task : null;
  const resolvedExpectedOutput =
    expectedOutput ?? (taskRecord ? taskRecord.expectedOutput : undefined);
  const resolvedLastInput = lastInput ?? (taskRecord ? taskRecord.input : undefined);
  const skillNames = uniqueTextValues([
    ...collectRequiredSkillNames(task),
    ...collectRequiredSkillNames(resolvedLastInput),
    ...collectRequiredSkillNames(resolvedExpectedOutput),
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
): AgentAppRuntimeProcessTimelineItem | null {
  if (!isRecord(event)) {
    return null;
  }

  const stream = readStreamEvent(event);
  if (stream?.text) {
    const config =
      {
        thinking: ["thinking", "思考过程", "流式思考"],
        assistant_text: ["output", "成稿流式输出", "生成中"],
        tool_input: ["execution", "执行参数流", "输入中"],
        tool_output: ["execution", "执行结果流", "输出中"],
      }[stream.kind] ?? ["progress", "运行片段", "更新中"];
    return {
      kind: config[0] as AgentAppRuntimeProcessTimelineItem["kind"],
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
    readString(event, "status") || readString(recordValue(event, "payload"), "status"),
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
  if (/routing|candidate|model_change/.test(runtimeType) || /routing/.test(message)) {
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
  if (eventType.includes("evidence") || /evidence|verification/i.test(runtimeType)) {
    return {
      kind: "artifact",
      title: "证据记录",
      statusText,
      message: evidenceLabel(event) || message,
      detail,
    };
  }
  if (/missing|blocked|review|action_required|actionrequired/i.test(runtimeSurface)) {
    return {
      kind: "blocked",
      title: "等待确认",
      statusText,
      message: normalizeConfirmationMessage(message),
      detail,
    };
  }
  if (/failed|failure|error|incident|warning|cancel/.test(runtimeSurface.toLowerCase())) {
    return {
      kind: "warning",
      title: "运行提醒",
      statusText,
      message,
      detail,
    };
  }
  if (/completed|complete|done|final_done|turn_completed|turncompleted/.test(runtimeSurface.toLowerCase())) {
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
  if (/streamTask|getTask|agent-app-runtime/i.test(message)) {
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

export function formatAgentRuntimeUsageText(
  usage: AgentAppRuntimeProcessUsage | null | undefined,
): string {
  if (!usage) {
    return "Token 等待回写";
  }
  const input = numberValue(usage.inputTokens ?? usage.input_tokens);
  const output = numberValue(usage.outputTokens ?? usage.output_tokens);
  const total = numberValue(usage.totalTokens ?? usage.total_tokens) || input + output;
  if (!input && !output && !total) {
    return "Token 等待回写";
  }
  return `${formatNumber(total)} tokens（输入 ${formatNumber(input)} / 输出 ${formatNumber(output)}）`;
}

export function formatAgentRuntimeCostText(
  cost: AgentAppRuntimeProcessCost | null | undefined,
): string {
  if (!cost) {
    return "费用等待回写";
  }
  const total = optionalNumberValue(
    cost.estimatedTotalCost ?? cost.estimated_total_cost ?? cost.totalCost ?? cost.total_cost,
  );
  const costClass = stringValue(
    cost.estimatedCostClass ?? cost.estimated_cost_class,
  );
  const currency = stringValue(cost.currency) || "USD";
  if (total !== undefined) {
    return `${currency} ${total.toFixed(total < 0.01 ? 4 : 2)}`;
  }
  if (costClass) {
    return `预估等级：${costClass}`;
  }
  return "费用等待回写";
}

function buildTimelineItems(events: unknown[]): AgentAppRuntimeProcessTimelineItem[] {
  const items: AgentAppRuntimeProcessTimelineItem[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const item = normalizeAgentRuntimeProcessTimelineItem(event);
    if (!item) {
      continue;
    }
    const signature = [
      item.kind,
      item.title,
      item.statusText,
      item.message,
      item.detail,
      item.meta,
      item.collapseKey,
    ].join("|");
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    items.push(item);
  }
  return items;
}

function collectStream(events: unknown[], targetKind: AgentRuntimeStreamKind): string {
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
      Boolean(item && ["tool_input", "tool_output"].includes(item.kind) && item.text),
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
  if (streamKind === "tool_output_delta" || runtimeType === "tool_output_delta") {
    return { ...base, kind: "tool_output" };
  }
  if (event.eventType === ["task", `partial${"Art"}ifact`].join(":")) {
    return { ...base, kind: "assistant_text" };
  }
  return null;
}

function isTerminalProcess({
  task,
  snapshot,
  events,
  contract,
}: {
  task: unknown;
  snapshot: unknown;
  events: unknown[];
  contract: unknown;
}): boolean {
  if (isRecord(contract) && contract.ok === true) {
    return true;
  }
  const taskRecord = isRecord(task) ? task : {};
  const snapshotRecord = isRecord(snapshot) ? snapshot : {};
  const status = String(
    snapshotRecord.taskStatus ?? snapshotRecord.status ?? taskRecord.status ?? "",
  ).toLowerCase();
  if (
    [
      "succeeded",
      "success",
      "completed",
      "complete",
      "failed",
      "failure",
      "error",
      "cancelled",
      "canceled",
    ].includes(status)
  ) {
    return true;
  }
  return events.some((event) => {
    if (!isRecord(event)) {
      return false;
    }
    const type = String(
      event.eventType ?? event.type ?? readRuntimeEventType(event) ?? "",
    ).toLowerCase();
    const message = String(event.message ?? "").toLowerCase();
    return /task:completed|task:error|task:cancelled|final_done|turn_completed|turn_failed|cancelled|已被中断|已完成/.test(
      `${type} ${message}`,
    );
  });
}

function extractModelFromProcess(
  events: unknown[],
  task: unknown,
  snapshot: unknown,
): AgentAppRuntimeProcessModel {
  const values = [task, snapshot, recordValue(snapshot, "threadRead"), ...events, ...events.map(readRuntimeEvent)];
  for (const value of values) {
    const decision = findFirstObjectByKeys(value, [
      "routing_decision",
      "routingDecision",
      "model_routing",
      "modelRouting",
      "provider_routing",
      "providerRouting",
    ]);
    const target = decision ?? (isRecord(value) ? value : null);
    if (!target) {
      continue;
    }
    const provider = stringValue(
      findFirstValueByKeys(target, [
        "selected_provider",
        "selectedProvider",
        "provider",
        "providerName",
      ]),
    );
    const model = stringValue(
      findFirstValueByKeys(target, [
        "selected_model",
        "selectedModel",
        "model",
        "modelName",
        "model_name",
      ]),
    );
    if (provider || model) {
      return {
        provider,
        model,
        label: [provider, model].filter(Boolean).join("/") || "自动选择",
      };
    }
  }
  return { provider: "", model: "", label: "模型等待路由" };
}

function extractUsageFromProcess(
  events: unknown[],
  snapshot: unknown,
  task: unknown,
): AgentAppRuntimeProcessUsage | null {
  for (const value of [
    task,
    snapshot,
    recordValue(snapshot, "threadRead"),
    ...events.map(readRuntimeEvent),
    ...events,
  ]) {
    const usage = extractUsageObject(value);
    if (usage) {
      return usage;
    }
  }
  return estimateUsageFromProcess(events, snapshot, task);
}

function extractCostFromProcess(
  events: unknown[],
  snapshot: unknown,
  task: unknown,
): AgentAppRuntimeProcessCost | null {
  for (const value of [
    task,
    snapshot,
    recordValue(snapshot, "threadRead"),
    ...events.map(readRuntimeEvent),
    ...events,
  ]) {
    const cost = extractCostState(value);
    if (cost) {
      return cost;
    }
  }
  return null;
}

function extractUsageObject(value: unknown): AgentAppRuntimeProcessUsage | null {
  const usage = findFirstObjectByKeys(value, ["usage", "tokenUsage", "token_usage"]);
  if (!usage) {
    return null;
  }
  const input = numberValue(usage.inputTokens ?? usage.input_tokens);
  const output = numberValue(usage.outputTokens ?? usage.output_tokens);
  const total = numberValue(usage.totalTokens ?? usage.total_tokens) || input + output;
  const cachedInputTokens = optionalNumberValue(
    usage.cachedInputTokens ?? usage.cached_input_tokens,
  );
  const cacheCreationInputTokens = optionalNumberValue(
    usage.cacheCreationInputTokens ?? usage.cache_creation_input_tokens,
  );
  if (!input && !output && !total && cachedInputTokens === undefined) {
    return null;
  }
  return {
    ...usage,
    inputTokens: input,
    outputTokens: output,
    totalTokens: total,
    cachedInputTokens,
    cacheCreationInputTokens,
  };
}

function estimateUsageFromProcess(
  events: unknown[],
  snapshot: unknown,
  task: unknown,
): AgentAppRuntimeProcessUsage | null {
  const hasRuntimeSignal = events.some((event) => {
    if (!isRecord(event)) {
      return false;
    }
    const surface = [
      event.eventType,
      event.type,
      event.message,
      event.toolName,
      readRuntimeEventType(event),
    ]
      .filter(Boolean)
      .join(" ");
    return /model|routing|tool|skill|artifact|completed|final_done|turn/i.test(surface);
  });
  if (!hasRuntimeSignal && !isTerminalProcess({ task, snapshot, events, contract: null })) {
    return null;
  }

  const inputTokens = estimateTokenCountFromValue([
    recordValue(task, "input"),
    recordValue(task, "expectedOutput"),
    recordValue(snapshot, "threadRead")?.turns,
  ]);
  const outputTokens = estimateTokenCountFromValue([
    ...events.map((event) =>
      isRecord(event)
        ? {
            message: event.message,
            payload: event.payload,
            runtimeEvent: readRuntimeEvent(event),
          }
        : event,
    ),
  ]);
  const totalTokens = inputTokens + outputTokens;
  if (totalTokens <= 0) {
    return null;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimated: true,
    source: "agent_app_runtime_process_estimate",
  };
}

function estimateTokenCountFromValue(value: unknown): number {
  const text =
    typeof value === "string" ? value : (JSON.stringify(value ?? "") ?? "");
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return 0;
  }
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function extractCostState(value: unknown): AgentAppRuntimeProcessCost | null {
  const cost = findFirstObjectByKeys(value, ["cost_state", "costState", "cost"]);
  if (!cost) {
    return null;
  }
  const estimatedTotalCost = optionalNumberValue(
    cost.estimatedTotalCost ?? cost.estimated_total_cost ?? cost.totalCost ?? cost.total_cost,
  );
  const estimatedCostClass = stringValue(
    cost.estimatedCostClass ?? cost.estimated_cost_class,
  );
  const currency = stringValue(cost.currency);
  const totalTokens = optionalNumberValue(cost.totalTokens ?? cost.total_tokens);
  if (
    estimatedTotalCost === undefined &&
    !estimatedCostClass &&
    totalTokens === undefined
  ) {
    return null;
  }
  return {
    ...cost,
    estimatedTotalCost,
    estimatedCostClass,
    currency,
  };
}

function collectRequiredSkillNames(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  return uniqueTextValues([
    ...collectSkillNamesFromList(value.requiredSkills),
    ...collectSkillNamesFromList(value.skills),
    ...collectSkillNamesFromList(value.skillRefs),
    ...collectSkillNamesFromList(recordValue(value, "skillContract")?.requiredSkills),
    ...collectSkillNamesFromList(recordValue(recordValue(value, "input"), "agentTaskContract")?.requiredSkills),
    ...collectSkillNamesFromList(recordValue(value, "expectedOutput")?.requiredSkills),
    ...collectSkillNamesFromList(recordValue(recordValue(value, "expectedOutput"), "skillContract")?.requiredSkills),
    ...collectSkillNamesFromList(recordValue(recordValue(value, "metadata"), "contentFactory")?.skillRefs),
    ...collectSkillNamesFromList(recordValue(recordValue(recordValue(value, "metadata"), "contentFactory"), "skillContract")?.requiredSkills),
  ]);
}

function collectSkillNamesFromList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (!isRecord(item)) {
        return "";
      }
      return String(
        item.skill ?? item.skillName ?? item.skill_name ?? item.id ?? item.name ?? "",
      );
    })
    .filter(Boolean);
}

function extractToolNameFromEvent(event: unknown): string {
  if (!isRecord(event)) {
    return "";
  }
  const payload = recordValue(event, "payload");
  const runtimeEvent = readRuntimeEvent(event);
  return (
    readString(event, "toolName") ||
    readString(event, "tool_name") ||
    readString(payload, "toolName") ||
    readString(payload, "tool_name") ||
    readString(runtimeEvent, "toolName") ||
    readString(runtimeEvent, "tool_name") ||
    stringValue(findFirstValueByKeys(runtimeEvent, ["toolName", "tool_name", "name"])) ||
    ""
  );
}

function extractSkillNameFromEvent(event: unknown): string {
  if (!isRecord(event)) {
    return "";
  }
  const payload = recordValue(event, "payload");
  const runtimeEvent = readRuntimeEvent(event);
  const toolName = extractToolNameFromEvent(event);
  return normalizeSkillNameCandidate(
    extractSkillNameFromToolName(toolName) ||
      stringValue(findFirstValueByKeys(event, ["skillName", "skill_name", "command_name"])) ||
      extractSkillNameFromArguments(readUnknown(runtimeEvent, "arguments")) ||
      extractSkillNameFromArguments(readUnknown(runtimeEvent, "accumulated_arguments")) ||
      extractSkillNameFromArguments(readUnknown(runtimeEvent, "accumulatedArguments")) ||
      extractSkillNameFromArguments(readUnknown(payload, "arguments")) ||
      extractSkillNameFromArguments(readUnknown(payload, "args")) ||
      extractSkillNameFromArguments(readUnknown(event, "arguments")) ||
      extractSkillNameFromText(readString(runtimeEvent, "arguments")) ||
      extractSkillNameFromText(readString(runtimeEvent, "accumulated_arguments")) ||
      extractSkillNameFromText(readString(runtimeEvent, "accumulatedArguments")) ||
      extractSkillNameFromText(readString(payload, "delta")) ||
      extractSkillNameFromText(readString(event, "message")),
  );
}

function extractSkillNameFromToolName(toolName: string): string {
  const match = String(toolName || "").match(/^Skill\(([^)]+)\)$/i);
  return match?.[1] ?? "";
}

function extractSkillNameFromText(text: string): string {
  const value = String(text || "").trim();
  if (!value) {
    return "";
  }
  const parsed = parseJsonObject(value);
  if (parsed) {
    return stringValue(
      findFirstValueByKeys(parsed, ["skill", "skillName", "skill_name", "command_name"]),
    );
  }
  const match = value.match(
    /["']?(?:skill|skillName|skill_name|command_name)["']?\s*[:=]\s*["']?([@A-Za-z0-9_:/.-]+)/,
  );
  return match?.[1] ?? "";
}

function extractSkillNameFromArguments(value: unknown): string {
  if (typeof value === "string") {
    return extractSkillNameFromText(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const skillName = extractSkillNameFromArguments(item);
      if (skillName) {
        return skillName;
      }
    }
    return "";
  }
  if (!isRecord(value)) {
    return "";
  }
  return stringValue(
    findFirstValueByKeys(value, ["skill", "skillName", "skill_name", "command_name"], 3),
  );
}

function normalizeSkillNameCandidate(value: string): string {
  const text = String(value || "").trim();
  if (!text || /^Skill$/i.test(text)) {
    return "";
  }
  return /^[\w@:/.-]+$/.test(text) ? text : "";
}

function formatToolTitle(toolName: string, skillName: string): string {
  const name = formatToolName(toolName, skillName);
  if (skillName || /^Skill/i.test(String(toolName || ""))) {
    return `Skill · ${skillName || "待解析名称"}`;
  }
  if (/ToolSearch/i.test(name)) {
    return `检索工具 · ${name}`;
  }
  if (/Bash|Shell|Command/i.test(name)) {
    return `本地执行 · ${name}`;
  }
  if (/^Agent|SubAgent|Team/i.test(name)) {
    return `子任务 · ${name}`;
  }
  return `工具 · ${name || "未命名"}`;
}

function formatToolName(toolName: string, skillName: string): string {
  if (skillName && /^Skill/i.test(String(toolName || ""))) {
    return skillName;
  }
  return String(toolName || "").trim();
}

function normalizeToolMessage(message: string, statusText: string): string {
  const text = String(message || "").trim();
  if (!text || /^工具\s+\S+\s+(running|completed|failed|started)$/i.test(text)) {
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
    findFirstObjectByKeys(runtimeEvent, ["routing_decision", "routingDecision"]) ??
    runtimeEvent;
  const provider =
    readString(decision, "selected_provider") || readString(decision, "selectedProvider");
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
  const artifact = recordValue(payload, "artifact") ?? recordValue(readRuntimeEvent(event), "artifact");
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
  if (["completed", "complete", "succeeded", "success", "done", "recorded", "verified"].includes(normalized)) {
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

function readRuntimeEvent(event: unknown): Record<string, unknown> {
  if (!isRecord(event)) {
    return {};
  }
  if (isRecord(event.runtimeEvent)) {
    return event.runtimeEvent;
  }
  const payload = recordValue(event, "payload");
  if (isRecord(payload?.runtimeEvent)) {
    return payload.runtimeEvent;
  }
  if (isRecord(payload?.profileEvent)) {
    return payload.profileEvent;
  }
  return {};
}

function readRuntimeEventType(
  event: unknown,
  runtimeEvent: Record<string, unknown> = readRuntimeEvent(event),
): string {
  return String(
    readString(runtimeEvent, "type") ||
      readString(runtimeEvent, "event_type") ||
      readString(runtimeEvent, "eventType") ||
      (isRecord(event) ? readString(event, "eventType") || readString(event, "type") : "") ||
      "",
  ).toLowerCase();
}

function findFirstObjectByKeys(
  value: unknown,
  keys: string[],
  depth = 6,
): Record<string, unknown> | null {
  const found = findFirstValueByKeys(value, keys, depth);
  return isRecord(found) ? found : null;
}

function findFirstValueByKeys(value: unknown, keys: string[], depth = 6): unknown {
  if (depth < 0) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstValueByKeys(item, keys, depth - 1);
      if (found !== undefined && found !== null && found !== "") {
        return found;
      }
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  for (const key of keys) {
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return candidate;
    }
  }
  for (const child of Object.values(value)) {
    const found = findFirstValueByKeys(child, keys, depth - 1);
    if (found !== undefined && found !== null && found !== "") {
      return found;
    }
  }
  return undefined;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatMaybeJsonText(text: string): string {
  const parsed = parseJsonObject(String(text || "").trim());
  return parsed ? JSON.stringify(parsed, null, 2) : String(text || "");
}

function clipText(value: string, maxChars: number): string {
  const text = String(value || "");
  return text.length > maxChars ? `${text.slice(-maxChars)}\n…已截取最近输出` : text;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function uniqueTextValues(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

function optionalNumberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function numberValue(value: unknown): number {
  return optionalNumberValue(value) ?? 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readString(value: unknown, key: string): string {
  if (!isRecord(value)) {
    return "";
  }
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : "";
}

function readUnknown(value: unknown, key: string): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  return value[key];
}

function recordValue(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return isRecord(value[key]) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
