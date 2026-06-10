import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentUiActionRequiredEvent,
  buildAgentUiActionResolvedEvent,
  buildAgentUiProjectionBase,
  createAgentUiProjector,
  createEmptyAgentUiProjectionEventStoreState,
  definedString,
  findLatestAgentUiProjectionEventForArtifact,
  inferAgentUiRuntimeEntity,
  indexAgentUiProjectionEvents,
  isAgentInputSourceRecoveryEvent,
  isSubagentTerminalStatus,
  metadataKeys,
  normalizeProjectionIdList,
  normalizeRuntimePhaseFromRuntimeStatusPhase,
  normalizeRuntimeStatusFromRuntimePhase,
  normalizeSubagentRuntimeStatus,
  projectAgentUiState,
  projectAgentRuntimeReadModel,
  readNumberField,
  readRecord,
  selectAgentUiProjectionEventsBySurfaceForScopeFromStore,
  selectAgentUiProjectionEventsByTypeFromStore,
  selectAgentUiProjectionEventsForScopeFromStore,
  selectLatestAgentUiProjectionEventForArtifactFromStore,
  selectLatestAgentUiProjectionEventForRunFromStore,
  selectLatestAgentUiProjectionEventForScopeFromStore,
  selectLatestAgentUiProjectionEventForToolCallFromStore,
  sequenceAgentUiProjectionEvents,
  resolveAgentUiActionRequiredControl,
  resolveAgentUiActionResolvedControl,
  resolveSubagentStatusControl,
  resolveSubagentStatusPhase,
  resolveTeamTopology,
  buildTeamRuntimeFacts,
  buildSubagentRuntimeFacts,
  buildWorkerUsageProjection,
  buildRoutingDecisionPayload,
  extractArtifactRefs,
  summarizeAgentUiProjectionEvents,
  summarizeAgentUiTeamWorkbenchProjectionEvents,
  summarizeAgentUiTeamWorkbenchSurfaceLanes,
  summarizeAgentUiTeamWorkbenchSurfaces,
  truncateText,
} from "../dist/index.js";

test("projectAgentRuntimeReadModel projects actions, evidence and artifacts", () => {
  const actionEvent = {
    id: "evt-action",
    kind: "action",
    status: "pending",
    eventClass: "action.required",
    title: "需要补充输入源",
    actionId: "action-1",
    payload: { actionKind: "add-input-source", targetModule: "knowledge-inputs" },
    createdAt: "2026-06-07T00:00:00.000Z",
  };
  const model = projectAgentRuntimeReadModel({
    sourceCount: 2,
    executionEvents: [
      actionEvent,
      {
        id: "evt-evidence",
        kind: "evidence",
        status: "completed",
        eventClass: "evidence.changed",
        title: "绑定证据",
        evidenceRefs: ["input-source:1"],
        createdAt: "2026-06-07T00:00:01.000Z",
      },
      {
        id: "evt-artifact",
        kind: "draft",
        status: "completed",
        eventClass: "artifact.changed",
        title: "写入草稿",
        artifactRefs: ["prompt-draft:1"],
        createdAt: "2026-06-07T00:00:02.000Z",
      },
    ],
  });

  assert.equal(model.sourceCount, 2);
  assert.equal(model.pendingActions.length, 1);
  assert.equal(model.pendingActions[0].action?.decision, "open-input-source");
  assert.deepEqual(model.pendingActions[0].actions?.map((action) => action.decision), [
    "open-input-source",
  ]);
  assert.deepEqual(model.evidenceRefs, ["input-source:1"]);
  assert.deepEqual(model.artifactRefs, ["prompt-draft:1"]);
  assert.equal(isAgentInputSourceRecoveryEvent(actionEvent), true);
});

test("projectAgentRuntimeReadModel projects multiple HITL controls as standard actions", () => {
  const model = projectAgentRuntimeReadModel({
    executionEvents: [
      {
        id: "evt-action",
        kind: "action",
        status: "pending",
        eventClass: "action.required",
        title: "需要确认",
        actionId: "action-1",
        payload: { controls: ["approve", "reject"] },
        createdAt: "2026-06-07T00:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(model.pendingActions[0].actions?.map((action) => action.decision), [
    "approve",
    "reject",
  ]);
});

test("projectAgentRuntimeReadModel marks resolved actions", () => {
  const model = projectAgentRuntimeReadModel({
    executionEvents: [
      {
        id: "evt-action",
        kind: "action",
        status: "pending",
        eventClass: "action.required",
        title: "需要配置模型",
        actionId: "action-1",
        payload: { actionKind: "configure-text-model" },
        createdAt: "2026-06-07T00:00:00.000Z",
      },
      {
        id: "evt-resolved",
        kind: "action",
        status: "completed",
        eventClass: "action.resolved",
        title: "已处理",
        actionId: "action-1",
        createdAt: "2026-06-07T00:00:01.000Z",
      },
    ],
  });

  assert.equal(model.pendingActions.length, 0);
  assert.equal(model.events[0].resolved, true);
  assert.equal(model.events[0].displayStatusKey, "agent.status.actionResolved");
});

test("projectAgentUiState exposes standard message, timeline and graph projections", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-turn",
        kind: "state",
        status: "running",
        eventClass: "turn.started",
        title: "开始执行",
        turnId: "turn-1",
        sequence: 1,
        createdAt: "2026-06-07T00:00:00.000Z",
      },
      {
        id: "evt-model",
        kind: "model",
        status: "running",
        eventClass: "model.delta",
        title: "模型输出",
        detail: "正在生成",
        turnId: "turn-1",
        runId: "run-1",
        sequence: 2,
        payload: { messageId: "msg-1", text: "你好" },
        createdAt: "2026-06-07T00:00:01.000Z",
      },
      {
        id: "evt-tool",
        kind: "tool",
        status: "completed",
        eventClass: "tool.result",
        title: "读取资料",
        stepId: "step-1",
        toolCallId: "tool-1",
        artifactRefs: ["artifact-1"],
        sequence: 3,
        createdAt: "2026-06-07T00:00:02.000Z",
      },
      {
        id: "evt-action",
        kind: "action",
        status: "pending",
        eventClass: "action.required",
        title: "需要确认",
        actionId: "action-1",
        sequence: 4,
        payload: { actionKind: "configure-text-model" },
        createdAt: "2026-06-07T00:00:03.000Z",
      },
    ],
    sourceCount: 1,
  });

  assert.equal(state.runtime.status, "waiting");
  assert.equal(state.messages[0].type, "text");
  assert.equal(state.messages[0].text, "你好");
  assert.equal(state.timeline.length, 4);
  assert.equal(state.timeline[2].kind, "tool");
  assert.equal(state.graph.some((node) => node.nodeId === "tool-1" && node.nodeType === "tool"), true);
  assert.equal(state.actions.length, 1);
  assert.deepEqual(state.artifacts, [{ id: "artifact-1", sourceEventId: "artifact-1" }]);
  assert.equal(state.hydration.status, "live");
});

test("projectAgentUiState merges streaming text and reasoning parts by scope", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-reasoning-1",
        kind: "note",
        status: "running",
        eventClass: "reasoning.delta",
        title: "思考",
        detail: "Call",
        turnId: "turn-1",
        sequence: 1,
        createdAt: "2026-06-07T00:00:00.000Z",
      },
      {
        id: "evt-reasoning-2",
        kind: "note",
        status: "running",
        eventClass: "reasoning.delta",
        title: "思考",
        detail: "the",
        turnId: "turn-1",
        sequence: 2,
        createdAt: "2026-06-07T00:00:01.000Z",
      },
      {
        id: "evt-model-1",
        kind: "model",
        status: "running",
        eventClass: "model.delta",
        title: "模型输出",
        payload: { messageId: "msg-1", text: "第一段" },
        turnId: "turn-1",
        sequence: 3,
        createdAt: "2026-06-07T00:00:02.000Z",
      },
      {
        id: "evt-model-2",
        kind: "model",
        status: "running",
        eventClass: "model.delta",
        title: "模型输出",
        payload: { messageId: "msg-1", text: "继续" },
        turnId: "turn-1",
        sequence: 4,
        createdAt: "2026-06-07T00:00:03.000Z",
      },
    ],
  });

  assert.deepEqual(state.messages.map((part) => [part.type, part.text]), [
    ["reasoning", "Call the"],
    ["text", "第一段继续"],
  ]);
});

test("projectAgentUiState resolves runtime status from the latest lifecycle event", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-started",
        kind: "state",
        status: "running",
        eventClass: "turn.started",
        title: "开始执行",
        turnId: "turn-1",
        createdAt: "2026-06-07T00:00:00.000Z",
      },
      {
        id: "evt-action",
        kind: "action",
        status: "pending",
        eventClass: "action.required",
        title: "需要确认",
        actionId: "action-1",
        createdAt: "2026-06-07T00:00:01.000Z",
      },
      {
        id: "evt-resolved",
        kind: "action",
        status: "completed",
        eventClass: "action.resolved",
        title: "已确认",
        actionId: "action-1",
        createdAt: "2026-06-07T00:00:02.000Z",
      },
      {
        id: "evt-completed",
        kind: "state",
        status: "completed",
        eventClass: "turn.completed",
        title: "完成",
        turnId: "turn-1",
        createdAt: "2026-06-07T00:00:03.000Z",
      },
    ],
  });

  assert.equal(state.runtime.status, "completed");
});

test("projectAgentUiState keeps unresolved actions in waiting status", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-started",
        kind: "state",
        status: "running",
        eventClass: "turn.started",
        title: "开始执行",
        turnId: "turn-1",
        createdAt: "2026-06-07T00:00:00.000Z",
      },
      {
        id: "evt-action",
        kind: "action",
        status: "pending",
        eventClass: "action.required",
        title: "需要确认",
        actionId: "action-1",
        createdAt: "2026-06-07T00:00:01.000Z",
      },
    ],
  });

  assert.equal(state.runtime.status, "waiting");
});

test("createAgentUiProjector applies events idempotently", () => {
  const projector = createAgentUiProjector();
  const event = {
    id: "evt-model",
    kind: "model",
    status: "completed",
    eventClass: "model.completed",
    title: "完成",
    payload: { messageId: "msg-1", text: "完成" },
    createdAt: "2026-06-07T00:00:00.000Z",
  };

  projector.apply(event);
  projector.apply(event);

  assert.equal(projector.getState().hydration.eventCount, 1);
  assert.equal(projector.getState().messages.length, 1);
  assert.equal(projector.reset().hydration.status, "idle");
});

test("Agent UI projection event selectors index host-neutral events", () => {
  const events = [
    {
      type: "tool.result",
      sourceType: "tool_end",
      sequence: 1,
      sessionId: "session-a",
      threadId: "thread-a",
      runId: "run-a",
      toolCallId: "tool-a",
      owner: "tool",
      scope: "tool_call",
      phase: "completed",
      surface: "tool_ui",
    },
    {
      type: "artifact.preview.ready",
      sourceType: "artifact_snapshot",
      sequence: 2,
      sessionId: "session-a",
      threadId: "thread-a",
      runId: "run-a",
      artifactId: "artifact-a",
      owner: "artifact",
      scope: "artifact",
      phase: "completed",
      surface: "artifact_workspace",
    },
    {
      type: "diagnostic.changed",
      sourceType: "runtime_status",
      sequence: 3,
      sessionId: "session-b",
      threadId: "thread-b",
      runId: "run-b",
      owner: "diagnostics",
      scope: "run",
      phase: "routing",
      surface: "diagnostics",
    },
  ];
  const state = {
    events,
    ...indexAgentUiProjectionEvents(events, createEmptyAgentUiProjectionEventStoreState()),
  };

  assert.deepEqual(
    selectAgentUiProjectionEventsForScopeFromStore(state, { sessionId: "session-a" }),
    [events[0], events[1]],
  );
  assert.deepEqual(
    selectAgentUiProjectionEventsByTypeFromStore(state, "tool.result"),
    [events[0]],
  );
  assert.deepEqual(
    selectAgentUiProjectionEventsBySurfaceForScopeFromStore(
      state,
      "artifact_workspace",
      { threadId: "thread-a" },
    ),
    [events[1]],
  );
  assert.equal(selectLatestAgentUiProjectionEventForRunFromStore(state, "run-a"), events[1]);
  assert.equal(
    selectLatestAgentUiProjectionEventForToolCallFromStore(state, "tool-a"),
    events[0],
  );
  assert.equal(
    selectLatestAgentUiProjectionEventForArtifactFromStore(state, "artifact-a"),
    events[1],
  );
  assert.equal(
    selectLatestAgentUiProjectionEventForScopeFromStore(state, { sessionId: "session-b" }),
    events[2],
  );
});

test("Agent UI projection summaries classify host-neutral event groups", () => {
  const events = [
    {
      type: "action.required",
      sourceType: "action_required",
      sequence: 1,
      sessionId: "session-summary",
      actionId: "action-1",
      owner: "action",
      scope: "action_request",
      phase: "waiting",
      surface: "hitl",
    },
    {
      type: "artifact.preview.ready",
      sourceType: "artifact_snapshot",
      sequence: 2,
      sessionId: "session-summary",
      artifactId: "artifact-1",
      owner: "artifact",
      scope: "artifact",
      phase: "completed",
      surface: "artifact_workspace",
    },
    {
      type: "evidence.changed",
      sourceType: "evidence_projection",
      sequence: 3,
      sessionId: "session-summary",
      evidenceId: "evidence-1",
      owner: "evidence",
      scope: "evidence",
      phase: "completed",
      surface: "timeline_evidence",
    },
    {
      type: "diagnostic.changed",
      sourceType: "runtime_status",
      sequence: 4,
      sessionId: "session-summary",
      diagnosticId: "diagnostic-1",
      owner: "diagnostics",
      scope: "run",
      phase: "routing",
      surface: "diagnostics",
    },
    {
      type: "agent.changed",
      sourceType: "team_formation_projection",
      sequence: 5,
      sessionId: "session-summary",
      agentId: "agent-1",
      owner: "agent",
      scope: "agent",
      phase: "acting",
      surface: "team_roster",
    },
  ];

  const summary = summarizeAgentUiProjectionEvents(events);

  assert.equal(summary.total, 5);
  assert.equal(summary.actionCount, 1);
  assert.equal(summary.artifactCount, 1);
  assert.equal(summary.evidenceCount, 1);
  assert.equal(summary.diagnosticsCount, 1);
  assert.equal(summary.taskCount, 1);
  assert.equal(summary.latestEvent, events[4]);
  assert.deepEqual(
    summary.latestNotableEvents.map((event) => event.sequence),
    [5, 4, 3, 2, 1],
  );
});

test("Agent UI team workbench summaries group surfaces and lanes", () => {
  const events = [
    {
      type: "team.changed",
      sourceType: "runtime_status",
      sequence: 1,
      sessionId: "session-team",
      owner: "team",
      scope: "team",
      phase: "acting",
      surface: "team_roster",
    },
    {
      type: "agent.spawned",
      sourceType: "team_formation_projection",
      sequence: 2,
      sessionId: "session-team",
      agentId: "agent-1",
      taskId: "task-1",
      owner: "agent",
      scope: "agent",
      phase: "acting",
      surface: "delegation_graph",
    },
    {
      type: "worker.notification",
      sourceType: "team_formation_projection",
      sequence: 3,
      sessionId: "session-team",
      agentId: "agent-1",
      taskId: "task-1",
      owner: "agent",
      scope: "agent",
      phase: "completed",
      surface: "worker_notifications",
    },
    {
      type: "review.completed",
      sourceType: "evidence_projection",
      sequence: 4,
      sessionId: "session-team",
      reviewId: "review-1",
      owner: "evidence",
      scope: "evidence",
      phase: "completed",
      surface: "review_lane",
    },
    {
      type: "tool.result",
      sourceType: "tool_end",
      sequence: 5,
      sessionId: "session-team",
      toolCallId: "tool-1",
      owner: "tool",
      scope: "tool_call",
      phase: "completed",
      surface: "tool_ui",
    },
  ];

  const summary = summarizeAgentUiTeamWorkbenchProjectionEvents(events);
  const lanes = summarizeAgentUiTeamWorkbenchSurfaceLanes(events);
  const surfaces = summarizeAgentUiTeamWorkbenchSurfaces(events, {
    latestLimit: 1,
  });

  assert.equal(summary.total, 4);
  assert.equal(summary.rosterCount, 1);
  assert.equal(summary.delegationCount, 1);
  assert.equal(summary.workerNotificationCount, 1);
  assert.equal(summary.reviewCount, 1);
  assert.deepEqual(
    summary.latestEvents.map((event) => event.sequence),
    [4, 3, 2, 1],
  );
  assert.deepEqual(
    lanes.map((lane) => [lane.id, lane.total]),
    [
      ["team-topology", 2],
      ["worker-flow", 1],
      ["review-handoff", 1],
    ],
  );
  assert.deepEqual(
    surfaces.map((surface) => [
      surface.surface,
      surface.total,
      surface.latestEvents[0]?.sequence,
    ]),
    [
      ["team_roster", 1, 1],
      ["delegation_graph", 1, 2],
      ["worker_notifications", 1, 3],
      ["review_lane", 1, 4],
    ],
  );
});

test("Agent UI artifact lookup resolves direct and referenced artifact ids", () => {
  const events = [
    {
      type: "artifact.preview.ready",
      sourceType: "artifact_snapshot",
      sequence: 1,
      sessionId: "session-artifact",
      artifactId: "artifact-direct",
      owner: "artifact",
      scope: "artifact",
      phase: "completed",
      surface: "artifact_workspace",
    },
    {
      type: "tool.result",
      sourceType: "tool_end",
      sequence: 2,
      sessionId: "session-artifact",
      toolCallId: "tool-1",
      owner: "tool",
      scope: "tool_call",
      phase: "completed",
      surface: "tool_ui",
      refs: {
        artifactIds: ["artifact-ref"],
      },
    },
  ];

  assert.equal(
    findLatestAgentUiProjectionEventForArtifact(events, "artifact-direct"),
    events[0],
  );
  assert.equal(
    findLatestAgentUiProjectionEventForArtifact(events, " artifact-ref "),
    events[1],
  );
  assert.equal(findLatestAgentUiProjectionEventForArtifact(events, "missing"), null);
});

test("normalization helpers provide host-neutral field cleanup", () => {
  const metadata = {
    beta: true,
    alpha: "ok",
    nested: { value: 1 },
  };

  assert.equal(definedString("  ok  "), "ok");
  assert.equal(definedString("   "), undefined);
  assert.equal(truncateText(` ${"a".repeat(250)} `), `${"a".repeat(240)}...`);
  assert.deepEqual(metadataKeys(metadata), ["alpha", "beta", "nested"]);
  assert.deepEqual(normalizeProjectionIdList([" a ", "", null, "a", "b"]), [
    "a",
    "b",
  ]);
  assert.equal(readRecord(metadata)?.nested, metadata.nested);
  assert.equal(readNumberField({ count: "42" }, ["count"]), 42);
});

test("projection envelope helpers normalize base fields and sequence", () => {
  const base = buildAgentUiProjectionBase(
    {
      sourceType: "item_started",
      itemType: "subagent_activity",
    },
    {
      timestamp: "2026-06-07T00:00:00.000Z",
      sessionId: " session-1 ",
      threadId: " thread-1 ",
      runId: "agent_subagent_stream:run-1",
      turnId: " turn-1 ",
      messageId: " ",
      taskId: "task-1",
    },
  );

  assert.deepEqual(base, {
    sourceType: "item_started",
    timestamp: "2026-06-07T00:00:00.000Z",
    sessionId: "session-1",
    threadId: "thread-1",
    runId: "agent_subagent_stream:run-1",
    turnId: "turn-1",
    messageId: undefined,
    taskId: "task-1",
    runtimeEntity: "subagent_turn",
  });

  const events = [
    {
      type: "run.started",
      sourceType: "turn_started",
      owner: "runtime",
      scope: "turn",
      phase: "submitted",
    },
    {
      type: "run.finished",
      sourceType: "turn_completed",
      owner: "runtime",
      scope: "turn",
      phase: "completed",
    },
  ];

  assert.deepEqual(
    sequenceAgentUiProjectionEvents(events, 10).map((event) => event.sequence),
    [10, 11],
  );
  assert.equal(sequenceAgentUiProjectionEvents(events, undefined), events);
});

test("action projection helpers build standard HITL events", () => {
  const required = buildAgentUiActionRequiredEvent(
    {
      requestId: "approval-1",
      actionType: "tool_confirmation",
      scope: {
        sessionId: " session-action ",
        threadId: " thread-action ",
        turnId: " turn-action ",
      },
      toolName: "shell",
      prompt: "允许执行命令？",
      questions: [{ question: "确认？" }],
      requestedSchema: { type: "object" },
    },
    {
      sessionId: "fallback-session",
      threadId: "fallback-thread",
      turnId: "fallback-turn",
      timestamp: "2026-06-07T00:00:00.000Z",
    },
  );

  assert.equal(required.sourceType, "action_required");
  assert.equal(required.timestamp, "2026-06-07T00:00:00.000Z");
  assert.equal(required.sessionId, "session-action");
  assert.equal(required.threadId, "thread-action");
  assert.equal(required.turnId, "turn-action");
  assert.equal(required.runtimeEntity, "agent_turn");
  assert.equal(required.type, "action.required");
  assert.equal(required.actionId, "approval-1");
  assert.equal(required.owner, "action");
  assert.equal(required.scope, "action_request");
  assert.equal(required.phase, "waiting");
  assert.equal(required.surface, "hitl");
  assert.equal(required.persistence, "snapshot");
  assert.equal(required.control, "approve");
  assert.deepEqual(required.payload, {
    actionType: "tool_confirmation",
    toolName: "shell",
    promptPreview: "允许执行命令？",
    questionCount: 1,
    hasRequestedSchema: true,
  });

  const resolved = buildAgentUiActionResolvedEvent(
    {
      requestId: "approval-1",
      actionType: "plan_approval",
      approved: false,
      feedback: "需要修改",
      permissionMode: "ask",
      data: {
        decision_kind: "plan_approval_response",
        target_session_id: "child-session-1",
        plan_file: ".lime/plans/child-session-1.md",
        plan_id: "plan-1",
        awaiting_leader_approval: true,
      },
    },
    {
      sessionId: "fallback-session",
      threadId: "fallback-thread",
      turnId: "fallback-turn",
    },
  );

  assert.equal(resolved.type, "action.resolved");
  assert.equal(resolved.actionId, "approval-1");
  assert.equal(resolved.control, "reject");
  assert.equal(resolved.sessionId, "fallback-session");
  assert.deepEqual(resolved.payload, {
    actionType: "plan_approval",
    decisionKind: "plan_approval_response",
    approved: false,
    feedbackPreview: "需要修改",
    permissionMode: "ask",
    targetSessionId: "child-session-1",
    planFile: ".lime/plans/child-session-1.md",
    planId: "plan-1",
    awaitingLeaderApproval: true,
    responseMetadataKeys: [
      "awaiting_leader_approval",
      "decision_kind",
      "plan_file",
      "plan_id",
      "target_session_id",
    ],
  });

  assert.equal(resolveAgentUiActionRequiredControl("ask_user"), "answer");
  assert.equal(
    resolveAgentUiActionResolvedControl("tool_confirmation", true),
    "approve",
  );
});

test("artifact ref helpers extract stable artifact ids and paths", () => {
  assert.deepEqual(
    extractArtifactRefs({
      artifact_id: "artifact-1",
      artifactIds: ["artifact-2", "artifact-1"],
      artifact_path: "docs/a.md",
      artifactPaths: ["docs/b.md"],
      file_path: "docs/a.md",
      filePath: "docs/c.md",
    }),
    {
      artifactIds: ["artifact-1", "artifact-2"],
      artifactPaths: ["docs/a.md", "docs/b.md", "docs/c.md"],
    },
  );
  assert.deepEqual(extractArtifactRefs(null), {});
  assert.deepEqual(extractArtifactRefs(["artifact-1"]), {});
});

test("routing helpers normalize routing decision payloads", () => {
  assert.deepEqual(
    buildRoutingDecisionPayload({
      routing_decision: {
        routing_mode: "auto",
        decision_source: "task-profile",
        decision_reason: "needs web access",
        selected_provider: "provider-a",
        selected_model: "model-a",
        requestedProvider: "provider-b",
        requestedModel: "model-b",
        candidate_count: "2",
        estimated_cost_class: "low",
        capability_gap: "none",
        fallback_chain: ["model-b", "model-c"],
        settings_source: "workspace",
        service_model_slot: "chat",
      },
    }),
    {
      routingMode: "auto",
      decisionSource: "task-profile",
      decisionReason: "needs web access",
      selectedProvider: "provider-a",
      selectedModel: "model-a",
      requestedProvider: "provider-b",
      requestedModel: "model-b",
      candidateCount: 2,
      estimatedCostClass: "low",
      capabilityGap: "none",
      fallbackChain: ["model-b", "model-c"],
      settingsSource: "workspace",
      serviceModelSlot: "chat",
    },
  );
  assert.deepEqual(buildRoutingDecisionPayload({}), {});
});

test("runtime fact helpers normalize shared Agent UI status semantics", () => {
  assert.equal(
    inferAgentUiRuntimeEntity({
      sourceType: "item_completed",
      itemType: "subagent_activity",
    }),
    "subagent_turn",
  );
  assert.equal(
    inferAgentUiRuntimeEntity({ runtimeEntity: "external_task" }),
    "external_task",
  );
  assert.equal(normalizeRuntimeStatusFromRuntimePhase("permission_review"), "waiting");
  assert.equal(normalizeRuntimePhaseFromRuntimeStatusPhase("routing"), "routing");
  assert.equal(normalizeSubagentRuntimeStatus("cancelled"), "cancelled");
  assert.equal(resolveSubagentStatusPhase("running"), "acting");
  assert.equal(resolveSubagentStatusControl("running"), "stop");
  assert.equal(isSubagentTerminalStatus("completed"), true);

  const teamFacts = buildTeamRuntimeFacts({
    concurrency_phase: "running",
    concurrency_budget: 3,
    concurrency_active_count: 2,
    concurrency_queued_count: 1,
    provider_concurrency_group: "provider-a",
  });
  assert.equal(teamFacts.teamPhase, "running");
  assert.equal(teamFacts.teamParallelBudget, 3);
  assert.equal(teamFacts.teamActiveCount, 2);
  assert.equal(teamFacts.teamQueuedCount, 1);
  assert.equal(teamFacts.queuedTurnCount, 1);
  assert.equal(teamFacts.providerConcurrencyGroup, "provider-a");
  assert.equal(resolveTeamTopology(teamFacts), "parallel_workers");

  const subagentFacts = buildSubagentRuntimeFacts({
    status: "running",
    latest_turn_status: "completed",
    queued_turn_count: 2,
  });
  assert.equal(subagentFacts.runtimeEntity, "subagent_turn");
  assert.equal(subagentFacts.runtimeStatus, "running");
  assert.equal(subagentFacts.latestTurnStatus, "completed");
  assert.equal(subagentFacts.queuedTurnCount, 2);

  assert.deepEqual(
    buildWorkerUsageProjection({
      input_tokens: 10,
      output_tokens: 5,
      cached_input_tokens: 3,
      cache_creation_input_tokens: 2,
    }),
    {
      inputTokens: 10,
      outputTokens: 5,
      cachedInputTokens: 3,
      cacheCreationInputTokens: 2,
      totalTokens: 15,
    },
  );
  assert.equal(buildWorkerUsageProjection(undefined), undefined);
});
