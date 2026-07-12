import { describe, expect, it, vi } from "vitest";
import { APP_SERVER_METHOD_AGENT_SESSION_EVENT } from "@/lib/api/appServer";
import { searchThemeContextWithAppServer } from "./themeContextSearch";

function appServerClientMock() {
  const client = {
    startSession: vi.fn(),
    startTurn: vi.fn(),
    readSession: vi.fn(),
  };

  client.startSession.mockResolvedValue({
    id: 1,
    result: {
      session: {
        sessionId: "__lime_theme_context_search__-session",
        threadId: "thread-theme-context-search",
        appId: "desktop",
        workspaceId: "workspace-1",
        status: "idle",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    },
    response: { id: 1, result: {} },
    notifications: [],
    messages: [],
  });

  client.startTurn.mockImplementation(async (params) => ({
    id: 2,
    result: {
      turn: {
        turnId: params.turnId,
        sessionId: params.sessionId,
        threadId: "thread-theme-context-search",
        status: "completed",
        startedAt: "2026-06-08T00:00:01.000Z",
        completedAt: "2026-06-08T00:00:02.000Z",
      },
    },
    response: { id: 2, result: {} },
    notifications: [
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            type: "turn.completed",
            turnId: params.turnId,
            payload: {
              attempts: "web search completed",
            },
          },
        },
      },
    ],
    messages: [],
  }));

  client.readSession.mockImplementation(async () => {
    const turnId = client.startTurn.mock.calls[0]?.[0]?.turnId ?? "turn-1";
    const rawResponse = JSON.stringify({
      title: "国际新闻速览",
      summary: "今天国际新闻聚焦地缘政治、市场波动与科技监管。",
      citations: [{ title: "Example", url: "https://example.com/news" }],
    });
    return {
      id: 3,
      result: {
        session: {
          sessionId: "__lime_theme_context_search__-session",
          threadId: "thread-theme-context-search",
          appId: "desktop",
          workspaceId: "workspace-1",
          status: "completed",
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:02.000Z",
        },
        turns: [],
        detail: {
          messages: [
            {
              id: `${turnId}:assistant`,
              role: "assistant",
              content: [{ type: "text", text: rawResponse }],
            },
          ],
        },
      },
      response: { id: 3, result: {} },
      notifications: [],
      messages: [],
    };
  });

  return client;
}

describe("themeContextSearch API", () => {
  it("应通过 App Server current session turn 执行上下文搜索", async () => {
    const appServerClient = appServerClientMock();

    const result = await searchThemeContextWithAppServer(
      {
        workspaceId: " workspace-1 ",
        projectId: " project-1 ",
        providerType: " openai-compatible ",
        model: " gpt-4.1-mini ",
        query: " 今天的国际新闻 ",
        mode: "web",
      },
      appServerClient,
    );

    expect(result.rawResponse).toContain("国际新闻速览");
    expect(result.attemptsSummary).toBe("web search completed");
    expect(appServerClient.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: expect.stringMatching(/^__lime_theme_context_search__-/),
        appId: "desktop",
        workspaceId: "workspace-1",
        businessObjectRef: expect.objectContaining({
          kind: "agent.session",
          title: "上下文搜索",
          metadata: expect.objectContaining({
            hiddenFromUserRecents: true,
            source: "theme_context_search",
            executionStrategy: "react",
            providerSelector: "openai-compatible",
            modelName: "gpt-4.1-mini",
          }),
        }),
      }),
    );

    expect(appServerClient.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: expect.stringMatching(/^__lime_theme_context_search__-/),
        turnId: expect.stringMatching(/^turn-theme-context-search-/),
        input: expect.objectContaining({
          text: expect.stringContaining("检索主题：今天的国际新闻"),
        }),
        runtimeOptions: expect.objectContaining({
          stream: true,
          runtimeRequest: expect.objectContaining({
            providerPreference: "openai-compatible",
            modelPreference: "gpt-4.1-mini",
          }),
        }),
        queueIfBusy: false,
        skipPreSubmitResume: true,
      }),
    );

    const startTurnParams = appServerClient.startTurn.mock.calls[0]?.[0];
    expect(startTurnParams?.runtimeOptions).not.toHaveProperty(
      "providerPreference",
    );
    expect(startTurnParams?.runtimeOptions).not.toHaveProperty(
      "modelPreference",
    );
    expect(startTurnParams?.runtimeOptions).not.toHaveProperty("metadata");
    const serialized = JSON.stringify(startTurnParams);
    expect(serialized).not.toContain("web_search");
    expect(serialized).not.toContain("webSearch");
    expect(serialized).not.toContain("search_mode");
    expect(serialized).not.toContain("searchMode");
  });

  it("read model 尚未水合时应使用同 turn 的 message.delta 输出", async () => {
    const appServerClient = appServerClientMock();

    appServerClient.readSession.mockResolvedValue({
      id: 3,
      result: {
        session: {
          sessionId: "__lime_theme_context_search__-session",
          threadId: "thread-theme-context-search",
          appId: "desktop",
          workspaceId: "workspace-1",
          status: "completed",
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:02.000Z",
        },
        turns: [],
        detail: {
          messages: [],
        },
      },
      response: { id: 3, result: {} },
      notifications: [],
      messages: [],
    });
    appServerClient.startTurn.mockImplementation(async (params) => ({
      id: 2,
      result: {
        turn: {
          turnId: params.turnId,
          sessionId: params.sessionId,
          threadId: "thread-theme-context-search",
          status: "completed",
          startedAt: "2026-06-08T00:00:01.000Z",
          completedAt: "2026-06-08T00:00:02.000Z",
        },
      },
      response: { id: 2, result: {} },
      notifications: [
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              type: "message.delta",
              turnId: params.turnId,
              payload: {
                text: '{"title":"社媒趋势","summary":"社媒讨论正在升温",',
              },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              type: "message.delta",
              turnId: params.turnId,
              payload: {
                text: '"citations":[{"title":"Example","url":"https://example.com"}]}',
              },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              type: "turn.completed",
              turnId: params.turnId,
              payload: {
                attemptsSummary: "notifications completed",
              },
            },
          },
        },
      ],
      messages: [],
    }));

    const result = await searchThemeContextWithAppServer(
      {
        workspaceId: "workspace-1",
        providerType: "openai-compatible",
        model: "gpt-4.1-mini",
        query: "社媒趋势",
        mode: "social",
      },
      appServerClient,
    );

    expect(result.rawResponse).toContain("社媒趋势");
    expect(result.attemptsSummary).toBe("notifications completed");
  });

  it("App Server 未返回 assistant 输出时应 fail closed", async () => {
    const appServerClient = appServerClientMock();

    appServerClient.readSession.mockResolvedValue({
      id: 3,
      result: {
        session: {
          sessionId: "__lime_theme_context_search__-session",
          threadId: "thread-theme-context-search",
          appId: "desktop",
          workspaceId: "workspace-1",
          status: "completed",
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:02.000Z",
        },
        turns: [],
        detail: {
          messages: [],
        },
      },
      response: { id: 3, result: {} },
      notifications: [],
      messages: [],
    });

    await expect(
      searchThemeContextWithAppServer(
        {
          workspaceId: "workspace-1",
          providerType: "openai-compatible",
          model: "gpt-4.1-mini",
          query: "国际新闻",
          mode: "web",
        },
        appServerClient,
      ),
    ).rejects.toThrow("App Server 上下文搜索未返回 assistant 输出");
    expect(appServerClient.readSession).toHaveBeenCalled();
  });

  it("缺少模型配置时应 fail closed", async () => {
    const appServerClient = appServerClientMock();

    await expect(
      searchThemeContextWithAppServer(
        {
          workspaceId: "workspace-1",
          providerType: " ",
          model: "gpt-4.1-mini",
          query: "国际新闻",
          mode: "web",
        },
        appServerClient,
      ),
    ).rejects.toThrow("当前未选择可用模型，无法执行上下文搜索");

    expect(appServerClient.startSession).not.toHaveBeenCalled();
    expect(appServerClient.startTurn).not.toHaveBeenCalled();
  });
});
