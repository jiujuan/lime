import test from "node:test";
import assert from "node:assert/strict";

import {
  getAgentUiFixture,
} from "../../agent-ui-contracts/dist/index.js";
import {
  buildAgentUiActionRequiredEvent,
  buildAgentUiActionResolvedEvent,
  buildAgentUiMessageSnapshotEvent,
  buildAgentUiPlanApprovalRequiredEvent,
  buildAgentUiPlanApprovalResolvedEvent,
  buildAgentUiProjectionBase,
  buildAgentUiQueueAddedEvents,
  buildAgentUiQueueLifecycleEvents,
  buildAgentUiReasoningDeltaEvent,
  buildAgentUiRunFailedEvent,
  buildAgentUiRunFinishedEvent,
  buildAgentUiRunStartedEvent,
  buildAgentUiRuntimeStatusEvent,
  buildAgentUiTextDeltaEvent,
  buildAgentUiThreadItemActionEvent,
  buildAgentUiThreadItemBase,
  buildAgentUiThreadItemEvent,
  buildAgentUiThreadItemSubagentActivityEvent,
  buildAgentUiThreadItemSubagentWorkerNotificationEvent,
  buildAgentUiToolEndEvent,
  buildAgentUiToolEndEvents,
  buildAgentUiToolInputDeltaEvent,
  buildAgentUiToolOutputDeltaEvent,
  buildAgentUiToolProgressEvent,
  buildAgentUiToolStartEvents,
  createAgentUiProjector,
  createEmptyAgentUiProjectionEventStoreState,
  definedString,
  extractAgentUiPlanApprovalProjection,
  extractAgentUiPlanApprovalResponseProjection,
  extractAgentUiTaskOwnerChangeProjection,
  findLatestAgentUiProjectionEventForArtifact,
  inferAgentUiRuntimeEntity,
  indexAgentUiProjectionEvents,
  isAgentUiTaskUpdateToolName,
  isAgentInputSourceRecoveryEvent,
  isSubagentTerminalStatus,
  metadataKeys,
  normalizeAgentUiProjectionToolName,
  normalizeProjectionIdList,
  normalizeRuntimePhaseFromRuntimeStatusPhase,
  normalizeRuntimeStatusFromRuntimePhase,
  normalizeSubagentRuntimeStatus,
  projectAgentUiState,
  projectAgentUiStateFromSessionSnapshot,
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
  resolveAgentUiThreadItemActionControl,
  resolveAgentUiActionRequiredControl,
  resolveAgentUiActionResolvedControl,
  resolveAgentUiThreadItemPhase,
  resolveAgentUiThreadItemSubagentRuntimeStatus,
  resolveAgentUiThreadItemToolResultType,
  resolveSubagentStatusControl,
  resolveSubagentStatusPhase,
  resolveTeamTopology,
  buildTeamRuntimeFacts,
  buildSubagentRuntimeFacts,
  buildWorkerUsageProjection,
  buildRoutingDecisionPayload,
  extractArtifactRefs,
  projectCodingWorkbenchViewFromEvents,
  summarizeAgentUiProjectionEvents,
  summarizeAgentUiSubagentsProjectionEvents,
  summarizeAgentUiSubagentsSurfaceLanes,
  summarizeAgentUiSubagentsSurfaces,
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
    payload: {
      actionKind: "add-input-source",
      targetModule: "knowledge-inputs",
    },
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
  assert.deepEqual(
    model.pendingActions[0].actions?.map((action) => action.decision),
    ["open-input-source"],
  );
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

  assert.deepEqual(
    model.pendingActions[0].actions?.map((action) => action.decision),
    ["approve", "reject"],
  );
});

test("projectCodingWorkbenchViewFromEvents consumes current thread read model coding facts", () => {
  const view = projectCodingWorkbenchViewFromEvents({
    executionEvents: [
      {
        id: "evt-turn",
        kind: "state",
        status: "running",
        eventClass: "turn.started",
        title: "开始执行",
        turnId: "turn-1",
        createdAt: "2026-06-07T00:00:00.000Z",
      },
    ],
    codingReadModel: {
      thread_id: "thread-1",
      active_turn_id: "turn-1",
      active_command_id: "command-install",
      active_test_run_id: "test-unit",
      change_summary: {
        changed_file_count: 1,
        changed_files: ["src/App.tsx"],
        patch_count: 1,
        running_patch_count: 1,
        source_event_ids: ["evt-file-app", "evt-patch-app"],
      },
      commands: [
        {
          command_id: "command-install",
          status: "running",
          command: "bash -lc 'npm test'",
          canonical_command: "npm test",
          command_summary: "npm test",
          command_argv: ["npm", "test"],
          command_argv_source: "argv",
          cwd: "app",
          process_id: "process-command-install",
          execution_process_status: "running",
          execution_surface: "live_process",
          output_bytes: 13,
          output_omitted_bytes: 0,
          output_truncated: false,
          stdout_bytes: 13,
          stderr_bytes: 0,
          output_refs: ["output://command-install"],
          output_preview: "running tests",
        },
      ],
      tests: [
        {
          test_run_id: "test-unit",
          status: "running",
          command_id: "command-install",
          canonical_command: "npm test",
          command_summary: "npm test",
          suite: "unit",
          passed: 8,
          failed: 0,
        },
      ],
      pending_requests: [
        {
          id: "action-approve-command",
          turn_id: "turn-1",
          request_type: "approval",
          status: "pending",
          title: "确认执行命令",
        },
      ],
    },
  });

  assert.equal(view.mainObject.id, "turn-1");
  assert.equal(view.mainObject.activeCommandId, "command-install");
  assert.equal(view.mainObject.activeTestRunId, "test-unit");
  assert.equal(view.commands[0].title, "npm test");
  assert.equal(view.commands[0].command, "bash -lc 'npm test'");
  assert.equal(view.commands[0].canonicalCommand, "npm test");
  assert.deepEqual(view.commands[0].commandArgv, ["npm", "test"]);
  assert.equal(view.commands[0].processId, "process-command-install");
  assert.equal(view.commands[0].executionProcessStatus, "running");
  assert.equal(view.commands[0].executionSurface, "live_process");
  assert.equal(view.commands[0].outputBytes, 13);
  assert.equal(view.commands[0].outputOmittedBytes, 0);
  assert.equal(view.commands[0].outputTruncated, false);
  assert.equal(view.commands[0].stdoutBytes, 13);
  assert.equal(view.commands[0].stderrBytes, 0);
  assert.equal(view.commands[0].preview, "running tests");
  assert.equal(view.changeSummary?.changedFileCount, 1);
  assert.deepEqual(view.changeSummary?.changedFiles, ["src/App.tsx"]);
  assert.equal(view.changeSummary?.runningPatchCount, 1);
  assert.equal(view.tests[0].commandSummary, "npm test");
  assert.equal(view.tests[0].suite, "unit");
  assert.equal(view.actions.length, 1);
  assert.equal(view.actions[0].actionId, "action-approve-command");
  assert.equal(view.ui.preferredTab, "outputs");
});

test("projectCodingWorkbenchViewFromEvents consumes current read model artifacts as file changes", () => {
  const view = projectCodingWorkbenchViewFromEvents({
    executionEvents: [],
    codingReadModel: {
      thread_id: "thread-1",
      active_turn_id: "turn-1",
      artifacts: [
        {
          artifactRef: "artifact-src-app",
          eventId: "evt-file-app",
          sequence: 2,
          turnId: "turn-1",
          path: "src/App.tsx",
          title: "App.tsx",
          kind: "code_file",
          status: "completed",
          metadata: {
            previewText: "updated app component",
            checkpointRef: "checkpoint-src-app",
            diffRef: "diff-src-app",
          },
        },
        {
          artifactRef: "output-command",
          eventId: "evt-output",
          kind: "tool_output",
          status: "completed",
        },
      ],
    },
  });

  assert.equal(view.files.length, 1);
  assert.equal(view.files[0].path, "src/App.tsx");
  assert.equal(view.changes.length, 1);
  assert.deepEqual(view.changes[0], {
    id: "evt-file-app",
    path: "src/App.tsx",
    status: "completed",
    changeKind: "modified",
    artifactRefs: ["artifact-src-app"],
    checkpointRef: "checkpoint-src-app",
    diffRef: "diff-src-app",
    preview: "updated app component",
    sourceEventId: "evt-file-app",
  });
  assert.equal(view.ui.preferredTab, "changes");
});

test("projectAgentRuntimeReadModel marks action terminal events as resolved", () => {
  for (const eventClass of [
    "action.resolved",
    "action.cancelled",
    "action.canceled",
    "action.expired",
  ]) {
    const model = projectAgentRuntimeReadModel({
      executionEvents: [
        {
          id: `evt-action-${eventClass}`,
          kind: "action",
          status: "pending",
          eventClass: "action.required",
          title: "需要配置模型",
          actionId: "action-1",
          payload: { actionKind: "configure-text-model" },
          createdAt: "2026-06-07T00:00:00.000Z",
        },
        {
          id: `evt-terminal-${eventClass}`,
          kind: "action",
          status: "completed",
          eventClass,
          title: "已处理",
          actionId: "action-1",
          createdAt: "2026-06-07T00:00:01.000Z",
        },
      ],
    });

    assert.equal(model.pendingActions.length, 0, eventClass);
    assert.equal(model.events[0].resolved, true, eventClass);
    assert.equal(
      model.events[0].displayStatusKey,
      "agent.status.actionResolved",
      eventClass,
    );
  }
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
  assert.equal(
    state.graph.some(
      (node) => node.nodeId === "tool-1" && node.nodeType === "tool",
    ),
    true,
  );
  assert.equal(state.actions.length, 1);
  assert.deepEqual(state.artifacts, [
    {
      id: "artifact-1",
      sourceEventId: "evt-tool",
      title: "读取资料",
      status: "completed",
    },
  ]);
  assert.equal(state.hydration.status, "live");
});

test("projectAgentUiState builds structured artifact and evidence refs", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-artifact",
        kind: "draft",
        status: "completed",
        owner: "artifact",
        eventClass: "artifact.changed",
        title: "草稿已保存",
        artifactRefs: ["prompt-draft:1"],
        payload: {
          sourceEventId: "provider-artifact-1",
          relativePath: "drafts/prompt-1.md",
          contentRef: "content://prompt-draft/1",
          mimeType: "text/markdown",
          preview: "可编辑 Prompt 草稿",
          metadata: { draftId: "1" },
        },
        sequence: 1,
        createdAt: "2026-06-07T00:00:00.000Z",
      },
      {
        id: "evt-evidence",
        kind: "evidence",
        status: "completed",
        owner: "evidence",
        eventClass: "evidence.changed",
        title: "输入资料已引用",
        evidenceRefs: ["input-source:1"],
        payload: {
          sourceEventId: "provider-evidence-1",
          packRelativeRoot: "evidence/input-source-1",
          summary: "资料来源摘要",
          mime: "application/json",
          metadata: { sourceId: "1" },
        },
        sequence: 2,
        createdAt: "2026-06-07T00:00:01.000Z",
      },
    ],
  });

  assert.deepEqual(state.artifacts, [
    {
      id: "prompt-draft:1",
      sourceEventId: "provider-artifact-1",
      title: "草稿已保存",
      status: "completed",
      owner: "artifact",
      path: "drafts/prompt-1.md",
      contentRef: "content://prompt-draft/1",
      mimeType: "text/markdown",
      preview: "可编辑 Prompt 草稿",
      metadata: { draftId: "1" },
    },
  ]);
  assert.deepEqual(state.evidence, [
    {
      id: "input-source:1",
      sourceEventId: "provider-evidence-1",
      title: "输入资料已引用",
      status: "completed",
      owner: "evidence",
      path: "evidence/input-source-1",
      mimeType: "application/json",
      preview: "资料来源摘要",
      metadata: { sourceId: "1" },
    },
  ]);
});

test("projectAgentUiState keeps unsafe ref paths out of the UI contract", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-artifact",
        kind: "draft",
        status: "completed",
        eventClass: "artifact.changed",
        title: "草稿已保存",
        artifactRefs: ["prompt-draft:1"],
        payload: {
          path: "/Users/private/workspace/draft.md",
          preview: "x".repeat(320),
        },
        sequence: 1,
        createdAt: "2026-06-07T00:00:00.000Z",
      },
    ],
  });

  assert.equal(state.artifacts[0].path, undefined);
  assert.equal(state.artifacts[0].preview.length, 280);
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

  assert.deepEqual(
    state.messages.map((part) => [part.type, part.text]),
    [
      ["reasoning", "Call the"],
      ["text", "第一段继续"],
    ],
  );
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

test("projectAgentUiStateFromSessionSnapshot upgrades legacy transcript plus read model to full UI state", () => {
  const readModel = projectAgentRuntimeReadModel({
    sourceCount: 2,
    executionEvents: [
      {
        id: "evt-artifact",
        kind: "draft",
        status: "completed",
        eventClass: "artifact.changed",
        title: "草稿已保存",
        artifactRefs: ["artifact-1"],
        payload: {
          relativePath: "drafts/outline.md",
          preview: "文章大纲",
        },
        sequence: 1,
        createdAt: "2026-06-10T00:00:00.000Z",
      },
      {
        id: "evt-evidence",
        kind: "evidence",
        status: "completed",
        eventClass: "evidence.changed",
        title: "证据已导出",
        evidenceRefs: ["evidence-1"],
        payload: {
          packRelativeRoot: "evidence/input-source",
          summary: "输入源摘要",
        },
        sequence: 2,
        createdAt: "2026-06-10T00:00:01.000Z",
      },
    ],
  });

  const state = projectAgentUiStateFromSessionSnapshot({
    readModel,
    messages: [
      {
        id: "message-user",
        role: "user",
        content: "请生成小红书标题",
        createdAt: "2026-06-10T00:00:02.000Z",
      },
      {
        id: "message-assistant",
        role: "assistant",
        text: "已生成 5 个标题候选",
        refs: ["artifact-1", "evidence-1"],
        createdAt: "2026-06-10T00:00:03.000Z",
      },
    ],
  });

  assert.equal(state.hydration.status, "live");
  assert.equal(state.hydration.eventCount, 2);
  assert.equal(state.readModel.sourceCount, 2);
  assert.deepEqual(
    state.messages.map((message) => [message.messageId, message.role, message.text]),
    [
      ["message-user", "user", "请生成小红书标题"],
      ["message-assistant", "assistant", "已生成 5 个标题候选"],
    ],
  );
  assert.deepEqual(state.messages[1].refs, ["artifact-1", "evidence-1"]);
  assert.deepEqual(
    state.artifacts.map((artifact) => [artifact.id, artifact.path, artifact.preview]),
    [["artifact-1", "drafts/outline.md", "文章大纲"]],
  );
  assert.deepEqual(
    state.evidence.map((evidence) => [evidence.id, evidence.path, evidence.preview]),
    [["evidence-1", "evidence/input-source", "输入源摘要"]],
  );
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
  const stateAfterFirstApply = projector.getState();
  const stateAfterDuplicateApply = projector.apply(event);

  assert.equal(stateAfterDuplicateApply, stateAfterFirstApply);
  assert.equal(projector.getState().hydration.eventCount, 1);
  assert.equal(projector.getState().messages.length, 1);
  assert.equal(projector.reset().hydration.status, "idle");
});

test("createAgentUiProjector incremental apply matches batch projection", () => {
  const fixture = getAgentUiFixture("subagent-handoff");
  const projector = createAgentUiProjector({ sourceCount: 3 });

  for (const event of fixture.events) {
    projector.apply(event);
  }

  assert.deepEqual(
    projector.getState(),
    projectAgentUiState({
      executionEvents: fixture.events,
      sourceCount: 3,
    }),
  );
});

test("createAgentUiProjector incremental apply updates resolved actions", () => {
  const executionEvents = [
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
      payload: { controls: ["approve", "reject"] },
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
  ];
  const projector = createAgentUiProjector();

  for (const event of executionEvents) {
    projector.apply(event);
  }

  const state = projector.getState();
  assert.deepEqual(state, projectAgentUiState({ executionEvents }));
  assert.equal(state.runtime.status, "completed");
  assert.equal(state.readModel.pendingActions.length, 0);
  assert.equal(state.readModel.events[1].resolved, true);
  assert.equal(
    state.readModel.events[1].displayStatusKey,
    "agent.status.actionResolved",
  );
});

test("createAgentUiProjector incremental apply updates canceled actions", () => {
  const executionEvents = [
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
      payload: { controls: ["approve", "reject"] },
      createdAt: "2026-06-07T00:00:01.000Z",
    },
    {
      id: "evt-canceled",
      kind: "action",
      status: "completed",
      eventClass: "action.canceled",
      title: "已取消",
      actionId: "action-1",
      createdAt: "2026-06-07T00:00:02.000Z",
    },
  ];
  const projector = createAgentUiProjector();

  for (const event of executionEvents) {
    projector.apply(event);
  }

  const state = projector.getState();
  assert.deepEqual(state, projectAgentUiState({ executionEvents }));
  assert.equal(state.readModel.pendingActions.length, 0);
  assert.equal(state.readModel.events[1].resolved, true);
  assert.equal(
    state.readModel.events[1].displayStatusKey,
    "agent.status.actionResolved",
  );
});

test("state.delta patches projection and read model in batch and incremental paths", () => {
  const executionEvents = [
    {
      id: "evt-subagent-start",
      kind: "handoff",
      status: "running",
      eventClass: "agent.spawned",
      title: "启动研究子代理",
      runtimeId: "runtime-1",
      threadId: "thread-parent",
      subagentId: "subagent-1",
      taskId: "task-1",
      sequence: 1,
      createdAt: "2026-06-12T00:00:00.000Z",
    },
    {
      id: "evt-projection-delta",
      kind: "state",
      status: "completed",
      eventClass: "state.delta",
      title: "修复子代理派生状态",
      runtimeId: "runtime-1",
      threadId: "thread-parent",
      sequence: 2,
      payload: {
        target: "projection.subagents",
        ops: [
          {
            op: "replace",
            path: "/threads/0/status",
            value: "completed",
          },
          {
            op: "add",
            path: "/threads/0/summary",
            value: "已完成资料整理",
          },
        ],
      },
      createdAt: "2026-06-12T00:00:01.000Z",
    },
    {
      id: "evt-read-model-delta",
      kind: "state",
      status: "completed",
      eventClass: "state.delta",
      title: "修复 read model task refs",
      runtimeId: "runtime-1",
      threadId: "thread-parent",
      sequence: 3,
      payload: {
        target: "readModel",
        patch: [
          {
            op: "add",
            path: "/taskRefs/-",
            value: "repair-task-1",
          },
          {
            op: "test",
            path: "/taskRefs/1",
            value: "repair-task-1",
          },
        ],
      },
      createdAt: "2026-06-12T00:00:02.000Z",
    },
    {
      id: "evt-model-after-delta",
      kind: "model",
      status: "completed",
      eventClass: "model.completed",
      title: "完成输出",
      payload: { messageId: "msg-1", text: "完成" },
      sequence: 4,
      createdAt: "2026-06-12T00:00:03.000Z",
    },
  ];
  const projector = createAgentUiProjector();

  for (const event of executionEvents) {
    projector.apply(event);
  }

  const incrementalState = projector.getState();
  const batchState = projectAgentUiState({ executionEvents });

  assert.deepEqual(incrementalState, batchState);
  assert.equal(batchState.subagents.threads[0].status, "completed");
  assert.equal(batchState.subagents.threads[0].summary, "已完成资料整理");
  assert.deepEqual(batchState.subagents.activeThreadIds, []);
  assert.deepEqual(batchState.subagents.completedThreadIds, ["subagent-1"]);
  assert.deepEqual(batchState.readModel.taskRefs, ["task-1", "repair-task-1"]);
  assert.equal(batchState.hydration.status, "live");
  assert.equal(batchState.hydration.eventCount, 4);
});

test("state.delta supports nested payload and item alias target", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-artifact",
        kind: "draft",
        status: "completed",
        eventClass: "artifact.changed",
        title: "生成草稿",
        runtimeId: "runtime-1",
        artifactRefs: ["artifact-1"],
        sequence: 1,
        createdAt: "2026-06-12T00:00:00.000Z",
      },
      {
        id: "evt-delta",
        kind: "state",
        status: "completed",
        eventClass: "state.delta",
        title: "补 artifact preview",
        runtimeId: "runtime-1",
        sequence: 2,
        payload: {
          stateDelta: {
            schemaVersion: "lime-runtime-state-delta/v0.1",
            runtimeId: "runtime-1",
            sequence: 2,
            target: "projection.artifacts",
            patch: [
              {
                op: "add",
                path: "/items/0/preview",
                value: "修复后的预览",
              },
            ],
            createdAt: "2026-06-12T00:00:01.000Z",
          },
        },
        createdAt: "2026-06-12T00:00:01.000Z",
      },
    ],
  });

  assert.equal(state.artifacts[0].preview, "修复后的预览");
});

test("state.delta recomputes subagent terminal thread ids after patch", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-subagent-start",
        kind: "handoff",
        status: "running",
        eventClass: "agent.spawned",
        title: "启动研究子代理",
        runtimeId: "runtime-1",
        threadId: "thread-parent",
        subagentId: "subagent-1",
        taskId: "task-1",
        sequence: 1,
        createdAt: "2026-06-12T00:00:00.000Z",
      },
      {
        id: "evt-projection-delta",
        kind: "state",
        status: "completed",
        eventClass: "state.delta",
        title: "修复子代理关闭态",
        runtimeId: "runtime-1",
        threadId: "thread-parent",
        sequence: 2,
        payload: {
          target: "projection.subagents",
          patch: [
            {
              op: "replace",
              path: "/threads/0/status",
              value: "closed",
            },
          ],
        },
        createdAt: "2026-06-12T00:00:01.000Z",
      },
    ],
  });

  assert.deepEqual(state.subagents.activeThreadIds, []);
  assert.deepEqual(state.subagents.completedThreadIds, []);
  assert.deepEqual(state.subagents.failedThreadIds, ["subagent-1"]);
});

test("state.delta failure marks projection stale without mutating target state", () => {
  const executionEvents = [
    {
      id: "evt-model",
      kind: "model",
      status: "completed",
      eventClass: "model.completed",
      title: "完成",
      payload: { messageId: "msg-1", text: "完成" },
      sequence: 1,
      createdAt: "2026-06-12T00:00:00.000Z",
    },
    {
      id: "evt-bad-delta",
      kind: "state",
      status: "completed",
      eventClass: "state.delta",
      title: "非法 patch",
      runtimeId: "runtime-1",
      sequence: 2,
      payload: {
        target: "projection.messages",
        patch: [
          {
            op: "replace",
            path: "/9/text",
            value: "不应写入",
          },
        ],
      },
      createdAt: "2026-06-12T00:00:01.000Z",
    },
  ];
  const state = projectAgentUiState({ executionEvents });

  assert.equal(state.messages[0].text, "完成");
  assert.equal(state.hydration.status, "stale");
  assert.equal(state.hydration.eventCount, 2);
  assert.equal(state.diagnostics.at(-1).id, "state-delta:evt-bad-delta");
  assert.equal(state.diagnostics.at(-1).status, "failed");
  assert.match(state.diagnostics.at(-1).detail, /Array index out of range|Path does not exist/);
});

test("state.delta cannot patch runtime fact projections", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-action",
        kind: "action",
        status: "pending",
        eventClass: "action.required",
        title: "需要确认",
        actionId: "action-1",
        sequence: 1,
        createdAt: "2026-06-12T00:00:00.000Z",
      },
      {
        id: "evt-delta",
        kind: "state",
        status: "completed",
        eventClass: "state.delta",
        title: "非法修改 action fact",
        runtimeId: "runtime-1",
        sequence: 2,
        payload: {
          target: "readModel.pendingActions",
          patch: [
            {
              op: "remove",
              path: "/0",
            },
          ],
        },
        createdAt: "2026-06-12T00:00:01.000Z",
      },
    ],
  });

  assert.equal(state.readModel.pendingActions.length, 1);
  assert.equal(state.hydration.status, "stale");
  assert.equal(state.diagnostics.at(-1).id, "state-delta:evt-delta");
  assert.match(state.diagnostics.at(-1).detail, /pending action facts/);
});

test("state.delta does not override newer runtime facts for the same projection area", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-subagent-start",
        kind: "handoff",
        status: "running",
        eventClass: "agent.spawned",
        title: "启动研究子代理",
        runtimeId: "runtime-1",
        threadId: "thread-parent",
        subagentId: "subagent-1",
        taskId: "task-1",
        sequence: 1,
        createdAt: "2026-06-12T00:00:00.000Z",
      },
      {
        id: "evt-stale-delta",
        kind: "state",
        status: "completed",
        eventClass: "state.delta",
        title: "过期的子代理修复",
        runtimeId: "runtime-1",
        threadId: "thread-parent",
        sequence: 2,
        payload: {
          target: "projection.subagents",
          patch: [
            {
              op: "replace",
              path: "/threads/0/status",
              value: "completed",
            },
          ],
        },
        createdAt: "2026-06-12T00:00:01.000Z",
      },
      {
        id: "evt-subagent-running-again",
        kind: "handoff",
        status: "running",
        eventClass: "subagent.progress",
        title: "子代理仍在运行",
        runtimeId: "runtime-1",
        threadId: "thread-parent",
        subagentId: "subagent-1",
        taskId: "task-1",
        sequence: 3,
        createdAt: "2026-06-12T00:00:02.000Z",
      },
    ],
  });

  assert.equal(state.subagents.threads[0].status, "running");
  assert.deepEqual(state.subagents.activeThreadIds, ["subagent-1"]);
  assert.deepEqual(state.subagents.completedThreadIds, []);
});

test("state.delta treats channel messages as newer subagent projection facts", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-subagent-start",
        kind: "handoff",
        status: "running",
        eventClass: "agent.spawned",
        title: "启动研究子代理",
        runtimeId: "runtime-1",
        threadId: "thread-parent",
        subagentId: "subagent-1",
        taskId: "task-1",
        sequence: 1,
        createdAt: "2026-06-12T00:00:00.000Z",
      },
      {
        id: "evt-stale-delta",
        kind: "state",
        status: "completed",
        eventClass: "state.delta",
        title: "过期的子代理修复",
        runtimeId: "runtime-1",
        threadId: "thread-parent",
        sequence: 2,
        payload: {
          target: "projection.subagents",
          patch: [
            {
              op: "replace",
              path: "/threads/0/summary",
              value: "不应覆盖真实 channel 更新",
            },
          ],
        },
        createdAt: "2026-06-12T00:00:01.000Z",
      },
      {
        id: "evt-channel-message",
        kind: "handoff",
        status: "running",
        eventClass: "channel.message",
        title: "子代理发来进展",
        runtimeId: "runtime-1",
        threadId: "thread-parent",
        taskId: "task-1",
        sequence: 3,
        payload: {
          targetThreadId: "subagent-1",
          summary: "真实 channel 更新",
        },
        createdAt: "2026-06-12T00:00:02.000Z",
      },
    ],
  });

  assert.equal(state.subagents.threads[0].summary, "真实 channel 更新");
  assert.deepEqual(
    state.subagents.activities.map((activity) => [
      activity.sourceEventId,
      activity.kind,
    ]),
    [
      ["evt-subagent-start", "started"],
      ["evt-channel-message", "interacted"],
    ],
  );
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
    ...indexAgentUiProjectionEvents(
      events,
      createEmptyAgentUiProjectionEventStoreState(),
    ),
  };

  assert.deepEqual(
    selectAgentUiProjectionEventsForScopeFromStore(state, {
      sessionId: "session-a",
    }),
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
  assert.equal(
    selectLatestAgentUiProjectionEventForRunFromStore(state, "run-a"),
    events[1],
  );
  assert.equal(
    selectLatestAgentUiProjectionEventForToolCallFromStore(state, "tool-a"),
    events[0],
  );
  assert.equal(
    selectLatestAgentUiProjectionEventForArtifactFromStore(state, "artifact-a"),
    events[1],
  );
  assert.equal(
    selectLatestAgentUiProjectionEventForScopeFromStore(state, {
      sessionId: "session-b",
    }),
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

test("Agent UI subagents summaries group surfaces and lanes", () => {
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

  const summary = summarizeAgentUiSubagentsProjectionEvents(events);
  const lanes = summarizeAgentUiSubagentsSurfaceLanes(events);
  const surfaces = summarizeAgentUiSubagentsSurfaces(events, {
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
  assert.equal(
    findLatestAgentUiProjectionEventForArtifact(events, "missing"),
    null,
  );
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

test("conversation event helpers build standard message and model output events", () => {
  const context = {
    sessionId: "session-conversation",
    runId: "agent_turn_stream:session-conversation",
    messageId: "assistant-1",
    timestamp: "2026-06-07T00:00:00.000Z",
  };

  const snapshot = buildAgentUiMessageSnapshotEvent(
    {
      role: "assistant",
      partCount: 2,
    },
    context,
  );

  assert.equal(snapshot.sourceType, "message");
  assert.equal(snapshot.type, "messages.snapshot");
  assert.equal(snapshot.owner, "session");
  assert.equal(snapshot.scope, "message");
  assert.equal(snapshot.phase, "hydrating");
  assert.equal(snapshot.surface, "conversation");
  assert.equal(snapshot.persistence, "snapshot");
  assert.equal(snapshot.messageId, "assistant-1");
  assert.deepEqual(snapshot.payload, {
    role: "assistant",
    partCount: 2,
  });

  const textDelta = buildAgentUiTextDeltaEvent(
    {
      text: "最终答案",
    },
    context,
  );

  assert.equal(textDelta.sourceType, "text_delta");
  assert.equal(textDelta.type, "text.delta");
  assert.equal(textDelta.owner, "model");
  assert.equal(textDelta.scope, "part");
  assert.equal(textDelta.phase, "producing");
  assert.equal(textDelta.surface, "conversation");
  assert.equal(textDelta.persistence, "transcript");
  assert.deepEqual(textDelta.payload, {
    textLength: 4,
    preview: "最终答案",
  });

  const batchDelta = buildAgentUiTextDeltaEvent(
    {
      sourceType: "text_delta_batch",
      text: "第一段\n第二段",
      chunkCount: 2,
      boundary: "newline",
    },
    context,
  );

  assert.deepEqual(batchDelta.payload, {
    textLength: 7,
    preview: "第一段\n第二段",
    chunkCount: 2,
    boundary: "newline",
  });

  const reasoning = buildAgentUiReasoningDeltaEvent(
    {
      text: "先分析",
    },
    context,
  );

  assert.equal(reasoning.sourceType, "thinking_delta");
  assert.equal(reasoning.type, "reasoning.delta");
  assert.equal(reasoning.owner, "model");
  assert.equal(reasoning.scope, "part");
  assert.equal(reasoning.phase, "reasoning");
  assert.equal(reasoning.surface, "inline_process");
  assert.equal(reasoning.persistence, "ephemeral_live");
  assert.deepEqual(reasoning.payload, {
    textLength: 3,
    preview: "先分析",
  });
});

test("queue event helpers build standard queue and steer task events", () => {
  const context = {
    sessionId: "session-queue",
    timestamp: "2026-06-07T00:00:00.000Z",
  };

  const added = buildAgentUiQueueAddedEvents(
    {
      sessionId: "session-queue",
      queuedTurn: {
        queuedTurnId: "queued-1",
        messagePreview: "下一轮",
        messageText: "下一轮",
        createdAt: 0,
        imageCount: 0,
        position: 1,
      },
    },
    context,
  );

  assert.equal(added.length, 2);
  assert.equal(added[0].sourceType, "queue_added");
  assert.equal(added[0].type, "queue.changed");
  assert.equal(added[0].taskId, "queued-1");
  assert.equal(added[0].owner, "task");
  assert.equal(added[0].scope, "task");
  assert.equal(added[0].phase, "waiting");
  assert.equal(added[0].surface, "task_capsule");
  assert.equal(added[0].persistence, "snapshot");
  assert.equal(added[0].control, "queue");
  assert.equal(added[0].runtimeStatus, "queued");
  assert.equal(added[0].queuedTurnCount, 1);
  assert.deepEqual(added[0].payload, {
    runtimeEntity: "agent_turn",
    queueEvent: "queue_added",
    queuedTurnCount: 1,
    queuedTurnId: "queued-1",
    position: 1,
    messagePreview: "下一轮",
    imageCount: 0,
    createdAt: 0,
  });

  assert.equal(added[1].type, "task.changed");
  assert.equal(added[1].taskId, "queued-1");
  assert.equal(added[1].owner, "task");
  assert.equal(added[1].scope, "turn");
  assert.equal(added[1].phase, "submitted");
  assert.equal(added[1].surface, "task_capsule");
  assert.equal(added[1].persistence, "snapshot");
  assert.equal(added[1].control, "steer");
  assert.equal(added[1].runtimeStatus, "queued");
  assert.deepEqual(added[1].payload, {
    runtimeEntity: "agent_turn",
    taskEvent: "steer_intent",
    intentKind: "queued_user_input",
    queuedTurnId: "queued-1",
    position: 1,
    messagePreview: "下一轮",
    messageLength: 3,
    imageCount: 0,
    createdAt: 0,
  });

  const started = buildAgentUiQueueLifecycleEvents(
    {
      eventType: "queue_started",
      sessionId: "session-queue",
      queuedTurnId: "queued-1",
    },
    context,
  );

  assert.equal(started.length, 2);
  assert.equal(started[0].type, "queue.changed");
  assert.equal(started[0].phase, "accepted");
  assert.equal(started[0].runtimeStatus, "running");
  assert.equal(started[1].type, "task.changed");
  assert.equal(started[1].phase, "accepted");
  assert.equal(started[1].control, "steer");
  assert.deepEqual(started[1].payload, {
    runtimeEntity: "agent_turn",
    taskEvent: "steer_started",
    intentKind: "queued_user_input",
    queueEvent: "queue_started",
    queuedTurnId: "queued-1",
  });

  const removed = buildAgentUiQueueLifecycleEvents(
    {
      eventType: "queue_removed",
      sessionId: "session-queue",
      queuedTurnId: "queued-1",
    },
    context,
  );

  assert.equal(removed[1].type, "task.changed");
  assert.equal(removed[1].phase, "cancelled");
  assert.equal(removed[1].control, "remove");
  assert.deepEqual(removed[1].payload, {
    runtimeEntity: "agent_turn",
    taskEvent: "steer_removed",
    intentKind: "queued_user_input",
    queueEvent: "queue_removed",
    queuedTurnId: "queued-1",
  });

  const cleared = buildAgentUiQueueLifecycleEvents(
    {
      eventType: "queue_cleared",
      sessionId: "session-queue",
      queuedTurnIds: ["queued-1", "queued-2"],
    },
    context,
  );

  assert.equal(cleared.length, 3);
  assert.equal(cleared[0].type, "queue.changed");
  assert.equal(cleared[0].queuedTurnCount, 2);
  assert.equal(cleared[1].taskId, "queued-1");
  assert.deepEqual(cleared[1].payload, {
    runtimeEntity: "agent_turn",
    taskEvent: "steer_removed",
    intentKind: "queued_user_input",
    queueEvent: "queue_cleared",
    queuedTurnId: "queued-1",
    clearedIndex: 0,
    clearedCount: 2,
  });
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

test("plan approval projection helpers build standard HITL events", () => {
  const metadata = {
    plan_approval_request: {
      type: "plan_approval_request",
      from: "researcher",
      requestId: "plan-req-1",
      planFilePath: "plans/alpha.md",
      planContent: "# 计划\n- 第一步",
      timestamp: "2026-05-09T00:00:00.000Z",
    },
    plan_approval_delivery: {
      target: "lead-session",
      submissionId: "submit-1",
    },
    pending_request_id: "plan-req-1",
  };
  const projection = extractAgentUiPlanApprovalProjection(metadata);
  assert.deepEqual(projection, {
    requestId: "plan-req-1",
    from: "researcher",
    planFilePath: "plans/alpha.md",
    planContent: "# 计划\n- 第一步",
    timestamp: "2026-05-09T00:00:00.000Z",
    deliveryTarget: "lead-session",
    deliverySubmissionId: "submit-1",
    awaitingLeaderApproval: true,
  });
  assert.equal(extractAgentUiPlanApprovalProjection({}), null);

  const required = buildAgentUiPlanApprovalRequiredEvent({
    base: {
      sourceType: "tool_end",
      timestamp: "2026-06-07T00:00:00.000Z",
      sessionId: "session-plan",
      threadId: "thread-plan",
      turnId: "turn-plan",
      runtimeEntity: "agent_turn",
    },
    projection,
    persistence: "snapshot",
    toolCallId: "tool-plan",
  });

  assert.equal(required.type, "action.required");
  assert.equal(required.actionId, "plan-req-1");
  assert.equal(required.toolCallId, "tool-plan");
  assert.equal(required.owner, "action");
  assert.equal(required.scope, "action_request");
  assert.equal(required.phase, "waiting");
  assert.equal(required.surface, "hitl");
  assert.equal(required.persistence, "snapshot");
  assert.equal(required.control, "approve");
  assert.deepEqual(required.payload, {
    actionType: "plan_approval",
    decisionKind: "plan_approval_request",
    from: "researcher",
    planFilePath: "plans/alpha.md",
    planContentPreview: "# 计划\n- 第一步",
    planContentLength: 10,
    timestamp: "2026-05-09T00:00:00.000Z",
    deliveryTarget: "lead-session",
    deliverySubmissionId: "submit-1",
    awaitingLeaderApproval: true,
  });

  const responseProjection = extractAgentUiPlanApprovalResponseProjection({
    send_message: {
      target: "researcher",
      plan_approval_response: {
        type: "plan_approval_response",
        request_id: "plan-req-1",
        approved: false,
        feedback: "请补充验收项",
        permission_mode: "ask",
        delivery_submission_id: "submit-response-1",
        target_session_id: "child-session",
      },
    },
  });
  assert.deepEqual(responseProjection, {
    requestId: "plan-req-1",
    approved: false,
    feedback: "请补充验收项",
    permissionMode: "ask",
    timestamp: undefined,
    targetSessionId: "child-session",
    deliveryTarget: "researcher",
    deliverySubmissionId: "submit-response-1",
  });
  assert.equal(extractAgentUiPlanApprovalResponseProjection({}), null);

  const resolved = buildAgentUiPlanApprovalResolvedEvent({
    base: {
      sourceType: "tool_end",
      timestamp: "2026-06-07T00:00:01.000Z",
      sessionId: "session-plan",
      threadId: "thread-plan",
      turnId: "turn-plan",
      runtimeEntity: "agent_turn",
    },
    projection: responseProjection,
    persistence: "archive",
    toolCallId: "tool-plan-response",
  });

  assert.equal(resolved.type, "action.resolved");
  assert.equal(resolved.actionId, "plan-req-1");
  assert.equal(resolved.toolCallId, "tool-plan-response");
  assert.equal(resolved.control, "reject");
  assert.deepEqual(resolved.payload, {
    actionType: "plan_approval",
    decisionKind: "plan_approval_response",
    approved: false,
    feedbackPreview: "请补充验收项",
    permissionMode: "ask",
    timestamp: undefined,
    targetSessionId: "child-session",
    deliveryTarget: "researcher",
    deliverySubmissionId: "submit-response-1",
  });
});

test("tool event helpers build standard tool lifecycle events", () => {
  const context = {
    sessionId: "session-tool",
    threadId: "thread-tool",
    turnId: "turn-tool",
    timestamp: "2026-06-07T00:00:00.000Z",
  };

  const started = buildAgentUiToolStartEvents(
    {
      toolCallId: "tool-1",
      toolName: "read_file",
      input: JSON.stringify({ path: "README.md" }),
    },
    context,
  );

  assert.equal(started.length, 2);
  assert.deepEqual(
    started.map((event) => event.type),
    ["tool.started", "tool.args"],
  );
  assert.equal(started[0].sourceType, "tool_start");
  assert.equal(started[0].toolCallId, "tool-1");
  assert.equal(started[0].owner, "tool");
  assert.equal(started[0].scope, "tool_call");
  assert.equal(started[0].phase, "acting");
  assert.equal(started[0].surface, "tool_ui");
  assert.equal(started[0].persistence, "ephemeral_live");
  assert.deepEqual(started[0].payload, { toolName: "read_file" });
  assert.deepEqual(started[1].payload, {
    toolName: "read_file",
    inputAvailable: true,
    inputSummary: '{"path":"README.md"}',
    inputLength: 20,
  });

  const result = buildAgentUiToolEndEvent(
    {
      toolCallId: "tool-1",
      result: {
        success: true,
        output: "已读取文件",
        metadata: {
          artifact_id: "artifact-1",
          artifact_path: "docs/readme.md",
        },
      },
    },
    context,
  );

  assert.equal(result.type, "tool.result");
  assert.equal(result.phase, "completed");
  assert.equal(result.persistence, "archive");
  assert.deepEqual(result.payload, {
    success: true,
    outputPreview: "已读取文件",
    errorPreview: undefined,
    outputLength: 5,
    hasImages: false,
    metadataKeys: ["artifact_id", "artifact_path"],
  });
  assert.deepEqual(result.refs, {
    artifactIds: ["artifact-1"],
    artifactPaths: ["docs/readme.md"],
    diagnosticKeys: ["artifact_id", "artifact_path"],
  });

  const failed = buildAgentUiToolEndEvent(
    {
      toolCallId: "tool-2",
      result: {
        success: false,
        output: "",
        error: "权限不足",
      },
    },
    context,
  );

  assert.equal(failed.type, "tool.failed");
  assert.equal(failed.phase, "failed");
  assert.deepEqual(failed.payload, {
    success: false,
    outputPreview: undefined,
    errorPreview: "权限不足",
    outputLength: 0,
    hasImages: false,
    metadataKeys: [],
  });
  assert.deepEqual(failed.refs, {});

  const progress = buildAgentUiToolProgressEvent(
    {
      toolCallId: "tool-1",
      progress: {
        message: "正在处理第 2 项",
        progress: 2,
        total: 4,
        metadata: {
          notification_kind: "mcp_progress",
        },
      },
    },
    context,
  );

  assert.equal(progress.type, "tool.progress");
  assert.equal(progress.persistence, "ephemeral_live");
  assert.deepEqual(progress.payload, {
    messagePreview: "正在处理第 2 项",
    progress: 2,
    total: 4,
    metadataKeys: ["notification_kind"],
  });
  assert.deepEqual(progress.refs, {
    diagnosticKeys: ["notification_kind"],
  });

  const outputDelta = buildAgentUiToolOutputDeltaEvent(
    {
      toolCallId: "tool-1",
      delta: "partial output",
      outputKind: "log",
      metadata: {
        notification_kind: "mcp_log",
      },
    },
    context,
  );

  assert.equal(outputDelta.type, "tool.output.delta");
  assert.deepEqual(outputDelta.payload, {
    outputKind: "log",
    deltaPreview: "partial output",
    deltaLength: 14,
    metadataKeys: ["notification_kind"],
  });
  assert.deepEqual(outputDelta.refs, {
    diagnosticKeys: ["notification_kind"],
  });

  const inputDelta = buildAgentUiToolInputDeltaEvent(
    {
      toolCallId: "tool-1",
      toolName: "read_file",
      delta: '{"path"',
      accumulatedInput: '{"path"',
      provider: "openai_compatible",
    },
    context,
  );

  assert.equal(inputDelta.type, "tool.args.delta");
  assert.deepEqual(inputDelta.payload, {
    toolName: "read_file",
    provider: "openai_compatible",
    inputStreaming: true,
    deltaPreview: '{"path"',
    deltaLength: 7,
    accumulatedInputLength: 7,
    accumulatedInputPreview: '{"path"',
  });
});

test("tool end helper appends standard plan approval actions", () => {
  const context = {
    sessionId: "session-tool",
    threadId: "thread-tool",
    turnId: "turn-tool",
    timestamp: "2026-06-07T00:00:00.000Z",
  };

  const requiredEvents = buildAgentUiToolEndEvents(
    {
      toolCallId: "tool-plan",
      result: {
        success: true,
        output: "已提交计划审批",
        metadata: {
          plan_approval_request: {
            request_id: "plan-req-1",
            from: "researcher",
            plan_file_path: "plans/alpha.md",
            plan_content: "# 计划\n- 第一步",
          },
          plan_approval_delivery: {
            target: "lead-session",
            submission_id: "submit-1",
          },
        },
      },
    },
    context,
  );

  assert.equal(requiredEvents.length, 2);
  assert.equal(requiredEvents[0].type, "tool.result");
  assert.equal(requiredEvents[1].type, "action.required");
  assert.equal(requiredEvents[1].actionId, "plan-req-1");
  assert.equal(requiredEvents[1].toolCallId, "tool-plan");
  assert.equal(requiredEvents[1].persistence, "snapshot");
  assert.deepEqual(requiredEvents[1].payload, {
    actionType: "plan_approval",
    decisionKind: "plan_approval_request",
    from: "researcher",
    planFilePath: "plans/alpha.md",
    planContentPreview: "# 计划\n- 第一步",
    planContentLength: 10,
    timestamp: undefined,
    deliveryTarget: "lead-session",
    deliverySubmissionId: "submit-1",
    awaitingLeaderApproval: true,
  });

  const resolvedEvents = buildAgentUiToolEndEvents(
    {
      sourceType: "tool_end",
      toolCallId: "tool-send-message",
      result: {
        success: true,
        output: "结构化发送结果",
        metadata: {
          send_message: {
            target: "researcher",
            plan_approval_response: {
              request_id: "plan-req-2",
              approved: true,
              delivery_submission_id: "submit-response-1",
              target_session_id: "child-session",
            },
          },
        },
      },
    },
    context,
  );

  assert.equal(resolvedEvents.length, 2);
  assert.equal(resolvedEvents[1].type, "action.resolved");
  assert.equal(resolvedEvents[1].actionId, "plan-req-2");
  assert.equal(resolvedEvents[1].toolCallId, "tool-send-message");
  assert.deepEqual(resolvedEvents[1].payload, {
    actionType: "plan_approval",
    decisionKind: "plan_approval_response",
    approved: true,
    feedbackPreview: undefined,
    permissionMode: undefined,
    timestamp: undefined,
    targetSessionId: "child-session",
    deliveryTarget: "researcher",
    deliverySubmissionId: "submit-response-1",
  });
});

test("runtime lifecycle helpers build standard run events", () => {
  const context = {
    sessionId: " session-run ",
    threadId: " fallback-thread ",
    turnId: " fallback-turn ",
    timestamp: "2026-06-07T00:00:00.000Z",
  };

  const started = buildAgentUiRunStartedEvent(
    {
      threadId: " thread-run ",
      turnId: " turn-run ",
      status: "running",
      promptText: "整理今天的国际新闻",
    },
    context,
  );

  assert.equal(started.sourceType, "turn_started");
  assert.equal(started.sessionId, "session-run");
  assert.equal(started.threadId, "thread-run");
  assert.equal(started.turnId, "turn-run");
  assert.equal(started.type, "run.started");
  assert.equal(started.owner, "runtime");
  assert.equal(started.scope, "turn");
  assert.equal(started.phase, "accepted");
  assert.equal(started.surface, "runtime_status");
  assert.equal(started.persistence, "snapshot");
  assert.deepEqual(started.payload, {
    status: "running",
    promptLength: 9,
  });

  const finished = buildAgentUiRunFinishedEvent(
    { sourceType: "turn_completed" },
    context,
  );
  assert.equal(finished.sourceType, "turn_completed");
  assert.equal(finished.type, "run.finished");
  assert.equal(finished.phase, "completed");
  assert.equal(finished.persistence, "archive");

  const failed = buildAgentUiRunFailedEvent(
    {
      sourceType: "turn_failed",
      errorMessage: "权限不足",
    },
    context,
  );
  assert.equal(failed.type, "run.failed");
  assert.equal(failed.phase, "failed");
  assert.deepEqual(failed.payload, { errorPreview: "权限不足" });

  const status = buildAgentUiRuntimeStatusEvent(
    {
      phase: "permission_review",
      title: "等待确认",
      detail: "需要人工批准工具调用",
      checkpoints: ["plan", "permission"],
      metadata: {
        team_phase: "waiting",
        team_parallel_budget: 3,
        team_active_count: 1,
        team_queued_count: 2,
        provider_concurrency_group: "default",
        provider_parallel_budget: 4,
        queue_reason: "provider_limit",
        retryable_overload: true,
      },
    },
    context,
  );

  assert.equal(status.sourceType, "runtime_status");
  assert.equal(status.type, "run.status");
  assert.equal(status.phase, "waiting");
  assert.equal(status.runtimeStatus, "waiting");
  assert.equal(status.latestTurnStatus, "waiting");
  assert.equal(status.teamPhase, "waiting");
  assert.equal(status.teamParallelBudget, 3);
  assert.equal(status.teamActiveCount, 1);
  assert.equal(status.teamQueuedCount, 2);
  assert.equal(status.queuedTurnCount, 2);
  assert.equal(status.providerConcurrencyGroup, "default");
  assert.equal(status.providerParallelBudget, 4);
  assert.equal(status.queueReason, "provider_limit");
  assert.equal(status.retryableOverload, true);
  assert.deepEqual(status.payload, {
    runtimeEntity: "agent_turn",
    title: "等待确认",
    detailPreview: "需要人工批准工具调用",
    sourcePhase: "permission_review",
    checkpointCount: 2,
    metadataKeys: [
      "provider_concurrency_group",
      "provider_parallel_budget",
      "queue_reason",
      "retryable_overload",
      "team_active_count",
      "team_parallel_budget",
      "team_phase",
      "team_queued_count",
    ],
    teamPhase: "waiting",
    teamParallelBudget: 3,
    teamActiveCount: 1,
    teamQueuedCount: 2,
    queuedTurnCount: 2,
    providerConcurrencyGroup: "default",
    providerParallelBudget: 4,
    queueReason: "provider_limit",
    retryableOverload: true,
  });
});

test("thread item helpers build standard projection events", () => {
  const context = {
    sessionId: "session-thread",
    runId: "run-thread",
    timestamp: "2026-06-07T00:00:00.000Z",
  };

  const base = buildAgentUiThreadItemBase(
    "item_completed",
    {
      id: "part-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
    },
    context,
  );

  assert.equal(base.sessionId, "session-thread");
  assert.equal(base.threadId, "thread-1");
  assert.equal(base.turnId, "turn-1");
  assert.equal(base.partId, "part-1");
  assert.equal(base.runtimeEntity, "agent_turn");

  assert.equal(resolveAgentUiThreadItemPhase({ status: "failed" }), "failed");
  assert.equal(
    resolveAgentUiThreadItemToolResultType({
      type: "command_execution",
      status: "completed",
      exit_code: 1,
    }),
    "tool.failed",
  );
  assert.equal(
    resolveAgentUiThreadItemActionControl({ type: "request_user_input" }),
    "answer",
  );
  assert.equal(
    resolveAgentUiThreadItemSubagentRuntimeStatus({ status: "in_progress" }),
    "running",
  );

  const userInputAction = buildAgentUiThreadItemEvent(
    "item_updated",
    {
      id: "ask-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "request_user_input",
      status: "in_progress",
      request_id: "request-ask-1",
      action_type: "ask_user",
      prompt: "请补充发布渠道",
      questions: [{ question: "发布到哪里？" }, { question: "是否加封面？" }],
    },
    context,
  );
  assert.equal(userInputAction?.type, "action.required");
  assert.equal(userInputAction?.actionId, "request-ask-1");
  assert.equal(userInputAction?.owner, "action");
  assert.equal(userInputAction?.scope, "action_request");
  assert.equal(userInputAction?.phase, "waiting");
  assert.equal(userInputAction?.surface, "hitl");
  assert.equal(userInputAction?.persistence, "archive");
  assert.equal(userInputAction?.control, "answer");
  assert.equal(userInputAction?.partId, "ask-1");
  assert.deepEqual(userInputAction?.payload, {
    actionType: "ask_user",
    promptPreview: "请补充发布渠道",
    questionCount: 2,
    hasResponse: false,
  });

  const resolvedApprovalAction = buildAgentUiThreadItemActionEvent(
    "item_completed",
    {
      id: "approval-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "approval_request",
      status: "completed",
      request_id: "request-approval-1",
      action_type: "tool_confirmation",
      prompt: "允许执行命令？",
      response: { approved: true },
    },
    context,
  );
  assert.equal(resolvedApprovalAction?.type, "action.resolved");
  assert.equal(resolvedApprovalAction?.actionId, "request-approval-1");
  assert.equal(resolvedApprovalAction?.phase, "completed");
  assert.equal(resolvedApprovalAction?.control, "approve");
  assert.deepEqual(resolvedApprovalAction?.payload, {
    actionType: "tool_confirmation",
    promptPreview: "允许执行命令？",
    questionCount: 0,
    hasResponse: true,
  });

  const subagentActivity = buildAgentUiThreadItemEvent(
    "item_updated",
    {
      id: "worker-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "subagent_activity",
      status: "in_progress",
      status_label: "执行中",
      title: "整理资料",
      role: "researcher",
      model: "model-a",
      session_id: "child-session-1",
    },
    context,
  );
  assert.equal(subagentActivity?.type, "agent.changed");
  assert.equal(subagentActivity?.taskId, "child-session-1");
  assert.equal(subagentActivity?.agentId, "child-session-1");
  assert.equal(subagentActivity?.owner, "task");
  assert.equal(subagentActivity?.scope, "agent");
  assert.equal(subagentActivity?.phase, "acting");
  assert.equal(subagentActivity?.surface, "task_capsule");
  assert.equal(subagentActivity?.persistence, "archive");
  assert.equal(subagentActivity?.runtimeEntity, "subagent_turn");
  assert.equal(subagentActivity?.runtimeStatus, "running");
  assert.equal(subagentActivity?.latestTurnStatus, "running");
  assert.equal(subagentActivity?.topology, "coordinator_team");
  assert.deepEqual(subagentActivity?.payload, {
    runtimeEntity: "subagent_turn",
    statusLabel: "执行中",
    title: "整理资料",
    role: "researcher",
    model: "model-a",
    childSessionId: "child-session-1",
  });
  assert.equal(
    buildAgentUiThreadItemSubagentWorkerNotificationEvent(
      "item_updated",
      {
        id: "worker-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        type: "subagent_activity",
        status: "in_progress",
      },
      context,
    ),
    null,
  );

  const completedWorkerNotification =
    buildAgentUiThreadItemSubagentWorkerNotificationEvent(
      "item_completed",
      {
        id: "worker-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        type: "subagent_activity",
        status: "completed",
        status_label: "已完成",
        title: "整理资料",
        summary: "已完成资料整理",
        role: "researcher",
        model: "model-a",
        session_id: "child-session-1",
      },
      context,
    );
  assert.equal(completedWorkerNotification?.type, "worker.notification");
  assert.equal(completedWorkerNotification?.taskId, "child-session-1");
  assert.equal(completedWorkerNotification?.agentId, "child-session-1");
  assert.equal(completedWorkerNotification?.workerNotificationId, "worker-1");
  assert.equal(
    completedWorkerNotification?.transcriptRef,
    "thread-1:turn-1:worker-1",
  );
  assert.equal(completedWorkerNotification?.owner, "agent");
  assert.equal(completedWorkerNotification?.phase, "completed");
  assert.equal(
    completedWorkerNotification?.surface,
    "worker_notifications",
  );
  assert.equal(completedWorkerNotification?.runtimeEntity, "subagent_turn");
  assert.equal(completedWorkerNotification?.runtimeStatus, "completed");
  assert.deepEqual(completedWorkerNotification?.payload, {
    runtimeEntity: "subagent_turn",
    notificationKind: "worker_result",
    statusLabel: "已完成",
    title: "整理资料",
    summaryPreview: "已完成资料整理",
    role: "researcher",
    model: "model-a",
    childSessionId: "child-session-1",
  });
  assert.equal(
    buildAgentUiThreadItemSubagentActivityEvent(
      "item_completed",
      {
        id: "tool-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        type: "tool_call",
        status: "completed",
      },
      context,
    ),
    null,
  );

  const reasoning = buildAgentUiThreadItemEvent(
    "item_completed",
    {
      id: "reasoning-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "reasoning",
      status: "completed",
      text: "完整推理",
      summary: ["完成推理"],
    },
    context,
  );
  assert.equal(reasoning?.type, "reasoning.summary");
  assert.equal(reasoning?.phase, "completed");
  assert.deepEqual(reasoning?.payload, {
    textLength: 4,
    summaryCount: 1,
    preview: "完成推理",
  });

  const tool = buildAgentUiThreadItemEvent(
    "item_completed",
    {
      id: "tool-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "tool_call",
      status: "completed",
      tool_name: "write_file",
      success: true,
      output: "已写入文件",
      metadata: {
        artifact_id: "artifact-1",
        artifact_path: "docs/a.md",
      },
    },
    context,
  );
  assert.equal(tool?.type, "tool.result");
  assert.equal(tool?.toolCallId, "tool-1");
  assert.deepEqual(tool?.refs, {
    artifactIds: ["artifact-1"],
    artifactPaths: ["docs/a.md"],
  });
  assert.deepEqual(tool?.payload, {
    toolName: "write_file",
    success: true,
    outputPreview: "已写入文件",
    errorPreview: undefined,
    metadataKeys: ["artifact_id", "artifact_path"],
  });

  assert.equal(normalizeAgentUiProjectionToolName("Task-Update Tool"), "taskupdatetool");
  assert.equal(isAgentUiTaskUpdateToolName("TaskUpdateTool"), true);
  assert.deepEqual(
    extractAgentUiTaskOwnerChangeProjection({
      toolName: "TaskUpdate",
      status: "completed",
      success: true,
      metadata: {
        task_id: "task-1",
        task_list_id: "board-main",
        updated_fields: ["owner"],
        owner_change: {
          from: "researcher",
          to: "implementer",
        },
      },
    }),
    {
      action: "reassign",
      taskId: "task-1",
      previousAssigneeId: "researcher",
      nextAssigneeId: "implementer",
      sourceTaskListId: "board-main",
      sourceToolName: "TaskUpdate",
      reassignmentReason: "TaskUpdate owner change",
    },
  );
  assert.equal(
    extractAgentUiTaskOwnerChangeProjection({
      toolName: "TaskUpdate",
      status: "completed",
      success: true,
      metadata: {
        task_id: "task-1",
        updated_fields: ["status"],
      },
    }),
    null,
  );

  const command = buildAgentUiThreadItemEvent(
    "item_completed",
    {
      id: "command-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "command_execution",
      status: "completed",
      command: "npm test",
      cwd: "/tmp/project",
      aggregated_output: "失败",
      exit_code: 1,
    },
    context,
  );
  assert.equal(command?.type, "tool.failed");
  assert.equal(command?.phase, "failed");
  assert.deepEqual(command?.payload, {
    toolName: "command_execution",
    commandPreview: "npm test",
    cwd: "/tmp/project",
    exitCode: 1,
    outputPreview: "失败",
    errorPreview: undefined,
  });

  const artifact = buildAgentUiThreadItemEvent(
    "item_completed",
    {
      id: "artifact-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "file_artifact",
      status: "completed",
      path: "docs/a.md",
      source: "tool",
      content: "正文",
      metadata: { kind: "draft" },
    },
    context,
  );
  assert.equal(artifact?.type, "artifact.preview.ready");
  assert.equal(artifact?.artifactId, "artifact-1");
  assert.deepEqual(artifact?.refs, {
    artifactIds: ["artifact-1"],
    artifactPaths: ["docs/a.md"],
  });

  const compaction = buildAgentUiThreadItemEvent(
    "item_completed",
    {
      id: "compact-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "context_compaction",
      status: "completed",
      stage: "completed",
      trigger: "token_budget",
      detail: "已压缩上下文",
    },
    context,
  );
  assert.equal(compaction?.type, "context.compaction.completed");
  assert.deepEqual(compaction?.payload, {
    stage: "completed",
    trigger: "token_budget",
    detailPreview: "已压缩上下文",
  });

  const summary = buildAgentUiThreadItemEvent(
    "item_completed",
    {
      id: "summary-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "turn_summary",
      status: "completed",
      text: "本轮已完成检索与归档。",
    },
    context,
  );
  assert.equal(summary?.type, "state.snapshot");
  assert.deepEqual(summary?.payload, {
    textLength: 11,
    preview: "本轮已完成检索与归档。",
  });

  const diagnostic = buildAgentUiThreadItemEvent(
    "item_updated",
    {
      id: "warning-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "warning",
      status: "in_progress",
      code: "runtime.warning",
      message: "运行时提示",
    },
    context,
  );
  assert.equal(diagnostic?.type, "diagnostic.changed");
  assert.equal(diagnostic?.phase, "acting");
  assert.deepEqual(diagnostic?.payload, {
    code: "runtime.warning",
    messagePreview: "运行时提示",
  });
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
  assert.equal(
    normalizeRuntimeStatusFromRuntimePhase("permission_review"),
    "waiting",
  );
  assert.equal(
    normalizeRuntimePhaseFromRuntimeStatusPhase("routing"),
    "routing",
  );
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
