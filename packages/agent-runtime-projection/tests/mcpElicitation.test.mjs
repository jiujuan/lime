import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexMcpElicitationRequiredEvent,
  buildCodexMcpElicitationResolvedEvent,
  extractCodexMcpElicitationSnapshot,
} from "../dist/index.js";

function standardFormParams() {
  return {
    threadId: "thread-mcp",
    turnId: "turn-mcp",
    serverName: "codex_apps",
    mode: "form",
    message: "Allow this request?",
    requestedSchema: {
      type: "object",
      properties: {
        confirmed: {
          type: "boolean",
          title: "Confirm",
        },
      },
      required: ["confirmed"],
    },
  };
}

function openAiFormParams() {
  return {
    threadId: "thread-mcp",
    turnId: "turn-mcp",
    serverName: "codex_apps",
    mode: "openai/form",
    message: "Select a template",
    requestedSchema: {
      type: "object",
      properties: {
        template: {
          type: "openai/imagePicker",
          title: "Template",
          items: [
            {
              id: "monthly-review",
              title: "Monthly review",
              image: "data:image/svg+xml;base64,PHN2Zy8+",
            },
          ],
        },
      },
      required: ["template"],
    },
  };
}

test("MCP form elicitation request binds request id, server, thread, turn and schema", () => {
  const snapshot = extractCodexMcpElicitationSnapshot({
    requestId: "request-mcp-1",
    toolCallId: "tool-call-mcp",
    params: standardFormParams(),
  });

  assert.deepEqual(
    {
      requestId: snapshot?.request.requestId,
      serverName: snapshot?.request.serverName,
      threadId: snapshot?.request.threadId,
      turnId: snapshot?.request.turnId,
      toolCallId: snapshot?.request.toolCallId,
      mode: snapshot?.request.mode,
      schemaPropertyNames: snapshot?.request.schemaPropertyNames,
      requiredFields: snapshot?.request.requiredFields,
      capabilityRequired: snapshot?.request.capabilityRequired,
      capabilitySatisfied: snapshot?.request.capabilitySatisfied,
      correlatedToTurn: snapshot?.request.correlatedToTurn,
    },
    {
      requestId: "request-mcp-1",
      serverName: "codex_apps",
      threadId: "thread-mcp",
      turnId: "turn-mcp",
      toolCallId: "tool-call-mcp",
      mode: "form",
      schemaPropertyNames: ["confirmed"],
      requiredFields: ["confirmed"],
      capabilityRequired: false,
      capabilitySatisfied: true,
      correlatedToTurn: true,
    },
  );
  assert.deepEqual(snapshot?.validationIssues, []);
});

test("required event projects MCP elicitation to HITL action surface", () => {
  const event = buildCodexMcpElicitationRequiredEvent(
    {
      requestId: "request-mcp-1",
      toolCallId: "tool-call-mcp",
      params: standardFormParams(),
    },
    {
      sequence: 7,
      sessionId: "session-mcp",
      timestamp: "2026-07-09T00:00:00.000Z",
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
      toolCallId: event?.toolCallId,
      actionId: event?.actionId,
      owner: event?.owner,
      scope: event?.scope,
      surface: event?.surface,
      control: event?.control,
      runtimeStatus: event?.runtimeStatus,
    },
    {
      type: "action.required",
      sourceType: "mcp_elicitation_required_projection",
      sequence: 7,
      sessionId: "session-mcp",
      threadId: "thread-mcp",
      turnId: "turn-mcp",
      toolCallId: "tool-call-mcp",
      actionId: "request-mcp-1",
      owner: "action",
      scope: "action_request",
      surface: "hitl",
      control: "answer",
      runtimeStatus: "needs_input",
    },
  );
  assert.equal(event?.payload?.actionType, "elicitation");
  assert.equal(event?.payload?.serverName, "codex_apps");
  assert.deepEqual(event?.payload?.schemaPropertyNames, ["confirmed"]);
});

test("OpenAI form elicitation fails closed without initiating client capability", () => {
  const event = buildCodexMcpElicitationRequiredEvent({
    requestId: "request-openai-form",
    params: openAiFormParams(),
    clientCapabilities: {
      mcp_server_openai_form_elicitation: false,
    },
  });

  assert.equal(event?.phase, "failed");
  assert.equal(event?.control, "none");
  assert.equal(event?.runtimeStatus, "failed");
  assert.equal(event?.payload?.capabilityRequired, true);
  assert.equal(event?.payload?.capabilitySatisfied, false);
  assert.deepEqual(
    event?.payload?.validationIssues.map((item) => item.code),
    ["missing_client_capability"],
  );
});

test("OpenAI form accepted response records structured content keys and expects resume", () => {
  const event = buildCodexMcpElicitationResolvedEvent(
    {
      requestId: "request-openai-form",
      params: openAiFormParams(),
      response: {
        action: "accept",
        content: {
          template: "monthly-review",
        },
        _meta: {
          source: "gui",
        },
      },
      clientCapabilities: {
        mcp_server_openai_form_elicitation: true,
      },
    },
    {
      sessionId: "session-mcp",
      timestamp: "2026-07-09T00:00:01.000Z",
    },
  );

  assert.deepEqual(
    {
      type: event?.type,
      sourceType: event?.sourceType,
      actionId: event?.actionId,
      threadId: event?.threadId,
      turnId: event?.turnId,
      phase: event?.phase,
      control: event?.control,
      runtimeStatus: event?.runtimeStatus,
    },
    {
      type: "action.resolved",
      sourceType: "mcp_elicitation_resolved_projection",
      actionId: "request-openai-form",
      threadId: "thread-mcp",
      turnId: "turn-mcp",
      phase: "completed",
      control: "answer",
      runtimeStatus: "completed",
    },
  );
  assert.equal(event?.payload?.responseAction, "accept");
  assert.equal(event?.payload?.resumeExpected, true);
  assert.deepEqual(event?.payload?.contentKeys, ["template"]);
  assert.deepEqual(event?.payload?.metaKeys, ["source"]);
});

test("accepted MCP elicitation response without structured content fails closed", () => {
  const event = buildCodexMcpElicitationResolvedEvent({
    requestId: "request-empty-accept",
    params: standardFormParams(),
    response: {
      action: "accept",
      content: null,
      _meta: null,
    },
  });

  assert.equal(event?.phase, "failed");
  assert.equal(event?.runtimeStatus, "failed");
  assert.equal(event?.payload?.resumeExpected, false);
  assert.deepEqual(
    event?.payload?.validationIssues.map((item) => item.code),
    ["missing_accept_content"],
  );
});
