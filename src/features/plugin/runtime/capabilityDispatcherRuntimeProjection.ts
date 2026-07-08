import type {
  PluginRuntimeProcessModel,
  PluginRuntimeProcessUsage,
  PluginTaskRecord,
} from "../types";
import {
  isRecord,
  numberValue,
  readString,
  recordArray,
  recordBooleanByKeys,
  recordNumberByKeys,
  recordObjectByKeys,
  recordStringArrayByKeys,
  recordStringByKeys,
} from "./capabilityDispatcherRecord";
import type {
  RuntimeBudgetProjection,
  RuntimeCostProjection,
  RuntimeModelConstraintsProjection,
  RuntimeModelProjection,
  RuntimeSkillInvocationProjection,
  RuntimeSkillProjection,
  RuntimeTaskProjection,
  RuntimeUsageProjection,
  ToolIntegrationCapability,
} from "./capabilityDispatcherRuntimeTypes";

export const TOOL_INTEGRATION_SPECS: Record<
  ToolIntegrationCapability,
  {
    keywords: string[];
    toolHints: string[];
    reason: string;
  }
> = {
  "lime.search": {
    keywords: ["search", "websearch", "research", "deepresearch", "citation"],
    toolHints: ["lime.capability.research.search", "web_search"],
    reason: "search_execution_requires_lime_agent_task",
  },
  "lime.browser": {
    keywords: [
      "browser",
      "chrome",
      "webpage",
      "readpage",
      "screenshot",
      "navigate",
    ],
    toolHints: ["browser", "read_page", "screenshot"],
    reason: "browser_runtime_execution_requires_lime_tool_runtime_policy",
  },
  "lime.documents": {
    keywords: ["document", "pdf", "docx", "word", "markdown", "ppt", "pptx"],
    toolHints: ["document_parser", "pdf.read"],
    reason: "document_runtime_execution_requires_lime_tool_runtime_policy",
  },
  "lime.media": {
    keywords: [
      "media",
      "image",
      "audio",
      "voice",
      "video",
      "transcribe",
      "synthesize",
      "tts",
    ],
    toolHints: ["image_generation", "audio_transcription", "voice_synthesis"],
    reason: "media_runtime_execution_requires_lime_tool_runtime_policy",
  },
  "lime.mcp": {
    keywords: ["mcp", "mcpserver", "mcp__"],
    toolHints: ["mcp__server__tool"],
    reason: "mcp_execution_requires_lime_tool_runtime_policy",
  },
  "lime.terminal": {
    keywords: ["terminal", "shell", "command", "bash", "powershell", "cmd"],
    toolHints: ["terminal.run"],
    reason: "terminal_execution_requires_lime_sandbox_policy",
  },
  "lime.connectors": {
    keywords: ["connector", "connectors", "integration", "notion", "slack"],
    toolHints: ["connector.invoke"],
    reason: "connector_execution_requires_lime_policy_and_secret_binding",
  },
};

export function readTaskRuntimeProcess(task: PluginTaskRecord) {
  return task.runtimeProcess ?? task.process ?? null;
}

export function readTaskThreadRead(
  task: PluginTaskRecord,
): Record<string, unknown> | null {
  if (!isRecord(task.result)) {
    return null;
  }
  return isRecord(task.result.threadRead) ? task.result.threadRead : task.result;
}

function hasRoutedModel(
  model: PluginRuntimeProcessModel | null | undefined,
): model is PluginRuntimeProcessModel {
  if (!model) {
    return false;
  }
  return Boolean(model.provider || model.model);
}

export function sortTasksByNewest(
  tasks: PluginTaskRecord[],
): PluginTaskRecord[] {
  return [...tasks].sort((left, right) =>
    String(right.finishedAt ?? right.startedAt).localeCompare(
      String(left.finishedAt ?? left.startedAt),
    ),
  );
}

export function buildRuntimeTaskProjection(
  task: PluginTaskRecord,
): RuntimeTaskProjection {
  const threadRead = readTaskThreadRead(task);
  return {
    taskId: task.taskId,
    traceId: task.traceId,
    appId: task.appId,
    entryKey: task.entryKey,
    title: task.title,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    idempotencyKey: task.idempotencyKey,
    humanReview: task.humanReview,
    toolCount: task.tools.length,
    eventCount: task.events.length + task.trace.length,
    hasResult: task.result !== undefined,
    runtimeStatus: recordStringByKeys(threadRead, ["status", "profile_status"]),
    source: "app_server_runtime_projection",
  };
}

export function buildModelProjection(
  task: PluginTaskRecord,
): RuntimeModelProjection | null {
  const process = readTaskRuntimeProcess(task);
  if (!hasRoutedModel(process?.model)) {
    return null;
  }
  return {
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    model: process.model,
    constraints: buildRuntimeModelConstraints(task),
  };
}

function buildRuntimeModelConstraints(
  task: PluginTaskRecord,
): RuntimeModelConstraintsProjection | undefined {
  const threadRead = readTaskThreadRead(task);
  const routing = recordObjectByKeys(threadRead, [
    "modelRouting",
    "model_routing",
    "routingDecision",
    "routing_decision",
  ]);
  const limitState = recordObjectByKeys(threadRead, [
    "limitState",
    "limit_state",
  ]);
  const costState = recordObjectByKeys(threadRead, ["costState", "cost_state"]);
  if (!routing && !limitState && !costState) {
    return undefined;
  }
  return {
    selectedProvider: recordStringByKeys(routing, [
      "selectedProvider",
      "selected_provider",
    ]),
    selectedModel: recordStringByKeys(routing, [
      "selectedModel",
      "selected_model",
    ]),
    requestedModel: recordStringByKeys(routing, [
      "requestedModel",
      "requested_model",
    ]),
    routingMode: recordStringByKeys(routing, ["routingMode", "routing_mode"]),
    decisionSource: recordStringByKeys(routing, [
      "decisionSource",
      "decision_source",
    ]),
    decisionReason: recordStringByKeys(routing, [
      "decisionReason",
      "decision_reason",
    ]),
    candidateCount:
      recordNumberByKeys(routing, ["candidateCount", "candidate_count"]) ??
      recordNumberByKeys(limitState, ["candidateCount", "candidate_count"]),
    fallbackChain: recordStringArrayByKeys(routing, [
      "fallbackChain",
      "fallback_chain",
    ]),
    capabilityGap:
      recordStringByKeys(routing, ["capabilityGap", "capability_gap"]) ??
      recordStringByKeys(limitState, ["capabilityGap", "capability_gap"]),
    estimatedCostClass:
      recordStringByKeys(routing, [
        "estimatedCostClass",
        "estimated_cost_class",
      ]) ??
      recordStringByKeys(costState, [
        "estimatedCostClass",
        "estimated_cost_class",
      ]),
    limitStatus: recordStringByKeys(limitState, ["status"]),
    costStatus: recordStringByKeys(costState, ["status"]),
    singleCandidateOnly: recordBooleanByKeys(limitState, [
      "singleCandidateOnly",
      "single_candidate_only",
    ]),
    providerLocked: recordBooleanByKeys(limitState, [
      "providerLocked",
      "provider_locked",
    ]),
    settingsLocked: recordBooleanByKeys(limitState, [
      "settingsLocked",
      "settings_locked",
    ]),
    oemLocked: recordBooleanByKeys(limitState, ["oemLocked", "oem_locked"]),
    inputPerMillion: recordNumberByKeys(costState, [
      "inputPerMillion",
      "input_per_million",
    ]),
    outputPerMillion: recordNumberByKeys(costState, [
      "outputPerMillion",
      "output_per_million",
    ]),
    cacheReadPerMillion: recordNumberByKeys(costState, [
      "cacheReadPerMillion",
      "cache_read_per_million",
    ]),
    cacheWritePerMillion: recordNumberByKeys(costState, [
      "cacheWritePerMillion",
      "cache_write_per_million",
    ]),
    currency: recordStringByKeys(costState, ["currency"]),
    source: "app_server_runtime_model_constraints",
  };
}

export function buildUsageProjection(
  task: PluginTaskRecord,
): RuntimeUsageProjection | null {
  const process = readTaskRuntimeProcess(task);
  if (!process?.usage) {
    return null;
  }
  return {
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    usage: process.usage,
    model: process.model,
  };
}

export function buildCostProjection(
  task: PluginTaskRecord,
): RuntimeCostProjection | null {
  const process = readTaskRuntimeProcess(task);
  if (!process?.cost) {
    return null;
  }
  return {
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    cost: process.cost,
    model: process.model,
  };
}

export function buildBudgetProjection(
  task: PluginTaskRecord,
): RuntimeBudgetProjection | null {
  const threadRead = readTaskThreadRead(task);
  const limitState = recordObjectByKeys(threadRead, [
    "limitState",
    "limit_state",
  ]);
  const costState = recordObjectByKeys(threadRead, ["costState", "cost_state"]);
  if (!limitState && !costState) {
    return null;
  }
  const processCost = readTaskRuntimeProcess(task)?.cost;
  return {
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    scope: "task",
    limitStatus: recordStringByKeys(limitState, ["status"]),
    costStatus: recordStringByKeys(costState, ["status"]),
    estimatedCostClass:
      recordStringByKeys(costState, [
        "estimatedCostClass",
        "estimated_cost_class",
      ]) ?? processCost?.estimatedCostClass,
    estimatedTotalCost:
      recordNumberByKeys(costState, [
        "estimatedTotalCost",
        "estimated_total_cost",
      ]) ?? processCost?.estimatedTotalCost,
    currency:
      recordStringByKeys(costState, ["currency"]) ?? processCost?.currency,
    candidateCount: recordNumberByKeys(limitState, [
      "candidateCount",
      "candidate_count",
    ]),
    singleCandidateOnly: recordBooleanByKeys(limitState, [
      "singleCandidateOnly",
      "single_candidate_only",
    ]),
    providerLocked: recordBooleanByKeys(limitState, [
      "providerLocked",
      "provider_locked",
    ]),
    settingsLocked: recordBooleanByKeys(limitState, [
      "settingsLocked",
      "settings_locked",
    ]),
    oemLocked: recordBooleanByKeys(limitState, ["oemLocked", "oem_locked"]),
    capabilityGap: recordStringByKeys(limitState, [
      "capabilityGap",
      "capability_gap",
    ]),
    notes: recordStringArrayByKeys(limitState, ["notes"]),
    limitState: limitState ?? undefined,
    costState: costState ?? undefined,
    source: "app_server_runtime_projection",
  };
}

export function aggregateUsage(
  items: RuntimeUsageProjection[],
): PluginRuntimeProcessUsage {
  return items.reduce<PluginRuntimeProcessUsage>(
    (total, item) => ({
      inputTokens:
        total.inputTokens +
        (numberValue(item.usage.inputTokens ?? item.usage.input_tokens) ?? 0),
      outputTokens:
        total.outputTokens +
        (numberValue(item.usage.outputTokens ?? item.usage.output_tokens) ?? 0),
      totalTokens:
        total.totalTokens +
        (numberValue(item.usage.totalTokens ?? item.usage.total_tokens) ?? 0),
      cachedInputTokens:
        (total.cachedInputTokens ?? 0) +
        (numberValue(
          item.usage.cachedInputTokens ?? item.usage.cached_input_tokens,
        ) ?? 0),
      cacheCreationInputTokens:
        (total.cacheCreationInputTokens ?? 0) +
        (numberValue(
          item.usage.cacheCreationInputTokens ??
            item.usage.cache_creation_input_tokens,
        ) ?? 0),
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
  );
}

export function aggregateCost(items: RuntimeCostProjection[]) {
  const costs = items
    .map((item) =>
      numberValue(
        item.cost.estimatedTotalCost ??
          item.cost.estimated_total_cost ??
          item.cost.totalCost ??
          item.cost.total_cost,
      ),
    )
    .filter((value): value is number => value !== undefined);
  return {
    estimatedTotalCost: costs.reduce((total, value) => total + value, 0),
    currency: readString(items[0]?.cost.currency) ?? "unknown",
  };
}

export function uniqueModelSummaries(items: RuntimeModelProjection[]) {
  const summaries = new Map<
    string,
    PluginRuntimeProcessModel & {
      taskCount: number;
      taskKinds: string[];
      lastTaskId: string;
      lastSeenAt: string;
      constraints?: RuntimeModelConstraintsProjection;
    }
  >();
  items.forEach((item) => {
    const key = `${item.model.provider}\u0000${item.model.model}\u0000${item.model.label}`;
    const existing = summaries.get(key);
    if (existing) {
      existing.taskCount += 1;
      existing.taskKinds = Array.from(
        new Set([...existing.taskKinds, item.taskKind]),
      ).sort();
      if (String(item.finishedAt ?? item.startedAt) > existing.lastSeenAt) {
        existing.lastTaskId = item.taskId;
        existing.lastSeenAt = String(item.finishedAt ?? item.startedAt);
        existing.constraints = item.constraints ?? existing.constraints;
      }
      return;
    }
    summaries.set(key, {
      ...item.model,
      taskCount: 1,
      taskKinds: [item.taskKind],
      lastTaskId: item.taskId,
      lastSeenAt: String(item.finishedAt ?? item.startedAt),
      constraints: item.constraints,
    });
  });
  return Array.from(summaries.values()).sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

function normalizeSkillName(value: string): string {
  return value.trim();
}

export function buildRuntimeSkillProjection(
  tasks: PluginTaskRecord[],
): RuntimeSkillProjection[] {
  const summaries = new Map<string, RuntimeSkillProjection>();
  tasks.forEach((task) => {
    const process = readTaskRuntimeProcess(task);
    const declared = new Set(
      (process?.skillNames ?? []).map(normalizeSkillName).filter(Boolean),
    );
    const invoked = new Set(
      (process?.invokedSkillNames ?? [])
        .map(normalizeSkillName)
        .filter(Boolean),
    );
    new Set([...declared, ...invoked]).forEach((name) => {
      const existing = summaries.get(name);
      const lastSeenAt = String(task.finishedAt ?? task.startedAt);
      const status = invoked.has(name) ? "invoked" : "declared";
      if (existing) {
        existing.taskCount += 1;
        existing.invocationCount += invoked.has(name) ? 1 : 0;
        existing.status =
          existing.status === "invoked" || status === "invoked"
            ? "invoked"
            : "declared";
        existing.taskIds = Array.from(
          new Set([...existing.taskIds, task.taskId]),
        );
        existing.taskKinds = Array.from(
          new Set([...existing.taskKinds, task.taskKind]),
        ).sort();
        if (lastSeenAt > existing.lastSeenAt) {
          existing.lastSeenAt = lastSeenAt;
        }
        return;
      }
      summaries.set(name, {
        skillId: name,
        name,
        status,
        taskCount: 1,
        invocationCount: invoked.has(name) ? 1 : 0,
        taskIds: [task.taskId],
        taskKinds: [task.taskKind],
        lastSeenAt,
        source: "app_server_runtime_process",
      });
    });
    collectWorkspaceSkillBindingRecords(task).forEach((binding) => {
      const directory = recordStringByKeys(binding, ["directory"]);
      const name =
        recordStringByKeys(binding, ["name"]) ??
        recordStringByKeys(binding, ["key"]) ??
        directory;
      if (!name) {
        return;
      }
      const skillId = recordStringByKeys(binding, ["key"]) ?? name;
      const lastSeenAt = String(task.finishedAt ?? task.startedAt);
      const bindingStatus =
        recordStringByKeys(binding, ["binding_status", "bindingStatus"]) ??
        "ready_for_manual_enable";
      const status =
        bindingStatus === "blocked" ? "blocked" : "ready_for_manual_enable";
      const existing = summaries.get(skillId);
      if (existing) {
        existing.taskIds = Array.from(
          new Set([...existing.taskIds, task.taskId]),
        );
        existing.taskKinds = Array.from(
          new Set([...existing.taskKinds, task.taskKind]),
        ).sort();
        existing.taskCount = existing.taskIds.length;
        if (lastSeenAt > existing.lastSeenAt) {
          existing.lastSeenAt = lastSeenAt;
        }
        return;
      }
      summaries.set(skillId, {
        skillId,
        name,
        status,
        taskCount: 1,
        invocationCount: 0,
        taskIds: [task.taskId],
        taskKinds: [task.taskKind],
        lastSeenAt,
        source: "workspace_skill_binding",
        description: recordStringByKeys(binding, ["description"]),
        directory,
        bindingStatus,
        nextGate: recordStringByKeys(binding, ["next_gate", "nextGate"]),
        runtimeGate: recordStringByKeys(binding, [
          "runtime_gate",
          "runtimeGate",
        ]),
        queryLoopVisible: recordBooleanByKeys(binding, [
          "query_loop_visible",
          "queryLoopVisible",
        ]),
        toolRuntimeVisible: recordBooleanByKeys(binding, [
          "tool_runtime_visible",
          "toolRuntimeVisible",
        ]),
        launchEnabled: recordBooleanByKeys(binding, [
          "launch_enabled",
          "launchEnabled",
        ]),
        permissionSummary: recordStringArrayByKeys(binding, [
          "permission_summary",
          "permissionSummary",
        ]),
      });
    });
  });
  return Array.from(summaries.values()).sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

function collectWorkspaceSkillBindingRecords(
  task: PluginTaskRecord,
): Record<string, unknown>[] {
  const threadRead = readTaskThreadRead(task);
  const candidates = [
    threadRead,
    recordObjectByKeys(threadRead, ["request_metadata", "requestMetadata"]),
    ...recordArray(threadRead, "turns")
      .filter(isRecord)
      .flatMap((turn) => [
        turn,
        recordObjectByKeys(turn, ["request_metadata", "requestMetadata"]),
      ]),
  ];
  return candidates.flatMap((candidate) => {
    const container = recordObjectByKeys(candidate, [
      "workspace_skill_bindings",
      "workspaceSkillBindings",
    ]);
    return recordArray(container, "bindings").filter(isRecord);
  });
}

export function buildRuntimeSkillInvocations(
  tasks: PluginTaskRecord[],
): RuntimeSkillInvocationProjection[] {
  return tasks.flatMap((task) => {
    const process = readTaskRuntimeProcess(task);
    return (process?.invokedSkillNames ?? [])
      .map(normalizeSkillName)
      .filter(Boolean)
      .map((name) => ({
        invocationId: `${task.taskId}:${name}`,
        skillId: name,
        name,
        taskId: task.taskId,
        taskKind: task.taskKind,
        status: task.status,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        source: "app_server_runtime_process" as const,
      }));
  });
}
