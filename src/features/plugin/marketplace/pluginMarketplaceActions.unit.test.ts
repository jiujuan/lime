import { describe, expect, it, vi } from "vitest";

import type {
  CloudBootstrapApp,
  InstalledAgentAppState,
} from "@/features/agent-app/types";
import {
  performPluginMarketplaceAction,
  resolvePluginMarketplaceItemLabel,
  submitPluginMarketplaceRegistrationCode,
  type PluginMarketplaceActionDeps,
} from "./pluginMarketplaceActions";
import type { PluginMarketplaceViewItem } from "./pluginMarketplaceViewModel";

function viewItem(
  overrides: Partial<PluginMarketplaceViewItem> = {},
): PluginMarketplaceViewItem {
  return {
    pluginId: "research-kit@limecloud",
    pluginName: "research-kit",
    marketplaceName: "limecloud",
    displayName: "Research Kit",
    marketplaceItemDisplayName: "Research Kit",
    description: "Research workflow",
    version: "1.2.3",
    categories: ["research"],
    sourceKind: "agent_app_release",
    marketplaceDisplayName: "LimeCloud Marketplace",
    appId: "research-kit",
    package: {
      releaseId: "release-001",
      packageUrl:
        "https://packages.limecloud.example/plugins/research-kit-1.2.3.lpkg",
      packageHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      manifestHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      signatureRef: "signatures/research-kit.sig",
    },
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_USE",
    },
    releaseId: "release-001",
    installed: false,
    enabled: false,
    installable: true,
    activatable: false,
    renderable: false,
    readOnlyHistory: false,
    activationEntries: [],
    skills: [],
    capabilityProfile: {
      sections: [],
      summary: {
        agentCount: 0,
        subagentCount: 0,
        workflowCount: 0,
        toolCount: 0,
        connectorCount: 0,
        hookCount: 0,
        skillCount: 0,
      },
    },
    needsAttention: false,
    blockerCodes: [],
    visibleBlockers: [],
    primaryAction: {
      kind: "install",
      labelKey: "plugin.marketplace.action.install",
      disabled: false,
      blockerCodes: [],
    },
    ...overrides,
  };
}

function installedState(appId = "research-kit"): InstalledAgentAppState {
  return {
    appId,
    identity: {
      sourceKind: "cloud_release",
      sourceUri:
        "https://packages.limecloud.example/plugins/research-kit-1.2.3.lpkg",
      appId,
      appVersion: "1.2.3",
      packageHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      manifestHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      loadedAt: "2026-06-25T00:00:00.000Z",
    },
    manifest: {} as InstalledAgentAppState["manifest"],
    projection: {} as InstalledAgentAppState["projection"],
    readiness: {} as InstalledAgentAppState["readiness"],
    installMode: "in_lime",
    runtimeProfileSummary:
      {} as InstalledAgentAppState["runtimeProfileSummary"],
    setup: {} as InstalledAgentAppState["setup"],
    disabled: false,
    installedAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  } as InstalledAgentAppState;
}

function uninstallPreview() {
  return {
    appId: "research-kit",
    packageHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    mode: "keep-data" as const,
    generatedAt: "2026-06-25T01:02:03.000Z",
    deletedTargetCount: 1,
    retainedTargetCount: 2,
    targets: [],
    warnings: [],
  };
}

function installStateReport(
  state: "installed" | "enabled" | "disabled" | "uninstalled",
) {
  return {
    tenantId: "tenant-0001",
    userId: "user-001",
    pluginName: "research-kit",
    marketplaceName: "limecloud",
    pluginKey: "research-kit@limecloud",
    sourceKind: "agent_app_release" as const,
    sourceRef: "release-001",
    state,
    releaseId: "release-001",
    packageHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    manifestHash:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    reportedAt: "2026-06-25T01:02:03.000Z",
    updatedAt: "2026-06-25T01:02:03.000Z",
  };
}

function runtimeContext() {
  return {
    tenantId: "tenant-0001",
  } as ReturnType<
    NonNullable<PluginMarketplaceActionDeps["resolveRuntimeContext"]>
  >;
}

describe("plugin marketplace actions", () => {
  it("本地安装应先选择目录并调用 current local package install API", async () => {
    const selectLocalDirectory = vi.fn(
      async () => "/Users/coso/Documents/dev/ai/limecloud/content-factory-app",
    );
    const installLocalPackage = vi.fn(async () =>
      installedState("research-kit"),
    );
    const dispatchChanged = vi.fn();

    const result = await performPluginMarketplaceAction(
      viewItem({
        install: {
          local: true,
          cloud: false,
          authentication: "on_use",
        },
      }),
      {
        selectLocalDirectory,
        installLocalPackage,
        dispatchChanged,
      },
    );

    expect(result).toMatchObject({
      status: "performed",
      action: "install",
    });
    expect(selectLocalDirectory).toHaveBeenCalledWith({
      title: "Research Kit",
    });
    expect(installLocalPackage).toHaveBeenCalledWith({
      appDir: "/Users/coso/Documents/dev/ai/limecloud/content-factory-app",
    });
    expect(dispatchChanged).toHaveBeenCalledTimes(1);
  });

  it("本地安装取消选择目录时应保持无操作且不报错", async () => {
    const selectLocalDirectory = vi.fn(async () => null);
    const installLocalPackage = vi.fn();
    const dispatchChanged = vi.fn();

    const result = await performPluginMarketplaceAction(
      viewItem({
        install: {
          local: true,
          cloud: false,
          authentication: "on_use",
        },
      }),
      {
        selectLocalDirectory,
        installLocalPackage,
        dispatchChanged,
      },
    );

    expect(result).toMatchObject({
      status: "noop",
      action: "install",
    });
    expect(installLocalPackage).not.toHaveBeenCalled();
    expect(dispatchChanged).not.toHaveBeenCalled();
  });

  it("安装应复用 current Agent App cloud release install API", async () => {
    const installCloudRelease = vi.fn(async () => installedState());
    const reportInstallState: NonNullable<
      PluginMarketplaceActionDeps["reportInstallState"]
    > = vi.fn(async () => installStateReport("installed"));
    const dispatchChanged = vi.fn();

    const result = await performPluginMarketplaceAction(viewItem(), {
      installCloudRelease,
      reportInstallState,
      resolveRuntimeContext: vi.fn(runtimeContext),
      now: () => "2026-06-25T01:02:03.000Z",
      dispatchChanged,
    });

    expect(result).toMatchObject({
      status: "performed",
      action: "install",
    });
    expect(installCloudRelease).toHaveBeenCalledWith({
      app: expect.objectContaining({
        appId: "research-kit",
        displayName: "Research Kit",
        version: "1.2.3",
        releaseId: "release-001",
        signatureRef: "signatures/research-kit.sig",
        registrationRequired: false,
        registrationState: "not_required",
        enabled: true,
        packageUrl:
          "https://packages.limecloud.example/plugins/research-kit-1.2.3.lpkg",
        packageHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        manifestHash:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        defaultEntries: ["research-kit"],
      } satisfies Partial<CloudBootstrapApp>),
    });
    expect(reportInstallState).toHaveBeenCalledWith(
      "tenant-0001",
      "research-kit",
      {
        state: "installed",
        releaseId: "release-001",
        packageHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        manifestHash:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        reportedAt: "2026-06-25T01:02:03.000Z",
      },
      "limecloud",
    );
    expect(
      result.status === "performed"
        ? result.remoteInstallStateSync?.status
        : undefined,
    ).toBe("synced");
    expect(dispatchChanged).toHaveBeenCalledTimes(1);
  });

  it("安装缺少 package ref 时应 fail closed", async () => {
    const installCloudRelease = vi.fn(async () => installedState());
    const result = await performPluginMarketplaceAction(
      viewItem({
        package: {
          packageHash:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      }),
      { installCloudRelease },
    );

    expect(result).toMatchObject({
      status: "blocked",
      action: "install",
      blockerCodes: expect.arrayContaining([
        "PLUGIN_PACKAGE_URL_MISSING",
        "PLUGIN_MANIFEST_HASH_MISSING",
      ]),
    });
    expect(installCloudRelease).not.toHaveBeenCalled();
  });

  it("安装 ON_INSTALL 授权项时应等待后续注册流接入", async () => {
    const installCloudRelease = vi.fn(async () => installedState());
    const result = await performPluginMarketplaceAction(
      viewItem({
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
      }),
      { installCloudRelease },
    );

    expect(result).toMatchObject({
      status: "blocked",
      blockerCodes: expect.arrayContaining([
        "PLUGIN_MARKETPLACE_AUTH_ON_INSTALL_UNSUPPORTED",
      ]),
    });
    expect(installCloudRelease).not.toHaveBeenCalled();
  });

  it("启用应复用 current Agent App disabled-set API", async () => {
    const setDisabled = vi.fn(async () => ({
      states: [installedState()],
      issues: [],
    }));
    const reportInstallState: NonNullable<
      PluginMarketplaceActionDeps["reportInstallState"]
    > = vi.fn(async () => installStateReport("enabled"));
    const dispatchChanged = vi.fn();

    const result = await performPluginMarketplaceAction(
      viewItem({
        installed: true,
        enabled: false,
        installable: false,
        primaryAction: {
          kind: "enable",
          labelKey: "plugin.marketplace.action.enable",
          disabled: false,
          blockerCodes: [],
        },
      }),
      {
        setDisabled,
        reportInstallState,
        resolveRuntimeContext: vi.fn(runtimeContext),
        now: () => "2026-06-25T01:02:03.000Z",
        dispatchChanged,
      },
    );

    expect(result).toMatchObject({
      status: "performed",
      action: "enable",
    });
    expect(setDisabled).toHaveBeenCalledWith({
      appId: "research-kit",
      disabled: false,
      updatedAt: "2026-06-25T01:02:03.000Z",
    });
    expect(reportInstallState).toHaveBeenCalledWith(
      "tenant-0001",
      "research-kit",
      expect.objectContaining({
        state: "enabled",
        reportedAt: "2026-06-25T01:02:03.000Z",
      }),
      "limecloud",
    );
    expect(dispatchChanged).toHaveBeenCalledTimes(1);
  });

  it("禁用应复用 current Agent App disabled-set API", async () => {
    const setDisabled = vi.fn(async () => ({
      states: [installedState()],
      issues: [],
    }));
    const reportInstallState: NonNullable<
      PluginMarketplaceActionDeps["reportInstallState"]
    > = vi.fn(async () => installStateReport("disabled"));
    const dispatchChanged = vi.fn();

    const result = await performPluginMarketplaceAction(
      viewItem({
        installed: true,
        enabled: true,
        installable: false,
        primaryAction: {
          kind: "open",
          labelKey: "plugin.marketplace.action.open",
          disabled: false,
          blockerCodes: [],
        },
      }),
      {
        setDisabled,
        reportInstallState,
        resolveRuntimeContext: vi.fn(runtimeContext),
        now: () => "2026-06-25T01:02:03.000Z",
        dispatchChanged,
      },
      "disable",
    );

    expect(result).toMatchObject({
      status: "performed",
      action: "disable",
    });
    expect(setDisabled).toHaveBeenCalledWith({
      appId: "research-kit",
      disabled: true,
      updatedAt: "2026-06-25T01:02:03.000Z",
    });
    expect(reportInstallState).toHaveBeenCalledWith(
      "tenant-0001",
      "research-kit",
      expect.objectContaining({
        state: "disabled",
        reportedAt: "2026-06-25T01:02:03.000Z",
      }),
      "limecloud",
    );
    expect(dispatchChanged).toHaveBeenCalledTimes(1);
  });

  it("卸载应先预演再复用 current Agent App keep-data uninstall API", async () => {
    const previewUninstall = vi.fn(async () => uninstallPreview());
    const uninstall = vi.fn(async () => ({
      status: "uninstalled",
      rehearsal: uninstallPreview(),
      list: {
        states: [],
        issues: [],
      },
      removedTargetCount: 1,
      missingTargetCount: 0,
    }));
    const reportInstallState: NonNullable<
      PluginMarketplaceActionDeps["reportInstallState"]
    > = vi.fn(async () => installStateReport("uninstalled"));
    const dispatchChanged = vi.fn();

    const result = await performPluginMarketplaceAction(
      viewItem({
        installed: true,
        enabled: true,
        installable: false,
        primaryAction: {
          kind: "open",
          labelKey: "plugin.marketplace.action.open",
          disabled: false,
          blockerCodes: [],
        },
      }),
      {
        previewUninstall,
        uninstall,
        reportInstallState,
        resolveRuntimeContext: vi.fn(runtimeContext),
        now: () => "2026-06-25T01:02:03.000Z",
        dispatchChanged,
      },
      "uninstall_keep_data",
    );

    expect(result).toMatchObject({
      status: "performed",
      action: "uninstall_keep_data",
      installedList: {
        states: [],
        issues: [],
      },
    });
    expect(previewUninstall).toHaveBeenCalledWith({
      appId: "research-kit",
      mode: "keep-data",
    });
    expect(uninstall).toHaveBeenCalledWith({
      appId: "research-kit",
      mode: "keep-data",
    });
    expect(reportInstallState).toHaveBeenCalledWith(
      "tenant-0001",
      "research-kit",
      expect.objectContaining({
        state: "uninstalled",
        reportedAt: "2026-06-25T01:02:03.000Z",
      }),
      "limecloud",
    );
    expect(dispatchChanged).toHaveBeenCalledTimes(1);
  });

  it("卸载返回 blocked 时应 fail closed 且不广播状态变更", async () => {
    const previewUninstall = vi.fn(async () => uninstallPreview());
    const uninstall = vi.fn(async () => ({
      status: "blocked",
      rehearsal: uninstallPreview(),
      list: {
        states: [installedState()],
        issues: [],
      },
      removedTargetCount: 0,
      missingTargetCount: 0,
      blockerCodes: ["OUT_OF_SCOPE_TARGETS"],
    }));
    const dispatchChanged = vi.fn();

    const result = await performPluginMarketplaceAction(
      viewItem({
        installed: true,
        enabled: true,
        installable: false,
      }),
      {
        previewUninstall,
        uninstall,
        dispatchChanged,
      },
      "uninstall_keep_data",
    );

    expect(result).toMatchObject({
      status: "blocked",
      action: "uninstall_keep_data",
      blockerCodes: ["PLUGIN_UNINSTALL_BLOCKED"],
    });
    expect(dispatchChanged).not.toHaveBeenCalled();
  });

  it("注册授权应复用 current Agent App registration API", async () => {
    const submitRegistrationCode = vi.fn(async () => ({
      payload: {
        schemaVersion: "agent-app-catalog/v1",
        generatedAt: "2026-06-25T01:02:03.000Z",
        apps: [],
      },
      source: "remote" as const,
    }));
    const dispatchChanged = vi.fn();

    await submitPluginMarketplaceRegistrationCode(viewItem(), "  reg-001  ", {
      submitRegistrationCode,
      dispatchChanged,
    });

    expect(submitRegistrationCode).toHaveBeenCalledWith(
      "research-kit",
      "reg-001",
    );
    expect(dispatchChanged).toHaveBeenCalledTimes(1);
  });

  it("原生目录项注册授权应调用 client plugin registration API", async () => {
    const submitPluginRegistrationCode: NonNullable<
      PluginMarketplaceActionDeps["submitPluginRegistrationCode"]
    > = vi.fn(async () => ({
      schemaVersion: "plugin-marketplace/v1",
      tenantId: "tenant-0001",
      generatedAt: "2026-06-25T01:02:03.000Z",
      marketplaceName: "limecloud",
      items: [],
    }));
    const resolveRuntimeContext = vi.fn(
      () =>
        ({
          tenantId: "tenant-0001",
        }) as ReturnType<
          NonNullable<PluginMarketplaceActionDeps["resolveRuntimeContext"]>
        >,
    );
    const dispatchChanged = vi.fn();

    await submitPluginMarketplaceRegistrationCode(
      viewItem({
        sourceKind: "plugin_catalog",
        appId: undefined,
      }),
      "  reg-001  ",
      {
        submitPluginRegistrationCode,
        resolveRuntimeContext,
        dispatchChanged,
      },
    );

    expect(submitPluginRegistrationCode).toHaveBeenCalledWith(
      "tenant-0001",
      "research-kit",
      { code: "reg-001" },
      "limecloud",
    );
    expect(dispatchChanged).toHaveBeenCalledTimes(1);
  });

  it("注册授权缺少 appId 或注册码时应 fail closed", async () => {
    const submitRegistrationCode = vi.fn();

    await expect(
      submitPluginMarketplaceRegistrationCode(
        viewItem({ appId: " " }),
        "reg-001",
        { submitRegistrationCode },
      ),
    ).rejects.toThrow("PLUGIN_APP_ID_MISSING");
    await expect(
      submitPluginMarketplaceRegistrationCode(viewItem(), " ", {
        submitRegistrationCode,
      }),
    ).rejects.toThrow("PLUGIN_REGISTRATION_CODE_MISSING");
    expect(submitRegistrationCode).not.toHaveBeenCalled();
  });

  it("名称为空时应回落到 marketplace 名称、插件名和插件标识", () => {
    expect(
      resolvePluginMarketplaceItemLabel(
        viewItem({
          displayName: " ",
          marketplaceItemDisplayName: "Catalog Name",
        }),
      ),
    ).toBe("Catalog Name");
    expect(
      resolvePluginMarketplaceItemLabel(
        viewItem({
          displayName: " ",
          marketplaceItemDisplayName: " ",
          pluginName: "research-kit",
        }),
      ),
    ).toBe("research-kit");
  });
});
