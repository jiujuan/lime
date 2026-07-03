import { buildPluginPackageHash } from "../install/packageIdentity";
import type { ShellDescriptor } from "../shell";
import type { PluginPackageDescriptor, PluginPackageTarget } from "./packageTarget";
import { validatePackageTarget } from "./validatePackageTarget";

export function buildPackageDescriptor(params: {
  target: PluginPackageTarget;
  shell: ShellDescriptor;
}): PluginPackageDescriptor {
  const base = {
    descriptorVersion: 1 as const,
    target: params.target,
    shell: params.shell,
    productionReady: false as const,
    warnings: validatePackageTarget(params),
  };
  return {
    ...base,
    descriptorHash: buildPluginPackageHash({
      manifest: base,
      sourceUri: `plugin-package:${params.shell.appId}:${params.target.kind}`,
    }),
  };
}
