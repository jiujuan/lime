/**
 * 由 scripts/generate-agent-runtime-clients.mjs 自动生成，请勿手改。
 */

export const AGENT_RUNTIME_COMMANDS = {
  submitTurn: "agent_runtime_submit_turn",
  interruptTurn: "agent_runtime_interrupt_turn",
  getThreadRead: "agent_runtime_get_thread_read",
  respondAction: "agent_runtime_respond_action",
  createSession: "agent_runtime_create_session",
  listSessions: "agent_runtime_list_sessions",
  getSession: "agent_runtime_get_session",
  updateSession: "agent_runtime_update_session",
  exportEvidencePack: "agent_runtime_export_evidence_pack",
  getToolInventory: "agent_runtime_get_tool_inventory",
  listWorkspaceSkillBindings: "agent_runtime_list_workspace_skill_bindings",
} as const;

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

export const AGENT_RUNTIME_COMMAND_DESCRIPTORS = [
  {
    key: "submitTurn",
    command: AGENT_RUNTIME_COMMANDS.submitTurn,
    domain: "thread",
    requestType: "AgentRuntimeSubmitTurnRequest",
    responseType: "void",
    lifecycle: "current",
    mockStrategy: "bridge-only",
    docsSection: "agent-runtime.thread",
  },
  {
    key: "interruptTurn",
    command: AGENT_RUNTIME_COMMANDS.interruptTurn,
    domain: "thread",
    requestType: "AgentRuntimeInterruptTurnRequest",
    responseType: "boolean",
    lifecycle: "current",
    mockStrategy: "bridge-only",
    docsSection: "agent-runtime.thread",
  },
  {
    key: "getThreadRead",
    command: AGENT_RUNTIME_COMMANDS.getThreadRead,
    domain: "thread",
    requestType: "{ sessionId: string }",
    responseType: "AgentRuntimeThreadReadModel",
    lifecycle: "current",
    mockStrategy: "bridge-only",
    docsSection: "agent-runtime.thread",
  },
  {
    key: "respondAction",
    command: AGENT_RUNTIME_COMMANDS.respondAction,
    domain: "thread",
    requestType: "AgentRuntimeRespondActionRequest",
    responseType: "void",
    lifecycle: "current",
    mockStrategy: "bridge-only",
    docsSection: "agent-runtime.thread",
  },
  {
    key: "createSession",
    command: AGENT_RUNTIME_COMMANDS.createSession,
    domain: "session",
    requestType: "{ workspaceId: string; name?: string; executionStrategy?: AsterExecutionStrategy }",
    responseType: "string",
    lifecycle: "compat",
    mockStrategy: "bridge-only",
    docsSection: "agent-runtime.session",
  },
  {
    key: "listSessions",
    command: AGENT_RUNTIME_COMMANDS.listSessions,
    domain: "session",
    requestType: "{ includeArchived?: boolean; archivedOnly?: boolean; workspaceId?: string; limit?: number } | void",
    responseType: "AsterSessionInfo[]",
    lifecycle: "compat",
    mockStrategy: "bridge-only",
    docsSection: "agent-runtime.session",
  },
  {
    key: "getSession",
    command: AGENT_RUNTIME_COMMANDS.getSession,
    domain: "session",
    requestType: "{ sessionId: string; resumeSessionStartHooks?: boolean; historyLimit?: number; historyOffset?: number; historyBeforeMessageId?: number }",
    responseType: "AsterSessionDetail",
    lifecycle: "compat",
    mockStrategy: "bridge-only",
    docsSection: "agent-runtime.session",
  },
  {
    key: "updateSession",
    command: AGENT_RUNTIME_COMMANDS.updateSession,
    domain: "session",
    requestType: "AgentRuntimeUpdateSessionRequest",
    responseType: "void",
    lifecycle: "compat",
    mockStrategy: "bridge-only",
    docsSection: "agent-runtime.session",
  },
  {
    key: "exportEvidencePack",
    command: AGENT_RUNTIME_COMMANDS.exportEvidencePack,
    domain: "export",
    requestType: "{ sessionId: string }",
    responseType: "AgentRuntimeEvidencePack",
    lifecycle: "current",
    mockStrategy: "bridge-only",
    docsSection: "agent-runtime.export",
  },
  {
    key: "getToolInventory",
    command: AGENT_RUNTIME_COMMANDS.getToolInventory,
    domain: "inventory",
    requestType: "AgentRuntimeToolInventoryRequest",
    responseType: "AgentRuntimeToolInventory",
    lifecycle: "current",
    mockStrategy: "bridge-only",
    docsSection: "agent-runtime.inventory",
  },
  {
    key: "listWorkspaceSkillBindings",
    command: AGENT_RUNTIME_COMMANDS.listWorkspaceSkillBindings,
    domain: "inventory",
    requestType: "AgentRuntimeListWorkspaceSkillBindingsRequest",
    responseType: "AgentRuntimeWorkspaceSkillBindings",
    lifecycle: "compat",
    mockStrategy: "bridge-only",
    docsSection: "agent-runtime.inventory",
  },
] as const satisfies readonly AgentRuntimeCommandDescriptor[];

export const AGENT_RUNTIME_COMMAND_NAMES = [
  AGENT_RUNTIME_COMMANDS.submitTurn,
  AGENT_RUNTIME_COMMANDS.interruptTurn,
  AGENT_RUNTIME_COMMANDS.getThreadRead,
  AGENT_RUNTIME_COMMANDS.respondAction,
  AGENT_RUNTIME_COMMANDS.createSession,
  AGENT_RUNTIME_COMMANDS.listSessions,
  AGENT_RUNTIME_COMMANDS.getSession,
  AGENT_RUNTIME_COMMANDS.updateSession,
  AGENT_RUNTIME_COMMANDS.exportEvidencePack,
  AGENT_RUNTIME_COMMANDS.getToolInventory,
  AGENT_RUNTIME_COMMANDS.listWorkspaceSkillBindings,
] as const satisfies readonly AgentRuntimeCommandName[];

export const AGENT_RUNTIME_COMMANDS_BY_DOMAIN = {
  "thread": [
    AGENT_RUNTIME_COMMANDS.submitTurn,
    AGENT_RUNTIME_COMMANDS.interruptTurn,
    AGENT_RUNTIME_COMMANDS.getThreadRead,
    AGENT_RUNTIME_COMMANDS.respondAction,
  ],
  "session": [
    AGENT_RUNTIME_COMMANDS.createSession,
    AGENT_RUNTIME_COMMANDS.listSessions,
    AGENT_RUNTIME_COMMANDS.getSession,
    AGENT_RUNTIME_COMMANDS.updateSession,
  ],
  "export": [
    AGENT_RUNTIME_COMMANDS.exportEvidencePack,
  ],
  "inventory": [
    AGENT_RUNTIME_COMMANDS.getToolInventory,
    AGENT_RUNTIME_COMMANDS.listWorkspaceSkillBindings,
  ],
} as const satisfies Record<
  AgentRuntimeCommandDomain,
  readonly AgentRuntimeCommandName[]
>;
