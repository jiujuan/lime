import type { AgentAppHostFlags } from "./types";

export const AGENT_APP_LAB_STORAGE_KEY = "lime.agentAppHost.labEnabled";
export const AGENT_APP_HOST_FLAGS_STORAGE_KEY = "lime.agentAppHost.flags";

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

function readOptionalBooleanFlag(
  value: string | undefined | null,
): boolean | undefined {
  if (value == null || value.trim() === "") {
    return undefined;
  }
  return readBooleanFlag(value);
}

function isTestEnvironment(): boolean {
  return Boolean(
    !import.meta.env?.PROD &&
    (import.meta.env?.MODE === "test" || import.meta.env?.VITEST),
  );
}

function readLocalStorageFlag(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return readBooleanFlag(
      window.localStorage.getItem(AGENT_APP_LAB_STORAGE_KEY),
    );
  } catch {
    return false;
  }
}

function readLocalStorageHostFlag(
  key: keyof AgentAppHostFlags,
): boolean | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(AGENT_APP_HOST_FLAGS_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Partial<
      Record<keyof AgentAppHostFlags, unknown>
    >;
    const value = parsed[key];
    return typeof value === "boolean"
      ? value
      : readOptionalBooleanFlag(String(value ?? ""));
  } catch {
    return undefined;
  }
}

export function resolveAgentAppHostFlags(
  overrides: Partial<AgentAppHostFlags> = {},
): AgentAppHostFlags {
  const mockSdkEnabled = isTestEnvironment()
    ? (overrides.mockSdkEnabled ??
      readOptionalBooleanFlag(import.meta.env.VITE_LIME_AGENT_APP_MOCK_SDK) ??
      readLocalStorageHostFlag("mockSdkEnabled") ??
      false)
    : false;
  const realAdapterEnabled =
    overrides.realAdapterEnabled ??
    readOptionalBooleanFlag(import.meta.env.VITE_LIME_AGENT_APP_REAL_ADAPTER) ??
    readLocalStorageHostFlag("realAdapterEnabled") ??
    false;
  const uiRuntimeEnabled =
    overrides.uiRuntimeEnabled ??
    readOptionalBooleanFlag(import.meta.env.VITE_LIME_AGENT_APP_UI_RUNTIME) ??
    readLocalStorageHostFlag("uiRuntimeEnabled") ??
    false;
  const workerRuntimeEnabled =
    overrides.workerRuntimeEnabled ??
    readOptionalBooleanFlag(
      import.meta.env.VITE_LIME_AGENT_APP_WORKFLOW_RUNTIME,
    ) ??
    readLocalStorageHostFlag("workerRuntimeEnabled") ??
    false;
  const cloudBootstrapEnabled =
    overrides.cloudBootstrapEnabled ??
    readOptionalBooleanFlag(
      import.meta.env.VITE_LIME_AGENT_APP_CLOUD_BOOTSTRAP,
    ) ??
    readLocalStorageHostFlag("cloudBootstrapEnabled") ??
    false;
  const explicitLabEnabled =
    overrides.labEnabled ??
    readOptionalBooleanFlag(import.meta.env.VITE_LIME_AGENT_APP_LAB) ??
    readLocalStorageHostFlag("labEnabled") ??
    readLocalStorageFlag();
  const labEnabled =
    explicitLabEnabled ||
    mockSdkEnabled ||
    realAdapterEnabled ||
    uiRuntimeEnabled ||
    workerRuntimeEnabled ||
    cloudBootstrapEnabled;

  return {
    ...defaultAgentAppHostFlags,
    ...overrides,
    labEnabled,
    localPackageEnabled: overrides.localPackageEnabled ?? labEnabled,
    projectionEnabled: overrides.projectionEnabled ?? labEnabled,
    readinessEnabled: overrides.readinessEnabled ?? labEnabled,
    cleanupDryRunEnabled: overrides.cleanupDryRunEnabled ?? labEnabled,
    localStorageEnabled: overrides.localStorageEnabled ?? realAdapterEnabled,
    mockSdkEnabled,
    realAdapterEnabled,
    uiRuntimeEnabled,
    workerRuntimeEnabled,
    cloudBootstrapEnabled,
  };
}

export function isAgentAppLabEnabled(): boolean {
  return resolveAgentAppHostFlags().labEnabled;
}
