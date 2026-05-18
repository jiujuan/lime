import type {
  AgentAppInstallMode,
  AgentAppProjection,
  LimeRuntimeProfile,
  ProjectedEntry,
} from "../types";
import type { ShellDescriptor, ShellEntryDescriptor } from "./ShellLaunchPort";
import { buildShellIsolationPolicy } from "./shellIsolationPolicy";

function pickEntry(projection: AgentAppProjection): ProjectedEntry {
  const entry =
    projection.entries.find((item) => item.kind === "page") ?? projection.entries[0];
  if (!entry) {
    throw new Error("Agent App shell descriptor requires at least one entry.");
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
  projection: AgentAppProjection,
  runtimeProfile: LimeRuntimeProfile,
  mode: AgentAppInstallMode,
): void {
  if (!projection.install.supportedModes.includes(mode)) {
    throw new Error(`Agent App does not support install mode: ${mode}`);
  }
  if (runtimeProfile.installMode !== mode) {
    throw new Error(
      `Runtime profile mode ${runtimeProfile.installMode} does not match shell descriptor mode ${mode}.`,
    );
  }
}

export function buildShellDescriptor(params: {
  projection: AgentAppProjection;
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
  projection: AgentAppProjection;
  runtimeProfile: LimeRuntimeProfile;
}): ShellDescriptor {
  return buildShellDescriptor({ ...params, installMode: "standalone" });
}
