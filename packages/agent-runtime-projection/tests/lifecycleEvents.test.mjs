import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentUiModelChangeEvent,
  buildAgentUiTaskProfileResolvedEvent,
  buildAgentUiThreadStartedEvent,
} from "../dist/index.js";

test("thread started helper builds standard session opened events", () => {
  const event = buildAgentUiThreadStartedEvent(
    {
      sourceType: "thread_started",
      threadId: " thread-1 ",
    },
    {
      sessionId: " session-1 ",
      timestamp: "2026-06-10T00:00:00.000Z",
    },
  );

  assert.equal(event.sourceType, "thread_started");
  assert.equal(event.sessionId, "session-1");
  assert.equal(event.threadId, "thread-1");
  assert.equal(event.type, "session.opened");
  assert.equal(event.owner, "session");
  assert.equal(event.scope, "thread");
  assert.equal(event.phase, "accepted");
  assert.equal(event.surface, "session_tabs");
  assert.equal(event.persistence, "snapshot");
});

test("model change helper builds standard routing status events", () => {
  const event = buildAgentUiModelChangeEvent(
    {
      sourceType: "model_change",
      model: " gpt-5.4 ",
      mode: " responsive ",
    },
    {
      sessionId: "session-1",
      threadId: "thread-1",
      runId: "run-1",
    },
  );

  assert.equal(event.type, "run.status");
  assert.equal(event.sourceType, "model_change");
  assert.equal(event.owner, "runtime");
  assert.equal(event.scope, "run");
  assert.equal(event.phase, "routing");
  assert.equal(event.surface, "runtime_status");
  assert.equal(event.persistence, "snapshot");
  assert.deepEqual(event.payload, {
    model: "gpt-5.4",
    mode: "responsive",
  });
});

test("task profile helper builds standard task changed events", () => {
  const event = buildAgentUiTaskProfileResolvedEvent(
    {
      sourceType: "task_profile_resolved",
      kind: "research",
      source: "runtime",
      traits: ["web", "summary"],
      modalityContractKey: "web_research",
      routingSlot: "deep-search",
      executionProfileKey: "research-default",
      executorAdapterKey: "browser",
      executorKind: "tool",
      executorBindingKey: "browser_search",
      permissionProfileKeys: ["network", "read_files"],
      userLockPolicy: "none",
      serviceModelSlot: "research",
      sceneKind: "browser",
      sceneSkillId: "web_search",
      entrySource: "natural_language",
    },
    {
      sessionId: "session-1",
      threadId: "thread-1",
      runId: "run-1",
    },
  );

  assert.equal(event.type, "task.changed");
  assert.equal(event.sourceType, "task_profile_resolved");
  assert.equal(event.owner, "task");
  assert.equal(event.scope, "run");
  assert.equal(event.phase, "routing");
  assert.equal(event.surface, "task_capsule");
  assert.equal(event.persistence, "snapshot");
  assert.deepEqual(event.payload, {
    kind: "research",
    source: "runtime",
    traits: ["web", "summary"],
    modalityContractKey: "web_research",
    routingSlot: "deep-search",
    executionProfileKey: "research-default",
    executorAdapterKey: "browser",
    executorKind: "tool",
    executorBindingKey: "browser_search",
    permissionProfileKeys: ["network", "read_files"],
    userLockPolicy: "none",
    serviceModelSlot: "research",
    sceneKind: "browser",
    sceneSkillId: "web_search",
    entrySource: "natural_language",
  });
});
