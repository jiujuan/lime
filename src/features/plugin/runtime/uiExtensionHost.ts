import type {
  PluginHostFlags,
  PluginUiEntryKind,
  PluginUiMountResult,
  PluginUiSandboxPolicy,
  InstalledAppPreview,
  ProjectedEntry,
} from "../types";
import { PluginCapabilityError } from "../sdk/capabilityErrors";

const SUPPORTED_UI_ENTRY_KINDS = new Set<string>(["page", "panel", "settings"]);

export const pluginUiSandboxPolicy: PluginUiSandboxPolicy = {
  allowScripts: true,
  allowSameOrigin: false,
  allowForms: false,
  allowPopups: false,
  allowDownloads: false,
  allowRawHostApi: false,
  allowNodeApi: false,
  allowNetworkAccess: false,
};

interface UiExtensionHostOptions {
  preview: InstalledAppPreview;
  flags: PluginHostFlags;
  now?: () => string;
}

export class UiExtensionHost {
  private readonly preview: InstalledAppPreview;
  private readonly flags: PluginHostFlags;
  private readonly now: () => string;

  constructor(options: UiExtensionHostOptions) {
    this.preview = options.preview;
    this.flags = options.flags;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  mountEntry(entryKey: string): PluginUiMountResult {
    this.assertUiRuntimeEnabled();
    const entry = this.findEntry(entryKey);
    this.assertUiEntry(entry);
    this.assertUiBundleDeclared(entry);
    this.assertReadinessAllowsMount(entry);

    return {
      appId: this.preview.identity.appId,
      entryKey: entry.key,
      entryKind: entry.kind as PluginUiEntryKind,
      title: entry.title,
      route: entry.route,
      bundlePath: this.preview.projection.runtimePackage.uiPath ?? "",
      mountedAt: this.now(),
      fallback: "lab-projection",
      sandboxPolicy: pluginUiSandboxPolicy,
      sdkBridge: {
        bridgeKind: "injected-sdk",
        appId: this.preview.identity.appId,
        entryKey: entry.key,
        allowedCapabilities: this.preview.readiness.supportedCapabilities
          .filter(
            (support) =>
              support.supported &&
              support.enabled &&
              !this.isCapabilityRuntimeBlocked(support.capability),
          )
          .map((support) => support.capability)
          .sort(),
        blockedCapabilities: this.preview.readiness.supportedCapabilities
          .filter(
            (support) =>
              !support.supported ||
              !support.enabled ||
              this.isCapabilityRuntimeBlocked(support.capability),
          )
          .map((support) => ({
            capability: support.capability,
            reason: this.isCapabilityRuntimeBlocked(support.capability)
              ? "runtime-disabled"
              : support.supported
                ? "disabled"
                : "unsupported",
          }))
          .sort((left, right) => left.capability.localeCompare(right.capability)),
        rawHostApi: false,
        nodeApi: false,
      },
      provenance: entry.provenance,
    };
  }

  private isCapabilityRuntimeBlocked(capability: string): boolean {
    return capability === "lime.workflow" && !this.flags.workerRuntimeEnabled;
  }

  private assertUiRuntimeEnabled(): void {
    if (this.flags.uiRuntimeEnabled) {
      return;
    }
    throw new PluginCapabilityError({
      code: "FEATURE_DISABLED",
      message: "Plugin UI runtime is disabled.",
      appId: this.preview.identity.appId,
    });
  }

  private assertUiEntry(entry: ProjectedEntry): void {
    if (SUPPORTED_UI_ENTRY_KINDS.has(entry.kind)) {
      return;
    }
    throw new PluginCapabilityError({
      code: "UI_ENTRY_UNSUPPORTED",
      message: `Entry ${entry.key} is not a UI extension entry.`,
      appId: this.preview.identity.appId,
      entryKey: entry.key,
    });
  }

  private assertUiBundleDeclared(entry: ProjectedEntry): void {
    if (this.preview.projection.runtimePackage.hasUiBundle) {
      return;
    }
    throw new PluginCapabilityError({
      code: "APP_RUNTIME_UNSUPPORTED",
      message: "Plugin manifest does not declare a UI runtime package.",
      appId: this.preview.identity.appId,
      entryKey: entry.key,
    });
  }

  private assertReadinessAllowsMount(entry: ProjectedEntry): void {
    const entryReadiness = this.preview.readiness.entryReadiness.find(
      (item) => item.entryKey === entry.key,
    );
    if (this.preview.readiness.blockers.length === 0 && entryReadiness?.status !== "blocked") {
      return;
    }
    throw new PluginCapabilityError({
      code: "READINESS_BLOCKED",
      message: `Entry ${entry.key} is blocked by readiness checks.`,
      appId: this.preview.identity.appId,
      entryKey: entry.key,
    });
  }

  private findEntry(entryKey: string): ProjectedEntry {
    const entry = this.preview.projection.entries.find((item) => item.key === entryKey);
    if (entry) {
      return entry;
    }
    throw new PluginCapabilityError({
      code: "ENTRY_NOT_FOUND",
      message: `Plugin entry ${entryKey} was not found.`,
      appId: this.preview.identity.appId,
      entryKey,
    });
  }
}
