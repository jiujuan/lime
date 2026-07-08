import type {
  AsterApprovalPolicy,
  AsterExecutionStrategy,
  AsterSandboxPolicy,
  AsterSessionExecutionRuntimeAccessMode,
  AsterSessionExecutionRuntimePreferences,
  AsterSessionExecutionRuntimeRecentTeamSelection,
} from "../agentExecutionRuntime";
import type { AgentRuntimeResumeActionDecision } from "@limecloud/agent-ui-contracts";
import type {
  AutoContinueRequestPayload,
  ImageInput,
  RuntimeProviderConfig,
} from "./sessionTypes";

export type AgentRuntimeWebSearchMode = "disabled" | "auto" | "required";

export interface AgentTurnConfigSnapshot {
  provider_config?: RuntimeProviderConfig;
  provider_preference?: string;
  model_preference?: string;
  reasoning_effort?: string;
  thinking_enabled?: boolean;
  approval_policy?: AsterApprovalPolicy;
  sandbox_policy?: AsterSandboxPolicy;
  execution_strategy?: AsterExecutionStrategy;
  web_search?: boolean;
  search_mode?: AgentRuntimeWebSearchMode;
  auto_continue?: AutoContinueRequestPayload;
  system_prompt?: string;
  expected_output?: unknown;
  structured_output?: Record<string, unknown>;
  output_schema?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeSubmitTurnRequest {
  message: string;
  session_id: string;
  event_name: string;
  workspace_id?: string;
  turn_id?: string;
  images?: ImageInput[];
  turn_config?: AgentTurnConfigSnapshot;
  expected_output?: unknown;
  structured_output?: Record<string, unknown>;
  output_schema?: unknown;
  queue_if_busy?: boolean;
  queued_turn_id?: string;
  skip_pre_submit_resume?: boolean;
}

export interface AgentRuntimeCreateSessionOptions {
  runStartHooks?: boolean;
  workingDir?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeInterruptTurnRequest {
  session_id: string;
  turn_id?: string;
  event_name?: string;
}

export interface AgentRuntimeCompactSessionRequest {
  session_id: string;
  event_name: string;
}

export interface AgentRuntimeResumeThreadRequest {
  session_id: string;
  turn_id?: string;
  open_action_ids?: string[];
  decisions?: AgentRuntimeResumeActionDecision[];
}

export interface AgentRuntimeCapabilityManifestRequest {
  app_id?: string;
  workspace_id?: string;
  session_id?: string;
  cursor?: string;
  limit?: number;
}

export interface AgentRuntimeGetSessionOptions {
  resumeSessionStartHooks?: boolean;
  /**
   * 前端诊断来源，只进入客户端日志和性能指标，不透传到 App Server。
   */
  source?: string;
  /**
   * 限制返回的历史窗口数量；传 0 表示请求完整历史。
   */
  historyLimit?: number;
  /**
   * 从最新历史向前跳过的消息数量，用于加载更早历史分页。
   */
  historyOffset?: number;
  /**
   * 稳定游标：读取指定后端消息 ID 之前的更早历史，优先于 offset。
   */
  historyBeforeMessageId?: number;
}

export interface AgentRuntimeReplayRequestRequest {
  session_id: string;
  request_id: string;
}

export interface AgentRuntimeListFileCheckpointsRequest {
  session_id: string;
}

export interface AgentRuntimeGetFileCheckpointRequest {
  session_id: string;
  checkpoint_id: string;
}

export interface AgentRuntimeDiffFileCheckpointRequest {
  session_id: string;
  checkpoint_id: string;
}

export interface AgentRuntimeRestoreFileCheckpointRequest {
  session_id: string;
  checkpoint_id: string;
  confirm_restore: boolean;
  create_backup?: boolean;
}

export interface AgentRuntimeRemoveQueuedTurnRequest {
  session_id: string;
  queued_turn_id: string;
}

export interface AgentRuntimePromoteQueuedTurnRequest {
  session_id: string;
  queued_turn_id: string;
}

export interface AgentRuntimeRespondActionRequest {
  session_id: string;
  request_id: string;
  action_type: "tool_confirmation" | "ask_user" | "elicitation";
  confirmed: boolean;
  response?: string;
  user_data?: unknown;
  metadata?: Record<string, unknown>;
  event_name?: string;
  action_scope?: {
    session_id?: string;
    thread_id?: string;
    turn_id?: string;
  };
}

export interface AgentRuntimeReplayedActionRequiredView {
  type: "action_required";
  request_id: string;
  action_type: "tool_confirmation" | "ask_user" | "elicitation";
  tool_name?: string;
  arguments?: Record<string, unknown>;
  prompt?: string;
  questions?: unknown;
  requested_schema?: Record<string, unknown>;
  scope?: {
    session_id?: string;
    thread_id?: string;
    turn_id?: string;
  };
}

export interface AgentRuntimeUpdateSessionRequest {
  session_id: string;
  name?: string;
  provider_selector?: string;
  provider_name?: string;
  model_name?: string;
  execution_strategy?: AsterExecutionStrategy;
  archived?: boolean;
  recent_access_mode?: AsterSessionExecutionRuntimeAccessMode;
  recent_preferences?: AsterSessionExecutionRuntimePreferences;
  recent_team_selection?: AsterSessionExecutionRuntimeRecentTeamSelection;
  article_workspace_selected_object_ref?: Record<string, unknown> | null;
  article_workspace_edited_draft?: Record<string, unknown> | null;
}

export interface AgentRuntimeFrontmatterHookMatcher {
  matcher?: string;
  hooks: AgentRuntimeFrontmatterHook[];
}

export type AgentRuntimeFrontmatterHook =
  | {
      type: "command";
      command: string;
      timeout?: number;
      once?: boolean;
      shell?: string;
      if?: string;
      statusMessage?: string;
      async?: boolean;
      asyncRewake?: boolean;
    }
  | {
      type: "prompt";
      prompt: string;
      timeout?: number;
      model?: string;
      once?: boolean;
      if?: string;
      statusMessage?: string;
    }
  | {
      type: "agent";
      prompt: string;
      timeout?: number;
      model?: string;
      once?: boolean;
      if?: string;
      statusMessage?: string;
    }
  | {
      type: "http" | "url";
      url: string;
      timeout?: number;
      headers?: Record<string, string>;
      once?: boolean;
      if?: string;
      statusMessage?: string;
      allowedEnvVars?: string[];
    };

export type AgentRuntimeFrontmatterHooks = Partial<
  Record<string, AgentRuntimeFrontmatterHookMatcher[]>
>;

export interface AgentRuntimeSpawnSubagentRequest {
  parent_session_id: string;
  message: string;
  name?: string;
  team_name?: string;
  agent_type?: string;
  model?: string;
  run_in_background?: boolean;
  mode?: string;
  isolation?: "worktree" | "remote" | string;
  reasoning_effort?: string;
  fork_context?: boolean;
  blueprint_role_id?: string;
  blueprint_role_label?: string;
  profile_id?: string;
  profile_name?: string;
  role_key?: string;
  skill_ids?: string[];
  skill_directories?: string[];
  team_preset_id?: string;
  theme?: string;
  system_overlay?: string;
  output_contract?: string;
  hooks?: AgentRuntimeFrontmatterHooks;
  allowed_tools?: string[];
  disallowed_tools?: string[];
  cwd?: string;
}

export interface AgentRuntimeSpawnSubagentResponse {
  agent_id: string;
  nickname?: string;
}

export interface AgentRuntimeSendSubagentInputRequest {
  id: string;
  message: string;
  interrupt?: boolean;
}

export interface AgentRuntimeSendSubagentInputResponse {
  submission_id: string;
}

export interface AgentRuntimeStatusSnapshot {
  session_id: string;
  kind:
    | "idle"
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "aborted"
    | "closed"
    | "not_found";
  latest_turn_id?: string;
  latest_turn_status?:
    | "idle"
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "aborted"
    | "closed"
    | "not_found";
  queued_turn_count?: number;
  closed?: boolean;
}

export interface AgentRuntimeWaitSubagentsRequest {
  ids: string[];
  timeout_ms?: number;
}

export interface AgentRuntimeWaitSubagentsResponse {
  status: Record<string, AgentRuntimeStatusSnapshot>;
  timed_out: boolean;
}

export interface AgentRuntimeResumeSubagentRequest {
  id: string;
}

export interface AgentRuntimeResumeSubagentResponse {
  status: AgentRuntimeStatusSnapshot;
  cascade_session_ids: string[];
  changed_session_ids: string[];
}

export interface AgentRuntimeCloseSubagentRequest {
  id: string;
}

export interface AgentRuntimeCloseSubagentResponse {
  previous_status: AgentRuntimeStatusSnapshot;
  cascade_session_ids: string[];
  changed_session_ids: string[];
}
