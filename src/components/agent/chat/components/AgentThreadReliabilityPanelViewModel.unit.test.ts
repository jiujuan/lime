import { describe, expect, it } from "vitest";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import type { AgentThreadTurn } from "../types";
import {
  resolveLatestTurnPrompt,
  resolveRuntimeDecisionReason,
  resolveRuntimeFallbackChain,
  resolveStatShellClassName,
  resolveTeamMemoryShadowKey,
  resolveToneClassName,
  serializeReliabilityClipboardPayload,
} from "./AgentThreadReliabilityPanelViewModel";

function turn(overrides: Pick<AgentThreadTurn, "id" | "prompt_text">): AgentThreadTurn {
  return {
    thread_id: "thread",
    status: "completed",
    started_at: "2026-06-02T00:00:00.000Z",
    created_at: "2026-06-02T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("AgentThreadReliabilityPanelViewModel", () => {
  it("应序列化 Date payload 供诊断剪贴板使用", () => {
    expect(
      serializeReliabilityClipboardPayload({
        at: new Date("2026-04-16T09:12:00Z"),
      }),
    ).toContain('"at": "2026-04-16T09:12:00.000Z"');
  });

  it("应为状态 tone 生成 badge 和统计卡片样式", () => {
    expect(resolveToneClassName("running")).toContain("sky");
    expect(resolveToneClassName("failed")).toContain("rose");
    expect(resolveToneClassName("neutral")).toContain("slate");
    expect(resolveStatShellClassName("waiting")).toContain("amber");
    expect(resolveStatShellClassName("completed")).toContain("emerald");
  });

  it("应按 threadRead、runtimeSummary、routing evidence 优先级解析 fallback chain", () => {
    expect(
      resolveRuntimeFallbackChain(
        {
          fallback_chain: ["thread"],
        } as AgentRuntimeThreadReadModel,
        { fallbackChain: ["evidence"] },
      ),
    ).toEqual(["thread"]);

    expect(
      resolveRuntimeFallbackChain(
        {
          runtime_summary: {
            fallbackChain: ["summary"],
          },
        } as unknown as AgentRuntimeThreadReadModel,
        { fallbackChain: ["evidence"] },
      ),
    ).toEqual(["summary"]);

    expect(resolveRuntimeFallbackChain(null, { fallbackChain: ["evidence"] }))
      .toEqual(["evidence"]);
  });

  it("应按 threadRead、runtimeSummary、routing evidence 优先级解析决策原因", () => {
    expect(
      resolveRuntimeDecisionReason(
        {
          decision_reason: "thread reason",
        } as AgentRuntimeThreadReadModel,
        { decisionReason: "evidence reason" },
      ),
    ).toBe("thread reason");

    expect(
      resolveRuntimeDecisionReason(
        {
          runtime_summary: {
            decisionReason: "summary reason",
          },
        } as unknown as AgentRuntimeThreadReadModel,
        { decisionReason: "evidence reason" },
      ),
    ).toBe("summary reason");

    expect(resolveRuntimeDecisionReason(null, { decisionReason: "evidence" }))
      .toBe("evidence");
  });

  it("应解析当前 turn prompt，缺省时回退最近 turn", () => {
    const turns = [
      turn({ id: "turn-1", prompt_text: "  第一条  " }),
      turn({ id: "turn-2", prompt_text: "第二条" }),
    ];

    expect(resolveLatestTurnPrompt(turns, "turn-1")).toBe("第一条");
    expect(resolveLatestTurnPrompt(turns, "missing")).toBe("第二条");
    expect(resolveLatestTurnPrompt([], "missing")).toBe("");
  });

  it("应构造 team memory shadow 稳定 key", () => {
    expect(resolveTeamMemoryShadowKey(null)).toBe("");
    expect(
      resolveTeamMemoryShadowKey({
        repo_scope: "/workspace",
        entries: [
          {
            key: "team.selection",
            content: "A",
            updated_at: 10,
          },
          {
            key: "team.parent_context",
            content: "B",
            updated_at: 20,
          },
        ],
      }),
    ).toBe("/workspace|team.selection:10|team.parent_context:20");
  });
});
