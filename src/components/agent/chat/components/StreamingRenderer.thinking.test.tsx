import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { mockMarkdownRenderer } from "./StreamingRenderer.testMocks";
import {
  installStreamingRendererTestHarness,
  renderStreamingRendererHarness as renderHarness,
} from "./StreamingRenderer.testHarness";

installStreamingRendererTestHarness();

describe("StreamingRenderer thinking and status", () => {
  it("抑制过程流时，非交错模式不应重复渲染思考、工具和确认卡", () => {
    const { container } = renderHarness({
      content: "最终回答内容",
      thinkingContent: "这段思考应由 timeline 承载",
      toolCalls: [
        {
          id: "tool-suppressed-fallback",
          name: "functions.exec_command",
          arguments: JSON.stringify({ cmd: "rg -n duplicate src" }),
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-03-28T12:10:00.000Z"),
          endTime: new Date("2026-03-28T12:10:01.000Z"),
        },
      ],
      actionRequests: [
        {
          requestId: "req-suppressed-fallback",
          actionType: "tool_confirmation",
          status: "pending",
          prompt: "请确认是否继续",
        },
      ],
      onPermissionResponse: vi.fn(),
      suppressProcessFlow: true,
    });

    expect(
      container.querySelector('[data-testid="streaming-process-group"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
    expect(container.textContent).toContain("最终回答内容");
  });

  it("抑制过程流时，交错模式只保留正文片段", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "这段思考应由 timeline 渲染",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-suppressed-interleaved",
            name: "functions.exec_command",
            arguments: JSON.stringify({ cmd: "sed -n '1,80p' src/app.tsx" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-03-28T12:12:00.000Z"),
            endTime: new Date("2026-03-28T12:12:01.000Z"),
          },
        },
        {
          type: "action_required",
          actionRequired: {
            requestId: "req-suppressed-interleaved",
            actionType: "tool_confirmation",
            status: "pending",
            prompt: "请确认是否继续",
          },
        },
        {
          type: "text",
          text: "这里只保留最终正文。",
        },
      ],
      onPermissionResponse: vi.fn(),
      suppressProcessFlow: true,
    });

    expect(
      container.querySelector('[data-testid="streaming-process-group"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
    expect(container.textContent).toContain("这里只保留最终正文。");
  });

  it("等待首个事件时不应再把 agent 运行状态插入正文顶部", () => {
    const { container } = renderHarness({
      content: "",
      isStreaming: true,
      runtimeStatus: {
        phase: "preparing",
        title: "正在准备处理",
        detail: "正在理解请求并准备当前阶段。",
        checkpoints: ["对话优先执行", "等待首个事件"],
      },
      showRuntimeStatusInline: true,
    });

    expect(
      container.querySelector('[data-testid="agent-runtime-status"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("正在准备处理");
  });

  it("高风险服务进入稳妥顺序处理时，正文顶部不应再出现运行态卡", () => {
    const { container } = renderHarness({
      content: "",
      isStreaming: true,
      runtimeStatus: {
        phase: "routing",
        title: "当前服务较忙，稍后开始处理",
        detail:
          "当前服务在同时处理过多请求时容易直接失败，系统已切换为更稳妥的顺序处理。",
        checkpoints: ["当前服务仅同时处理 1 条此类请求"],
        metadata: {
          concurrency_scope: "provider_global",
          concurrency_phase: "queued",
          retryable_overload: true,
        },
      },
      showRuntimeStatusInline: true,
    });

    expect(
      container.querySelector('[data-testid="agent-runtime-status"]'),
    ).toBeNull();
  });

  it("正文已经开始输出后，不应再在正文区域重复渲染运行态", () => {
    const { container } = renderHarness({
      content: "我来帮你先打开 GitHub 搜索页。",
      isStreaming: true,
      runtimeStatus: {
        phase: "routing",
        title: "正在搜索 GitHub",
        detail: "已经打开搜索页，准备补充筛选条件。",
        checkpoints: ["浏览器已就绪", "准备应用最近更新时间筛选"],
      },
      showRuntimeStatusInline: true,
    });

    expect(
      container.querySelector('[data-testid="agent-runtime-status"]'),
    ).toBeNull();
  });

  it("交错内容模式下也不应在正文区域渲染运行态卡", () => {
    const { container } = renderHarness({
      content: "",
      isStreaming: true,
      runtimeStatus: {
        phase: "context",
        title: "正在整理搜索结果",
        detail: "已拿到页面内容，正在提取最近一个月更新的仓库。",
        checkpoints: ["页面内容已获取"],
      },
      showRuntimeStatusInline: true,
      contentParts: [
        {
          type: "text",
          text: "我已经打开 GitHub 搜索页，接下来开始筛选结果。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-runtime-status-inline",
            name: "browser_snapshot",
            arguments: JSON.stringify({ page: "github-search" }),
            status: "running",
            result: undefined,
            startTime: new Date("2026-03-30T12:00:00.000Z"),
          },
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-runtime-status"]'),
    ).toBeNull();
  });

  it("已取消的运行状态也不应在正文顶部额外渲染状态卡", () => {
    const { container } = renderHarness({
      content: "",
      isStreaming: true,
      runtimeStatus: {
        phase: "cancelled",
        title: "图片任务已取消",
        detail: "任务已停止，不会继续生成新的图片结果。",
        checkpoints: ["已保留当前任务记录", "可在图片画布重新生成"],
      },
      showRuntimeStatusInline: true,
    });

    expect(
      container.querySelector('[data-testid="agent-runtime-status"]'),
    ).toBeNull();
  });

  it("思考内容进入流式阶段后应展开，完成后自动折叠", () => {
    const { container, rerender } = renderHarness({
      content: "",
      thinkingContent: "第一步：分析问题",
      isStreaming: false,
    });

    const initialDetails = container.querySelector("details");
    expect(initialDetails).toBeTruthy();
    expect((initialDetails as HTMLDetailsElement).open).toBe(false);

    rerender({
      content: "",
      thinkingContent: "第一步：分析问题\n第二步：调用工具",
      isStreaming: true,
    });

    const streamingDetails = container.querySelector("details");
    expect(streamingDetails).toBeTruthy();
    expect((streamingDetails as HTMLDetailsElement).open).toBe(true);
    expect(container.textContent).toContain("思考中");
    expect(container.textContent).toContain("第二步：调用工具");

    rerender({
      content: "",
      thinkingContent: "第一步：分析问题\n第二步：调用工具",
      isStreaming: false,
    });

    const completedDetails = container.querySelector("details");
    expect(completedDetails).toBeTruthy();
    expect((completedDetails as HTMLDetailsElement).open).toBe(false);
    expect(container.textContent).toContain("已完成思考");
    expect(container.textContent).not.toContain("第二步：调用工具");
  });

  it("思考块应使用统一状态标签，并在完成态保留首行摘要", () => {
    const { container, rerender } = renderHarness({
      content: "",
      thinkingContent: "先生成一版草稿\n- 再根据反馈快速迭代",
      isStreaming: false,
    });

    expect(container.textContent).toContain("已完成思考");
    expect(container.textContent).toContain("先生成一版草稿");
    expect(container.textContent).not.toContain("思考中");

    rerender({
      content: "",
      thinkingContent: "先生成一版草稿\n- 再根据反馈快速迭代",
      isStreaming: true,
    });

    expect(container.textContent).toContain("思考中");
    expect(container.textContent).toContain("先生成一版草稿");
  });

  it("包含工具的运行中过程组应默认折叠，完成后保持摘要", () => {
    const { container, rerender } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先确认过程组行高\n再和工具行对齐",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-process-group-running",
            name: "functions.exec_command",
            arguments: JSON.stringify({ cmd: "rg -n thinking src" }),
            status: "running",
            startTime: new Date("2026-03-29T08:40:00.000Z"),
          },
        },
      ],
      isStreaming: true,
    });

    const runningProcessGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(runningProcessGroup).not.toBeNull();
    expect(runningProcessGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("先确认过程组行高");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();

    rerender({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先确认过程组行高\n再和工具行对齐",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-process-group-running",
            name: "functions.exec_command",
            arguments: JSON.stringify({ cmd: "rg -n thinking src" }),
            status: "completed",
            startTime: new Date("2026-03-29T08:40:00.000Z"),
            result: { success: true, output: "ok" },
            endTime: new Date("2026-03-29T08:40:01.000Z"),
          },
        },
      ],
      isStreaming: false,
    });

    const completedProcessGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(completedProcessGroup).not.toBeNull();
    expect(completedProcessGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("已运行 1 条命令");
    expect(container.textContent).not.toContain("先确认过程组行高");
  });

  it("内容工作台工具过程组应保持正文前后顺序并隐藏协议细节", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "先把内容工作台任务放在正确位置。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-content-video-1",
            name: "lime_create_video_generation_task",
            arguments: JSON.stringify({ prompt: "产品演示短片" }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                artifact_path: ".lime/tasks/video_generate/demo.json",
              }),
            },
            startTime: new Date("2026-06-03T08:00:00.000Z"),
            endTime: new Date("2026-06-03T08:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-content-audio-1",
            name: "lime_create_audio_generation_task",
            arguments: JSON.stringify({ prompt: "播客旁白" }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                artifact_path: ".lime/tasks/audio_generate/demo.json",
              }),
            },
            startTime: new Date("2026-06-03T08:00:02.000Z"),
            endTime: new Date("2026-06-03T08:00:03.000Z"),
          },
        },
        {
          type: "text",
          text: "内容任务已发起，继续整理最终说明。",
        },
      ],
    });

    const markdownNodes = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-testid="markdown-renderer"]',
      ),
    );
    const introNode = markdownNodes.find((node) =>
      node.textContent?.includes("先把内容工作台任务放在正确位置。"),
    );
    const finalNode = markdownNodes.find((node) =>
      node.textContent?.includes("内容任务已发起，继续整理最终说明。"),
    );
    const processGroup = container.querySelector<HTMLElement>(
      '[data-testid="streaming-process-group"]',
    );

    expect(introNode).not.toBeNull();
    expect(processGroup).not.toBeNull();
    expect(finalNode).not.toBeNull();
    expect(
      introNode!.compareDocumentPosition(processGroup!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      processGroup!.compareDocumentPosition(finalNode!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const groupText = processGroup?.textContent || "";
    expect(groupText).toContain("2");

    const text = container.textContent || "";
    expect(text).not.toContain(".lime/tasks");
    expect(text).not.toContain("artifact_path");
    expect(text).not.toContain("lime_create_video_generation_task");
  });

  it("思考块展开后应压平被切碎成多行的过程 prose", () => {
    const { container } = renderHarness({
      content: "",
      thinkingContent: [
        "目录",
        "",
        "也",
        "",
        "不存在。",
        "",
        "可能",
        "",
        "整个",
        "",
        ".lime",
        "",
        "目录",
        "",
        "都不",
        "",
        "存在。",
      ].join("\n"),
      isStreaming: true,
    });

    const details = container.querySelector("details");
    act(() => {
      if (details) {
        (details as HTMLDetailsElement).open = true;
      }
      details?.dispatchEvent(new Event("toggle", { bubbles: true }));
    });

    expect(mockMarkdownRenderer).toHaveBeenCalled();
    const latestCall =
      mockMarkdownRenderer.mock.calls[mockMarkdownRenderer.mock.calls.length - 1];
    expect(latestCall?.[0]?.content).toBe(
      "目录也不存在。可能整个 .lime 目录都不存在。",
    );
  });

  it("过程组中的思考与工具应默认压缩为摘要", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先确认过程组行高\n再和工具行对齐",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-thinking-inline-style",
            name: "functions.exec_command",
            arguments: JSON.stringify({ cmd: "rg -n thinking src" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-03-29T08:40:00.000Z"),
            endTime: new Date("2026-03-29T08:40:01.000Z"),
          },
        },
      ],
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroup).not.toBeNull();
    expect(processGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("已运行 1 条命令");
    expect(container.textContent).not.toContain("先确认过程组行高");
    expect(
      container.querySelector('[data-testid="thinking-block"]'),
    ).toBeNull();

    act(() => {
      processGroup?.click();
    });

    expect(
      container
        .querySelector('[data-testid="thinking-block"]')
        ?.getAttribute("data-visual-style"),
    ).toBe("grouped-inline");
  });

  it("仅思考过程组应把状态作为外层标题，展开后再显示思考正文", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "**Inspecting folder for details**",
        },
      ],
      isStreaming: false,
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroup).not.toBeNull();
    expect(processGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(processGroup?.textContent).toContain("已完成思考");
    expect(processGroup?.textContent).not.toContain(
      "**Inspecting folder for details**",
    );
    expect(container.textContent).not.toContain(
      "**Inspecting folder for details**",
    );

    act(() => {
      processGroup?.click();
    });

    expect(processGroup?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain(
      "**Inspecting folder for details**",
    );
    expect(
      container
        .querySelector('[data-testid="thinking-block"]')
        ?.getAttribute("data-visual-style"),
    ).toBe("grouped-inline");
  });
});
