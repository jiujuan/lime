import type { AgentRuntimeExecutionEventStatus } from "./runtime";

export type ExecutionGraphNodeType =
  | "turn"
  | "run"
  | "task"
  | "subagent"
  | "job"
  | "attempt"
  | "step"
  | "tool"
  | "action"
  | string;

export interface ExecutionGraphNode {
  nodeId: string;
  parentId?: string;
  nodeType: ExecutionGraphNodeType;
  status: AgentRuntimeExecutionEventStatus;
  title: string;
  refs: string[];
  sourceEventIds: string[];
  createdAt?: string;
  completedAt?: string;
}

export type ExecutionGraph = ExecutionGraphNode[];
