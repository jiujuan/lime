import type { PluginHostFlags } from "./types";

export const PLUGIN_LAB_STORAGE_KEY = "lime.pluginHost.labEnabled";
export const PLUGIN_HOST_FLAGS_STORAGE_KEY = "lime.pluginHost.flags";

export const defaultPluginHostFlags: PluginHostFlags = {
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
      window.localStorage.getItem(PLUGIN_LAB_STORAGE_KEY),
    );
  } catch {
    return false;
  }
}

function readLocalStorageHostFlag(
  key: keyof PluginHostFlags,
): boolean | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(PLUGIN_HOST_FLAGS_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Partial<
      Record<keyof PluginHostFlags, unknown>
    >;
    const value = parsed[key];
    return typeof value === "boolean"
      ? value
      : readOptionalBooleanFlag(String(value ?? ""));
  } catch {
    return undefined;
  }
}

export function resolvePluginHostFlags(
  overrides: Partial<PluginHostFlags> = {},
): PluginHostFlags {
  const mockSdkEnabled = isTestEnvironment()
    ? (overrides.mockSdkEnabled ??
      readOptionalBooleanFlag(import.meta.env.VITE_LIME_PLUGIN_MOCK_SDK) ??
      readLocalStorageHostFlag("mockSdkEnabled") ??
      false)
    : false;
  const realAdapterEnabled =
    overrides.realAdapterEnabled ??
    readOptionalBooleanFlag(import.meta.env.VITE_LIME_PLUGIN_REAL_ADAPTER) ??
    readLocalStorageHostFlag("realAdapterEnabled") ??
    false;
  const uiRuntimeEnabled =
    overrides.uiRuntimeEnabled ??
    readOptionalBooleanFlag(import.meta.env.VITE_LIME_PLUGIN_UI_RUNTIME) ??
    readLocalStorageHostFlag("uiRuntimeEnabled") ??
    false;
  const workerRuntimeEnabled =
    overrides.workerRuntimeEnabled ??
    readOptionalBooleanFlag(
      import.meta.env.VITE_LIME_PLUGIN_WORKFLOW_RUNTIME,
    ) ??
    readLocalStorageHostFlag("workerRuntimeEnabled") ??
    false;
  const cloudBootstrapEnabled =
    overrides.cloudBootstrapEnabled ??
    readOptionalBooleanFlag(
      import.meta.env.VITE_LIME_PLUGIN_CLOUD_BOOTSTRAP,
    ) ??
    readLocalStorageHostFlag("cloudBootstrapEnabled") ??
    false;
  const explicitLabEnabled =
    overrides.labEnabled ??
    readOptionalBooleanFlag(import.meta.env.VITE_LIME_PLUGIN_LAB) ??
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
    ...defaultPluginHostFlags,
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

export function isPluginLabEnabled(): boolean {
  return resolvePluginHostFlags().labEnabled;
}
