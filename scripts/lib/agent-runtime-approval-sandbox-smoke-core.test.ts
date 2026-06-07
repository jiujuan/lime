import { describe, expect, it } from "vitest";

import {
  buildApprovalSandboxSmokeEvidence,
  renderApprovalSandboxTranscriptLines,
} from "./agent-runtime-approval-sandbox-smoke-core.mjs";

describe("agent-runtime-approval-sandbox-smoke-core", () => {
  it("应生成覆盖 verifier 关键维度的 transcript 与 failure mode 摘要", () => {
    const evidence = buildApprovalSandboxSmokeEvidence({
      commandResults: [],
      generatedAt: "2026-05-10T00:00:00.000Z",
    });

    expect(evidence.transcriptKind).toBe("verified_projection_summary");
    expect(evidence.transcriptSteps.map((entry) => entry.category)).toEqual(
      expect.arrayContaining([
        "tool request",
        "approval decision",
        "sandbox policy",
        "result",
        "error",
        "recovery action",
      ]),
    );
    expect(evidence.evidenceChecks.every((entry) => entry.satisfied)).toBe(
      true,
    );
    expect(evidence.failureModeCoverage.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "approval bypass",
        "tool result missing",
        "timeout without recovery",
        "unsafe tool exposed",
      ]),
    );
  });

  it("live runtime transcript 满足门禁时应标记为 liveRuntimeTranscript", () => {
    const evidence = buildApprovalSandboxSmokeEvidence({
      commandResults: [],
      generatedAt: "2026-05-10T00:00:00.000Z",
      liveRuntimeTranscript: {
        kind: "devbridge-runtime-permission-confirmation",
        health: { status: "ok" },
        workspaceId: "workspace-1",
        flows: [
          {
            decision: "denied",
            sessionId: "session-denied",
            turnId: "turn-denied",
            requestId: "runtime_permission_confirmation:turn-denied",
            submittedPolicies: {
              approvalPolicy: "on-request",
              sandboxPolicy: "workspace-write",
            },
            before: {
              permissionStatus: "requires_confirmation",
              confirmationStatus: "requested",
              pendingRequestCount: 1,
              latestTurnStatus: "failed",
            },
            respond: {
              confirmed: false,
              responseLabel: "拒绝",
            },
            after: {
              confirmationStatus: "denied",
              pendingRequestCount: 0,
              threadStatus: "failed",
            },
          },
        ],
        assertions: {
          devBridgeHealthy: true,
          permissionRequestCreatedBeforeModel: true,
          deniedDecisionClearsPendingRequest: true,
          resolvedDecisionClearsPendingRequest: true,
          approvalPolicySubmitted: true,
          sandboxPolicySubmitted: true,
        },
      },
    });

    expect(evidence.transcriptKind).toBe(
      "verified_projection_and_live_runtime_transcript",
    );
    expect(evidence.coverage.liveRuntimeTranscript).toBe(true);

    const lines = renderApprovalSandboxTranscriptLines(evidence).join("\n");
    expect(lines).toContain("live.transcript.denied.request");
    expect(lines).toContain(
      "live.assertion.permissionRequestCreatedBeforeModel: satisfied",
    );
  });

  it("denied-only DevBridge transcript 满足门禁时不应标记为 live Provider 证据", () => {
    const evidence = buildApprovalSandboxSmokeEvidence({
      commandResults: [],
      generatedAt: "2026-05-10T00:00:00.000Z",
      devBridgeDeniedRuntimeTranscript: {
        kind: "devbridge-runtime-permission-confirmation-denied-only",
        health: { status: "ok" },
        workspaceId: "workspace-1",
        flows: [
          {
            decision: "denied",
            sessionId: "session-denied",
            turnId: "turn-denied",
            requestId: "runtime_permission_confirmation:turn-denied",
            submittedStrategy: "react",
            submittedPolicies: {
              approvalPolicy: "on-request",
              sandboxPolicy: "workspace-write",
            },
            before: {
              permissionStatus: "requires_confirmation",
              confirmationStatus: "requested",
              pendingRequestCount: 1,
              latestTurnStatus: "failed",
            },
            respond: {
              confirmed: false,
              responseLabel: "拒绝",
            },
            after: {
              confirmationStatus: "denied",
              pendingRequestCount: 0,
              threadStatus: "failed",
            },
          },
        ],
        assertions: {
          devBridgeHealthy: true,
          permissionRequestCreatedBeforeModel: true,
          deniedDecisionClearsPendingRequest: true,
          approvalPolicySubmitted: true,
          sandboxPolicySubmitted: true,
          reactRuntimeSubmitted: true,
          providerNotRequired: true,
        },
      },
    });

    expect(evidence.transcriptKind).toBe(
      "verified_projection_and_devbridge_denied_runtime_transcript",
    );
    expect(evidence.coverage.devBridgeDeniedRuntimeTranscript).toBe(true);
    expect(evidence.coverage.liveRuntimeTranscript).toBe(false);

    const lines = renderApprovalSandboxTranscriptLines(evidence).join("\n");
    expect(lines).toContain("devbridge-denied.transcript.denied.request");
    expect(lines).toContain(
      "devbridge-denied.assertion.providerNotRequired: satisfied",
    );
  });

  it("应把 transcript、evidence 与 failure mode 渲染到 stdout 友好的行文本", () => {
    const evidence = buildApprovalSandboxSmokeEvidence({
      commandResults: [],
      generatedAt: "2026-05-10T00:00:00.000Z",
    });

    const lines = renderApprovalSandboxTranscriptLines(evidence).join("\n");

    expect(lines).toContain("transcript.tool-request");
    expect(lines).toContain("transcript.approval-decision");
    expect(lines).toContain("transcript.sandbox-policy");
    expect(lines).toContain("transcript.tool-result");
    expect(lines).toContain("transcript.tool-error");
    expect(lines).toContain("transcript.timeout-recovery");
    expect(lines).toContain("evidence.tool timeline: satisfied");
    expect(lines).toContain("evidence.approval decision: satisfied");
    expect(lines).toContain("evidence.sandbox policy: satisfied");
    expect(lines).toContain("evidence.error recovery transcript: satisfied");
    expect(lines).toContain("failure.approval bypass: covered");
    expect(lines).toContain("failure.tool result missing: covered");
    expect(lines).toContain("failure.timeout without recovery: covered");
    expect(lines).toContain("failure.unsafe tool exposed: covered");
  });
});
