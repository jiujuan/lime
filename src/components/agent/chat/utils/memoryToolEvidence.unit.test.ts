import { describe, expect, it } from "vitest";
import type { AgentToolCallState } from "@/lib/api/agentProtocol";
import { changeLimeLocale } from "@/i18n/createI18n";
import { resolveMemoryToolEvidence } from "./memoryToolEvidence";

function toolCall(patch: Partial<AgentToolCallState>): AgentToolCallState {
  return {
    id: "memory-tool-1",
    name: "memory_search",
    status: "completed",
    startTime: new Date("2026-06-19T10:00:00.000Z"),
    ...patch,
  };
}

describe("resolveMemoryToolEvidence", () => {
  it("应从 memory_search metadata 提取命中和分页证据", async () => {
    await changeLimeLocale("zh-CN");

    const evidence = resolveMemoryToolEvidence(
      toolCall({
        result: {
          success: true,
          output: "Found 2 memory hits.",
          metadata: {
            operation: "search",
            hits: [
              { path: "MEMORY.md", matchLineNumber: 4 },
              { path: "rollout_summaries/thread.md", matchLineNumber: 8 },
            ],
            truncated: true,
            nextCursor: "cursor-2",
          },
        },
      }),
    );

    expect(evidence?.operation).toBe("search");
    expect(evidence?.summary).toBe("已搜索记忆，命中 2 条");
    expect(evidence?.lines).toContain("命中 2 条");
    expect(evidence?.lines).toContain("还有更多结果可继续读取");
  });

  it("应从 memory_read citation 提取可见引用", async () => {
    await changeLimeLocale("en-US");

    const evidence = resolveMemoryToolEvidence(
      toolCall({
        name: "memory_read",
        result: {
          success: true,
          output: "Remember the launch tone.",
          metadata: {
            operation: "read",
            path: "MEMORY.md",
            rootScope: "workspace",
            citation: {
              path: "MEMORY.md",
              startLine: 3,
              endLine: 6,
            },
          },
        },
      }),
    );

    expect(evidence?.summary).toBe("Read memory MEMORY.md");
    expect(evidence?.lines).toContain("Scope: workspace");
    expect(evidence?.lines).toContain("Path: MEMORY.md");
    expect(evidence?.lines).toContain("Citation: MEMORY.md:3-6");
  });

  it("缺少 path 时应使用当前语言的记忆库名称", async () => {
    await changeLimeLocale("zh-TW");

    const evidence = resolveMemoryToolEvidence(
      toolCall({
        name: "memory_add_note",
        result: {
          success: true,
          output: "Saved note.",
          metadata: {
            operation: "add_note",
          },
        },
      }),
    );

    expect(evidence?.summary).toBe("已儲存記憶修正到 記憶庫");
    expect(evidence?.summary).not.toContain("memory store");
  });
});
