import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorkflowRuntimeCapabilityProfile } from "../testing/workflowRuntimeCapabilityProfile";
import {
  act,
  apiMocks,
  buildReadyState,
  buildStandaloneState,
  cleanupPluginsPageTest,
  flush,
  installedStates,
  LOCAL_APP_DIR,
  openAppDetail,
  renderPage,
  resetPluginsPageTest,
  toast,
} from "./PluginsPage.testFixtures";

describe("PluginsPage runtime launch", () => {
  beforeEach(resetPluginsPageTest);
  afterEach(cleanupPluginsPageTest);

  it("正式入口点击 UI entry 时应导航到独立 runtime surface", async () => {
    installedStates.push(
      buildReadyState({
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const onNavigate = vi.fn();
    const container = await renderPage(undefined, onNavigate);
    await flush();

    const rightSurfaceButton = container.querySelector(
      '[data-testid="plugins-launch-target-right-surface"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      rightSurfaceButton?.click();
      await Promise.resolve();
    });
    await flush();

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="plugins-launch-entry-dashboard"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(onNavigate).toHaveBeenCalledWith(
      "plugin",
      expect.objectContaining({
        appId: "content-factory-app",
        entryKey: "dashboard",
        launchRequestKey: expect.any(Number),
      }),
    );
    expect(
      container.querySelector('[data-testid="plugins-mounted-ui"]'),
    ).toBeNull();
  });

  it("正式入口点击 UI entry 时应把宿主 right surface target 透传到 runtime surface", async () => {
    installedStates.push(
      buildReadyState({
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const onNavigate = vi.fn();
    const container = await renderPage(
      undefined,
      onNavigate,
      {
        workspaceId: "workspace-main",
        sessionId: "session-main",
        label: "主工作区",
      },
      undefined,
    );
    await flush();

    const rightSurfaceButton = container.querySelector(
      '[data-testid="plugins-launch-target-right-surface"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      rightSurfaceButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="plugins-launch-entry-dashboard"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(onNavigate).toHaveBeenCalledWith(
      "plugin",
      expect.objectContaining({
        appId: "content-factory-app",
        entryKey: "dashboard",
        launchRequestKey: expect.any(Number),
        rightSurfaceTarget: expect.objectContaining({
          workspaceId: "workspace-main",
          sessionId: "session-main",
        }),
      }),
    );
  });

  it("standalone App 点击 UI entry 时应通过 Shell launch 命令启动", async () => {
    installedStates.push(buildStandaloneState());
    const onNavigate = vi.fn();
    const container = await renderPage(undefined, onNavigate);
    await flush();

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="plugins-launch-entry-dashboard"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.launchPluginShell).toHaveBeenCalledWith({
      descriptor: expect.objectContaining({
        appId: "content-factory-app",
        installMode: "standalone",
        runtimeProfile: expect.objectContaining({
          installMode: "standalone",
          shellKind: "app_shell",
        }),
        entry: expect.objectContaining({
          entryKey: "dashboard",
          route: "/dashboard",
        }),
        isolation: expect.objectContaining({
          packageMount: "read-only",
          secrets: "refs-only",
          sideEffects: "runtime-broker",
          evidence: "runtime-provenance",
        }),
      }),
    });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="plugins-launch-summary"]')
        ?.textContent,
    ).toContain("shell:项目首页:http://127.0.0.1:4199/dashboard");
    expect(toast.success).toHaveBeenCalledWith(
      "shell:项目首页:http://127.0.0.1:4199/dashboard",
    );
  });

  it("普通用户首屏不暴露本地路径，更多信息展开后才显示诊断细节", async () => {
    installedStates.push(
      buildReadyState({
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const container = await renderPage();
    await flush();

    expect(container.textContent).not.toContain(LOCAL_APP_DIR);

    await openAppDetail(container);

    const moreInfo = container.querySelector(
      '[data-testid="plugins-more-info"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      moreInfo?.click();
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="plugins-more-info-content"]')
        ?.textContent,
    ).toContain(LOCAL_APP_DIR);
  });

  it("从导航进入 disabled App 时应被 lifecycle launch gate 阻断", async () => {
    installedStates.push(
      buildReadyState({
        disabled: true,
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const onNavigate = vi.fn();
    const container = await renderPage(
      {
        selectedPluginId: "content-factory-app",
        launchPluginEntryKey: "dashboard",
        launchRequestKey: 2,
      },
      onNavigate,
    );
    await flush();

    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="plugins-mounted-ui"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="plugins-launch-summary"]'),
    ).toBeNull();
  });

  it("workflow entry 应进入 Agent current 主链，避免恢复前端本地 DSL runtime", async () => {
    installedStates.push(
      buildReadyState({
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const onNavigate = vi.fn();
    const container = await renderPage(undefined, onNavigate);
    await flush();

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="plugins-launch-entry-content_factory"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        agentEntry: "new-task",
        initialUserPrompt: "@内容工厂 ",
        autoRunInitialPromptOnMount: false,
      }),
    );
    expect(
      container.querySelector('[data-testid="plugins-mounted-ui"]'),
    ).toBeNull();
    expect(toast.error).not.toHaveBeenCalledWith(
      "plugin.apps.toast.failed",
      expect.anything(),
    );
  });

  it("从导航进入已安装 App 时应自动打开默认 UI entry", async () => {
    installedStates.push(
      buildReadyState({
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const container = await renderPage({
      selectedPluginId: "content-factory-app",
      launchPluginEntryKey: "dashboard",
      launchRequestKey: 1,
    });
    await flush();

    expect(
      container.querySelector('[data-testid="plugins-mounted-ui"]')
        ?.textContent,
    ).toContain("项目首页");
    expect(
      container.querySelector('[data-testid="plugins-launch-summary"]')
        ?.textContent,
    ).toContain("ui:项目首页:/dashboard");
  });
});
