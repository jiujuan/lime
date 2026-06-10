import type { ReactNode } from "react";

import type {
  AgentUiProjectionState,
  AgentRuntimeActionProjection,
  AgentRuntimeEventProjection,
  AgentRuntimeExecutionEvent,
  AgentRuntimeReadModel,
  ExecutionGraphNode,
  ProcessTimelineEntry,
  UIMessagePart,
} from "@limecloud/agent-ui-contracts";

export type AgentMessageRole = "user" | "assistant" | "system" | string;

export interface AgentTimelineMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  model?: string;
  createdAt?: string;
}

export interface AgentTimelineProps<TMessage extends AgentTimelineMessage = AgentTimelineMessage> {
  messages?: readonly TMessage[];
  empty?: ReactNode;
  runningLabel?: ReactNode;
  runtimeStatusLabel?: ReactNode;
  contextDetailsLabel?: ReactNode;
  fullOutputDetailsLabel?: ReactNode;
  roleLabel?: (role: AgentMessageRole) => string;
  messageTitle?: (message: TMessage) => ReactNode;
  messageMeta?: (message: TMessage) => ReactNode;
  messagePreview?: (message: TMessage) => ReactNode;
}

export type AgentRuntimeActionResolver<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> = (
  event: TEvent,
  action: AgentRuntimeActionProjection,
) => void;

export interface RuntimeFactsPanelProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  readModel: AgentRuntimeReadModel<TEvent>;
  artifact?: ReactNode;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
  labels?: Pick<
    AgentUiProjectionViewLabels<TEvent>,
    | "runtimeSummaryAriaLabel"
    | "executionEventsAriaLabel"
    | "summaryLabels"
    | "actionButtonLabel"
    | "eventStatusLabel"
  >;
}

export interface RuntimeEventListProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  events: readonly AgentRuntimeEventProjection<TEvent>[];
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
  ariaLabel?: string;
  actionButtonLabel?: (action: AgentRuntimeActionProjection) => ReactNode;
  eventStatusLabel?: (event: AgentRuntimeEventProjection<TEvent>) => ReactNode;
}

export interface RuntimeFactsSummaryProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  readModel: AgentRuntimeReadModel<TEvent>;
  ariaLabel?: string;
  summaryLabels?: Partial<Record<"sources" | "actions" | "artifacts" | "evidence", ReactNode>>;
}

export interface RuntimeFactCardProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  event: AgentRuntimeEventProjection<TEvent>;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
  actionButtonLabel?: (action: AgentRuntimeActionProjection) => ReactNode;
  eventStatusLabel?: (event: AgentRuntimeEventProjection<TEvent>) => ReactNode;
}

export interface ToolGroupProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  tools?: readonly AgentRuntimeEventProjection<TEvent>[];
  empty?: ReactNode;
  ariaLabel?: string;
  eventStatusLabel?: (event: AgentRuntimeEventProjection<TEvent>) => ReactNode;
}

export interface ActionRequiredListProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  actions?: readonly AgentRuntimeEventProjection<TEvent>[];
  empty?: ReactNode;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
  ariaLabel?: string;
  actionButtonLabel?: (action: AgentRuntimeActionProjection) => ReactNode;
  eventStatusLabel?: (event: AgentRuntimeEventProjection<TEvent>) => ReactNode;
}

export interface UIMessagePartsViewProps {
  parts?: readonly UIMessagePart[];
  empty?: ReactNode;
  ariaLabel?: string;
  roleLabel?: (role: AgentMessageRole) => string;
  partTitle?: (part: UIMessagePart) => ReactNode;
  partMeta?: (part: UIMessagePart) => ReactNode;
  partPreview?: (part: UIMessagePart) => ReactNode;
}

export interface ProcessTimelineViewProps {
  entries?: readonly ProcessTimelineEntry[];
  empty?: ReactNode;
  ariaLabel?: string;
  entryTitle?: (entry: ProcessTimelineEntry) => ReactNode;
  entryMeta?: (entry: ProcessTimelineEntry) => ReactNode;
}

export interface ExecutionGraphViewProps {
  nodes?: readonly ExecutionGraphNode[];
  empty?: ReactNode;
  ariaLabel?: string;
  nodeTitle?: (node: ExecutionGraphNode) => ReactNode;
  nodeMeta?: (node: ExecutionGraphNode) => ReactNode;
}

export interface AgentUiProjectionViewLabels<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  messagePartsAriaLabel?: string;
  processTimelineAriaLabel?: string;
  executionGraphAriaLabel?: string;
  runtimeSummaryAriaLabel?: string;
  executionEventsAriaLabel?: string;
  toolGroupAriaLabel?: string;
  actionRequiredAriaLabel?: string;
  summaryLabels?: RuntimeFactsSummaryProps<TEvent>["summaryLabels"];
  roleLabel?: UIMessagePartsViewProps["roleLabel"];
  messagePartTitle?: UIMessagePartsViewProps["partTitle"];
  messagePartMeta?: UIMessagePartsViewProps["partMeta"];
  messagePartPreview?: UIMessagePartsViewProps["partPreview"];
  timelineEntryTitle?: ProcessTimelineViewProps["entryTitle"];
  timelineEntryMeta?: ProcessTimelineViewProps["entryMeta"];
  graphNodeTitle?: ExecutionGraphViewProps["nodeTitle"];
  graphNodeMeta?: ExecutionGraphViewProps["nodeMeta"];
  actionButtonLabel?: RuntimeFactCardProps<TEvent>["actionButtonLabel"];
  eventStatusLabel?: RuntimeFactCardProps<TEvent>["eventStatusLabel"];
}

export interface AgentUiProjectionViewProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  state: AgentUiProjectionState<TEvent>;
  artifact?: ReactNode;
  emptyMessages?: ReactNode;
  labels?: AgentUiProjectionViewLabels<TEvent>;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
}
