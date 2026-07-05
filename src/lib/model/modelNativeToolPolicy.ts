export const MODEL_SHELL_TOOL_TYPES = [
  "default",
  "local",
  "unified_exec",
  "disabled",
  "shell_command",
] as const;

export type ModelShellToolType = (typeof MODEL_SHELL_TOOL_TYPES)[number];

export const MODEL_APPLY_PATCH_TOOL_TYPES = ["freeform"] as const;

export type ModelApplyPatchToolType =
  (typeof MODEL_APPLY_PATCH_TOOL_TYPES)[number];

export const MODEL_NATIVE_TOOL_SURFACES = [
  "shell_command",
  "unified_exec",
] as const;

export type ModelNativeToolSurface =
  (typeof MODEL_NATIVE_TOOL_SURFACES)[number];

export interface ModelNativeToolPolicyInput {
  shell_type?: unknown;
  shellType?: unknown;
  apply_patch_tool_type?: unknown;
  applyPatchToolType?: unknown;
  experimental_supported_tools?: unknown;
  experimentalSupportedTools?: unknown;
}

export interface ModelNativeToolPolicy {
  shell_type: ModelShellToolType | null;
  shell_tool_enabled: boolean;
  preferred_shell_surface: ModelNativeToolSurface | null;
  apply_patch_tool_type: ModelApplyPatchToolType | null;
  apply_patch_tool_enabled: boolean;
  experimental_supported_tools: string[];
}

const MODEL_SHELL_TOOL_TYPE_SET = new Set<string>(MODEL_SHELL_TOOL_TYPES);
const MODEL_APPLY_PATCH_TOOL_TYPE_SET = new Set<string>(
  MODEL_APPLY_PATCH_TOOL_TYPES,
);

function firstPresent<T>(
  input: ModelNativeToolPolicyInput,
  keys: Array<keyof ModelNativeToolPolicyInput>,
): T | undefined {
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replaceAll("-", "_").toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeModelShellToolType(value: unknown): ModelShellToolType | null {
  const normalized = normalizeToken(value);
  if (!normalized || !MODEL_SHELL_TOOL_TYPE_SET.has(normalized)) {
    return null;
  }
  return normalized as ModelShellToolType;
}

function normalizeApplyPatchToolType(
  value: unknown,
): ModelApplyPatchToolType | null {
  const normalized = normalizeToken(value);
  if (!normalized || !MODEL_APPLY_PATCH_TOOL_TYPE_SET.has(normalized)) {
    return null;
  }
  return normalized as ModelApplyPatchToolType;
}

function preferredShellSurface(
  shellType: ModelShellToolType | null,
): ModelNativeToolSurface | null {
  if (shellType === "unified_exec") {
    return "unified_exec";
  }
  if (
    shellType === "default" ||
    shellType === "local" ||
    shellType === "shell_command"
  ) {
    return "shell_command";
  }
  return null;
}

function normalizeExperimentalTools(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tools = new Set<string>();
  for (const item of value) {
    const normalized = normalizeToken(item);
    if (normalized) {
      tools.add(normalized);
    }
  }
  return [...tools].sort();
}

export function buildModelNativeToolPolicy(
  input: ModelNativeToolPolicyInput | null | undefined,
): ModelNativeToolPolicy {
  const source = input ?? {};
  const shellType = normalizeModelShellToolType(
    firstPresent(source, ["shell_type", "shellType"]),
  );
  const applyPatchToolType = normalizeApplyPatchToolType(
    firstPresent(source, ["apply_patch_tool_type", "applyPatchToolType"]),
  );
  const experimentalTools = normalizeExperimentalTools(
    firstPresent(source, [
      "experimental_supported_tools",
      "experimentalSupportedTools",
    ]),
  );
  const shellSurface = preferredShellSurface(shellType);

  return {
    shell_type: shellType,
    shell_tool_enabled: shellSurface !== null,
    preferred_shell_surface: shellSurface,
    apply_patch_tool_type: applyPatchToolType,
    apply_patch_tool_enabled: applyPatchToolType !== null,
    experimental_supported_tools: experimentalTools,
  };
}
