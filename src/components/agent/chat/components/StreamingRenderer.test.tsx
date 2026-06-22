import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  mockMarkdownRenderer,
  parseAIResponseMock,
} from "./StreamingRenderer.testMocks";
import { resolveStreamingMarkdownDisplaySource } from "./streamingMarkdownDisplaySource";
import type { ContentPart } from "../types";
import {
  createSavedSiteMetadata,
  installStreamingRendererTestHarness,
  renderStreamingRendererHarness as renderHarness,
} from "./StreamingRenderer.testHarness";

installStreamingRendererTestHarness();

describe("StreamingRenderer", () => {
  it("流式 Markdown 应只把完整换行前的源码交给 Markdown renderer", () => {
    expect(
      resolveStreamingMarkdownDisplaySource(
        "| 来源 | 结论 |\n| --- | --- |\n| Codex",
        true,
      ),
    ).toEqual({
      markdown: "| 来源 | 结论 |\n| --- | --- |\n",
      pendingTail: "| Codex",
    });

    expect(
      resolveStreamingMarkdownDisplaySource("## 标题", true),
    ).toEqual({
      markdown: "",
      pendingTail: "## 标题",
    });

    expect(
      resolveStreamingMarkdownDisplaySource("## 标题", false),
    ).toEqual({
      markdown: "## 标题",
      pendingTail: "",
    });
  });

  it("流式 Markdown 未完成行应先按纯文本尾巴展示，避免半行表格提前解析", () => {
    const fullText = "表格：\n| 来源";
    const { container } = renderHarness({
      content: fullText,
      isStreaming: true,
    });

    const markdownContents = mockMarkdownRenderer.mock.calls.map(
      ([props]) => props.content,
    );
    expect(markdownContents).not.toContain(fullText);
    expect(markdownContents).toContain("表格：\n");
    expect(container.textContent).toContain("| 来源");
    expect(
      container.querySelector('[data-testid="streaming-markdown-pending-tail"]'),
    ).not.toBeNull();
  });

  it("交错内容应隐藏紧邻工具调用的调度自述", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "ToolSearch 只返回了元数据，让我直接调用 WebSearch 进行多组检索。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-narration-hidden",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "latest openai api" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-04-01T10:00:00.000Z"),
            endTime: new Date("2026-04-01T10:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "已经整理出 3 个可信来源。",
        },
      ],
    });

    expect(container.textContent).not.toContain("只返回了元数据");
    expect(
      container.querySelector('[data-testid="streaming-process-group"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("已经整理出 3 个可信来源。");
  });

  it("交错检索过程不应把工具前后的短过渡片段渲染成正文", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我",
        },
        {
          type: "thinking",
          text: "Searching for current sources.",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-source-search-renderer",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "current sources" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "先联网核实可用来源。",
        },
        {
          type: "text",
          text: "调研简报：\n\n- 已确认主要来源。",
        },
      ],
      isStreaming: false,
    });

    expect(
      container.querySelector('[data-testid="streaming-process-group"]'),
    ).toBeTruthy();
    expect(container.textContent).not.toContain(
      "Searching for current sources",
    );
    expect(container.textContent).not.toContain("先联网核实");
    expect(container.textContent).not.toContain("我先");
    expect(container.textContent).not.toContain("我");
    expect(container.textContent).toContain("调研简报");
    expect(container.textContent).toContain("已确认主要来源");
  });

  it("交错图片查看过程应保持顺序并支持展开图片预览", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先查看你给的截图。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-view-image-renderer",
            name: "ViewImageTool",
            arguments: JSON.stringify({
              path: "/workspace/assets/dashboard.png",
            }),
            status: "completed",
            result: {
              success: true,
              output:
                "Viewed image: /workspace/assets/dashboard.png\nFormat: image/png\nImage content is attached to this tool result.",
              metadata: {
                model_visible_image: true,
                image_url: "data:image/png;base64,ZGFzaGJvYXJk",
                mime_type: "image/png",
              },
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "最终观察：截图里有一个仪表盘。",
        },
      ],
      isStreaming: false,
    });

    const renderedText = container.textContent || "";
    expect(renderedText.indexOf("我先查看你给的截图。")).toBeLessThan(
      renderedText.indexOf("已查看 1 张图片"),
    );
    expect(renderedText.indexOf("已查看 1 张图片")).toBeLessThan(
      renderedText.indexOf("最终观察：截图里有一个仪表盘。"),
    );
    expect(renderedText).not.toContain("Viewed image");
    expect(renderedText).not.toContain("data:image");

    const groupButton = container.querySelector(
      '[data-testid="streaming-process-group"] button',
    );
    act(() => {
      groupButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const detailButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.title === "展开过程详情",
    );
    act(() => {
      detailButton?.click();
    });

    const previewImage = container.querySelector("img");
    expect(previewImage?.getAttribute("src")).toBe(
      "data:image/png;base64,ZGFzaGJvYXJk",
    );
    expect(container.textContent).not.toContain(
      "data:image/png;base64,ZGFzaGJvYXJk",
    );
  });

  it("应过滤 assistant 正文中的工具协议残留", () => {
    const { container } = renderHarness({
      content:
        '<tool_call import={"name":"Read","arguments":{"file_path":"article.md"}}>{"ok":true}</tool_call>\n\n已完成 Markdown 保存。',
    });

    expect(container.textContent).toContain("已完成 Markdown 保存。");
    expect(container.textContent).not.toContain("tool_call");
    expect(container.textContent).not.toContain("file_path");
  });

  it("应把 runtime 协作包络渲染成专门消息卡片", () => {
    const { container } = renderHarness({
      content: `<teammate-message teammate_id="researcher" summary="同步结果">
继续验证
</teammate-message>`,
    });

    expect(
      container.querySelector('[data-testid="runtime-peer-message-cards"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("协作者消息");
    expect(container.textContent).toContain("来自 researcher");
    expect(container.textContent).toContain("同步结果");
    expect(container.textContent).toContain("继续验证");
    expect(container.textContent).not.toContain("teammate-message");
  });

  it("纯文本内容应短路跳过结构化解析", () => {
    renderHarness({
      content: "这是普通文本输出，不包含结构化标签。",
      isStreaming: true,
    });

    expect(parseAIResponseMock).not.toHaveBeenCalled();
  });

  it("流式纯文本首帧应立即显示前缀，避免等待下一帧才吐字", () => {
    const fullText = "这是第一段流式输出，应该马上可见。";
    const { container } = renderHarness({
      content: fullText,
      isStreaming: true,
    });

    const renderedText = container.textContent || "";
    expect(renderedText.length).toBeGreaterThan(0);
    expect(fullText.startsWith(renderedText)).toBe(true);
    expect(renderedText.length).toBeLessThan(fullText.length);
  });

  it("流式正文积压较多时应快速追上最新目标文本", () => {
    vi.useFakeTimers();
    const fullText = "流式输出".repeat(80);
    const { container } = renderHarness({
      content: fullText,
      isStreaming: true,
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const renderedText = container.textContent || "";
    expect(renderedText.length).toBeGreaterThan(120);
    expect(fullText.startsWith(renderedText)).toBe(true);
  });

  it("开启正文块操作时应向 MarkdownRenderer 透传引用/复制能力", () => {
    const onQuoteContent = vi.fn();

    renderHarness({
      content: "这是最终输出",
      showContentBlockActions: true,
      onQuoteContent,
    });

    expect(mockMarkdownRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "这是最终输出",
        showBlockActions: true,
        onQuoteContent,
      }),
    );
  });

  it("历史恢复轻量模式应向 MarkdownRenderer 透传 light 渲染模式", () => {
    renderHarness({
      content: "这是历史会话正文\n\n```ts\nconsole.log('heavy')\n```",
      markdownRenderMode: "light",
    });

    expect(mockMarkdownRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("这是历史会话正文"),
        renderMode: "light",
      }),
    );
  });

  it("交错内容重复渲染时应复用已缓存解析结果", () => {
    const structuredText = '<write_file path="demo.md">hello</write_file>';
    parseAIResponseMock.mockImplementation((content: string) => {
      if (content === structuredText) {
        return {
          parts: [
            {
              type: "write_file",
              content: "hello",
              filePath: "demo.md",
            },
          ],
          hasA2UI: false,
          hasWriteFile: true,
          hasPending: false,
        };
      }

      return {
        parts: content.trim()
          ? [{ type: "text", content: content.trim() }]
          : [],
        hasA2UI: false,
        hasWriteFile: false,
        hasPending: false,
      };
    });
    const contentParts: ContentPart[] = [
      { type: "text", text: structuredText },
      { type: "text", text: "普通文本" },
    ];

    const { rerender } = renderHarness({
      content: structuredText,
      contentParts,
      isStreaming: true,
    });

    expect(parseAIResponseMock).toHaveBeenCalledTimes(1);

    rerender({
      content: structuredText,
      contentParts: [...contentParts],
      isStreaming: true,
    });

    expect(parseAIResponseMock).toHaveBeenCalledTimes(1);
  });

  it("连续探索工具应默认折叠成批次摘要", () => {
    const { container } = renderHarness({
      content: "",
      toolCalls: [
        {
          id: "tool-search-1",
          name: "Grep",
          arguments: JSON.stringify({
            pattern: "tool_use_summary",
            path: "/workspace/src",
          }),
          status: "completed",
          result: { success: true, output: "found" },
          startTime: new Date("2026-04-01T10:00:00.000Z"),
          endTime: new Date("2026-04-01T10:00:01.000Z"),
        },
        {
          id: "tool-read-1",
          name: "Read",
          arguments: JSON.stringify({
            file_path: "/workspace/src/query.ts",
          }),
          status: "completed",
          result: { success: true, output: "file contents" },
          startTime: new Date("2026-04-01T10:00:02.000Z"),
          endTime: new Date("2026-04-01T10:00:03.000Z"),
        },
      ],
    });

    expect(container.textContent).toContain("已探索项目");
    expect(container.textContent).toContain("查看了 1 个文件，搜索 1 次");
    expect(container.textContent).toContain("最新线索：query.ts");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();
  });

  it("普通工具列表应透传已保存站点内容打开回调", () => {
    const onOpenSavedSiteContent = vi.fn();
    const { container } = renderHarness({
      content: "工具执行完成",
      toolCalls: [
        {
          id: "tool-site-run-streaming-list",
          name: "lime_site_run",
          arguments: JSON.stringify({
            adapter_name: "x/article-export",
            skill_title: "X 文章转存",
          }),
          status: "completed",
          result: {
            success: true,
            output: "ok",
            metadata: createSavedSiteMetadata(),
          },
          startTime: new Date("2026-03-25T10:00:00.000Z"),
          endTime: new Date("2026-03-25T10:00:01.000Z"),
        },
      ],
      onOpenSavedSiteContent,
    });

    const markdownButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("在下方预览导出 Markdown"));
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeTruthy();
    expect(markdownButton).toBeTruthy();

    act(() => {
      markdownButton?.click();
    });

    expect(onOpenSavedSiteContent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        contentId: "content-1",
        preferredTarget: "project_file",
      }),
    );
  });

  it("交错工具片段应透传已保存站点内容打开回调", () => {
    const onOpenSavedSiteContent = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "tool-site-run-streaming-item",
            name: "lime_site_run",
            arguments: JSON.stringify({
              adapter_name: "x/article-export",
              skill_title: "X 文章转存",
            }),
            status: "completed",
            result: {
              success: true,
              output: "ok",
              metadata: createSavedSiteMetadata(),
            },
            startTime: new Date("2026-03-25T10:01:00.000Z"),
            endTime: new Date("2026-03-25T10:01:01.000Z"),
          },
        },
      ],
      onOpenSavedSiteContent,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton).toBeTruthy();

    act(() => {
      processGroupButton?.click();
    });

    const markdownButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("在下方预览导出 Markdown"));
    expect(markdownButton).toBeTruthy();

    act(() => {
      markdownButton?.click();
    });

    expect(onOpenSavedSiteContent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        contentId: "content-1",
      }),
    );
  });

  it("任务板工具应按正文片段穿插展示且不泄露任务 JSON", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先把工作拆成任务板。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-task-create-1",
            name: "TaskCreateTool",
            arguments: JSON.stringify({
              subject: "整理国际新闻",
              description: "按来源交叉验证并输出摘要",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                task: {
                  id: "1",
                  subject: "整理国际新闻",
                },
              }),
              metadata: {
                task: {
                  id: "1",
                  subject: "整理国际新闻",
                  description: "按来源交叉验证并输出摘要",
                  status: "pending",
                },
                task_list_id: "board-main",
                task_list: [
                  {
                    id: "1",
                    content: "整理国际新闻",
                    status: "pending",
                  },
                ],
                tasks: [
                  {
                    id: "1",
                    subject: "整理国际新闻",
                    description: "按来源交叉验证并输出摘要",
                    status: "pending",
                  },
                ],
              },
            },
            startTime: new Date("2026-06-02T09:10:00.000Z"),
            endTime: new Date("2026-06-02T09:10:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-task-list-1",
            name: "TaskListTool",
            arguments: JSON.stringify({}),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                tasks: [
                  {
                    id: "1",
                    subject: "整理国际新闻",
                    status: "pending",
                  },
                ],
              }),
              metadata: {
                task_list_id: "board-main",
                tasks: [
                  {
                    id: "1",
                    subject: "整理国际新闻",
                    status: "pending",
                  },
                ],
              },
            },
            startTime: new Date("2026-06-02T09:10:02.000Z"),
            endTime: new Date("2026-06-02T09:10:03.000Z"),
          },
        },
        {
          type: "text",
          text: "任务板已建立，接下来开始执行。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-task-update-1",
            name: "TaskUpdateTool",
            arguments: JSON.stringify({
              task_id: "1",
              status: "completed",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                success: true,
                taskId: "1",
                updatedFields: ["status"],
                statusChange: {
                  from: "pending",
                  to: "completed",
                },
              }),
              metadata: {
                success: true,
                task_id: "1",
                task_list_id: "board-main",
                status_change: {
                  from: "pending",
                  to: "completed",
                },
              },
            },
            startTime: new Date("2026-06-02T09:10:04.000Z"),
            endTime: new Date("2026-06-02T09:10:05.000Z"),
          },
        },
        {
          type: "text",
          text: "最终结论：任务板状态已经同步完成。",
        },
      ],
      isStreaming: false,
    });

    const renderedText = container.textContent || "";
    const introIndex = renderedText.indexOf("我先把工作拆成任务板。");
    const firstProcessIndex = renderedText.indexOf("已处理 2 项安排");
    const middleTextIndex =
      renderedText.indexOf("任务板已建立，接下来开始执行。");
    const updateProcessIndex = renderedText.indexOf("已处理 1 项安排");
    const finalTextIndex =
      renderedText.indexOf("最终结论：任务板状态已经同步完成。");

    expect(introIndex).toBeGreaterThanOrEqual(0);
    expect(firstProcessIndex).toBeGreaterThan(introIndex);
    expect(middleTextIndex).toBeGreaterThan(firstProcessIndex);
    expect(updateProcessIndex).toBeGreaterThan(middleTextIndex);
    expect(finalTextIndex).toBeGreaterThan(updateProcessIndex);
    expect(renderedText).not.toContain('"task_list_id"');
    expect(renderedText).not.toContain('"updatedFields"');
    expect(renderedText).not.toContain('"tasks"');

    const processGroupButtons = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButtons.length).toBe(2);

    act(() => {
      processGroupButtons[0]?.click();
      processGroupButtons[1]?.click();
    });

    const expandedText = container.textContent || "";
    expect(expandedText).toContain("整理国际新闻");
    expect(expandedText).toContain("已更新任务 1");
    expect(expandedText).not.toContain("task_list_id");
    expect(expandedText).not.toContain("updatedFields");
    expect(expandedText).not.toContain('"tasks"');
  });

  it("服务技能完成态应隐藏嵌套运行包络 JSON", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "tool-service-skill-nested-envelope-1",
            name: "lime_run_service_skill",
            arguments: JSON.stringify({
              skill_title: "渠道预览",
              service_skill_id: "channel-preview",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                result: {
                  output: {
                    data: {
                      serviceSkillId: "channel-preview",
                      slotValues: {
                        platform: "小红书",
                      },
                      status: "completed",
                    },
                  },
                },
              }),
            },
            metadata: {
              skill_title: "渠道预览",
            },
            startTime: new Date("2026-06-21T10:10:00.000Z"),
            endTime: new Date("2026-06-21T10:10:05.000Z"),
          },
        },
        {
          type: "text",
          text: "渠道预览已经完成。",
        },
      ],
      isStreaming: false,
    });

    const renderedText = container.textContent || "";
    expect(renderedText).toContain("渠道预览已经完成。");
    expect(renderedText).not.toContain("serviceSkillId");
    expect(renderedText).not.toContain("slotValues");
    expect(renderedText).not.toContain("channel-preview");
    expect(renderedText).not.toContain("实时输出");
    expect(renderedText).not.toContain("兼容");
  });

  it("普通 SkillTool 完成态应隐藏 gate proof JSON 包络", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "tool-skill-gate-proof-renderer-1",
            name: "SkillTool",
            arguments: JSON.stringify({ skill: "capability-report" }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                allow: {
                  phase: "skill_tool_gate_allow",
                  request: {
                    toolName: "SkillTool",
                    sessionId: "skill-source-session",
                    skill: "capability-report",
                    authorizationScope: "session",
                  },
                  decision: {
                    action: "allow",
                    gate: "session_allowlist",
                    reason: "workspace_skill_runtime_enable_allowlist_matched",
                  },
                  result: {
                    status: "passed",
                    permissionBehavior: "Allow",
                    sourceMetadataAttached: true,
                    workspaceSkillRuntimeEnableAttached: true,
                  },
                },
                sourceMetadata: {
                  sourceDraftId: "capdraft-1",
                  sourceVerificationReportId: "capver-1",
                },
                workspace_skill_runtime_enable: {
                  source: "manual_session_enable",
                  approval: "manual",
                  bindings: [{ skill: "project:capability-report" }],
                },
                summary:
                  "SkillTool allow/deny events both contain request, decision and result.",
              }),
            },
            startTime: new Date("2026-06-21T10:20:00.000Z"),
            endTime: new Date("2026-06-21T10:20:03.000Z"),
          },
        },
        {
          type: "text",
          text: "技能执行完成，继续整理结果。",
        },
      ],
      isStreaming: false,
    });

    const renderedText = container.textContent || "";
    expect(renderedText).toContain("已执行 1 项技能操作");
    expect(renderedText).toContain(
      "运行启用 · 手动会话 · 人工确认 · 1 个绑定",
    );
    expect(renderedText).not.toContain("permissionBehavior");
    expect(renderedText).not.toContain("workspaceSkillRuntimeEnableAttached");
    expect(renderedText).not.toContain("workspace_skill_runtime_enable");
    expect(renderedText).not.toContain("sourceMetadata");
    expect(renderedText).not.toContain("skill-source-session");
    expect(renderedText).not.toContain("SkillTool allow/deny");
  });

  it("交错内容里只有思考时也应渲染为轻量折叠过程行", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先理解截图里的消息顺序\n再核对历史恢复路径",
        },
        {
          type: "text",
          text: "已经确认历史恢复路径也需要穿插显示。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");
    expect(processGroupButton?.textContent).toContain("已完成思考");
    expect(container.textContent).not.toContain("先理解截图里的消息顺序");
    expect(
      container.querySelector('[data-testid="thinking-block"]'),
    ).toBeNull();
    expect(container.textContent).toContain(
      "已经确认历史恢复路径也需要穿插显示。",
    );

    act(() => {
      processGroupButton?.click();
    });

    expect(container.textContent).toContain("先理解截图里的消息顺序");
    expect(
      container
        .querySelector('[data-testid="thinking-block"]')
        ?.getAttribute("data-visual-style"),
    ).toBe("grouped-inline");
  });

});
