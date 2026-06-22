import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquareText,
  Server,
  Settings2,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type McpTab = "runtime" | "tools" | "prompts" | "resources" | "config";

export type McpTabLabelKey =
  | "settings.mcpPage.runtime.tabs.runtime"
  | "settings.mcpPage.runtime.tabs.tools"
  | "settings.mcpPage.runtime.tabs.prompts"
  | "settings.mcpPage.runtime.tabs.resources"
  | "settings.mcpPage.runtime.tabs.config";

export interface McpTabDefinition {
  id: McpTab;
  labelKey: McpTabLabelKey;
  icon: LucideIcon;
}

export const mcpPanelTabs: McpTabDefinition[] = [
  {
    id: "runtime",
    labelKey: "settings.mcpPage.runtime.tabs.runtime",
    icon: Server,
  },
  {
    id: "tools",
    labelKey: "settings.mcpPage.runtime.tabs.tools",
    icon: Wrench,
  },
  {
    id: "prompts",
    labelKey: "settings.mcpPage.runtime.tabs.prompts",
    icon: MessageSquareText,
  },
  {
    id: "resources",
    labelKey: "settings.mcpPage.runtime.tabs.resources",
    icon: FileText,
  },
  {
    id: "config",
    labelKey: "settings.mcpPage.runtime.tabs.config",
    icon: Settings2,
  },
];

export type McpPanelStatus = "error" | "loading" | "ready";

export type McpPanelStatusLabelKey =
  | "settings.mcpPage.runtime.syncStatus.error.label"
  | "settings.mcpPage.runtime.syncStatus.loading.label"
  | "settings.mcpPage.runtime.syncStatus.ready.label";

export type McpPanelStatusDetailKey =
  | "settings.mcpPage.runtime.syncStatus.error.detail"
  | "settings.mcpPage.runtime.syncStatus.loading.detail"
  | "settings.mcpPage.runtime.syncStatus.ready.detail";

export interface McpPanelStatusMeta {
  status: McpPanelStatus;
  labelKey: McpPanelStatusLabelKey;
  detailKey: McpPanelStatusDetailKey;
  className: string;
  icon: LucideIcon;
  spinning: boolean;
}

export interface McpPanelTabCounts {
  servers: number;
  tools: number;
  prompts: number;
  resources: number;
}

export function getRunningMcpServerCount(
  servers: readonly { is_running: boolean }[],
): number {
  return servers.filter((server) => server.is_running).length;
}

export function getMcpCapabilityCount({
  tools,
  prompts,
  resources,
}: {
  tools: readonly unknown[];
  prompts: readonly unknown[];
  resources: readonly unknown[];
}): number {
  return tools.length + prompts.length + resources.length;
}

export function getMcpTabCount(tab: McpTab, counts: McpPanelTabCounts): number {
  switch (tab) {
    case "runtime":
    case "config":
      return counts.servers;
    case "tools":
      return counts.tools;
    case "prompts":
      return counts.prompts;
    case "resources":
      return counts.resources;
  }
}

export function getMcpPanelStatusMeta({
  loading,
  error,
}: {
  loading: boolean;
  error: string | null | undefined;
}): McpPanelStatusMeta {
  if (error) {
    return {
      status: "error",
      labelKey: "settings.mcpPage.runtime.syncStatus.error.label",
      detailKey: "settings.mcpPage.runtime.syncStatus.error.detail",
      className: "border-rose-200 bg-rose-50 text-rose-700",
      icon: AlertTriangle,
      spinning: false,
    };
  }

  if (loading) {
    return {
      status: "loading",
      labelKey: "settings.mcpPage.runtime.syncStatus.loading.label",
      detailKey: "settings.mcpPage.runtime.syncStatus.loading.detail",
      className: "border-sky-200 bg-sky-50 text-sky-700",
      icon: Loader2,
      spinning: true,
    };
  }

  return {
    status: "ready",
    labelKey: "settings.mcpPage.runtime.syncStatus.ready.label",
    detailKey: "settings.mcpPage.runtime.syncStatus.ready.detail",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
    spinning: false,
  };
}
