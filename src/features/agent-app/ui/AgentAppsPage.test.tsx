import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorkflowRuntimeCapabilityProfile } from "../runtime/workflowRuntimeCapabilityProfile";
import type { AppManifest } from "../types";
import type { AgentAppHostLifecycleSnapshot } from "../host";
import {
  act,
  apiMocks,
  buildReadyState,
  buildReviewResult,
  buildStandaloneState,
  cleanupAgentAppsPageTest,
  contentFactoryFixture,
  expectInstallReviewDialog,
  flush,
  installedStates,
  LOCAL_APP_DIR,
  openAppDetail,
  REMOVED_MACHINE_PATH,
  renderPage,
  resetAgentAppsPageTest,
  toast,
} from "./AgentAppsPage.testFixtures";

describe("AgentAppsPage", () => {
  beforeEach(resetAgentAppsPageTest);
  afterEach(cleanupAgentAppsPageTest);

  it("应展示本地安装源和 Cloud catalog，并在审查确认后从本地安装第一个 Agent App", async () => {
    const container = await renderPage();
    await flush();

    expect(container.textContent).toContain("agentApp.apps.center.title");
    expect(container.textContent).toContain("agentApp.apps.center.description");
    expect(
      container
        .querySelector('[data-testid="agent-apps-search"]')
        ?.getAttribute("placeholder"),
    ).toBe("agentApp.apps.center.searchPlaceholder");
    expect(container.textContent).not.toContain(REMOVED_MACHINE_PATH);
    expect(
      container.querySelector(
        '[data-testid="agent-apps-list-row-content-factory-app"]',
      ),
    ).not.toBeNull();
    expect(apiMocks.listAgentAppHostLifecycleSnapshots).toHaveBeenCalledTimes(
      1,
    );
    const fallbackIcon = container.querySelector(
      '[data-testid="agent-apps-icon-content-factory-app"] img',
    ) as HTMLImageElement | null;
    expect(fallbackIcon?.getAttribute("src")).toContain("data:image/svg+xml");
    expect(
      decodeURIComponent(fallbackIcon?.getAttribute("src") ?? ""),
    ).toContain("内容工厂");
    expect(
      container.querySelector(
        '[data-testid="agent-apps-open-detail-content-factory-app"]',
      )?.textContent,
    ).toContain("agentApp.apps.center.action.details");
    expect(
      container.querySelector('[data-testid="agent-apps-detail"]'),
    ).toBeNull();
    expect(container.textContent).toContain(
      "agentApp.apps.center.source.cloud",
    );
    expect(container.textContent).toContain(
      "agentApp.apps.center.status.installable",
    );

    const installLocal = container.querySelector(
      '[data-testid="agent-apps-install-local"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installLocal?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.selectLocalAgentAppDirectory).toHaveBeenCalledWith({
      title: "agentApp.apps.localSource.dialogTitle",
    });
    expect(apiMocks.reviewLocalAgentAppPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        appDir: LOCAL_APP_DIR,
      }),
    );
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expectInstallReviewDialog(container);
    expect(
      container.querySelector(
        '[data-testid="agent-apps-install-review-release-evidence"]',
      ),
    ).toBeNull();

    const confirmInstall = container.querySelector(
      '[data-testid="agent-apps-install-review-confirm"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      confirmInstall?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.saveInstalledAgentAppState).toHaveBeenCalledWith({
      state: expect.objectContaining({
        appId: "content-factory-app",
      }),
    });
    expect(
      container.querySelector(
        '[data-testid="agent-apps-installed-content-factory-app"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("内容工厂");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("正式入口页面壳和主按钮应接入 Lime 主题变量", async () => {
    const container = await renderPage();
    await flush();

    const page = container.querySelector('[data-testid="agent-apps-page"]');
    const installLocal = container.querySelector(
      '[data-testid="agent-apps-install-local"]',
    ) as HTMLButtonElement | null;

    expect(page?.className).toContain("lime-workbench-theme-scope");
    expect(page?.className).toContain("bg-[color:var(--lime-app-bg)]");
    expect(installLocal?.className).toContain(
      "bg-[color:var(--lime-text-strong)]",
    );
    expect(installLocal?.className).toContain("rounded-full");
    expect(
      container
        .querySelector('[data-testid="agent-apps-list"]')
        ?.closest("section")?.className,
    ).toContain("space-y-4");
    expect(
      container.querySelector('[data-testid="agent-apps-list"]')?.className,
    ).toContain("lg:grid-cols-3");
    expect(
      container.querySelector(
        '[data-testid="agent-apps-list-row-content-factory-app"]',
      )?.className,
    ).toContain("min-h-[188px]");
  });

  it("本地 App 卡片应优先展示 manifest 声明的图标", async () => {
    installedStates.push(
      buildReadyState({
        manifest: {
          ...(contentFactoryFixture as AppManifest),
          install: {
            branding: {
              name: "内容工厂",
              icon: "./assets/icon.svg",
              windowTitle: "内容工厂",
            },
          },
        },
      }),
    );
    const container = await renderPage();
    await flush();

    const icon = container.querySelector(
      '[data-testid="agent-apps-icon-content-factory-app"] img',
    ) as HTMLImageElement | null;
    expect(icon?.getAttribute("src")).toBe(
      `asset://${LOCAL_APP_DIR}/assets/icon.svg`,
    );

    await openAppDetail(container);

    const detailIcon = container.querySelector(
      '[data-testid="agent-apps-detail-icon-content-factory-app"] img',
    ) as HTMLImageElement | null;
    expect(detailIcon?.getAttribute("src")).toBe(
      `asset://${LOCAL_APP_DIR}/assets/icon.svg`,
    );
  });

  it("应用中心应展示 Agent App 宿主状态和 Right Surface 合同", async () => {
    const installed = buildReadyState({
      manifest: {
        ...(contentFactoryFixture as AppManifest),
        status: "ready",
        profiles: ["workbench"],
        workbench: {
          profile: "production",
          productWorkspace: {
            scope: "session",
            primaryObjectKinds: ["articleDraft"],
          },
          productionObjects: [
            {
              kind: "articleDraft",
              title: "文章草稿",
              artifactKind: "markdown_document",
              defaultSurface: "documentCanvas",
              primary: true,
            },
          ],
          objectSurfaces: [
            {
              objectKind: "articleDraft",
              surfaceKind: "documentCanvas",
              renderer: "host_builtin",
            },
          ],
          historyRestore: {
            defaultSurface: "selectedObject",
            restoreSelection: true,
            restoreLayout: true,
          },
        },
      },
    });
    installedStates.push(installed);
    const hostSnapshot = {
      appId: installed.appId,
      displayName: "内容工厂",
      profiles: ["workbench"],
      appCenterStatus: "blocked",
      readinessStatus: "blocked",
      rightSurface: {
        dock: "right",
        physicalDockCount: 1,
        defaultActiveTab: "productProfile",
        supportedTabs: ["productProfile", "file"],
        productProfile: {
          enabled: true,
          objects: [
            {
              kind: "articleDraft",
              title: "文章草稿",
              defaultPane: "documentCanvas",
              artifactKind: "markdown_document",
              primary: true,
            },
          ],
          panes: ["documentCanvas"],
          rendererKinds: ["host_builtin"],
        },
        historyRestore: {
          enabled: true,
          defaultTab: "productProfile",
          defaultPane: "documentCanvas",
          restoreSelection: true,
          restoreLayout: true,
          fallback: "artifactPreview",
        },
      },
      taskRuntime: {
        enabled: true,
        packageRootPath: null,
        workerEntrypoint: null,
        contractPath: null,
        sampleRequestPath: null,
        outputArtifactKind: null,
        taskKinds: [],
        directProviderAccess: false,
        directFilesystemAccess: false,
        blockers: ["TASK_RUNTIME_WORKER_ENTRYPOINT_MISSING"],
        followUps: [],
      },
      functions: [],
      blockers: [
        "CLOUD_REGISTRATION_REQUIRED",
        "TASK_RUNTIME_WORKER_ENTRYPOINT_MISSING",
      ],
      followUps: [],
      generatedAt: installed.updatedAt,
    } satisfies AgentAppHostLifecycleSnapshot;
    apiMocks.listAgentAppHostLifecycleSnapshots.mockResolvedValue({
      snapshots: [hostSnapshot],
      issues: [],
    });
    const container = await renderPage();
    await flush();

    expect(
      container.querySelector(
        '[data-testid="agent-apps-host-status-content-factory-app"]',
      )?.textContent,
    ).toContain("agentApp.apps.center.host.status.");
    expect(
      container.querySelector(
        '[data-testid="agent-apps-host-product-profile-content-factory-app"]',
      )?.textContent,
    ).toContain("agentApp.apps.center.host.productProfile");

    await openAppDetail(container);

    const detail = container.querySelector(
      '[data-testid="agent-apps-host-lifecycle"]',
    );
    expect(detail?.textContent).toContain("agentApp.apps.center.host.title");
    expect(detail?.textContent).toContain(
      "agentApp.apps.center.host.rightSurface",
    );
    expect(detail?.textContent).toContain("agentApp.apps.center.host.blockers");
    expect(detail?.textContent).toContain(
      "agentApp.apps.center.host.issueSummary.title",
    );
    expect(detail?.textContent).toContain(
      "agentApp.apps.center.host.issueCategory.cloud",
    );
    expect(detail?.textContent).toContain(
      "agentApp.apps.center.host.issueCategory.taskRuntime",
    );
    expect(
      container.querySelector(
        '[data-testid="agent-apps-host-readiness-category-cloud"]',
      ),
    ).not.toBeNull();
  });

  it("安装确认弹层应展示待安装 App 的 manifest 图标", async () => {
    const stateWithIcon = buildReadyState({
      manifest: {
        ...(contentFactoryFixture as AppManifest),
        install: {
          branding: {
            name: "内容工厂",
            icon: "./assets/icon.svg",
            windowTitle: "内容工厂",
          },
        },
      },
    });
    apiMocks.reviewLocalAgentAppPackage.mockResolvedValue(
      buildReviewResult(stateWithIcon),
    );

    const container = await renderPage();
    await flush();

    const installLocal = container.querySelector(
      '[data-testid="agent-apps-install-local"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installLocal?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expectInstallReviewDialog(container);
    const reviewIcon = container.querySelector(
      '[data-testid="agent-apps-install-review-icon-content-factory-app"] img',
    ) as HTMLImageElement | null;
    expect(reviewIcon?.getAttribute("src")).toBe(
      `asset://${LOCAL_APP_DIR}/assets/icon.svg`,
    );
  });

  it("应用卡片应兼容 manifest presentation.logo 字段", async () => {
    installedStates.push(
      buildReadyState({
        manifest: {
          ...(contentFactoryFixture as AppManifest),
          presentation: {
            logo: "https://lime.local/content-factory-logo.png",
          },
        },
      }),
    );
    const container = await renderPage();
    await flush();

    const icon = container.querySelector(
      '[data-testid="agent-apps-icon-content-factory-app"] img',
    ) as HTMLImageElement | null;
    expect(icon?.getAttribute("src")).toBe(
      "https://lime.local/content-factory-logo.png",
    );

    await openAppDetail(container);

    const detailIcon = container.querySelector(
      '[data-testid="agent-apps-detail-icon-content-factory-app"] img',
    ) as HTMLImageElement | null;
    expect(detailIcon?.getAttribute("src")).toBe(
      "https://lime.local/content-factory-logo.png",
    );
  });

  it("本地图标不应把机器绝对路径作为浏览器路径输出到图片 src", async () => {
    installedStates.push(
      buildReadyState({
        manifest: {
          ...(contentFactoryFixture as AppManifest),
          install: {
            branding: {
              name: "内容工厂",
              icon: REMOVED_MACHINE_PATH,
              windowTitle: "内容工厂",
            },
          },
        },
      }),
    );
    const container = await renderPage();
    await flush();

    const icon = container.querySelector(
      '[data-testid="agent-apps-icon-content-factory-app"] img',
    ) as HTMLImageElement | null;
    expect(icon?.getAttribute("src")).not.toBe(REMOVED_MACHINE_PATH);
    expect(icon?.getAttribute("src")).toBe(`asset://${REMOVED_MACHINE_PATH}`);
    expect(
      container.querySelector('img[src^="/Users/"], img[src^="C:\\\\"]'),
    ).toBeNull();

    await openAppDetail(container);

    const detailIcon = container.querySelector(
      '[data-testid="agent-apps-detail-icon-content-factory-app"] img',
    ) as HTMLImageElement | null;
    expect(detailIcon?.getAttribute("src")).not.toBe(REMOVED_MACHINE_PATH);
    expect(detailIcon?.getAttribute("src")).toBe(
      `asset://${REMOVED_MACHINE_PATH}`,
    );
    expect(
      container.querySelector('img[src^="/Users/"], img[src^="C:\\\\"]'),
    ).toBeNull();
  });

  it("详情弹窗应支持关闭并回到卡片列表", async () => {
    const container = await renderPage();
    await flush();

    await openAppDetail(container);

    expect(
      container.querySelector('[data-testid="agent-apps-detail-overlay"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-detail"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="agent-apps-detail"]')
        ?.getAttribute("role"),
    ).toBe("dialog");
    expect(
      container.querySelector('[data-testid="agent-apps-list"]')?.className,
    ).toContain("lg:grid-cols-3");

    const closeDetail = container.querySelector(
      '[data-testid="agent-apps-close-detail"]',
    ) as HTMLButtonElement | null;
    expect(closeDetail?.getAttribute("aria-label")).toBe(
      "agentApp.apps.center.detail.close",
    );
    expect(closeDetail?.textContent).toContain(
      "agentApp.apps.center.detail.close",
    );

    await act(async () => {
      closeDetail?.click();
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="agent-apps-detail"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-detail-overlay"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="agent-apps-list-row-content-factory-app"]',
      ),
    ).not.toBeNull();
  });

  it("取消选择本地目录时不应生成安装审查或写入 repository", async () => {
    apiMocks.selectLocalAgentAppDirectory.mockResolvedValue(null);
    const container = await renderPage();
    await flush();

    const installLocal = container.querySelector(
      '[data-testid="agent-apps-install-local"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installLocal?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewLocalAgentAppPackage).not.toHaveBeenCalled();
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="agent-apps-install-review"]'),
    ).toBeNull();
  });

  it("本地 package 非法时不应写入 repository", async () => {
    apiMocks.reviewLocalAgentAppPackage.mockRejectedValue(
      new Error("APP.md invalid"),
    );
    const container = await renderPage();
    await flush();

    const installLocal = container.querySelector(
      '[data-testid="agent-apps-install-local"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installLocal?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewLocalAgentAppPackage).toHaveBeenCalled();
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="agent-apps-install-review"]'),
    ).toBeNull();
  });

  it("本地企业定制包未激活注册码时应展示本地化阻断文案", async () => {
    const error = new Error("raw registration required");
    error.name = "AgentAppRegistrationRequiredError";
    apiMocks.reviewLocalAgentAppPackage.mockRejectedValue(error);
    const container = await renderPage();
    await flush();

    const installLocal = container.querySelector(
      '[data-testid="agent-apps-install-local"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installLocal?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewLocalAgentAppPackage).toHaveBeenCalled();
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "agentApp.apps.toast.failed",
      expect.objectContaining({
        description: "agentApp.apps.registration.localInstallBlocked",
      }),
    );
  });

  it("企业定制 Cloud App 未注册前应阻断安装并提交注册码", async () => {
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
            version: "0.3.0",
            registrationRequired: true,
            registrationState: "required",
            registrationHint: "请输入企业注册码",
            enabled: false,
            disabledReason: "registration required",
            packageUrl: "",
            packageHash: "",
            manifestHash: "",
            capabilityRequirements: {},
            defaultEntries: ["dashboard"],
            policyDefaults: {},
            toolAvailability: [],
          },
        ],
      },
    });

    const container = await renderPage();
    await flush();

    const installCloud = container.querySelector(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    expect(installCloud?.disabled).toBe(true);
    expect(
      container.querySelector(
        '[data-testid="agent-apps-registration-content-factory-app"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-detail"]'),
    ).toBeNull();

    await openAppDetail(container);

    const input = container.querySelector(
      '[data-testid="agent-apps-registration-code-content-factory-app"]',
    ) as HTMLInputElement | null;
    await act(async () => {
      if (input) {
        input.value = "CF-REG-2026";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await Promise.resolve();
    });

    const submit = container.querySelector(
      '[data-testid="agent-apps-submit-registration-content-factory-app"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      submit?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.submitAgentAppRegistrationCode).toHaveBeenCalledWith(
      "content-factory-app",
      "CF-REG-2026",
    );
    expect(apiMocks.installCloudAgentAppRelease).not.toHaveBeenCalled();

    expect(
      container.querySelector(
        '[data-testid="agent-apps-source-state-content-factory-app"]',
      )?.textContent,
    ).toContain("agentApp.apps.sourceState.registrationActive");

    const enabledInstallCloud = container.querySelector(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    expect(enabledInstallCloud?.disabled).toBe(false);
    await act(async () => {
      enabledInstallCloud?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewCloudAgentAppRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        app: expect.objectContaining({
          appId: "content-factory-app",
          registrationState: "active",
        }),
      }),
    );
    expectInstallReviewDialog(container);
  });

  it("已安装旧版 Cloud App 需要重新激活时，主按钮应提示输入激活码而不是假装一键更新", async () => {
    installedStates.push(
      buildReadyState({
        manifest: {
          ...(contentFactoryFixture as AppManifest),
          version: "0.2.0",
        },
      }),
    );
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
            version: "0.3.0",
            registrationRequired: true,
            registrationState: "required",
            registrationHint: "请输入企业注册码",
            enabled: false,
            disabledReason: "registration required",
            packageUrl: "",
            packageHash: "",
            manifestHash: "",
            capabilityRequirements: {},
            defaultEntries: ["dashboard"],
            policyDefaults: {},
            toolAvailability: [],
          },
        ],
      },
    });

    const container = await renderPage();
    await flush();

    expect(container.textContent).toContain(
      "agentApp.apps.center.status.registration",
    );
    expect(container.textContent).toContain(
      "agentApp.apps.center.action.activate",
    );
    expect(container.textContent).not.toContain(
      "agentApp.apps.center.action.updateOneClick",
    );

    const activateButton = container.querySelector(
      '[data-testid="agent-apps-update-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    expect(activateButton?.disabled).toBe(false);
    await act(async () => {
      activateButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="agent-apps-detail"]'),
    ).not.toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      "agentApp.apps.registration.codeRequired",
    );
    expect(apiMocks.reviewCloudAgentAppRelease).not.toHaveBeenCalled();
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
  });

  it("已安装旧版 Cloud App 可更新时应打开居中安装审查弹窗", async () => {
    installedStates.push(
      buildReadyState({
        manifest: {
          ...(contentFactoryFixture as AppManifest),
          version: "0.2.0",
        },
      }),
    );

    const container = await renderPage();
    await flush();

    expect(container.textContent).toContain(
      "agentApp.apps.center.status.update",
    );
    const updateButton = container.querySelector(
      '[data-testid="agent-apps-update-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    expect(updateButton?.disabled).toBe(false);

    await act(async () => {
      updateButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewCloudAgentAppRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        app: expect.objectContaining({
          appId: "content-factory-app",
          version: "0.3.0",
        }),
      }),
    );
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expectInstallReviewDialog(container);
  });

  it("Cloud App 已满足注册条件时应先生成安装审查再写入 installed state", async () => {
    const container = await renderPage();
    await flush();

    expect(
      container.querySelector(
        '[data-testid="agent-apps-source-state-content-factory-app"]',
      )?.textContent,
    ).toContain("agentApp.apps.sourceState.cloudDiscovered");

    const installCloud = container.querySelector(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installCloud?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewCloudAgentAppRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        app: expect.objectContaining({
          appId: "content-factory-app",
        }),
        catalogSource: "seeded",
      }),
    );
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expectInstallReviewDialog(container);
    const releaseEvidence = container.querySelector(
      '[data-testid="agent-apps-install-review-release-evidence"]',
    );
    expect(releaseEvidence).not.toBeNull();
    expect(releaseEvidence?.getAttribute("data-source-kind")).toBe(
      "fetched_package",
    );
    expect(releaseEvidence?.getAttribute("data-catalog-source")).toBe("seeded");
    expect(
      container.querySelector(
        '[data-testid="agent-apps-install-review-release-evidence-status"]',
      )?.textContent,
    ).toContain("agentApp.apps.installReview.releaseEvidence.status.warning");
    expect(container.textContent).toContain(
      "agentApp.apps.installReview.releaseEvidence.checkStatus.missing",
    );
    expect(
      container
        .querySelector(
          '[data-testid="agent-apps-install-review-release-audit-summary"]',
        )
        ?.getAttribute("data-can-install"),
    ).toBe("true");
    expect(container.textContent).toContain(
      "agentApp.apps.installReview.releaseEvidence.audit.counts",
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });
    const copyReport = container.querySelector(
      '[data-testid="agent-apps-install-review-release-audit-copy"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      copyReport?.click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "# Agent App Release Audit: content-factory-app@0.3.0",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Status: warning"),
    );
    expect(
      container.querySelector(
        '[data-testid="agent-apps-install-review-release-audit-copy-state"]',
      )?.textContent,
    ).toContain(
      "agentApp.apps.installReview.releaseEvidence.audit.copyState.copied",
    );

    const confirmInstall = container.querySelector(
      '[data-testid="agent-apps-install-review-confirm"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      confirmInstall?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.saveInstalledAgentAppState).toHaveBeenCalledWith({
      state: expect.objectContaining({
        appId: "content-factory-app",
      }),
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("Cloud App 发布包证据阻断时不允许确认安装", async () => {
    apiMocks.reviewCloudAgentAppRelease.mockImplementationOnce(async () => {
      const state = buildReadyState();
      return buildReviewResult(state, {
        sourceKind: "cloud_release",
        sourceUri:
          "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
        packageUrl:
          "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
        releaseEvidence: {
          appId: state.appId,
          version: state.identity.appVersion,
          catalogSource: "remote",
          sourceKind: "fetched_package",
          packageHashDeclared: true,
          manifestHashDeclared: true,
          signatureDeclared: true,
          declaredPackageHash: state.identity.packageHash,
          declaredManifestHash: state.identity.manifestHash,
          actualPackageHash: state.identity.packageHash,
          actualManifestHash: state.identity.manifestHash,
          packageHashMatched: true,
          manifestHashMatched: true,
          signatureRef: "sigstore:content-factory-app@0.3.0",
          signaturePolicy: "required",
          signatureVerificationStatus: "declared",
          packageVerificationStatus: "verified",
          status: "blocked",
          blockerCodes: ["signature_unverified"],
          warningCodes: [],
        },
      });
    });

    const container = await renderPage();
    await flush();

    const installCloud = container.querySelector(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installCloud?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    const confirmInstall = container.querySelector(
      '[data-testid="agent-apps-install-review-confirm"]',
    ) as HTMLButtonElement | null;
    expect(confirmInstall?.disabled).toBe(true);
    expect(
      container.querySelector(
        '[data-testid="agent-apps-install-review-release-evidence-status"]',
      )?.textContent,
    ).toContain("agentApp.apps.installReview.releaseEvidence.status.blocked");
    expect(container.textContent).toContain(
      "agentApp.apps.installReview.releaseEvidence.checkStatus.unverified",
    );
    expect(
      container
        .querySelector(
          '[data-testid="agent-apps-install-review-release-audit-summary"]',
        )
        ?.getAttribute("data-can-install"),
    ).toBe("false");
    expect(
      container
        .querySelector(
          '[data-testid="agent-apps-install-review-release-audit-signature"]',
        )
        ?.getAttribute("data-issue-codes"),
    ).toBe("CLOUD_SIGNATURE_UNVERIFIED");

    await act(async () => {
      confirmInstall?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
  });

  it("Cloud App 缺少 hash 时应阻断安装审查", async () => {
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
            version: "0.3.0",
            registrationRequired: false,
            registrationState: "not_required",
            enabled: true,
            packageUrl:
              "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
            packageHash: "",
            manifestHash: "",
            capabilityRequirements: {},
            defaultEntries: ["dashboard"],
            policyDefaults: {},
            toolAvailability: [],
          },
        ],
      },
    });
    const container = await renderPage();
    await flush();

    expect(
      container.querySelector(
        '[data-testid="agent-apps-source-state-content-factory-app"]',
      )?.textContent,
    ).toContain("agentApp.apps.sourceState.hashMissing");
    const installCloud = container.querySelector(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    expect(installCloud?.disabled).toBe(true);
    expect(apiMocks.reviewCloudAgentAppRelease).not.toHaveBeenCalled();
  });

  it("已安装 App 应支持启动 UI entry、禁用/启用、delete-data 阻断和 keep-data 卸载", async () => {
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

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="agent-apps-launch-entry-dashboard"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="agent-apps-launch-summary"]')
        ?.textContent,
    ).toContain("ui:项目首页:/dashboard");
    const lifecycleActions = container.querySelector(
      '[data-testid="agent-apps-lifecycle-actions"]',
    );
    expect(lifecycleActions).not.toBeNull();
    expect(
      lifecycleActions?.querySelector(
        '[data-testid="agent-apps-uninstall-keep-data"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-more-info-content"]'),
    ).toBeNull();

    const disableButton = container.querySelector(
      '[data-testid="agent-apps-disable"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      disableButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.setAgentAppDisabled).toHaveBeenCalledWith({
      appId: "content-factory-app",
      disabled: true,
      updatedAt: expect.any(String),
    });
    expect(container.textContent).toContain(
      "agentApp.apps.center.status.disabled",
    );

    const enableButton = container.querySelector(
      '[data-testid="agent-apps-enable"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      enableButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.setAgentAppDisabled).toHaveBeenLastCalledWith({
      appId: "content-factory-app",
      disabled: false,
      updatedAt: expect.any(String),
    });

    const uninstallButton = container.querySelector(
      '[data-testid="agent-apps-uninstall-delete-data"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      uninstallButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.previewAgentAppUninstall).toHaveBeenCalledWith({
      appId: "content-factory-app",
      mode: "delete-data",
    });
    expect(
      container.querySelector('[data-testid="agent-apps-uninstall-preview"]')
        ?.textContent,
    ).toContain("delete:2 retain:1");
    expect(
      container.querySelector('[data-testid="agent-apps-cleanup-evidence"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-residual-audit"]')
        ?.textContent,
    ).toContain("agentApp.lab.manager.evidence.residual.pendingDeletion");
    const evidenceJson = container.querySelector(
      '[data-testid="agent-apps-cleanup-evidence-json"]',
    )?.textContent;
    expect(evidenceJson).toContain('"namespaceKind": "overlay"');
    expect(evidenceJson).toContain('"category": "secret-ref"');
    expect(evidenceJson).not.toContain("sk-secret-value");

    const confirmButton = container.querySelector(
      '[data-testid="agent-apps-uninstall-confirm"]',
    ) as HTMLButtonElement | null;
    const phrase = container.querySelector(
      '[data-testid="agent-apps-delete-data-confirmation-phrase"]',
    )?.textContent;
    const confirmationInput = container.querySelector(
      '[data-testid="agent-apps-delete-data-confirmation-input"]',
    ) as HTMLInputElement | null;
    expect(phrase).toContain("DELETE_AGENT_APP_DATA content-factory-app");
    expect(confirmationInput?.disabled).toBe(true);
    expect(confirmButton?.disabled).toBe(true);
    expect(
      container.querySelector(
        '[data-testid="agent-apps-delete-data-current-phase-gate"]',
      )?.textContent,
    ).toContain("agentApp.apps.uninstallPreview.deleteDataGate.dryRunOnly");
    expect(
      container.querySelector(
        '[data-testid="agent-apps-delete-data-confirmation-status"]',
      )?.textContent,
    ).toContain("agentApp.apps.uninstallPreview.deleteDataGate.dryRunOnly");
    const switchKeepDataButton = container.querySelector(
      '[data-testid="agent-apps-uninstall-switch-keep-data"]',
    ) as HTMLButtonElement | null;
    expect(switchKeepDataButton?.disabled).toBe(false);
    expect(switchKeepDataButton?.textContent).toContain(
      "agentApp.apps.action.uninstallKeepData",
    );
    const readyConfirmButton = container.querySelector(
      '[data-testid="agent-apps-uninstall-confirm"]',
    ) as HTMLButtonElement | null;
    expect(readyConfirmButton?.disabled).toBe(true);

    await act(async () => {
      readyConfirmButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.uninstallAgentApp).not.toHaveBeenCalled();
    const appRowAfterDeleteDataBlocked = container.querySelector(
      '[data-testid="agent-apps-list-row-content-factory-app"]',
    );
    expect(appRowAfterDeleteDataBlocked?.textContent).toContain(
      "agentApp.apps.center.status.installed",
    );

    await act(async () => {
      switchKeepDataButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.previewAgentAppUninstall).toHaveBeenLastCalledWith({
      appId: "content-factory-app",
      mode: "keep-data",
    });
    expect(
      container.querySelector('[data-testid="agent-apps-uninstall-preview"]')
        ?.textContent,
    ).toContain("delete:1 retain:2");

    const keepDataConfirmButton = container.querySelector(
      '[data-testid="agent-apps-uninstall-confirm"]',
    ) as HTMLButtonElement | null;
    expect(keepDataConfirmButton?.disabled).toBe(false);
    await act(async () => {
      keepDataConfirmButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.uninstallAgentApp).toHaveBeenLastCalledWith({
      appId: "content-factory-app",
      mode: "keep-data",
    });
    const appRowAfterUninstall = container.querySelector(
      '[data-testid="agent-apps-list-row-content-factory-app"]',
    );
    expect(appRowAfterUninstall?.textContent).toContain(
      "agentApp.apps.center.status.installable",
    );
    expect(
      container.querySelector('[data-testid="agent-apps-uninstall-preview"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-launch-summary"]')
        ?.textContent,
    ).toContain("agentApp.apps.uninstall.completed");
  });

  it("standalone App 默认只打开独立窗口，不投递当前 Claw Right Surface", async () => {
    installedStates.push(buildStandaloneState());
    const container = await renderPage(undefined, undefined, {
      workspaceId: "workspace-main",
      sessionId: "session-main",
    });
    await flush();

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="agent-apps-launch-entry-dashboard"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.launchAgentAppShell).toHaveBeenCalledTimes(1);
    expect(apiMocks.requestWorkspaceRightSurface).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="agent-apps-launch-summary"]')
        ?.textContent,
    ).toContain("shell:项目首页:http://127.0.0.1:4199/dashboard");
  });

  it("选择当前 Claw 右侧后才把 standalone App surface 投递到 Right Surface", async () => {
    installedStates.push(buildStandaloneState());
    const container = await renderPage(undefined, undefined, {
      workspaceId: "workspace-main",
      sessionId: "session-main",
    });
    await flush();

    const rightSurfaceButton = container.querySelector(
      '[data-testid="agent-apps-launch-target-right-surface"]',
    ) as HTMLButtonElement | null;
    expect(rightSurfaceButton?.disabled).toBe(false);
    await act(async () => {
      rightSurfaceButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(rightSurfaceButton?.getAttribute("aria-pressed")).toBe("true");

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="agent-apps-launch-entry-dashboard"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.launchAgentAppShell).toHaveBeenCalledTimes(1);
    expect(apiMocks.requestWorkspaceRightSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-main",
        sessionId: "session-main",
        surfaceKind: "appSurface",
        origin: "agent_app_center",
        reason: "agent_app_shell_surface_ready",
        priority: "foreground",
        candidateId: "content-factory-app",
        metadata: expect.objectContaining({
          appId: "content-factory-app",
          title: "内容工厂",
          surface: expect.objectContaining({
            entryUrl: "http://127.0.0.1:4199/dashboard",
            containerId: "agent-app-shell-content-factory-app-standalone",
            supportedStrategies: ["controlledBrowserWindow", "webContentsView"],
            embedding: expect.objectContaining({
              rightSurfaceDock: true,
              iframe: false,
              browserView: false,
            }),
          }),
        }),
      }),
      {},
    );
    expect(
      container.querySelector('[data-testid="agent-apps-launch-summary"]')
        ?.textContent,
    ).toContain("shell:项目首页:http://127.0.0.1:4199/dashboard");
  });

  it("选择多个 Claw 目标时应把 standalone App surface 投递到选中的会话", async () => {
    installedStates.push(buildStandaloneState());
    const container = await renderPage(
      undefined,
      undefined,
      {
        workspaceId: "workspace-main",
        sessionId: "session-main",
        label: "主会话",
      },
      [
        {
          workspaceId: "workspace-main",
          sessionId: "session-main",
          label: "主会话",
        },
        {
          workspaceId: "workspace-main",
          sessionId: "session-review",
          label: "复盘会话",
        },
      ],
    );
    await flush();

    const rightSurfaceButton = container.querySelector(
      '[data-testid="agent-apps-launch-target-right-surface"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      rightSurfaceButton?.click();
      await Promise.resolve();
    });
    await flush();

    const targetSelect = container.querySelector(
      '[data-testid="agent-apps-launch-target-select"]',
    ) as HTMLSelectElement | null;
    expect(targetSelect).not.toBeNull();
    expect(targetSelect?.options).toHaveLength(2);
    await act(async () => {
      if (targetSelect?.options[1]) {
        targetSelect.value = targetSelect.options[1].value;
        targetSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="agent-apps-launch-target-current"]')
        ?.textContent,
    ).toContain("复盘会话");

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="agent-apps-launch-entry-dashboard"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.requestWorkspaceRightSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-main",
        sessionId: "session-review",
        surfaceKind: "appSurface",
      }),
      {},
    );
  });

  it("没有 Claw target 时应禁用右侧打开选项", async () => {
    const container = await renderPage();
    await flush();

    const rightSurfaceButton = container.querySelector(
      '[data-testid="agent-apps-launch-target-right-surface"]',
    ) as HTMLButtonElement | null;
    expect(rightSurfaceButton?.disabled).toBe(true);
    expect(rightSurfaceButton?.getAttribute("aria-pressed")).toBe("false");
    expect(
      container.querySelector(
        '[data-testid="agent-apps-launch-target-unavailable"]',
      )?.textContent,
    ).toContain("agentApp.apps.launchTarget.rightSurfaceUnavailable");
  });
});
