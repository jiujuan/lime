import type { AgentThreadItem, AgentThreadItemStatus } from "../types";

export type AgentThreadGroupKind =
  | "process"
  | "approval"
  | "alert"
  | "artifact"
  | "subagent"
  | "other";

export interface AgentThreadSummaryChip {
  kind: Exclude<AgentThreadGroupKind, "approval" | "alert" | "other">;
  label: string;
  count: number;
}

export interface AgentThreadOrderedBlock {
  id: string;
  kind: AgentThreadGroupKind;
  title: string;
  status: AgentThreadItemStatus;
  items: AgentThreadItem[];
  previewLines: string[];
  countLabel: string;
  rawDetailLabel: string;
  defaultExpanded: boolean;
  forceExpanded?: boolean;
  startedAt: string;
  completedAt?: string;
}

export interface AgentThreadSemanticGroup {
  id: string;
  kind: Exclude<AgentThreadGroupKind, "other">;
  title: string;
  status: AgentThreadItemStatus;
  items: AgentThreadItem[];
  previewLines: string[];
  countLabel: string;
  rawDetailLabel: string;
  defaultExpanded: boolean;
  forceExpanded?: boolean;
}

export interface AgentThreadDisplayModel {
  summaryText: string | null;
  thinkingItems: AgentThreadItem[];
  groups: AgentThreadSemanticGroup[];
  orderedBlocks: AgentThreadOrderedBlock[];
  summaryChips: AgentThreadSummaryChip[];
}
