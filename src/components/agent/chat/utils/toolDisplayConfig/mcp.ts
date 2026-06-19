import { FileText, FolderOpen, Globe, Search, Wrench } from "lucide-react";
import type { McpToolOperationKind } from "../toolNameFamily";
import type { ToolDisplayConfig } from "../toolDisplayTypes";

export const MCP_OPERATION_TOOL_CONFIGS: Record<
  McpToolOperationKind,
  ToolDisplayConfig
> = {
  search: {
    family: "search",
    label: "MCP 搜索",
    verb: "搜索",
    icon: Search,
    groupTitle: "MCP",
    actionKey: "search",
  },
  list: {
    family: "list",
    label: "MCP 列表",
    verb: "查看",
    icon: FolderOpen,
    groupTitle: "MCP",
    actionKey: "list",
  },
  read: {
    family: "read",
    label: "MCP 读取",
    verb: "查看",
    icon: FileText,
    groupTitle: "MCP",
    actionKey: "read",
  },
  mutation: {
    family: "generic",
    label: "MCP 工具",
    verb: "调用",
    icon: Wrench,
    groupTitle: "MCP",
    actionKey: "generic",
    actions: {
      failed: "调用失败",
      completed: "已调用 MCP 工具",
      running: "调用中",
    },
  },
  browser: {
    family: "browser",
    label: "MCP 浏览器",
    verb: "操作",
    icon: Globe,
    groupTitle: "MCP",
    actionKey: "browser",
  },
};
