import type { AgentRuntimeWebSearchMode } from "@/lib/api/agentRuntime";
import type { ChatToolPreferences } from "./chatToolPreferences";

export const AGENT_FAST_RESPONSE_MODE_STORAGE_KEY =
  "lime:agent-fast-response-mode";

export type AgentFastResponseMode = "auto" | "off";

const FAST_RESPONSE_SERVICE_MODEL_SLOT = "responsive_chat";
const FAST_RESPONSE_ROUTING_SLOT = "responsive_chat_model";

export interface AgentFastResponseRoutingDecision {
  enabled: boolean;
  reason: string;
  searchMode?: AgentRuntimeWebSearchMode;
  label?: string;
  serviceModelSlot?: string;
  routingSlot?: string;
}

export type AgentRuntimeStatusPresentation = "timeline" | "transient";

interface ResolveAgentFastResponseRoutingOptions {
  mode?: AgentFastResponseMode;
  mappedTheme: string;
  isThemeWorkbench: boolean;
  contentId?: string | null;
  messageCount: number;
  sourceText: string;
  imagesCount: number;
  toolPreferences: ChatToolPreferences;
  searchMode?: AgentRuntimeWebSearchMode;
  effectiveWebSearch?: boolean;
  effectiveThinking?: boolean;
  hasExplicitProviderOverride?: boolean;
  hasExplicitModelOverride?: boolean;
  hasServiceModelOverride?: boolean;
  hasCapabilityRoute?: boolean;
  hasSkillRequest?: boolean;
  hasSelectedTeam?: boolean;
  hasMentionedCharacters?: boolean;
  hasContextWorkspace?: boolean;
  hasPurpose?: boolean;
  hasAutoContinue?: boolean;
}

const LIGHTWEIGHT_FIRST_TURN_MAX_CHARS = 800;

function disabled(reason: string): AgentFastResponseRoutingDecision {
  return { enabled: false, reason };
}

function hasValue(value?: string | null): boolean {
  return Boolean(value?.trim());
}

function normalizeMode(mode?: AgentFastResponseMode): AgentFastResponseMode {
  return mode === "off" ? "off" : "auto";
}

function isLightweightFirstTurnText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  if (normalized.length > LIGHTWEIGHT_FIRST_TURN_MAX_CHARS) {
    return false;
  }
  if (normalized.startsWith("@") || normalized.startsWith("/")) {
    return false;
  }
  return !normalized.includes("```");
}

function normalizeSearchMode(
  mode?: AgentRuntimeWebSearchMode | null,
): AgentRuntimeWebSearchMode | null {
  return mode === "disabled" || mode === "allowed" || mode === "required"
    ? mode
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeRuntimeStatusPresentation(
  value: unknown,
): AgentRuntimeStatusPresentation {
  return value === "transient" ? "transient" : "timeline";
}

export function resolveAgentFastResponseSearchMode(params: {
  searchMode?: AgentRuntimeWebSearchMode | null;
  effectiveWebSearch?: boolean;
  toolPreferences: Pick<ChatToolPreferences, "webSearch">;
}): AgentRuntimeWebSearchMode {
  const explicitMode = normalizeSearchMode(params.searchMode);
  if (explicitMode) {
    return explicitMode;
  }

  return params.effectiveWebSearch || params.toolPreferences.webSearch
    ? "allowed"
    : "disabled";
}

function hasHeavyToolPreference(params: {
  searchMode: AgentRuntimeWebSearchMode;
  toolPreferences: ChatToolPreferences;
  effectiveThinking?: boolean;
}): boolean {
  return Boolean(
    params.searchMode === "required" ||
    params.effectiveThinking ||
    params.toolPreferences.thinking ||
    params.toolPreferences.task ||
    params.toolPreferences.subagent,
  );
}

export function resolveAgentFastResponseRouting(
  options: ResolveAgentFastResponseRoutingOptions,
): AgentFastResponseRoutingDecision {
  if (normalizeMode(options.mode) === "off") {
    return disabled("mode-off");
  }

  if (options.mappedTheme !== "general") {
    return disabled("non-general-theme");
  }
  if (options.isThemeWorkbench) {
    return disabled("theme-workbench");
  }
  if (hasValue(options.contentId)) {
    return disabled("content-bound");
  }
  if (options.messageCount > 0) {
    return disabled("not-first-turn");
  }
  if (options.imagesCount > 0) {
    return disabled("image-input");
  }
  if (!isLightweightFirstTurnText(options.sourceText)) {
    return disabled("not-lightweight-text");
  }
  if (
    options.hasExplicitProviderOverride ||
    options.hasExplicitModelOverride ||
    options.hasServiceModelOverride
  ) {
    return disabled("explicit-model-override");
  }
  if (
    options.hasCapabilityRoute ||
    options.hasSkillRequest ||
    options.hasSelectedTeam ||
    options.hasMentionedCharacters ||
    options.hasContextWorkspace ||
    options.hasPurpose ||
    options.hasAutoContinue
  ) {
    return disabled("non-plain-chat");
  }
  const searchMode = resolveAgentFastResponseSearchMode({
    searchMode: options.searchMode,
    effectiveWebSearch: options.effectiveWebSearch,
    toolPreferences: options.toolPreferences,
  });
  if (
    hasHeavyToolPreference({
      searchMode,
      toolPreferences: options.toolPreferences,
      effectiveThinking: options.effectiveThinking,
    })
  ) {
    return disabled("heavy-capability-enabled");
  }

  return {
    enabled: true,
    reason: "first-turn-short-prompt",
    label: "快速响应",
    searchMode,
    serviceModelSlot: FAST_RESPONSE_SERVICE_MODEL_SLOT,
    routingSlot: FAST_RESPONSE_ROUTING_SLOT,
  };
}

export function buildAgentFastResponseMetadata(
  decision: AgentFastResponseRoutingDecision,
): Record<string, unknown> | undefined {
  if (!decision.enabled) {
    return undefined;
  }

  return {
    mode: "auto",
    label: decision.label || "快速响应",
    reason: decision.reason,
    service_model_slot:
      decision.serviceModelSlot || FAST_RESPONSE_SERVICE_MODEL_SLOT,
    routing_slot: decision.routingSlot || FAST_RESPONSE_ROUTING_SLOT,
    routing_changed: false,
    resolver: "backend_service_model",
    runtime_status_presentation: "transient",
  };
}

export function resolveAgentRuntimeStatusPresentation(
  requestMetadata?: Record<string, unknown> | null,
): AgentRuntimeStatusPresentation {
  const metadata = asRecord(requestMetadata);
  if (!metadata) {
    return "timeline";
  }

  const harness = asRecord(metadata.harness) ?? metadata;
  const fastResponseRouting =
    asRecord(harness.fast_response_routing) ??
    asRecord(harness.fastResponseRouting);
  if (!fastResponseRouting) {
    return "timeline";
  }

  return normalizeRuntimeStatusPresentation(
    fastResponseRouting.runtime_status_presentation ??
      fastResponseRouting.runtimeStatusPresentation,
  );
}

export function buildAgentFastResponseSystemPrompt(
  now = new Date(),
  options: {
    searchMode?: AgentRuntimeWebSearchMode;
  } = {},
): string {
  const date = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  const searchRule =
    options.searchMode === "allowed"
      ? "联网搜索只是候选能力；需要实时或外部证据时再用工具，否则直接回答。"
      : "不主动联网、不调用工具、不创建文件；证据不足时用一句话说明必要假设。";

  return `你是 Lime 的快速响应助手。当前日期：${date}。
本回合是轻量首轮普通对话，请直接回答用户。
规则：
- 严格遵守用户要求的字数、格式和语言；如果用户要求只回答一个字，就只输出一个字。
- 不输出思维链、推理过程、标题、前后缀或额外寒暄。
- ${searchRule}`;
}
