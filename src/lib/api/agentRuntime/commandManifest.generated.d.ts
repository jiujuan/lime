/**
 * 由 scripts/generate-agent-runtime-clients.mjs 自动生成，请勿手改。
 */

export declare const AGENT_RUNTIME_COMMANDS: {
  readonly submitTurn: "agent_runtime_submit_turn";
  readonly interruptTurn: "agent_runtime_interrupt_turn";
  readonly getThreadRead: "agent_runtime_get_thread_read";
  readonly respondAction: "agent_runtime_respond_action";
  readonly createSession: "agent_runtime_create_session";
  readonly listSessions: "agent_runtime_list_sessions";
  readonly getSession: "agent_runtime_get_session";
  readonly updateSession: "agent_runtime_update_session";
  readonly exportEvidencePack: "agent_runtime_export_evidence_pack";
  readonly getToolInventory: "agent_runtime_get_tool_inventory";
  readonly listWorkspaceSkillBindings: "agent_runtime_list_workspace_skill_bindings";
};

export type AgentRuntimeCommandKey = keyof typeof AGENT_RUNTIME_COMMANDS;
export type AgentRuntimeCommandName =
  (typeof AGENT_RUNTIME_COMMANDS)[AgentRuntimeCommandKey];
export type AgentRuntimeCommandDomain = "thread" | "session" | "export" | "inventory";
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
    readonly lifecycle: "compat";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.session";
  },
  {
    readonly key: "listSessions";
    readonly command: "agent_runtime_list_sessions";
    readonly domain: "session";
    readonly requestType: "{ includeArchived?: boolean; archivedOnly?: boolean; workspaceId?: string; limit?: number } | void";
    readonly responseType: "AsterSessionInfo[]";
    readonly lifecycle: "compat";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.session";
  },
  {
    readonly key: "getSession";
    readonly command: "agent_runtime_get_session";
    readonly domain: "session";
    readonly requestType: "{ sessionId: string; resumeSessionStartHooks?: boolean; historyLimit?: number; historyOffset?: number; historyBeforeMessageId?: number }";
    readonly responseType: "AsterSessionDetail";
    readonly lifecycle: "compat";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.session";
  },
  {
    readonly key: "updateSession";
    readonly command: "agent_runtime_update_session";
    readonly domain: "session";
    readonly requestType: "AgentRuntimeUpdateSessionRequest";
    readonly responseType: "void";
    readonly lifecycle: "compat";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.session";
  },
  {
    readonly key: "exportEvidencePack";
    readonly command: "agent_runtime_export_evidence_pack";
    readonly domain: "export";
    readonly requestType: "{ sessionId: string }";
    readonly responseType: "AgentRuntimeEvidencePack";
    readonly lifecycle: "current";
    readonly mockStrategy: "bridge-only";
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
    readonly lifecycle: "compat";
    readonly mockStrategy: "bridge-only";
    readonly docsSection: "agent-runtime.inventory";
  },
];

export declare const AGENT_RUNTIME_COMMAND_NAMES: readonly [
  "agent_runtime_submit_turn",
  "agent_runtime_interrupt_turn",
  "agent_runtime_get_thread_read",
  "agent_runtime_respond_action",
  "agent_runtime_create_session",
  "agent_runtime_list_sessions",
  "agent_runtime_get_session",
  "agent_runtime_update_session",
  "agent_runtime_export_evidence_pack",
  "agent_runtime_get_tool_inventory",
  "agent_runtime_list_workspace_skill_bindings",
];

export declare const AGENT_RUNTIME_COMMANDS_BY_DOMAIN: {
  readonly "thread": readonly [
    "agent_runtime_submit_turn",
    "agent_runtime_interrupt_turn",
    "agent_runtime_get_thread_read",
    "agent_runtime_respond_action",
  ];
  readonly "session": readonly [
    "agent_runtime_create_session",
    "agent_runtime_list_sessions",
    "agent_runtime_get_session",
    "agent_runtime_update_session",
  ];
  readonly "export": readonly [
    "agent_runtime_export_evidence_pack",
  ];
  readonly "inventory": readonly [
    "agent_runtime_get_tool_inventory",
    "agent_runtime_list_workspace_skill_bindings",
  ];
};
