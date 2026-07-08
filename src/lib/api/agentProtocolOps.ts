import type {
  AsterApprovalPolicy,
  AgentRuntimeSubmitTurnRequest,
  AgentRuntimeWebSearchMode,
  AsterExecutionStrategy,
  AsterSandboxPolicy,
  AutoContinueRequestPayload,
  ImageInput,
  RuntimeProviderConfig,
} from "./agentRuntime/types";

export interface AgentUserPreferences {
  providerConfig?: RuntimeProviderConfig;
  providerPreference?: string;
  modelPreference?: string;
  reasoningEffort?: string;
  thinking?: boolean;
  webSearch?: boolean;
  searchMode?: AgentRuntimeWebSearchMode;
  approvalPolicy?: AsterApprovalPolicy;
  sandboxPolicy?: AsterSandboxPolicy;
  executionStrategy?: AsterExecutionStrategy;
  autoContinue?: AutoContinueRequestPayload;
}

export interface AgentUserInputOp {
  type: "user_input";
  text: string;
  sessionId: string;
  eventName: string;
  workspaceId?: string;
  turnId?: string;
  images?: ImageInput[];
  preferences?: AgentUserPreferences;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
  queueIfBusy?: boolean;
  queuedTurnId?: string;
  skipPreSubmitResume?: boolean;
}

export interface AgentInterruptOp {
  type: "interrupt";
  sessionId: string;
  turnId?: string;
}

export interface AgentRetryOp {
  type: "retry";
  sessionId: string;
  turnId: string;
}

export interface AgentConfigUpdateOp {
  type: "config_update";
  sessionId: string;
  key: string;
  value: unknown;
}

export interface AgentShutdownOp {
  type: "shutdown";
  sessionId?: string;
}

export type AgentOp =
  | AgentUserInputOp
  | AgentInterruptOp
  | AgentRetryOp
  | AgentConfigUpdateOp
  | AgentShutdownOp;

export function createSubmitTurnRequestFromAgentOp(
  op: AgentUserInputOp,
): AgentRuntimeSubmitTurnRequest {
  const preferences = op.preferences;

  return {
    message: op.text,
    session_id: op.sessionId,
    event_name: op.eventName,
    ...(op.workspaceId ? { workspace_id: op.workspaceId } : {}),
    turn_id: op.turnId,
    images: op.images,
    turn_config: {
      ...(preferences?.providerConfig
        ? { provider_config: preferences.providerConfig }
        : {}),
      provider_preference: preferences?.providerPreference,
      model_preference: preferences?.modelPreference,
      reasoning_effort: preferences?.reasoningEffort?.trim() || undefined,
      thinking_enabled: preferences?.thinking,
      approval_policy: preferences?.approvalPolicy,
      sandbox_policy: preferences?.sandboxPolicy,
      execution_strategy: preferences?.executionStrategy,
      web_search: preferences?.webSearch,
      ...(preferences?.searchMode
        ? { search_mode: preferences.searchMode }
        : {}),
      auto_continue: preferences?.autoContinue,
      system_prompt: op.systemPrompt,
      metadata: op.metadata,
    },
    queue_if_busy: op.queueIfBusy,
    queued_turn_id: op.queuedTurnId,
    skip_pre_submit_resume: op.skipPreSubmitResume,
  };
}
