import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentUiModelChangeEvent,
  buildAgentUiRuntimeTeamChangedEvent,
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

test("runtime team helper builds standard team changed events", () => {
  const event = buildAgentUiRuntimeTeamChangedEvent(
    {
      sourceType: "runtime_status",
      phase: "routing",
      title: "并行执行",
      detail: "正在协调多个 Worker",
      metadata: {
        team_phase: "running",
        team_parallel_budget: 3,
        team_active_count: 2,
        team_queued_count: 1,
        concurrency_phase: "active",
        concurrency_scope: "provider",
        provider_concurrency_group: "openai:gpt-5.4",
        provider_parallel_budget: 4,
        queue_reason: "provider_busy",
        retryable_overload: true,
      },
    },
    {
      sessionId: "session-team-1",
      threadId: "thread-team-1",
    },
  );

  assert.ok(event);
  assert.equal(event.type, "team.changed");
  assert.equal(event.sourceType, "runtime_status");
  assert.equal(event.owner, "team");
  assert.equal(event.scope, "team");
  assert.equal(event.phase, "acting");
  assert.equal(event.surface, "team_roster");
  assert.equal(event.persistence, "snapshot");
  assert.equal(event.runtimeStatus, "preparing");
  assert.equal(event.latestTurnStatus, "preparing");
  assert.equal(event.topology, "parallel_workers");
  assert.equal(event.teamPhase, "running");
  assert.equal(event.teamParallelBudget, 3);
  assert.equal(event.teamActiveCount, 2);
  assert.equal(event.teamQueuedCount, 1);
  assert.equal(event.queuedTurnCount, 1);
  assert.equal(event.providerConcurrencyGroup, "openai:gpt-5.4");
  assert.equal(event.providerParallelBudget, 4);
  assert.equal(event.queueReason, "provider_busy");
  assert.equal(event.retryableOverload, true);
  assert.deepEqual(event.payload, {
    teamEvent: "runtime_status_changed",
    sourcePhase: "routing",
    title: "并行执行",
    detailPreview: "正在协调多个 Worker",
    concurrencyPhase: "active",
    concurrencyScope: "provider",
  });
});

test("runtime team helper skips runtime status without team metadata", () => {
  const event = buildAgentUiRuntimeTeamChangedEvent({
    sourceType: "runtime_status",
    phase: "routing",
    title: "路由中",
    detail: "没有 Team metadata",
  });

  assert.equal(event, null);
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
