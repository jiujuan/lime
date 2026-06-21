import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AgentThreadItem } from "../types";
import {
  createBaseItem,
  createFileArtifactItem,
  mockToolCallItem,
  renderTimeline,
} from "./AgentThreadTimeline.testFixtures";

describe("AgentThreadTimeline", () => {
  it("已完成的单条 reasoning 只显示安全思考入口，不暴露内部正文预览", () => {
    const container = renderTimeline([
      {
        ...createBaseItem("reasoning-safe-summary", 1),
        type: "reasoning",
        text: "我们被要求先分析用户反馈，再给出修复方案。",
        summary: ["我们被要求先分析用户反馈，再给出修复方案。"],
      },
    ]);

    expect(container.textContent).toContain("已完成思考");
    expect(container.textContent).not.toContain("我们被要求先分析");
    expect(
      container.querySelector(
        '[data-testid="agent-thread-block:1:process:details"]',
      ),
    ).toBeNull();
  });
  it("已完成 reasoning 不应把模型自述型思考作为摘要露出", () => {
    const container = renderTimeline([
      {
        ...createBaseItem("reasoning-provider-summary", 1),
        type: "reasoning",
        text: "好的，用户问的是“首字前为什么要尽快显示思考状态？”。我需要用简洁的三句话来直接解释这个原因，避免展开复杂流程。",
        summary: [
          "好的，用户问的是“首字前为什么要尽快显示思考状态？”。我需要用简洁的三句话来直接解释这个原因，避免展开复杂流程。",
        ],
      },
    ]);

    expect(container.textContent).toContain("已完成思考");
    expect(container.textContent).not.toContain("用户问的是");
    expect(container.textContent).not.toContain("我需要用");
  });
  it("默认直接渲染内联时间线，不再显示旧摘要壳", () => {
    const items: AgentThreadItem[] = [
      {
        ...createBaseItem("summary-1", 1),
        type: "turn_summary",
        text: "已完成页面检查\n可以继续执行发布。",
      },
      {
        ...createBaseItem("browser-1", 2),
        type: "tool_call",
        tool_name: "browser_navigate",
        arguments: { url: "https://mp.weixin.qq.com" },
      },
      {
        ...createBaseItem("approval-1", 3),
        type: "approval_request",
        request_id: "req-1",
        action_type: "tool_confirmation",
        prompt: "请确认是否发布文章",
        tool_name: "browser_click",
      },
    ];

    const container = renderTimeline(items, { isCurrentTurn: true });

    expect(
      container.querySelector('[data-testid="agent-thread-flow"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-overview"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-summary-shell"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-details-toggle"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-goal"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-focus"]'),
    ).toBeNull();
    expect(container.textContent).toContain("已完成页面检查");
    expect(container.textContent).toContain("打开了 https://mp.weixin.qq.com");
    expect(container.textContent).toContain("请确认是否发布文章");
  });
  it("file_artifact 命中多个 block 时应提供精确跳转按钮", async () => {
    const onOpenArtifactFromTimeline = vi.fn();
    const container = renderTimeline([createFileArtifactItem()], {
      onOpenArtifactFromTimeline,
    });

    const heroJumpButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("定位到 摘要"));
    expect(heroJumpButton).not.toBeUndefined();

    await act(async () => {
      heroJumpButton?.click();
      await Promise.resolve();
    });

    expect(onOpenArtifactFromTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        timelineItemId: "artifact-1",
        filePath: "exports/x-article-export/google/index.md",
        blockId: "hero-1",
        openMode: "artifact_review",
      }),
    );
  });
  it("单个普通 file_artifact 应渲染为文件附件卡并打开真实内容", async () => {
    const onOpenArtifactFromTimeline = vi.fn();
    const container = renderTimeline(
      [
        createFileArtifactItem({
          path: "internal/roadmap/db/README.md",
          content: "# Lime DB\n\nAgent durable log owns runtime transcript",
          metadata: {},
        }),
      ],
      { onOpenArtifactFromTimeline },
    );

    expect(
      container.querySelector('[data-testid="timeline-file-attachment-card"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("README.md");
    expect(container.textContent).toContain("文档 · MD");
    expect(container.textContent).toContain("打开文件");
    expect(container.textContent).not.toContain("打开方式");
    expect(
      container.querySelector('[data-testid="timeline-file-artifact-card"]'),
    ).toBeNull();

    const openButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("打开文件"));

    await act(async () => {
      openButton?.click();
      await Promise.resolve();
    });

    expect(onOpenArtifactFromTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        timelineItemId: "artifact-1",
        filePath: "internal/roadmap/db/README.md",
        content: "# Lime DB\n\nAgent durable log owns runtime transcript",
        openMode: "file_preview",
      }),
    );
  });
  it("多个 file_artifact 应聚合成一个文件变更框", async () => {
    const onOpenArtifactFromTimeline = vi.fn();
    const container = renderTimeline([
      createFileArtifactItem({
        path: "workspace/index.md",
        content: "# Index\n\n主文档内容",
        metadata: {
          file_change: {
            path: "workspace/index.md",
            kind: "update",
            lines_added: 4,
            lines_removed: 2,
          },
        },
      }),
      createFileArtifactItem({
        ...createBaseItem("artifact-2", 2),
        path: "workspace/Agents.md",
        content: "# Agents\n\n协作说明",
        metadata: {
          file_change: {
            path: "workspace/Agents.md",
            kind: "add",
            lines_added: 3,
            lines_removed: 0,
          },
        },
      }),
    ], { onOpenArtifactFromTimeline });

    expect(
      container.querySelector('[data-testid="agent-thread-block:1:artifact"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="agent-thread-block:1:artifact:shell"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="timeline-file-artifact-group"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="file-changes-summary-card"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("已编辑 2 个文件");
    expect(container.textContent).toContain("+7");
    expect(container.textContent).toContain("-2");
    expect(
      container.querySelectorAll('[data-testid="timeline-file-artifact-card"]'),
    ).toHaveLength(0);
    expect(container.textContent).not.toContain("产出了 index.md");
    expect(container.textContent).not.toContain("产出了 Agents.md");

    const rows = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="file-changes-summary-file-row"]',
    );
    expect(rows).toHaveLength(2);

    await act(async () => {
      rows[0]?.click();
      await Promise.resolve();
    });

    expect(onOpenArtifactFromTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        timelineItemId: "artifact-1",
        filePath: "workspace/index.md",
        content: "# Index\n\n主文档内容",
        openMode: "file_preview",
      }),
    );
  });
  it("时间线 Markdown 产物应透传保存到项目资料回调", () => {
    const onSaveFileArtifactAsKnowledge = vi.fn();
    const content =
      "# 谢晶营销文案包 v1.0\n\n## 视频号口播\n这是一份可以保存到项目资料的 Document 产物，后续对话可以继续复用。";
    const container = renderTimeline(
      [
        createFileArtifactItem({
          path: "outputs/谢晶_营销文案包_KnowledgeV2_E2E.md",
          source: "tool_result",
          content,
          metadata: {
            artifactTitle: "谢晶营销文案包 v1.0",
          },
        }),
      ],
      {
        sourceMessageId: "assistant-message-1",
        onSaveFileArtifactAsKnowledge,
      },
    );

    expect(
      container.querySelector('[data-testid="timeline-file-attachment-card"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      "谢晶_营销文案包_KnowledgeV2_E2E.md",
    );
    expect(container.textContent).toContain("文档 · MD");
    expect(container.textContent).toContain("打开文件");
    expect(container.textContent).not.toContain("打开方式");

    const saveButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("保存这份文档"));

    expect(saveButton).not.toBeUndefined();

    act(() => {
      saveButton?.click();
    });

    expect(onSaveFileArtifactAsKnowledge).toHaveBeenCalledWith({
      messageId: "assistant-message-1",
      content,
      sourceName: "谢晶_营销文案包_KnowledgeV2_E2E.md",
      description: "谢晶营销文案包 v1.0",
    });
  });
  it("不应把 .lime/tasks 下的内部任务快照 JSON 渲染到时间线里", () => {
    const container = renderTimeline([
      createFileArtifactItem({
        id: "artifact-hidden-task-json",
        path: ".lime/tasks/image_generate/task-image-1.json",
        content: '{"status":"running"}',
        metadata: {},
      }),
    ]);

    expect(
      container.querySelector('[data-testid="timeline-file-artifact-card"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("task-image-1.json");
  });
  it("未适配的历史运行记录不应在时间线摊开原始 JSON", () => {
    const unsupportedItem = {
      ...createBaseItem("unsupported-runtime-item", 1),
      type: "runtime_protocol_diagnostic",
      status: "completed",
      metadata: {
        request_metadata: {
          query: "整理今天新闻",
          diagnostics: { transport: "jsonrpc" },
        },
        raw_payload: {
          jsonrpc: "2.0",
          method: "agentSession/turn/start",
        },
      },
    } as unknown as AgentThreadItem;

    const container = renderTimeline([unsupportedItem]);

    expect(container.textContent).toContain("记录了 runtime_protocol_diagnostic");
    expect(container.textContent).toContain("已隐藏底层协议详情");
    expect(container.textContent).not.toContain("request_metadata");
    expect(container.textContent).not.toContain("raw_payload");
    expect(container.textContent).not.toContain("jsonrpc");
    expect(container.textContent).not.toContain("agentSession/turn/start");
  });
  it("收到 timeline 聚焦请求时应自动展开并高亮目标项", () => {
    const container = renderTimeline(
      [
        {
          ...createBaseItem("browser-1", 1),
          type: "tool_call",
          tool_name: "browser_click",
          arguments: { selector: "#publish" },
        },
      ],
      {
        turn: {
          status: "completed",
        },
        focusedItemId: "browser-1",
        focusRequestKey: 1,
      },
    );

    const block = container.querySelector<HTMLDetailsElement>(
      '[data-testid="agent-thread-block:1:process"]',
    );
    const focusedEntry = container.querySelector<HTMLElement>(
      '[data-thread-item-id="browser-1"]',
    );

    expect(block).not.toBeNull();
    expect(focusedEntry?.className).toContain("ring-2");
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
  it("应向时间线内的工具明细透传已保存站点内容打开回调", () => {
    const onOpenSavedSiteContent = vi.fn();
    renderTimeline(
      [
        {
          ...createBaseItem("site-tool-1", 1),
          type: "tool_call",
          tool_name: "lime_site_run",
          arguments: { adapter_name: "github/search" },
          output: "ok",
          metadata: {
            tool_family: "site",
            saved_content: {
              content_id: "content-1",
              project_id: "project-1",
              title: "GitHub 搜索结果",
            },
          },
        },
      ],
      { onOpenSavedSiteContent },
    );

    expect(mockToolCallItem).toHaveBeenCalledWith(
      expect.objectContaining({ onOpenSavedSiteContent }),
    );
  });
  it("旧历史单步工具应先只渲染摘要，展开后再物化工具明细", () => {
    const onOpenSavedSiteContent = vi.fn();
    const container = renderTimeline(
      [
        {
          ...createBaseItem("site-tool-1", 1),
          type: "tool_call",
          tool_name: "lime_site_run",
          arguments: { adapter_name: "github/search" },
          output: "ok",
          metadata: {
            tool_family: "site",
            saved_content: {
              content_id: "content-1",
              project_id: "project-1",
              title: "GitHub 搜索结果",
            },
          },
        },
      ],
      {
        deferCompletedSingleDetails: true,
        onOpenSavedSiteContent,
      },
    );

    const block = container.querySelector<HTMLDetailsElement>(
      '[data-testid="agent-thread-block:1:process"]',
    );
    const summary = block?.querySelector("summary");

    expect(block).not.toBeNull();
    expect(block?.open).toBe(false);
    expect(mockToolCallItem).not.toHaveBeenCalled();

    act(() => {
      summary?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockToolCallItem).toHaveBeenCalledWith(
      expect.objectContaining({ onOpenSavedSiteContent }),
    );
  });
  it("ToolSearch 历史项应只在主流程展示工具入口摘要，不泄露结果 JSON", () => {
    const container = renderTimeline(
      [
        {
          ...createBaseItem("tool-search-1", 1),
          type: "tool_call",
          tool_name: "ToolSearch",
          arguments: { query: "select:WebSearch" },
          output: JSON.stringify({
            query: "select:WebSearch",
            caller: "assistant",
            count: 1,
            notes: [
              "已找到可直接调用的工具。下一步请直接调用 tools[*].call_name；不要继续用 ToolSearch 排查同一能力。",
            ],
            tools: [
              {
                name: "WebSearch",
                source: "native_registry",
                description: "Search the web",
                callable: true,
                call_name: "WebSearch",
                activation: null,
              },
            ],
          }),
        },
      ],
      { deferCompletedSingleDetails: true },
    );

    expect(container.textContent).toContain("已确认可用工具 1 个 · 搜索网页");
    expect(container.textContent).not.toContain('"caller"');
    expect(container.textContent).not.toContain('"tools"');
    expect(container.textContent).not.toContain('"call_name"');
    expect(container.textContent).not.toContain("Search the web");
    expect(container.textContent).not.toContain("已搜索 可用工具");
    expect(mockToolCallItem).not.toHaveBeenCalled();
  });
  it("审批项与技术项都应直接落在消息流中", () => {
    const items: AgentThreadItem[] = [
      {
        ...createBaseItem("approval-1", 1),
        type: "approval_request",
        request_id: "req-1",
        action_type: "tool_confirmation",
        prompt: "请确认是否继续",
        tool_name: "browser_click",
      },
      {
        ...createBaseItem("other-1", 2),
        type: "tool_call",
        tool_name: "workspace_sync",
      },
    ];

    const container = renderTimeline(items);
    const approvalGroup = container.querySelector<HTMLElement>(
      '[data-testid="agent-thread-block:1:approval"]',
    );
    const otherGroup = container.querySelector<HTMLElement>(
      '[data-testid="agent-thread-block:2:process"]',
    );

    expect(approvalGroup).not.toBeNull();
    expect(otherGroup).not.toBeNull();
    expect(container.textContent).toContain("请确认是否继续");
    expect(container.textContent).toContain("workspace_sync");
  });
});
