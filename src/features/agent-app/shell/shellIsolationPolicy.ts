import type { AgentAppProjection } from "../types";
import type { ShellIsolationPolicy } from "./ShellLaunchPort";

export function buildShellIsolationPolicy(
  projection: AgentAppProjection,
): ShellIsolationPolicy {
  return {
    packageMount: "read-only",
    secrets: "refs-only",
    sideEffects: "runtime-broker",
    evidence: "runtime-provenance",
    storageNamespace:
      projection.storage?.namespace ?? projection.package.appId,
  };
}
