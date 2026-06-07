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
  Object.entries(deprecatedAgentCommandReplacements).map(
    ([command, replacement]) => [
      command,
      createDeprecatedCommandMock(command, replacement),
    ],
  ),
) as Record<string, () => never>;

const createAppServerSessionCurrentMock =
  (command: string, method: string) => () => {
    throw new Error(
      `命令 ${command} 已迁移到 App Server JSON-RPC ${method}，Mock 不再为旧 session 链路伪造成功结果。`,
    );
  };

type MockReviewDecisionRequest = {
  session_id?: string;
  sessionId?: string;
  decision_status?: string;
  decisionStatus?: string;
  decision_summary?: string;
  decisionSummary?: string;
  chosen_fix_strategy?: string;
  chosenFixStrategy?: string;
  risk_level?: string;
  riskLevel?: string;
  risk_tags?: string[];
  riskTags?: string[];
  human_reviewer?: string;
  humanReviewer?: string;
  reviewed_at?: string | null;
  reviewedAt?: string | null;
  followup_actions?: string[];
  followupActions?: string[];
  regression_requirements?: string[];
  regressionRequirements?: string[];
  notes?: string;
  limit_status?: string;
  limitStatus?: string;
  capability_gap?: string;
  capabilityGap?: string;
  user_locked_capability_summary?: string;
  userLockedCapabilitySummary?: string;
  permission_status?: string;
  permissionStatus?: string;
  permission_confirmation_status?: string;
  permissionConfirmationStatus?: string;
  permission_confirmation_request_id?: string;
  permissionConfirmationRequestId?: string;
  permission_confirmation_source?: string;
  permissionConfirmationSource?: string;
  permission_confirmation_summary?: string;
  permissionConfirmationSummary?: string;
};

function blocksAcceptedReviewDecisionInMock(
  permissionStatus: string,
  confirmationStatus: string,
  limitStatus = "",
): boolean {
  return (
    limitStatus === "user_locked_capability_gap" ||
    confirmationStatus === "denied" ||
    (permissionStatus === "requires_confirmation" &&
      confirmationStatus !== "resolved")
  );
}

function buildMockUserLockedCapabilitySummary(
  limitStatus: string,
  capabilityGap: string,
): string {
  if (limitStatus !== "user_locked_capability_gap") {
    return "";
  }
  return `显式用户模型锁定不满足当前 execution profile（capabilityGap=${capabilityGap || "未记录 capabilityGap"}），不能作为成功交付证据。`;
}

function buildMockPermissionConfirmationSummary(
  status: string,
  requestId: string,
  source: string,
): string {
  switch (status) {
    case "denied":
      return `已拒绝（request_id=${requestId}, source=${source}），不能作为成功交付证据。`;
    case "requested":
      return `等待处理（request_id=${requestId}, source=${source}），不能作为成功交付证据。`;
    case "not_requested":
      return "声明态权限尚未发起真实审批请求，不能作为成功交付证据。";
    case "resolved":
      return `已通过（request_id=${requestId}, source=${source}）。`;
    default:
      return status ? `${status}（source=${source}）。` : "";
  }
}

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
  agent_runtime_list_file_checkpoints: () => ({
    session_id: "mock-session",
    thread_id: "mock-thread",
    checkpoint_count: 1,
    checkpoints: [
      {
        checkpoint_id: "artifact-document:req-1",
        turn_id: "turn-1",
        path: ".lime/artifacts/mock-thread/demo.artifact.json",
        source: "artifact_document_service",
        updated_at: "2026-04-15T00:00:00Z",
        version_no: 2,
        version_id: "artifact-document:req-1:v2",
        request_id: "req-1",
        title: "Mock Checkpoint",
        kind: "analysis",
        status: "ready",
        preview_text: "mock preview",
        snapshot_path:
          ".lime/artifacts/mock-thread/versions/demo/v0002.artifact.json",
        validation_issue_count: 0,
      },
    ],
  }),
  agent_runtime_get_file_checkpoint: () => ({
    session_id: "mock-session",
    thread_id: "mock-thread",
    checkpoint: {
      checkpoint_id: "artifact-document:req-1",
      turn_id: "turn-1",
      path: ".lime/artifacts/mock-thread/demo.artifact.json",
      source: "artifact_document_service",
      updated_at: "2026-04-15T00:00:00Z",
      version_no: 2,
      version_id: "artifact-document:req-1:v2",
      request_id: "req-1",
      title: "Mock Checkpoint",
      kind: "analysis",
      status: "ready",
      preview_text: "mock preview",
      snapshot_path:
        ".lime/artifacts/mock-thread/versions/demo/v0002.artifact.json",
      validation_issue_count: 0,
    },
    live_path: ".lime/artifacts/mock-thread/demo.artifact.json",
    snapshot_path:
      ".lime/artifacts/mock-thread/versions/demo/v0002.artifact.json",
    checkpoint_document: { title: "Mock Checkpoint", summary: "snapshot" },
    live_document: { title: "Mock Checkpoint", summary: "live" },
    version_history: [],
    validation_issues: [],
    metadata: {},
    content: "# Mock Checkpoint",
  }),
  agent_runtime_diff_file_checkpoint: () => ({
    session_id: "mock-session",
    thread_id: "mock-thread",
    checkpoint: {
      checkpoint_id: "artifact-document:req-1",
      turn_id: "turn-1",
      path: ".lime/artifacts/mock-thread/demo.artifact.json",
      source: "artifact_document_service",
      updated_at: "2026-04-15T00:00:00Z",
      version_no: 2,
      version_id: "artifact-document:req-1:v2",
      request_id: "req-1",
      title: "Mock Checkpoint",
      kind: "analysis",
      status: "ready",
      preview_text: "mock preview",
      snapshot_path:
        ".lime/artifacts/mock-thread/versions/demo/v0002.artifact.json",
      validation_issue_count: 0,
    },
    current_version_id: "artifact-document:req-1:v2",
    previous_version_id: "artifact-document:req-1:v1",
    diff: {
      summary: "mock diff",
    },
  }),
  agent_runtime_restore_file_checkpoint: (args) => {
    const request = args?.request ?? {};
    const checkpoint = {
      checkpoint_id: request.checkpoint_id || "artifact-document:req-1",
      turn_id: "turn-1",
      path: ".lime/artifacts/mock-thread/demo.artifact.json",
      source: "artifact_document_service",
      updated_at: "2026-04-15T00:00:00Z",
      version_no: 2,
      version_id: "artifact-document:req-1:v2",
      request_id: "req-1",
      title: "Mock Checkpoint",
      kind: "analysis",
      status: "ready",
      preview_text: "mock preview",
      snapshot_path:
        ".lime/artifacts/mock-thread/versions/demo/v0002.artifact.json",
      validation_issue_count: 0,
    };

    return {
      session_id: request.session_id || "mock-session",
      thread_id: "mock-thread",
      checkpoint,
      live_path: checkpoint.path,
      snapshot_path: checkpoint.snapshot_path,
      backup_path:
        request.create_backup === false
          ? null
          : ".lime/file-checkpoint-backups/20260415T000100Z/.lime/artifacts/mock-thread/demo.artifact.json",
      restored_at: "2026-04-15T00:01:00Z",
    };
  },
  agent_runtime_export_analysis_handoff: () => ({
    session_id: "mock-session",
    thread_id: "mock-thread",
    workspace_root: "/mock/workspace",
    analysis_relative_root: ".lime/harness/sessions/mock-session/analysis",
    analysis_absolute_root:
      "/mock/workspace/.lime/harness/sessions/mock-session/analysis",
    handoff_bundle_relative_root: ".lime/harness/sessions/mock-session",
    evidence_pack_relative_root: ".lime/harness/sessions/mock-session/evidence",
    replay_case_relative_root: ".lime/harness/sessions/mock-session/replay",
    exported_at: "2026-03-27T00:00:00Z",
    title: "确认当前失败会话应该如何交给外部 AI 诊断和修复",
    thread_status: "waiting_request",
    latest_turn_status: "action_required",
    pending_request_count: 1,
    queued_turn_count: 0,
    sanitized_workspace_root: "/workspace/lime",
    copy_prompt:
      "# Lime 外部诊断与修复任务\n\n请先读取 analysis-brief.md 与 analysis-context.json。",
    artifacts: [
      {
        kind: "analysis_brief",
        title: "外部分析简报",
        relative_path:
          ".lime/harness/sessions/mock-session/analysis/analysis-brief.md",
        absolute_path:
          "/mock/workspace/.lime/harness/sessions/mock-session/analysis/analysis-brief.md",
        bytes: 512,
      },
      {
        kind: "analysis_context",
        title: "外部分析上下文",
        relative_path:
          ".lime/harness/sessions/mock-session/analysis/analysis-context.json",
        absolute_path:
          "/mock/workspace/.lime/harness/sessions/mock-session/analysis/analysis-context.json",
        bytes: 768,
      },
    ],
  }),
  agent_runtime_export_review_decision_template: () => ({
    session_id: "mock-session",
    thread_id: "mock-thread",
    workspace_root: "/mock/workspace",
    review_relative_root: ".lime/harness/sessions/mock-session/review",
    review_absolute_root:
      "/mock/workspace/.lime/harness/sessions/mock-session/review",
    analysis_relative_root: ".lime/harness/sessions/mock-session/analysis",
    analysis_absolute_root:
      "/mock/workspace/.lime/harness/sessions/mock-session/analysis",
    handoff_bundle_relative_root: ".lime/harness/sessions/mock-session",
    evidence_pack_relative_root: ".lime/harness/sessions/mock-session/evidence",
    replay_case_relative_root: ".lime/harness/sessions/mock-session/replay",
    exported_at: "2026-03-27T00:05:00Z",
    title: "记录外部分析后的人工审核结论",
    thread_status: "waiting_request",
    latest_turn_status: "action_required",
    pending_request_count: 1,
    queued_turn_count: 0,
    default_decision_status: "pending_review",
    limit_status: "normal",
    capability_gap: "",
    user_locked_capability_summary: "",
    permission_status: "requires_confirmation",
    permission_confirmation_status: "denied",
    permission_confirmation_request_id: "mock-approval-denied",
    permission_confirmation_source: "runtime_action_required",
    permission_confirmation_summary:
      "已拒绝（request_id=mock-approval-denied, source=runtime_action_required），不能作为成功交付证据。",
    verification_summary: {
      artifact_validator: {
        applicable: true,
        record_count: 1,
        issue_count: 1,
        repaired_count: 0,
        fallback_used_count: 0,
        outcome: "blocking_failure",
      },
      focus_verification_failure_outcomes: [
        "Artifact 校验存在 1 条未恢复 issue。",
      ],
      focus_verification_recovered_outcomes: [],
    },
    decision: {
      decision_status: "pending_review",
      decision_summary: "",
      chosen_fix_strategy: "",
      risk_level: "unknown",
      risk_tags: [],
      human_reviewer: "",
      reviewed_at: null,
      followup_actions: [
        "先对照 analysis-context.json / evidence/runtime.json 核对当前验证失败焦点，再决定是继续修复还是补证据。",
        "复查 Artifact 校验相关产物，确认 issues / repaired / fallback 状态与最终结论一致。",
      ],
      regression_requirements: [
        "按 replay case 复现问题并确认修复后行为与预期一致。",
        "重新导出 evidence pack，确认 Artifact 校验摘要已更新。",
      ],
      notes: "",
    },
    decision_status_options: [
      "accepted",
      "deferred",
      "rejected",
      "needs_more_evidence",
      "pending_review",
    ],
    risk_level_options: ["low", "medium", "high", "unknown"],
    review_checklist: [
      "先阅读 analysis-brief.md 与 analysis-context.json。",
      "确认最终决策由人工审核者填写。",
    ],
    analysis_artifacts: [
      {
        kind: "analysis_brief",
        title: "外部分析简报",
        relative_path:
          ".lime/harness/sessions/mock-session/analysis/analysis-brief.md",
        absolute_path:
          "/mock/workspace/.lime/harness/sessions/mock-session/analysis/analysis-brief.md",
        bytes: 512,
      },
    ],
    artifacts: [
      {
        kind: "review_decision_markdown",
        title: "人工审核记录",
        relative_path:
          ".lime/harness/sessions/mock-session/review/review-decision.md",
        absolute_path:
          "/mock/workspace/.lime/harness/sessions/mock-session/review/review-decision.md",
        bytes: 512,
      },
      {
        kind: "review_decision_json",
        title: "人工审核记录 JSON",
        relative_path:
          ".lime/harness/sessions/mock-session/review/review-decision.json",
        absolute_path:
          "/mock/workspace/.lime/harness/sessions/mock-session/review/review-decision.json",
        bytes: 768,
      },
    ],
  }),
  agent_runtime_save_review_decision: ({
    request,
  }: {
    request?: MockReviewDecisionRequest;
  }) => {
    const decisionStatus =
      request?.decision_status || request?.decisionStatus || "pending_review";
    const permissionStatus =
      request?.permission_status ||
      request?.permissionStatus ||
      "requires_confirmation";
    const permissionConfirmationStatus =
      request?.permission_confirmation_status ||
      request?.permissionConfirmationStatus ||
      "denied";
    const permissionConfirmationRequestId =
      request?.permission_confirmation_request_id ||
      request?.permissionConfirmationRequestId ||
      (permissionConfirmationStatus === "not_requested"
        ? ""
        : "mock-approval-denied");
    const permissionConfirmationSource =
      request?.permission_confirmation_source ||
      request?.permissionConfirmationSource ||
      (permissionConfirmationStatus === "not_requested"
        ? "declared_profile_only"
        : "runtime_action_required");
    const permissionConfirmationSummary =
      request?.permission_confirmation_summary ||
      request?.permissionConfirmationSummary ||
      buildMockPermissionConfirmationSummary(
        permissionConfirmationStatus,
        permissionConfirmationRequestId || "未记录 confirmationRequestId",
        permissionConfirmationSource,
      );
    const limitStatus =
      request?.limit_status || request?.limitStatus || "normal";
    const capabilityGap =
      request?.capability_gap || request?.capabilityGap || "";
    const userLockedCapabilitySummary =
      request?.user_locked_capability_summary ||
      request?.userLockedCapabilitySummary ||
      buildMockUserLockedCapabilitySummary(limitStatus, capabilityGap);

    if (
      decisionStatus === "accepted" &&
      blocksAcceptedReviewDecisionInMock(
        permissionStatus,
        permissionConfirmationStatus,
        limitStatus,
      )
    ) {
      throw new Error(
        limitStatus === "user_locked_capability_gap"
          ? "显式用户模型锁定不满足当前 execution profile，不能把本次 review decision 保存为 accepted；请切换到满足 routingSlot 的模型或取消显式模型锁定并重新导出证据，或改为 rejected / deferred / needs_more_evidence。"
          : permissionConfirmationStatus === "denied"
            ? "真实权限确认已被拒绝，不能把本次 review decision 保存为 accepted；请先处理真实权限确认，或改为 rejected / deferred / needs_more_evidence。"
            : "权限确认尚未解决，不能把本次 review decision 保存为 accepted；请先处理真实权限确认，或改为 rejected / deferred / needs_more_evidence。",
      );
    }

    return {
      session_id: request?.session_id || request?.sessionId || "mock-session",
      thread_id: "mock-thread",
      workspace_root: "/mock/workspace",
      review_relative_root: ".lime/harness/sessions/mock-session/review",
      review_absolute_root:
        "/mock/workspace/.lime/harness/sessions/mock-session/review",
      analysis_relative_root: ".lime/harness/sessions/mock-session/analysis",
      analysis_absolute_root:
        "/mock/workspace/.lime/harness/sessions/mock-session/analysis",
      handoff_bundle_relative_root: ".lime/harness/sessions/mock-session",
      evidence_pack_relative_root:
        ".lime/harness/sessions/mock-session/evidence",
      replay_case_relative_root: ".lime/harness/sessions/mock-session/replay",
      exported_at: "2026-03-27T00:07:00Z",
      title: "记录外部分析后的人工审核结论",
      thread_status: "waiting_request",
      latest_turn_status: "action_required",
      pending_request_count: 1,
      queued_turn_count: 0,
      default_decision_status: "pending_review",
      limit_status: limitStatus,
      capability_gap: capabilityGap,
      user_locked_capability_summary: userLockedCapabilitySummary,
      permission_status: permissionStatus,
      permission_confirmation_status: permissionConfirmationStatus,
      permission_confirmation_request_id: permissionConfirmationRequestId,
      permission_confirmation_source: permissionConfirmationSource,
      permission_confirmation_summary: permissionConfirmationSummary,
      verification_summary: {
        artifact_validator: {
          applicable: true,
          record_count: 1,
          issue_count: 1,
          repaired_count: 0,
          fallback_used_count: 0,
          outcome: "blocking_failure",
        },
        focus_verification_failure_outcomes: [
          "Artifact 校验存在 1 条未恢复 issue。",
        ],
        focus_verification_recovered_outcomes: [],
      },
      decision: {
        decision_status: decisionStatus,
        decision_summary:
          request?.decision_summary || request?.decisionSummary || "",
        chosen_fix_strategy:
          request?.chosen_fix_strategy || request?.chosenFixStrategy || "",
        risk_level: request?.risk_level || request?.riskLevel || "unknown",
        risk_tags: request?.risk_tags || request?.riskTags || [],
        human_reviewer: request?.human_reviewer || request?.humanReviewer || "",
        reviewed_at:
          request?.reviewed_at || request?.reviewedAt || "2026-03-27T00:07:00Z",
        followup_actions:
          request?.followup_actions || request?.followupActions || [],
        regression_requirements:
          request?.regression_requirements ||
          request?.regressionRequirements ||
          [],
        notes: request?.notes || "",
      },
      decision_status_options: [
        "accepted",
        "deferred",
        "rejected",
        "needs_more_evidence",
        "pending_review",
      ],
      risk_level_options: ["low", "medium", "high", "unknown"],
      review_checklist: [
        "先阅读 analysis-brief.md 与 analysis-context.json。",
        "确认最终决策由人工审核者填写。",
      ],
      analysis_artifacts: [
        {
          kind: "analysis_brief",
          title: "外部分析简报",
          relative_path:
            ".lime/harness/sessions/mock-session/analysis/analysis-brief.md",
          absolute_path:
            "/mock/workspace/.lime/harness/sessions/mock-session/analysis/analysis-brief.md",
          bytes: 512,
        },
      ],
      artifacts: [
        {
          kind: "review_decision_markdown",
          title: "人工审核记录",
          relative_path:
            ".lime/harness/sessions/mock-session/review/review-decision.md",
          absolute_path:
            "/mock/workspace/.lime/harness/sessions/mock-session/review/review-decision.md",
          bytes: 512,
        },
        {
          kind: "review_decision_json",
          title: "人工审核记录 JSON",
          relative_path:
            ".lime/harness/sessions/mock-session/review/review-decision.json",
          absolute_path:
            "/mock/workspace/.lime/harness/sessions/mock-session/review/review-decision.json",
          bytes: 768,
        },
      ],
    };
  },
  agent_runtime_export_handoff_bundle: () => ({
    sessionId: "mock-session",
    threadId: "mock-thread",
    workspaceRoot: "/mock/workspace",
    bundleRelativeRoot: ".lime/harness/sessions/mock-session",
    bundleAbsoluteRoot: "/mock/workspace/.lime/harness/sessions/mock-session",
    exportedAt: "2026-03-27T00:00:00Z",
    threadStatus: "idle",
    pendingRequestCount: 0,
    queuedTurnCount: 0,
    activeSubagentCount: 0,
    todoTotal: 0,
    todoPending: 0,
    todoInProgress: 0,
    todoCompleted: 0,
    artifacts: [
      {
        kind: "plan",
        title: "计划摘要",
        relativePath: ".lime/harness/sessions/mock-session/plan.md",
        absolutePath:
          "/mock/workspace/.lime/harness/sessions/mock-session/plan.md",
        bytes: 128,
      },
    ],
  }),
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
  agent_runtime_export_replay_case: () => ({
    sessionId: "mock-session",
    threadId: "mock-thread",
    workspaceRoot: "/mock/workspace",
    replayRelativeRoot: ".lime/harness/sessions/mock-session/replay",
    replayAbsoluteRoot:
      "/mock/workspace/.lime/harness/sessions/mock-session/replay",
    handoffBundleRelativeRoot: ".lime/harness/sessions/mock-session",
    evidencePackRelativeRoot: ".lime/harness/sessions/mock-session/evidence",
    exportedAt: "2026-03-27T00:00:00Z",
    threadStatus: "idle",
    latestTurnStatus: "idle",
    pendingRequestCount: 0,
    queuedTurnCount: 0,
    linkedHandoffArtifactCount: 1,
    linkedEvidenceArtifactCount: 1,
    recentArtifactCount: 0,
    artifacts: [
      {
        kind: "input",
        title: "回放输入",
        relativePath: ".lime/harness/sessions/mock-session/replay/input.json",
        absolutePath:
          "/mock/workspace/.lime/harness/sessions/mock-session/replay/input.json",
        bytes: 256,
      },
    ],
  }),
  agent_runtime_spawn_subagent: () => ({
    agent_id: "mock-subagent-session",
    nickname: "Mock Subagent",
  }),
  agent_runtime_send_subagent_input: () => ({
    submission_id: "mock-subagent-submit",
  }),
  agent_runtime_wait_subagents: () => ({
    status: {},
    timed_out: true,
  }),
  agent_runtime_resume_subagent: () => ({
    status: { session_id: "mock-subagent-session", kind: "idle" },
    cascade_session_ids: ["mock-subagent-session"],
    changed_session_ids: ["mock-subagent-session"],
  }),
  agent_runtime_close_subagent: () => ({
    previous_status: { session_id: "mock-subagent-session", kind: "idle" },
    cascade_session_ids: ["mock-subagent-session"],
    changed_session_ids: ["mock-subagent-session"],
  }),
  agent_runtime_update_session: () => ({}),
  agent_runtime_delete_session: () => ({}),
};
