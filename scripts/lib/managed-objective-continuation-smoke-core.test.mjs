import { describe, expect, it } from "vitest";

import {
  buildSmokeEvidence,
  createAgentSessionCurrent,
  evidencePackExplainsObjectiveStop,
  guardDecisionFromSummary,
  objectiveReachedBudgetLimit,
  objectiveStopState,
  readAgentRuntimeThreadCurrent,
  readAgentSessionDetailCurrent,
  respondAgentSessionActionCurrent,
  startAgentSessionTurnCurrent,
  updateAgentSessionRuntimeCurrent,
} from "./managed-objective-continuation-smoke-core.mjs";

function options() {
  return {
    timeoutMs: 180_000,
    intervalMs: 1_000,
    maxAutoTurns: 1,
  };
}

function provider() {
  return {
    providerPreference: "fixture-provider",
    providerName: "fixture-provider",
    modelPreference: "fixture-model",
    source: "fixture",
  };
}

function finalObjective(overrides = {}) {
  return {
    objective_id: "objective-1",
    owner_kind: "agent_session",
    owner_id: "session-1",
    status: "budget_limited",
    blocker_reason: "自动续跑已达到最大轮数 1/1",
    last_audit_summary:
      "auto_continuation_guard decision=budget_limited:自动续跑已达到最大轮数 1/1; auto_turns=1/1; max_elapsed_ms=180000; estimated_cost=0.000000; max_estimated_cost=1.000000",
    last_evidence_pack_ref: ".lime/harness/sessions/session-1/evidence",
    last_artifact_refs: ["reports/daily.md"],
    ...overrides,
  };
}

function buildEvidence(overrides = {}) {
  return buildSmokeEvidence({
    generatedAt: "2026-05-25T00:00:00.000Z",
    options: options(),
    workspace: { id: "workspace-1", name: "Workspace" },
    provider: provider(),
    sessionId: "session-1",
    turnId: "turn-1",
    objective: finalObjective(),
    allowSnapshot: {
      objective: {
        lastAuditSummary:
          "auto_continuation_guard decision=allow; queued_turn_id=queued-1; auto_turns=1/1",
      },
    },
    finalSnapshot: {
      session: { turnCount: 2 },
    },
    evidencePack: {
      sessionId: "session-1",
      threadStatus: "completed",
      latestTurnStatus: "completed",
      turnCount: 2,
      itemCount: 4,
      pendingRequestCount: 0,
      queuedTurnCount: 0,
      completionAuditSummary: {
        source: "runtime_evidence_pack_completion_audit",
        decision: "needs_evidence_review",
      },
    },
    ...overrides,
  });
}

describe("managed-objective-continuation-smoke-core", () => {
  it("应从 fixture 证明 allow -> budget_limited -> evidence pack 的 P6 smoke 证据", () => {
    const evidence = buildEvidence();

    expect(evidence.status).toBe("pass");
    expect(evidence.coverage.autoContinuationObserved).toBe(true);
    expect(evidence.coverage.budgetLimitObserved).toBe(true);
    expect(evidence.guard.finalDecision).toBe("budget_limited");
    expect(evidence.guard.allowSummary).toContain("decision=allow");
    expect(evidence.assertions).toEqual({
      objectiveStoppedWithKnownReason: true,
      objectiveMatchesExpectedFinalStatus: true,
      objectiveBudgetLimited: true,
      guardSummaryPresent: true,
      evidencePackExplainsFinalState: true,
      atLeastTwoTurnsObserved: true,
    });
    expect(evidence.evidencePack.turnCount).toBe(2);
  });

  it("应从 fixture 证明 completed 停止态必须由 evidence pack completion audit 解释", () => {
    const completedObjective = finalObjective({
      status: "completed",
      blocker_reason: null,
      last_audit_summary:
        "auto_continuation_guard decision=completed; evidence_pack=.lime/harness/sessions/session-1/evidence; artifacts=1",
    });
    const evidence = buildEvidence({
      options: {
        ...options(),
        expectedFinalStatus: "completed",
      },
      objective: completedObjective,
      evidencePack: {
        sessionId: "session-1",
        threadStatus: "completed",
        latestTurnStatus: "completed",
        turnCount: 2,
        itemCount: 4,
        pendingRequestCount: 0,
        queuedTurnCount: 0,
        completionAuditSummary: {
          source: "runtime_evidence_pack_completion_audit",
          decision: "completed",
        },
      },
    });

    expect(objectiveStopState(completedObjective)).toBe("completed");
    expect(evidence.status).toBe("pass");
    expect(evidence.coverage.completedStopObserved).toBe(true);
    expect(evidence.coverage.budgetLimitObserved).toBe(false);
    expect(evidence.guard.finalDecision).toBe("completed");
    expect(evidence.assertions.objectiveMatchesExpectedFinalStatus).toBe(true);
    expect(evidence.assertions.evidencePackExplainsFinalState).toBe(true);
  });

  it("completed objective 缺少 completed audit 时不能只凭 guard summary 通过", () => {
    const completedObjective = finalObjective({
      status: "completed",
      blocker_reason: null,
      last_audit_summary:
        "auto_continuation_guard decision=completed; evidence_pack=.lime/harness/sessions/session-1/evidence; artifacts=1",
    });
    const evidencePack = {
      sessionId: "session-1",
      threadStatus: "completed",
      latestTurnStatus: "completed",
      turnCount: 2,
      completionAuditSummary: {
        source: "runtime_evidence_pack_completion_audit",
        decision: "needs_evidence_review",
      },
    };
    const evidence = buildEvidence({
      options: {
        ...options(),
        expectedFinalStatus: "completed",
      },
      objective: completedObjective,
      evidencePack,
    });

    expect(evidencePackExplainsObjectiveStop(completedObjective, evidencePack)).toBe(
      false,
    );
    expect(evidence.status).toBe("fail");
    expect(evidence.assertions.objectiveMatchesExpectedFinalStatus).toBe(true);
    expect(evidence.assertions.evidencePackExplainsFinalState).toBe(false);
  });

  it("应从 fixture 证明 needs_input 停止态能由 pending request 证据解释", () => {
    const needsInputObjective = finalObjective({
      status: "needs_input",
      blocker_reason: "等待用户补充信息",
      last_audit_summary:
        "auto_continuation_guard decision=needs_input; pending_request_count=1; evidence_pack=.lime/harness/sessions/session-1/evidence",
      last_artifact_refs: [],
    });
    const evidence = buildEvidence({
      options: {
        ...options(),
        expectedFinalStatus: "needs_input",
      },
      objective: needsInputObjective,
      evidencePack: {
        sessionId: "session-1",
        threadStatus: "waiting_request",
        latestTurnStatus: "waiting_request",
        turnCount: 2,
        itemCount: 4,
        pendingRequestCount: 1,
        queuedTurnCount: 0,
        completionAuditSummary: {
          source: "runtime_evidence_pack_completion_audit",
          decision: "needs_input",
        },
      },
    });

    expect(objectiveStopState(needsInputObjective)).toBe("needs_input");
    expect(evidence.status).toBe("pass");
    expect(evidence.coverage.needsInputStopObserved).toBe(true);
    expect(evidence.guard.finalDecision).toBe("needs_input");
    expect(evidence.assertions.objectiveMatchesExpectedFinalStatus).toBe(true);
    expect(evidence.assertions.evidencePackExplainsFinalState).toBe(true);
  });

  it("缺少 evidence pack completion audit 时不能误标为通过", () => {
    const evidence = buildEvidence({
      evidencePack: {
        sessionId: "session-1",
        threadStatus: "completed",
        turnCount: 2,
      },
    });

    expect(evidence.status).toBe("fail");
    expect(evidence.coverage.evidencePackExported).toBe(true);
    expect(evidence.assertions.objectiveBudgetLimited).toBe(true);
    expect(evidence.assertions.objectiveMatchesExpectedFinalStatus).toBe(true);
    expect(evidence.assertions.evidencePackExplainsFinalState).toBe(false);
  });

  it("不足两轮 turn 时不能误标为自动续跑已验证", () => {
    const evidence = buildEvidence({
      finalSnapshot: {
        session: { turnCount: 1 },
      },
    });

    expect(evidence.status).toBe("fail");
    expect(evidence.assertions.atLeastTwoTurnsObserved).toBe(false);
  });

  it("应兼容 budget_limited 的 blocker 和 guard summary 判定", () => {
    expect(objectiveReachedBudgetLimit(finalObjective())).toBe(true);
    expect(
      objectiveReachedBudgetLimit({
        status: "active",
        blockerReason: "reached maximum auto turns",
      }),
    ).toBe(true);
    expect(guardDecisionFromSummary("auto_continuation_guard decision=allow")).toBe(
      "allow",
    );
  });

  it("session helper 应只经 App Server JSON-RPC current 方法读写会话", async () => {
    const originalFetch = globalThis.fetch;
    const observedParams = [];
    const observedMethods = [];
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.cmd).toBe("app_server_handle_json_lines");
      const line = JSON.parse(String(body.args?.request?.lines?.[0] || "{}"));
      observedMethods.push(line.method);
      observedParams.push(line.params);
      const resultByMethod = {
        "agentSession/start": {
          session: {
            sessionId: "session-current",
            threadId: "thread-current",
            appId: "desktop",
            status: "idle",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z",
          },
        },
        "agentSession/update": {
          session: {
            sessionId: "session-current",
            model: "fixture-model",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z",
            messagesCount: 0,
          },
        },
        "agentSession/read": {
          session: {
            sessionId: "session-current",
            threadId: "thread-current",
            appId: "desktop",
            status: "idle",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z",
          },
          turns: [],
          detail: {
            id: "session-current",
            turns: [],
            messages: [],
            items: [],
          },
        },
        "agentSession/turn/start": {
          turn: {
            turnId: "turn-current",
            sessionId: "session-current",
            threadId: "thread-current",
            status: "accepted",
          },
        },
        "agentSession/action/respond": {},
        "agentSession/turn/cancel": {},
      };
      return new Response(
        JSON.stringify({
          result: {
            lines: [
              JSON.stringify({
                id: line.id,
                result: resultByMethod[line.method],
              }),
            ],
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };

    try {
      const smokeOptions = {
        invokeUrl: "http://127.0.0.1:3030/invoke",
        timeoutMs: 180_000,
      };
      const sessionId = await createAgentSessionCurrent(smokeOptions, {
        workspaceId: "workspace-current",
        title: "Current session",
        metadata: {
          harness: {
            hiddenFromUserRecents: true,
            source: "smoke:agent-runtime-tool-execution",
            scenarioId: "safe-core-tools",
          },
        },
      });
      await updateAgentSessionRuntimeCurrent(smokeOptions, {
        sessionId,
        provider: provider(),
      });
      await startAgentSessionTurnCurrent(smokeOptions, {
        sessionId,
        workspaceId: "workspace-current",
        message: "请只回复 OK",
        eventName: "event-current",
        turnId: "turn-current",
        turnConfig: {
          providerPreference: "fixture-provider",
          modelPreference: "fixture-model",
          approvalPolicy: "never",
          sandboxPolicy: "read-only",
          metadata: { source: "test" },
        },
        skipPreSubmitResume: true,
      });
      await respondAgentSessionActionCurrent(smokeOptions, {
        sessionId,
        requestId: "request-current",
        actionType: "elicitation",
        confirmed: true,
        response: JSON.stringify({ answer: "继续" }),
        userData: { answer: "继续" },
        eventName: "event-current",
        actionScope: {
          session_id: sessionId,
          thread_id: "thread-current",
          turn_id: "turn-current",
        },
      });
      await readAgentRuntimeThreadCurrent(smokeOptions, sessionId);
      const detail = await readAgentSessionDetailCurrent(
        smokeOptions,
        sessionId,
        { historyLimit: 80 },
      );

      expect(sessionId).toBe("session-current");
      expect(detail.id).toBe("session-current");
      expect(observedMethods).toEqual([
        "agentSession/start",
        "agentSession/update",
        "agentSession/turn/start",
        "agentSession/action/respond",
        "agentSession/read",
        "agentSession/read",
      ]);
      expect(observedMethods).not.toContain("agent_runtime_create_session");
      expect(observedMethods).not.toContain("agent_runtime_update_session");
      expect(observedMethods).not.toContain("agent_runtime_get_session");
      expect(observedMethods).not.toContain("agent_runtime_submit_turn");
      expect(observedMethods).not.toContain("agent_runtime_respond_action");
      expect(observedParams[0].businessObjectRef.metadata.harness).toEqual({
        hiddenFromUserRecents: true,
        source: "smoke:agent-runtime-tool-execution",
        scenarioId: "safe-core-tools",
      });
      expect(observedParams[2]).toMatchObject({
        sessionId: "session-current",
        turnId: "turn-current",
        input: {
          text: "请只回复 OK",
        },
        runtimeOptions: {
          eventName: "event-current",
          providerPreference: "fixture-provider",
          modelPreference: "fixture-model",
          metadata: { source: "test" },
          hostOptions: {
            asterChatRequest: {
              message: "请只回复 OK",
              session_id: "session-current",
              workspace_id: "workspace-current",
              event_name: "event-current",
              turn_id: "turn-current",
              provider_preference: "fixture-provider",
              model_preference: "fixture-model",
              approval_policy: "never",
              sandbox_policy: "read-only",
              metadata: { source: "test" },
            },
          },
        },
        skipPreSubmitResume: true,
      });
      expect(observedParams[3]).toMatchObject({
        sessionId: "session-current",
        requestId: "request-current",
        actionType: "elicitation",
        confirmed: true,
        actionScope: {
          sessionId: "session-current",
          threadId: "thread-current",
          turnId: "turn-current",
        },
      });
      expect(observedParams[5]).toMatchObject({
        sessionId: "session-current",
        historyLimit: 80,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
