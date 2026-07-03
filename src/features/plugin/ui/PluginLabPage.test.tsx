import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import contentFactoryFixture from "../testing/fixtures/content-factory-app.json";
import type { PluginHostFlags, AppManifest } from "../types";
import { PluginLabPage } from "./PluginLabPage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (typeof params?.count === "number") {
        return `${key}:${params.count}`;
      }
      return key;
    },
  }),
}));

interface MountedPage {
  container: HTMLDivElement;
  root: Root;
}

const mountedPages: MountedPage[] = [];

async function renderPage(flags?: Partial<PluginHostFlags>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <PluginLabPage
        fixture={contentFactoryFixture as AppManifest}
        flags={flags}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  mountedPages.push({ container, root });
  return container;
}

function unmountPage(container: HTMLDivElement) {
  const index = mountedPages.findIndex(
    (mounted) => mounted.container === container,
  );
  if (index < 0) {
    return;
  }
  const [mounted] = mountedPages.splice(index, 1);
  act(() => {
    mounted.root.unmount();
  });
  mounted.container.remove();
}

describe("PluginLabPage", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.clear();
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
    vi.unstubAllGlobals();
  });

  it("应展示 current workflow fixture、blocked readiness 和 cleanup dry-run", async () => {
    const container = await renderPage();

    expect(
      container.querySelector('[data-testid="plugin-lab-page"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-testid="plugin-entry-card"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="plugin-readiness-blocked"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("content-factory-app");
    expect(container.textContent).toContain("content_factory");
    expect(container.textContent).toContain("package-fnv1a-");
    expect(container.textContent).toContain(
      "<LimeAppData>/plugins/storage/content-factory-app",
    );
    expect(
      container.querySelector('[data-testid^="plugin-run-entry-"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="plugin-run-content-demo"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="plugin-content-demo-result"]'),
    ).toBeNull();
  });

  it("开启 mock SDK 也不能让产品页出现 mock 运行入口", async () => {
    const container = await renderPage({ mockSdkEnabled: true });
    const button = container.querySelector(
      '[data-testid="plugin-run-entry-content_factory"]',
    ) as HTMLButtonElement | null;

    expect(button).toBeNull();
    expect(
      container.querySelector('[data-testid="plugin-run-result"]'),
    ).toBeNull();
  });

  it("开启 real adapter 后点击 entry 也不得绕过 P14 setup guard", async () => {
    const container = await renderPage({ realAdapterEnabled: true });
    const button = container.querySelector(
      '[data-testid="plugin-run-entry-content_factory"]',
    ) as HTMLButtonElement | null;

    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector(
        '[data-testid="plugin-entry-runtime-guard-blocked"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="plugin-run-result"]'),
    ).toBeNull();
    expect(container.textContent).toContain("lime.policy");
    expect(container.textContent).toContain("content_factory_workspace_patch");
  });

  it("开启 UI runtime 不会为 workflow-only fixture 暴露 page entry", async () => {
    const container = await renderPage({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
    });
    const button = container.querySelector(
      '[data-testid="plugin-open-ui-entry-dashboard"]',
    ) as HTMLButtonElement | null;

    expect(button).toBeNull();
    expect(
      container.querySelector('[data-testid="plugin-ui-runtime-result"]'),
    ).toBeNull();
    expect(container.textContent).toContain("content_factory");
  });

  it("P15 Lab setup 解决后可完成 install flow 并运行 workflow entry", async () => {
    const container = await renderPage({
      realAdapterEnabled: true,
      workerRuntimeEnabled: true,
    });
    const setupButton = container.querySelector(
      '[data-testid="plugin-lab-resolve-setup"]',
    ) as HTMLButtonElement | null;

    expect(setupButton).not.toBeNull();
    await act(async () => {
      setupButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "plugin.lab.installFlow.launchReady",
    );

    const button = container.querySelector(
      '[data-testid="plugin-run-entry-content_factory"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="plugin-run-result"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="plugin-entry-runtime-guard-allow"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      "plugin.lab.installFlow.status.launched",
    );
    expect(
      container.querySelector(
        '[data-testid="plugin-install-flow-stage-cleanup-preview"]',
      ),
    ).not.toBeNull();
  });

  it("P16 Plugin Manager 应复用 P14 guard 并提供禁用和清理证据预览", async () => {
    const container = await renderPage({
      realAdapterEnabled: true,
      workerRuntimeEnabled: true,
    });
    const setupButton = container.querySelector(
      '[data-testid="plugin-lab-resolve-setup"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      setupButton?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="plugin-manager"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="plugin-manager-repository-list"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-testid^="plugin-manager-repository-app-"]',
      ),
    ).toHaveLength(2);
    expect(container.textContent).toContain("content-factory-playbook-app");
    expect(container.textContent).toContain(
      "plugin.lab.manager.status.launchable",
    );

    const launchButton = container.querySelector(
      '[data-testid="plugin-manager-launch-entry-content_factory"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector(
        '[data-testid="plugin-entry-runtime-guard-allow"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="plugin-run-result"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="plugin-manager-cleanup-evidence"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      "plugin.lab.manager.evidence.action.launch",
    );

    const disableButton = container.querySelector(
      '[data-testid="plugin-manager-disable"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      disableButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "plugin.lab.manager.status.disabled",
    );
    expect(launchButton?.disabled).toBe(true);

    const deleteDataButton = container.querySelector(
      '[data-testid="plugin-manager-uninstall-delete-data"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      deleteDataButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "plugin.lab.manager.evidence.action.uninstall-delete-data",
    );
    expect(container.textContent).toContain(
      "plugin.lab.manager.evidence.noNonAppData",
    );
  });

  it("P16-H Manager 选择 companion App 后 launch 与 disable 状态应绑定 selected state", async () => {
    const container = await renderPage({
      realAdapterEnabled: true,
      workerRuntimeEnabled: true,
    });
    const setupButton = container.querySelector(
      '[data-testid="plugin-lab-resolve-setup"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      setupButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const companionButton = container.querySelector(
      '[data-testid="plugin-manager-repository-app-content-factory-playbook-app"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      companionButton?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="plugin-manager-selected-app"]')
        ?.textContent,
    ).toContain("fixture:content-factory-playbook-app");

    const launchButton = container.querySelector(
      '[data-testid="plugin-manager-launch-entry-content_factory"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="plugin-run-result"]')
        ?.textContent,
    ).toContain("content-factory-playbook-app");

    const deleteDataButton = container.querySelector(
      '[data-testid="plugin-manager-uninstall-delete-data"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      deleteDataButton?.click();
      await Promise.resolve();
    });

    const evidenceJson = container.querySelector(
      '[data-testid="plugin-manager-evidence-json"]',
    );
    expect(evidenceJson).not.toBeNull();
    expect(evidenceJson?.textContent).toContain(
      '"appId": "content-factory-playbook-app"',
    );
    expect(evidenceJson?.textContent).toContain('"strategy": "delete-data"');
    expect(evidenceJson?.textContent).toContain('"blockedTargetCount": 0');
    expect(evidenceJson?.textContent).not.toContain("secret-value");
    expect(
      container.querySelector(
        '[data-testid="plugin-manager-residual-audit"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="plugin-manager-residual-pending"]',
      )?.textContent,
    ).toContain("plugin.lab.manager.evidence.residual.pendingDeletion");

    const disableButton = container.querySelector(
      '[data-testid="plugin-manager-disable"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      disableButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "plugin.lab.manager.status.disabled",
    );
    expect(launchButton?.disabled).toBe(true);

    unmountPage(container);
    const restoredContainer = await renderPage({
      realAdapterEnabled: true,
      workerRuntimeEnabled: true,
    });
    const restoredSetupButton = restoredContainer.querySelector(
      '[data-testid="plugin-lab-resolve-setup"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      restoredSetupButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const restoredCompanionButton = restoredContainer.querySelector(
      '[data-testid="plugin-manager-repository-app-content-factory-playbook-app"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      restoredCompanionButton?.click();
      await Promise.resolve();
    });

    const restoredLaunchButton = restoredContainer.querySelector(
      '[data-testid="plugin-manager-launch-entry-content_factory"]',
    ) as HTMLButtonElement | null;
    expect(restoredContainer.textContent).toContain(
      "plugin.lab.manager.status.disabled",
    );
    expect(restoredLaunchButton?.disabled).toBe(true);
  });

  it("开启 workflow runtime 后也不再暴露宿主内置内容工厂 demo", async () => {
    const container = await renderPage({
      realAdapterEnabled: true,
      workerRuntimeEnabled: true,
    });

    expect(
      container.querySelector('[data-testid="plugin-run-content-demo"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="plugin-workflow-runtime-result"]',
      ),
    ).toBeNull();
    expect(container.textContent).not.toContain("content_factory_demo");
  });
});
