import type { PluginProjection, LimeRuntimeProfile } from "../types";
import type { ShellDescriptor } from "./ShellLaunchPort";
import { buildShellDescriptor } from "./buildStandaloneShellDescriptor";

export function buildRuntimeBackedDescriptor(params: {
  projection: PluginProjection;
  runtimeProfile: LimeRuntimeProfile;
}): ShellDescriptor {
  return buildShellDescriptor({ ...params, installMode: "runtime_backed" });
}
