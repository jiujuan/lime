import { describe, expect, it, vi } from "vitest";
import { createExportClient } from "./exportClient";
import type { AgentRuntimeCommandInvoke } from "./transport";
import type { AgentRuntimeEvidenceExportAppServerClient } from "./exportClient";

const handoffBundleOutput = {
  sessionId: "session-handoff",
  threadId: "thread-handoff",
  workspaceRoot: "/tmp/workspace",
  bundleRelativeRoot: ".lime/harness/sessions/session-handoff",
  bundleAbsoluteRoot: "/tmp/workspace/.lime/harness/sessions/session-handoff",
  exportedAt: "2026-06-08T08:00:00.000Z",
  threadStatus: "running",
  pendingRequestCount: 1,
  queuedTurnCount: 0,
  activeSubagentCount: 2,
  todoTotal: 3,
  todoPending: 1,
  todoInProgress: 1,
  todoCompleted: 1,
  artifacts: [
    {
      kind: "handoff",
      title: "handoff.md",
      relativePath: ".lime/harness/sessions/session-handoff/handoff.md",
      absolutePath:
        "/tmp/workspace/.lime/harness/sessions/session-handoff/handoff.md",
      bytes: 128,
    },
  ],
};

const analysisHandoffOutput = {
  session_id: "session-analysis",
  thread_id: "thread-analysis",
  workspace_root: "/tmp/workspace",
  analysis_relative_root: ".lime/harness/sessions/session-analysis/analysis",
  analysis_absolute_root:
    "/tmp/workspace/.lime/harness/sessions/session-analysis/analysis",
  handoff_bundle_relative_root: ".lime/harness/sessions/session-analysis",
  evidence_pack_relative_root:
    ".lime/harness/sessions/session-analysis/evidence",
  replay_case_relative_root: ".lime/harness/sessions/session-analysis/replay",
  exported_at: "2026-06-08T08:05:00.000Z",
  title: "外部分析",
  thread_status: "waiting_request",
  pending_request_count: 1,
  queued_turn_count: 0,
  sanitized_workspace_root: "/tmp/workspace",
  copy_prompt: "请审阅这份 handoff。",
  artifacts: [
    {
      kind: "analysis_brief",
      title: "analysis-brief.md",
      relative_path:
        ".lime/harness/sessions/session-analysis/analysis/analysis-brief.md",
      absolute_path:
        "/tmp/workspace/.lime/harness/sessions/session-analysis/analysis/analysis-brief.md",
      bytes: 256,
    },
  ],
};

const replayCaseOutput = {
  sessionId: "session-replay",
  threadId: "thread-replay",
  workspaceRoot: "/tmp/workspace",
  replayRelativeRoot: ".lime/harness/sessions/session-replay/replay",
  replayAbsoluteRoot:
    "/tmp/workspace/.lime/harness/sessions/session-replay/replay",
  handoffBundleRelativeRoot: ".lime/harness/sessions/session-replay",
  evidencePackRelativeRoot: ".lime/harness/sessions/session-replay/evidence",
  exportedAt: "2026-06-08T08:10:00.000Z",
  threadStatus: "failed",
  pendingRequestCount: 0,
  queuedTurnCount: 1,
  linkedHandoffArtifactCount: 1,
  linkedEvidenceArtifactCount: 1,
  recentArtifactCount: 2,
  artifacts: [
    {
      kind: "input",
      title: "input.json",
      relativePath: ".lime/harness/sessions/session-replay/replay/input.json",
      absolutePath:
        "/tmp/workspace/.lime/harness/sessions/session-replay/replay/input.json",
      bytes: 512,
    },
  ],
};

const reviewDecision = {
  decisionStatus: "accepted",
  decisionSummary: "确认可以合入。",
  chosenFixStrategy: "保留最小 current 边界。",
  riskLevel: "medium",
  riskTags: ["runtime"],
  humanReviewer: "Lime Maintainer",
  followupActions: ["补 GUI smoke"],
  regressionRequirements: ["npm run test:contracts"],
  notes: "",
};

const reviewDecisionTemplateOutput = {
  sessionId: "session-review",
  threadId: "thread-review",
  workspaceRoot: "/tmp/workspace",
  reviewRelativeRoot: ".lime/harness/sessions/session-review/review",
  reviewAbsoluteRoot:
    "/tmp/workspace/.lime/harness/sessions/session-review/review",
  analysisRelativeRoot: ".lime/harness/sessions/session-review/analysis",
  analysisAbsoluteRoot:
    "/tmp/workspace/.lime/harness/sessions/session-review/analysis",
  handoffBundleRelativeRoot: ".lime/harness/sessions/session-review",
  evidencePackRelativeRoot: ".lime/harness/sessions/session-review/evidence",
  replayCaseRelativeRoot: ".lime/harness/sessions/session-review/replay",
  exportedAt: "2026-06-08T08:15:00.000Z",
  title: "人工审核结论",
  threadStatus: "waiting_request",
  pendingRequestCount: 1,
  queuedTurnCount: 0,
  defaultDecisionStatus: "pending_review",
  decision: reviewDecision,
  decisionStatusOptions: [
    "accepted",
    "deferred",
    "rejected",
    "needs_more_evidence",
    "pending_review",
  ],
  riskLevelOptions: ["low", "medium", "high", "unknown"],
  reviewChecklist: ["确认 evidence pack"],
  analysisArtifacts: [
    {
      kind: "analysis_brief",
      title: "analysis-brief.md",
      relativePath:
        ".lime/harness/sessions/session-review/analysis/analysis-brief.md",
      absolutePath:
        "/tmp/workspace/.lime/harness/sessions/session-review/analysis/analysis-brief.md",
      bytes: 256,
    },
  ],
  artifacts: [
    {
      kind: "review_decision_json",
      title: "review-decision.json",
      relativePath:
        ".lime/harness/sessions/session-review/review/review-decision.json",
      absolutePath:
        "/tmp/workspace/.lime/harness/sessions/session-review/review/review-decision.json",
      bytes: 384,
    },
  ],
};

function createInvokeCommand(results: unknown[]) {
  const invokeCommand = vi.fn();
  for (const result of results) {
    invokeCommand.mockResolvedValueOnce(result);
  }
  return invokeCommand;
}

function appServerClientMock(): AgentRuntimeEvidenceExportAppServerClient {
  return {
    exportEvidence: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "desktop",
          workspaceId: "workspace-1",
          status: "running",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:03.000Z",
        },
        turns: [],
        events: [],
        artifacts: [],
        exportedAt: "2026-06-06T00:00:04.000Z",
        evidencePack: {
          packRelativeRoot: ".lime/harness/sessions/session-1/evidence",
          packAbsoluteRoot:
            "/tmp/work/.lime/harness/sessions/session-1/evidence",
          exportedAt: "2026-06-06T00:00:05.000Z",
          threadStatus: "running",
          latestTurnStatus: "accepted",
          turnCount: 2,
          itemCount: 6,
          pendingRequestCount: 1,
          queuedTurnCount: 0,
          recentArtifactCount: 1,
          knownGaps: [],
          artifacts: [],
        },
      },
      response: { id: 1, result: {} },
      notifications: [],
      messages: [],
    }),
  };
}

describe("agentRuntime exportClient", () => {
  it("handoff / analysis / replay / review compat 导出应先校验 DTO 再 normalize", async () => {
    const invokeCommand = createInvokeCommand([
      handoffBundleOutput,
      analysisHandoffOutput,
      replayCaseOutput,
      reviewDecisionTemplateOutput,
      reviewDecisionTemplateOutput,
    ]);
    const client = createExportClient({
      invokeCommand: invokeCommand as AgentRuntimeCommandInvoke,
    });

    await expect(
      client.exportAgentRuntimeHandoffBundle("session-handoff"),
    ).resolves.toMatchObject({
      session_id: "session-handoff",
      active_subagent_count: 2,
      artifacts: [
        expect.objectContaining({
          kind: "handoff",
          relative_path: ".lime/harness/sessions/session-handoff/handoff.md",
        }),
      ],
    });
    await expect(
      client.exportAgentRuntimeAnalysisHandoff("session-analysis"),
    ).resolves.toMatchObject({
      session_id: "session-analysis",
      copy_prompt: "请审阅这份 handoff。",
      artifacts: [
        expect.objectContaining({
          kind: "analysis_brief",
        }),
      ],
    });
    await expect(
      client.exportAgentRuntimeReplayCase("session-replay"),
    ).resolves.toMatchObject({
      session_id: "session-replay",
      linked_handoff_artifact_count: 1,
      artifacts: [
        expect.objectContaining({
          kind: "input",
        }),
      ],
    });
    await expect(
      client.exportAgentRuntimeReviewDecisionTemplate("session-review"),
    ).resolves.toMatchObject({
      session_id: "session-review",
      decision: expect.objectContaining({
        decision_status: "accepted",
      }),
      artifacts: [
        expect.objectContaining({
          kind: "review_decision_json",
        }),
      ],
    });
    await expect(
      client.saveAgentRuntimeReviewDecision({
        session_id: "session-review",
        decision_status: "accepted",
        decision_summary: "确认可以合入。",
        chosen_fix_strategy: "保留最小 current 边界。",
        risk_level: "medium",
        risk_tags: ["runtime"],
        human_reviewer: "Lime Maintainer",
        followup_actions: ["补 GUI smoke"],
        regression_requirements: ["npm run test:contracts"],
        notes: "",
      }),
    ).resolves.toMatchObject({
      session_id: "session-review",
      decision: expect.objectContaining({
        risk_level: "medium",
      }),
    });

    expect(invokeCommand).toHaveBeenNthCalledWith(
      1,
      "agent_runtime_export_handoff_bundle",
      { sessionId: "session-handoff" },
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      2,
      "agent_runtime_export_analysis_handoff",
      { sessionId: "session-analysis" },
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      3,
      "agent_runtime_export_replay_case",
      { sessionId: "session-replay" },
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      4,
      "agent_runtime_export_review_decision_template",
      { sessionId: "session-review" },
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      5,
      "agent_runtime_save_review_decision",
      {
        request: {
          session_id: "session-review",
          decision_status: "accepted",
          decision_summary: "确认可以合入。",
          chosen_fix_strategy: "保留最小 current 边界。",
          risk_level: "medium",
          risk_tags: ["runtime"],
          human_reviewer: "Lime Maintainer",
          followup_actions: ["补 GUI smoke"],
          regression_requirements: ["npm run test:contracts"],
          notes: "",
        },
      },
    );
  });

  it("handoff / analysis / replay / review 收到假成功或缺字段时应 fail closed", async () => {
    const invokeCommand = createInvokeCommand([
      { success: true },
      { ...analysisHandoffOutput, copy_prompt: undefined },
      {
        ...replayCaseOutput,
        artifacts: [{ kind: "input", title: "input.json" }],
      },
      {
        ...reviewDecisionTemplateOutput,
        decision: {
          ...reviewDecision,
          riskTags: "runtime",
        },
      },
      {
        error: {
          code: "COMMAND_UNSUPPORTED",
          message: "not available",
        },
      },
    ]);
    const client = createExportClient({
      invokeCommand: invokeCommand as AgentRuntimeCommandInvoke,
    });

    await expect(
      client.exportAgentRuntimeHandoffBundle("session-handoff"),
    ).rejects.toThrow(
      "agent_runtime_export_handoff_bundle did not return runtime handoff bundle",
    );
    await expect(
      client.exportAgentRuntimeAnalysisHandoff("session-analysis"),
    ).rejects.toThrow(
      "agent_runtime_export_analysis_handoff did not return runtime analysis handoff",
    );
    await expect(
      client.exportAgentRuntimeReplayCase("session-replay"),
    ).rejects.toThrow(
      "agent_runtime_export_replay_case did not return runtime replay case",
    );
    await expect(
      client.exportAgentRuntimeReviewDecisionTemplate("session-review"),
    ).rejects.toThrow(
      "agent_runtime_export_review_decision_template did not return runtime review decision template",
    );
    await expect(
      client.saveAgentRuntimeReviewDecision({
        session_id: "session-review",
        decision_status: "accepted",
        decision_summary: "确认可以合入。",
        chosen_fix_strategy: "保留最小 current 边界。",
        risk_level: "medium",
        risk_tags: ["runtime"],
        human_reviewer: "Lime Maintainer",
        followup_actions: [],
        regression_requirements: [],
        notes: "",
      }),
    ).rejects.toThrow(
      "agent_runtime_save_review_decision did not return runtime review decision template",
    );
  });

  it("exportAgentRuntimeEvidencePack 应走 App Server evidence/export，不回退 legacy command", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createExportClient({
      appServerClient,
      invokeCommand,
    });

    await expect(
      client.exportAgentRuntimeEvidencePack(" session-1 "),
    ).resolves.toMatchObject({
      session_id: "session-1",
      thread_id: "thread-1",
      workspace_root: "/tmp/work",
      pack_relative_root: ".lime/harness/sessions/session-1/evidence",
      thread_status: "running",
    });

    expect(appServerClient.exportEvidence).toHaveBeenCalledWith({
      sessionId: "session-1",
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("缺少 sessionId 时 evidence export 应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createExportClient({
      appServerClient,
      invokeCommand,
    });

    await expect(client.exportAgentRuntimeEvidencePack(" ")).rejects.toThrow(
      "sessionId is required to export App Server evidence",
    );

    expect(appServerClient.exportEvidence).not.toHaveBeenCalled();
    expect(invokeCommand).not.toHaveBeenCalled();
  });
});
