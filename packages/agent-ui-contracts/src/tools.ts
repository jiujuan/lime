import type {
  AgentRuntimeExecutionEventStatus,
  AgentRuntimePhase,
} from "./runtime";

export type AgentUiToolFamily =
  | "webSearch"
  | "webFetch"
  | "mcp"
  | "skill"
  | "command"
  | "browser"
  | "file"
  | "tool"
  | string;

export type AgentUiMcpOperationKind =
  | "search"
  | "list"
  | "read"
  | "browser"
  | "mutation"
  | "resource"
  | "prompt"
  | "auth"
  | "tool"
  | string;

export interface AgentUiToolCallEventView {
  id: string;
  eventId: string;
  eventClass?: string;
  status: AgentRuntimeExecutionEventStatus;
  phase?: AgentRuntimePhase;
  title: string;
  detail?: string;
  createdAt?: string;
  completedAt?: string;
}

export interface AgentUiMcpToolCallView {
  id: string;
  serverId: string;
  fullName: string;
  toolName: string;
  operationKind: AgentUiMcpOperationKind;
  status: AgentRuntimeExecutionEventStatus;
  title: string;
  detail?: string;
  resourceUri?: string;
  promptName?: string;
  eventIds: string[];
  artifactRefs: string[];
  evidenceRefs: string[];
}

export interface AgentUiMcpServerView {
  id: string;
  label: string;
  status: AgentRuntimeExecutionEventStatus;
  toolCount: number;
  activeToolCount: number;
  failedToolCount: number;
  eventIds: string[];
}

export interface AgentUiMcpSurfaceModel {
  hasMcp: boolean;
  servers: AgentUiMcpServerView[];
  tools: AgentUiMcpToolCallView[];
  activeToolIds: string[];
  failedToolIds: string[];
  completedToolIds: string[];
}

export interface AgentUiToolCallView {
  id: string;
  toolCallId?: string;
  toolName: string;
  displayName: string;
  family: AgentUiToolFamily;
  operationKind?: string;
  mcpServerId?: string;
  status: AgentRuntimeExecutionEventStatus;
  phase?: AgentRuntimePhase;
  title: string;
  detail?: string;
  inputPreview?: string;
  outputPreview?: string;
  errorPreview?: string;
  progress?: number;
  total?: number;
  startedAt?: string;
  completedAt?: string;
  artifactRefs: string[];
  evidenceRefs: string[];
  eventIds: string[];
  events: AgentUiToolCallEventView[];
  mcp?: AgentUiMcpToolCallView;
  skillSlug?: string;
}

export interface AgentUiToolSurfaceModel {
  calls: AgentUiToolCallView[];
  activeCallIds: string[];
  failedCallIds: string[];
  completedCallIds: string[];
  byFamily: Record<string, number>;
}
