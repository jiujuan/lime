import {
  AGENT_APPS_CHANGED_EVENT,
  installCloudAgentAppRelease,
  installLocalAgentAppPackage,
  previewAgentAppUninstall,
  selectLocalAgentAppDirectory,
  setAgentAppDisabled,
  submitAgentAppRegistrationCode,
  uninstallAgentApp,
  type AgentAppUninstallRehearsalResult,
  type AgentAppUninstallResult,
} from "@/lib/api/agentApps";
import {
  reportClientPluginInstallState,
  submitClientPluginRegistrationCode,
  type OemCloudClientPluginInstallStateReport,
} from "@/lib/api/oemCloudControlPlane";
import { resolveOemCloudRuntimeContext } from "@/lib/api/oemCloudRuntime";
import type {
  CloudBootstrapApp,
  HostCapabilityProfile,
  InstalledAgentAppState,
} from "@/features/agent-app/types";
import type { InstalledAgentAppStateListResult } from "@/features/agent-app/install/installedAppState";
import type {
  PluginMarketplacePrimaryActionKind,
  PluginMarketplaceViewItem,
} from "./pluginMarketplaceViewModel";

export type PluginMarketplaceExecutableActionKind = Extract<
  PluginMarketplacePrimaryActionKind,
  "install" | "enable"
> | "disable" | "uninstall_keep_data";

export type PluginMarketplaceActionBlockerCode =
  | "PLUGIN_MARKETPLACE_ACTION_UNSUPPORTED"
  | "PLUGIN_MARKETPLACE_INSTALL_SOURCE_UNSUPPORTED"
  | "PLUGIN_APP_ID_MISSING"
  | "PLUGIN_PACKAGE_URL_MISSING"
  | "PLUGIN_PACKAGE_HASH_MISSING"
  | "PLUGIN_MANIFEST_HASH_MISSING"
  | "PLUGIN_MARKETPLACE_AUTH_ON_INSTALL_UNSUPPORTED"
  | "PLUGIN_INSTALL_UNAVAILABLE"
  | "PLUGIN_ENABLE_UNAVAILABLE"
  | "PLUGIN_DISABLE_UNAVAILABLE"
  | "PLUGIN_UNINSTALL_UNAVAILABLE"
  | "PLUGIN_UNINSTALL_BLOCKED";

export type PluginMarketplaceRemoteInstallStateSync =
  | {
      status: "synced";
      report: OemCloudClientPluginInstallStateReport;
    }
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "failed";
      message: string;
    };

export type PluginMarketplaceActionResult =
  | {
      status: "performed";
      action: PluginMarketplaceExecutableActionKind;
      item: PluginMarketplaceViewItem;
      installedState?: InstalledAgentAppState;
      installedList?: InstalledAgentAppStateListResult;
      uninstallPreview?: AgentAppUninstallRehearsalResult;
      uninstallResult?: AgentAppUninstallResult;
      remoteInstallStateSync?: PluginMarketplaceRemoteInstallStateSync;
    }
  | {
      status: "noop";
      action: PluginMarketplaceExecutableActionKind;
      item: PluginMarketplaceViewItem;
    }
  | {
      status: "blocked";
      action: PluginMarketplaceExecutableActionKind;
      item: PluginMarketplaceViewItem;
      blockerCodes: PluginMarketplaceActionBlockerCode[];
    };

export interface PluginMarketplaceActionDeps {
  installCloudRelease?: typeof installCloudAgentAppRelease;
  installLocalPackage?: typeof installLocalAgentAppPackage;
  selectLocalDirectory?: typeof selectLocalAgentAppDirectory;
  setDisabled?: typeof setAgentAppDisabled;
  previewUninstall?: typeof previewAgentAppUninstall;
  submitRegistrationCode?: typeof submitAgentAppRegistrationCode;
  submitPluginRegistrationCode?: typeof submitClientPluginRegistrationCode;
  reportInstallState?: typeof reportClientPluginInstallState;
  uninstall?: typeof uninstallAgentApp;
  resolveRuntimeContext?: typeof resolveOemCloudRuntimeContext;
  profile?: HostCapabilityProfile;
  now?: () => string;
  dispatchChanged?: () => void;
}

export async function submitPluginMarketplaceRegistrationCode(
  item: PluginMarketplaceViewItem,
  code: string,
  deps: PluginMarketplaceActionDeps = {},
): Promise<void> {
  const registrationCode = code.trim();
  if (!registrationCode) {
    throw new Error("PLUGIN_REGISTRATION_CODE_MISSING");
  }

  if (item.sourceKind === "plugin_catalog") {
    const pluginName = item.pluginName.trim();
    if (!pluginName) {
      throw new Error("PLUGIN_NAME_MISSING");
    }
    const runtime = (
      deps.resolveRuntimeContext ?? resolveOemCloudRuntimeContext
    )();
    const tenantId = runtime?.tenantId?.trim();
    if (!tenantId) {
      throw new Error("PLUGIN_MARKETPLACE_CLOUD_SESSION_REQUIRED");
    }
    await (
      deps.submitPluginRegistrationCode ?? submitClientPluginRegistrationCode
    )(tenantId, pluginName, { code: registrationCode }, item.marketplaceName);
    (deps.dispatchChanged ?? defaultDispatchChanged)();
    return;
  }

  const appId = item.appId?.trim();
  if (!appId) {
    throw new Error("PLUGIN_APP_ID_MISSING");
  }
  await (deps.submitRegistrationCode ?? submitAgentAppRegistrationCode)(
    appId,
    registrationCode,
  );
  (deps.dispatchChanged ?? defaultDispatchChanged)();
}

export function resolvePluginMarketplaceItemLabel(
  item: PluginMarketplaceViewItem,
): string {
  return (
    [
      item.displayName,
      item.marketplaceItemDisplayName,
      item.pluginName,
      item.pluginId,
    ]
      .map((value) => value.trim())
      .find(Boolean) ?? item.pluginId
  );
}

function defaultDispatchChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AGENT_APPS_CHANGED_EVENT));
  }
}

function buildMarketplaceCloudApp(item: PluginMarketplaceViewItem): {
  app?: CloudBootstrapApp;
  blockerCodes: PluginMarketplaceActionBlockerCode[];
} {
  const blockerCodes: PluginMarketplaceActionBlockerCode[] = [];
  const appId = item.appId?.trim() || item.pluginName.trim();
  const packageUrl = item.package?.packageUrl?.trim();
  const packageHash = item.package?.packageHash?.trim();
  const manifestHash = item.package?.manifestHash?.trim();

  if (
    item.sourceKind !== "agent_app_release" &&
    item.sourceKind !== "plugin_catalog"
  ) {
    blockerCodes.push("PLUGIN_MARKETPLACE_INSTALL_SOURCE_UNSUPPORTED");
  }
  if (item.policy.installation === "NOT_AVAILABLE" || !item.installable) {
    blockerCodes.push("PLUGIN_INSTALL_UNAVAILABLE");
  }
  if (item.policy.authentication === "ON_INSTALL") {
    blockerCodes.push("PLUGIN_MARKETPLACE_AUTH_ON_INSTALL_UNSUPPORTED");
  }
  if (!appId) {
    blockerCodes.push("PLUGIN_APP_ID_MISSING");
  }
  if (!packageUrl) {
    blockerCodes.push("PLUGIN_PACKAGE_URL_MISSING");
  }
  if (!packageHash) {
    blockerCodes.push("PLUGIN_PACKAGE_HASH_MISSING");
  }
  if (!manifestHash) {
    blockerCodes.push("PLUGIN_MANIFEST_HASH_MISSING");
  }

  if (
    blockerCodes.length > 0 ||
    !appId ||
    !packageUrl ||
    !packageHash ||
    !manifestHash
  ) {
    return { blockerCodes };
  }

  return {
      app: {
        appId,
        displayName: resolvePluginMarketplaceItemLabel(item),
        version: item.version,
        releaseId: item.releaseId ?? item.package?.releaseId,
      signatureRef: item.package?.signatureRef,
      registrationRequired: false,
      registrationState: "not_required",
      enabled: true,
      packageUrl,
      packageHash,
      manifestHash,
      capabilityRequirements: {},
      defaultEntries: [item.pluginName.trim()].filter(Boolean),
      policyDefaults: {},
      toolAvailability: [],
    },
    blockerCodes,
  };
}

function buildMarketplaceLocalInstallParams(item: PluginMarketplaceViewItem): {
  blockerCodes: PluginMarketplaceActionBlockerCode[];
  title: string;
} {
  const blockerCodes: PluginMarketplaceActionBlockerCode[] = [];
  const title = resolvePluginMarketplaceItemLabel(item);
  if (item.policy.installation === "NOT_AVAILABLE" || !item.installable) {
    blockerCodes.push("PLUGIN_INSTALL_UNAVAILABLE");
  }
  if (!item.appId?.trim()) {
    blockerCodes.push("PLUGIN_APP_ID_MISSING");
  }
  return { blockerCodes, title };
}

function buildEnableBlockers(
  item: PluginMarketplaceViewItem,
): PluginMarketplaceActionBlockerCode[] {
  const blockerCodes: PluginMarketplaceActionBlockerCode[] = [];
  if (!item.appId?.trim()) {
    blockerCodes.push("PLUGIN_APP_ID_MISSING");
  }
  if (!item.installed || item.enabled || item.primaryAction.kind !== "enable") {
    blockerCodes.push("PLUGIN_ENABLE_UNAVAILABLE");
  }
  return blockerCodes;
}

function buildDisableBlockers(
  item: PluginMarketplaceViewItem,
): PluginMarketplaceActionBlockerCode[] {
  const blockerCodes: PluginMarketplaceActionBlockerCode[] = [];
  if (!item.appId?.trim()) {
    blockerCodes.push("PLUGIN_APP_ID_MISSING");
  }
  if (!item.installed || !item.enabled) {
    blockerCodes.push("PLUGIN_DISABLE_UNAVAILABLE");
  }
  return blockerCodes;
}

function buildUninstallBlockers(
  item: PluginMarketplaceViewItem,
): PluginMarketplaceActionBlockerCode[] {
  const blockerCodes: PluginMarketplaceActionBlockerCode[] = [];
  if (!item.appId?.trim()) {
    blockerCodes.push("PLUGIN_APP_ID_MISSING");
  }
  if (!item.installed) {
    blockerCodes.push("PLUGIN_UNINSTALL_UNAVAILABLE");
  }
  return blockerCodes;
}

async function syncRemotePluginInstallState(
  item: PluginMarketplaceViewItem,
  state: "installed" | "enabled" | "disabled" | "uninstalled",
  deps: PluginMarketplaceActionDeps,
): Promise<PluginMarketplaceRemoteInstallStateSync> {
  const runtime = (deps.resolveRuntimeContext ?? resolveOemCloudRuntimeContext)();
  const tenantId = runtime?.tenantId?.trim();
  const pluginName = item.pluginName.trim();
  if (!tenantId || !pluginName) {
    return {
      status: "skipped",
      reason: "PLUGIN_MARKETPLACE_CLOUD_SESSION_REQUIRED",
    };
  }

  try {
    const report = await (
      deps.reportInstallState ?? reportClientPluginInstallState
    )(
      tenantId,
      pluginName,
      {
        state,
        releaseId: item.releaseId ?? item.package?.releaseId,
        packageHash: item.package?.packageHash,
        manifestHash: item.package?.manifestHash,
        reportedAt: (deps.now ?? (() => new Date().toISOString()))(),
      },
      item.marketplaceName,
    );
    return {
      status: "synced",
      report,
    };
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function performPluginMarketplaceAction(
  item: PluginMarketplaceViewItem,
  deps: PluginMarketplaceActionDeps = {},
  requestedAction?: PluginMarketplaceExecutableActionKind,
): Promise<PluginMarketplaceActionResult> {
  const action = requestedAction ?? item.primaryAction.kind;
  if (
    action !== "install" &&
    action !== "enable" &&
    action !== "disable" &&
    action !== "uninstall_keep_data"
  ) {
    return {
      status: "blocked",
      action: "install",
      item,
      blockerCodes: ["PLUGIN_MARKETPLACE_ACTION_UNSUPPORTED"],
    };
  }

  if (action === "install") {
    const supportsLocalInstall = item.install?.local === true;
    const supportsCloudInstall =
      item.sourceKind === "plugin_catalog" ||
      (item.sourceKind === "agent_app_release" && item.install?.cloud !== false);

    if (supportsLocalInstall) {
      const { blockerCodes, title } = buildMarketplaceLocalInstallParams(item);
      if (blockerCodes.length > 0) {
        return { status: "blocked", action, item, blockerCodes };
      }
      const selectLocalDirectory =
        deps.selectLocalDirectory ?? selectLocalAgentAppDirectory;
      const appDir = await selectLocalDirectory({ title });
      if (!appDir) {
        return { status: "noop", action, item };
      }
      const installedState = await (
        deps.installLocalPackage ?? installLocalAgentAppPackage
      )({ appDir, profile: deps.profile });
      const remoteInstallStateSync = await syncRemotePluginInstallState(
        item,
        "installed",
        deps,
      );
      (deps.dispatchChanged ?? defaultDispatchChanged)();
      return {
        status: "performed",
        action,
        item,
        installedState,
        remoteInstallStateSync,
      };
    }

    if (supportsCloudInstall) {
      const { app, blockerCodes } = buildMarketplaceCloudApp(item);
      if (!app || blockerCodes.length > 0) {
        return { status: "blocked", action, item, blockerCodes };
      }
      const installedState = await (
        deps.installCloudRelease ?? installCloudAgentAppRelease
      )({ app, profile: deps.profile });
      const remoteInstallStateSync = await syncRemotePluginInstallState(
        item,
        "installed",
        deps,
      );
      (deps.dispatchChanged ?? defaultDispatchChanged)();
      return {
        status: "performed",
        action,
        item,
        installedState,
        remoteInstallStateSync,
      };
    }

    const { blockerCodes } = buildMarketplaceLocalInstallParams(item);
    return {
      status: "blocked",
      action,
      item,
      blockerCodes: blockerCodes.length > 0 ? blockerCodes : ["PLUGIN_MARKETPLACE_INSTALL_SOURCE_UNSUPPORTED"],
    };
  }

  if (action === "enable" || action === "disable") {
    const blockerCodes =
      action === "enable"
        ? buildEnableBlockers(item)
        : buildDisableBlockers(item);
    const appId = item.appId?.trim();
    if (blockerCodes.length > 0 || !appId) {
      return { status: "blocked", action, item, blockerCodes };
    }
    const installedList = await (deps.setDisabled ?? setAgentAppDisabled)({
      appId,
      disabled: action === "disable",
      updatedAt: (deps.now ?? (() => new Date().toISOString()))(),
    });
    const remoteInstallStateSync = await syncRemotePluginInstallState(
      item,
      action === "disable" ? "disabled" : "enabled",
      deps,
    );
    (deps.dispatchChanged ?? defaultDispatchChanged)();
    return {
      status: "performed",
      action,
      item,
      installedList,
      remoteInstallStateSync,
    };
  }

  const blockerCodes = buildUninstallBlockers(item);
  const appId = item.appId?.trim();
  if (blockerCodes.length > 0 || !appId) {
    return { status: "blocked", action, item, blockerCodes };
  }
  const uninstallPreview = await (
    deps.previewUninstall ?? previewAgentAppUninstall
  )({
    appId,
    mode: "keep-data",
  });
  const uninstallResult = await (deps.uninstall ?? uninstallAgentApp)({
    appId,
    mode: "keep-data",
  });
  if (
    uninstallResult.status === "blocked" ||
    uninstallResult.status === "failed"
  ) {
    return {
      status: "blocked",
      action,
      item,
      blockerCodes: ["PLUGIN_UNINSTALL_BLOCKED"],
    };
  }
  const remoteInstallStateSync = await syncRemotePluginInstallState(
    item,
    "uninstalled",
    deps,
  );
  (deps.dispatchChanged ?? defaultDispatchChanged)();
  return {
    status: "performed",
    action,
    item,
    uninstallPreview,
    uninstallResult,
    installedList: uninstallResult.list,
    remoteInstallStateSync,
  };
}
