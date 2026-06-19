import { Edit3, Eye, FilePlus, FileText, FolderOpen, Search, Terminal } from "lucide-react";
import type { ToolDisplayConfig } from "../toolDisplayTypes";

export const FALLBACK_TOOL_CONFIGS = {
  workspace: {
    family: "generic",
    label: "工作区同步",
    verb: "同步",
    icon: FileText,
    groupTitle: "工作区",
    actionKey: "generic",
  },
  edit: {
    family: "edit",
    label: "文件编辑",
    verb: "修改",
    icon: Edit3,
    groupTitle: "编辑",
    actionKey: "edit",
  },
  plan: {
    family: "plan",
    label: "计划",
    verb: "更新计划",
    icon: FileText,
    groupTitle: "计划",
    actionKey: "plan",
  },
  write: {
    family: "write",
    label: "文件写入",
    verb: "保存",
    icon: FilePlus,
    groupTitle: "写入",
    actionKey: "write",
  },
  read: {
    family: "read",
    label: "文件读取",
    verb: "查看",
    icon: Eye,
    groupTitle: "探索",
    actionKey: "read",
  },
  command: {
    family: "command",
    label: "命令执行",
    verb: "运行",
    icon: Terminal,
    groupTitle: "命令",
    actionKey: "command",
  },
  search: {
    family: "search",
    label: "搜索",
    verb: "搜索",
    icon: Search,
    groupTitle: "搜索",
    actionKey: "search",
  },
  list: {
    family: "list",
    label: "目录浏览",
    verb: "查看",
    icon: FolderOpen,
    groupTitle: "探索",
    actionKey: "list",
  },
} as const satisfies Record<string, ToolDisplayConfig>;
