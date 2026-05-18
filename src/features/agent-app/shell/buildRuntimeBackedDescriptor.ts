import type { AgentAppProjection, LimeRuntimeProfile } from "../types";
import type { ShellDescriptor } from "./ShellLaunchPort";
import { buildShellDescriptor } from "./buildStandaloneShellDescriptor";

export function buildRuntimeBackedDescriptor(params: {
  projection: AgentAppProjection;
  runtimeProfile: LimeRuntimeProfile;
}): ShellDescriptor {
  return buildShellDescriptor({ ...params, installMode: "runtime_backed" });
}
