import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexReviewStartItemProjectionEvent,
  extractCodexReviewStartItemSnapshot,
} from "../dist/index.js";

function reviewStartResponse(overrides = {}) {
  return {
    turn: {
      id: "turn-review",
      status: "inProgress",
      items: [
        {
          type: "userMessage",
          id: "turn-review",
          content: [
            {
              type: "text",
              text: "commit 1234567: Tidy UI colors",
            },
          ],
        },
      ],
    },
    reviewThreadId: "thread-root",
    ...overrides,
  };
}

function enteredNotification(threadId = "thread-root") {
  return {
    method: "item/started",
    params: {
      threadId,
      item: {
        type: "enteredReviewMode",
        id: "turn-review",
        review: "commit 1234567: Tidy UI colors",
      },
    },
  };
}

function exitedNotification(threadId = "thread-root") {
  return {
    method: "item/completed",
    params: {
      threadId,
      item: {
        type: "exitedReviewMode",
        id: "turn-review",
        review: "Looks solid overall.\n\n- Prefer Stylize helpers - /tmp/file.rs:10-20",
      },
    },
  };
}

function baseInput(overrides = {}) {
  return {
    threadId: "thread-root",
    delivery: "inline",
    reviewStartResponse: reviewStartResponse(),
    notifications: [enteredNotification(), exitedNotification()],
    commandExecutionItems: [
      {
        id: "review-call-1",
        type: "commandExecution",
      },
    ],
    commandApprovalRequests: [
      {
        item_id: "review-call-1",
        turn_id: "turn-review",
      },
    ],
    visibleTranscriptItems: [],
    ...overrides,
  };
}

test("review/start inline review binds entered and exited review items to the same turn", () => {
  const event = buildCodexReviewStartItemProjectionEvent(
    baseInput(),
    {
      sequence: 261,
      sessionId: "session-root",
      timestamp: "2026-07-09T00:00:00.000Z",
    },
  );

  assert.deepEqual(
    {
      type: event.type,
      sourceType: event.sourceType,
      sequence: event.sequence,
      sessionId: event.sessionId,
      threadId: event.threadId,
      turnId: event.turnId,
      reviewId: event.reviewId,
      owner: event.owner,
      scope: event.scope,
      phase: event.phase,
      surface: event.surface,
      persistence: event.persistence,
      control: event.control,
      topology: event.topology,
      runtimeEntity: event.runtimeEntity,
      runtimeStatus: event.runtimeStatus,
    },
    {
      type: "review.completed",
      sourceType: "review_start_item_projection",
      sequence: 261,
      sessionId: "session-root",
      threadId: "thread-root",
      turnId: "turn-review",
      reviewId: "turn-review",
      owner: "evidence",
      scope: "evidence",
      phase: "completed",
      surface: "review_lane",
      persistence: "archive",
      control: "request_review",
      topology: "review_team",
      runtimeEntity: "subagent_turn",
      runtimeStatus: "completed",
    },
  );
  assert.deepEqual(event.payload.validationIssues, []);
  assert.equal(event.payload.enteredSeen, true);
  assert.equal(event.payload.exitedSeen, true);
  assert.equal(event.payload.itemIdsMatch, true);
  assert.equal(event.payload.inlineThreadStable, true);
  assert.equal(event.payload.promptHiddenFromTranscript, true);
  assert.equal(event.payload.finalReviewKeptOutOfPlainAssistant, true);
  assert.equal(event.payload.approvalItemIdsMatch, true);
  assert.equal(event.payload.approvalTurnIdsMatch, true);
});

test("detached review requires a new thread/started before review items", () => {
  const snapshot = extractCodexReviewStartItemSnapshot(
    baseInput({
      delivery: "detached",
      reviewStartResponse: reviewStartResponse({
        reviewThreadId: "thread-review",
      }),
      notifications: [
        {
          method: "thread/started",
          params: {
            thread: {
              id: "thread-review",
              session_id: "thread-review",
            },
          },
        },
        enteredNotification("thread-review"),
        exitedNotification("thread-review"),
      ],
    }),
  );

  assert.deepEqual(snapshot.validationIssues, []);
  assert.equal(snapshot.delivery, "detached");
  assert.equal(snapshot.reviewThreadId, "thread-review");
  assert.equal(snapshot.inlineThreadStable, false);
  assert.equal(snapshot.detachedThreadStartedBeforeReview, true);
});

test("review prompt and final review must not render as ordinary chat transcript", () => {
  const snapshot = extractCodexReviewStartItemSnapshot(
    baseInput({
      visibleTranscriptItems: [
        {
          role: "user",
          text: "commit 1234567: Tidy UI colors",
        },
        {
          role: "assistant",
          text: "Looks solid overall.\n\n- Prefer Stylize helpers - /tmp/file.rs:10-20",
        },
      ],
    }),
  );

  assert.equal(snapshot.promptHiddenFromTranscript, false);
  assert.equal(snapshot.finalReviewKeptOutOfPlainAssistant, false);
  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    [
      "review_prompt_rendered_as_transcript",
      "review_final_rendered_as_plain_assistant",
    ],
  );
});

test("detached review fails closed if thread/started comes after review items", () => {
  const snapshot = extractCodexReviewStartItemSnapshot(
    baseInput({
      delivery: "detached",
      reviewStartResponse: reviewStartResponse({
        reviewThreadId: "thread-review",
      }),
      notifications: [
        enteredNotification("thread-review"),
        {
          method: "thread/started",
          params: {
            thread: {
              id: "thread-review",
              session_id: "thread-review",
            },
          },
        },
        exitedNotification("thread-review"),
      ],
    }),
  );

  assert.equal(snapshot.detachedThreadStartedBeforeReview, false);
  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    ["detached_thread_started_after_review_item"],
  );
});

test("review command approval must bind to the command execution item and review turn", () => {
  const snapshot = extractCodexReviewStartItemSnapshot(
    baseInput({
      commandExecutionItems: [
        {
          id: "review-call-1",
          type: "commandExecution",
        },
      ],
      commandApprovalRequests: [
        {
          item_id: "other-call",
          turn_id: "other-turn",
        },
      ],
    }),
  );

  assert.equal(snapshot.approvalItemIdsMatch, false);
  assert.equal(snapshot.approvalTurnIdsMatch, false);
  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    ["approval_item_id_mismatch", "approval_turn_id_mismatch"],
  );
});
