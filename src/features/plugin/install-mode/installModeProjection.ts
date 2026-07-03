import type {
  PluginInstallMode,
  PluginInstallProjection,
  NormalizedPluginInstallContract,
} from "../types";

function runtimeMinVersionForMode(
  install: NormalizedPluginInstallContract,
  mode: PluginInstallMode,
): string | undefined {
  if (mode === "runtime_backed") {
    return install.runtimeBacked?.minVersion ?? install.runtime.runtimeBacked?.minVersion ?? install.runtime.minVersion;
  }
  return install.runtime.minVersion;
}

export function projectInstallContract(
  install: NormalizedPluginInstallContract,
): PluginInstallProjection {
  return {
    supportedModes: [...install.supportedModes],
    preferredMode: install.preferredMode,
    runtimeRequirements: install.supportedModes.map((mode) => ({
      mode,
      minVersion: runtimeMinVersionForMode(install, mode),
      requires:
        mode === "runtime_backed"
          ? install.runtimeBacked?.requires ?? install.runtime.runtimeBacked?.requires
          : undefined,
    })),
    shellRequirements: install.supportedModes
      .filter((mode) => mode === "standalone" || mode === "runtime_backed")
      .map((mode) => ({
        mode,
        shell:
          mode === "standalone"
            ? install.standalone?.shell ?? install.runtime.standalone?.shell
            : undefined,
        bundleId: mode === "standalone" ? install.standalone?.bundleId : undefined,
        platforms: mode === "standalone" ? install.standalone?.platforms : undefined,
      })),
    branding: install.branding,
    warnings: install.supportedModes.includes("web_host")
      ? [
          {
            code: "INSTALL_MODE_RESERVED",
            mode: "web_host",
            message: "web_host is reserved in Lime v2 and is projected as blocked readiness.",
          },
        ]
      : [],
  };
}
