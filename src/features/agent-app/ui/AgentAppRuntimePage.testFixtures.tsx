import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
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

export const contentFactoryManifest = contentFactoryFixture as AppManifest;

const hoisted = vi.hoisted(() => ({
  apiMocks: {
    getAgentAppCloudCatalog: vi.fn(),
    listInstalledAgentApps: vi.fn(),
    startAgentAppUiRuntime: vi.fn(),
  },
  runtimeApiMocks: {
    startAgentAppRuntimeTask: vi.fn(),
    getAgentAppRuntimeTask: vi.fn(),
    cancelAgentAppRuntimeTask: vi.fn(),
    submitAgentAppRuntimeHostResponse: vi.fn(),
  },
  appServerClientMocks: {
    createAppServerClient: vi.fn(),
    startSession: vi.fn(),
    startTurn: vi.fn(),
    readSession: vi.fn(),
    cancelTurn: vi.fn(),
    respondAction: vi.fn(),
  },
  projectApiMocks: {
    getOrCreateDefaultProject: vi.fn(),
  },
  toastMocks: {
    toast: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
  t: (key: string, params?: Record<string, unknown>) => {
    const labels: Record<string, string> = {
      "agentApp.apps.runtime.loading": "正在加载已安装 App...",
      "agentApp.apps.runtime.empty":
        "还没有可使用的已安装 Agent App。请先到 Agent Apps 安装。",
      "agentApp.apps.runtime.opening": `正在打开 ${String(params?.name)}...`,
      "agentApp.apps.runtime.openFailed": "App 打开失败",
      "agentApp.apps.runtime.retry": "重新打开",
      "agentApp.apps.runtime.unavailable": "该 Agent App 暂不可用。",
      "agentApp.apps.runtime.appInfo.toggle": "查看 App 信息",
      "agentApp.apps.runtime.appInfo.version": `当前版本 v${String(params?.version)}`,
      "agentApp.apps.runtime.appInfo.upgradeBadge": "可升级",
      "agentApp.apps.runtime.appInfo.source": "来源",
      "agentApp.apps.runtime.appInfo.source.cloud": "云端",
      "agentApp.apps.runtime.appInfo.source.local": "本地",
      "agentApp.apps.runtime.appInfo.latestVersion": "最新版本",
      "agentApp.apps.runtime.appInfo.versionValue": `v${String(params?.version)}`,
      "agentApp.apps.runtime.appInfo.entry": "入口",
      "agentApp.apps.runtime.agentRun.aria": "Host AI 运行面板",
      "agentApp.apps.runtime.agentRun.badge": `${String(params?.app)} 的 AI 同事`,
      "agentApp.apps.runtime.agentRun.titleFallback": "Lime AI 运行现场",
      "agentApp.apps.runtime.agentRun.subtitle":
        "思考、执行、Skill、模型、Token、费用和证据由 Lime Host 统一承载。",
      "agentApp.apps.runtime.agentRun.close": "关闭 AI 运行面板",
      "agentApp.apps.runtime.agentRun.expand": "查看运行现场",
      "agentApp.apps.runtime.agentRun.collapse": "收起运行面板",
      "agentApp.apps.runtime.agentRun.taskId": "任务 ID",
      "agentApp.apps.runtime.agentRun.bridgeAction": "业务动作",
      "agentApp.apps.runtime.agentRun.emptyValue": "待回写",
      "agentApp.apps.runtime.agentRun.metric.model": "模型",
      "agentApp.apps.runtime.agentRun.metric.tokens": "Token",
      "agentApp.apps.runtime.agentRun.metric.cost": "费用",
      "agentApp.apps.runtime.agentRun.metric.skills": "Skills",
      "agentApp.apps.runtime.agentRun.facts.confirmations": "待确认",
      "agentApp.apps.runtime.agentRun.facts.confirmations.empty":
        "暂无待确认项",
      "agentApp.apps.runtime.agentRun.facts.confirmations.itemFallback":
        "待确认事项",
      "agentApp.apps.runtime.agentRun.facts.artifacts": "交付物",
      "agentApp.apps.runtime.agentRun.facts.artifacts.empty": "暂无交付物",
      "agentApp.apps.runtime.agentRun.facts.artifacts.itemFallback":
        "交付物已生成",
      "agentApp.apps.runtime.agentRun.facts.evidence": "证据",
      "agentApp.apps.runtime.agentRun.facts.evidence.empty": "暂无证据",
      "agentApp.apps.runtime.agentRun.facts.evidence.itemFallback":
        "证据已记录",
      "agentApp.apps.runtime.agentRun.timeline.running":
        "运行中，点击折叠或展开过程",
      "agentApp.apps.runtime.agentRun.timeline.collapsed":
        "运行过程已折叠，点击查看完整现场",
      "agentApp.apps.runtime.agentRun.timeline.event": "运行事件",
      "agentApp.apps.runtime.agentRun.timeline.empty":
        "等待 AgentRuntime 回写运行过程。",
      "agentApp.apps.runtime.agentRun.thinking": "思考过程",
      "agentApp.apps.runtime.agentRun.execution": "执行过程",
      "agentApp.apps.runtime.agentRun.output": "成稿流式输出",
      "agentApp.apps.runtime.agentRun.action.approve": "确认",
      "agentApp.apps.runtime.agentRun.action.reject": "拒绝",
      "agentApp.apps.runtime.agentRun.action.answer": "补充说明",
      "agentApp.apps.runtime.agentRun.action.edit": "编辑",
      "agentApp.apps.runtime.agentRun.action.retry": "重试",
      "agentApp.apps.runtime.agentRun.action.interrupt": "中断",
      "agentApp.apps.runtime.agentRun.action.stop": "停止",
      "agentApp.apps.toast.failed": "Agent App 操作失败",
    };
    return labels[key] ?? key;
  },
}));

export const apiMocks = hoisted.apiMocks;
export const runtimeApiMocks = hoisted.runtimeApiMocks;
export const appServerClientMocks = hoisted.appServerClientMocks;

vi.mock("@/lib/api/agentApps", () => ({
  AGENT_APPS_CHANGED_EVENT: "lime:agent-apps-changed",
  getAgentAppCloudCatalog: hoisted.apiMocks.getAgentAppCloudCatalog,
  listInstalledAgentApps: hoisted.apiMocks.listInstalledAgentApps,
  startAgentAppUiRuntime: hoisted.apiMocks.startAgentAppUiRuntime,
}));

vi.mock("@/lib/api/agentAppRuntime", () => ({
  startAgentAppRuntimeTask:
    hoisted.runtimeApiMocks.startAgentAppRuntimeTask,
  getAgentAppRuntimeTask: hoisted.runtimeApiMocks.getAgentAppRuntimeTask,
  cancelAgentAppRuntimeTask:
    hoisted.runtimeApiMocks.cancelAgentAppRuntimeTask,
  submitAgentAppRuntimeHostResponse:
    hoisted.runtimeApiMocks.submitAgentAppRuntimeHostResponse,
}));

vi.mock("@/lib/api/appServer", () => ({
  createAppServerClient: hoisted.appServerClientMocks.createAppServerClient,
}));

vi.mock("@/lib/api/project", () => ({
  getOrCreateDefaultProject: hoisted.projectApiMocks.getOrCreateDefaultProject,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: hoisted.t,
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(hoisted.toastMocks.toast, {
    error: hoisted.toastMocks.error,
    success: hoisted.toastMocks.success,
  }),
}));

interface MountedPage {
  container: HTMLDivElement;
  root: Root;
}

const mountedPages: MountedPage[] = [];

export function buildReadyState(
  params: {
    setupResolved?: boolean;
    manifestPatch?: Partial<AppManifest>;
  } = {},
): InstalledAgentAppState {
  const manifest = {
    ...contentFactoryManifest,
    ...(params.manifestPatch ?? {}),
  } as AppManifest;
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

export async function renderPage(state = buildReadyState()) {
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

export async function unmountLastRenderedPage() {
  const mounted = mountedPages.pop();
  if (!mounted) {
    throw new Error("mounted page not found");
  }
  await act(async () => {
    mounted.root.unmount();
  });
  mounted.container.remove();
}

export async function flush(times = 8) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

export function getRuntimeFrame(container: HTMLElement): HTMLIFrameElement {
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

export async function dispatchBridgeMessage(
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

export function useAgentAppRuntimePageTestLifecycle() {
  beforeEach(() => {
    document.documentElement.lang = "zh-CN";
    document.documentElement.dir = "ltr";
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let runtimeTaskCounter = 0;
    appServerClientMocks.createAppServerClient.mockReturnValue({
      startSession: appServerClientMocks.startSession,
      startTurn: appServerClientMocks.startTurn,
      readSession: appServerClientMocks.readSession,
      cancelTurn: appServerClientMocks.cancelTurn,
      respondAction: appServerClientMocks.respondAction,
    });
    appServerClientMocks.startSession.mockImplementation(async (request) => ({
      id: 1,
      result: {
        session: {
          sessionId: "agent-app-session-1",
          threadId: "agent-app-thread-1",
          appId: request.appId,
          workspaceId: request.workspaceId,
          status: "idle",
          createdAt: "2026-05-15T00:00:00.000Z",
          updatedAt: "2026-05-15T00:00:00.000Z",
          businessObjectRef: request.businessObjectRef,
        },
      },
      response: { jsonrpc: "2.0", id: 1, result: {} },
      notifications: [],
      messages: [],
    }));
    appServerClientMocks.startTurn.mockImplementation(async (request) => {
      runtimeTaskCounter += 1;
      return {
        id: 2,
        result: {
          turn: {
            turnId: request.turnId ?? `agent-app-turn-${runtimeTaskCounter}`,
            sessionId: request.sessionId,
            threadId: "agent-app-thread-1",
            status: "accepted",
            startedAt: "2026-05-15T00:00:00.000Z",
          },
        },
        response: { jsonrpc: "2.0", id: 2, result: {} },
        notifications: [],
        messages: [],
      };
    });
    appServerClientMocks.readSession.mockImplementation(async (request) => ({
      id: 3,
      result: {
        session: {
          sessionId: request.sessionId,
          threadId: "agent-app-thread-1",
          appId: "content-factory-app",
          workspaceId: "workspace-1",
          status: "running",
          createdAt: "2026-05-15T00:00:00.000Z",
          updatedAt: "2026-05-15T00:00:01.000Z",
        },
        turns: [
          {
            turnId: "agent-app-turn-1",
            sessionId: request.sessionId,
            threadId: "agent-app-thread-1",
            status: "running",
          },
        ],
        detail: {
          thread_read: {
            session_id: request.sessionId,
            source: "app_server_runtime_client",
          },
        },
      },
      response: { jsonrpc: "2.0", id: 3, result: {} },
      notifications: [],
      messages: [],
    }));
    appServerClientMocks.cancelTurn.mockResolvedValue({
      id: 4,
      result: {},
      response: { jsonrpc: "2.0", id: 4, result: {} },
      notifications: [],
      messages: [],
    });
    appServerClientMocks.respondAction.mockResolvedValue({
      id: 5,
      result: {},
      response: { jsonrpc: "2.0", id: 5, result: {} },
      notifications: [],
      messages: [],
    });
    apiMocks.getAgentAppCloudCatalog.mockResolvedValue({
      source: "seeded",
      payload: {
        schemaVersion: "agent-app-cloud-bootstrap/v1",
        tenantId: "seeded",
        generatedAt: "2026-05-15T00:00:00.000Z",
        apps: [],
      },
    });
    hoisted.projectApiMocks.getOrCreateDefaultProject.mockResolvedValue({
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
    delete window.__LIME_BOOTSTRAP__;
    delete window.__LIME_OEM_CLOUD__;
    delete window.__LIME_SESSION_TOKEN__;
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.documentElement.removeAttribute("style");
  });
}
