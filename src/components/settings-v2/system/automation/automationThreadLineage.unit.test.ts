import { describe, expect, it } from "vitest";
import {
  buildAgentTurnAutomationPayload,
  normalizeAutomationThreadLineage,
} from "./automationThreadLineage";

describe("automationThreadLineage", () => {
  it("应归一化显式 session / thread lineage", () => {
    expect(
      normalizeAutomationThreadLineage({
        sessionId: " session-1 ",
        threadId: " thread-1 ",
      }),
    ).toEqual({
      sessionId: "session-1",
      threadId: "thread-1",
    });
  });

  it("缺少 session 或 thread 时不应生成 lineage", () => {
    expect(
      normalizeAutomationThreadLineage({
        sessionId: "session-1",
        threadId: " ",
      }),
    ).toBeNull();
  });

  it("构造 agent_turn payload 时必须写入显式 lineage", () => {
    expect(
      buildAgentTurnAutomationPayload({
        prompt: " 生成摘要 ",
        systemPrompt: "",
        webSearch: false,
        contentId: " content-1 ",
        approvalPolicy: "on-request",
        sandboxPolicy: "read-only",
        requestMetadata: null,
        lineage: {
          sessionId: "session-1",
          threadId: "thread-1",
        },
        missingLineageMessage: "lineage required",
      }),
    ).toEqual({
      kind: "agent_turn",
      prompt: "生成摘要",
      session_id: "session-1",
      thread_id: "thread-1",
      system_prompt: null,
      web_search: false,
      content_id: "content-1",
      approval_policy: "on-request",
      sandbox_policy: "read-only",
      request_metadata: null,
    });
  });

  it("构造 agent_turn payload 时缺少 lineage 应 fail closed", () => {
    expect(() =>
      buildAgentTurnAutomationPayload({
        prompt: "生成摘要",
        webSearch: false,
        lineage: null,
        missingLineageMessage: "lineage required",
      }),
    ).toThrow("lineage required");
  });
});
