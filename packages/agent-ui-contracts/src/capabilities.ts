export type AgentRuntimeCapabilityId =
  | "transport.jsonrpc"
  | "transport.host-bridge"
  | "tools.native"
  | "tools.shim"
  | "state.snapshot"
  | "state.delta"
  | "hitl.actions"
  | "hitl.resume"
  | "reasoning.summary"
  | "reasoning.encrypted-ref"
  | "multimodal.image"
  | "multimodal.audio"
  | "multimodal.video"
  | "multimodal.document"
  | "subagents.handoff"
  | "evidence.export"
  | string;

export type AgentRuntimeCapabilityStatus =
  | "supported"
  | "unsupported"
  | "degraded"
  | "experimental"
  | string;

export type AgentRuntimeCapabilityScope =
  | "runtime"
  | "provider"
  | "session"
  | "turn"
  | "tool"
  | string;

export interface AgentRuntimeCapabilityEntry {
  id: AgentRuntimeCapabilityId;
  status: AgentRuntimeCapabilityStatus;
  scope: AgentRuntimeCapabilityScope;
  title: string;
  detail?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeCapabilityManifest {
  schemaVersion: "lime-runtime-capability-manifest/v0.1" | string;
  runtimeId: string;
  providerId?: string;
  sessionId?: string;
  generatedAt: string;
  capabilities: AgentRuntimeCapabilityEntry[];
}

export type AgentRuntimeResumeMode =
  | "all-open-actions"
  | "selected-actions"
  | "cancel-open-actions"
  | string;

export interface AgentRuntimeResumeActionDecision {
  actionId: string;
  decision: "approved" | "rejected" | "answered" | "cancelled" | string;
  response?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeResumeContract {
  schemaVersion: "lime-runtime-resume-contract/v0.1" | string;
  runtimeId: string;
  sessionId: string;
  turnId: string;
  resumeMode: AgentRuntimeResumeMode;
  openActionIds: string[];
  decisions: AgentRuntimeResumeActionDecision[];
  expiresAt?: string;
  createdAt: string;
}
