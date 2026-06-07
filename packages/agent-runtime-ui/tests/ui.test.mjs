import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import assert from "node:assert/strict";

import { AgentTimeline, RuntimeFactsPanel } from "../dist/index.js";

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
    displayStatus: "待处理",
    action: { actionKind: "add-input-source", targetModule: "knowledge-inputs", buttonLabel: "补输入源", decision: "open-input-source" },
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
