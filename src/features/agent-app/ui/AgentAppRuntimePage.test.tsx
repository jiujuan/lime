import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { LIME_THEME_CHANGED_EVENT } from "@/lib/appearance/themeMode";
import {
  AGENT_APP_BRIDGE_PROTOCOL,
  AGENT_APP_BRIDGE_VERSION,
} from "../runtime/hostBridge";
import type { AppManifest } from "../types";
import {
  apiMocks,
  buildReadyState,
  contentFactoryManifest,
  dispatchBridgeMessage,
  flush,
  getRuntimeFrame,
  renderPage,
  runtimeApiMocks,
  useAgentAppRuntimePageTestLifecycle,
} from "./AgentAppRuntimePage.testFixtures";

describe("AgentAppRuntimePage", () => {
  useAgentAppRuntimePageTestLifecycle();

  it("启动 App 自己的 UI runtime，并用 iframe 打开 dashboard", async () => {
    const container = await renderPage();
    await flush();

    expect(apiMocks.startAgentAppUiRuntime).toHaveBeenCalledWith({
      appId: "content-factory-app",
      entryKey: "dashboard",
    });
    const frame = container.querySelector<HTMLIFrameElement>(
      '[data-testid="agent-app-runtime-frame"]',
    );
    expect(frame).not.toBeNull();
    expect(frame?.title).toBe("内容工厂");
    expect(frame?.getAttribute("src")).toBe("http://127.0.0.1:4199/dashboard");
    expect(container.textContent).not.toContain("运行条件");
    expect(container.textContent).not.toContain("交付物");
    expect(container.textContent).not.toContain("知识绑定");
    expect(container.textContent).not.toContain("UI Bundle");
    expect(container.textContent).not.toContain("已注入能力");
  });

  it("Host iframe chrome 默认只显示静默 App 信息图标，点击后展开版本信息", async () => {
    const container = await renderPage();
    await flush();

    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="agent-app-host-app-info-toggle"]',
    );
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-label")).toBe("查看 App 信息");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(
      container.querySelector('[data-testid="agent-app-host-app-info-panel"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="agent-app-host-app-info-update-dot"]',
      ),
    ).toBeNull();

    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });
    await flush();

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(
      container.querySelector('[data-testid="agent-app-host-app-info-panel"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("内容工厂");
    expect(container.textContent).toContain("当前版本 v0.3.0");
    expect(container.textContent).toContain("本地");
  });

  it("云端存在更高版本时，静默信息图标只显示红点，点击后才展示升级状态", async () => {
    apiMocks.getAgentAppCloudCatalog.mockResolvedValue({
      source: "remote",
      payload: {
        schemaVersion: "agent-app-cloud-bootstrap/v1",
        tenantId: "tenant-0001",
        generatedAt: "2026-05-15T00:00:00.000Z",
        apps: [
          {
            appId: "content-factory-app",
            displayName: "内容工厂",
            version: "0.4.0",
            releaseId: "content-factory-app-0.4.0",
            registrationRequired: false,
            registrationState: "not_required",
            enabled: true,
            packageUrl: "https://lime.local/content-factory-app-0.4.0.zip",
            packageHash:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            manifestHash:
              "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            capabilityRequirements: {},
            defaultEntries: ["dashboard"],
            policyDefaults: {},
            toolAvailability: [],
          },
        ],
      },
    });
    const container = await renderPage();
    await flush(12);

    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="agent-app-host-app-info-toggle"]',
    );
    expect(
      container.querySelector(
        '[data-testid="agent-app-host-app-info-update-dot"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("可升级");

    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });
    await flush();

    expect(container.textContent).toContain("可升级");
    expect(container.textContent).toContain("最新版本");
    expect(container.textContent).toContain("v0.4.0");
  });

  it("runtime surface 应先经过 P14 guard，needs-setup 时不启动 UI runtime", async () => {
    const container = await renderPage(
      buildReadyState({ setupResolved: false }),
    );
    await flush();

    expect(apiMocks.startAgentAppUiRuntime).not.toHaveBeenCalled();
    expect(container.textContent).toContain("App 打开失败");
    expect(container.textContent).toContain(
      "agentApp.lab.guard.summary.needs-setup",
    );
    expect(
      container.querySelector('[data-testid="agent-app-runtime-frame"]'),
    ).toBeNull();
  });

  it("iframe 加载后通过 Host Bridge 发送 Lime 主题和运行快照", async () => {
    document.documentElement.style.setProperty("--lime-brand", "#166534");
    const container = await renderPage();
    await flush();
    const frame = getRuntimeFrame(container);
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    await act(async () => {
      frame.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: AGENT_APP_BRIDGE_PROTOCOL,
        version: AGENT_APP_BRIDGE_VERSION,
        type: "host:snapshot",
        appId: "content-factory-app",
        entryKey: "dashboard",
        payload: expect.objectContaining({
          app: expect.objectContaining({
            appId: "content-factory-app",
            entryKey: "dashboard",
            displayName: "内容工厂",
            route: "/dashboard",
          }),
          theme: expect.objectContaining({
            tokens: expect.objectContaining({
              "--lime-brand": "#166534",
            }),
          }),
          capabilities: expect.objectContaining({
            available: expect.arrayContaining([
              "lime.capabilities",
              "lime.agent",
              "lime.storage",
            ]),
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
  });

  it("只有声明 lime.cloudSession 的 App 才能从 Host snapshot 读取用户态上下文", async () => {
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
      tenantId: "tenant-0001",
    };
    window.__LIME_SESSION_TOKEN__ = "secret-session-token";
    const state = buildReadyState({
      manifestPatch: {
        requires: {
          ...contentFactoryManifest.requires,
          capabilities: {
            ...((contentFactoryManifest as AppManifest).requires
              ?.capabilities ?? {}),
            "lime.cloudSession": "^0.1.0",
          },
        },
      },
    });
    const container = await renderPage(state);
    await flush();
    const frame = getRuntimeFrame(container);
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    await act(async () => {
      frame.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:snapshot",
        payload: expect.objectContaining({
          cloud: {
            controlPlaneBaseUrl: "https://user.limeai.run/api",
            tenantId: "tenant-0001",
            hasSession: true,
          },
          capabilities: expect.objectContaining({
            available: expect.arrayContaining(["lime.cloudSession"]),
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(
      JSON.stringify(postMessage.mock.calls.map(([message]) => message)),
    ).not.toContain("secret-session-token");
  });

  it("runtime page 会用当前 adapter profile 重算能力，避免沿用安装期旧 readiness 阻断 storage", async () => {
    const staleState = buildReadyState();
    staleState.readiness = {
      ...staleState.readiness,
      supportedCapabilities: staleState.readiness.supportedCapabilities.map(
        (item) =>
          item.capability === "lime.storage"
            ? { ...item, enabled: false, implementation: "none" }
            : item,
      ),
      missingCapabilities: [
        ...staleState.readiness.missingCapabilities,
        {
          capability: "lime.storage",
          requestedRange: "^0.3.0",
          required: true,
          declaredBy: ["requires"],
        },
      ],
    };
    const container = await renderPage(staleState);
    await flush();
    const frame = getRuntimeFrame(container);
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    await act(async () => {
      frame.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });
    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.storage",
        method: "set",
        input: {
          key: "projects/project-1/confirmations/content_batch",
          value: { status: "confirmed" },
        },
      },
      "storage-runtime-profile",
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:snapshot",
        payload: expect.objectContaining({
          capabilities: expect.objectContaining({
            available: expect.arrayContaining(["lime.storage"]),
            blocked: expect.not.arrayContaining(["lime.storage"]),
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "storage-runtime-profile",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            key: "projects/project-1/confirmations/content_batch",
            value: { status: "confirmed" },
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
  });

  it("App ready、主题切换和 capability 请求都走标准 Host Bridge 与 Lime Agent 能力", async () => {
    const container = await renderPage();
    await flush();
    const frame = getRuntimeFrame(container);
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    await dispatchBridgeMessage(frame, "app:ready");
    await act(async () => {
      window.dispatchEvent(new CustomEvent(LIME_THEME_CHANGED_EVENT));
      await Promise.resolve();
    });
    await dispatchBridgeMessage(frame, "capability:invoke", {
      capability: "lime.agent",
      method: "startTask",
      input: {
        title: "生成内容场景",
        prompt: "基于项目知识生成内容场景",
        taskKind: "content.scenario_planning",
        idempotencyKey: "dashboard:scenario",
        input: { projectId: "project-1" },
        expectedOutput: { artifactKind: "content_table" },
        humanReview: true,
      },
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:snapshot",
        appId: "content-factory-app",
        entryKey: "dashboard",
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "theme:update",
        appId: "content-factory-app",
        entryKey: "dashboard",
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "req-1",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            taskId: "agent-app-task-1",
            traceId: "agent-app-trace-1",
            status: "running",
            taskKind: "content.scenario_planning",
            humanReview: true,
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(runtimeApiMocks.startAgentAppRuntimeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "content-factory-app",
        entryKey: "dashboard",
        workspaceId: "workspace-1",
        taskKind: "content.scenario_planning",
        title: "生成内容场景",
        prompt: "基于项目知识生成内容场景",
        input: { projectId: "project-1" },
        expectedOutput: { artifactKind: "content_table" },
        humanReview: true,
      }),
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:error",
        payload: expect.objectContaining({
          code: "CAPABILITY_BLOCKED",
        }),
      }),
      expect.any(String),
    );
  });
});
