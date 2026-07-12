import type {
  RuntimeProviderConfig,
  RuntimeRequest,
  RuntimeSearchMode,
  RuntimeToolCallStrategy,
} from "./protocol.js";

export type RuntimeRequestInput = {
  providerConfig?: unknown;
  providerPreference?: unknown;
  modelPreference?: unknown;
  reasoningEffort?: unknown;
  thinkingEnabled?: unknown;
  approvalPolicy?: unknown;
  sandboxPolicy?: unknown;
  workspaceId?: unknown;
  workingDir?: unknown;
  workspaceRoot?: unknown;
  projectRoot?: unknown;
  webSearch?: unknown;
  searchMode?: unknown;
  executionStrategy?: unknown;
  autoContinue?: unknown;
  systemPrompt?: unknown;
  metadata?: unknown;
};

/**
 * 将 renderer/host 的兼容输入收敛为 App Server 的 current RuntimeRequest。
 * 文本、附件、session、turn 和 structured output 属于 Turn 顶层，不能写回这里。
 */
export function createRuntimeRequest(
  input: RuntimeRequestInput,
): RuntimeRequest | undefined {
  const request: RuntimeRequest = omitUndefined({
    providerConfig: runtimeProviderConfigFromUnknown(input.providerConfig),
    providerPreference: stringValue(input.providerPreference),
    modelPreference: stringValue(input.modelPreference),
    reasoningEffort: stringValue(input.reasoningEffort),
    thinkingEnabled: booleanValue(input.thinkingEnabled),
    approvalPolicy: stringValue(input.approvalPolicy),
    sandboxPolicy: stringValue(input.sandboxPolicy),
    workspaceId: stringValue(input.workspaceId),
    workingDir: stringValue(input.workingDir),
    workspaceRoot: stringValue(input.workspaceRoot),
    projectRoot: stringValue(input.projectRoot),
    webSearch: booleanValue(input.webSearch),
    searchMode: runtimeSearchModeFromUnknown(input.searchMode),
    executionStrategy: stringValue(input.executionStrategy),
    autoContinue: runtimeAutoContinueEnabled(input.autoContinue),
    systemPrompt: stringValue(input.systemPrompt),
    metadata: input.metadata,
  });

  return Object.keys(request).length > 0 ? request : undefined;
}

export function runtimeProviderConfigFromUnknown(
  value: unknown,
): RuntimeProviderConfig | undefined {
  const config = recordValue(value);
  if (!config) {
    return undefined;
  }

  const normalized: RuntimeProviderConfig = omitUndefined({
    providerId: stringFrom(config, "providerId", "provider_id"),
    providerName: stringFrom(config, "providerName", "provider_name"),
    modelName: stringFrom(config, "modelName", "model_name"),
    apiKey: stringFrom(config, "apiKey", "api_key"),
    baseUrl: stringFrom(config, "baseUrl", "base_url"),
    toolCallStrategy: runtimeToolCallStrategyFromUnknown(
      config.toolCallStrategy ?? config.tool_call_strategy,
    ),
    toolshimModel: stringFrom(config, "toolshimModel", "toolshim_model"),
    modelCapabilities:
      config.modelCapabilities ?? config.model_capabilities ?? undefined,
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function runtimeAutoContinueEnabled(
  value: unknown,
): boolean | undefined {
  const direct = booleanValue(value);
  if (direct !== undefined) {
    return direct;
  }
  const config = recordValue(value);
  return config ? booleanValue(config.enabled) : undefined;
}

function runtimeSearchModeFromUnknown(
  value: unknown,
): RuntimeSearchMode | undefined {
  return value === "disabled" || value === "auto" || value === "required"
    ? value
    : undefined;
}

function runtimeToolCallStrategyFromUnknown(
  value: unknown,
): RuntimeToolCallStrategy | undefined {
  return value === "native" || value === "tool_shim" ? value : undefined;
}

function stringFrom(
  value: Record<string, unknown>,
  camelCase: string,
  snakeCase: string,
): string | undefined {
  return stringValue(value[camelCase] ?? value[snakeCase]);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
