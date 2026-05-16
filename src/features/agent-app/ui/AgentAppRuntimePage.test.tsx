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
      "agentApp.apps.runtime.agentRun.facts.confirmations.empty": "暂无待确认项",
      "agentApp.apps.runtime.agentRun.facts.confirmations.itemFallback":
        "待确认事项",
      "agentApp.apps.runtime.agentRun.facts.artifacts": "交付物",
      "agentApp.apps.runtime.agentRun.facts.artifacts.empty":
        "暂无交付物",
      "agentApp.apps.runtime.agentRun.facts.artifacts.itemFallback": "交付物已生成",
      "agentApp.apps.runtime.agentRun.facts.evidence": "证据",
      "agentApp.apps.runtime.agentRun.facts.evidence.empty": "暂无证据",
      "agentApp.apps.runtime.agentRun.facts.evidence.itemFallback": "证据已记录",
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
  params: {
    setupResolved?: boolean;
    manifestPatch?: Partial<AppManifest>;
  } = {},
): InstalledAgentAppState {
  const manifest = {
    ...(contentFactoryFixture as AppManifest),
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

  it("App 可通过 lime.ui 打开、更新并关闭 Host 级 AI 运行面板", async () => {
    const container = await renderPage();
    await flush();
    const frame = getRuntimeFrame(container);
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.ui",
        method: "openAgentRun",
        input: {
          taskId: "agent-app-task-1",
          bridgeAction: "content_factory.production",
          title: "生成内容批次",
          mode: "drawer",
          runtimeProcess: {
            model: {
              provider: "anthropic",
              model: "claude-sonnet-4-5",
              label: "Claude Sonnet 4.5",
            },
            usage: {
              inputTokens: 120,
              outputTokens: 80,
              totalTokens: 200,
            },
            cost: {
              estimatedTotalCost: 0.0123,
              currency: "USD",
            },
            skillNames: ["content_factory_writer"],
            invokedSkillNames: ["content_factory_writer"],
            terminal: false,
            timeline: [
              {
                kind: "routing",
                title: "模型路由",
                message: "AgentRuntime 已选择内容生成模型。",
                statusText: "decided",
                meta: "routing",
              },
              {
                kind: "skill",
                title: "Skill · content_factory_writer",
                message: "正在调用内容工厂写作 Skill。",
                statusText: "running",
                meta: "skill-1",
              },
              {
                kind: "tool",
                title: "Tool · browser_snapshot",
                message: "正在读取业务页面上下文。",
                statusText: "running",
                meta: "tool-1",
              },
              {
                kind: "execution",
                title: "正在规划内容结构",
                message: "AgentRuntime 已开始读取项目上下文。",
                statusText: "running",
              },
            ],
            thinkingText: "先确认项目资料，再拆内容主题。",
            executionText: "调用内容工厂 Skill。",
            streamText: "正在生成第一批文案。",
          },
          events: [
            {
              eventType: "task:reviewRequested",
              requestId: "review-content-batch",
              message: "请确认首批内容选题。",
            },
            {
              eventType: "artifact:created",
              artifactRef: ".lime/artifacts/content-batch.json",
              payload: {
                artifact: {
                  title: "内容批次 JSON",
                },
              },
            },
            {
              eventType: "evidence:recorded",
              evidenceRef: "evidence:content-batch",
              message: "内容批次 evidence 已记录。",
            },
          ],
        },
      },
      "agent-run-open",
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "agent-run-open",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            opened: true,
            surface: "host_agent_run",
            mode: "drawer",
            taskId: "agent-app-task-1",
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(
      container.querySelector('[data-testid="agent-app-host-agent-run-drawer"]'),
    ).toBeNull();
    const dock = container.querySelector(
      '[data-testid="agent-app-host-agent-run-dock"]',
    ) as HTMLButtonElement;
    expect(dock).not.toBeNull();
    expect(container.textContent).toContain("查看运行现场");

    await act(async () => {
      dock.click();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="agent-app-host-agent-run-drawer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-run-process-panel"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("生成内容批次");
    expect(container.textContent).toContain("Claude Sonnet 4.5");
    expect(container.textContent).toContain("200");
    expect(container.textContent).toContain("USD 0.0123");
    expect(container.textContent).toContain("content_factory_writer");
    expect(container.textContent).toContain("模型路由");
    expect(container.textContent).toContain("Skill · content_factory_writer");
    expect(container.textContent).toContain("Tool · browser_snapshot");
    expect(
      container.querySelector('[data-agent-run-timeline-kind="skill"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-agent-run-timeline-kind="tool"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("正在规划内容结构");
    expect(container.textContent).toContain("先确认项目资料");
    expect(container.textContent).toContain("待确认");
    expect(container.textContent).toContain("请确认首批内容选题。");
    expect(container.textContent).toContain("review-content-batch");
    expect(container.textContent).toContain("交付物");
    expect(container.textContent).toContain("内容批次 JSON");
    expect(container.textContent).toContain("证据");
    expect(container.textContent).toContain("内容批次 evidence 已记录。");

    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.ui",
        method: "updateAgentRun",
        input: {
          taskId: "agent-app-task-1",
          runtimeProcess: {
            model: { label: "Claude Sonnet 4.5" },
            usage: { inputTokens: 120, outputTokens: 180, totalTokens: 300 },
            terminal: true,
            collapsedByDefault: true,
            timeline: [
              {
                kind: "completed",
                title: "内容批次已写回",
                message: "Host 保留完整运行过程。",
                statusText: "completed",
              },
            ],
            streamText: "第一批文案已完成。",
          },
        },
      },
      "agent-run-update",
    );

    expect(container.textContent).toContain("300");
    expect(container.textContent).toContain("正在规划内容结构");
    expect(container.textContent).toContain("内容批次已写回");
    expect(container.textContent).toContain("运行过程已折叠，点击查看完整现场");

    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.ui",
        method: "closeAgentRun",
        input: { taskId: "agent-app-task-1" },
      },
      "agent-run-close",
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "agent-run-close",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            closed: true,
            surface: "host_agent_run",
            taskId: "agent-app-task-1",
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(
      container.querySelector('[data-testid="agent-app-host-agent-run-drawer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-app-host-agent-run-dock"]'),
    ).toBeNull();
  });

  it("App 可通过 lime.capabilities.getProfile 发现 Host capability profile", async () => {
    const container = await renderPage();
    await flush();
    const frame = getRuntimeFrame(container);
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.capabilities",
        method: "getProfile",
      },
      "profile-discovery",
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "profile-discovery",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            appRuntimeVersion: "0.7.0",
            standardVersions: {
              current: "0.7",
              compatible: ["0.5", "0.6", "0.7"],
            },
            standards: expect.objectContaining({
              layeredManifest: expect.objectContaining({
                version: "0.5",
                enabled: true,
              }),
              agentRuntime: expect.objectContaining({
                version: "0.6",
                enabled: false,
              }),
              requirementBoundary: expect.objectContaining({
                version: "0.7",
                enabled: false,
              }),
            }),
            capabilities: expect.objectContaining({
              "lime.capabilities": expect.objectContaining({
                enabled: true,
                implementation: "native",
              }),
              "lime.agent": expect.objectContaining({
                enabled: true,
              }),
              "lime.skills": expect.objectContaining({
                enabled: true,
                implementation: "adapter",
              }),
              "lime.memory": expect.objectContaining({
                enabled: true,
                implementation: "adapter",
              }),
              "lime.context": expect.objectContaining({
                enabled: true,
                implementation: "adapter",
              }),
              "lime.search": expect.objectContaining({
                enabled: true,
                implementation: "adapter",
              }),
              "lime.browser": expect.objectContaining({
                enabled: true,
                implementation: "adapter",
              }),
              "lime.documents": expect.objectContaining({
                enabled: true,
                implementation: "adapter",
              }),
              "lime.media": expect.objectContaining({
                enabled: true,
                implementation: "adapter",
              }),
              "lime.mcp": expect.objectContaining({
                enabled: true,
                implementation: "adapter",
              }),
              "lime.terminal": expect.objectContaining({
                enabled: true,
                implementation: "adapter",
              }),
              "lime.connectors": expect.objectContaining({
                enabled: true,
                implementation: "adapter",
              }),
            }),
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:error",
        requestId: "profile-discovery",
      }),
      expect.any(String),
    );
  });

  it("App 可通过 Lime 客户端 profile 读取 v0.6 AgentRuntime 合同", async () => {
    const agentRuntime = {
      agentTask: {
        eventSchema: "lime.agent-task-event.v1",
        resultSchema: "lime.agent-task-result.v1",
        structuredOutput: {
          type: "json_schema",
          schemaRef: "./artifacts/content-factory-workspace-patch.schema.json",
        },
        approval: { behavior: "host-mediated" },
        sessionPolicy: { modes: ["new", "resume", "continue", "fork"] },
        toolDiscovery: { mode: "on_demand" },
        checkpointScope: { workflowState: true },
        observability: { profileEvents: true },
      },
    };
    const container = await renderPage(
      buildReadyState({
        manifestPatch: {
          manifestVersion: "0.6.0",
          version: "0.6.0",
          requires: {
            sdk: "@lime/app-sdk@^0.6.0",
            capabilities: ["lime.agent", "lime.skills", "lime.usage"],
          },
          agentRuntime,
        },
      }),
    );
    await flush();
    const frame = getRuntimeFrame(container);
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.capabilities",
        method: "getProfile",
      },
      "profile-v06-runtime",
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "profile-v06-runtime",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            appRuntimeVersion: "0.7.0",
            standardVersions: {
              current: "0.7",
              compatible: ["0.5", "0.6", "0.7"],
            },
            standards: expect.objectContaining({
              layeredManifest: expect.objectContaining({
                version: "0.5",
                enabled: true,
                layerFiles: expect.arrayContaining(["app.capabilities.yaml"]),
              }),
              agentRuntime: expect.objectContaining({
                version: "0.6",
                enabled: true,
                manifestVersion: "0.6",
                eventSchema: "lime.agent-task-event.v1",
                resultSchema: "lime.agent-task-result.v1",
                structuredOutput: true,
                approval: true,
                sessionPolicy: true,
                toolDiscovery: true,
                checkpointScope: true,
                observability: true,
              }),
              requirementBoundary: expect.objectContaining({
                version: "0.7",
                enabled: false,
              }),
            }),
            agentRuntime,
          }),
        }),
      }),
      "http://127.0.0.1:4199",
    );
  });

  it("App 可通过 Lime 客户端 profile 读取 v0.7 需求边界与能力交接", async () => {
    const requirements = {
      requirements: [
        {
          id: "CF-R001",
          text: "生成可审核内容草稿",
          priority: "mvp",
        },
      ],
      nonGoals: ["不在 App 包内保存外部凭证"],
    };
    const boundary = {
      boundaries: [
        {
          requirementId: "CF-R001",
          planes: {
            app: { owns: ["workflow_state"] },
            host: { requires: ["lime.agent", "lime.evidence"] },
          },
        },
      ],
    };
    const integrations = [
      {
        key: "planning_table",
        provider: "cloud.table",
        executionPlane: "hybrid",
        hostCapability: "lime.connectors",
      },
    ];
    const operations = [
      {
        key: "write_external_draft",
        type: "external_write",
        sideEffect: "external_write",
        approvalRequired: true,
        dryRunRequired: true,
        evidenceRequired: true,
        autoExecute: false,
      },
    ];
    const container = await renderPage(
      buildReadyState({
        manifestPatch: {
          manifestVersion: "0.7.0",
          version: "0.7.0",
          requires: {
            sdk: "@lime/app-sdk@^0.7.0",
            capabilities: ["lime.agent", "lime.connectors", "lime.evidence"],
          },
          requirements,
          boundary,
          integrations,
          operations,
        },
      }),
    );
    await flush();
    const frame = getRuntimeFrame(container);
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    await dispatchBridgeMessage(
      frame,
      "capability:invoke",
      {
        capability: "lime.capabilities",
        method: "getProfile",
      },
      "profile-v07-handoff",
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:response",
        requestId: "profile-v07-handoff",
        payload: expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            appRuntimeVersion: "0.7.0",
            standardVersions: {
              current: "0.7",
              compatible: ["0.5", "0.6", "0.7"],
            },
            requirements,
            boundary,
            integrations,
            operations,
            standards: expect.objectContaining({
              requirementBoundary: expect.objectContaining({
                version: "0.7",
                enabled: true,
                manifestVersion: "0.7",
                requirementCount: 1,
                boundaryCount: 1,
                integrationCount: 1,
                operationCount: 1,
                hostCloudManagedExecution: true,
                externalSideEffectsRequireApproval: true,
              }),
            }),
          }),
        }),
      }),
      "http://127.0.0.1:4199",
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
            expect.objectContaining({
              type: "task:progress",
              status: "running",
            }),
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
    expect(
      runtimeApiMocks.submitAgentAppRuntimeHostResponse,
    ).toHaveBeenCalledWith({
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
