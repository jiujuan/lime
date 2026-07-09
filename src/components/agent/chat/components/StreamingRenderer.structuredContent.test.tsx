import { describe, expect, it, vi } from "vitest";

import { parseAIResponseMock } from "./StreamingRenderer.testMocks";
import {
  installStreamingRendererTestHarness,
  renderStreamingRendererHarness as renderHarness,
} from "./StreamingRenderer.testHarness";

installStreamingRendererTestHarness();

describe("StreamingRenderer structured content", () => {
  it("关闭内联 A2UI 时应仅保留普通文本片段", () => {
    parseAIResponseMock.mockReturnValue({
      parts: [
        { type: "text", content: "请先补充以下信息：" },
        { type: "a2ui", content: { type: "form", children: [] } },
      ],
      hasA2UI: true,
      hasWriteFile: false,
      hasPending: false,
    });

    const { container } = renderHarness({
      content: "```a2ui\n{}\n```",
      renderA2UIInline: false,
    });

    expect(container.querySelector('[data-testid="a2ui-card"]')).toBeNull();
    expect(container.textContent).toContain("请先补充以下信息：");
  });

  it("聊天流内联 A2UI 应使用紧凑尺寸", () => {
    parseAIResponseMock.mockReturnValue({
      parts: [
        { type: "text", content: "请先补充以下信息：" },
        { type: "a2ui", content: { type: "form", children: [] } },
      ],
      hasA2UI: true,
      hasWriteFile: false,
      hasPending: false,
    });

    const { container } = renderHarness({
      content: "```a2ui\n{}\n```",
      renderA2UIInline: true,
    });

    const card = container.querySelector('[data-testid="a2ui-card"]');
    expect(card?.getAttribute("data-compact")).toBe("true");
    expect(card?.className).toContain("max-w-[432px]");
  });

  it("历史内联 A2UI 应只读回显并移除提交回调", () => {
    parseAIResponseMock.mockReturnValue({
      parts: [
        {
          type: "a2ui",
          content: {
            id: "history-a2ui",
            root: "root",
            components: [{ id: "root", component: "Text", text: "旧表单" }],
            submitAction: { label: "提交", action: { name: "submit" } },
          },
        },
      ],
      hasA2UI: true,
      hasWriteFile: false,
      hasPending: false,
    });

    const { container } = renderHarness({
      content: "```a2ui\n{}\n```",
      renderA2UIInline: true,
      readOnlyA2UI: true,
    });

    const card = container.querySelector('[data-testid="a2ui-card"]');
    expect(card?.getAttribute("data-preview")).toBe("true");
    expect(card?.getAttribute("data-has-on-submit")).toBe("no");
  });

  it("历史 pending ask_user 应渲染只读 A2UI 回显而不是可提交 DecisionPanel", () => {
    const { container } = renderHarness({
      content: "",
      actionRequests: [
        {
          requestId: "req-history-pending",
          actionType: "ask_user",
          status: "pending",
          prompt: "请选择执行方式",
          questions: [
            {
              question: "请选择执行方式",
              options: [{ label: "直接执行" }, { label: "稍后处理" }],
            },
          ],
        },
      ],
      readOnlyActionRequests: true,
      onPermissionResponse: vi.fn(),
    });

    expect(container.querySelector('[data-testid="a2ui-card"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
  });

  it("pending_write_file 应触发流式 onWriteFile 回调", () => {
    const onWriteFile = vi.fn();
    parseAIResponseMock.mockReturnValue({
      parts: [
        {
          type: "pending_write_file",
          content: "# 草稿\n正在生成中",
          filePath: "notes/live.md",
        },
      ],
      hasA2UI: false,
      hasWriteFile: true,
      hasPending: true,
    });

    const { container } = renderHarness({
      content: '<write_file path="notes/live.md"># 草稿\n正在生成中',
      isStreaming: true,
      onWriteFile,
    });

    expect(
      container.querySelector('[data-testid="streaming-write-file-card"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("正在生成 live.md");
    expect(container.textContent).toContain("生成中");
    expect(container.textContent).toContain("notes/live.md");
    expect(container.textContent).not.toContain("写入notes/live.md");
    expect(onWriteFile).toHaveBeenCalledTimes(1);
    expect(onWriteFile).toHaveBeenCalledWith(
      "# 草稿\n正在生成中",
      "notes/live.md",
      expect.objectContaining({
        source: "message_content",
        status: "streaming",
        metadata: expect.objectContaining({
          writePhase: "streaming",
          lastUpdateSource: "message_content",
          isPartial: true,
        }),
      }),
    );
  });

  it("应将 proposed_plan 片段渲染为独立计划卡片", () => {
    const { container } = renderHarness({
      content:
        "先说明一下\n<proposed_plan>\n- 调研\n- 汇总\n</proposed_plan>\n然后开始执行",
    });

    expect(
      container.querySelector('[data-testid="agent-plan-block"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("完成:- 调研");
    expect(container.textContent).toContain("- 汇总");
    expect(container.textContent).toContain("先说明一下");
    expect(container.textContent).toContain("然后开始执行");
  });

  it("提升为对话内 A2UI 的待处理问答应渲染为可提交卡片，approval 不走消息流提交", () => {
    const { container } = renderHarness({
      content: "",
      actionRequests: [
        {
          requestId: "req-ask-1",
          actionType: "ask_user",
          status: "pending",
          prompt: "请选择执行模式",
          questions: [{ question: "请选择执行模式" }],
        },
        {
          requestId: "req-tool-1",
          actionType: "tool_confirmation",
          status: "pending",
          prompt: "请确认是否继续",
        },
      ],
      promoteActionRequestsToA2UI: true,
      onPermissionResponse: vi.fn(),
    });

    expect(
      container.querySelectorAll('[data-testid="decision-panel"]'),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-testid="a2ui-card"]'),
    ).toHaveLength(1);
    expect(
      container
        .querySelector('[data-testid="a2ui-card"]')
        ?.getAttribute("data-has-on-submit"),
    ).toBe("yes");
  });

  it("已排队的 ask_user 应继续以内联只读 A2UI 卡片回显", () => {
    const { container } = renderHarness({
      content: "",
      actionRequests: [
        {
          requestId: "req-ask-queued",
          actionType: "ask_user",
          status: "queued",
          prompt: "请选择渠道",
          questions: [
            {
              question: "请选择渠道",
              options: [{ label: "小红书" }, { label: "视频号" }],
            },
          ],
          submittedUserData: { answer: "小红书" },
        },
      ],
      promoteActionRequestsToA2UI: true,
      onPermissionResponse: vi.fn(),
    });

    expect(
      container.querySelectorAll('[data-testid="a2ui-card"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
  });

  it("交错内容中的已提交问答应渲染为只读 A2UI 卡片", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "action_required",
          actionRequired: {
            requestId: "req-ask-submitted",
            actionType: "ask_user",
            status: "submitted",
            prompt: "请选择执行模式",
            questions: [
              {
                question: "请选择执行模式",
                options: [{ label: "自动执行" }, { label: "逐步确认" }],
              },
            ],
            submittedUserData: { answer: "自动执行" },
          },
        },
      ],
    });

    expect(
      container.querySelectorAll('[data-testid="a2ui-card"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
  });

  it("交错 action_required 应保留前后正文的 DOM 顺序", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "需要你的决定。",
        },
        {
          type: "action_required",
          actionRequired: {
            requestId: "ask-inline-order",
            actionType: "ask_user",
            status: "pending",
            prompt: "请选择执行方式。",
            questions: [{ question: "请选择执行方式。" }],
          },
        },
        {
          type: "text",
          text: "最终结果如下。",
        },
      ],
      onPermissionResponse: vi.fn(),
    });

    const markdownNodes = container.querySelectorAll(
      '[data-testid="markdown-renderer"]',
    );
    const decisionPanel = container.querySelector(
      '[data-testid="decision-panel"]',
    );

    expect(markdownNodes).toHaveLength(2);
    expect(markdownNodes[0]?.textContent).toContain("需要你的决定");
    expect(markdownNodes[1]?.textContent).toContain("最终结果");
    expect(decisionPanel).not.toBeNull();
    expect(
      markdownNodes[0].compareDocumentPosition(decisionPanel as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      (decisionPanel as Node).compareDocumentPosition(markdownNodes[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("pending tool_confirmation 不应在消息流渲染 DecisionPanel", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "action_required",
          actionRequired: {
            requestId: "approval-inline-hidden",
            actionType: "tool_confirmation",
            status: "pending",
            toolName: "Bash",
            prompt: "允许执行命令吗？",
          },
        },
      ],
      onPermissionResponse: vi.fn(),
    });

    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
    expect(container.querySelector('[data-testid="a2ui-card"]')).toBeNull();
  });

  it("submitted tool_confirmation 应渲染只读 approval record", () => {
    const { container } = renderHarness({
      content: "",
      actionRequests: [
        {
          requestId: "approval-inline-submitted",
          actionType: "tool_confirmation",
          status: "submitted",
          toolName: "browser_control",
          prompt: "允许浏览器访问 example.com 吗？",
          submittedUserData: {
            decision: "decline",
            decision_scope: "turn",
            source: "runtime",
          },
        },
      ],
      onPermissionResponse: vi.fn(),
    });

    expect(
      container.querySelector('[data-testid="timeline-approval-record"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
    const record = container.querySelector<HTMLElement>(
      '[data-testid="timeline-approval-record"]',
    );
    expect(record?.textContent).toContain("browser_control");
    expect(record?.textContent).toContain(
      "agentChat.threadTimeline.approval.record.status.declined",
    );
    expect(record?.textContent).not.toContain(
      "允许浏览器访问 example.com 吗？",
    );
    expect(record?.textContent).not.toContain("来源");
    expect(record?.textContent).not.toContain("范围");
  });

  it("submitted tool_confirmation 在 full-access 策略下不渲染 approval record", () => {
    const { container } = renderHarness({
      content: "",
      actionRequests: [
        {
          requestId: "approval-inline-full-access",
          actionType: "tool_confirmation",
          status: "submitted",
          toolName: "browser_control",
          prompt: "允许浏览器访问 example.com 吗？",
          submittedUserData: {
            decision: "allow_for_session",
            approval_policy: "never",
            sandbox_policy: "danger-full-access",
          },
        },
      ],
      onPermissionResponse: vi.fn(),
    });

    expect(
      container.querySelector('[data-testid="timeline-approval-record"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
  });
});
