import type { AgentAppInstallMode, AgentAppInstallPlatform } from "../types";
import type { ShellDescriptor } from "../shell";
import type { MacOsStandaloneIdentity } from "./macosIdentity";

export type AgentAppPackageTargetKind = Extract<
  AgentAppInstallMode,
  "standalone" | "runtime_backed"
>;

export interface AgentAppPackageTarget {
  kind: AgentAppPackageTargetKind;
  platform?: AgentAppInstallPlatform;
  packageFormat?: "app" | "dmg";
  macosIdentity?: MacOsStandaloneIdentity;
  productionReady: false;
}

export interface AgentAppPackageDescriptor {
  descriptorVersion: 1;
  target: AgentAppPackageTarget;
  shell: ShellDescriptor;
  descriptorHash: string;
  productionReady: false;
  warnings: Array<{ code: string; message: string }>;
}
