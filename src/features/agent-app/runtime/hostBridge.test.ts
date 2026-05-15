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
          code: "CAPABILITY_BLOCKED",
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
          input: {
            title: "生成内容场景",
            taskKind: "content.scenario_planning",
          },
        }),
        origin: runtimeOrigin,
        source: frame.contentWindow,
      }),
    );
    await flushBridgeTasks();

    expect(dispatchCapability).toHaveBeenCalledWith({
      appId,
      entryKey,
      requestId: "req-1",
      capability: "lime.agent",
      method: "startTask",
      input: {
        title: "生成内容场景",
        taskKind: "content.scenario_planning",
      },
      rawPayload: expect.objectContaining({
        capability: "lime.agent",
        method: "startTask",
      }),
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "req-1",
        payload: {
          result: {
            taskId: "task-1",
            traceId: "trace-1",
            status: "running",
          },
        },
      }),
      runtimeOrigin,
    );

    cleanup();
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
        payload: {
          code: "UNSUPPORTED_CAPABILITY_METHOD",
          message: "不支持该能力方法。",
        },
      }),
      runtimeOrigin,
    );

    cleanup();
  });
});
