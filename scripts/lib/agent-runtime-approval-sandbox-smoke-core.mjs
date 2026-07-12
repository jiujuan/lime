function createTranscriptSteps() {
  return [
    {
      id: "tool-request",
      category: "tool request",
      eventTypes: ["tool.started", "tool.args"],
      summary:
        "允许工具请求会投影为 tool.started/tool.args，保留 tool id、tool name 与输入参数摘要。",
      details: {
        toolCallId: "tool-1",
        toolName: "read_file",
        phase: "acting",
        inputAvailable: true,
        inputSummary: '{"path":"README.md"}',
      },
      sourceRefs: [
        "src/components/agent/chat/projection/agentUiEventProjection.test.ts:676",
      ],
    },
    {
      id: "approval-decision",
      category: "approval decision",
      eventTypes: ["run.status", "permission.changed"],
      summary:
        "需要授权时会先进入 permission_review，并通过 permission.changed 暴露 decision、askProfileKeys 与 confirmation request。",
      details: {
        phase: "waiting",
        permissionStatus: "requires_confirmation",
        confirmationStatus: "not_requested",
        confirmationRequestId: "approval-1",
        decisionSource: "runtime",
        decisionScope: "turn",
        askProfileKeys: ["read_files"],
        requiredProfileKeys: ["read_files", "write_artifacts"],
      },
      sourceRefs: [
        "src/components/agent/chat/projection/agentUiEventProjection.test.ts:85",
        "src/components/agent/chat/components/AgentThreadTimeline.test.tsx:904",
        "src/components/agent/chat/components/MessageList.test.tsx:1845",
      ],
    },
    {
      id: "sandbox-policy",
      category: "sandbox policy",
      eventTypes: ["permission.changed"],
      summary:
        "turn_context 会透传 approvalPolicy 与 sandboxPolicy，确保 runtime policy 不会在 UI 证据链中丢失。",
      details: {
        phase: "preparing",
        approvalPolicy: "on-request",
        sandboxPolicy: "workspace-write",
        sourceEvent: "turn_context",
      },
      sourceRefs: [
        "src/components/agent/chat/projection/agentUiEventProjection.test.ts:1480",
        "src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts:1",
      ],
    },
    {
      id: "tool-result",
      category: "result",
      eventTypes: ["tool.result"],
      summary:
        "成功工具结果会归档为 tool.result，并保留 artifact refs，避免出现 tool result missing。",
      details: {
        toolCallId: "tool-1",
        success: true,
        phase: "completed",
        artifactPaths: [".lime/artifacts/demo.md"],
        artifactIds: ["artifact-1"],
      },
      sourceRefs: [
        "src/components/agent/chat/projection/agentUiEventProjection.test.ts:676",
      ],
    },
    {
      id: "tool-error",
      category: "error",
      eventTypes: ["tool.failed"],
      summary:
        "失败工具结果会归档为 tool.failed，并保留错误预览与 metadata，避免错误路径丢失。",
      details: {
        toolCallId: "tool-2",
        success: false,
        phase: "failed",
        errorPreview: "Permission denied",
        metadataKeys: ["sandboxed", "exit_code"],
      },
      sourceRefs: [
        "src/components/agent/chat/projection/agentUiEventProjection.test.ts:676",
        "src/components/agent/chat/hooks/useAgentChat.test.tsx:7801",
      ],
    },
    {
      id: "timeout-recovery",
      category: "recovery action",
      eventTypes: ["timeout.recover", "timeout.defer", "timeout.fail"],
      summary:
        "首包超时与 inactivity timeout 都有明确恢复动作矩阵和用户可见文案，拒绝或超时不会把用户卡死。",
      details: {
        firstEventActions: {
          recover: "recover",
          defer: "defer",
          fail: "fail",
        },
        inactivityActions: {
          recover: "recover",
          fail: "fail",
        },
        warnings: [
          "[AgentChat] 首个运行时事件静默，已降级切换为会话快照同步: event-a",
          "[AgentChat] 首个运行时事件暂未到达，已基于提交派发继续等待后续进度: event-a",
          "[AgentChat] 运行时事件静默，已降级切换为会话快照同步: event-a",
        ],
        failureMessage: "执行已中断：运行时长时间没有返回新进度，请重试。",
      },
      sourceRefs: [
        "src/components/agent/chat/hooks/agentStreamInactivityController.test.ts:1",
      ],
    },
  ];
}

function createEvidenceChecks() {
  return [
    {
      id: "tool timeline",
      satisfied: true,
      summary:
        "由 tool-request、tool-result 与 tool-error 三段 transcript 组成完整 tool timeline。",
      transcriptStepIds: ["tool-request", "tool-result", "tool-error"],
    },
    {
      id: "approval decision",
      satisfied: true,
      summary:
        "approval-decision transcript 暴露 permission.changed waiting 状态、decision source/scope 与 confirmation request。",
      transcriptStepIds: ["approval-decision"],
    },
    {
      id: "sandbox policy",
      satisfied: true,
      summary:
        "sandbox-policy transcript 暴露 turn_context approvalPolicy/sandboxPolicy。",
      transcriptStepIds: ["sandbox-policy"],
    },
    {
      id: "error recovery transcript",
      satisfied: true,
      summary:
        "timeout-recovery transcript 暴露 recover/defer/fail 动作矩阵与用户可见 warning/message。",
      transcriptStepIds: ["timeout-recovery"],
    },
  ];
}

function createFailureModeCoverage() {
  return [
    {
      id: "approval bypass",
      status: "covered",
      summary:
        "approval-decision 与 sandbox-policy transcript 证明 runtime 会先进入 waiting/policy gate，再继续工具执行。",
      transcriptStepIds: ["approval-decision", "sandbox-policy"],
    },
    {
      id: "tool result missing",
      status: "covered",
      summary:
        "tool-result 与 tool-error transcript 同时存在，成功/失败路径都不会丢失结果。",
      transcriptStepIds: ["tool-result", "tool-error"],
    },
    {
      id: "timeout without recovery",
      status: "covered",
      summary:
        "timeout-recovery transcript 暴露 recover/defer/fail 分支与用户可见 warning/message，不会让用户卡死。",
      transcriptStepIds: ["timeout-recovery"],
    },
    {
      id: "unsafe tool exposed",
      status: "covered",
      summary:
        "工具权限与来源会进入 Harness 工具库存区块，危险工具暴露由 companion tool-surface smoke 共同覆盖。",
      transcriptStepIds: ["approval-decision"],
      companionCommand: "npm run smoke:agent-runtime-tool-surface",
    },
  ];
}

function liveRuntimeTranscriptSatisfiesReleaseGate(liveRuntimeTranscript) {
  const assertions = liveRuntimeTranscript?.assertions;
  return Boolean(
    assertions?.devBridgeHealthy &&
    assertions?.permissionRequestCreatedBeforeModel &&
    assertions?.deniedDecisionClearsPendingRequest &&
    assertions?.resolvedDecisionClearsPendingRequest &&
    assertions?.approvalPolicySubmitted &&
    assertions?.sandboxPolicySubmitted,
  );
}

function devBridgeDeniedRuntimeTranscriptSatisfiesGate(
  devBridgeDeniedRuntimeTranscript,
) {
  const assertions = devBridgeDeniedRuntimeTranscript?.assertions;
  return Boolean(
    assertions?.devBridgeHealthy &&
    assertions?.permissionRequestCreatedBeforeModel &&
    assertions?.deniedDecisionClearsPendingRequest &&
    assertions?.approvalPolicySubmitted &&
    assertions?.sandboxPolicySubmitted &&
    assertions?.reactRuntimeSubmitted &&
    assertions?.providerNotRequired,
  );
}

function buildApprovalSandboxSmokeEvidence({
  commandResults,
  generatedAt,
  devBridgeDeniedRuntimeTranscript = null,
  liveRuntimeTranscript = null,
}) {
  const transcriptSteps = createTranscriptSteps();
  const evidenceChecks = createEvidenceChecks();
  const failureModeCoverage = createFailureModeCoverage();
  const liveRuntimeTranscriptVerified =
    liveRuntimeTranscriptSatisfiesReleaseGate(liveRuntimeTranscript);
  const devBridgeDeniedRuntimeTranscriptVerified =
    devBridgeDeniedRuntimeTranscriptSatisfiesGate(
      devBridgeDeniedRuntimeTranscript,
    );
  const transcriptKind = liveRuntimeTranscriptVerified
    ? "verified_projection_and_live_runtime_transcript"
    : devBridgeDeniedRuntimeTranscriptVerified
      ? "verified_projection_and_devbridge_denied_runtime_transcript"
      : "verified_projection_summary";
  const limitation = liveRuntimeTranscriptVerified
    ? "该 smoke 同时输出投影/组件事实源与 DevBridge live runtime permission confirmation transcript；tool result/error 和 timeout recovery 仍由定向回归覆盖。"
    : devBridgeDeniedRuntimeTranscriptVerified
      ? "该 smoke 同时输出投影/组件事实源与 DevBridge denied-only runtime permission transcript；denied-only 分支不会继续模型执行，不消耗真实 Provider，resolved/live 长任务仍需 live-provider gate 或 qcloop 证明。"
      : "该 smoke 输出的是由前端提交、投影、UI 与超时恢复事实源生成的结构化 transcript summary；正式发布如需 live session 级证据，仍应由 qcloop 或 replay 采集。";

  return {
    schemaVersion: "v2",
    scenarioId: "tool-approval-sandbox-boundary",
    status: "pass",
    generatedAt,
    evidenceKind: "runtime-approval-sandbox-verified-transcript-smoke",
    transcriptKind,
    limitation,
    coverage: {
      submitPreferences: true,
      approvalDecisionProjection: true,
      sandboxPolicyProjection: true,
      toolRequestResultOrErrorProjection: true,
      permissionRecoveryUi: true,
      harnessPermissionInventory: true,
      runtimeTranscriptSummary: true,
      devBridgeDeniedRuntimeTranscript:
        devBridgeDeniedRuntimeTranscriptVerified,
      liveRuntimeTranscript: liveRuntimeTranscriptVerified,
    },
    devBridgeDeniedRuntimeTranscript,
    liveRuntimeTranscript,
    transcriptSteps,
    evidenceChecks,
    failureModeCoverage,
    commandResults,
    followUpForOfficialEvidence: [
      liveRuntimeTranscriptVerified
        ? "qcloop worker stdout 应保留 live.transcript.* 行，供 release verifier 审计。"
        : "如需 live session 级发布证据，将同样的 transcript 维度写入 qcloop worker stdout 或 replay artifact。",
      "保留 tool request / approval decision / sandbox policy / result-or-error / recovery action 五类 transcript 字段。",
    ],
  };
}

function renderApprovalSandboxTranscriptLines(evidence) {
  const lines = [];

  for (const step of evidence.transcriptSteps) {
    const detailParts = [];
    for (const [key, value] of Object.entries(step.details || {})) {
      if (Array.isArray(value)) {
        detailParts.push(`${key}=${value.join("|")}`);
      } else if (value && typeof value === "object") {
        detailParts.push(`${key}=${JSON.stringify(value)}`);
      } else {
        detailParts.push(`${key}=${String(value)}`);
      }
    }

    lines.push(
      `[smoke:agent-runtime-approval-sandbox] transcript.${step.id}: category=${step.category}; events=${step.eventTypes.join("/")}; ${step.summary}; ${detailParts.join("; ")}`,
    );
  }

  for (const check of evidence.evidenceChecks) {
    lines.push(
      `[smoke:agent-runtime-approval-sandbox] evidence.${check.id}: ${
        check.satisfied ? "satisfied" : "missing"
      }; ${check.summary}; transcript=${check.transcriptStepIds.join(",")}`,
    );
  }

  for (const mode of evidence.failureModeCoverage) {
    lines.push(
      `[smoke:agent-runtime-approval-sandbox] failure.${mode.id}: ${mode.status}; ${mode.summary}; transcript=${mode.transcriptStepIds.join(",")}${
        mode.companionCommand ? `; companion=${mode.companionCommand}` : ""
      }`,
    );
  }

  const deniedRuntime = evidence.devBridgeDeniedRuntimeTranscript;
  if (deniedRuntime) {
    lines.push(
      `[smoke:agent-runtime-approval-sandbox] devbridge-denied.transcript.kind=${deniedRuntime.kind}; devBridgeStatus=${deniedRuntime.health?.status || "unknown"}; workspaceId=${deniedRuntime.workspaceId || ""}; devBridgeDeniedRuntimeTranscript=${evidence.coverage.devBridgeDeniedRuntimeTranscript ? "true" : "false"}`,
    );
    for (const flow of deniedRuntime.flows || []) {
      lines.push(
        `[smoke:agent-runtime-approval-sandbox] devbridge-denied.transcript.${flow.decision}.request: sessionId=${flow.sessionId}; turnId=${flow.turnId}; requestId=${flow.requestId}; permissionStatus=${flow.before?.permissionStatus}; confirmationStatus=${flow.before?.confirmationStatus}; pendingRequestCount=${flow.before?.pendingRequestCount}; latestTurnStatus=${flow.before?.latestTurnStatus}; executionStrategy=${flow.submittedStrategy}; approvalPolicy=${flow.submittedPolicies?.approvalPolicy}; sandboxPolicy=${flow.submittedPolicies?.sandboxPolicy}`,
      );
      lines.push(
        `[smoke:agent-runtime-approval-sandbox] devbridge-denied.transcript.${flow.decision}.decision: confirmed=${flow.respond?.confirmed}; response=${flow.respond?.responseLabel}; afterConfirmationStatus=${flow.after?.confirmationStatus}; afterPendingRequestCount=${flow.after?.pendingRequestCount}; afterThreadStatus=${flow.after?.threadStatus}`,
      );
    }
    for (const [key, value] of Object.entries(deniedRuntime.assertions || {})) {
      lines.push(
        `[smoke:agent-runtime-approval-sandbox] devbridge-denied.assertion.${key}: ${value ? "satisfied" : "missing"}`,
      );
    }
  }

  const live = evidence.liveRuntimeTranscript;
  if (live) {
    lines.push(
      `[smoke:agent-runtime-approval-sandbox] live.transcript.kind=${live.kind}; devBridgeStatus=${live.health?.status || "unknown"}; workspaceId=${live.workspaceId || ""}; liveRuntimeTranscript=${evidence.coverage.liveRuntimeTranscript ? "true" : "false"}`,
    );
    for (const flow of live.flows || []) {
      lines.push(
        `[smoke:agent-runtime-approval-sandbox] live.transcript.${flow.decision}.request: sessionId=${flow.sessionId}; turnId=${flow.turnId}; requestId=${flow.requestId}; permissionStatus=${flow.before?.permissionStatus}; confirmationStatus=${flow.before?.confirmationStatus}; pendingRequestCount=${flow.before?.pendingRequestCount}; latestTurnStatus=${flow.before?.latestTurnStatus}; approvalPolicy=${flow.submittedPolicies?.approvalPolicy}; sandboxPolicy=${flow.submittedPolicies?.sandboxPolicy}`,
      );
      lines.push(
        `[smoke:agent-runtime-approval-sandbox] live.transcript.${flow.decision}.decision: confirmed=${flow.respond?.confirmed}; response=${flow.respond?.responseLabel}; afterConfirmationStatus=${flow.after?.confirmationStatus}; afterPendingRequestCount=${flow.after?.pendingRequestCount}; afterThreadStatus=${flow.after?.threadStatus}`,
      );
    }
    for (const [key, value] of Object.entries(live.assertions || {})) {
      lines.push(
        `[smoke:agent-runtime-approval-sandbox] live.assertion.${key}: ${value ? "satisfied" : "missing"}`,
      );
    }
  }

  return lines;
}

export {
  buildApprovalSandboxSmokeEvidence,
  renderApprovalSandboxTranscriptLines,
};
