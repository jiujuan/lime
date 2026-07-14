import type {
  AgentRuntimeExtensionSourceKind,
  AgentRuntimeToolInventoryCatalogEntry,
  AgentRuntimeToolInventoryNativeEntry,
  AgentRuntimeToolInventoryRuntimeEntry,
  AgentRuntimeToolInventoryRuntimeSourceKind,
  AgentToolExecutionPolicySource,
  AgentToolExecutionRestrictionProfile,
  AgentToolExecutionSandboxProfile,
  AgentToolExecutionWarningPolicy,
  AgentToolLifecycle,
  AgentToolPermissionPlane,
  AgentToolSourceKind,
} from "@/lib/api/agentRuntime/toolInventoryTypes";
import type { RuntimeToolAvailability } from "../utils/runtimeToolAvailability";
import type { RuntimeToolCapabilityGap } from "./HarnessToolInventoryTypes";

export type ToolInventoryFilterValue = "all" | AgentToolExecutionPolicySource;

export type ToolInventorySourceStats = Record<
  AgentToolExecutionPolicySource,
  number
>;

export function formatExecutionSourceLabel(
  source: AgentToolExecutionPolicySource,
): string {
  switch (source) {
    case "runtime":
      return "运行时覆盖";
    case "persisted":
      return "持久化覆盖";
    case "default":
    default:
      return "默认策略";
  }
}

export function resolveExecutionSourceVariant(
  source: AgentToolExecutionPolicySource,
): "default" | "secondary" | "outline" {
  switch (source) {
    case "runtime":
      return "default";
    case "persisted":
      return "secondary";
    case "default":
    default:
      return "outline";
  }
}

export function formatExecutionWarningPolicyLabel(
  value: AgentToolExecutionWarningPolicy | string,
): string {
  switch (value) {
    case "shell_command_risk":
      return "命令风险告警";
    case "none":
    default:
      return "无告警";
  }
}

export function formatExecutionRestrictionProfileLabel(
  value: AgentToolExecutionRestrictionProfile | string,
): string {
  switch (value) {
    case "workspace_path_required":
      return "必须提供工作区路径";
    case "workspace_path_optional":
      return "可选工作区路径";
    case "workspace_absolute_path_required":
      return "必须提供绝对工作区路径";
    case "workspace_shell_command":
      return "工作区命令限制";
    case "analyze_image_input":
      return "仅图像输入";
    case "safe_https_url_required":
      return "仅安全 HTTPS URL";
    case "none":
    default:
      return "无额外限制";
  }
}

export function formatExecutionSandboxProfileLabel(
  value: AgentToolExecutionSandboxProfile | string,
): string {
  switch (value) {
    case "workspace_command":
      return "工作区命令沙箱";
    case "none":
    default:
      return "无沙箱";
  }
}

export function formatToolLifecycleLabel(
  value: AgentToolLifecycle | string,
): string {
  switch (value) {
    case "current":
      return "现役";
    case "compat":
      return "兼容";
    case "deprecated":
      return "待清理";
    default:
      return value;
  }
}

export function formatToolPermissionPlaneLabel(
  value: AgentToolPermissionPlane | string,
): string {
  switch (value) {
    case "session_allowlist":
      return "会话白名单";
    case "parameter_restricted":
      return "参数受限";
    case "caller_filtered":
      return "调用方过滤";
    default:
      return value;
  }
}

export function formatToolSourceKindLabel(
  value: AgentToolSourceKind | string,
): string {
  switch (value) {
    case "agent_builtin":
      return "Agent 内置";
    case "lime_injected":
      return "Lime 注入";
    case "browser_compatibility":
      return "Browser Assist";
    default:
      return value;
  }
}

export function formatExtensionSourceKindLabel(
  value: AgentRuntimeExtensionSourceKind | string,
): string {
  switch (value) {
    case "mcp_bridge":
      return "MCP Bridge";
    case "runtime_extension":
      return "Runtime Extension";
    default:
      return value;
  }
}

export function formatRuntimeToolSourceKindLabel(
  value: AgentRuntimeToolInventoryRuntimeSourceKind | string,
): string {
  switch (value) {
    case "current_surface":
      return "当前工具面";
    case "runtime_extension":
      return "Extension";
    case "mcp":
      return "MCP";
    default:
      return value;
  }
}

export function formatRuntimeToolAvailabilitySourceLabel(
  value: string,
): string {
  switch (value) {
    case "runtime_tools":
      return "runtime_tools";
    case "native_tools":
      return "native_tools";
    case "none":
    default:
      return "未就绪";
  }
}

export function collectCatalogExecutionSources(
  entry: AgentRuntimeToolInventoryCatalogEntry,
): AgentToolExecutionPolicySource[] {
  return [
    entry.execution_warning_policy_source,
    entry.execution_restriction_profile_source,
    entry.execution_sandbox_profile_source,
  ];
}

export function collectNativeExecutionSources(
  entry: AgentRuntimeToolInventoryNativeEntry,
): AgentToolExecutionPolicySource[] {
  return [
    entry.catalog_execution_warning_policy_source,
    entry.catalog_execution_restriction_profile_source,
    entry.catalog_execution_sandbox_profile_source,
  ].filter((value): value is AgentToolExecutionPolicySource => Boolean(value));
}

export function sortRuntimeToolsByVisibility(
  tools: AgentRuntimeToolInventoryRuntimeEntry[],
): AgentRuntimeToolInventoryRuntimeEntry[] {
  return [...tools].sort((left, right) => {
    if (left.visible_in_context !== right.visible_in_context) {
      return left.visible_in_context ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

export function buildRuntimeToolCapabilityGaps(
  toolInventoryKnown: boolean,
  runtimeToolAvailability: RuntimeToolAvailability,
): RuntimeToolCapabilityGap[] {
  if (!toolInventoryKnown || !runtimeToolAvailability.known) {
    return [];
  }

  const gaps: RuntimeToolCapabilityGap[] = [];

  if (!runtimeToolAvailability.webSearch) {
    gaps.push({
      key: "web_search",
      title: "WebSearch",
      missing: ["WebSearch"],
    });
  }

  if (!runtimeToolAvailability.subagentCore) {
    gaps.push({
      key: "subagent_core",
      title: "子任务核心 tools",
      missing: runtimeToolAvailability.missingSubagentCoreTools,
    });
  }

  if (!runtimeToolAvailability.subagentTeamTools) {
    gaps.push({
      key: "subagent_team",
      title: "Subagents coordination tools",
      missing: runtimeToolAvailability.missingSubagentTeamTools,
    });
  }

  if (!runtimeToolAvailability.planRuntime) {
    gaps.push({
      key: "plan_runtime",
      title: "Plan current tool",
      missing: runtimeToolAvailability.missingPlanTools,
    });
  }

  return gaps;
}

export function matchesCatalogToolInventoryFilter(
  entry: AgentRuntimeToolInventoryCatalogEntry,
  filter: ToolInventoryFilterValue,
): boolean {
  const sources = collectCatalogExecutionSources(entry);

  switch (filter) {
    case "runtime":
      return sources.includes("runtime");
    case "persisted":
      return sources.includes("persisted");
    case "default":
      return sources.every((source) => source === "default");
    case "all":
    default:
      return true;
  }
}

export function countCatalogToolsByInventoryFilter(
  catalogTools: AgentRuntimeToolInventoryCatalogEntry[],
  filter: ToolInventoryFilterValue,
): number {
  return catalogTools.filter((entry) =>
    matchesCatalogToolInventoryFilter(entry, filter),
  ).length;
}

export function buildToolInventorySourceStats(
  catalogTools: AgentRuntimeToolInventoryCatalogEntry[],
): ToolInventorySourceStats {
  const stats: ToolInventorySourceStats = {
    default: 0,
    persisted: 0,
    runtime: 0,
  };

  for (const entry of catalogTools) {
    for (const source of collectCatalogExecutionSources(entry)) {
      stats[source] += 1;
    }
  }

  return stats;
}
