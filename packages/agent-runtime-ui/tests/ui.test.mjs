import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import assert from "node:assert/strict";

import {
  agentUiConformanceFixtures,
  getAgentUiFixture,
} from "@limecloud/agent-ui-contracts";
import {
  projectAgentUiState,
  replayAgentUiFixture,
} from "@limecloud/agent-runtime-projection";

import {
  AgentTimeline,
  AgentUiProjectionView,
  ArtifactRefList,
  EvidenceRefList,
  RuntimeFactsPanel,
  SubagentsView,
} from "../dist/index.js";

test("AgentTimeline renders user and assistant messages", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AgentTimeline, {
      messages: [
        { id: "m1", role: "user", content: "生成一个 Prompt", createdAt: "2026-06-07T00:00:00.000Z" },
        { id: "m2", role: "assistant", content: "已生成草稿", model: "model-a", createdAt: "2026-06-07T00:00:01.000Z" },
      ],
    }),
  );

  assert.match(markup, /agent-turn user/);
  assert.match(markup, /agent-turn assistant/);
  assert.match(markup, /已生成草稿/);
});

test("RuntimeFactsPanel renders action button and fact counts", () => {
  const actionEvent = {
    id: "evt-action",
    kind: "action",
    status: "pending",
    eventClass: "action.required",
    title: "需要补充输入源",
    actionId: "action-1",
    payload: { actionKind: "add-input-source" },
    createdAt: "2026-06-07T00:00:00.000Z",
  };
  const projectedAction = {
    id: "evt-action",
    source: actionEvent,
    surface: "human-action",
    title: "需要补充输入源",
    status: "pending",
    displayStatusKey: "agent.status.actionRequired",
    action: {
      actionKind: "add-input-source",
      targetModule: "knowledge-inputs",
      labelKey: "agent.action.addInputSource",
      decision: "open-input-source",
    },
    actions: [
      {
        actionKind: "approval",
        targetModule: "host",
        labelKey: "agent.action.approve",
        decision: "approve",
      },
      {
        actionKind: "approval",
        targetModule: "host",
        labelKey: "agent.action.reject",
        decision: "reject",
      },
    ],
    actionId: "action-1",
    resolved: false,
    actionKind: "add-input-source",
    targetModule: "knowledge-inputs",
  };
  const readModel = {
    events: [projectedAction],
    visibleEvents: [projectedAction],
    pendingActions: [projectedAction],
    inputSourceRecovery: true,
    sourceCount: 1,
    artifactRefs: ["prompt-draft:1"],
    evidenceRefs: ["input-source:1"],
    taskRefs: [],
  };
  const markup = renderToStaticMarkup(React.createElement(RuntimeFactsPanel, { readModel, onResolveAction: () => {} }));

  assert.match(markup, /Runtime facts summary/);
  assert.match(markup, /agent-runtime-event pending/);
  assert.match(markup, /Input sources/);
  assert.match(markup, /Actions/);
  assert.match(markup, /需要补充输入源/);
  assert.match(markup, /Approve/);
  assert.match(markup, /Reject/);
  assert.match(markup, /data-action-decision="approve"/);
  assert.match(markup, /data-action-decision="reject"/);
});

test("RuntimeFactsPanel accepts host-provided labels", () => {
  const actionEvent = {
    id: "evt-action",
    kind: "action",
    status: "pending",
    eventClass: "action.required",
    title: "需要补充输入源",
    actionId: "action-1",
    payload: { actionKind: "add-input-source" },
    createdAt: "2026-06-07T00:00:00.000Z",
  };
  const projectedAction = {
    id: "evt-action",
    source: actionEvent,
    surface: "human-action",
    title: "需要补充输入源",
    status: "pending",
    displayStatusKey: "agent.status.actionRequired",
    action: {
      actionKind: "add-input-source",
      targetModule: "knowledge-inputs",
      labelKey: "agent.action.addInputSource",
      decision: "open-input-source",
    },
    actionId: "action-1",
    resolved: false,
    actionKind: "add-input-source",
    targetModule: "knowledge-inputs",
  };
  const readModel = {
    events: [projectedAction],
    visibleEvents: [projectedAction],
    pendingActions: [projectedAction],
    inputSourceRecovery: true,
    sourceCount: 1,
    artifactRefs: [],
    evidenceRefs: [],
    taskRefs: [],
  };
  const markup = renderToStaticMarkup(
    React.createElement(RuntimeFactsPanel, {
      readModel,
      onResolveAction: () => {},
      labels: {
        runtimeSummaryAriaLabel: "协作事实摘要",
        executionEventsAriaLabel: "执行事件",
        summaryLabels: {
          sources: "输入源",
          actions: "待处理动作",
          artifacts: "交付物",
          evidence: "证据",
        },
        actionButtonLabel: () => "补输入源",
      },
    }),
  );

  assert.match(markup, /协作事实摘要/);
  assert.match(markup, /输入源/);
  assert.match(markup, /待处理动作/);
  assert.match(markup, /补输入源/);
});

test("AgentUiProjectionView renders standard projection surfaces", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-model",
        kind: "model",
        status: "running",
        eventClass: "model.delta",
        title: "模型输出",
        detail: "正在生成",
        runId: "run-1",
        sequence: 1,
        payload: { messageId: "msg-1", text: "你好，Lime" },
        createdAt: "2026-06-07T00:00:00.000Z",
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
        sequence: 2,
        createdAt: "2026-06-07T00:00:01.000Z",
      },
      {
        id: "evt-action",
        kind: "action",
        status: "pending",
        eventClass: "action.required",
        title: "需要确认",
        actionId: "action-1",
        sequence: 3,
        payload: { actionKind: "configure-text-model" },
        createdAt: "2026-06-07T00:00:02.000Z",
      },
    ],
    sourceCount: 1,
  });

  const markup = renderToStaticMarkup(
    React.createElement(AgentUiProjectionView, {
      state,
      onResolveAction: () => {},
    }),
  );

  assert.match(markup, /agent-ui-projection/);
  assert.match(markup, /Message parts/);
  assert.match(markup, /你好，Lime/);
  assert.match(markup, /Process timeline/);
  assert.match(markup, /agent-process-entry completed/);
  assert.match(markup, /Tool calls/);
  assert.match(markup, /Action required/);
  assert.match(markup, /需要确认/);
  assert.match(markup, /Open model settings/);
  assert.match(markup, /Execution graph/);
  assert.match(markup, /data-node-type="tool"/);
});

test("AgentUiProjectionView accepts host-provided labels", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-model",
        kind: "model",
        status: "running",
        eventClass: "model.delta",
        title: "模型输出",
        runId: "run-1",
        sequence: 1,
        payload: { messageId: "msg-1", text: "你好，Lime" },
        createdAt: "2026-06-07T00:00:00.000Z",
      },
      {
        id: "evt-action",
        kind: "action",
        status: "pending",
        eventClass: "action.required",
        title: "需要确认",
        actionId: "action-1",
        sequence: 2,
        payload: { actionKind: "configure-text-model" },
        createdAt: "2026-06-07T00:00:01.000Z",
      },
    ],
    sourceCount: 1,
  });

  const markup = renderToStaticMarkup(
    React.createElement(AgentUiProjectionView, {
      state,
      onResolveAction: () => {},
      labels: {
        messagePartsAriaLabel: "消息部分",
        processTimelineAriaLabel: "过程时间线",
        runtimeSummaryAriaLabel: "协作事实摘要",
        actionRequiredAriaLabel: "待处理动作",
        executionGraphAriaLabel: "执行图",
        summaryLabels: {
          sources: "输入源",
          actions: "待处理动作",
          artifacts: "交付物",
          evidence: "证据",
        },
        actionButtonLabel: () => "打开模型设置",
      },
    }),
  );

  assert.match(markup, /消息部分/);
  assert.match(markup, /过程时间线/);
  assert.match(markup, /协作事实摘要/);
  assert.match(markup, /待处理动作/);
  assert.match(markup, /打开模型设置/);
  assert.match(markup, /执行图/);
});

test("AgentUiProjectionView renders standard fixture replay states", () => {
  for (const fixture of agentUiConformanceFixtures) {
    const replay = replayAgentUiFixture(fixture);
    const markup = renderToStaticMarkup(
      React.createElement(AgentUiProjectionView, {
        state: replay.state,
        onResolveAction: () => {},
      }),
    );

    assert.equal(replay.passed, true, fixture.id);
    assert.match(markup, /agent-ui-projection/, fixture.id);
    assert.match(markup, /data-hydration-status="live"/, fixture.id);
  }
});

test("AgentUiProjectionView renders subagent handoff fixture graph", () => {
  const replay = replayAgentUiFixture(getAgentUiFixture("subagent-handoff"));
  const markup = renderToStaticMarkup(
    React.createElement(AgentUiProjectionView, {
      state: replay.state,
      onResolveAction: () => {},
    }),
  );

  assert.match(markup, /data-node-type="subagent"/);
  assert.match(markup, /data-parent-id="task_fixture"/);
  assert.match(markup, /agent-subagents/);
  assert.match(markup, /Subagent threads/);
  assert.match(markup, /Subagent delegations/);
  assert.match(markup, /Subagent activities/);
  assert.match(markup, /data-subagent-id="subagent_fixture_researcher"/);
  assert.match(markup, /data-delegation-action="handoff"/);
  assert.match(markup, /Research subagent started/);
  assert.match(markup, /Research notes and review evidence are ready/);
  assert.match(markup, /Research update posted/);
  assert.match(markup, /Research notes attached/);
  assert.match(markup, /data-source-event-id="evt_handoff_requested"/);
});

test("AgentUiProjectionView renders artifact and evidence refs from projection state", () => {
  const replay = replayAgentUiFixture(getAgentUiFixture("artifact-evidence"));
  const markup = renderToStaticMarkup(
    React.createElement(AgentUiProjectionView, {
      state: replay.state,
      labels: {
        artifactRefsAriaLabel: "交付物引用",
        evidenceRefsAriaLabel: "证据引用",
        artifactRefActionLabel: () => "打开交付物",
        evidenceRefActionLabel: () => "打开证据",
      },
      onSelectArtifactRef: () => {},
      onSelectEvidenceRef: () => {},
    }),
  );

  assert.match(markup, /交付物引用/);
  assert.match(markup, /证据引用/);
  assert.match(markup, /data-ref-kind="artifact"/);
  assert.match(markup, /data-ref-kind="evidence"/);
  assert.match(markup, /data-ref-id="artifact_fixture_1"/);
  assert.match(markup, /data-ref-id="evidence_fixture_1"/);
  assert.match(markup, /打开交付物/);
  assert.match(markup, /打开证据/);
});

test("ArtifactRefList and EvidenceRefList expose stable DOM contracts", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(ArtifactRefList, {
        refs: [{ id: "artifact-1", sourceEventId: "evt-artifact" }],
        refTitle: (ref) => `Artifact ${ref.id}`,
      }),
      React.createElement(EvidenceRefList, {
        refs: [{ id: "evidence-1", sourceEventId: "evt-evidence" }],
        refTitle: (ref) => `Evidence ${ref.id}`,
      }),
    ),
  );

  assert.match(markup, /agent-artifact-refs/);
  assert.match(markup, /agent-evidence-refs/);
  assert.match(markup, /data-source-event-id="evt-artifact"/);
  assert.match(markup, /data-source-event-id="evt-evidence"/);
  assert.match(markup, /Artifact artifact-1/);
  assert.match(markup, /Evidence evidence-1/);
});

test("ArtifactRefList and EvidenceRefList make selectable ref cards interactive", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(ArtifactRefList, {
        refs: [{ id: "artifact-1", sourceEventId: "evt-artifact" }],
        onSelectRef: () => {},
      }),
      React.createElement(EvidenceRefList, {
        refs: [{ id: "evidence-1", sourceEventId: "evt-evidence" }],
        onSelectRef: () => {},
      }),
    ),
  );

  assert.match(markup, /<button type="button" class="agent-ref-card"/);
  assert.match(markup, /class="agent-ref-action"/);
});

test("SubagentsView renders threads, delegations, and activities from projection state", () => {
  const replay = replayAgentUiFixture(getAgentUiFixture("subagent-handoff"));
  const markup = renderToStaticMarkup(
    React.createElement(SubagentsView, {
      model: replay.state.subagents,
      labels: {
        subagentsAriaLabel: "子代理",
        subagentThreadsAriaLabel: "子代理线程",
        subagentDelegationsAriaLabel: "委派调用",
        subagentActivitiesAriaLabel: "活动记录",
      },
    }),
  );

  assert.match(markup, /子代理/);
  assert.match(markup, /子代理线程/);
  assert.match(markup, /委派调用/);
  assert.match(markup, /活动记录/);
  assert.match(markup, /data-subagent-count="1"/);
  assert.match(markup, /data-delegation-count="2"/);
  assert.match(markup, /data-activity-count="10"/);
  assert.match(markup, /data-thread-id="subagent_fixture_researcher"/);
  assert.match(markup, /data-delegation-action="spawn"/);
  assert.match(markup, /data-delegation-action="handoff"/);
  assert.match(markup, /data-activity-kind="review"/);
  assert.match(markup, /data-activity-kind="handoff"/);
  assert.match(markup, /Research notes and review evidence are ready/);
});
