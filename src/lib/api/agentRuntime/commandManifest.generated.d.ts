/**
 * 由 scripts/generate-agent-runtime-clients.mjs 自动生成，请勿手改。
 */

export declare const AGENT_RUNTIME_COMMANDS: {
  readonly submitTurn: "agent_runtime_submit_turn";
  readonly interruptTurn: "agent_runtime_interrupt_turn";
  readonly compactSession: "agent_runtime_compact_session";
  readonly resumeThread: "agent_runtime_resume_thread";
  readonly replayRequest: "agent_runtime_replay_request";
  readonly getThreadRead: "agent_runtime_get_thread_read";
  readonly getObjective: "agent_runtime_get_objective";
  readonly setObjective: "agent_runtime_set_objective";
  readonly updateObjectiveStatus: "agent_runtime_update_objective_status";
  readonly clearObjective: "agent_runtime_clear_objective";
  readonly continueObjective: "agent_runtime_continue_objective";
  readonly auditObjective: "agent_runtime_audit_objective";
  readonly listFileCheckpoints: "agent_runtime_list_file_checkpoints";
  readonly getFileCheckpoint: "agent_runtime_get_file_checkpoint";
  readonly diffFileCheckpoint: "agent_runtime_diff_file_checkpoint";
  readonly restoreFileCheckpoint: "agent_runtime_restore_file_checkpoint";
  readonly promoteQueuedTurn: "agent_runtime_promote_queued_turn";
  readonly removeQueuedTurn: "agent_runtime_remove_queued_turn";
  readonly respondAction: "agent_runtime_respond_action";
  readonly createSession: "agent_runtime_create_session";
  readonly listSessions: "agent_runtime_list_sessions";
  readonly getSession: "agent_runtime_get_session";
  readonly updateSession: "agent_runtime_update_session";
  readonly deleteSession: "agent_runtime_delete_session";
  readonly exportAnalysisHandoff: "agent_runtime_export_analysis_handoff";
  readonly exportHandoffBundle: "agent_runtime_export_handoff_bundle";
  readonly exportEvidencePack: "agent_runtime_export_evidence_pack";
  readonly exportReviewDecisionTemplate: "agent_runtime_export_review_decision_template";
  readonly saveReviewDecision: "agent_runtime_save_review_decision";
  readonly exportReplayCase: "agent_runtime_export_replay_case";
  readonly getToolInventory: "agent_runtime_get_tool_inventory";
  readonly listWorkspaceSkillBindings: "agent_runtime_list_workspace_skill_bindings";
  readonly spawnSubagent: "agent_runtime_spawn_subagent";
  readonly sendSubagentInput: "agent_runtime_send_subagent_input";
  readonly waitSubagents: "agent_runtime_wait_subagents";
  readonly resumeSubagent: "agent_runtime_resume_subagent";
  readonly closeSubagent: "agent_runtime_close_subagent";
};

export type AgentRuntimeCommandKey = keyof typeof AGENT_RUNTIME_COMMANDS;
export type AgentRuntimeCommandName =
  (typeof AGENT_RUNTIME_COMMANDS)[AgentRuntimeCommandKey];
export type AgentRuntimeCommandDomain = "thread" | "session" | "export" | "inventory" | "subagent";
export type AgentRuntimeCommandLifecycle = "current" | "compat" | "deprecated";
export type AgentRuntimeCommandMockStrategy = "default-mock" | "mock-priority" | "bridge-only";

export interface AgentRuntimeCommandDescriptor {
  readonly key: AgentRuntimeCommandKey;
  readonly command: AgentRuntimeCommandName;
  readonly domain: AgentRuntimeCommandDomain;
  readonly requestType: string;
  readonly responseType: string;
  readonly lifecycle: AgentRuntimeCommandLifecycle;
  readonly mockStrategy: AgentRuntimeCommandMockStrategy;
  readonly docsSection: string;
}

export declare const AGENT_RUNTIME_COMMAND_DESCRIPTORS: readonly [
  {
    readonly key: "submitTurn";
    readonly command: "agent_runtime_submit_turn";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeSubmitTurnRequest";
    readonly responseType: "void";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "interruptTurn";
    readonly command: "agent_runtime_interrupt_turn";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeInterruptTurnRequest";
    readonly responseType: "boolean";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "compactSession";
    readonly command: "agent_runtime_compact_session";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeCompactSessionRequest";
    readonly responseType: "void";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "resumeThread";
    readonly command: "agent_runtime_resume_thread";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeResumeThreadRequest";
    readonly responseType: "boolean";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "replayRequest";
    readonly command: "agent_runtime_replay_request";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeReplayRequestRequest";
    readonly responseType: "AgentRuntimeReplayedActionRequiredView | null";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "getThreadRead";
    readonly command: "agent_runtime_get_thread_read";
    readonly domain: "thread";
    readonly requestType: "{ sessionId: string }";
    readonly responseType: "AgentRuntimeThreadReadModel";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "getObjective";
    readonly command: "agent_runtime_get_objective";
    readonly domain: "thread";
    readonly requestType: "{ sessionId: string }";
    readonly responseType: "ManagedObjective | null";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "setObjective";
    readonly command: "agent_runtime_set_objective";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeSetObjectiveRequest";
    readonly responseType: "ManagedObjective";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "updateObjectiveStatus";
    readonly command: "agent_runtime_update_objective_status";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeUpdateObjectiveStatusRequest";
    readonly responseType: "ManagedObjective | null";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "clearObjective";
    readonly command: "agent_runtime_clear_objective";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeObjectiveSessionRequest";
    readonly responseType: "AgentRuntimeClearObjectiveResult";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "continueObjective";
    readonly command: "agent_runtime_continue_objective";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeObjectiveSessionRequest";
    readonly responseType: "AgentRuntimeContinueObjectiveResult";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "auditObjective";
    readonly command: "agent_runtime_audit_objective";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeObjectiveSessionRequest";
    readonly responseType: "ManagedObjective";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "listFileCheckpoints";
    readonly command: "agent_runtime_list_file_checkpoints";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeListFileCheckpointsRequest";
    readonly responseType: "AgentRuntimeFileCheckpointListResult";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "getFileCheckpoint";
    readonly command: "agent_runtime_get_file_checkpoint";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeGetFileCheckpointRequest";
    readonly responseType: "AgentRuntimeFileCheckpointDetail";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "diffFileCheckpoint";
    readonly command: "agent_runtime_diff_file_checkpoint";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeDiffFileCheckpointRequest";
    readonly responseType: "AgentRuntimeFileCheckpointDiffResult";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "restoreFileCheckpoint";
    readonly command: "agent_runtime_restore_file_checkpoint";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeRestoreFileCheckpointRequest";
    readonly responseType: "AgentRuntimeFileCheckpointRestoreResult";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "promoteQueuedTurn";
    readonly command: "agent_runtime_promote_queued_turn";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimePromoteQueuedTurnRequest";
    readonly responseType: "boolean";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "removeQueuedTurn";
    readonly command: "agent_runtime_remove_queued_turn";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeRemoveQueuedTurnRequest";
    readonly responseType: "boolean";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "respondAction";
    readonly command: "agent_runtime_respond_action";
    readonly domain: "thread";
    readonly requestType: "AgentRuntimeRespondActionRequest";
    readonly responseType: "void";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.thread";
  },
  {
    readonly key: "createSession";
    readonly command: "agent_runtime_create_session";
    readonly domain: "session";
    readonly requestType: "{ workspaceId: string; name?: string; executionStrategy?: AsterExecutionStrategy }";
    readonly responseType: "string";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.session";
  },
  {
    readonly key: "listSessions";
    readonly command: "agent_runtime_list_sessions";
    readonly domain: "session";
    readonly requestType: "{ includeArchived?: boolean; archivedOnly?: boolean; workspaceId?: string; limit?: number } | void";
    readonly responseType: "AsterSessionInfo[]";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.session";
  },
  {
    readonly key: "getSession";
    readonly command: "agent_runtime_get_session";
    readonly domain: "session";
    readonly requestType: "{ sessionId: string; resumeSessionStartHooks?: boolean; historyLimit?: number; historyOffset?: number; historyBeforeMessageId?: number }";
    readonly responseType: "AsterSessionDetail";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.session";
  },
  {
    readonly key: "updateSession";
    readonly command: "agent_runtime_update_session";
    readonly domain: "session";
    readonly requestType: "AgentRuntimeUpdateSessionRequest";
    readonly responseType: "void";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.session";
  },
  {
    readonly key: "deleteSession";
    readonly command: "agent_runtime_delete_session";
    readonly domain: "session";
    readonly requestType: "{ sessionId: string }";
    readonly responseType: "void";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.session";
  },
  {
    readonly key: "exportAnalysisHandoff";
    readonly command: "agent_runtime_export_analysis_handoff";
    readonly domain: "export";
    readonly requestType: "{ sessionId: string }";
    readonly responseType: "AgentRuntimeAnalysisHandoff";
    readonly lifecycle: "current";
    readonly mockStrategy: "mock-priority";
    readonly docsSection: "agent-runtime.export";
  },
  {
    readonly key: "exportHandoffBundle";
    readonly command: "agent_runtime_export_handoff_bundle";
    readonly domain: "export";
    readonly requestType: "{ sessionId: string }";
    readonly responseType: "AgentRuntimeHandoffBundle";
    readonly lifecycle: "current";
    readonly mockStrategy: "mock-priority";
    readonly docsSection: "agent-runtime.export";
  },
  {
    readonly key: "exportEvidencePack";
    readonly command: "agent_runtime_export_evidence_pack";
    readonly domain: "export";
    readonly requestType: "{ sessionId: string }";
    readonly responseType: "AgentRuntimeEvidencePack";
    readonly lifecycle: "current";
    readonly mockStrategy: "mock-priority";
    readonly docsSection: "agent-runtime.export";
  },
  {
    readonly key: "exportReviewDecisionTemplate";
    readonly command: "agent_runtime_export_review_decision_template";
    readonly domain: "export";
    readonly requestType: "{ sessionId: string }";
    readonly responseType: "AgentRuntimeReviewDecisionTemplate";
    readonly lifecycle: "current";
    readonly mockStrategy: "mock-priority";
    readonly docsSection: "agent-runtime.export";
  },
  {
    readonly key: "saveReviewDecision";
    readonly command: "agent_runtime_save_review_decision";
    readonly domain: "export";
    readonly requestType: "AgentRuntimeSaveReviewDecisionRequest";
    readonly responseType: "AgentRuntimeReviewDecisionTemplate";
    readonly lifecycle: "current";
    readonly mockStrategy: "mock-priority";
    readonly docsSection: "agent-runtime.export";
  },
  {
    readonly key: "exportReplayCase";
    readonly command: "agent_runtime_export_replay_case";
    readonly domain: "export";
    readonly requestType: "{ sessionId: string }";
    readonly responseType: "AgentRuntimeReplayCase";
    readonly lifecycle: "current";
    readonly mockStrategy: "mock-priority";
    readonly docsSection: "agent-runtime.export";
  },
  {
    readonly key: "getToolInventory";
    readonly command: "agent_runtime_get_tool_inventory";
    readonly domain: "inventory";
    readonly requestType: "AgentRuntimeToolInventoryRequest";
    readonly responseType: "AgentRuntimeToolInventory";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.inventory";
  },
  {
    readonly key: "listWorkspaceSkillBindings";
    readonly command: "agent_runtime_list_workspace_skill_bindings";
    readonly domain: "inventory";
    readonly requestType: "AgentRuntimeListWorkspaceSkillBindingsRequest";
    readonly responseType: "AgentRuntimeWorkspaceSkillBindings";
    readonly lifecycle: "current";
    readonly mockStrategy: "mock-priority";
    readonly docsSection: "agent-runtime.inventory";
  },
  {
    readonly key: "spawnSubagent";
    readonly command: "agent_runtime_spawn_subagent";
    readonly domain: "subagent";
    readonly requestType: "AgentRuntimeSpawnSubagentRequest";
    readonly responseType: "AgentRuntimeSpawnSubagentResponse";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.subagent";
  },
  {
    readonly key: "sendSubagentInput";
    readonly command: "agent_runtime_send_subagent_input";
    readonly domain: "subagent";
    readonly requestType: "AgentRuntimeSendSubagentInputRequest";
    readonly responseType: "AgentRuntimeSendSubagentInputResponse";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.subagent";
  },
  {
    readonly key: "waitSubagents";
    readonly command: "agent_runtime_wait_subagents";
    readonly domain: "subagent";
    readonly requestType: "AgentRuntimeWaitSubagentsRequest";
    readonly responseType: "AgentRuntimeWaitSubagentsResponse";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.subagent";
  },
  {
    readonly key: "resumeSubagent";
    readonly command: "agent_runtime_resume_subagent";
    readonly domain: "subagent";
    readonly requestType: "AgentRuntimeResumeSubagentRequest";
    readonly responseType: "AgentRuntimeResumeSubagentResponse";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.subagent";
  },
  {
    readonly key: "closeSubagent";
    readonly command: "agent_runtime_close_subagent";
    readonly domain: "subagent";
    readonly requestType: "AgentRuntimeCloseSubagentRequest";
    readonly responseType: "AgentRuntimeCloseSubagentResponse";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.subagent";
  },
];

export declare const AGENT_RUNTIME_COMMAND_NAMES: readonly [
  "agent_runtime_submit_turn",
  "agent_runtime_interrupt_turn",
  "agent_runtime_compact_session",
  "agent_runtime_resume_thread",
  "agent_runtime_replay_request",
  "agent_runtime_get_thread_read",
  "agent_runtime_get_objective",
  "agent_runtime_set_objective",
  "agent_runtime_update_objective_status",
  "agent_runtime_clear_objective",
  "agent_runtime_continue_objective",
  "agent_runtime_audit_objective",
  "agent_runtime_list_file_checkpoints",
  "agent_runtime_get_file_checkpoint",
  "agent_runtime_diff_file_checkpoint",
  "agent_runtime_restore_file_checkpoint",
  "agent_runtime_promote_queued_turn",
  "agent_runtime_remove_queued_turn",
  "agent_runtime_respond_action",
  "agent_runtime_create_session",
  "agent_runtime_list_sessions",
  "agent_runtime_get_session",
  "agent_runtime_update_session",
  "agent_runtime_delete_session",
  "agent_runtime_export_analysis_handoff",
  "agent_runtime_export_handoff_bundle",
  "agent_runtime_export_evidence_pack",
  "agent_runtime_export_review_decision_template",
  "agent_runtime_save_review_decision",
  "agent_runtime_export_replay_case",
  "agent_runtime_get_tool_inventory",
  "agent_runtime_list_workspace_skill_bindings",
  "agent_runtime_spawn_subagent",
  "agent_runtime_send_subagent_input",
  "agent_runtime_wait_subagents",
  "agent_runtime_resume_subagent",
  "agent_runtime_close_subagent",
];

export declare const AGENT_RUNTIME_COMMANDS_BY_DOMAIN: {
  readonly "thread": readonly [
    "agent_runtime_submit_turn",
    "agent_runtime_interrupt_turn",
    "agent_runtime_compact_session",
    "agent_runtime_resume_thread",
    "agent_runtime_replay_request",
    "agent_runtime_get_thread_read",
    "agent_runtime_get_objective",
    "agent_runtime_set_objective",
    "agent_runtime_update_objective_status",
    "agent_runtime_clear_objective",
    "agent_runtime_continue_objective",
    "agent_runtime_audit_objective",
    "agent_runtime_list_file_checkpoints",
    "agent_runtime_get_file_checkpoint",
    "agent_runtime_diff_file_checkpoint",
    "agent_runtime_restore_file_checkpoint",
    "agent_runtime_promote_queued_turn",
    "agent_runtime_remove_queued_turn",
    "agent_runtime_respond_action",
  ];
  readonly "session": readonly [
    "agent_runtime_create_session",
    "agent_runtime_list_sessions",
    "agent_runtime_get_session",
    "agent_runtime_update_session",
    "agent_runtime_delete_session",
  ];
  readonly "export": readonly [
    "agent_runtime_export_analysis_handoff",
    "agent_runtime_export_handoff_bundle",
    "agent_runtime_export_evidence_pack",
    "agent_runtime_export_review_decision_template",
    "agent_runtime_save_review_decision",
    "agent_runtime_export_replay_case",
  ];
  readonly "inventory": readonly [
    "agent_runtime_get_tool_inventory",
    "agent_runtime_list_workspace_skill_bindings",
  ];
  readonly "subagent": readonly [
    "agent_runtime_spawn_subagent",
    "agent_runtime_send_subagent_input",
    "agent_runtime_wait_subagents",
    "agent_runtime_resume_subagent",
    "agent_runtime_close_subagent",
  ];
};
