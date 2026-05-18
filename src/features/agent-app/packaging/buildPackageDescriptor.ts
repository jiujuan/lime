import { buildAgentAppPackageHash } from "../install/packageIdentity";
import type { ShellDescriptor } from "../shell";
import type { AgentAppPackageDescriptor, AgentAppPackageTarget } from "./packageTarget";
import { validatePackageTarget } from "./validatePackageTarget";

export function buildPackageDescriptor(params: {
  target: AgentAppPackageTarget;
  shell: ShellDescriptor;
}): AgentAppPackageDescriptor {
  const base = {
    descriptorVersion: 1 as const,
    target: params.target,
    shell: params.shell,
    productionReady: false as const,
    warnings: validatePackageTarget(params),
  };
  return {
    ...base,
    descriptorHash: buildAgentAppPackageHash({
      manifest: base,
      sourceUri: `agent-app-package:${params.shell.appId}:${params.target.kind}`,
    }),
  };
}
