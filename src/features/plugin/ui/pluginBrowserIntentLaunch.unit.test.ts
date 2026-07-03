import { describe, expect, it, vi } from "vitest";
import {
  buildPluginBrowserIntentRightSurfaceRequestParams,
  requestPluginBrowserRightSurfaceIntent,
} from "./pluginBrowserIntentLaunch";

const entry = {
  key: "dashboard",
  kind: "page" as const,
  title: "项目首页",
  route: "/dashboard",
};

const browserIntent = {
  capability: "lime.browser",
  method: "open",
  status: "requires_agent_task",
  reason: "browser_runtime_execution_requires_lime_tool_runtime_policy",
  source: "tool_runtime_policy",
  intent: {
    url: "https://example.com/brief",
    workspaceId: "app-supplied-workspace",
    sessionId: "app-supplied-session",
  },
};

describe("pluginBrowserIntentLaunch", () => {
  it("应把 Plugin browser open intent 投递成 browser pending request", () => {
    expect(
      buildPluginBrowserIntentRightSurfaceRequestParams({
        appId: "content-factory-app",
        title: "内容工厂",
        entry,
        intentResponse: browserIntent,
        target: {
          workspaceId: "workspace-main",
          sessionId: "session-main",
        },
      }),
    ).toMatchObject({
      workspaceId: "workspace-main",
      sessionId: "session-main",
      surfaceKind: "browser",
      origin: "plugin",
      reason: "plugin_browser_intent",
      priority: "foreground",
      candidateId: "https://example.com/brief",
      ttlMs: 600000,
      metadata: {
        appId: "content-factory-app",
        title: "内容工厂",
        entry,
        source: {
          kind: "plugin_browser_intent",
          appId: "content-factory-app",
          entryKey: "dashboard",
          capability: "lime.browser",
          method: "open",
        },
        capability: "lime.browser",
        method: "open",
        launchUrl: "https://example.com/brief",
        intent: {
          url: "https://example.com/brief",
        },
        browser: {
          launchUrl: "https://example.com/brief",
          url: "https://example.com/brief",
          controlMode: "shared",
          lifecycleState: "waiting_for_human",
        },
        controlMode: "shared",
        lifecycleState: "waiting_for_human",
      },
    });
  });

  it("缺少宿主 target 时应跳过投递", async () => {
    await expect(
      requestPluginBrowserRightSurfaceIntent(
        {
          appId: "content-factory-app",
          entry,
          intentResponse: browserIntent,
        },
        {
          appServerClient: {
            request: vi.fn(),
          },
        },
      ),
    ).resolves.toEqual({
      status: "skipped",
      reason: "missing-target",
    });
  });

  it("非 browser/open intent 或缺少 URL 时应跳过投递", () => {
    expect(
      buildPluginBrowserIntentRightSurfaceRequestParams({
        appId: "content-factory-app",
        entry,
        intentResponse: {
          capability: "lime.search",
          method: "open",
          status: "requires_agent_task",
          intent: { url: "https://example.com" },
        },
        target: { sessionId: "session-main" },
      }),
    ).toBeNull();

    expect(
      buildPluginBrowserIntentRightSurfaceRequestParams({
        appId: "content-factory-app",
        entry,
        intentResponse: {
          capability: "lime.browser",
          method: "open",
          status: "requires_agent_task",
          intent: {},
        },
        target: { sessionId: "session-main" },
      }),
    ).toBeNull();
  });

  it("只信任宿主 target，不信任 App intent 自带 workspace/session", async () => {
    const request = vi.fn().mockResolvedValue({
      result: {
        status: "queued",
        requestId: "right-surface-request-1",
        pending: {
          requestId: "right-surface-request-1",
          surfaceKind: "browser",
          origin: "plugin",
          priority: "foreground",
          status: "pending",
          requestedAt: "2026-06-25T00:00:00.000Z",
          workspaceId: "host-workspace",
          sessionId: "host-session",
          candidateId: "https://example.com/brief",
        },
      },
    });

    const result = await requestPluginBrowserRightSurfaceIntent(
      {
        appId: "content-factory-app",
        entry,
        intentResponse: browserIntent,
        target: {
          workspaceId: "host-workspace",
          sessionId: "host-session",
        },
      },
      {
        appServerClient: { request },
      },
    );

    expect(result).toMatchObject({
      status: "requested",
      response: {
        requestId: "right-surface-request-1",
      },
      params: {
        workspaceId: "host-workspace",
        sessionId: "host-session",
      },
    });
    expect(request).toHaveBeenCalledWith(
      "workspaceRightSurface/request",
      expect.objectContaining({
        workspaceId: "host-workspace",
        sessionId: "host-session",
      }),
    );
    const [, params] = request.mock.calls[0];
    expect(JSON.stringify(params)).not.toContain("app-supplied-workspace");
    expect(JSON.stringify(params)).not.toContain("app-supplied-session");
  });
});
