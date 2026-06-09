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
}

export interface RuntimeEventListProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  events: readonly AgentRuntimeEventProjection<TEvent>[];
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
}

export interface RuntimeFactsSummaryProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  readModel: AgentRuntimeReadModel<TEvent>;
}

export interface RuntimeFactCardProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  event: AgentRuntimeEventProjection<TEvent>;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
}

export interface ToolGroupProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  tools?: readonly AgentRuntimeEventProjection<TEvent>[];
  empty?: ReactNode;
}

export interface ActionRequiredListProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  actions?: readonly AgentRuntimeEventProjection<TEvent>[];
  empty?: ReactNode;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
}

export interface UIMessagePartsViewProps {
  parts?: readonly UIMessagePart[];
  empty?: ReactNode;
  partTitle?: (part: UIMessagePart) => ReactNode;
  partMeta?: (part: UIMessagePart) => ReactNode;
  partPreview?: (part: UIMessagePart) => ReactNode;
}

export interface ProcessTimelineViewProps {
  entries?: readonly ProcessTimelineEntry[];
  empty?: ReactNode;
  entryTitle?: (entry: ProcessTimelineEntry) => ReactNode;
  entryMeta?: (entry: ProcessTimelineEntry) => ReactNode;
}

export interface ExecutionGraphViewProps {
  nodes?: readonly ExecutionGraphNode[];
  empty?: ReactNode;
  nodeTitle?: (node: ExecutionGraphNode) => ReactNode;
  nodeMeta?: (node: ExecutionGraphNode) => ReactNode;
}

export interface AgentUiProjectionViewProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  state: AgentUiProjectionState<TEvent>;
  artifact?: ReactNode;
  emptyMessages?: ReactNode;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
}
