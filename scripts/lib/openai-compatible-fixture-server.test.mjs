import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_FIXTURE_API_KEY,
  DEFAULT_FIXTURE_MODEL,
  startOpenAiCompatibleFixtureServer,
} from "./openai-compatible-fixture-server.mjs";

const runningServers = [];

const STRUCTURED_OUTPUT_TOOL = {
  type: "function",
  function: {
    name: "StructuredOutput",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

async function startFixture(options) {
  const fixture = await startOpenAiCompatibleFixtureServer(options);
  runningServers.push(fixture);
  return fixture;
}

afterEach(async () => {
  while (runningServers.length > 0) {
    const fixture = runningServers.pop();
    await fixture.close();
  }
});

describe("openai-compatible-fixture-server", () => {
  it("应返回 Direct providerConfig，默认只指向 localhost fixture", async () => {
    const fixture = await startFixture();

    expect(fixture.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(fixture.provider).toEqual({
      providerPreference: "fixture-openai",
      providerName: "openai",
      modelPreference: DEFAULT_FIXTURE_MODEL,
      source: "localhost-fixture",
      providerConfig: {
        provider_id: "fixture-openai",
        provider_name: "openai",
        model_name: DEFAULT_FIXTURE_MODEL,
        api_key: DEFAULT_FIXTURE_API_KEY,
        base_url: fixture.baseUrl,
      },
    });
  });

  it("应支持 OpenAI-compatible streaming chat completions", async () => {
    const fixture = await startFixture({ content: "MO_OK_STREAM" });
    const response = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${DEFAULT_FIXTURE_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_FIXTURE_MODEL,
        messages: [{ role: "user", content: "ping" }],
        stream: true,
      }),
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("MO_OK_STREAM");
    expect(text).toContain("data: [DONE]");
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/chat/completions",
      authorization: `Bearer ${DEFAULT_FIXTURE_API_KEY}`,
    });
    expect(fixture.requests[0].body.stream).toBe(true);
  });

  it("应支持非 streaming JSON chat completions，方便后续 smoke 复用", async () => {
    const fixture = await startFixture({ content: "MO_OK_JSON" });
    const response = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: DEFAULT_FIXTURE_MODEL,
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    expect(response.ok).toBe(true);
    const payload = await response.json();
    expect(payload.choices[0].message.content).toBe("MO_OK_JSON");
    expect(payload.usage.total_tokens).toBe(2);
  });

  it("应在请求 StructuredOutput 工具时返回非 streaming tool call", async () => {
    const fixture = await startFixture();
    const response = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: DEFAULT_FIXTURE_MODEL,
        messages: [{ role: "user", content: "draft artifact" }],
        tools: [STRUCTURED_OUTPUT_TOOL],
      }),
    });

    expect(response.ok).toBe(true);
    const payload = await response.json();
    const choice = payload.choices[0];
    const toolCall = choice.message.tool_calls[0];
    const argumentsPayload = JSON.parse(toolCall.function.arguments);

    expect(choice.finish_reason).toBe("tool_calls");
    expect(choice.message.content).toBeNull();
    expect(toolCall.type).toBe("function");
    expect(toolCall.function.name).toBe("StructuredOutput");
    expect(argumentsPayload).toMatchObject({
      type: "artifact_document_draft",
      document: {
        schemaVersion: "artifact_document.v1",
        kind: "report",
        title: "Managed Objective Automation Smoke Report",
        status: "ready",
        language: "zh-CN",
      },
    });
    expect(argumentsPayload.document.blocks[0]).toMatchObject({
      id: "summary",
      type: "rich_text",
    });
    expect(argumentsPayload.document.sources[0]).toMatchObject({
      id: "localhost-fixture",
      type: "tool",
      label: "localhost OpenAI-compatible fixture",
      reliability: "primary",
    });
  });

  it("应在请求 StructuredOutput 工具时返回 streaming tool call SSE", async () => {
    const fixture = await startFixture();
    const response = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: DEFAULT_FIXTURE_MODEL,
        messages: [{ role: "user", content: "draft artifact" }],
        tools: [STRUCTURED_OUTPUT_TOOL],
        stream: true,
      }),
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain('"tool_calls"');
    expect(text).toContain('"StructuredOutput"');
    expect(text).toContain('"finish_reason":"tool_calls"');
    expect(text).toContain("data: [DONE]");
  });
});
