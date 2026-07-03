import { parse as parseYaml } from "yaml";
import type {
  PluginInstallContract,
  PluginInstallMode,
  PluginInstallPlatform,
  NormalizedPluginInstallContract,
} from "../types";

export class PluginInstallContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginInstallContractError";
  }
}

const INSTALL_MODES: readonly PluginInstallMode[] = [
  "in_lime",
  "standalone",
  "runtime_backed",
  "web_host",
] as const;
const INSTALL_PLATFORMS: readonly PluginInstallPlatform[] = [
  "macos",
  "windows",
  "linux",
] as const;
const MODE_PRIORITY: readonly PluginInstallMode[] = [
  "in_lime",
  "standalone",
  "runtime_backed",
  "web_host",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function assertInstallMode(value: unknown): PluginInstallMode {
  if (typeof value !== "string") {
    throw new PluginInstallContractError("Plugin install mode must be a string.");
  }
  if (!INSTALL_MODES.includes(value as PluginInstallMode)) {
    throw new PluginInstallContractError(
      `Unsupported Plugin install mode: ${value}`,
    );
  }
  return value as PluginInstallMode;
}

function assertInstallPlatform(value: unknown): PluginInstallPlatform | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return INSTALL_PLATFORMS.includes(value as PluginInstallPlatform)
    ? (value as PluginInstallPlatform)
    : undefined;
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function readModes(value: unknown): PluginInstallMode[] {
  if (!Array.isArray(value) || value.length === 0) {
    return ["in_lime"];
  }
  return Array.from(new Set(value.map(assertInstallMode)));
}

function preferredMode(modes: readonly PluginInstallMode[]): PluginInstallMode {
  return MODE_PRIORITY.find((mode) => modes.includes(mode)) ?? "in_lime";
}

function unwrapInstallInput(input: unknown): Record<string, unknown> | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  const raw = typeof input === "string" ? parseYaml(input) : input;
  if (!isRecord(raw)) {
    throw new PluginInstallContractError("Plugin install contract must be an object.");
  }
  const nested = raw.install;
  if (nested === undefined) {
    return raw;
  }
  if (!isRecord(nested)) {
    throw new PluginInstallContractError("Plugin install field must be an object.");
  }
  return nested;
}

export function parseInstallContract(input: unknown): PluginInstallContract {
  const install = unwrapInstallInput(input);
  if (!install) {
    return { modes: ["in_lime"] };
  }
  const modes = readModes(install.modes);
  return {
    modes,
    runtime: readRecord(install, "runtime") as PluginInstallContract["runtime"],
    standalone: readRecord(install, "standalone") as PluginInstallContract["standalone"],
    runtimeBacked: readRecord(install, "runtimeBacked") as PluginInstallContract["runtimeBacked"],
    branding: readRecord(install, "branding") as PluginInstallContract["branding"],
    compatibility: readRecord(install, "compatibility"),
  };
}

export function normalizeInstallContract(params: {
  input?: unknown;
  fallbackName: string;
}): NormalizedPluginInstallContract {
  const contract = parseInstallContract(params.input);
  const modes = readModes(contract.modes);
  const runtime = contract.runtime ?? {};
  const distribution = runtime.distribution ?? {};
  const standaloneDistribution = distribution.standalone ?? {};
  const runtimeBackedDistribution = distribution.runtimeBacked ?? {};
  const standalone = contract.standalone;
  const runtimeBacked = contract.runtimeBacked;
  const platforms = standalone?.platforms
    ?.map(assertInstallPlatform)
    .filter((platform): platform is PluginInstallPlatform => Boolean(platform)) ?? [];
  const brandingName = readString(contract.branding?.name) ?? params.fallbackName;

  return {
    schemaVersion: 1,
    supportedModes: modes,
    preferredMode: preferredMode(modes),
    runtime: {
      minVersion: readString(runtime.minVersion),
      standalone: {
        embedRuntime: readBoolean(standaloneDistribution.embedRuntime, false),
        shell: readString(standaloneDistribution.shell),
      },
      runtimeBacked: {
        requires: readString(runtimeBackedDistribution.requires) ?? "lime-runtime",
        minVersion: readString(runtimeBackedDistribution.minVersion),
      },
    },
    standalone: standalone
      ? {
          shell: readString(standalone.shell),
          bundleId: readString(standalone.bundleId),
          platforms,
          autoUpdate: readBoolean(standalone.autoUpdate, false),
        }
      : undefined,
    runtimeBacked: runtimeBacked
      ? {
          requires: readString(runtimeBacked.requires) ?? "lime-runtime",
          minVersion: readString(runtimeBacked.minVersion),
        }
      : undefined,
    branding: {
      name: brandingName,
      icon: readString(contract.branding?.icon),
      windowTitle: readString(contract.branding?.windowTitle) ?? brandingName,
    },
    compatibility: contract.compatibility ?? {},
  };
}

export function listPluginInstallModes(): PluginInstallMode[] {
  return [...INSTALL_MODES];
}
