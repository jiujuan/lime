import type { LucideIcon } from "lucide-react";
import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { ToolStatusActionKey } from "./toolDisplayCopy";

export type ToolCallStatus = ToolCallState["status"];

export type ToolCallFamily =
  | "subagent"
  | "task"
  | "plan"
  | "skill"
  | "write"
  | "read"
  | "edit"
  | "command"
  | "search"
  | "list"
  | "browser"
  | "fetch"
  | "vision"
  | "generic";

export type ToolCallArgumentValue =
  | string
  | number
  | boolean
  | null
  | ToolCallArgumentValue[]
  | { [key: string]: ToolCallArgumentValue };

export interface ToolDisplayDescriptor {
  family: ToolCallFamily;
  label: string;
  action: string;
  verb: string;
  icon: LucideIcon;
  groupTitle: string;
}

export interface ToolDisplayConfig {
  family: ToolCallFamily;
  label: string;
  labelKey?: string;
  verb: string;
  icon: LucideIcon;
  groupTitle: string;
  groupTitleKey?: string;
  actionKey: ToolStatusActionKey;
  actions?: {
    failed: string;
    completed: string;
    running: string;
  };
  actionKeys?: {
    failed: string;
    completed: string;
    running: string;
  };
}
