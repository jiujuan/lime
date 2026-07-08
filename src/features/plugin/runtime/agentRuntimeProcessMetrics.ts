import type {
  PluginRuntimeProcessCost,
  PluginRuntimeProcessModel,
  PluginRuntimeProcessUsage,
} from "../types";
import {
  findFirstObjectByKeys,
  findFirstValueByKeys,
  isRecord,
  numberValue,
  optionalNumberValue,
  readRuntimeEvent,
  readRuntimeEventType,
  recordValue,
  stringValue,
} from "./agentRuntimeProcessAccess";

export function formatAgentRuntimeUsageText(
  usage: PluginRuntimeProcessUsage | null | undefined,
): string {
  if (!usage) {
    return "Token 等待回写";
  }
  const input = numberValue(usage.inputTokens ?? usage.input_tokens);
  const output = numberValue(usage.outputTokens ?? usage.output_tokens);
  const total =
    numberValue(usage.totalTokens ?? usage.total_tokens) || input + output;
  if (!input && !output && !total) {
    return "Token 等待回写";
  }
  return `${formatNumber(total)} tokens（输入 ${formatNumber(input)} / 输出 ${formatNumber(output)}）`;
}

export function formatAgentRuntimeCostText(
  cost: PluginRuntimeProcessCost | null | undefined,
): string {
  if (!cost) {
    return "费用等待回写";
  }
  const total = optionalNumberValue(
    cost.estimatedTotalCost ??
      cost.estimated_total_cost ??
      cost.totalCost ??
      cost.total_cost,
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

export function isTerminalProcess({
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
    snapshotRecord.taskStatus ??
      snapshotRecord.status ??
      taskRecord.status ??
      "",
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
    return /task:completed|task:error|task:cancelled|turn_completed|turn_failed|cancelled|已被中断|已完成/.test(
      `${type} ${message}`,
    );
  });
}

export function extractModelFromProcess(
  events: unknown[],
  task: unknown,
  snapshot: unknown,
): PluginRuntimeProcessModel {
  const values = [
    task,
    snapshot,
    recordValue(snapshot, "threadRead"),
    ...events,
    ...events.map(readRuntimeEvent),
  ];
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

export function extractUsageFromProcess(
  events: unknown[],
  snapshot: unknown,
  task: unknown,
): PluginRuntimeProcessUsage | null {
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

export function extractCostFromProcess(
  events: unknown[],
  snapshot: unknown,
  task: unknown,
): PluginRuntimeProcessCost | null {
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

export function extractUsageObject(
  value: unknown,
): PluginRuntimeProcessUsage | null {
  const usage = findFirstObjectByKeys(value, [
    "usage",
    "tokenUsage",
    "token_usage",
  ]);
  if (!usage) {
    return null;
  }
  const input = numberValue(usage.inputTokens ?? usage.input_tokens);
  const output = numberValue(usage.outputTokens ?? usage.output_tokens);
  const total =
    numberValue(usage.totalTokens ?? usage.total_tokens) || input + output;
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

export function extractCostState(
  value: unknown,
): PluginRuntimeProcessCost | null {
  const cost = findFirstObjectByKeys(value, [
    "cost_state",
    "costState",
    "cost",
  ]);
  if (!cost) {
    return null;
  }
  const estimatedTotalCost = optionalNumberValue(
    cost.estimatedTotalCost ??
      cost.estimated_total_cost ??
      cost.totalCost ??
      cost.total_cost,
  );
  const estimatedCostClass = stringValue(
    cost.estimatedCostClass ?? cost.estimated_cost_class,
  );
  const currency = stringValue(cost.currency);
  const totalTokens = optionalNumberValue(
    cost.totalTokens ?? cost.total_tokens,
  );
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

function estimateUsageFromProcess(
  events: unknown[],
  snapshot: unknown,
  task: unknown,
): PluginRuntimeProcessUsage | null {
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
    return /model|routing|tool|skill|artifact|completed|turn/i.test(surface);
  });
  if (
    !hasRuntimeSignal &&
    !isTerminalProcess({ task, snapshot, events, contract: null })
  ) {
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
    source: "plugin_runtime_process_estimate",
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}
