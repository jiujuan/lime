import { describe, expect, it } from "vitest";
import { buildAdapterCapabilityProfile } from "../adapters/adapterCapabilityProfile";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { PluginCapabilityError } from "../sdk/capabilityErrors";
import {
  buildContentFactoryUiRuntimeResolvedSetup,
  buildContentFactoryUiRuntimeTestManifest,
} from "../testing/contentFactoryTestManifest";
import { buildUiRuntimeCapabilityProfile } from "./uiRuntimeCapabilityProfile";
import { UiExtensionHost } from "./uiExtensionHost";

function buildPreviewWithUiRuntime() {
  return buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    setup: buildContentFactoryUiRuntimeResolvedSetup(),
    profile: buildUiRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
    }),
    loadedAt: "2026-05-15T00:00:00.000Z",
    checkedAt: "2026-05-15T00:00:00.000Z",
    generatedAt: "2026-05-15T00:00:00.000Z",
  });
}

describe("UiExtensionHost", () => {
  it("关闭 uiRuntimeEnabled 时应拒绝挂载 UI entry", () => {
    const profile = buildAdapterCapabilityProfile({ realAdapterEnabled: true });
    const preview = buildInstalledAppPreview({
      fixture: buildContentFactoryUiRuntimeTestManifest(),
      profile,
    });
    const host = new UiExtensionHost({
      preview,
      flags: {
        ...profile.featureFlags,
        uiRuntimeEnabled: false,
      },
    });

    expect(() => host.mountEntry("dashboard")).toThrow(PluginCapabilityError);
    try {
      host.mountEntry("dashboard");
    } catch (error) {
      expect(error).toMatchObject({ code: "FEATURE_DISABLED" });
    }
  });

  it("开启 UI runtime 后应生成受控 sandbox 和 injected SDK bridge", () => {
    const preview = buildPreviewWithUiRuntime();
    const host = new UiExtensionHost({
      preview,
      flags: buildUiRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }).featureFlags,
      now: () => "2026-05-15T00:00:00.000Z",
    });

    const mounted = host.mountEntry("dashboard");

    expect(mounted).toMatchObject({
      appId: "content-factory-app",
      entryKey: "dashboard",
      entryKind: "page",
      bundlePath: "./dist/ui",
      route: "/dashboard",
      fallback: "lab-projection",
      mountedAt: "2026-05-15T00:00:00.000Z",
    });
    expect(mounted.sandboxPolicy).toMatchObject({
      allowScripts: true,
      allowRawHostApi: false,
      allowNodeApi: false,
      allowNetworkAccess: false,
    });
    expect(mounted.sdkBridge).toMatchObject({
      bridgeKind: "injected-sdk",
      appId: "content-factory-app",
      entryKey: "dashboard",
      rawHostApi: false,
      nodeApi: false,
    });
    expect(mounted.sdkBridge.allowedCapabilities).toEqual(
      expect.arrayContaining(["lime.ui", "lime.storage", "lime.agent"]),
    );
    expect(mounted.sdkBridge.allowedCapabilities).not.toContain("lime.workflow");
    expect(mounted.sdkBridge.blockedCapabilities).toContainEqual({
      capability: "lime.workflow",
      reason: "current-api-required",
    });
  });

  it("非 UI entry 不应被 UI host 挂载", () => {
    const preview = buildPreviewWithUiRuntime();
    const host = new UiExtensionHost({
      preview,
      flags: buildUiRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }).featureFlags,
    });

    expect(() => host.mountEntry("content_scenario_planning")).toThrow(PluginCapabilityError);
    try {
      host.mountEntry("content_scenario_planning");
    } catch (error) {
      expect(error).toMatchObject({ code: "UI_ENTRY_UNSUPPORTED" });
    }
  });
});
