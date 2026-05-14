import type { AgentAppHostFlags } from "./types";

export const AGENT_APP_LAB_STORAGE_KEY = "lime.agentAppHost.labEnabled";

export const defaultAgentAppHostFlags: AgentAppHostFlags = {
  labEnabled: false,
  localPackageEnabled: false,
  projectionEnabled: false,
  readinessEnabled: false,
  cleanupDryRunEnabled: false,
  mockSdkEnabled: false,
  localStorageEnabled: false,
  realAdapterEnabled: false,
  uiRuntimeEnabled: false,
  workerRuntimeEnabled: false,
  cloudBootstrapEnabled: false,
};

function readBooleanFlag(value: string | undefined | null): boolean {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function readOptionalBooleanFlag(value: string | undefined | null): boolean | undefined {
  if (value == null || value.trim() === "") {
    return undefined;
  }
  return readBooleanFlag(value);
}

function readLocalStorageFlag(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return readBooleanFlag(window.localStorage.getItem(AGENT_APP_LAB_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function resolveAgentAppHostFlags(
  overrides: Partial<AgentAppHostFlags> = {},
): AgentAppHostFlags {
  const labEnabled =
    overrides.labEnabled ??
    readOptionalBooleanFlag(import.meta.env.VITE_LIME_AGENT_APP_LAB) ??
    readLocalStorageFlag();

  return {
    ...defaultAgentAppHostFlags,
    ...overrides,
    labEnabled,
    localPackageEnabled: overrides.localPackageEnabled ?? labEnabled,
    projectionEnabled: overrides.projectionEnabled ?? labEnabled,
    readinessEnabled: overrides.readinessEnabled ?? labEnabled,
    cleanupDryRunEnabled: overrides.cleanupDryRunEnabled ?? labEnabled,
  };
}

export function isAgentAppLabEnabled(): boolean {
  return resolveAgentAppHostFlags().labEnabled;
}
