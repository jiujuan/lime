import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentUiRuntimePermissionChangedEvent,
  hasAgentUiRuntimePermissionMetadata,
  resolveAgentUiRuntimePermissionPhase,
} from "../dist/index.js";

test("runtime permission helper builds HITL permission changed events", () => {
  const event = buildAgentUiRuntimePermissionChangedEvent(
    {
      phase: "permission_review",
      metadata: {
        permission_status: "requires_confirmation",
        required_profile_keys: ["read_files", "write_artifacts"],
        ask_profile_keys: ["read_files"],
        blocking_profile_keys: [],
        decision_source: "runtime",
        decision_scope: "turn",
        confirmation_status: "not_requested",
        confirmation_request_id: "approval-1",
        confirmation_source: "policy",
      },
    },
    {
      sessionId: "session-permission",
      threadId: "thread-permission",
      runId: "run-permission",
      turnId: "turn-permission",
      timestamp: "2026-06-10T00:00:00.000Z",
    },
  );

  assert.ok(event);
  assert.equal(event.sourceType, "runtime_status");
  assert.equal(event.timestamp, "2026-06-10T00:00:00.000Z");
  assert.equal(event.sessionId, "session-permission");
  assert.equal(event.threadId, "thread-permission");
  assert.equal(event.runId, "run-permission");
  assert.equal(event.turnId, "turn-permission");
  assert.equal(event.type, "permission.changed");
  assert.equal(event.actionId, "approval-1");
  assert.equal(event.owner, "policy");
  assert.equal(event.scope, "run");
  assert.equal(event.phase, "waiting");
  assert.equal(event.surface, "hitl");
  assert.equal(event.persistence, "snapshot");
  assert.equal(event.control, "approve");
  assert.deepEqual(event.payload, {
    permissionStatus: "requires_confirmation",
    confirmationStatus: "not_requested",
    confirmationRequestId: "approval-1",
    confirmationSource: "policy",
    decisionSource: "runtime",
    decisionScope: "turn",
    requiredProfileKeys: ["read_files", "write_artifacts"],
    askProfileKeys: ["read_files"],
    blockingProfileKeys: [],
    declaredOnly: undefined,
    turnGating: undefined,
    sourcePhase: "permission_review",
  });
});

test("runtime permission helper returns null without metadata facts", () => {
  assert.equal(
    buildAgentUiRuntimePermissionChangedEvent({
      phase: "preparing",
      metadata: {},
    }),
    null,
  );
  assert.equal(hasAgentUiRuntimePermissionMetadata(null), false);
});

test("runtime permission helper resolves terminal phases", () => {
  assert.equal(
    resolveAgentUiRuntimePermissionPhase({
      phase: "preparing",
      metadata: {
        permission_status: "denied",
      },
    }),
    "failed",
  );
  assert.equal(
    resolveAgentUiRuntimePermissionPhase({
      phase: "preparing",
      metadata: {
        permission_status: "granted",
      },
    }),
    "completed",
  );
});
