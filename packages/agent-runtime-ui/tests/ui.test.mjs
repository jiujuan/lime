import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import assert from "node:assert/strict";

import { projectAgentUiState } from "@limecloud/agent-runtime-projection";

import { AgentTimeline, AgentUiProjectionView, RuntimeFactsPanel } from "../dist/index.js";

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
    actionId: "action-1",
    resolved: false,
    actionKind: "add-input-source",
    targetModule: "knowledge-inputs",
  };
  const readModel = {
    events: [projectedAction],
    visibleEvents: [projectedAction],
    pendingActions: [],
    inputSourceRecovery: true,
    sourceCount: 1,
    artifactRefs: ["prompt-draft:1"],
    evidenceRefs: ["input-source:1"],
    taskRefs: [],
  };
  const markup = renderToStaticMarkup(React.createElement(RuntimeFactsPanel, { readModel, onResolveAction: () => {} }));

  assert.match(markup, /协作事实摘要/);
  assert.match(markup, /需要补充输入源/);
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
  assert.match(markup, /消息部分/);
  assert.match(markup, /你好，Lime/);
  assert.match(markup, /过程时间线/);
  assert.match(markup, /agent-process-entry completed/);
  assert.match(markup, /工具调用/);
  assert.match(markup, /待处理动作/);
  assert.match(markup, /需要确认/);
  assert.match(markup, /打开模型设置/);
  assert.match(markup, /执行图/);
  assert.match(markup, /data-node-type="tool"/);
});
