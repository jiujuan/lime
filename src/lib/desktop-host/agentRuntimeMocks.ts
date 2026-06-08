import agentCommandCatalog from "../governance/agentCommandCatalog.json";
import { agentRuntimeObjectiveMocks } from "./agentRuntimeObjectiveMocks";

const createDeprecatedCommandMock =
  (command: string, replacement: string) => () => {
    throw new Error(
      `命令 ${command} 已废弃，请迁移到 ${replacement}。Mock 不再为旧链路伪造成功结果。`,
    );
  };

const deprecatedAgentCommandReplacements =
  agentCommandCatalog.deprecatedCommandReplacements as Record<string, string>;

const deprecatedAgentCommandMocks = Object.fromEntries(
  Object.entries(deprecatedAgentCommandReplacements)
    .filter(([, replacement]) => !replacement.startsWith("agentApp"))
    .map(([command, replacement]) => [
      command,
      createDeprecatedCommandMock(command, replacement),
    ]),
) as Record<string, () => never>;

const createAppServerSessionCurrentMock =
  (command: string, method: string) => () => {
    throw new Error(
      `命令 ${command} 已迁移到 App Server JSON-RPC ${method}，Mock 不再为旧 session 链路伪造成功结果。`,
    );
  };

const createAgentRuntimeResidualMock =
  (command: string, surface: string) => () => {
    throw new Error(
      `命令 ${command} 仍属于 P9 Agent Runtime ${surface} legacy residual，Mock 不再为旧链路伪造成功结果；请迁移到 App Server current 主链或在测试中显式注册夹具。`,
    );
  };

export const agentRuntimeMocks: Record<string, (args?: any) => any> = {
  ...deprecatedAgentCommandMocks,
  ...agentRuntimeObjectiveMocks,
  agent_get_process_status: () => ({ running: false }),
  agent_start_process: () => ({ success: true }),
  agent_stop_process: () => ({ success: true }),

  // Aster Agent
  aster_agent_init: () => ({ initialized: true, provider_configured: false }),
  aster_agent_status: () => ({
    initialized: false,
    provider_configured: false,
  }),
  aster_agent_configure_provider: () => ({
    initialized: true,
    provider_configured: true,
  }),
  agent_runtime_create_session: createAppServerSessionCurrentMock(
    "agent_runtime_create_session",
    "agentSession/start",
  ),
  agent_runtime_list_sessions: createAppServerSessionCurrentMock(
    "agent_runtime_list_sessions",
    "agentSession/list",
  ),
  agent_runtime_get_session: createAppServerSessionCurrentMock(
    "agent_runtime_get_session",
    "agentSession/read",
  ),
  agent_runtime_list_file_checkpoints: createAgentRuntimeResidualMock(
    "agent_runtime_list_file_checkpoints",
    "checkpoint",
  ),
  agent_runtime_get_file_checkpoint: createAgentRuntimeResidualMock(
    "agent_runtime_get_file_checkpoint",
    "checkpoint",
  ),
  agent_runtime_diff_file_checkpoint: createAgentRuntimeResidualMock(
    "agent_runtime_diff_file_checkpoint",
    "checkpoint",
  ),
  agent_runtime_restore_file_checkpoint: createAgentRuntimeResidualMock(
    "agent_runtime_restore_file_checkpoint",
    "checkpoint",
  ),
  agent_runtime_export_analysis_handoff: createAgentRuntimeResidualMock(
    "agent_runtime_export_analysis_handoff",
    "handoff",
  ),
  agent_runtime_export_review_decision_template:
    createAgentRuntimeResidualMock(
      "agent_runtime_export_review_decision_template",
      "review decision",
    ),
  agent_runtime_save_review_decision: createAgentRuntimeResidualMock(
    "agent_runtime_save_review_decision",
    "review decision",
  ),
  agent_runtime_export_handoff_bundle: createAgentRuntimeResidualMock(
    "agent_runtime_export_handoff_bundle",
    "handoff",
  ),
  agent_runtime_export_evidence_pack: () => ({
    sessionId: "mock-session",
    threadId: "mock-thread",
    workspaceRoot: "/mock/workspace",
    packRelativeRoot: ".lime/harness/sessions/mock-session/evidence",
    packAbsoluteRoot:
      "/mock/workspace/.lime/harness/sessions/mock-session/evidence",
    exportedAt: "2026-03-27T00:00:00Z",
    threadStatus: "idle",
    latestTurnStatus: "idle",
    turnCount: 0,
    itemCount: 0,
    pendingRequestCount: 0,
    queuedTurnCount: 0,
    recentArtifactCount: 0,
    knownGaps: [],
    artifacts: [
      {
        kind: "summary",
        title: "问题摘要",
        relativePath: ".lime/harness/sessions/mock-session/evidence/summary.md",
        absolutePath:
          "/mock/workspace/.lime/harness/sessions/mock-session/evidence/summary.md",
        bytes: 256,
      },
    ],
  }),
  agent_runtime_export_replay_case: createAgentRuntimeResidualMock(
    "agent_runtime_export_replay_case",
    "replay",
  ),
  agent_runtime_update_session: () => ({}),
  agent_runtime_delete_session: () => ({}),
};
