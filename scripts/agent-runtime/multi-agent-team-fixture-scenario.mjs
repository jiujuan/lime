export const MULTI_AGENT_TEAM_SCENARIO = "multi-agent-team";
export const MULTI_AGENT_TEAM_PROMPT =
  "请启用多 Agent 团队完成一次研究、撰写和复核协作。";
export const MULTI_AGENT_TEAM_DONE_TEXT = "CLAW_MULTI_AGENT_TEAM_DONE";
export const MULTI_AGENT_TEAM_SUMMARY_TEXT = "多 Agent 团队已回到同一主线程";
export const MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID =
  "fixture-team-child-researcher";
export const MULTI_AGENT_TEAM_CHILD_REVIEWER_ID = "fixture-team-child-reviewer";
export const MULTI_AGENT_TEAM_REVIEW_ID = "fixture-team-review-1";
export const MULTI_AGENT_TEAM_WORKER_RESULT_REF =
  "artifact://fixture-team/worker-result";
export const MULTI_AGENT_TEAM_WORKER_NOTIFICATION_ID = `${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}:completed`;
export const MULTI_AGENT_TEAM_ASSERTION_KEYS = [
  "multiAgentTeamPromptReachedBackend",
  "guiMultiAgentTeamInputSubmitted",
  "guiMultiAgentTeamCompleted",
  "readModelMultiAgentTeamCompleted",
  "readModelMultiAgentTeamFactsObserved",
  "evidencePackMultiAgentTeamExported",
  "evidencePackMultiAgentTeamParentThreadBound",
  "evidencePackMultiAgentTeamHandoffObserved",
  "evidencePackMultiAgentTeamWorkerNotificationObserved",
  "evidencePackMultiAgentTeamReviewLaneObserved",
  "multiAgentTeamNoAgentFirstHistory",
];

export function renderMultiAgentTeamBackendEvents() {
  return `
  if (isMultiAgentTeamPrompt) {
    emitEvents([
      {
        type: "subagent_status_changed",
        payload: {
          session_id: "${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}",
          root_session_id: input.request?.session?.sessionId,
          parent_session_id: input.request?.session?.sessionId,
          status: "running",
          latest_turn_id: \`\${currentTurnId()}:researcher\`,
          latest_turn_status: "running",
          queued_turn_count: 0,
          team_phase: "running",
          team_parallel_budget: 2,
          team_active_count: 1,
          team_queued_count: 1,
          provider_concurrency_group: "fixture-team",
          provider_parallel_budget: 2,
          queue_reason: "parent_thread_team_orchestration",
          retryable_overload: false,
          result_ref: "${MULTI_AGENT_TEAM_WORKER_RESULT_REF}"
        }
      },
      {
        type: "team.changed",
        payload: {
          teamEvent: "teammate_status_changed",
          parentSessionId: input.request?.session?.sessionId,
          childSessionId: "${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}",
          status: "running",
          teamPhase: "running",
          teamParallelBudget: 2,
          teamActiveCount: 1,
          teamQueuedCount: 1
        }
      },
      {
        type: "task.changed",
        payload: {
          taskEvent: "team_control",
          taskId: "${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}",
          agentId: "${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}",
          parentSessionId: input.request?.session?.sessionId,
          runtimeEntity: "subagent_turn",
          runtimeStatus: "running",
          latestTurnStatus: "running",
          teamPhase: "running"
        }
      },
      {
        type: "agent.handoff",
        payload: {
          handoffId: \`\${input.request?.session?.sessionId}:handoff:${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}\`,
          parentSessionId: input.request?.session?.sessionId,
          childSessionId: "${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}",
          status: "accepted",
          from: input.request?.session?.sessionId,
          to: "${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}",
          contextBoundary: "parent_thread",
          transcriptRef: \`${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}:\${currentTurnId()}:researcher\`
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "subagent_status_changed",
        payload: {
          session_id: "${MULTI_AGENT_TEAM_CHILD_REVIEWER_ID}",
          root_session_id: input.request?.session?.sessionId,
          parent_session_id: input.request?.session?.sessionId,
          status: "queued",
          latest_turn_id: \`\${currentTurnId()}:reviewer\`,
          latest_turn_status: "queued",
          queued_turn_count: 1,
          team_phase: "queued",
          team_parallel_budget: 2,
          team_active_count: 1,
          team_queued_count: 1,
          provider_concurrency_group: "fixture-team",
          provider_parallel_budget: 2,
          queue_reason: "waiting_for_researcher_result",
          retryable_overload: false
        }
      },
      {
        type: "task.changed",
        payload: {
          taskEvent: "team_control",
          surface: "review_lane",
          reviewId: "${MULTI_AGENT_TEAM_REVIEW_ID}",
          workItemId: "${MULTI_AGENT_TEAM_REVIEW_ID}",
          parentSessionId: input.request?.session?.sessionId,
          childSessionId: "${MULTI_AGENT_TEAM_CHILD_REVIEWER_ID}",
          runtimeEntity: "work_item",
          runtimeStatus: "waiting",
          teamPhase: "queued"
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "subagent_status_changed",
        payload: {
          session_id: "${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}",
          root_session_id: input.request?.session?.sessionId,
          parent_session_id: input.request?.session?.sessionId,
          status: "completed",
          latest_turn_id: \`\${currentTurnId()}:researcher\`,
          latest_turn_status: "completed",
          queued_turn_count: 0,
          team_phase: "completed",
          team_parallel_budget: 2,
          team_active_count: 0,
          team_queued_count: 1,
          provider_concurrency_group: "fixture-team",
          provider_parallel_budget: 2,
          usage: {
            input_tokens: 128,
            output_tokens: 64,
            cached_input_tokens: 16
          },
          duration_ms: 940,
          tool_count: 2,
          result_ref: "${MULTI_AGENT_TEAM_WORKER_RESULT_REF}"
        }
      },
      {
        type: "agent.completed",
        payload: {
          agentEvent: "worker_completed",
          parentSessionId: input.request?.session?.sessionId,
          childSessionId: "${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}",
          status: "completed",
          resultRef: "${MULTI_AGENT_TEAM_WORKER_RESULT_REF}",
          transcriptRef: \`${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}:\${currentTurnId()}:researcher\`
        }
      },
      {
        type: "worker.notification",
        payload: {
          workerNotificationId: "${MULTI_AGENT_TEAM_WORKER_NOTIFICATION_ID}",
          notificationKind: "worker_completed",
          parentSessionId: input.request?.session?.sessionId,
          childSessionId: "${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}",
          status: "completed",
          resultRef: "${MULTI_AGENT_TEAM_WORKER_RESULT_REF}",
          transcriptRef: \`${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}:\${currentTurnId()}:researcher\`
        }
      },
      {
        type: "artifact.snapshot",
        payload: {
          artifactId: "fixture-team-worker-result",
          path: ".lime/artifacts/team/fixture-worker-result.json",
          kind: "team_worker_result",
          metadata: {
            parentSessionId: input.request?.session?.sessionId,
            childSessionId: "${MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID}",
            threadId: currentThreadId(),
            turnId: currentTurnId()
          }
        }
      }
    ]);
    await sleep(80);
  }
`;
}

function arrayIncludes(value, key, expected) {
  const values = value?.[key];
  return Array.isArray(values) && values.includes(expected);
}

export function summarizeMultiAgentTeamEvidenceExport(exportResult, context) {
  const evidencePack =
    exportResult?.evidencePack ?? exportResult?.evidence_pack;
  const observability =
    evidencePack?.observabilitySummary ??
    evidencePack?.observability_summary ??
    null;
  const teamFacts =
    observability?.team_facts ?? observability?.teamFacts ?? null;
  const events = Array.isArray(exportResult?.events) ? exportResult.events : [];
  const artifacts = Array.isArray(exportResult?.artifacts)
    ? exportResult.artifacts
    : [];
  const serialized = JSON.stringify(exportResult || {});
  return {
    exported: Boolean(evidencePack),
    teamFactsStatus: teamFacts?.status ?? null,
    eventCount: teamFacts?.eventCount ?? null,
    teamEventCount: teamFacts?.teamEventCount ?? null,
    taskEventCount: teamFacts?.taskEventCount ?? null,
    agentEventCount: teamFacts?.agentEventCount ?? null,
    handoffCount: teamFacts?.handoffCount ?? null,
    workerNotificationCount: teamFacts?.workerNotificationCount ?? null,
    reviewLaneCount: teamFacts?.reviewLaneCount ?? null,
    includesParentSession: arrayIncludes(
      teamFacts,
      "parentSessionIds",
      context.sessionId,
    ),
    includesThread: arrayIncludes(teamFacts, "threadIds", context.threadId),
    includesTurn: arrayIncludes(teamFacts, "turnIds", context.turnId),
    includesResearcher: arrayIncludes(
      teamFacts,
      "childSessionIds",
      MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID,
    ),
    includesReviewer: arrayIncludes(
      teamFacts,
      "childSessionIds",
      MULTI_AGENT_TEAM_CHILD_REVIEWER_ID,
    ),
    includesHandoff: Array.isArray(teamFacts?.handoffIds)
      ? teamFacts.handoffIds.some((handoffId) =>
          String(handoffId).includes(MULTI_AGENT_TEAM_CHILD_RESEARCHER_ID),
        )
      : false,
    includesWorkerNotification: arrayIncludes(
      teamFacts,
      "workerNotificationIds",
      MULTI_AGENT_TEAM_WORKER_NOTIFICATION_ID,
    ),
    includesReview: arrayIncludes(
      teamFacts,
      "reviewIds",
      MULTI_AGENT_TEAM_REVIEW_ID,
    ),
    includesRunningPhase: arrayIncludes(teamFacts, "teamPhases", "running"),
    includesQueuedPhase: arrayIncludes(teamFacts, "teamPhases", "queued"),
    includesCompletedPhase: arrayIncludes(teamFacts, "teamPhases", "completed"),
    hasSubagentStatusEvent: events.some(
      (event) =>
        event?.eventType === "subagent_status_changed" ||
        event?.event_type === "subagent_status_changed",
    ),
    hasTeamChangedEvent: events.some(
      (event) =>
        event?.eventType === "team.changed" ||
        event?.event_type === "team.changed",
    ),
    hasWorkerNotificationEvent: events.some(
      (event) =>
        event?.eventType === "worker.notification" ||
        event?.event_type === "worker.notification",
    ),
    hasWorkerResultArtifact: artifacts.some(
      (artifact) =>
        artifact?.artifactRef === "fixture-team-worker-result" ||
        artifact?.artifact_ref === "fixture-team-worker-result",
    ),
    forbiddenAgentFirstHistory:
      serialized.includes("subagentHistory") ||
      serialized.includes("subagent_history") ||
      serialized.includes("childSubagentHistory") ||
      serialized.includes("subagentSessionHistory"),
  };
}
