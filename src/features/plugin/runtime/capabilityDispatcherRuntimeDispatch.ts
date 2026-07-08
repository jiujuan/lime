import type { CapabilityHost } from "../sdk/CapabilityHost";
import type { PluginTaskRecord } from "../types";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import {
  buildRuntimeContextProjection,
  buildRuntimeMemoryProjection,
} from "./capabilityDispatcherContextProjection";
import { PluginCapabilityDispatcherError } from "./capabilityDispatcherError";
import {
  recordNumberByKeys,
  readString,
} from "./capabilityDispatcherRecord";
import {
  aggregateCost,
  aggregateUsage,
  buildBudgetProjection,
  buildCostProjection,
  buildModelProjection,
  buildRuntimeSkillInvocations,
  buildRuntimeSkillProjection,
  buildRuntimeTaskProjection,
  buildUsageProjection,
  sortTasksByNewest,
  uniqueModelSummaries,
} from "./capabilityDispatcherRuntimeProjection";
import type {
  RuntimeBudgetProjection,
  RuntimeCostProjection,
  RuntimeModelProjection,
  RuntimeUsageProjection,
} from "./capabilityDispatcherRuntimeTypes";
import {
  readOptionalInputRecord,
  readOptionalStringParam,
  readStringParam,
} from "./capabilityDispatcherRequestInput";

function throwUnsupportedRuntimeMethod(
  request: PluginHostBridgeCapabilityRequest,
): never {
  throw new PluginCapabilityDispatcherError(
    "UNSUPPORTED_CAPABILITY_METHOD",
    `${request.capability}.${request.method} is not supported by Plugin Host Bridge.`,
  );
}

export function filterRuntimeProjectionTasks(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
): PluginTaskRecord[] {
  const input = readOptionalInputRecord(request);
  const taskId =
    readString(input.taskId) ?? readOptionalStringParam(request, "taskId", 0);
  const taskKind = readString(input.taskKind);
  return sortTasksByNewest(
    host
      .getTasks({
        appId: request.appId,
        entryKey: request.entryKey,
      })
      .filter((task) => !taskId || task.taskId === taskId)
      .filter((task) => !taskKind || task.taskKind === taskKind),
  );
}

export function dispatchModels(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
): unknown {
  const tasks = filterRuntimeProjectionTasks(host, request);
  const routedTasks = tasks
    .map(buildModelProjection)
    .filter((item): item is RuntimeModelProjection => Boolean(item));
  if (request.method === "list") {
    return {
      appId: request.appId,
      source: "app_server_runtime_projection",
      taskCount: tasks.length,
      models: uniqueModelSummaries(routedTasks),
    };
  }
  if (request.method === "getRouting") {
    return {
      appId: request.appId,
      source: "app_server_runtime_projection",
      taskCount: tasks.length,
      routes: routedTasks,
    };
  }
  if (request.method === "select") {
    const selected = routedTasks[0];
    return selected
      ? {
          status: "selected",
          source: "latest_runtime_projection",
          selected,
        }
      : {
          status: "unavailable",
          source: "latest_runtime_projection",
          reason: "no_runtime_routing_facts",
        };
  }
  if (request.method === "estimateCost") {
    const costs = tasks
      .map(buildCostProjection)
      .filter((item): item is RuntimeCostProjection => Boolean(item));
    return {
      appId: request.appId,
      status: costs.length
        ? "estimated_from_runtime_projection"
        : "insufficient_data",
      source: "app_server_runtime_projection",
      sampleSize: costs.length,
      cost: aggregateCost(costs),
    };
  }
  throwUnsupportedRuntimeMethod(request);
}

export function dispatchSkills(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const skills = buildRuntimeSkillProjection(tasks);
  if (request.method === "list") {
    const kind = readString(input.kind);
    return {
      appId: request.appId,
      source: "app_server_runtime_process",
      taskCount: tasks.length,
      skills: kind
        ? skills.filter(
            (skill) => skill.status === kind || skill.source === kind,
          )
        : skills,
    };
  }
  if (request.method === "resolve") {
    const skillId = readStringParam(request, "skillId", 0);
    const skill = skills.find((item) => item.skillId === skillId);
    if (!skill) {
      throw new PluginCapabilityDispatcherError(
        "SKILL_NOT_FOUND",
        `${skillId} was not found in AgentRuntime process projection.`,
      );
    }
    return skill;
  }
  if (request.method === "getInvocation") {
    const invocationId = readStringParam(request, "invocationId", 0);
    const invocation = buildRuntimeSkillInvocations(tasks).find(
      (item) => item.invocationId === invocationId,
    );
    if (!invocation) {
      throw new PluginCapabilityDispatcherError(
        "SKILL_INVOCATION_NOT_FOUND",
        `${invocationId} was not found in AgentRuntime process projection.`,
      );
    }
    return invocation;
  }
  if (request.method === "bind" || request.method === "invoke") {
    return {
      status: "not_available",
      reason: "skill_runtime_mutation_not_exposed_to_plugins",
      source: "app_server_runtime_process",
    };
  }
  throwUnsupportedRuntimeMethod(request);
}

export function dispatchMemory(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const observations = tasks.map(buildRuntimeMemoryProjection);
  if (request.method === "getStatus") {
    return {
      appId: request.appId,
      scope: readString(input.scope) ?? "task",
      status: "read_only_projection",
      source: "app_server_runtime_projection",
      taskCount: tasks.length,
      writable: false,
      compactable: false,
      totals: {
        knowledgeBindingCount: observations.reduce(
          (total, item) => total + item.knowledgeBindingKeys.length,
          0,
        ),
        contextCompactionCount: observations.reduce(
          (total, item) => total + item.contextCompactionCount,
          0,
        ),
        pendingRequestCount: observations.reduce(
          (total, item) => total + item.pendingRequestCount,
          0,
        ),
        retrievalRefCount: observations.reduce(
          (total, item) => total + item.retrievalRefCount,
          0,
        ),
        missingContextCount: observations.reduce(
          (total, item) => total + item.missingContextCount,
          0,
        ),
        teamMemoryRefCount: observations.reduce(
          (total, item) => total + item.teamMemoryRefCount,
          0,
        ),
      },
      observations,
    };
  }
  if (request.method === "query") {
    const query = readStringParam(request, "query", 0).toLowerCase();
    return {
      appId: request.appId,
      query,
      status: "limited_projection",
      source: "app_server_runtime_projection",
      records: observations.filter((item) =>
        [
          item.taskId,
          item.taskKind,
          ...item.knowledgeBindingKeys,
          ...item.contextRefLabels,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      ),
    };
  }
  if (request.method === "write" || request.method === "compact") {
    return {
      status: "not_available",
      reason: "memory_store_mutation_not_exposed_to_plugins",
      source: "app_server_runtime_projection",
    };
  }
  throwUnsupportedRuntimeMethod(request);
}

export function dispatchContext(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  if (request.method === "getSnapshot") {
    return {
      appId: request.appId,
      scope: readString(input.scope) ?? "task",
      source: "app_server_runtime_projection",
      taskCount: tasks.length,
      contexts: tasks.map(buildRuntimeContextProjection),
    };
  }
  if (request.method === "attach" || request.method === "detach") {
    return {
      status: "not_available",
      reason: "context_mutation_not_exposed_to_plugins",
      source: "app_server_runtime_projection",
    };
  }
  throwUnsupportedRuntimeMethod(request);
}

export function dispatchTasks(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  if (request.method === "list") {
    const status = readString(input.status);
    const limit = recordNumberByKeys(input, ["limit"]);
    const items = tasks
      .filter((task) => !status || task.status === status)
      .slice(
        0,
        limit === undefined ? undefined : Math.max(0, Math.floor(limit)),
      )
      .map(buildRuntimeTaskProjection);
    return {
      appId: request.appId,
      entryKey: request.entryKey,
      status: "read_only_projection",
      source: "app_server_runtime_projection",
      taskCount: items.length,
      tasks: items,
    };
  }
  if (request.method === "get") {
    const taskId = readStringParam(request, "taskId", 0);
    const task = tasks.find((item) => item.taskId === taskId);
    return task
      ? buildRuntimeTaskProjection(task)
      : {
          taskId,
          status: "not_found",
          reason: "task_not_found",
          source: "app_server_runtime_projection",
        };
  }
  if (request.method === "cancel") {
    readStringParam(request, "taskId", 0);
    return {
      status: "not_available",
      reason: "task_cancellation_must_use_lime_agent_cancel_task",
      source: "app_server_runtime_projection",
      next: {
        capability: "lime.agent",
        method: "cancelTask",
      },
    };
  }
  if (request.method === "subscribe") {
    readStringParam(request, "taskId", 0);
    return {
      status: "not_available",
      reason: "task_subscription_must_use_lime_agent_stream_task",
      source: "app_server_runtime_projection",
      next: {
        capability: "lime.agent",
        method: "streamTask",
      },
    };
  }
  throwUnsupportedRuntimeMethod(request);
}

export function dispatchUsage(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const usageItems = tasks
    .map(buildUsageProjection)
    .filter((item): item is RuntimeUsageProjection => Boolean(item));
  const costItems = tasks
    .map(buildCostProjection)
    .filter((item): item is RuntimeCostProjection => Boolean(item));
  const budgetItems = tasks
    .map(buildBudgetProjection)
    .filter((item): item is RuntimeBudgetProjection => Boolean(item));
  if (request.method === "getTokenUsage") {
    return {
      appId: request.appId,
      taskId: readString(input.taskId),
      window: readString(input.window),
      source: "app_server_runtime_projection",
      taskCount: tasks.length,
      totals: aggregateUsage(usageItems),
      tasks: usageItems,
    };
  }
  if (request.method === "getCostSummary") {
    return {
      appId: request.appId,
      taskId: readString(input.taskId),
      window: readString(input.window),
      source: "app_server_runtime_projection",
      taskCount: tasks.length,
      cost: aggregateCost(costItems),
      tasks: costItems,
    };
  }
  if (request.method === "getBudget") {
    const scope = readString(input.scope) ?? "app";
    if (budgetItems.length > 0) {
      return {
        appId: request.appId,
        scope,
        status: "observed",
        source: "app_server_runtime_projection",
        taskCount: tasks.length,
        budgetCount: budgetItems.length,
        observedCost: aggregateCost(costItems),
        latest: budgetItems[0],
        tasks: budgetItems,
      };
    }
    return {
      appId: request.appId,
      scope,
      status: "not_configured",
      reason: "no_app_server_runtime_budget_facts",
      source: "app_server_runtime_projection",
      observedCost: aggregateCost(costItems),
    };
  }
  throwUnsupportedRuntimeMethod(request);
}
