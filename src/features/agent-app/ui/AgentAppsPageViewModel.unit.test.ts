import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildInstalledAgentAppState } from "../install/installedAppState";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { buildAgentAppLabResolvedSetupState } from "../install/labInstallFlow";
import { buildPackageIdentity } from "../install/packageIdentity";
import { buildWorkflowRuntimeCapabilityProfile } from "../runtime/workflowRuntimeCapabilityProfile";
import type {
  AppManifest,
  CloudBootstrapApp,
  HostCapabilityProfile,
  InstalledAgentAppState,
} from "../types";
import type { AgentAppHostLifecycleSnapshot } from "../host";
import {
  buildAppCenterFilterCounts,
  buildAppCenterHostLifecycleSummary,
  buildAppCenterItems,
  canOneClickUpdate,
  filterAppCenterItems,
  getActionLabelKey,
  getAppCenterPageCount,
  getCloudActionLabelKey,
  isCloudActionDisabled,
  isPrimaryActionDisabled,
  paginateAppCenterItems,
  resolveAppIconSrc,
} from "./AgentAppsPageViewModel";

const FIXED_AT = "2026-05-15T00:00:00.000Z";
const LOCAL_APP_DIR = "/tmp/lime/content-factory-app";

function buildProfile(): HostCapabilityProfile {
  return buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
}

function buildReadyState(
  params: {
    disabled?: boolean;
    manifest?: AppManifest;
    profile?: HostCapabilityProfile;
  } = {},
): InstalledAgentAppState {
  const manifest = params.manifest ?? (contentFactoryFixture as AppManifest);
  const identity = buildPackageIdentity({
    manifest,
    sourceKind: "local_folder",
    sourceUri: LOCAL_APP_DIR,
    loadedAt: FIXED_AT,
  });
  const setupPreview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    profile: params.profile ?? buildProfile(),
    loadedAt: FIXED_AT,
    checkedAt: FIXED_AT,
    generatedAt: FIXED_AT,
  });
  const setup = buildAgentAppLabResolvedSetupState(setupPreview.projection);
  const preview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    setup,
    profile: params.profile ?? buildProfile(),
    loadedAt: FIXED_AT,
    checkedAt: FIXED_AT,
    generatedAt: FIXED_AT,
  });

  return buildInstalledAgentAppState({
    preview,
    setup,
    disabled: params.disabled,
    installedAt: FIXED_AT,
    updatedAt: FIXED_AT,
  });
}

function buildCloudApp(
  overrides: Partial<CloudBootstrapApp> = {},
): CloudBootstrapApp {
  return {
    appId: "content-factory-app",
    displayName: "内容工厂",
    version: "0.3.0",
    registrationRequired: false,
    registrationState: "not_required",
    enabled: true,
    packageUrl:
      "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
    packageHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    manifestHash:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    capabilityRequirements: {},
    defaultEntries: ["dashboard"],
    policyDefaults: {},
    toolAvailability: [],
    ...overrides,
  };
}

function buildManifest(
  overrides: Partial<AppManifest> = {},
): AppManifest {
  return {
    ...(contentFactoryFixture as AppManifest),
    ...overrides,
  };
}

function buildHostLifecycleSnapshot(
  overrides: Partial<AgentAppHostLifecycleSnapshot> = {},
): AgentAppHostLifecycleSnapshot {
  return {
    appId: "content-factory-app",
    displayName: "内容工厂",
    profiles: ["workbench"],
    appCenterStatus: "blocked",
    readinessStatus: "ready",
    rightSurface: {
      dock: "right",
      physicalDockCount: 1,
      defaultActiveTab: "productProfile",
      supportedTabs: ["productProfile", "file"],
      productProfile: {
        enabled: true,
        objects: [],
        panes: ["artifact"],
        rendererKinds: ["host_builtin"],
      },
      historyRestore: {
        enabled: true,
        defaultTab: "productProfile",
        defaultPane: "artifact",
        restoreSelection: true,
        restoreLayout: true,
        fallback: "artifactPreview",
      },
    },
    taskRuntime: {
      enabled: true,
      workerEntrypoint: "./src/runtime/content-factory-worker.mjs",
      contractPath: "./app.runtime.yaml",
      sampleRequestPath: "./examples/runtime-request.sample.json",
      outputArtifactKind: "content_factory.workspace_patch",
      taskKinds: ["content.factory.generate"],
      directProviderAccess: false,
      directFilesystemAccess: false,
      blockers: [],
      followUps: [],
    },
    functions: [],
    blockers: ["SERVER_HOST_GATE_BLOCKED"],
    followUps: [],
    generatedAt: FIXED_AT,
    ...overrides,
  };
}

describe("AgentAppsPageViewModel", () => {
  it("应把 installed 与 Cloud catalog 投影为排序稳定的 App Center items", () => {
    const installedUpdate = buildReadyState({
      manifest: buildManifest({ version: "0.2.0" }),
    });
    const disabledLocal = buildReadyState({
      disabled: true,
      manifest: buildManifest({
        name: "local-disabled-app",
        displayName: "本地禁用应用",
        version: "1.0.0",
      }),
    });
    const items = buildAppCenterItems({
      installed: [disabledLocal, installedUpdate],
      cloudApps: [
        buildCloudApp(),
        buildCloudApp({
          appId: "registration-app",
          displayName: "注册应用",
          registrationRequired: true,
          registrationState: "required",
          enabled: false,
          packageUrl: "",
          packageHash: "",
          manifestHash: "",
        }),
        buildCloudApp({
          appId: "installable-app",
          displayName: "可安装应用",
          version: "1.0.0",
        }),
      ],
      catalogSource: "remote",
      convertLocalFileSrc: (path) => `asset://${path}`,
    });

    expect(items.map((item) => item.appId)).toEqual([
      "content-factory-app",
      "local-disabled-app",
      "registration-app",
      "installable-app",
    ]);
    expect(items.map((item) => item.statusKind)).toEqual([
      "update",
      "disabled",
      "registration",
      "installable",
    ]);
    expect(items.map((item) => item.sourceKind)).toEqual([
      "hybrid",
      "local",
      "cloud",
      "cloud",
    ]);
    expect(items[0]?.hostLifecycle).toEqual(
      expect.objectContaining({
        appId: "content-factory-app",
        appCenterStatus: "needs-setup",
      }),
    );
    expect(items[0]?.hostLifecycle?.rightSurface.supportedTabs).toContain(
      "productProfile",
    );
    expect(buildAppCenterFilterCounts(items)).toEqual({
      all: 4,
      installed: 2,
      installable: 1,
      attention: 3,
    });
  });

  it("应用纯函数完成搜索、来源筛选、状态筛选和分页", () => {
    const cloudApps = Array.from({ length: 25 }, (_, index) => {
      const number = index + 1;
      return buildCloudApp({
        appId: `bulk-app-${number}`,
        displayName: `批量应用 ${String(number).padStart(2, "0")}`,
        version: `1.0.${number}`,
      });
    });
    const items = buildAppCenterItems({
      installed: [],
      cloudApps,
      catalogSource: "remote",
    });

    expect(getAppCenterPageCount(items.length)).toBe(2);
    expect(paginateAppCenterItems(items, 2).map((item) => item.appId)).toEqual([
      "bulk-app-21",
      "bulk-app-22",
      "bulk-app-23",
      "bulk-app-24",
      "bulk-app-25",
    ]);
    expect(
      filterAppCenterItems(items, {
        searchQuery: "25",
        statusFilter: "all",
        sourceFilter: "all",
      }).map((item) => item.appId),
    ).toEqual(["bulk-app-25"]);
    expect(
      filterAppCenterItems(items, {
        searchQuery: "",
        statusFilter: "all",
        sourceFilter: "local",
      }),
    ).toEqual([]);
  });

  it("应解析本地图标、Cloud 直链、内联 SVG 和兜底名称图标", () => {
    const installedWithRelativeIcon = buildReadyState({
      manifest: buildManifest({
        install: {
          branding: {
            name: "内容工厂",
            icon: "./assets/icon.svg",
            windowTitle: "内容工厂",
          },
        },
      }),
    });

    expect(
      resolveAppIconSrc({
        title: "内容工厂",
        installedState: installedWithRelativeIcon,
        convertLocalFileSrc: (path) => `asset://${path}`,
      }),
    ).toBe(`asset://${LOCAL_APP_DIR}/assets/icon.svg`);

    const installedWithAbsoluteIcon = buildReadyState({
      manifest: buildManifest({
        install: {
          branding: {
            name: "内容工厂",
            icon: `${LOCAL_APP_DIR}/assets/icon.svg`,
            windowTitle: "内容工厂",
          },
        },
      }),
    });

    expect(
      resolveAppIconSrc({
        title: "内容工厂",
        installedState: installedWithAbsoluteIcon,
        convertLocalFileSrc: (path) => `asset://${path}`,
      }),
    ).toBe(`asset://${LOCAL_APP_DIR}/assets/icon.svg`);
    expect(
      decodeURIComponent(
        resolveAppIconSrc({
          title: "内容工厂",
          installedState: installedWithAbsoluteIcon,
          convertLocalFileSrc: (path) => path,
        }),
      ),
    ).toContain("内容工厂");
    expect(
      resolveAppIconSrc({
        title: "内容工厂",
        installedState: installedWithAbsoluteIcon,
        convertLocalFileSrc: (path) => path,
      }),
    ).not.toBe(`${LOCAL_APP_DIR}/assets/icon.svg`);

    const installedCloudReleaseWithAbsoluteIcon = buildReadyState({
      manifest: buildManifest({
        install: {
          branding: {
            name: "内容工厂",
            icon: `${LOCAL_APP_DIR}/assets/icon.svg`,
            windowTitle: "内容工厂",
          },
        },
      }),
    });
    installedCloudReleaseWithAbsoluteIcon.identity.sourceKind = "cloud_release";

    expect(
      resolveAppIconSrc({
        title: "内容工厂",
        installedState: installedCloudReleaseWithAbsoluteIcon,
        convertLocalFileSrc: (path) => `asset://${path}`,
      }),
    ).toBe(`asset://${LOCAL_APP_DIR}/assets/icon.svg`);

    expect(
      resolveAppIconSrc({
        title: "Cloud",
        cloudApp: buildCloudApp({ icon: `${LOCAL_APP_DIR}/assets/icon.svg` }),
        convertLocalFileSrc: (path) => `asset://${path}`,
      }),
    ).toBe(`asset://${LOCAL_APP_DIR}/assets/icon.svg`);

    expect(
      resolveAppIconSrc({
        title: "Cloud",
        cloudApp: buildCloudApp({ iconUrl: "https://lime.local/icon.png" }),
      }),
    ).toBe("https://lime.local/icon.png");
    expect(
      resolveAppIconSrc({
        title: "Cloud",
        cloudApp: buildCloudApp({
          logo: "https://lime.local/logo.png",
        }),
      }),
    ).toBe("https://lime.local/logo.png");
    expect(
      resolveAppIconSrc({
        title: "Cloud",
        cloudApp: buildCloudApp({
          presentation: {
            logo: "https://lime.local/presentation-logo.png",
          },
        }),
      }),
    ).toBe("https://lime.local/presentation-logo.png");
    expect(
      decodeURIComponent(
        resolveAppIconSrc({
          title: "Inline",
          cloudApp: buildCloudApp({
            icon: '<svg xmlns="http://www.w3.org/2000/svg"><text>Inline</text></svg>',
          }),
        }),
      ),
    ).toContain("<text>Inline</text>");
    expect(
      resolveAppIconSrc({
        title: "已安装应用",
        installedState: buildReadyState({
          manifest: buildManifest({
            presentation: {
              logo: "https://lime.local/installed-logo.png",
            },
          }),
        }),
      }),
    ).toBe("https://lime.local/installed-logo.png");
    expect(
      decodeURIComponent(
        resolveAppIconSrc({
          title: "兜底应用",
          cloudApp: buildCloudApp({ icon: "icons/relative.svg" }),
        }),
      ),
    ).toContain("兜底应用");
  });

  it("应从 item 状态推导主按钮、Cloud 按钮和忙碌禁用状态", () => {
    const updateItem = buildAppCenterItems({
      installed: [
        buildReadyState({ manifest: buildManifest({ version: "0.2.0" }) }),
      ],
      cloudApps: [buildCloudApp()],
      catalogSource: "remote",
    })[0]!;
    const disabledItem = buildAppCenterItems({
      installed: [buildReadyState({ disabled: true })],
      cloudApps: [],
      catalogSource: "seeded",
    })[0]!;
    const registrationItem = buildAppCenterItems({
      installed: [],
      cloudApps: [
        buildCloudApp({
          appId: "registration-app",
          registrationRequired: true,
          registrationState: "required",
          enabled: false,
          packageUrl: "",
          packageHash: "",
          manifestHash: "",
        }),
      ],
      catalogSource: "remote",
    })[0]!;

    expect(canOneClickUpdate(updateItem)).toBe(true);
    expect(getActionLabelKey(updateItem)).toBe(
      "agentApp.apps.center.action.updateOneClick",
    );
    expect(getCloudActionLabelKey(updateItem)).toBe(
      "agentApp.apps.center.action.update",
    );
    expect(isPrimaryActionDisabled(updateItem, null)).toBe(false);
    expect(isPrimaryActionDisabled(updateItem, "update")).toBe(true);
    expect(isCloudActionDisabled(updateItem, null)).toBe(false);

    expect(getActionLabelKey(disabledItem)).toBe(
      "agentApp.apps.center.action.enable",
    );
    expect(isPrimaryActionDisabled(disabledItem, null)).toBe(false);

    expect(getActionLabelKey(registrationItem)).toBe(
      "agentApp.apps.center.action.activate",
    );
    expect(getCloudActionLabelKey(registrationItem)).toBe(
      "agentApp.apps.center.action.activate",
    );
    expect(isPrimaryActionDisabled(registrationItem, null)).toBe(true);
    expect(isCloudActionDisabled(registrationItem, null)).toBe(true);
  });

  it("Workbench installed app 应把产物 profile 暴露给 App Center item", () => {
    const workbenchInstalled = buildReadyState({
      manifest: buildManifest({
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
      }),
    });
    const item = buildAppCenterItems({
      installed: [workbenchInstalled],
      cloudApps: [],
      catalogSource: "seeded",
    })[0]!;

    expect(item.hostLifecycle?.profiles).toEqual(
      expect.arrayContaining(["workbench"]),
    );
    expect(item.hostLifecycle?.rightSurface.defaultActiveTab).toBe(
      "productProfile",
    );
    expect(item.hostLifecycle?.rightSurface.productProfile.objects).toEqual([
      expect.objectContaining({
        kind: "articleDraft",
        defaultPane: "documentCanvas",
        primary: true,
      }),
    ]);
    expect(buildAppCenterHostLifecycleSummary(item)).toEqual(
      expect.objectContaining({
        status: "needs-setup",
        labelKey: "agentApp.apps.center.host.status.needsSetup",
        productProfileEnabled: true,
        productObjectCount: 1,
        supportedTabCount: 6,
        defaultTab: "productProfile",
      }),
    );
  });

  it("服务端宿主 lifecycle snapshot 应优先于前端本地投影", () => {
    const installed = buildReadyState();
    const item = buildAppCenterItems({
      installed: [installed],
      cloudApps: [],
      catalogSource: "seeded",
      hostLifecycleSnapshots: [
        buildHostLifecycleSnapshot({
          appCenterStatus: "blocked",
          blockers: ["SERVER_HOST_GATE_BLOCKED"],
        }),
      ],
    })[0]!;

    expect(item.hostLifecycle?.appCenterStatus).toBe("blocked");
    expect(item.hostLifecycle?.blockers).toEqual([
      "SERVER_HOST_GATE_BLOCKED",
    ]);
    expect(item.statusKind).toBe("partial");
    expect(isPrimaryActionDisabled(item, null)).toBe(true);
  });

  it("旧 Tauri / iframe-only installed app 应进入宿主下架门禁并禁用主动作", () => {
    const legacyInstalled = buildReadyState({
      manifest: buildManifest({
        name: "legacy-content-factory",
        displayName: "旧内容工厂",
        boundary: {
          legacyRuntime: "requires src-tauri and iframe-only runtime",
        },
      }),
    });
    const item = buildAppCenterItems({
      installed: [legacyInstalled],
      cloudApps: [],
      catalogSource: "seeded",
    })[0]!;

    expect(item.hostLifecycle?.appCenterStatus).toBe("delisted");
    expect(item.statusKind).toBe("partial");
    expect(isPrimaryActionDisabled(item, null)).toBe(true);
  });
});
