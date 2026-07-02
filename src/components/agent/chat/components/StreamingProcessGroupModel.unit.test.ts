import { describe, expect, it } from "vitest";
import type { AgentToolCallState } from "@/lib/api/agentProtocol";
import {
  coalesceAdjacentThinkingProcessEntries,
  shouldSplitProcessBeforeEntry,
  shouldAutoExpandProcessEntries,
  type StreamingProcessEntry,
} from "./StreamingProcessGroupModel";

function toolCall(patch: Partial<AgentToolCallState> = {}): AgentToolCallState {
  return {
    id: patch.id ?? "tool-1",
    name: patch.name ?? "skill",
    arguments: patch.arguments ?? "{}",
    status: patch.status ?? "completed",
    startTime: patch.startTime ?? new Date("2026-06-22T10:00:00.000Z"),
    result: patch.result,
    metadata: patch.metadata,
    ...patch,
  };
}

function toolEntry(tool: AgentToolCallState): StreamingProcessEntry {
  return {
    kind: "tool",
    id: tool.id,
    toolCall: tool,
  };
}

describe("StreamingProcessGroupModel", () => {
  it("相邻 thinking 过程项应合并为同一条过程说明，工具仍作为边界", () => {
    const searchTool = toolEntry(
      toolCall({
        id: "tool-search-boundary",
        name: "web_search",
      }),
    );
    const fetchTool = toolEntry(
      toolCall({
        id: "tool-fetch-boundary",
        name: "WebFetch",
      }),
    );
    const entries: StreamingProcessEntry[] = [
      searchTool,
      {
        kind: "thinking",
        id: "thinking-1",
        text: "用户想",
        defaultExpanded: true,
      },
      {
        kind: "thinking",
        id: "thinking-2",
        text: "了解今天的国际新闻",
        autoCollapseEligible: true,
      },
      fetchTool,
    ];

    expect(coalesceAdjacentThinkingProcessEntries(entries)).toEqual([
      searchTool,
      {
        kind: "thinking",
        id: "thinking-1",
        text: "用户想了解今天的国际新闻",
        defaultExpanded: true,
        isActive: undefined,
        autoCollapseEligible: true,
        preserveSourceText: undefined,
        metadata: undefined,
      },
      fetchTool,
    ]);
  });

  it("没有相邻 thinking 过程项时保持原数组引用", () => {
    const entries: StreamingProcessEntry[] = [
      {
        kind: "thinking",
        id: "thinking-1",
        text: "先搜索来源。",
      },
      toolEntry(
        toolCall({
          id: "tool-search-boundary",
          name: "web_search",
        }),
      ),
      {
        kind: "thinking",
        id: "thinking-2",
        text: "再读取页面。",
      },
    ];

    expect(coalesceAdjacentThinkingProcessEntries(entries)).toBe(entries);
  });

  it("消息仍在输出时，completed Skill 过程不应提前折叠", () => {
    expect(
      shouldAutoExpandProcessEntries(
        [
          toolEntry(
            toolCall({
              status: "completed",
              metadata: {
                tool_family: "skill",
                skill_name: "capability-report",
              },
            }),
          ),
        ],
        true,
      ),
    ).toBe(true);
  });

  it("消息完成后，completed Skill 过程应回到折叠摘要", () => {
    expect(
      shouldAutoExpandProcessEntries(
        [
          toolEntry(
            toolCall({
              status: "completed",
              metadata: {
                tool_family: "skill",
                skill_name: "capability-report",
              },
            }),
          ),
        ],
        false,
      ),
    ).toBe(false);
  });

  it("普通命令不默认展开详情，避免实时 raw 输出切开正文", () => {
    expect(
      shouldAutoExpandProcessEntries(
        [
          toolEntry(
            toolCall({
              name: "Bash",
              status: "running",
              result: {
                success: true,
                output: "raw streaming output",
              },
            }),
          ),
        ],
        true,
      ),
    ).toBe(false);
  });

  it("纯 thinking 遇到 WebSearch 时应拆成独立检索过程", () => {
    expect(
      shouldSplitProcessBeforeEntry(
        [
          {
            kind: "thinking",
            id: "thinking-before-web",
            text: "Searching for current sources.",
          },
        ],
        toolEntry(
          toolCall({
            id: "tool-web-search",
            name: "WebSearch",
          }),
        ),
      ),
    ).toBe(true);
  });

  it("WebSearch 后出现 thinking 时可保留在当前检索过程说明内", () => {
    expect(
      shouldSplitProcessBeforeEntry(
        [
          toolEntry(
            toolCall({
              id: "tool-web-search",
              name: "WebSearch",
            }),
          ),
        ],
        {
          kind: "thinking",
          id: "thinking-after-web",
          text: "继续核验来源。",
        },
      ),
    ).toBe(false);
  });

  it("WebFetch 只应作为已有检索链的伴随步骤，不应并入普通工具过程", () => {
    expect(
      shouldSplitProcessBeforeEntry(
        [
          toolEntry(
            toolCall({
              id: "tool-skill-before-fetch",
              name: "Skill",
            }),
          ),
        ],
        toolEntry(
          toolCall({
            id: "tool-web-fetch",
            name: "WebFetch",
          }),
        ),
      ),
    ).toBe(true);

    expect(
      shouldSplitProcessBeforeEntry(
        [
          toolEntry(
            toolCall({
              id: "tool-web-search",
              name: "WebSearch",
            }),
          ),
          {
            kind: "thinking",
            id: "thinking-between-search-fetch",
            text: "读取最相关来源。",
          },
        ],
        toolEntry(
          toolCall({
            id: "tool-web-fetch-after-search",
            name: "WebFetch",
          }),
        ),
      ),
    ).toBe(false);
  });

  it("连续失败的 WebSearch 应保持同一批次，避免诊断详情铺满对话", () => {
    expect(
      shouldSplitProcessBeforeEntry(
        [
          toolEntry(
            toolCall({
              id: "tool-web-search-failed-1",
              name: "web_search",
              status: "failed",
            }),
          ),
        ],
        toolEntry(
          toolCall({
            id: "tool-web-search-failed-2",
            name: "web_search",
            status: "failed",
          }),
        ),
      ),
    ).toBe(false);

    expect(
      shouldSplitProcessBeforeEntry(
        [
          toolEntry(
            toolCall({
              id: "tool-web-search-completed-1",
              name: "web_search",
              status: "completed",
            }),
          ),
        ],
        toolEntry(
          toolCall({
            id: "tool-web-search-completed-2",
            name: "web_search",
            status: "completed",
          }),
        ),
      ),
    ).toBe(true);
  });

  it("WebFetch 后出现新的 WebSearch 时应开启下一组检索过程", () => {
    expect(
      shouldSplitProcessBeforeEntry(
        [
          toolEntry(
            toolCall({
              id: "tool-web-search-before-fetch",
              name: "web_search",
            }),
          ),
          toolEntry(
            toolCall({
              id: "tool-web-fetch-before-next-search",
              name: "WebFetch",
            }),
          ),
        ],
        toolEntry(
          toolCall({
            id: "tool-web-search-next",
            name: "web_search",
          }),
        ),
      ),
    ).toBe(true);
  });

  it("失败 Skill 仍默认折叠，避免错误细节抢占正文", () => {
    expect(
      shouldAutoExpandProcessEntries(
        [
          toolEntry(
            toolCall({
              status: "failed",
              result: {
                success: false,
                output: "",
                error: "failed",
              },
              metadata: {
                tool_family: "skill",
                skill_name: "capability-report",
              },
            }),
          ),
        ],
        true,
      ),
    ).toBe(false);
  });

  it("仍在输出的 thinking 过程应保持展开", () => {
    expect(
      shouldAutoExpandProcessEntries(
        [
          {
            kind: "thinking",
            id: "thinking-1",
            text: "先拆解用户意图，再更新计划。",
            defaultExpanded: true,
            isActive: true,
          },
        ],
        true,
      ),
    ).toBe(true);
  });

  it("已有后续内容的 thinking 过程不强制过程组展开", () => {
    expect(
      shouldAutoExpandProcessEntries(
        [
          {
            kind: "thinking",
            id: "thinking-1",
            text: "先拆解用户意图，再更新计划。",
            defaultExpanded: true,
            autoCollapseEligible: true,
          },
        ],
        true,
      ),
    ).toBe(false);
  });
});
