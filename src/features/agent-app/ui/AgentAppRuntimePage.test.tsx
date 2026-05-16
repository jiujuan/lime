import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIME_THEME_CHANGED_EVENT } from "@/lib/appearance/themeMode";
import {
  AGENT_APP_BRIDGE_PROTOCOL,
  AGENT_APP_BRIDGE_VERSION,
} from "../runtime/hostBridge";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildInstalledAgentAppState } from "../install/installedAppState";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { buildAgentAppLabResolvedSetupState } from "../install/labInstallFlow";
import { buildPackageIdentity } from "../install/packageIdentity";
import { buildWorkflowRuntimeCapabilityProfile } from "../runtime/workflowRuntimeCapabilityProfile";
import type { AppManifest, InstalledAgentAppState } from "../types";
import { AgentAppRuntimePage } from "./AgentAppRuntimePage";

const LOCAL_APP_DIR = "/tmp/lime/content-factory-app";

const apiMocks = vi.hoisted(() => ({
  listInstalledAgentApps: vi.fn(),
  startAgentAppUiRuntime: vi.fn(),
}));

const runtimeApiMocks = vi.hoisted(() => ({
  startAgentAppRuntimeTask: vi.fn(),
  getAgentAppRuntimeTask: vi.fn(),
  cancelAgentAppRuntimeTask: vi.fn(),
  submitAgentAppRuntimeHostResponse: vi.fn(),
}));

const projectApiMocks = vi.hoisted(() => ({
  getOrCreateDefaultProject: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  toast: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

const i18nMocks = vi.hoisted(() => ({
  t: (key: string, params?: Record<string, unknown>) => {
    const labels: Record<string, string> = {
      "agentApp.apps.runtime.loading": "正在加载已安装 App...",
      "agentApp.apps.runtime.empty":
        "还没有可使用的已安装 Agent App。请先到 Agent Apps 安装。",
      "agentApp.apps.runtime.opening": `正在打开 ${String(params?.name)}...`,
      "agentApp.apps.runtime.openFailed": "App 打开失败",
      "agentApp.apps.runtime.retry": "重新打开",
      "agentApp.apps.runtime.unavailable": "该 Agent App 暂不可用。",
    };
    return labels[key] ?? key;
  },
}));

vi.mock("@/lib/api/agentApps", () => ({
  listInstalledAgentApps: apiMocks.listInstalledAgentApps,
  startAgentAppUiRuntime: apiMocks.startAgentAppUiRuntime,
}));

vi.mock("@/lib/api/agentAppRuntime", () => ({
  startAgentAppRuntimeTask: runtimeApiMocks.startAgentAppRuntimeTask,
  getAgentAppRuntimeTask: runtimeApiMocks.getAgentAppRuntimeTask,
  cancelAgentAppRuntimeTask: runtimeApiMocks.cancelAgentAppRuntimeTask,
  submitAgentAppRuntimeHostResponse:
    runtimeApiMocks.submitAgentAppRuntimeHostResponse,
}));

vi.mock("@/lib/api/project", () => ({
  getOrCreateDefaultProject: projectApiMocks.getOrCreateDefaultProject,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: i18nMocks.t,
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(toastMocks.toast, {
    error: toastMocks.error,
    success: toastMocks.success,
  }),
}));

interface MountedPage {
  container: HTMLDivElement;
  root: Root;
}

const mountedPages: MountedPage[] = [];

function buildReadyState(
  params: { setupResolved?: boolean } = {},
): InstalledAgentAppState {
  const manifest = contentFactoryFixture as AppManifest;
  const loadedAt = "2026-05-15T00:00:00.000Z";
  const identity = buildPackageIdentity({
    manifest,
    sourceKind: "local_folder",
    sourceUri: LOCAL_APP_DIR,
    loadedAt,
  });
  const profile = buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
  const setupPreview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    profile,
    loadedAt,
    checkedAt: loadedAt,
    generatedAt: loadedAt,
  });
  const setup =
    params.setupResolved === false
      ? undefined
      : buildAgentAppLabResolvedSetupState(setupPreview.projection);
  const preview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    setup,
    profile,
    loadedAt,
    checkedAt: loadedAt,
    generatedAt: loadedAt,
  });

  return buildInstalledAgentAppState({
    preview,
    setup,
    installedAt: loadedAt,
    updatedAt: loadedAt,
  });
}

async function renderPage(state = buildReadyState()) {
  apiMocks.listInstalledAgentApps.mockResolvedValue({
    states: [state],
    issues: [],
  });
  apiMocks.startAgentAppUiRuntime.mockResolvedValue({
    appId: state.appId,
    status: "running",
    baseUrl: "http://127.0.0.1:4199",
    entryUrl: "http://127.0.0.1:4199/dashboard",
    port: 4199,
    pid: 41990,
    entryKey: "dashboard",
    route: "/dashboard",
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <AgentAppRuntimePage
        pageParams={{
          appId: state.appId,
          entryKey: "dashboard",
          launchRequestKey: 1,
        }}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  mountedPages.push({ container, root });
  return container;
}

async function flush(times = 8) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

function getRuntimeFrame(container: HTMLElement): HTMLIFrameElement {
  const frame = container.querySelector<HTMLIFrameElement>(
    '[data-testid="agent-app-runtime-frame"]',
  );
  if (!frame) {
    throw new Error("runtime frame not found");
  }
  return frame;
}

function buildAppBridgeMessage(
  type: string,
  payload?: unknown,
  requestId = "req-1",
) {
  return {
    protocol: AGENT_APP_BRIDGE_PROTOCOL,
    version: AGENT_APP_BRIDGE_VERSION,
    type,
    requestId,
    appId: "content-factory-app",
    entryKey: "dashboard",
    payload,
  };
}

async function dispatchBridgeMessage(
  frame: HTMLIFrameElement,
  type: string,
  payload?: unknown,
  requestId = "req-1",
  origin = "http://127.0.0.1:4199",
) {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: buildAppBridgeMessage(type, payload, requestId),
        origin,
        source: frame.contentWindow,
      }),
    );
    await Promise.resolve();
  });
}

describe("AgentAppRuntimePage", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let runtimeTaskCounter = 0;
    projectApiMocks.getOrCreateDefaultProject.mockResolvedValue({
      id: "workspace-1",
    });
    runtimeApiMocks.startAgentAppRuntimeTask.mockImplementation(
      async (request) => {
        runtimeTaskCounter += 1;
        return {
          appId: request.appId,
          entryKey: request.entryKey,
          taskId: `agent-app-task-${runtimeTaskCounter}`,
          traceId: `agent-app-trace-${runtimeTaskCounter}`,
          taskKind: request.taskKind,
          sessionId: request.sessionId ?? "agent-app-session-1",
          turnId: `agent-app-turn-${runtimeTaskCounter}`,
          eventName: `agent_app_runtime:${request.appId}:agent-app-task-${runtimeTaskCounter}`,
          status: "accepted",
          submittedAt: "2026-05-15T00:00:00.000Z",
        };
      },
    );
    runtimeApiMocks.getAgentAppRuntimeTask.mockImplementation(
      async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        status: "thread_read_available",
        taskStatus: "running",
        taskEvents: [
          {
            id: `${request.taskId}:progress`,
            eventType: "task:progress",
            status: "running",
            message: "任务正在执行",
            occurredAt: "2026-05-15T00:00:01.000Z",
          },
        ],
        threadRead: {
          sessionId: request.sessionId,
          source: "agent_app_runtime",
        },
      }),
    );
    runtimeApiMocks.cancelAgentAppRuntimeTask.mockImplementation(
      async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        cancelled: true,
        status: "cancelled",
      }),
    );
    runtimeApiMocks.submitAgentAppRuntimeHostResponse.mockImplementation(
      async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        status: "submitted",
      }),
    );
  });

  afterEach(() => {
    while (mountedPages.length > 0) {
      const mounted = mountedPages.pop();
      if (!mounted) {
        continue;
      }
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("style");
  });

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
            available: expect.arrayContaining(["lime.agent", "lime.storage"]),
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

  it("Host Bridge 能在同一 App 作用域内 start / stream / get / cancel / retry Agent task", async () => {
    const container = await renderPage();
    await flush();
    const frame = getRuntimeFrame(container);
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
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
      },
      "task-start",
    );
    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.agent",
        method: "streamTask",
        input: { taskId: "agent-app-task-1" },
      },
      "task-stream",
    );
    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.agent",
        method: "getTask",
        input: { taskId: "agent-app-task-1" },
      },
      "task-get",
    );
    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.agent",
        method: "submitHostResponse",
        input: {
          taskId: "agent-app-task-1",
          requestId: "runtime-request-1",
          actionType: "ask_user",
          response: "补充项目定位：高客单价咨询服务。",
        },
      },
      "task-host-response",
    );
    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.agent",
        method: "cancelTask",
        input: { taskId: "agent-app-task-1" },
      },
      "task-cancel",
    );
    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.agent",
        method: "retryTask",
        input: { taskId: "agent-app-task-1" },
      },
      "task-retry",
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "task-start",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            taskId: "agent-app-task-1",
            traceId: "agent-app-trace-1",
            status: "running",
            humanReview: true,
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "task-stream",
        payload: expect.objectContaining({
          ok: true,
          result: [
            expect.objectContaining({ type: "task:progress", status: "running" }),
          ],
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "task-get",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            taskId: "agent-app-task-1",
            traceId: "agent-app-trace-1",
            status: "running",
            taskKind: "content.scenario_planning",
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "task-host-response",
        payload: expect.objectContaining({
          ok: true,
          result: {
            taskId: "agent-app-task-1",
            requestId: "runtime-request-1",
            status: "submitted",
            submittedAt: expect.any(String),
          },
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "task-cancel",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            taskId: "agent-app-task-1",
            status: "cancelled",
            events: expect.arrayContaining([
              expect.objectContaining({ type: "task:cancelled" }),
            ]),
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "task-retry",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            taskId: "agent-app-task-2",
            traceId: "agent-app-trace-2",
            retryOfTaskId: "agent-app-task-1",
            retryAttempt: 1,
            status: "running",
            humanReview: true,
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(runtimeApiMocks.getAgentAppRuntimeTask).toHaveBeenCalledWith({
      appId: "content-factory-app",
      taskId: "agent-app-task-1",
      sessionId: "agent-app-session-1",
    });
    expect(runtimeApiMocks.cancelAgentAppRuntimeTask).toHaveBeenCalledWith({
      appId: "content-factory-app",
      taskId: "agent-app-task-1",
      sessionId: "agent-app-session-1",
      turnId: "agent-app-turn-1",
    });
    expect(runtimeApiMocks.submitAgentAppRuntimeHostResponse).toHaveBeenCalledWith({
      appId: "content-factory-app",
      taskId: "agent-app-task-1",
      runtimeRequest: expect.objectContaining({
        session_id: "agent-app-session-1",
        request_id: "runtime-request-1",
        action_type: "ask_user",
        confirmed: true,
        response: "补充项目定位：高客单价咨询服务。",
        action_scope: expect.objectContaining({
          session_id: "agent-app-session-1",
          turn_id: "agent-app-turn-1",
        }),
      }),
    });
  });

  it("Host Bridge 写回 artifact / evidence 时应拒绝未声明 subject", async () => {
    const container = await renderPage();
    await flush();
    const frame = getRuntimeFrame(container);
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.artifacts",
        method: "create",
        input: {
          kind: "content_table",
          title: "内容表",
          content: { rows: [] },
        },
      },
      "artifact-ok",
    );
    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.evidence",
        method: "record",
        input: {
          kind: "fact_grounding",
          message: "声明过的事实支撑证据。",
          refs: ["adapter-artifact-1"],
        },
      },
      "evidence-ok",
    );
    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.artifacts",
        method: "create",
        input: {
          kind: "undeclared_asset_pack",
          title: "未声明资产包",
          content: {},
        },
      },
      "artifact-blocked",
    );
    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.evidence",
        method: "record",
        input: {
          kind: "undeclared_evidence_subject",
          message: "未声明证据。",
        },
      },
      "evidence-blocked",
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "artifact-ok",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            kind: "content_table",
            title: "内容表",
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "evidence-ok",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            kind: "fact_grounding",
            refs: ["adapter-artifact-1"],
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:error",
        requestId: "artifact-blocked",
        payload: expect.objectContaining({
          ok: false,
          code: "upstream_failed",
          causeCode: "WRITEBACK_NOT_DECLARED",
          error: expect.objectContaining({
            code: "upstream_failed",
            causeCode: "WRITEBACK_NOT_DECLARED",
            capability: "lime.artifacts",
            method: "create",
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:error",
        requestId: "evidence-blocked",
        payload: expect.objectContaining({
          ok: false,
          code: "upstream_failed",
          causeCode: "WRITEBACK_NOT_DECLARED",
          error: expect.objectContaining({
            code: "upstream_failed",
            causeCode: "WRITEBACK_NOT_DECLARED",
            capability: "lime.evidence",
            method: "record",
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
  });

  it("Host Bridge 忽略非 runtime origin 的消息", async () => {
    const container = await renderPage();
    await flush();
    const frame = getRuntimeFrame(container);
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      { capability: "lime.storage" },
      "evil-req",
      "https://evil.example",
    );

    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "evil-req",
      }),
      expect.any(String),
    );
  });

  it("runtime 启动失败时显示可重试错误态", async () => {
    apiMocks.startAgentAppUiRuntime.mockRejectedValueOnce(
      new Error("请从本地 APP.md 目录重新安装该 App。"),
    );
    const container = await renderPage();
    await flush();

    expect(container.textContent).toContain("App 打开失败");
    expect(container.textContent).toContain(
      "请从本地 APP.md 目录重新安装该 App。",
    );
    expect(container.textContent).toContain("重新打开");
    expect(
      container.querySelector('[data-testid="agent-app-runtime-frame"]'),
    ).toBeNull();
  });
});
