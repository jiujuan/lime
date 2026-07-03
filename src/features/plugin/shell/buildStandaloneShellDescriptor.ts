import type {
  PluginInstallMode,
  PluginProjection,
  LimeRuntimeProfile,
  ProjectedEntry,
} from "../types";
import type { ShellDescriptor, ShellEntryDescriptor } from "./ShellLaunchPort";
import { buildShellIsolationPolicy } from "./shellIsolationPolicy";

function pickEntry(projection: PluginProjection): ProjectedEntry {
  const entry =
    projection.entries.find((item) => item.kind === "page") ?? projection.entries[0];
  if (!entry) {
    throw new Error("Plugin shell descriptor requires at least one entry.");
  }
  return entry;
}

function toShellEntry(entry: ProjectedEntry): ShellEntryDescriptor {
  return {
    entryKey: entry.key,
    kind: entry.kind,
    title: entry.title,
    route: entry.route,
  };
}

function assertModeSupported(
  projection: PluginProjection,
  runtimeProfile: LimeRuntimeProfile,
  mode: PluginInstallMode,
): void {
  if (!projection.install.supportedModes.includes(mode)) {
    throw new Error(`Plugin does not support install mode: ${mode}`);
  }
  if (runtimeProfile.installMode !== mode) {
    throw new Error(
      `Runtime profile mode ${runtimeProfile.installMode} does not match shell descriptor mode ${mode}.`,
    );
  }
}

export function buildShellDescriptor(params: {
  projection: PluginProjection;
  runtimeProfile: LimeRuntimeProfile;
  installMode: "standalone" | "runtime_backed";
}): ShellDescriptor {
  assertModeSupported(params.projection, params.runtimeProfile, params.installMode);
  const entry = pickEntry(params.projection);
  return {
    descriptorVersion: 1,
    appId: params.projection.app.appId,
    packageHash: params.projection.package.packageHash,
    manifestHash: params.projection.package.manifestHash,
    installMode: params.installMode,
    runtimeProfile: {
      runtimeId: params.runtimeProfile.runtimeId,
      runtimeVersion: params.runtimeProfile.runtimeVersion,
      shellKind: params.runtimeProfile.shellKind,
      installMode: params.runtimeProfile.installMode,
    },
    entry: toShellEntry(entry),
    isolation: buildShellIsolationPolicy(params.projection),
    branding: params.projection.install.branding,
    packageIdentity: params.projection.package,
  };
}

export function buildStandaloneShellDescriptor(params: {
  projection: PluginProjection;
  runtimeProfile: LimeRuntimeProfile;
}): ShellDescriptor {
  return buildShellDescriptor({ ...params, installMode: "standalone" });
}
