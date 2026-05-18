import { parse as parseYaml } from "yaml";
import type {
  AgentAppInstallContract,
  AgentAppInstallMode,
  AgentAppInstallPlatform,
  NormalizedAgentAppInstallContract,
} from "../types";

export class AgentAppInstallContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentAppInstallContractError";
  }
}

const INSTALL_MODES: readonly AgentAppInstallMode[] = [
  "in_lime",
  "standalone",
  "runtime_backed",
  "web_host",
] as const;
const INSTALL_PLATFORMS: readonly AgentAppInstallPlatform[] = [
  "macos",
  "windows",
  "linux",
] as const;
const MODE_PRIORITY: readonly AgentAppInstallMode[] = [
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

function assertInstallMode(value: unknown): AgentAppInstallMode {
  if (typeof value !== "string") {
    throw new AgentAppInstallContractError("Agent App install mode must be a string.");
  }
  if (!INSTALL_MODES.includes(value as AgentAppInstallMode)) {
    throw new AgentAppInstallContractError(
      `Unsupported Agent App install mode: ${value}`,
    );
  }
  return value as AgentAppInstallMode;
}

function assertInstallPlatform(value: unknown): AgentAppInstallPlatform | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return INSTALL_PLATFORMS.includes(value as AgentAppInstallPlatform)
    ? (value as AgentAppInstallPlatform)
    : undefined;
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function readModes(value: unknown): AgentAppInstallMode[] {
  if (!Array.isArray(value) || value.length === 0) {
    return ["in_lime"];
  }
  return Array.from(new Set(value.map(assertInstallMode)));
}

function preferredMode(modes: readonly AgentAppInstallMode[]): AgentAppInstallMode {
  return MODE_PRIORITY.find((mode) => modes.includes(mode)) ?? "in_lime";
}

function unwrapInstallInput(input: unknown): Record<string, unknown> | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  const raw = typeof input === "string" ? parseYaml(input) : input;
  if (!isRecord(raw)) {
    throw new AgentAppInstallContractError("Agent App install contract must be an object.");
  }
  const nested = raw.install;
  if (nested === undefined) {
    return raw;
  }
  if (!isRecord(nested)) {
    throw new AgentAppInstallContractError("Agent App install field must be an object.");
  }
  return nested;
}

export function parseInstallContract(input: unknown): AgentAppInstallContract {
  const install = unwrapInstallInput(input);
  if (!install) {
    return { modes: ["in_lime"] };
  }
  const modes = readModes(install.modes);
  return {
    modes,
    runtime: readRecord(install, "runtime") as AgentAppInstallContract["runtime"],
    standalone: readRecord(install, "standalone") as AgentAppInstallContract["standalone"],
    runtimeBacked: readRecord(install, "runtimeBacked") as AgentAppInstallContract["runtimeBacked"],
    branding: readRecord(install, "branding") as AgentAppInstallContract["branding"],
    compatibility: readRecord(install, "compatibility"),
  };
}

export function normalizeInstallContract(params: {
  input?: unknown;
  fallbackName: string;
}): NormalizedAgentAppInstallContract {
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
    .filter((platform): platform is AgentAppInstallPlatform => Boolean(platform)) ?? [];
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

export function listAgentAppInstallModes(): AgentAppInstallMode[] {
  return [...INSTALL_MODES];
}
