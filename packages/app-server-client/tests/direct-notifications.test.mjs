import assert from "node:assert/strict";
import { test } from "vitest";
import {
  isAgentMessageDeltaNotification,
  isItemCompletedNotification,
  isItemStartedNotification,
  isReasoningSummaryPartAddedNotification,
  isReasoningSummaryTextDeltaNotification,
  isReasoningTextDeltaNotification,
  isServerNotification,
  isThreadStartedNotification,
  isThreadSettingsUpdatedNotification,
  isTurnCompletedNotification,
  isTurnStartedNotification,
  serverNotification,
} from "../dist/index.js";

const threadId = "thread-1";
const turnId = "turn-1";

test("recognizes native v2 lifecycle and reasoning notifications", () => {
  const notifications = [
    {
      method: "thread/started",
      params: { thread: { id: threadId } },
    },
    {
      method: "turn/started",
      params: {
        threadId,
        turn: { id: turnId, status: "inProgress" },
      },
    },
    {
      method: "turn/completed",
      params: {
        threadId,
        turn: { id: turnId, status: "completed" },
      },
    },
    {
      method: "item/started",
      params: {
        item: { id: "item-1", text: "", type: "agentMessage" },
        startedAtMs: 1,
        threadId,
        turnId,
      },
    },
    {
      method: "item/completed",
      params: {
        completedAtMs: 2,
        item: { id: "item-1", text: "done", type: "agentMessage" },
        threadId,
        turnId,
      },
    },
    {
      method: "item/agentMessage/delta",
      params: { delta: "done", itemId: "item-1", threadId, turnId },
    },
    {
      method: "item/reasoning/summaryTextDelta",
      params: {
        delta: "summary",
        itemId: "reasoning-1",
        summaryIndex: 0,
        threadId,
        turnId,
      },
    },
    {
      method: "item/reasoning/summaryPartAdded",
      params: {
        itemId: "reasoning-1",
        summaryIndex: 1,
        threadId,
        turnId,
      },
    },
    {
      method: "item/reasoning/textDelta",
      params: {
        contentIndex: 0,
        delta: "raw reasoning",
        itemId: "reasoning-1",
        threadId,
        turnId,
      },
    },
  ];

  assert.equal(notifications.every(isServerNotification), true);
  assert.equal(isThreadStartedNotification(notifications[0]), true);
  assert.equal(isTurnStartedNotification(notifications[1]), true);
  assert.equal(isTurnCompletedNotification(notifications[2]), true);
  assert.equal(isItemStartedNotification(notifications[3]), true);
  assert.equal(isItemCompletedNotification(notifications[4]), true);
  assert.equal(isAgentMessageDeltaNotification(notifications[5]), true);
  assert.equal(
    isReasoningSummaryTextDeltaNotification(notifications[6]),
    true,
  );
  assert.equal(
    isReasoningSummaryPartAddedNotification(notifications[7]),
    true,
  );
  assert.equal(isReasoningTextDeltaNotification(notifications[8]), true);
  assert.equal(
    isThreadSettingsUpdatedNotification({
      method: "thread/settings/updated",
      params: {
        threadId,
        threadSettings: {
          cwd: "/tmp",
          model: "model-a",
          modelProvider: "provider-a",
        },
      },
    }),
    true,
  );
});

test("fails closed for malformed or unknown notifications", () => {
  const malformed = {
    method: "turn/started",
    params: { threadId, turn: { status: "inProgress" } },
  };
  const retired = {
    method: "agentSession/event",
    params: { event: {} },
  };

  assert.equal(serverNotification(malformed), undefined);
  assert.equal(isServerNotification(malformed), false);
  assert.equal(serverNotification(retired), undefined);
  assert.equal(isServerNotification(retired), false);
});

test("fails closed for malformed reasoning notifications", () => {
  const malformed = [
    {
      method: "item/reasoning/summaryTextDelta",
      params: {
        delta: "summary",
        itemId: "reasoning-1",
        threadId,
        turnId,
      },
    },
    {
      method: "item/reasoning/summaryPartAdded",
      params: {
        itemId: "reasoning-1",
        summaryIndex: "0",
        threadId,
        turnId,
      },
    },
    {
      method: "item/reasoning/textDelta",
      params: {
        contentIndex: Number.POSITIVE_INFINITY,
        delta: "raw reasoning",
        itemId: "reasoning-1",
        threadId,
        turnId,
      },
    },
  ];

  assert.equal(malformed.every((message) => !isServerNotification(message)), true);
});
