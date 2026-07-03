import type { PluginInstallMode, PluginInstallPlatform } from "../types";
import type { ShellDescriptor } from "../shell";
import type { MacOsStandaloneIdentity } from "./macosIdentity";

export type PluginPackageTargetKind = Extract<
  PluginInstallMode,
  "standalone" | "runtime_backed"
>;

export interface PluginPackageTarget {
  kind: PluginPackageTargetKind;
  platform?: PluginInstallPlatform;
  packageFormat?: "app" | "dmg";
  macosIdentity?: MacOsStandaloneIdentity;
  productionReady: false;
}

export interface PluginPackageDescriptor {
  descriptorVersion: 1;
  target: PluginPackageTarget;
  shell: ShellDescriptor;
  descriptorHash: string;
  productionReady: false;
  warnings: Array<{ code: string; message: string }>;
}
