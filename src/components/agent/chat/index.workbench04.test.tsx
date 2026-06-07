import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createMockAgentChatUnifiedState,
  createProject,
  flushEffects,
  getIndexTestMocks,
  getSendMessageCall,
  installMockAgentChatUnifiedState,
  mockBrowserAssistCompletedSession,
  type MockInputbarSendPayload,
  mountPage,
  observedWorkspaceIds,
  renderPage,
  sharedSendMessageMock,
  sharedSwitchTopicMock,
  sharedTriggerAIGuideMock,
  waitForElement,
} from "./index.testFixtures";
import {
  resolveBrowserAssistSessionStorageKey,
} from "./utils/browserAssistSession";

const {
  mockBrowserExecuteAction,
  mockGetOrCreateDefaultProject,
  mockInputbar,
  mockJotaiState,
  mockLaunchBrowserSession,
  mockUseAgentChatUnified,
} = getIndexTestMocks();

describe("AgentChatPage 通用工作台", { timeout: 20_000 }, () => {
  it("浏览器工具刚启动且只有 profile_key 时不应自动打开浏览器协助画布", async () => {
    mockUseAgentChatUnified.mockImplementation(
      ({ workspaceId }: { workspaceId: string }) => {
        observedWorkspaceIds.push(workspaceId);
        return {
          providerType: "openai",
          setProviderType: vi.fn(),
          model: "mock-model",
          setModel: vi.fn(),
          executionStrategy: "react",
          setExecutionStrategy: vi.fn(),
          messages: [
            {
              id: "msg-browser-user-pending",
              role: "user",
              content: "打开浏览器并开始处理登录",
              timestamp: new Date("2026-03-14T03:10:00.000Z"),
            },
            {
              id: "msg-browser-assistant-pending",
              role: "assistant",
              content: "",
              timestamp: new Date("2026-03-14T03:10:01.000Z"),
              toolCalls: [
                {
                  id: "tool-browser-pending",
                  name: "mcp__lime-browser__browser_navigate",
                  arguments: JSON.stringify({
                    url: "https://accounts.example.com",
                    profile_key: "general_browser_assist",
                  }),
                  status: "running",
                  startTime: new Date("2026-03-14T03:10:01.100Z"),
                },
              ],
            },
          ],
          isSending: true,
          sendMessage: sharedSendMessageMock,
          stopSending: vi.fn(async () => undefined),
          clearMessages: vi.fn(),
          deleteMessage: vi.fn(),
          editMessage: vi.fn(),
          handlePermissionResponse: vi.fn(),
          triggerAIGuide: sharedTriggerAIGuideMock,
          topics: [
            {
              id: "topic-browser-pending",
              title: "话题 B",
              updatedAt: Date.now(),
            },
          ],
          sessionId: "session-browser-pending",
          switchTopic: sharedSwitchTopicMock,
          deleteTopic: vi.fn(),
          renameTopic: vi.fn(),
          workspacePathMissing: false,
          fixWorkspacePathAndRetry: vi.fn(),
          dismissWorkspacePathError: vi.fn(),
        };
      },
    );

    const container = renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");
    expect(
      mockJotaiState.artifacts.some(
        (artifact) =>
          artifact.type === "browser_assist" && artifact.status !== "complete",
      ),
    ).toBe(false);
  });

  it("浏览器协助自动拉起失败后不应重复自旋重试", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockLaunchBrowserSession.mockRejectedValue(new Error("Chrome 启动失败"));
    mockUseAgentChatUnified.mockImplementation(
      ({ workspaceId }: { workspaceId: string }) => {
        observedWorkspaceIds.push(workspaceId);
        return {
          providerType: "openai",
          setProviderType: vi.fn(),
          model: "mock-model",
          setModel: vi.fn(),
          executionStrategy: "react",
          setExecutionStrategy: vi.fn(),
          messages: [
            {
              id: "msg-browser-user-failed",
              role: "user",
              content: "打开浏览器并开始处理登录",
              timestamp: new Date("2026-03-14T03:10:00.000Z"),
            },
            {
              id: "msg-browser-assistant-failed",
              role: "assistant",
              content: "",
              timestamp: new Date("2026-03-14T03:10:01.000Z"),
              toolCalls: [
                {
                  id: "tool-browser-failed",
                  name: "mcp__lime-browser__browser_navigate",
                  arguments: JSON.stringify({
                    url: "https://accounts.example.com",
                    profile_key: "general_browser_assist",
                  }),
                  status: "running",
                  startTime: new Date("2026-03-14T03:10:01.100Z"),
                },
              ],
            },
          ],
          isSending: true,
          sendMessage: sharedSendMessageMock,
          stopSending: vi.fn(async () => undefined),
          clearMessages: vi.fn(),
          deleteMessage: vi.fn(),
          editMessage: vi.fn(),
          handlePermissionResponse: vi.fn(),
          triggerAIGuide: sharedTriggerAIGuideMock,
          topics: [
            {
              id: "topic-browser-failed",
              title: "话题 C",
              updatedAt: Date.now(),
            },
          ],
          sessionId: "session-browser-failed",
          switchTopic: sharedSwitchTopicMock,
          deleteTopic: vi.fn(),
          renameTopic: vi.fn(),
          workspacePathMissing: false,
          fixWorkspacePathAndRetry: vi.fn(),
          dismissWorkspacePathError: vi.fn(),
        };
      },
    );

    renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(16);

    const autoLaunchWarnings = consoleWarnSpy.mock.calls.filter((args) =>
      String(args[0] ?? "").includes(
        "[AgentChatPage] 自动拉起浏览器协助实时会话失败",
      ),
    );

    expect(mockLaunchBrowserSession.mock.calls.length).toBeLessThanOrEqual(1);
    expect(autoLaunchWarnings.length).toBeLessThanOrEqual(1);
  });

  it("即使没有最新 tool result，也应从 session scoped Browser Assist 状态恢复实时画布", async () => {
    sessionStorage.setItem(
      resolveBrowserAssistSessionStorageKey(undefined, "session-1"),
      JSON.stringify({
        sessionId: "restored-browser-session-1",
        profileKey: "general_browser_assist",
        url: "https://restored.example.com",
        title: "恢复的浏览器会话",
        source: "runtime_launch",
        updatedAt: 1710387000000,
      }),
    );

    const container = renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");
    expect(mockLaunchBrowserSession).not.toHaveBeenCalled();
    expect(mockJotaiState.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "browser-assist:general",
          type: "browser_assist",
          title: "恢复的浏览器会话",
          meta: expect.objectContaining({
            sessionId: "restored-browser-session-1",
            profileKey: "general_browser_assist",
            url: "https://restored.example.com",
          }),
        }),
      ]),
    );
  });

  it("同 scope 会话更新不应再自动重新打开浏览器协助画布", async () => {
    mockBrowserAssistCompletedSession();

    const harness = mountPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    expect(
      harness.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");

    mockUseAgentChatUnified.mockImplementation(
      ({ workspaceId }: { workspaceId: string }) => {
        observedWorkspaceIds.push(workspaceId);
        return {
          providerType: "openai",
          setProviderType: vi.fn(),
          model: "mock-model",
          setModel: vi.fn(),
          executionStrategy: "react",
          setExecutionStrategy: vi.fn(),
          messages: [
            {
              id: "msg-browser-user-refresh",
              role: "user",
              content: "继续浏览器流程",
              timestamp: new Date("2026-03-14T03:00:00.000Z"),
            },
            {
              id: "msg-browser-assistant-refresh",
              role: "assistant",
              content: "",
              timestamp: new Date("2026-03-14T03:00:01.000Z"),
              toolCalls: [
                {
                  id: "tool-browser-open-refresh",
                  name: "mcp__lime-browser__browser_navigate",
                  arguments: JSON.stringify({
                    url: "https://www.rokid.com/news",
                    profile_key: "general_browser_assist",
                  }),
                  status: "completed",
                  startTime: new Date("2026-03-14T03:00:01.100Z"),
                  endTime: new Date("2026-03-14T03:00:02.000Z"),
                  result: {
                    success: true,
                    output: "已刷新页面",
                    metadata: {
                      result: {
                        session_id: "browser-session-1",
                        profile_key: "general_browser_assist",
                        page_info: {
                          title: "Rokid News",
                          url: "https://www.rokid.com/news",
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
          isSending: false,
          sendMessage: sharedSendMessageMock,
          stopSending: vi.fn(async () => undefined),
          clearMessages: vi.fn(),
          deleteMessage: vi.fn(),
          editMessage: vi.fn(),
          handlePermissionResponse: vi.fn(),
          triggerAIGuide: sharedTriggerAIGuideMock,
          topics: [
            {
              id: "topic-a",
              title: "话题 A",
              updatedAt: Date.now(),
            },
          ],
          sessionId: "session-1",
          switchTopic: sharedSwitchTopicMock,
          deleteTopic: vi.fn(),
          renameTopic: vi.fn(),
          workspacePathMissing: false,
          fixWorkspacePathAndRetry: vi.fn(),
          dismissWorkspacePathError: vi.fn(),
        };
      },
    );

    harness.rerender({});
    await flushEffects(10);

    expect(
      harness.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");
  });

  it("显式新 URL 的浏览器请求应复用现有会话并导航到新页面", async () => {
    mockBrowserAssistCompletedSession();
    mockBrowserExecuteAction.mockResolvedValueOnce({
      success: true,
      backend: "cdp_direct",
      session_id: "browser-session-1",
      target_id: "target-news-1",
      action: "navigate",
      request_id: "browser-action-news",
      data: {
        page_info: {
          title: "百度新闻",
          url: "https://news.baidu.com",
        },
      },
      error: undefined,
      attempts: [],
    });

    renderPage({
      projectId: "project-browser-intent",
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    const prompt =
      "打开 https://news.baidu.com，使用浏览器协助模式执行，并把实时浏览器画面显示在右侧画布中，然后告诉我页面主要内容。";
    const inputbarProps = mockInputbar.mock.calls.at(-1)?.[0] as
      | {
          onSend?: (payload?: MockInputbarSendPayload) => Promise<void>;
        }
      | undefined;

    act(() => {
      void inputbarProps?.onSend?.({ images: [], textOverride: prompt });
    });
    await flushEffects(12);

    expect(mockBrowserExecuteAction).toHaveBeenCalledWith({
      profile_key: "general_browser_assist",
      backend: "cdp_direct",
      action: "navigate",
      args: {
        action: "goto",
        url: "https://news.baidu.com",
        wait_for_page_info: true,
      },
      timeout_ms: 20000,
    });
    expect(sharedSendMessageMock).toHaveBeenCalledTimes(1);
    const sendCall = getSendMessageCall();
    expect(sendCall.content).toBe(prompt);
    expect(sendCall.images).toEqual([]);
    expect(sendCall.webSearch).toBeUndefined();
    expect(sendCall.thinking).toBeUndefined();
    expect(sendCall.skipUserMessage).toBe(false);
    expect(sendCall.executionStrategy).toBe("react");
    expect(sendCall.modelOverride).toBeUndefined();
    expect(sendCall.autoContinue).toBeUndefined();
    expect(sendCall.options).toEqual(
      expect.objectContaining({
        requestMetadata: expect.objectContaining({
          harness: expect.objectContaining({
            theme: "general",
            browser_assist: expect.objectContaining({
              enabled: true,
              profile_key: "general_browser_assist",
            }),
          }),
        }),
      }),
    );
    expect(mockJotaiState.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "browser-assist:general",
          type: "browser_assist",
          title: "百度新闻",
          meta: expect.objectContaining({
            sessionId: "browser-session-1",
            profileKey: "general_browser_assist",
            url: "https://news.baidu.com",
          }),
        }),
      ]),
    );
  });

  it("自动首条命中强浏览器任务时也应自动发送，并保留浏览器 requirement metadata", async () => {
    const onHasMessagesChange = vi.fn();
    const prompt = "帮我把这篇文章发布到微信公众号后台";

    renderPage({
      projectId: "project-browser-required-bootstrap",
      contentId: "content-browser-required-bootstrap",
      theme: "general",
      lockTheme: true,
      initialUserPrompt: prompt,
      autoRunInitialPromptOnMount: true,
      initialAutoSendRequestMetadata: {
        harness: {
          browser_assist: {
            enabled: true,
            profile_key: "general_browser_assist",
            preferred_backend: "lime_extension_bridge",
            auto_launch: false,
          },
        },
      },
      onHasMessagesChange,
    });
    await flushEffects(12);

    expect(sharedSendMessageMock).toHaveBeenCalledTimes(1);
    expect(sharedSendMessageMock.mock.calls[0]?.[0]).toBe(prompt);
    expect(sharedSendMessageMock.mock.calls[0]?.[8]).toMatchObject({
      requestMetadata: {
        harness: expect.objectContaining({
          browser_requirement: "required_with_user_step",
          browser_launch_url: "https://mp.weixin.qq.com/",
          browser_user_step_required: true,
          content_id: "content-browser-required-bootstrap",
          browser_assist: expect.objectContaining({
            enabled: true,
            profile_key: "general_browser_assist",
            preferred_backend: "lime_extension_bridge",
            auto_launch: false,
          }),
        }),
      },
    });
    expect(onHasMessagesChange).toHaveBeenCalled();
  });

  it("自动首条专家入口在尚无会话时也应创建发送计划", async () => {
    installMockAgentChatUnifiedState(
      createMockAgentChatUnifiedState({
        sessionId: null,
        topics: [],
      }),
    );

    const prompt = "请以营销策略专家身份帮我拆解增长方案";
    mockGetOrCreateDefaultProject.mockResolvedValue(
      createProject("project-expert-default"),
    );
    const container = renderPage({
      agentEntry: "claw",
      projectId: "default",
      theme: "general",
      lockTheme: true,
      newChatAt: 1234567890,
      initialUserPrompt: prompt,
      autoRunInitialPromptOnMount: true,
      initialAutoSendRequestMetadata: {
        expert: {
          expertId: "marketing-strategist",
        },
        harness: {
          expert: {
            expert_id: "marketing-strategist",
          },
        },
      },
    });
    await waitForElement(
      container,
      '[data-testid="workspace-shell-scene"]',
      80,
    );
    await flushEffects(12);

    const expertPanel = container.querySelector(
      '[data-testid="expert-info-panel"]',
    );
    expect(expertPanel).not.toBeNull();
    expect(expertPanel?.textContent).toMatch(/专家信息|Expert Info/);
    expect(expertPanel?.textContent).toContain("营销策略专家");
    expect(
      expertPanel?.querySelector('[data-testid="expert-info-section-memory"]'),
    ).not.toBeNull();
    expect(
      expertPanel?.querySelector('[data-testid="expert-info-skills"]'),
    ).not.toBeNull();
    expect(
      expertPanel?.querySelector('[data-testid="expert-info-workflow"]'),
    ).not.toBeNull();

    expect(sharedSendMessageMock).toHaveBeenCalledTimes(1);
    expect(sharedSendMessageMock.mock.calls[0]?.[0]).toBe(prompt);
    expect(sharedSendMessageMock.mock.calls[0]?.[8]).toMatchObject({
      requestMetadata: {
        expert: {
          expertId: "marketing-strategist",
        },
        harness: {
          expert: {
            expert_id: "marketing-strategist",
          },
        },
      },
      skipSessionRestore: true,
    });
  });

});
