import type {
  AgentRuntimeExecutionEventStatus,
  AgentRuntimeFactOwner,
  AgentRuntimePhase,
} from "./runtime";

export type ProcessTimelineEntryKind =
  | "status"
  | "reasoning"
  | "tool"
  | "action"
  | "artifact"
  | "evidence"
  | "task"
  | "diagnostic"
  | "message"
  | string;

export interface ProcessTimelineEntry {
  entryId: string;
  sequence?: number;
  kind: ProcessTimelineEntryKind;
  phase?: AgentRuntimePhase;
  owner?: AgentRuntimeFactOwner;
  status: AgentRuntimeExecutionEventStatus;
  title: string;
  detail?: string;
  refs: string[];
  sourceEventId: string;
  createdAt: string;
  completedAt?: string;
}

export type ProcessTimeline = ProcessTimelineEntry[];
