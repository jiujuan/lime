import type { AgentRuntimeWebSearchMode } from "@/lib/api/agentRuntime";
import type { ChatToolPreferences } from "./chatToolPreferences";

export const AGENT_FAST_RESPONSE_MODE_STORAGE_KEY =
  "lime:agent-fast-response-mode";

export type AgentFastResponseMode = "auto" | "off";
export type AgentRuntimeStatusPresentation = "timeline" | "transient";
export type AgentFastResponseRoutingReason =
  | "mode-off"
  | "non-general-theme"
  | "theme-workbench"
  | "content-bound"
  | "not-first-turn"
  | "image-input"
  | "not-plain-first-turn-text"
  | "explicit-model-override"
  | "non-plain-chat"
  | "heavy-capability-enabled"
  | "first-turn-plain-text";

export interface AgentFastResponseRoutingProfile {
  id: string;
  label: string;
  metadataMode: AgentFastResponseMode;
  reasoningEffort: string;
  resolver: string;
  routingChanged: boolean;
  routingSlot: string;
  plainFirstTurnMaxChars: number;
  runtimeStatusPresentation: AgentRuntimeStatusPresentation;
  serviceModelSlot: string;
}

const DEFAULT_PLAIN_FIRST_TURN_MAX_CHARS = 800;

export const DEFAULT_AGENT_FAST_RESPONSE_ROUTING_PROFILE: AgentFastResponseRoutingProfile =
  {
    id: "responsive-chat-auto",
    label: "快速响应",
    metadataMode: "auto",
    reasoningEffort: "minimal",
    resolver: "backend_service_model",
    routingChanged: false,
    routingSlot: "responsive_chat_model",
    plainFirstTurnMaxChars: DEFAULT_PLAIN_FIRST_TURN_MAX_CHARS,
    runtimeStatusPresentation: "transient",
    serviceModelSlot: "responsive_chat",
  };

export const FAST_RESPONSE_REASONING_EFFORT =
  DEFAULT_AGENT_FAST_RESPONSE_ROUTING_PROFILE.reasoningEffort;

export interface AgentFastResponseRoutingDecision {
  enabled: boolean;
  reason: AgentFastResponseRoutingReason;
  searchMode?: AgentRuntimeWebSearchMode;
  label?: string;
  profileId?: string;
  reasoningEffort?: string;
  resolver?: string;
  routingChanged?: boolean;
  serviceModelSlot?: string;
  routingSlot?: string;
  runtimeStatusPresentation?: AgentRuntimeStatusPresentation;
}

interface ResolveAgentFastResponseRoutingOptions {
  mode?: AgentFastResponseMode;
  routingProfile?: Partial<AgentFastResponseRoutingProfile>;
  mappedTheme: string;
  isThemeWorkbench: boolean;
  contentId?: string | null;
  messageCount: number;
  sourceText: string;
  imagesCount: number;
  toolPreferences: ChatToolPreferences;
  searchMode?: AgentRuntimeWebSearchMode;
  effectiveWebSearch?: boolean;
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

function disabled(
  reason: AgentFastResponseRoutingReason,
): AgentFastResponseRoutingDecision {
  return { enabled: false, reason };
}

function hasValue(value?: string | null): boolean {
  return Boolean(value?.trim());
}

function normalizeMode(mode?: AgentFastResponseMode): AgentFastResponseMode {
  return mode === "off" ? "off" : "auto";
}

function isPlainFirstTurnTextCandidate(
  text: string,
  maxChars: number,
): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  if (normalized.length > maxChars) {
    return false;
  }
  if (normalized.startsWith("@") || normalized.startsWith("/")) {
    return false;
  }
  if (normalized.includes("```")) {
    return false;
  }
  return true;
}

function normalizeSearchMode(
  mode?: AgentRuntimeWebSearchMode | null,
): AgentRuntimeWebSearchMode | null {
  return mode === "disabled" || mode === "auto" || mode === "required"
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

function normalizePlainFirstTurnMaxChars(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeRoutingProfile(
  profile?: Partial<AgentFastResponseRoutingProfile>,
): AgentFastResponseRoutingProfile {
  const fallback = DEFAULT_AGENT_FAST_RESPONSE_ROUTING_PROFILE;
  return {
    id: normalizeString(profile?.id) ?? fallback.id,
    label: normalizeString(profile?.label) ?? fallback.label,
    metadataMode:
      profile?.metadataMode === "off" ? "off" : fallback.metadataMode,
    reasoningEffort:
      normalizeString(profile?.reasoningEffort) ?? fallback.reasoningEffort,
    resolver: normalizeString(profile?.resolver) ?? fallback.resolver,
    routingChanged:
      typeof profile?.routingChanged === "boolean"
        ? profile.routingChanged
        : fallback.routingChanged,
    routingSlot: normalizeString(profile?.routingSlot) ?? fallback.routingSlot,
    plainFirstTurnMaxChars:
      normalizePlainFirstTurnMaxChars(profile?.plainFirstTurnMaxChars) ??
      fallback.plainFirstTurnMaxChars,
    runtimeStatusPresentation: normalizeRuntimeStatusPresentation(
      profile?.runtimeStatusPresentation ?? fallback.runtimeStatusPresentation,
    ),
    serviceModelSlot:
      normalizeString(profile?.serviceModelSlot) ?? fallback.serviceModelSlot,
  };
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveAgentFastResponseSearchMode(params: {
  searchMode?: AgentRuntimeWebSearchMode | null;
  effectiveWebSearch?: boolean;
}): AgentRuntimeWebSearchMode | null {
  return normalizeSearchMode(params.searchMode);
}

function hasHeavyToolPreference(params: {
  searchMode?: AgentRuntimeWebSearchMode | null;
  toolPreferences: ChatToolPreferences;
}): boolean {
  return Boolean(
    params.searchMode === "required" ||
    params.toolPreferences.task ||
    params.toolPreferences.subagent,
  );
}

export function resolveAgentFastResponseRouting(
  options: ResolveAgentFastResponseRoutingOptions,
): AgentFastResponseRoutingDecision {
  const profile = normalizeRoutingProfile(options.routingProfile);

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
  if (
    !isPlainFirstTurnTextCandidate(
      options.sourceText,
      profile.plainFirstTurnMaxChars,
    )
  ) {
    return disabled("not-plain-first-turn-text");
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
  });
  if (
    hasHeavyToolPreference({
      searchMode,
      toolPreferences: options.toolPreferences,
    })
  ) {
    return disabled("heavy-capability-enabled");
  }

  return {
    enabled: true,
    reason: "first-turn-plain-text",
    label: profile.label,
    profileId: profile.id,
    reasoningEffort: profile.reasoningEffort,
    resolver: profile.resolver,
    routingChanged: profile.routingChanged,
    ...(searchMode ? { searchMode } : {}),
    serviceModelSlot: profile.serviceModelSlot,
    routingSlot: profile.routingSlot,
    runtimeStatusPresentation: profile.runtimeStatusPresentation,
  };
}

export function buildAgentFastResponseMetadata(
  decision: AgentFastResponseRoutingDecision,
): Record<string, unknown> | undefined {
  if (!decision.enabled) {
    return undefined;
  }

  const profile = DEFAULT_AGENT_FAST_RESPONSE_ROUTING_PROFILE;
  return {
    mode: profile.metadataMode,
    label: decision.label || profile.label,
    profile_id: decision.profileId || profile.id,
    profileId: decision.profileId || profile.id,
    reason: decision.reason,
    service_model_slot: decision.serviceModelSlot || profile.serviceModelSlot,
    routing_slot: decision.routingSlot || profile.routingSlot,
    routing_changed: decision.routingChanged ?? profile.routingChanged,
    resolver: decision.resolver || profile.resolver,
    runtime_status_presentation:
      decision.runtimeStatusPresentation || profile.runtimeStatusPresentation,
    model_reasoning_effort: decision.reasoningEffort || profile.reasoningEffort,
    modelReasoningEffort: decision.reasoningEffort || profile.reasoningEffort,
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
