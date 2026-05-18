import type { AgentAppPackageTarget, AgentAppPackageTargetKind } from "./packageTarget";
import type { ShellDescriptor } from "../shell";
import { validateMacOsStandaloneIdentity } from "./macosIdentity";

export function validatePackageTarget(params: {
  target: AgentAppPackageTarget;
  shell: ShellDescriptor;
}): Array<{ code: string; message: string }> {
  const warnings: Array<{ code: string; message: string }> = [];
  if (params.target.kind !== (params.shell.installMode as AgentAppPackageTargetKind)) {
    warnings.push({
      code: "TARGET_MODE_MISMATCH",
      message: `Package target ${params.target.kind} does not match shell descriptor ${params.shell.installMode}.`,
    });
  }
  if (params.target.kind === "standalone" && !params.target.platform) {
    warnings.push({
      code: "PLATFORM_NOT_SELECTED",
      message: "Standalone descriptor should select a target platform before production packaging.",
    });
  }
  if (params.target.platform === "macos" && params.target.kind === "standalone") {
    if (!params.target.macosIdentity) {
      warnings.push({
        code: "MACOS_IDENTITY_MISSING",
        message:
          "macOS standalone descriptor should include an independent Bundle ID / App ID identity before production packaging.",
      });
    } else {
      for (const issue of validateMacOsStandaloneIdentity(params.target.macosIdentity, {
        requiresInstallerCertificate: params.target.packageFormat === "pkg",
      })) {
        warnings.push(issue);
      }
    }
  }
  if (params.target.macosIdentity && params.target.platform !== "macos") {
    warnings.push({
      code: "MACOS_IDENTITY_IGNORED",
      message: "macOS identity is only used when target platform is macos.",
    });
  }
  warnings.push({
    code: "NON_PRODUCTION_DESCRIPTOR",
    message: "v2 currently produces deterministic descriptors only; signing and updater are not implemented yet.",
  });
  return warnings;
}
