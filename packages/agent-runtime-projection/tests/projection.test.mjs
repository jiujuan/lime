import test from "node:test";
import assert from "node:assert/strict";

import {
  isAgentInputSourceRecoveryEvent,
  projectAgentRuntimeReadModel,
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
  assert.deepEqual(model.evidenceRefs, ["input-source:1"]);
  assert.deepEqual(model.artifactRefs, ["prompt-draft:1"]);
  assert.equal(isAgentInputSourceRecoveryEvent(actionEvent), true);
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
  assert.equal(model.events[0].displayStatus, "已处理");
});
