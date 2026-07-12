import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexMultiAgentToolSchemaProjectionEvent,
  getCodexMultiAgentToolSchemaContract,
  isCodexMultiAgentToolName,
  isLegacyMultiAgentToolName,
  listCodexMultiAgentToolSchemaContracts,
  validateCodexMultiAgentToolSchema,
} from "../dist/index.js";

test("Codex v2 multi-agent schema contracts expose current tool names only", () => {
  assert.deepEqual(
    listCodexMultiAgentToolSchemaContracts().map((contract) => contract.name),
    [
      "spawn_agent",
      "send_message",
      "followup_task",
      "wait_agent",
      "interrupt_agent",
      "list_agents",
    ],
  );

  assert.equal(isCodexMultiAgentToolName("spawn_agent"), true);
  assert.equal(isCodexMultiAgentToolName("Agent"), false);
  assert.equal(isLegacyMultiAgentToolName("Agent"), true);
  assert.equal(isLegacyMultiAgentToolName("TeamCreate"), true);
  assert.equal(isLegacyMultiAgentToolName("multi_agent_v1.send_input"), true);
});

test("spawn_agent requires task_name and message and rejects v1 item fields", () => {
  const contract = getCodexMultiAgentToolSchemaContract("spawn_agent");
  assert.deepEqual(contract?.requiredInputFields, ["task_name", "message"]);
  assert.deepEqual(contract?.forbiddenInputFields, [
    "items",
    "fork_context",
    "target",
  ]);
  assert.deepEqual(contract?.outputRequiredFields, ["task_name", "nickname"]);

  assert.deepEqual(
    validateCodexMultiAgentToolSchema({
      toolName: "spawn_agent",
      input: {
        task_name: "researcher",
        message: "Find the relevant files",
        fork_turns: "all",
      },
    }),
    [],
  );

  assert.deepEqual(
    validateCodexMultiAgentToolSchema({
      toolName: "spawn_agent",
      input: {
        message: "Find the relevant files",
        items: [{ type: "text", text: "legacy item" }],
        fork_context: true,
      },
    }).map((item) => [item.code, item.path]),
    [
      ["missing_required_field", "$.input.task_name"],
      ["forbidden_field", "$.input.items"],
      ["forbidden_field", "$.input.fork_context"],
    ],
  );
});

test("message, wait, interrupt and list contracts match Codex v2 guardrails", () => {
  assert.deepEqual(
    validateCodexMultiAgentToolSchema({
      toolName: "send_message",
      input: { target: "researcher", message: "Continue" },
    }),
    [],
  );
  assert.deepEqual(
    validateCodexMultiAgentToolSchema({
      toolName: "send_message",
      input: { target: "researcher", items: [] },
    }).map((item) => [item.code, item.path]),
    [
      ["missing_required_field", "$.input.message"],
      ["forbidden_field", "$.input.items"],
    ],
  );
  assert.deepEqual(
    validateCodexMultiAgentToolSchema({
      toolName: "wait_agent",
      input: { timeout_ms: -1 },
    }).map((item) => [item.code, item.path]),
    [["invalid_timeout", "$.input.timeout_ms"]],
  );
  assert.deepEqual(
    getCodexMultiAgentToolSchemaContract("list_agents")?.outputRequiredFields,
    ["agents"],
  );
  assert.deepEqual(
    getCodexMultiAgentToolSchemaContract("interrupt_agent")
      ?.outputRequiredFields,
    ["previous_status"],
  );
});

test("legacy Lime/Agent team tool names fail closed before projection", () => {
  assert.deepEqual(
    validateCodexMultiAgentToolSchema({
      toolName: "TeamCreate",
      input: { name: "writers" },
    }).map((item) => item.code),
    ["legacy_tool_name"],
  );
  assert.equal(
    buildCodexMultiAgentToolSchemaProjectionEvent({
      toolName: "TeamCreate",
      input: { name: "writers" },
    }),
    undefined,
  );
});

test("projection event binds Codex v2 tool schema to Team UI policy surface", () => {
  const event = buildCodexMultiAgentToolSchemaProjectionEvent(
    {
      toolName: "spawn_agent",
      toolCallId: "tool-spawn-1",
      input: {
        task_name: "researcher",
        message: "Collect source links",
      },
      result: {
        task_name: "researcher",
        nickname: "Researcher",
      },
    },
    {
      sessionId: "session-root",
      threadId: "thread-root",
      turnId: "turn-root",
      sequence: 17,
      timestamp: "2026-07-08T00:00:00.000Z",
    },
  );

  assert.deepEqual(
    {
      type: event?.type,
      sourceType: event?.sourceType,
      sequence: event?.sequence,
      sessionId: event?.sessionId,
      threadId: event?.threadId,
      turnId: event?.turnId,
      taskId: event?.taskId,
      agentId: event?.agentId,
      toolCallId: event?.toolCallId,
      owner: event?.owner,
      scope: event?.scope,
      surface: event?.surface,
      control: event?.control,
      topology: event?.topology,
      runtimeEntity: event?.runtimeEntity,
      runtimeStatus: event?.runtimeStatus,
    },
    {
    type: "task.changed",
    sourceType: "multi_agent_tool_schema_projection",
    sequence: 17,
    sessionId: "session-root",
    threadId: "thread-root",
    turnId: "turn-root",
    taskId: "researcher",
    agentId: "researcher",
    toolCallId: "tool-spawn-1",
    owner: "task",
    scope: "task",
    surface: "team_policy",
    control: "delegate",
    topology: "coordinator_team",
    runtimeEntity: "work_item",
    runtimeStatus: "completed",
    },
  );
  assert.deepEqual(event?.payload?.requiredInputFields, [
    "task_name",
    "message",
  ]);
  assert.deepEqual(event?.payload?.forbiddenInputFields, [
    "items",
    "fork_context",
    "target",
  ]);
  assert.deepEqual(event?.payload?.validationIssues, []);
});
