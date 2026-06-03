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
import {
  buildAppCenterFilterCounts,
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
    expect(
      resolveAppIconSrc({
        title: "Cloud",
        cloudApp: buildCloudApp({ iconUrl: "https://lime.local/icon.png" }),
      }),
    ).toBe("https://lime.local/icon.png");
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
});
