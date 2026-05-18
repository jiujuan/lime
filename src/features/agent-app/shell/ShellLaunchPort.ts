import type {
  AgentAppInstallMode,
  LimeRuntimeProfile,
  PackageIdentity,
  ProjectedEntry,
} from "../types";

export interface ShellIsolationPolicy {
  packageMount: "read-only";
  secrets: "refs-only";
  sideEffects: "runtime-broker";
  evidence: "runtime-provenance";
  storageNamespace: string;
}

export interface ShellEntryDescriptor {
  entryKey: string;
  kind: ProjectedEntry["kind"];
  title: string;
  route?: string;
}

export interface ShellDescriptor {
  descriptorVersion: 1;
  appId: string;
  packageHash: string;
  manifestHash: string;
  installMode: AgentAppInstallMode;
  runtimeProfile: Pick<
    LimeRuntimeProfile,
    "runtimeId" | "runtimeVersion" | "shellKind" | "installMode"
  >;
  entry: ShellEntryDescriptor;
  isolation: ShellIsolationPolicy;
  branding: {
    name: string;
    icon?: string;
    windowTitle: string;
  };
  packageIdentity: PackageIdentity;
}

export interface ShellLaunchReadiness {
  status: "ready" | "blocked";
  blockers: Array<{ code: string; message: string }>;
}

export interface ShellLaunchResult {
  status: "launched" | "blocked";
  descriptor: ShellDescriptor;
  blockerCodes: string[];
}

export interface ShellLaunchPort {
  canLaunch(descriptor: ShellDescriptor): Promise<ShellLaunchReadiness>;
  launch(descriptor: ShellDescriptor): Promise<ShellLaunchResult>;
}
