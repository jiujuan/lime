import { describe, expect, it } from "vitest";

import type { AgentThreadItem } from "../types";
import type { AgentThreadOrderedBlock } from "../utils/agentThreadGrouping";
import {
  buildTimelineBlockRenderPlan,
  resolveTimelineBlockEmphasis,
  resolveVisibleTimelineItems,
} from "./AgentThreadTimelineViewModel";

function baseItem(
  id: string,
  type: AgentThreadItem["type"],
  overrides: Partial<AgentThreadItem> = {},
): AgentThreadItem {
  return {
    id,
    thread_id: "thread-1",
    turn_id: "turn-1",
    sequence: 1,
    status: "completed",
    started_at: "2026-03-15T09:10:00Z",
    updated_at: "2026-03-15T09:10:00Z",
    type,
    ...overrides,
  } as AgentThreadItem;
}

function block(
  overrides: Partial<AgentThreadOrderedBlock>,
): AgentThreadOrderedBlock {
  return {
    id: "block-1",
    kind: "process",
    title: "处理步骤",
    status: "completed",
    items: [],
    previewLines: [],
    countLabel: "",
    rawDetailLabel: "",
    defaultExpanded: false,
    startedAt: "2026-03-15T09:10:00Z",
    ...overrides,
  };
}

const noStructuredPreview = () => false;
const hasStructuredPreview = () => true;

describe("AgentThreadTimelineViewModel", () => {
  it("应过滤用户/assistant 原始消息、权限等待内部错误和隐藏 artifact", () => {
    const visible = resolveVisibleTimelineItems([
      baseItem("user-1", "user_message", { text: "hello" }),
      baseItem("agent-1", "agent_message", { text: "hi" }),
      baseItem("error-1", "error", {
        message:
          "运行时权限声明需要真实确认，当前 turn 已在模型执行前等待用户确认：confirmationStatus=not_requested，askProfileKeys=web_search。已创建真实权限确认请求；请确认后重试或恢复本轮执行。",
      }),
      baseItem("artifact-hidden", "file_artifact", {
        path: ".lime/tasks/image_generate/task-image-1.json",
        content: "{}",
      }),
      baseItem("tool-1", "tool_call", {
        tool_name: "bash",
        arguments: { command: "pwd" },
      }),
    ]);

    expect(visible.map((item) => item.id)).toEqual(["tool-1"]);
  });

  it("应为 focused、active 和 completed block 生成稳定 emphasis", () => {
    const completedBlock = block({
      status: "completed",
      items: [baseItem("item-1", "tool_call", { tool_name: "bash" })],
    });

    expect(
      resolveTimelineBlockEmphasis({
        block: completedBlock,
        index: 0,
        activeBlockIndex: -1,
      }),
    ).toBe("quiet");
    expect(
      resolveTimelineBlockEmphasis({
        block: completedBlock,
        index: 0,
        activeBlockIndex: 0,
      }),
    ).toBe("active");
    expect(
      resolveTimelineBlockEmphasis({
        block: completedBlock,
        index: 0,
        activeBlockIndex: -1,
        focusedItemId: "item-1",
      }),
    ).toBe("active");
    expect(
      resolveTimelineBlockEmphasis({
        block: block({ status: "in_progress" }),
        index: 1,
        activeBlockIndex: -1,
      }),
    ).toBe("default");
  });

  it("应让历史完成单条 reasoning 默认只显示摘要壳，结构化 reasoning 则 inline 展示", () => {
    const reasoningBlock = block({
      items: [
        baseItem("reasoning-1", "reasoning", {
          text: "内部推理正文",
          summary: ["已完成思考"],
        }),
      ],
    });

    expect(
      buildTimelineBlockRenderPlan({
        block: reasoningBlock,
        isExpanded: false,
        preferInlineDetails: false,
        deferCompletedSingleDetails: true,
        hasStructuredThinkingInlinePreview: noStructuredPreview,
      }),
    ).toMatchObject({
      isThinkingOnlyBlock: true,
      shouldSummarizeSingleThinkingInline: true,
      shouldRenderSingleItemInline: false,
      shouldMaterializeDetailEntries: false,
    });

    expect(
      buildTimelineBlockRenderPlan({
        block: reasoningBlock,
        isExpanded: false,
        preferInlineDetails: false,
        deferCompletedSingleDetails: true,
        hasStructuredThinkingInlinePreview: hasStructuredPreview,
      }),
    ).toMatchObject({
      shouldSummarizeSingleThinkingInline: false,
      shouldRenderSingleItemInline: false,
    });
  });

  it("应让运行中单条 thinking inline 展示，多个 process item 按轻量分组行物化", () => {
    expect(
      buildTimelineBlockRenderPlan({
        block: block({
          status: "in_progress",
          items: [
            baseItem("reasoning-1", "reasoning", {
              status: "in_progress",
              text: "正在思考",
            }),
          ],
        }),
        isExpanded: false,
        preferInlineDetails: false,
        deferCompletedSingleDetails: true,
        hasStructuredThinkingInlinePreview: noStructuredPreview,
      }),
    ).toMatchObject({
      shouldRenderActiveSingleThinkingInline: true,
      shouldRenderSingleItemInline: true,
      shouldMaterializeDetailEntries: false,
    });

    expect(
      buildTimelineBlockRenderPlan({
        block: block({
          kind: "process",
          items: [
            baseItem("tool-1", "tool_call", { tool_name: "bash" }),
            baseItem("tool-2", "tool_call", { tool_name: "web_search" }),
          ],
        }),
        isExpanded: true,
        preferInlineDetails: false,
        deferCompletedSingleDetails: true,
        hasStructuredThinkingInlinePreview: noStructuredPreview,
      }),
    ).toMatchObject({
      shouldRenderGroupedToolRows: true,
      shouldMaterializeDetailEntries: true,
    });
  });

  it("应让多文件 artifact 直接 inline 卡片展示", () => {
    expect(
      buildTimelineBlockRenderPlan({
        block: block({
          kind: "artifact",
          items: [
            baseItem("artifact-1", "file_artifact", {
              path: "workspace/a.md",
              content: "# A",
            }),
            baseItem("artifact-2", "file_artifact", {
              path: "workspace/b.md",
              content: "# B",
            }),
          ],
        }),
        isExpanded: false,
        preferInlineDetails: false,
        deferCompletedSingleDetails: true,
        hasStructuredThinkingInlinePreview: noStructuredPreview,
      }),
    ).toMatchObject({
      shouldRenderArtifactCardsInline: true,
      shouldMaterializeDetailEntries: true,
      shouldRenderSingleItemInline: false,
    });
  });
});
