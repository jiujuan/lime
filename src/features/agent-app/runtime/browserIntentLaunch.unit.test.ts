import { describe, expect, it, vi } from "vitest";
import { wrapAgentAppCapabilityDispatchWithBrowserIntentLaunch } from "./browserIntentLaunch";

describe("browserIntentLaunch", () => {
  it("应在 browser open intent 后请求 Right Surface browser", async () => {
    const requestBrowserIntent = vi.fn().mockResolvedValue({
      status: "requested",
      response: {
        requestId: "right-surface-request-1",
        status: "queued",
        pending: {
          requestId: "right-surface-request-1",
          surfaceKind: "browser",
          origin: "agent_app",
          priority: "foreground",
          status: "pending",
          requestedAt: "2026-06-25T00:00:00.000Z",
          workspaceId: "workspace-main",
          sessionId: "session-main",
          candidateId: "https://example.com/brief",
        },
      },
      params: {
        workspaceId: "workspace-main",
        sessionId: "session-main",
      },
    });
    const dispatchCapability = vi.fn().mockResolvedValue({
      capability: "lime.browser",
      method: "open",
      status: "requires_agent_task",
      intent: {
        url: "https://example.com/brief",
      },
    });

    const wrapped = wrapAgentAppCapabilityDispatchWithBrowserIntentLaunch(
      dispatchCapability,
      {
        appId: "content-factory-app",
        title: "内容工厂",
        entry: {
          key: "dashboard",
          kind: "page",
          title: "项目首页",
          route: "/dashboard",
        },
        target: {
          workspaceId: "workspace-main",
          sessionId: "session-main",
        },
      },
      {
        requestBrowserIntent,
      },
    );

    const result = await wrapped({
      capability: "lime.browser",
      method: "open",
    });

    expect(result).toEqual({
      capability: "lime.browser",
      method: "open",
      status: "requires_agent_task",
      intent: {
        url: "https://example.com/brief",
      },
    });
    expect(requestBrowserIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "content-factory-app",
        title: "内容工厂",
        target: {
          workspaceId: "workspace-main",
          sessionId: "session-main",
        },
      }),
    );
  });

  it("非 browser open intent 不应触发 browser 请求", async () => {
    const requestBrowserIntent = vi.fn();
    const dispatchCapability = vi.fn().mockResolvedValue({
      capability: "lime.search",
      method: "open",
      status: "requires_agent_task",
      intent: { url: "https://example.com/brief" },
    });

    const wrapped = wrapAgentAppCapabilityDispatchWithBrowserIntentLaunch(
      dispatchCapability,
      {
        appId: "content-factory-app",
        title: "内容工厂",
        entry: {
          key: "dashboard",
          kind: "page",
          title: "项目首页",
          route: "/dashboard",
        },
      },
      {
        requestBrowserIntent,
      },
    );

    await wrapped({
      capability: "lime.search",
      method: "open",
    });

    expect(requestBrowserIntent).not.toHaveBeenCalled();
  });
});
