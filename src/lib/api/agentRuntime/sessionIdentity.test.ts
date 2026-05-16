import { describe, expect, it } from "vitest";
import { isAuxiliaryAgentSessionId } from "./sessionIdentity";

describe("agentRuntime sessionIdentity", () => {
  it("应把 Knowledge Builder Skill 会话识别为非用户对话", () => {
    expect(
      isAuxiliaryAgentSessionId(
        "knowledge-builder-session-ip-v1-0-20260508T073339Z",
      ),
    ).toBe(true);
  });

  it("应把 Agent App Runtime 会话识别为非用户对话", () => {
    expect(
      isAuxiliaryAgentSessionId(
        "agent-app-runtime-9d21d8bd-3f3d-4d2b-8c8d-9b8a2e4b6b49",
      ),
    ).toBe(true);
  });

  it("普通用户会话不应被隐藏", () => {
    expect(isAuxiliaryAgentSessionId("session-visible")).toBe(false);
  });
});
