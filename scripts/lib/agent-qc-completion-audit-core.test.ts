import { describe, expect, it } from "vitest";

import {
  buildAgentQcCompletionAudit,
  renderAgentQcCompletionAuditMarkdown,
} from "./agent-qc-completion-audit-core.mjs";

function completeFacts() {
  return {
    files: {
      agentOpsQc: true,
      p0Scenarios: true,
      limeRolloutPlan: true,
      testsReadme: true,
      evidenceSchema: true,
      qcloopJobScript: true,
      payloadCoverageScript: true,
      guiOwnerCheckScript: true,
      qcloopStatusScript: true,
      qcloopPreflightScript: true,
      qcloopOperationsDoc: true,
      evidenceContractDoc: true,
      staleOwnerInterventionDoc: true,
      exportEvidenceScript: true,
      releaseSummaryScript: true,
      realGuiEvidence: true,
    },
    realEvidencePack: {
      exists: true,
      status: "pass",
      scenarioCount: 1,
      scenarioIds: ["command-bridge-contract"],
    },
    localVerify: {
      status: "pass",
      failedStage: "",
      error: "",
    },
    realEvidenceSidecars: [],
    qcloopStatusSidecars: [],
    scenarioReport: {
      valid: true,
      scenarioCount: 12,
      p0ScenarioCount: 1,
      p0ScenarioIds: ["command-bridge-contract"],
    },
    guiFlowReport: { valid: true, flowCount: 4 },
    qcloopPayload: {
      valid: true,
      itemCount: 8,
      verifierHasWorkerOutput: true,
      verifierHasAttemptStatus: true,
      verifierHasExitCode: true,
      workerPromptHasPreflight: true,
      workerPromptHasStructuredEvidence: true,
      verifierRequiresStructuredEvidence: true,
      verifierRequiresStrictJson: true,
    },
    payloadCoverage: {
      status: "ready",
      coverage: {
        passed: true,
        manifestP0Count: 1,
        payloadItemCount: 1,
        missingScenarioIds: [],
        extraScenarioIds: [],
      },
      repairGuard: {
        passed: true,
        maxQcRounds: 1,
        maxExecutorRetries: 0,
      },
      ownerGate: { status: "pass" },
    },
    structuredEvidence: {
      exporterParsesSummary: true,
      releaseSummaryRejectsWeakRefs: true,
    },
    staleOwnerIntervention: {
      guiOwnerReportHasDecisionPacket: true,
      docMentionsDecisionPacket: true,
      guiOwnerReportHasWatchHistory: true,
      docMentionsWatchHistory: true,
    },
    githubActions: {
      releaseDetached: true,
      nightlyDetached: true,
      contractsDetached: true,
    },
  };
}

describe("agent-qc-completion-audit-core", () => {
  it("所有事实齐全时应标记 complete", () => {
    const audit = buildAgentQcCompletionAudit(completeFacts());

    expect(audit.status).toBe("complete");
    expect(audit.failedCount).toBe(0);
  });

  it("缺真实 evidence 时应保持 incomplete", () => {
    const facts = completeFacts();
    facts.realEvidencePack = {
      exists: false,
      status: "",
      scenarioCount: 0,
      scenarioIds: [],
    };
    facts.files.realGuiEvidence = false;

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain("real-qcloop-evidence");
    expect(audit.gaps.map((gap) => gap.id)).toContain("real-gui-evidence");
  });

  it("缺正式 evidence 但存在 sidecar evidence 时应在审计证据中显示 sidecar 状态", () => {
    const facts = completeFacts();
    facts.realEvidencePack = {
      exists: false,
      status: "",
      scenarioCount: 0,
      scenarioIds: [],
    };
    facts.realEvidenceSidecars = [
      {
        path: ".lime/qc/agent-qc-evidence.p0-v2.json",
        status: "fail",
        scenarioCount: 8,
        scenarioIds: ["command-bridge-contract"],
      },
    ];

    const audit = buildAgentQcCompletionAudit(facts);
    const item = audit.items.find(
      (entry) => entry.id === "real-qcloop-evidence",
    );

    expect(audit.status).toBe("incomplete");
    expect(item?.evidence).toContain("sidecars");
    expect(item?.evidence).toContain("status=fail");
  });

  it("真实 qcloop 批次 stale 时应在缺口中显示 stale sidecar", () => {
    const facts = completeFacts();
    facts.realEvidencePack = {
      exists: true,
      status: "fail",
      scenarioCount: 8,
      scenarioIds: ["command-bridge-contract"],
    };
    facts.qcloopStatusSidecars = [
      {
        path: ".lime/qc/qcloop-status.isolated-p0-full-v1-stale-check.json",
        verdictStatus: "stale",
        counts: { success: 4, running: 1, pending: 3, stale: 1 },
      },
    ];

    const audit = buildAgentQcCompletionAudit(facts);
    const item = audit.items.find(
      (entry) => entry.id === "real-qcloop-evidence",
    );

    expect(audit.status).toBe("incomplete");
    expect(item?.evidence).toContain("qcloopStatus");
    expect(item?.gap).toContain("stale");
    expect(item?.gap).toContain(
      "qcloop-status.isolated-p0-full-v1-stale-check.json",
    );
  });

  it("真实 qcloop 批次仍在运行时应在缺口中显示未终态 sidecar 摘要", () => {
    const facts = completeFacts();
    facts.realEvidencePack = {
      exists: true,
      status: "fail",
      scenarioCount: 8,
      scenarioIds: ["command-bridge-contract"],
    };
    facts.qcloopStatusSidecars = [
      {
        path: ".lime/qc/qcloop-status.fastmini-readonly-p0-v1-current.json",
        verdictStatus: "running",
        counts: { success: 0, running: 1, pending: 2, stale: 0 },
      },
    ];

    const audit = buildAgentQcCompletionAudit(facts);
    const item = audit.items.find(
      (entry) => entry.id === "real-qcloop-evidence",
    );

    expect(audit.status).toBe("incomplete");
    expect(item?.gap).toContain("未终态");
    expect(item?.gap).toContain("running=1");
    expect(item?.gap).toContain(
      "qcloop-status.fastmini-readonly-p0-v1-current.json",
    );
  });

  it("未启动 pending-only qcloop sidecar 不应阻断已通过的官方 evidence", () => {
    const facts = completeFacts();
    facts.qcloopStatusSidecars = [
      {
        path: ".lime/qc/qcloop-status.old-pending.json",
        generatedAt: "2026-05-10T18:28:17.000Z",
        jobId: "job-pending",
        jobStatus: "pending",
        verdictStatus: "running",
        counts: {
          success: 0,
          failed: 0,
          exhausted: 0,
          running: 0,
          pending: 8,
          stale: 0,
        },
      },
    ];

    const audit = buildAgentQcCompletionAudit(facts);
    const item = audit.items.find(
      (entry) => entry.id === "real-qcloop-evidence",
    );

    expect(audit.status).toBe("complete");
    expect(item?.evidence).toContain("qcloop-status.old-pending.json");
    expect(item?.gap).not.toContain("未终态");
  });

  it("同一 qcloop job 有更新终态 sidecar 时不应被旧 stale snapshot 阻断", () => {
    const facts = completeFacts();
    facts.realEvidencePack = {
      exists: true,
      status: "fail",
      scenarioCount: 8,
      scenarioIds: ["command-bridge-contract"],
    };
    facts.qcloopStatusSidecars = [
      {
        path: ".lime/qc/qcloop-status.pre-intervention-20260511-022817.json",
        generatedAt: "2026-05-10T18:28:17.000Z",
        jobId: "job-1",
        verdictStatus: "stale",
        counts: { success: 4, running: 1, pending: 3, stale: 1 },
      },
      {
        path: ".lime/qc/qcloop-status.isolated-p0-full-v1-current.json",
        generatedAt: "2026-05-10T18:38:51.000Z",
        jobId: "job-1",
        verdictStatus: "fail",
        counts: { success: 5, running: 0, pending: 0, stale: 0 },
      },
    ];

    const audit = buildAgentQcCompletionAudit(facts);
    const item = audit.items.find(
      (entry) => entry.id === "real-qcloop-evidence",
    );

    expect(audit.status).toBe("incomplete");
    expect(item?.evidence).toContain(
      "qcloop-status.isolated-p0-full-v1-current.json",
    );
    expect(item?.evidence).not.toContain(
      "qcloop-status.pre-intervention-20260511-022817.json",
    );
    expect(item?.gap).not.toContain("仍有 qcloop status sidecar 未终态");
    expect(item?.gap).not.toContain("其中 stale sidecar");
  });

  it("qcloop verifier prompt 缺少 worker evidence 占位符时应保持 incomplete", () => {
    const facts = completeFacts();
    facts.qcloopPayload.verifierHasWorkerOutput = false;

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain(
      "qcloop-verifier-evidence-placeholders",
    );
  });

  it("ready payload coverage 不完整时应保持 incomplete", () => {
    const facts = completeFacts();
    facts.payloadCoverage.coverage.passed = false;
    facts.payloadCoverage.coverage.missingScenarioIds = [
      "workspace-ready-session-restore",
    ];

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain(
      "qcloop-payload-coverage",
    );
  });

  it("ready payload 未禁用 qcloop repair 时应保持 incomplete", () => {
    const facts = completeFacts();
    facts.payloadCoverage.repairGuard = {
      passed: false,
      maxQcRounds: 3,
      maxExecutorRetries: 0,
    };

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain(
      "qcloop-payload-coverage",
    );
    expect(
      audit.items.find((item) => item.id === "qcloop-payload-coverage")
        ?.evidence,
    ).toContain("repairGuard=fail");
  });

  it("结构化 evidence summary 契约缺失时应保持 incomplete", () => {
    const facts = completeFacts();
    facts.qcloopPayload.workerPromptHasStructuredEvidence = false;
    facts.structuredEvidence.exporterParsesSummary = false;
    facts.structuredEvidence.releaseSummaryRejectsWeakRefs = false;

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain(
      "structured-evidence-contract",
    );
  });

  it("缺少 qcloop 状态监控入口时应保持 incomplete", () => {
    const facts = completeFacts();
    facts.files.qcloopStatusScript = false;

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain("qcloop-status-monitor");
  });

  it("缺少 qcloop worker preflight 时应保持 incomplete", () => {
    const facts = completeFacts();
    facts.qcloopPayload.workerPromptHasPreflight = false;

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain(
      "qcloop-worker-preflight",
    );
  });

  it("缺少 stale owner 机器可读决策输出时应保持 incomplete", () => {
    const facts = completeFacts();
    facts.staleOwnerIntervention.guiOwnerReportHasDecisionPacket = false;

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain(
      "stale-owner-intervention-protocol",
    );
    expect(
      audit.items.find(
        (item) => item.id === "stale-owner-intervention-protocol",
      )?.evidence,
    ).toContain("ownerIntervention=false");
  });

  it("缺少 stale owner watch history 输出时应保持 incomplete", () => {
    const facts = completeFacts();
    facts.staleOwnerIntervention.guiOwnerReportHasWatchHistory = false;

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain(
      "stale-owner-intervention-protocol",
    );
    expect(
      audit.items.find(
        (item) => item.id === "stale-owner-intervention-protocol",
      )?.evidence,
    ).toContain("watchHistory=false");
  });

  it("GitHub Release workflow 触发 Agent QC 时应给出缺口", () => {
    const facts = completeFacts();
    facts.githubActions.releaseDetached = false;

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain(
      "github-actions-detached",
    );
  });

  it("test:contracts 间接触发 Agent QC 时应给出缺口", () => {
    const facts = completeFacts();
    facts.githubActions.contractsDetached = false;

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain(
      "github-actions-detached",
    );
  });

  it("verify:local 失败时应给出缺口", () => {
    const facts = completeFacts();
    facts.localVerify = {
      status: "fail",
      failedStage: "typecheck",
      error: "example typecheck failure",
    };

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(audit.gaps.map((gap) => gap.id)).toContain("local-verify-gate");
    expect(
      audit.items.find((item) => item.id === "local-verify-gate")?.evidence,
    ).toContain("failedStage=typecheck");
  });

  it("真实 evidence 数量足够但缺 P0 scenario id 时仍应保持 incomplete", () => {
    const facts = completeFacts();
    facts.scenarioReport.p0ScenarioCount = 2;
    facts.scenarioReport.p0ScenarioIds = [
      "command-bridge-contract",
      "tool-approval-sandbox-boundary",
    ];
    facts.realEvidencePack = {
      exists: true,
      status: "pass",
      scenarioCount: 2,
      scenarioIds: ["command-bridge-contract", "non-p0-placeholder"],
    };

    const audit = buildAgentQcCompletionAudit(facts);

    expect(audit.status).toBe("incomplete");
    expect(
      audit.items.find((item) => item.id === "real-qcloop-evidence")?.evidence,
    ).toContain("missing=tool-approval-sandbox-boundary");
  });

  it("应渲染 Markdown 审计报告", () => {
    const audit = buildAgentQcCompletionAudit(completeFacts());
    const markdown = renderAgentQcCompletionAuditMarkdown(audit);

    expect(markdown).toContain("Agent QC Completion Audit");
    expect(markdown).toContain("Status: complete");
  });
});
