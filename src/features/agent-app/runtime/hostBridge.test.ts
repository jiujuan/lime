import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_APP_BRIDGE_PROTOCOL,
  AGENT_APP_BRIDGE_VERSION,
  AgentAppHostBridge,
  buildAgentAppHostSnapshot,
  buildAgentAppThemePayload,
  isTrustedAgentAppBridgeMessage,
} from "./hostBridge";

const appId = "content-factory-app";
const entryKey = "dashboard";
const entryUrl = "http://127.0.0.1:4199/dashboard";
const runtimeOrigin = "http://127.0.0.1:4199";

function buildFrame() {
  const frame = document.createElement("iframe");
  frame.src = entryUrl;
  const appWindow = {
    postMessage: vi.fn(),
  } as unknown as Window;
  Object.defineProperty(frame, "contentWindow", {
    configurable: true,
    value: appWindow,
  });
  document.body.appendChild(frame);
  const postMessage = appWindow.postMessage as ReturnType<typeof vi.fn>;
  return { frame, postMessage };
}

function buildAppMessage(type: string, payload?: unknown, requestId = "req-1") {
  return {
    protocol: AGENT_APP_BRIDGE_PROTOCOL,
    version: AGENT_APP_BRIDGE_VERSION,
    type,
    requestId,
    appId,
    entryKey,
    payload,
  };
}

async function flushBridgeTasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("AgentAppHostBridge", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("style");
    vi.restoreAllMocks();
  });

  it("构建 host snapshot 时应携带 Lime 主题 token 和 Host 上下文", () => {
    document.documentElement.lang = "zh-CN";
    document.documentElement.style.setProperty("--lime-brand", "#166534");
    document.documentElement.style.setProperty("--app-primary", "#166534");

    const theme = buildAgentAppThemePayload();
    const snapshot = buildAgentAppHostSnapshot({
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
      runtimeOrigin,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    expect(theme.tokens).toMatchObject({
      "--lime-brand": "#166534",
      "--app-primary": "#166534",
    });
    expect(snapshot).toMatchObject({
      app: {
        appId,
        entryKey,
        displayName: "内容工厂",
        route: "/dashboard",
        runtimeOrigin,
      },
      host: {
        name: "Lime",
        bridgeProtocol: AGENT_APP_BRIDGE_PROTOCOL,
        bridgeVersion: AGENT_APP_BRIDGE_VERSION,
        locale: "zh-CN",
        sentAt: "2026-05-15T00:00:00.000Z",
      },
    });
  });

  it("只信任当前 iframe、runtime origin 和匹配 appId 的标准消息", () => {
    const { frame } = buildFrame();
    const trusted = new MessageEvent("message", {
      data: buildAppMessage("app:ready"),
      origin: runtimeOrigin,
      source: frame.contentWindow,
    });
    const wrongOrigin = new MessageEvent("message", {
      data: buildAppMessage("app:ready"),
      origin: "https://evil.example",
      source: frame.contentWindow,
    });
    const wrongProtocol = new MessageEvent("message", {
      data: { ...buildAppMessage("app:ready"), protocol: "legacy.app.bridge" },
      origin: runtimeOrigin,
      source: frame.contentWindow,
    });
    const missingEntryKey = new MessageEvent("message", {
      data: { ...buildAppMessage("app:ready"), entryKey: undefined },
      origin: runtimeOrigin,
      source: frame.contentWindow,
    });
    const wrongEntryKey = new MessageEvent("message", {
      data: { ...buildAppMessage("app:ready"), entryKey: "settings" },
      origin: runtimeOrigin,
      source: frame.contentWindow,
    });

    expect(
      isTrustedAgentAppBridgeMessage(trusted, {
        appWindow: frame.contentWindow,
        runtimeOrigin,
        appId,
        entryKey,
      })?.message.type,
    ).toBe("app:ready");
    expect(
      isTrustedAgentAppBridgeMessage(wrongOrigin, {
        appWindow: frame.contentWindow,
        runtimeOrigin,
        appId,
        entryKey,
      }),
    ).toBeNull();
    expect(
      isTrustedAgentAppBridgeMessage(wrongProtocol, {
        appWindow: frame.contentWindow,
        runtimeOrigin,
        appId,
        entryKey,
      }),
    ).toBeNull();
    expect(
      isTrustedAgentAppBridgeMessage(missingEntryKey, {
        appWindow: frame.contentWindow,
        runtimeOrigin,
        appId,
        entryKey,
      }),
    ).toBeNull();
    expect(
      isTrustedAgentAppBridgeMessage(wrongEntryKey, {
        appWindow: frame.contentWindow,
        runtimeOrigin,
        appId,
        entryKey,
      }),
    ).toBeNull();
  });

  it("App ready 后应补发 snapshot，主题事件应广播 theme:update", () => {
    const { frame, postMessage } = buildFrame();
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
      now: () => "2026-05-15T00:00:00.000Z",
    });
    const cleanup = bridge.start();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppMessage("app:ready"),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    window.dispatchEvent(new CustomEvent("lime-theme-changed"));

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: AGENT_APP_BRIDGE_PROTOCOL,
        type: "host:snapshot",
        appId,
        entryKey,
      }),
      runtimeOrigin,
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: AGENT_APP_BRIDGE_PROTOCOL,
        type: "theme:update",
        appId,
        entryKey,
      }),
      runtimeOrigin,
    );

    cleanup();
  });

  it("未开放 capability:invoke 时必须返回 host:error，不伪造成功结果", async () => {
    const { frame, postMessage } = buildFrame();
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
    });
    const cleanup = bridge.start();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppMessage("capability:invoke", {
          capability: "lime.storage",
          method: "set",
        }),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    await flushBridgeTasks();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:error",
        requestId: "req-1",
        payload: expect.objectContaining({
          ok: false,
          code: "capability_unavailable",
          causeCode: "CAPABILITY_BLOCKED",
          error: expect.objectContaining({
            code: "capability_unavailable",
            capability: "lime.storage",
            method: "set",
          }),
        }),
      }),
      runtimeOrigin,
    );

    cleanup();
  });

  it("host:toast 应调用宿主通知并返回 accepted response", async () => {
    const { frame, postMessage } = buildFrame();
    const notify = vi.fn();
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
      notify,
    });
    const cleanup = bridge.start();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppMessage("host:toast", {
          message: "已保存项目",
          level: "success",
        }),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    await flushBridgeTasks();

    expect(notify).toHaveBeenCalledWith({
      message: "已保存项目",
      level: "success",
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        payload: { accepted: true },
      }),
      runtimeOrigin,
    );

    cleanup();
  });

  it("host:navigate 只允许跳转到当前 App runtime origin", async () => {
    const { frame, postMessage } = buildFrame();
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
    });
    const cleanup = bridge.start();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppMessage("host:navigate", { route: "/knowledge" }),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    await flushBridgeTasks();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        payload: { navigatedTo: "/knowledge" },
      }),
      runtimeOrigin,
    );
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppMessage(
          "host:navigate",
          { url: "https://evil.example/phishing" },
          "req-cross-origin",
        ),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    await flushBridgeTasks();

    expect(frame.src).toBe("http://127.0.0.1:4199/knowledge");
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:error",
        requestId: "req-cross-origin",
        payload: expect.objectContaining({ code: "UNTRUSTED_URL" }),
      }),
      runtimeOrigin,
    );

    cleanup();
  });

  it("host:download 只允许下载当前 App runtime origin 的资源", async () => {
    const { frame, postMessage } = buildFrame();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
    });
    const cleanup = bridge.start();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppMessage("host:download", {
          url: "/exports/report.md",
          fileName: "report.md",
        }),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    await flushBridgeTasks();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppMessage(
          "host:download",
          { url: "https://evil.example/report.md" },
          "req-download-cross-origin",
        ),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    await flushBridgeTasks();

    expect(click).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        payload: { downloaded: true },
      }),
      runtimeOrigin,
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:error",
        requestId: "req-download-cross-origin",
        payload: expect.objectContaining({ code: "UNTRUSTED_URL" }),
      }),
      runtimeOrigin,
    );

    cleanup();
  });

  it("host:openExternal 只允许 http/https 外链", async () => {
    const { frame, postMessage } = buildFrame();
    const openExternal = vi.fn();
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
      openExternal,
    });
    const cleanup = bridge.start();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppMessage("host:openExternal", {
          url: "https://lime.ai",
        }),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    await flushBridgeTasks();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppMessage(
          "host:openExternal",
          { url: "javascript:alert(1)" },
          "req-script-url",
        ),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    await flushBridgeTasks();

    expect(openExternal).toHaveBeenCalledWith("https://lime.ai/");
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        payload: { opened: true },
      }),
      runtimeOrigin,
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:error",
        requestId: "req-script-url",
        payload: expect.objectContaining({ code: "UNTRUSTED_URL" }),
      }),
      runtimeOrigin,
    );

    cleanup();
  });

  it("开放 capability dispatcher 时应把 App 作用域请求转给 Host 并返回结果", async () => {
    const { frame, postMessage } = buildFrame();
    const dispatchCapability = vi.fn().mockResolvedValue({
      taskId: "task-1",
      traceId: "trace-1",
      status: "running",
    });
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
      dispatchCapability,
    });
    const cleanup = bridge.start();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppMessage("capability:invoke", {
          capability: "lime.agent",
          method: "startTask",
          args: {
            title: "生成内容场景",
            taskKind: "content.scenario_planning",
          },
          idempotencyKey: "dashboard:scenario",
          expectedSchema: { type: "object" },
          provenance: {
            appId,
            entryKey,
            packageHash:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            manifestHash:
              "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            workflowRunId: "run-1",
          },
        }),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    await flushBridgeTasks();

    expect(dispatchCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        appId,
        entryKey,
        requestId: "req-1",
        capability: "lime.agent",
        method: "startTask",
        input: {
          title: "生成内容场景",
          taskKind: "content.scenario_planning",
        },
        idempotencyKey: "dashboard:scenario",
        expectedSchema: { type: "object" },
        provenance: {
          appId,
          entryKey,
          packageHash:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          manifestHash:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          workflowRunId: "run-1",
        },
        invokeRequest: expect.objectContaining({
          capability: "lime.agent",
          method: "startTask",
          args: {
            title: "生成内容场景",
            taskKind: "content.scenario_planning",
          },
          requestId: "req-1",
          idempotencyKey: "dashboard:scenario",
          expectedSchema: { type: "object" },
          provenance: expect.objectContaining({
            appId,
            entryKey,
            workflowRunId: "run-1",
          }),
        }),
        rawPayload: expect.objectContaining({
          capability: "lime.agent",
          method: "startTask",
        }),
      }),
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "req-1",
        payload: expect.objectContaining({
          ok: true,
          value: expect.objectContaining({
            taskId: "task-1",
            traceId: "trace-1",
            status: "running",
            process: expect.objectContaining({
              terminal: false,
              collapsedByDefault: false,
            }),
          }),
          result: expect.objectContaining({
            taskId: "task-1",
            traceId: "trace-1",
            status: "running",
            runtimeProcess: expect.objectContaining({
              terminal: false,
              collapsedByDefault: false,
            }),
          }),
        }),
      }),
      runtimeOrigin,
    );

    cleanup();
  });

  it("支持订阅 lime.agent task 并把 Host 侧更新推送回 App iframe", async () => {
    vi.useFakeTimers();
    const { frame, postMessage } = buildFrame();
    const dispatchCapability = vi.fn().mockResolvedValue({
      taskId: "task-1",
      taskStatus: "running",
      taskEvents: [{ eventType: "task:progress", message: "任务正在执行" }],
    });
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
      dispatchCapability,
      listenRuntimeEvent: async () => () => undefined,
      now: () => "2026-05-16T00:00:00.000Z",
    });
    const cleanup = bridge.start();

    try {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: buildAppMessage("capability:subscribe", {
            capability: "lime.agent",
            topic: "task",
            input: { taskId: "task-1", bridgeAction: "contentFactoryProduction" },
            pollIntervalMs: 250,
          }),
          origin: runtimeOrigin,
          source: frame.contentWindow,
        }),
      );
      await flushBridgeTasks();

      expect(dispatchCapability).toHaveBeenCalledWith(
        expect.objectContaining({
          appId,
          entryKey,
          capability: "lime.agent",
          method: "getTask",
          input: { taskId: "task-1" },
        }),
      );
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "host:response",
          requestId: "req-1",
          payload: expect.objectContaining({
            subscriptionId: "agent-app-subscription-1",
            taskId: "task-1",
            bridgeAction: "contentFactoryProduction",
          }),
        }),
        runtimeOrigin,
      );
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "capability:event",
          payload: expect.objectContaining({
            subscriptionId: "agent-app-subscription-1",
            capability: "lime.agent",
            topic: "task",
            eventType: "task:update",
            taskId: "task-1",
            bridgeAction: "contentFactoryProduction",
            events: [{ eventType: "task:progress", message: "任务正在执行" }],
            process: expect.objectContaining({
              terminal: false,
              collapsedByDefault: false,
              timeline: expect.arrayContaining([
                expect.objectContaining({ message: "任务正在执行" }),
              ]),
            }),
          }),
        }),
        runtimeOrigin,
      );

      window.dispatchEvent(
        new MessageEvent("message", {
          data: buildAppMessage("capability:unsubscribe", {
            subscriptionId: "agent-app-subscription-1",
          }),
          origin: runtimeOrigin,
          source: frame.contentWindow,
        }),
      );
      await flushBridgeTasks();
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "host:response",
          payload: {
            subscriptionId: "agent-app-subscription-1",
            unsubscribed: true,
          },
        }),
        runtimeOrigin,
      );
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("订阅 task 时应同时接入 AgentRuntime event bus 并转发运行时事件", async () => {
    vi.useFakeTimers();
    const { frame, postMessage } = buildFrame();
    let runtimeHandler:
      | ((event: { payload: unknown }) => void)
      | undefined;
    const runtimeUnlisten = vi.fn();
    const listenRuntimeEventMock = vi.fn(
      async (
        _eventName: string,
        handler: (event: { payload: unknown }) => void,
      ) => {
        runtimeHandler = handler;
        return runtimeUnlisten;
      },
    );
    const listenRuntimeEvent =
      listenRuntimeEventMock as unknown as typeof import("@/lib/dev-bridge").safeListen;
    const dispatchCapability = vi.fn().mockResolvedValue({
      taskId: "task-1",
      taskStatus: "running",
      taskEvents: [],
    });
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
      dispatchCapability,
      listenRuntimeEvent,
      now: () => "2026-05-16T00:00:00.000Z",
    });
    const cleanup = bridge.start();

    try {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: buildAppMessage("capability:subscribe", {
            capability: "lime.agent",
            topic: "task",
            input: { taskId: "task-1", bridgeAction: "contentFactoryProduction" },
            pollIntervalMs: 250,
          }),
          origin: runtimeOrigin,
          source: frame.contentWindow,
        }),
      );
      await flushBridgeTasks();

      expect(listenRuntimeEventMock).toHaveBeenCalledWith(
        "agent_app_runtime:content-factory-app:task-1",
        expect.any(Function),
      );

      runtimeHandler?.({
        payload: {
          type: "task:progress",
          status: "running",
          message: "后端 runtime event 已到达",
          streamKind: "thinking_delta",
          delta: "先判断任务边界。",
        },
      });

      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "capability:event",
          payload: expect.objectContaining({
            subscriptionId: "agent-app-subscription-1",
            eventType: "task:runtimeEvent",
            taskId: "task-1",
            bridgeAction: "contentFactoryProduction",
            runtimeEventName: "agent_app_runtime:content-factory-app:task-1",
            events: [
              expect.objectContaining({
                eventType: "task:progress",
                message: "后端 runtime event 已到达",
              }),
            ],
            process: expect.objectContaining({
              thinkingText: "先判断任务边界。",
              timeline: expect.arrayContaining([
                expect.objectContaining({ title: "思考过程" }),
              ]),
            }),
          }),
        }),
        runtimeOrigin,
      );

      window.dispatchEvent(
        new MessageEvent("message", {
          data: buildAppMessage("capability:unsubscribe", {
            subscriptionId: "agent-app-subscription-1",
          }),
          origin: runtimeOrigin,
          source: frame.contentWindow,
        }),
      );
      await flushBridgeTasks();
      expect(runtimeUnlisten).toHaveBeenCalled();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("Host 已封装 runtimeProcess 时应优先转发 canonical 过程而不是从事件重建", async () => {
    vi.useFakeTimers();
    const { frame, postMessage } = buildFrame();
    let runtimeHandler:
      | ((event: { payload: unknown }) => void)
      | undefined;
    const listenRuntimeEventMock = vi.fn(
      async (
        _eventName: string,
        handler: (event: { payload: unknown }) => void,
      ) => {
        runtimeHandler = handler;
        return vi.fn();
      },
    );
    const listenRuntimeEvent =
      listenRuntimeEventMock as unknown as typeof import("@/lib/dev-bridge").safeListen;
    const dispatchCapability = vi.fn().mockResolvedValue({
      taskId: "task-1",
      taskStatus: "running",
      taskEvents: [{ eventType: "task:progress", message: "已有订阅事件" }],
    });
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
      dispatchCapability,
      listenRuntimeEvent,
      now: () => "2026-05-16T00:00:00.000Z",
    });
    const cleanup = bridge.start();

    try {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: buildAppMessage("capability:subscribe", {
            capability: "lime.agent",
            topic: "task",
            input: { taskId: "task-1", bridgeAction: "contentFactoryProduction" },
            pollIntervalMs: 250,
          }),
          origin: runtimeOrigin,
          source: frame.contentWindow,
        }),
      );
      await flushBridgeTasks();

      runtimeHandler?.({
        payload: {
          eventType: "task:runtimeEvent",
          message: "底层事件只是增量",
          runtimeProcess: {
            timeline: [
              {
                kind: "output",
                title: "Host canonical 过程",
                statusText: "流式输出",
                message: "后端封装全文",
              },
            ],
            streamText: "后端封装全文",
            thinkingText: "后端思考",
            executionText: "后端执行",
            skillNames: ["article-writer"],
            invokedSkillNames: ["article-writer"],
            model: { provider: "openai", model: "gpt-4.1", label: "openai/gpt-4.1" },
            usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
            cost: { estimatedTotalCost: 0.0002, currency: "USD" },
            terminal: false,
            collapsedByDefault: false,
            routingCount: 1,
            executionCount: 1,
            artifactCount: 0,
          },
        },
      });

      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "capability:event",
          payload: expect.objectContaining({
            eventType: "task:runtimeEvent",
            process: expect.objectContaining({
              streamText: "后端封装全文",
              thinkingText: "后端思考",
              executionText: "后端执行",
              usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
              timeline: [
                expect.objectContaining({
                  title: "Host canonical 过程",
                  message: "后端封装全文",
                }),
              ],
            }),
          }),
        }),
        runtimeOrigin,
      );
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });


  it("成功终态未带 artifact 时应继续短轮询直到最终 patch replay", async () => {
    vi.useFakeTimers();
    const { frame, postMessage } = buildFrame();
    const dispatchCapability = vi
      .fn()
      .mockResolvedValueOnce({
        taskId: "task-1",
        taskStatus: "completed",
        events: [{ eventType: "task:completed", message: "任务已完成" }],
      })
      .mockResolvedValueOnce({
        taskId: "task-1",
        taskStatus: "completed",
        events: [{ eventType: "task:completed", message: "任务已完成" }],
        result: {
          artifacts: [
            {
              path: ".lime/artifacts/content-batch.json",
              title: "内容批次已创建",
              metadata: {
                workspacePatch: {
                  kind: "content_batch",
                  contentBatch: { count: 20 },
                },
              },
            },
          ],
        },
      });
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
      dispatchCapability,
      listenRuntimeEvent: async () => () => undefined,
      now: () => "2026-05-16T00:00:00.000Z",
    });
    const cleanup = bridge.start();

    try {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: buildAppMessage("capability:subscribe", {
            capability: "lime.agent",
            topic: "task",
            input: { taskId: "task-1", bridgeAction: "contentFactoryProduction" },
            pollIntervalMs: 250,
          }),
          origin: runtimeOrigin,
          source: frame.contentWindow,
        }),
      );
      await flushBridgeTasks();

      expect(dispatchCapability).toHaveBeenCalledTimes(1);
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "capability:event",
          payload: expect.objectContaining({
            taskId: "task-1",
            events: [{ eventType: "task:completed", message: "任务已完成" }],
          }),
        }),
        runtimeOrigin,
      );

      await vi.advanceTimersByTimeAsync(250);
      await flushBridgeTasks();

      expect(dispatchCapability).toHaveBeenCalledTimes(2);
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "capability:event",
          payload: expect.objectContaining({
            taskId: "task-1",
            events: expect.arrayContaining([
              expect.objectContaining({
                eventType: "artifact:created",
                payload: expect.objectContaining({
                  contentFactoryWorkspacePatch: expect.objectContaining({
                    contentBatch: { count: 20 },
                  }),
                }),
              }),
            ]),
          }),
        }),
        runtimeOrigin,
      );
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("capability dispatcher 的结构化错误码应透传给 App", async () => {
    const { frame, postMessage } = buildFrame();
    const error = Object.assign(new Error("不支持该能力方法。"), {
      code: "UNSUPPORTED_CAPABILITY_METHOD",
    });
    const bridge = new AgentAppHostBridge({
      frame,
      appId,
      entryKey,
      displayName: "内容工厂",
      entryRoute: "/dashboard",
      entryUrl,
      dispatchCapability: vi.fn().mockRejectedValue(error),
    });
    const cleanup = bridge.start();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppMessage("capability:invoke", {
          capability: "lime.agent",
          method: "retryTask",
          input: { taskId: "task-1" },
        }),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    await flushBridgeTasks();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:error",
        requestId: "req-1",
        payload: expect.objectContaining({
          ok: false,
          code: "capability_unavailable",
          message: "不支持该能力方法。",
          causeCode: "UNSUPPORTED_CAPABILITY_METHOD",
          error: expect.objectContaining({
            code: "capability_unavailable",
            capability: "lime.agent",
            method: "retryTask",
            causeCode: "UNSUPPORTED_CAPABILITY_METHOD",
          }),
        }),
      }),
      runtimeOrigin,
    );

    cleanup();
  });
});
