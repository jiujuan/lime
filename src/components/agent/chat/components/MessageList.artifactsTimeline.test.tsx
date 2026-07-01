import { describe, expect, it } from "vitest";
import {
  findStreamingRendererCallByContent,
  mockStreamingRenderer,
  mockAgentThreadTimeline,
  render,
} from "./MessageList.testHarness";
import type { Message } from "./MessageList.testHarness";

describe("MessageList artifacts timeline", () => {
  it("正文已承载过程流时，file_artifact 仍应作为尾部补充信息展示", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-inline-artifact",
        role: "assistant",
        content: "结果已经整理好了。",
        timestamp: now,
        contentParts: [
          {
            type: "thinking",
            text: "先整理结果，再把产物路径落盘。",
          },
          {
            type: "text",
            text: "结果已经整理好了。",
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-inline-artifact",
      turns: [
        {
          id: "turn-inline-artifact",
          thread_id: "thread-1",
          prompt_text: "继续整理产物",
          status: "completed",
          started_at: "2026-03-29T13:00:00Z",
          completed_at: "2026-03-29T13:00:03Z",
          created_at: "2026-03-29T13:00:00Z",
          updated_at: "2026-03-29T13:00:03Z",
        },
      ],
      threadItems: [
        {
          id: "item-inline-artifact",
          thread_id: "thread-1",
          turn_id: "turn-inline-artifact",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-29T13:00:01Z",
          completed_at: "2026-03-29T13:00:02Z",
          updated_at: "2026-03-29T13:00:02Z",
          type: "file_artifact",
          path: "notes/agent-summary.md",
          source: "artifact_snapshot",
          content: "# Summary",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).not.toBeNull();
    const pinnedFileTimeline = container.querySelector(
      '[data-testid="assistant-pinned-file-timeline-shell"]',
    );
    const assistantBubble = container.querySelector(
      '[data-message-role="assistant"]',
    );
    const streamingRenderer = container.querySelector(
      '[data-testid="streaming-renderer"]',
    );
    const trailingTimeline = container.querySelector(
      '[data-testid="agent-thread-timeline:trailing"]',
    );

    expect(pinnedFileTimeline).toBeNull();
    expect(assistantBubble).not.toBeNull();
    expect(streamingRenderer).not.toBeNull();
    expect(trailingTimeline).not.toBeNull();
    expect(assistantBubble?.contains(trailingTimeline)).toBe(true);
    expect(
      Boolean(
        streamingRenderer!.compareDocumentPosition(trailingTimeline!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  it("文章产物卡应在对话过程和尾部时间线之后展示", () => {
    const now = new Date();
    const fullArticle =
      "# 公众号文章草稿\n\n这是最终正文，只应在过程结束后作为文章产物预览出现。";
    const messages: Message[] = [
      {
        id: "msg-assistant-article-after-process",
        role: "assistant",
        content: "我先完成检索、分析和编排，再给出文章产物。",
        timestamp: now,
        contentParts: [
          {
            type: "thinking",
            text: "先检索资料，再组织写作结构。",
          },
          {
            type: "text",
            text: "我先完成检索、分析和编排，再给出文章产物。",
          },
        ],
        artifacts: [
          {
            id: "artifact-article-after-process",
            type: "document",
            title: "公众号文章草稿",
            content: fullArticle,
            status: "complete",
            meta: {
              openedFrom: "right_surface_article_workspace",
              articleWorkspace: {
                objectKind: "articleDraft",
              },
              contentFactoryWorkspacePatch: {
                workerEvidence: [
                  {
                    subagents: ["content-researcher", "article-writer"],
                    skillRefs: ["article-research", "article-writing"],
                    researchRounds: [
                      { id: "research-1", title: "主题检索" },
                      { id: "research-2", title: "资料交叉验证" },
                    ],
                    outline: [{ id: "section-1", title: "开场" }],
                    writingPlan: [
                      {
                        id: "plan-research",
                        title: "资料检索",
                        owner: "content-researcher",
                        skillRef: "article-research",
                      },
                      {
                        id: "plan-draft",
                        title: "正文写作",
                        owner: "article-writer",
                        skillRef: "article-writing",
                      },
                    ],
                  },
                ],
              },
            },
            position: { start: 0, end: fullArticle.length },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-article-after-process",
      turns: [
        {
          id: "turn-article-after-process",
          thread_id: "thread-1",
          prompt_text: "写一篇公众号文章",
          status: "completed",
          started_at: "2026-03-29T13:10:00Z",
          completed_at: "2026-03-29T13:10:06Z",
          created_at: "2026-03-29T13:10:00Z",
          updated_at: "2026-03-29T13:10:06Z",
        },
      ],
      threadItems: [
        {
          id: "item-article-process-search",
          thread_id: "thread-1",
          turn_id: "turn-article-after-process",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-29T13:10:01Z",
          completed_at: "2026-03-29T13:10:02Z",
          updated_at: "2026-03-29T13:10:02Z",
          type: "web_search",
          query: "AI 趋势 公众号文章",
          output: "找到 3 条可参考资料。",
        },
        {
          id: "item-article-process-artifact",
          thread_id: "thread-1",
          turn_id: "turn-article-after-process",
          sequence: 2,
          status: "completed",
          started_at: "2026-03-29T13:10:04Z",
          completed_at: "2026-03-29T13:10:05Z",
          updated_at: "2026-03-29T13:10:05Z",
          type: "file_artifact",
          path: "exports/content-factory/process.md",
          source: "artifact_snapshot",
          content: "# 写作过程\n\n已完成资料检索和结构编排。",
        },
      ],
    });

    const streamingRenderer = container.querySelector(
      '[data-testid="streaming-renderer"]',
    );
    const trailingTimeline = container.querySelector(
      '[data-testid="agent-thread-timeline:trailing"]',
    );
    const articleFrame = container.querySelector(
      '[data-testid="article-artifact-frame"]',
    );

    expect(streamingRenderer).not.toBeNull();
    expect(trailingTimeline).not.toBeNull();
    expect(articleFrame).not.toBeNull();
    expect(
      Boolean(
        streamingRenderer!.compareDocumentPosition(articleFrame!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(
      Boolean(
        trailingTimeline!.compareDocumentPosition(articleFrame!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(articleFrame?.textContent).toContain("Document created:");
    expect(articleFrame?.textContent).toContain("Open document");
    expect(articleFrame?.textContent).toContain("公众号文章草稿");
  });

  it("内容工厂文章产物前应展开已完成的搜索工具过程", () => {
    const now = new Date();
    const fullArticle = "# Go 学习文章\n\n这是最终正文。";
    const messages: Message[] = [
      {
        id: "msg-assistant-content-factory-process",
        role: "assistant",
        content: "我会先检索资料，再输出文章草稿。",
        timestamp: now,
        artifacts: [
          {
            id: "artifact-content-factory-article",
            type: "document",
            title: "Go 学习文章",
            content: fullArticle,
            status: "complete",
            meta: {
              openedFrom: "right_surface_article_workspace",
              articleWorkspace: {
                objectKind: "articleDraft",
              },
            },
            position: { start: 0, end: fullArticle.length },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-content-factory-process",
      turns: [
        {
          id: "turn-content-factory-process",
          thread_id: "thread-1",
          prompt_text: "@写文章 写一篇关于 golang 学习的文章",
          status: "completed",
          started_at: "2026-03-29T13:20:00Z",
          completed_at: "2026-03-29T13:20:08Z",
          created_at: "2026-03-29T13:20:00Z",
          updated_at: "2026-03-29T13:20:08Z",
        },
      ],
      threadItems: [
        {
          id: "item-content-factory-search-1",
          thread_id: "thread-1",
          turn_id: "turn-content-factory-process",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-29T13:20:01Z",
          completed_at: "2026-03-29T13:20:02Z",
          updated_at: "2026-03-29T13:20:02Z",
          type: "web_search",
          query: "golang 学习路径",
          output: "找到 3 条可参考资料。",
          metadata: {
            source: "content_factory_search_requests",
            workflowKey: "content_article_workflow",
          },
        },
        {
          id: "item-content-factory-search-2",
          thread_id: "thread-1",
          turn_id: "turn-content-factory-process",
          sequence: 2,
          status: "completed",
          started_at: "2026-03-29T13:20:03Z",
          completed_at: "2026-03-29T13:20:04Z",
          updated_at: "2026-03-29T13:20:04Z",
          type: "web_search",
          query: "golang 并发实践",
          output: "找到 2 条可参考资料。",
          metadata: {
            source: "legacy_tool_event",
            workflow_key: "content_article_workflow",
          },
        },
      ],
    });

    const streamingRenderer = container.querySelector(
      '[data-testid="streaming-renderer"]',
    );
    const articleFrame = container.querySelector(
      '[data-testid="article-artifact-frame"]',
    );
    const rendererCall =
      findStreamingRendererCallByContent("我会先检索资料，再输出文章草稿。");
    const contentFactoryToolParts = (rendererCall?.contentParts || []).filter(
      (part) => {
        const metadata = part.metadata as Record<string, unknown> | undefined;
        return (
          part.type === "tool_use" &&
          (metadata?.source === "content_factory_search_requests" ||
            metadata?.workflowKey === "content_article_workflow" ||
            metadata?.workflow_key === "content_article_workflow")
        );
      },
    );

    expect(streamingRenderer).not.toBeNull();
    expect(contentFactoryToolParts).toHaveLength(2);
    expect(contentFactoryToolParts[0]?.metadata).toEqual(
      expect.objectContaining({
        source: "content_factory_search_requests",
        workflowKey: "content_article_workflow",
      }),
    );
    expect(contentFactoryToolParts[1]?.metadata).toEqual(
      expect.objectContaining({
        workflow_key: "content_article_workflow",
      }),
    );
    expect(articleFrame).not.toBeNull();
    expect(
      Boolean(
        streamingRenderer!.compareDocumentPosition(articleFrame!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  it("不应把 .lime/artifacts 下的内部 artifact 文稿 JSON 渲染成尾部时间线", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-hidden-artifact-json",
        role: "assistant",
        content: "已生成内部文稿快照。",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-hidden-artifact-json",
      turns: [
        {
          id: "turn-hidden-artifact-json",
          thread_id: "thread-1",
          prompt_text: "生成内部 artifact 文稿",
          status: "completed",
          started_at: "2026-04-10T10:35:00Z",
          completed_at: "2026-04-10T10:35:03Z",
          created_at: "2026-04-10T10:35:00Z",
          updated_at: "2026-04-10T10:35:03Z",
        },
      ],
      threadItems: [
        {
          id: "item-hidden-artifact-json",
          thread_id: "thread-1",
          turn_id: "turn-hidden-artifact-json",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-10T10:35:01Z",
          completed_at: "2026-04-10T10:35:02Z",
          updated_at: "2026-04-10T10:35:02Z",
          type: "file_artifact",
          path: ".lime/artifacts/thread-1/report.artifact.json",
          source: "artifact_snapshot",
          content: '{"schemaVersion":"artifact_document.v1"}',
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
  });

  it("同一路径的 file_artifact 重复出现时，尾部时间线只应保留更完整的一条", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-duplicate-artifact",
        role: "assistant",
        content: "导出完成。",
        timestamp: now,
      },
    ];

    render(messages, {
      currentTurnId: "turn-duplicate-artifact",
      turns: [
        {
          id: "turn-duplicate-artifact",
          thread_id: "thread-1",
          prompt_text: "导出 index.md",
          status: "completed",
          started_at: "2026-04-10T09:57:00Z",
          completed_at: "2026-04-10T09:57:05Z",
          created_at: "2026-04-10T09:57:00Z",
          updated_at: "2026-04-10T09:57:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-artifact-duplicate-empty",
          thread_id: "thread-1",
          turn_id: "turn-duplicate-artifact",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-10T09:57:01Z",
          completed_at: "2026-04-10T09:57:02Z",
          updated_at: "2026-04-10T09:57:02Z",
          type: "file_artifact",
          path: "exports/x-article-export/google/index.md",
          source: "artifact_snapshot",
          content: "",
        },
        {
          id: "item-artifact-duplicate-rich",
          thread_id: "thread-1",
          turn_id: "turn-duplicate-artifact",
          sequence: 2,
          status: "completed",
          started_at: "2026-04-10T09:57:03Z",
          completed_at: "2026-04-10T09:57:04Z",
          updated_at: "2026-04-10T09:57:04Z",
          type: "file_artifact",
          path: "exports/x-article-export/google/index.md",
          source: "artifact_snapshot",
          content: "# 最新导出\n\n这里是完整预览。",
        },
      ],
    });

    const trailingTimelineProps = mockAgentThreadTimeline.mock.calls.find(
      ([props]) => props?.placement === "trailing",
    )?.[0] as { items?: Array<Record<string, unknown>> } | undefined;

    expect(trailingTimelineProps?.items).toHaveLength(1);
    expect(trailingTimelineProps?.items?.[0]).toEqual(
      expect.objectContaining({
        path: "exports/x-article-export/google/index.md",
        content: "# 最新导出\n\n这里是完整预览。",
      }),
    );
  });

  it("同一路径产物同时存在消息 artifacts 与尾部 file_artifact 时只显示时间线卡片", () => {
    const now = new Date();
    const artifactContent = "# 最新导出\n\n这里是完整预览。";
    const messages: Message[] = [
      {
        id: "msg-assistant-dedup-artifact-card",
        role: "assistant",
        content: "导出完成。",
        timestamp: now,
        artifacts: [
          {
            id: "artifact-dedup-report",
            type: "document",
            title: "report.md",
            content: artifactContent,
            status: "complete",
            meta: {
              filePath: "exports\\x-article-export\\google\\report.md",
              filename: "report.md",
            },
            position: { start: 0, end: artifactContent.length },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-dedup-artifact-card",
      turns: [
        {
          id: "turn-dedup-artifact-card",
          thread_id: "thread-1",
          prompt_text: "导出 report.md",
          status: "completed",
          started_at: "2026-04-10T10:30:00Z",
          completed_at: "2026-04-10T10:30:05Z",
          created_at: "2026-04-10T10:30:00Z",
          updated_at: "2026-04-10T10:30:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-dedup-artifact-card",
          thread_id: "thread-1",
          turn_id: "turn-dedup-artifact-card",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-10T10:30:01Z",
          completed_at: "2026-04-10T10:30:02Z",
          updated_at: "2026-04-10T10:30:02Z",
          type: "file_artifact",
          path: "exports/x-article-export/google/report.md",
          source: "artifact_snapshot",
          content: artifactContent,
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="message-artifact-card"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-testid="timeline-file-artifact-card"]'),
    ).toHaveLength(1);
  });

  it("绝对路径消息产物与文件名时间线产物等价时不应重复显示普通产物卡", () => {
    const now = new Date();
    const artifactContent = "# 山冶工造 PRD";
    const messages: Message[] = [
      {
        id: "msg-assistant-dedup-absolute-artifact",
        role: "assistant",
        content: "PRD 已生成。",
        timestamp: now,
        artifacts: [
          {
            id: "artifact-dedup-absolute-prd",
            type: "document",
            title: "山冶工造_PRD_V2_完整版.md",
            content: artifactContent,
            status: "complete",
            meta: {
              filePath:
                "C:\\Users\\Administrator\\AppData\\Local\\lime\\projects\\default\\山冶工造_PRD_V2_完整版.md",
              filename: "山冶工造_PRD_V2_完整版.md",
            },
            position: { start: 0, end: artifactContent.length },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-dedup-absolute-artifact",
      turns: [
        {
          id: "turn-dedup-absolute-artifact",
          thread_id: "thread-1",
          prompt_text: "生成 PRD",
          status: "completed",
          started_at: "2026-05-26T23:55:00Z",
          completed_at: "2026-05-26T23:55:05Z",
          created_at: "2026-05-26T23:55:00Z",
          updated_at: "2026-05-26T23:55:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-dedup-absolute-artifact",
          thread_id: "thread-1",
          turn_id: "turn-dedup-absolute-artifact",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-26T23:55:01Z",
          completed_at: "2026-05-26T23:55:02Z",
          updated_at: "2026-05-26T23:55:02Z",
          type: "file_artifact",
          path: "山冶工造_PRD_V2_完整版.md",
          source: "artifact_snapshot",
          content: artifactContent,
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="message-artifact-card"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-testid="timeline-file-artifact-card"]'),
    ).toHaveLength(1);
  });

  it("已有尾部 file_artifact 卡片时，不应再额外渲染消息级在画布中打开入口", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-artifact-card-only",
        role: "assistant",
        content: "导出完成。",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-artifact-card-only",
      turns: [
        {
          id: "turn-artifact-card-only",
          thread_id: "thread-1",
          prompt_text: "导出 index.md",
          status: "completed",
          started_at: "2026-04-10T10:20:00Z",
          completed_at: "2026-04-10T10:20:05Z",
          created_at: "2026-04-10T10:20:00Z",
          updated_at: "2026-04-10T10:20:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-artifact-card-only",
          thread_id: "thread-1",
          turn_id: "turn-artifact-card-only",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-10T10:20:01Z",
          completed_at: "2026-04-10T10:20:02Z",
          updated_at: "2026-04-10T10:20:02Z",
          type: "file_artifact",
          path: "exports/x-article-export/google/index.md",
          source: "artifact_snapshot",
          content: "# 最新导出\n\n这里是完整预览。",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="message-canvas-shortcut"]'),
    ).toBeNull();
  });

  it("运行中的 turn_summary 应作为尾部过程状态展示，而不是顶到消息头部", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-running-summary",
        role: "assistant",
        content: "",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-running-summary",
      turns: [
        {
          id: "turn-running-summary",
          thread_id: "thread-1",
          prompt_text: "继续搜索 GitHub",
          status: "running",
          started_at: "2026-03-30T10:00:00Z",
          created_at: "2026-03-30T10:00:00Z",
          updated_at: "2026-03-30T10:00:05Z",
        },
      ],
      threadItems: [
        {
          id: "summary-running-1",
          thread_id: "thread-1",
          turn_id: "turn-running-summary",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-03-30T10:00:00Z",
          updated_at: "2026-03-30T10:00:05Z",
          type: "turn_summary",
          text: "正在打开 GitHub 搜索页",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).not.toBeNull();
  });

  it("正文已有 runtime status 时，运行中的 turn_summary 不应再重复进入时间线", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-runtime-status",
        role: "assistant",
        content: "",
        timestamp: now,
        isThinking: true,
        runtimeStatus: {
          phase: "routing",
          title: "正在打开 GitHub",
          detail: "已连上浏览器，准备进入搜索页。",
          checkpoints: ["浏览器已就绪"],
        },
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-runtime-status",
      turns: [
        {
          id: "turn-runtime-status",
          thread_id: "thread-1",
          prompt_text: "继续搜索 GitHub",
          status: "running",
          started_at: "2026-03-30T10:10:00Z",
          created_at: "2026-03-30T10:10:00Z",
          updated_at: "2026-03-30T10:10:05Z",
        },
      ],
      threadItems: [
        {
          id: "summary-runtime-status-1",
          thread_id: "thread-1",
          turn_id: "turn-runtime-status",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-03-30T10:10:00Z",
          updated_at: "2026-03-30T10:10:05Z",
          type: "turn_summary",
          text: "正在打开 GitHub 搜索页",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="streaming-renderer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="assistant-message-meta-footer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="assistant-first-token-runtime-status"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("Generating reply");
    expect(container.textContent).not.toContain("正在打开 GitHub");
  });

  it("首字前已有运行中 turn_summary 时仍应优先展示轻量等待占位", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-first-token-with-summary",
        role: "assistant",
        content: "",
        timestamp: now,
        isThinking: true,
        runtimeStatus: {
          phase: "preparing",
          title: "已接收请求，正在准备执行",
          detail:
            "系统正在初始化本轮执行环境并整理上下文，稍后会继续返回更详细进度。",
          checkpoints: ["请求已接收"],
        },
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-first-token-with-summary",
      turns: [
        {
          id: "turn-first-token-with-summary",
          thread_id: "thread-1",
          prompt_text: "你好",
          status: "running",
          started_at: "2026-03-30T10:20:00Z",
          created_at: "2026-03-30T10:20:00Z",
          updated_at: "2026-03-30T10:20:05Z",
        },
      ],
      threadItems: [
        {
          id: "summary-first-token-1",
          thread_id: "thread-1",
          turn_id: "turn-first-token-with-summary",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-03-30T10:20:00Z",
          updated_at: "2026-03-30T10:20:05Z",
          type: "turn_summary",
          text: "已接收请求，正在准备执行",
        },
      ],
    });

    expect(
      container.querySelector(
        '[data-testid="assistant-first-token-runtime-status"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
    expect(container.textContent).toContain("Preparing reply");
    expect(container.textContent).not.toContain("已接收请求，正在准备执行");
  });

  it("本地工具批次的阶段结论不应再进入主消息流时间线", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-local-batch",
        role: "assistant",
        content: "",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-local-batch",
      turns: [
        {
          id: "turn-local-batch",
          thread_id: "thread-1",
          prompt_text: "分析本地仓库",
          status: "running",
          started_at: "2026-04-14T10:00:00Z",
          created_at: "2026-04-14T10:00:00Z",
          updated_at: "2026-04-14T10:00:10Z",
        },
      ],
      threadItems: [
        {
          id: "summary-local-batch-1",
          thread_id: "thread-1",
          turn_id: "turn-local-batch",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-04-14T10:00:00Z",
          updated_at: "2026-04-14T10:00:10Z",
          type: "turn_summary",
          text: "已完成一批本地分析\n已完成这一批本地仓库的文件读取，正在整理这一批结果并判断是否还需要继续取证。",
          metadata: {
            sourceType: "runtime_status",
            surface: "runtime_status",
            visibility: "diagnostics",
            persistence: "transient",
          },
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("已完成一批本地分析");
    expect(container.textContent).not.toContain("正在整理这一批结果");
  });

  it("已完成且已有真实过程项的 turn_summary 不应再单独占用消息头部或尾部", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-finished-summary",
        role: "assistant",
        content: "已经打开 GitHub 并完成搜索。",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-finished-summary",
      turns: [
        {
          id: "turn-finished-summary",
          thread_id: "thread-1",
          prompt_text: "帮我找 AI Agent 项目",
          status: "completed",
          started_at: "2026-03-30T11:00:00Z",
          completed_at: "2026-03-30T11:00:05Z",
          created_at: "2026-03-30T11:00:00Z",
          updated_at: "2026-03-30T11:00:05Z",
        },
      ],
      threadItems: [
        {
          id: "summary-finished-1",
          thread_id: "thread-1",
          turn_id: "turn-finished-summary",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-30T11:00:00Z",
          completed_at: "2026-03-30T11:00:01Z",
          updated_at: "2026-03-30T11:00:01Z",
          type: "turn_summary",
          text: "已打开 GitHub 搜索页面",
        },
        {
          id: "tool-finished-1",
          thread_id: "thread-1",
          turn_id: "turn-finished-summary",
          sequence: 2,
          status: "completed",
          started_at: "2026-03-30T11:00:02Z",
          completed_at: "2026-03-30T11:00:04Z",
          updated_at: "2026-03-30T11:00:04Z",
          type: "tool_call",
          tool_name: "browser_navigate",
          arguments: { url: "https://github.com/search?q=ai+agent" },
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
    expect(mockAgentThreadTimeline).not.toHaveBeenCalled();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        contentParts: [
          expect.objectContaining({
            type: "tool_use",
            toolCall: expect.objectContaining({
              id: "tool-finished-1",
            }),
          }),
          { type: "text", text: "已经打开 GitHub 并完成搜索。" },
        ],
      }),
    );
  });
});
