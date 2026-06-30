import type {
  PluginRegistryActivationState,
  PluginRegistryCapabilityState,
  PluginRegistryHistoryState,
  PluginRegistryItem,
  PluginRegistryProjectionInput,
  PluginRegistryRendererState,
} from "./types";

function isReadinessBlocked(
  status: PluginRegistryProjectionInput["readinessStatus"],
): boolean {
  return status === "blocked" || status === "needs-setup";
}

function canRestoreHistory(input: PluginRegistryProjectionInput): boolean {
  const { contract } = input;
  return (
    input.hasHistoryWorkspace === true ||
    contract.historyRestore.defaultSurface !== "chat" ||
    contract.historyRestore.fallback === "artifactPreview" ||
    contract.rightSurface.historyRestore.enabled
  );
}

function resolveActivationState(
  input: PluginRegistryProjectionInput,
): PluginRegistryActivationState {
  const installed = input.installed === true;
  const enabled = input.enabled !== false;
  if (!installed) {
    return "blocked";
  }
  if (!enabled) {
    return "disabled";
  }
  if (input.contract.activationEntries.length === 0) {
    return "missing_entry";
  }
  return isReadinessBlocked(input.readinessStatus) ? "blocked" : "activatable";
}

function resolveRendererState(
  input: PluginRegistryProjectionInput,
): PluginRegistryRendererState {
  return input.contract.artifactRenderers.length > 0 &&
    input.contract.rightSurface.articleWorkspace.enabled
    ? "renderable"
    : "missing_renderer";
}

function resolveHistoryState(
  input: PluginRegistryProjectionInput,
  activationState: PluginRegistryActivationState,
): PluginRegistryHistoryState {
  if (activationState === "activatable") {
    return "read_write";
  }
  return input.installed === true && canRestoreHistory(input)
    ? "read_only_history"
    : "unavailable";
}

function capabilityStates(params: {
  installed: boolean;
  installable: boolean;
  activationState: PluginRegistryActivationState;
  rendererState: PluginRegistryRendererState;
  historyState: PluginRegistryHistoryState;
}): PluginRegistryCapabilityState[] {
  const states: PluginRegistryCapabilityState[] = [];
  if (!params.installed && params.installable) {
    states.push("installable");
  }
  if (params.activationState === "activatable") {
    states.push("activatable");
  }
  if (params.rendererState === "renderable") {
    states.push("renderable");
  }
  if (params.historyState === "read_only_history") {
    states.push("read_only_history");
  }
  return states;
}

function blockerCodes(params: {
  baseBlockerCodes?: readonly string[];
  installed: boolean;
  installable: boolean;
  activationState: PluginRegistryActivationState;
  rendererState: PluginRegistryRendererState;
  historyState: PluginRegistryHistoryState;
}): string[] {
  return [
    ...(params.baseBlockerCodes ?? []),
    !params.installed && !params.installable
      ? "PLUGIN_INSTALL_UNAVAILABLE"
      : undefined,
    params.activationState === "disabled" ? "PLUGIN_DISABLED" : undefined,
    params.activationState === "blocked"
      ? "PLUGIN_ACTIVATION_BLOCKED"
      : undefined,
    params.activationState === "missing_entry"
      ? "PLUGIN_ACTIVATION_ENTRY_MISSING"
      : undefined,
    params.rendererState === "missing_renderer"
      ? "PLUGIN_RENDERER_UNAVAILABLE"
      : undefined,
    params.historyState === "unavailable"
      ? "PLUGIN_WORKSPACE_MISSING"
      : undefined,
  ].filter((code): code is string => Boolean(code));
}

export function projectPluginRegistryItem(
  input: PluginRegistryProjectionInput,
): PluginRegistryItem {
  const installed = input.installed === true;
  const installable = input.installable !== false;
  const enabled = input.enabled !== false;
  const activationState = resolveActivationState(input);
  const rendererState = resolveRendererState(input);
  const historyState = resolveHistoryState(input, activationState);

  return {
    pluginId: input.contract.id,
    displayName: input.contract.displayName,
    version: input.contract.version,
    installed,
    enabled,
    capabilityStates: capabilityStates({
      installed,
      installable,
      activationState,
      rendererState,
      historyState,
    }),
    activationState,
    rendererState,
    historyState,
    blockerCodes: blockerCodes({
      baseBlockerCodes: input.blockerCodes,
      installed,
      installable,
      activationState,
      rendererState,
      historyState,
    }),
  };
}

export function projectPluginRegistry(
  inputs: readonly PluginRegistryProjectionInput[],
): PluginRegistryItem[] {
  return inputs
    .map(projectPluginRegistryItem)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}
