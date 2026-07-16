import type { BrowserTaskRequirement, Message } from "../types";
import type { AgentAccessMode } from "../hooks/agentChatStorage";
import {
  isGeneralWorkbenchSessionMode,
  normalizeHarnessSessionMode,
  type HarnessSessionModeInput,
} from "./harnessSessionMode";
import type { AgentRuntimeWorkspaceSkillBinding } from "@/lib/api/agentRuntime/toolInventoryTypes";
import {
  buildWorkspaceSkillBindingsHarnessMetadata,
  buildWorkspaceSkillRuntimeEnableHarnessMetadata,
  type WorkspaceSkillRuntimeEnableInput,
} from "./workspaceSkillBindingsMetadata";

export interface HarnessOemRoutingRequestMetadata {
  tenant_id: string;
  provider_source?: string;
  provider_key?: string;
  default_model?: string;
  config_mode?: string;
  offer_state?: string;
  quota_status?: string;
  fallback_to_local_allowed?: boolean;
  can_invoke?: boolean;
}

export interface HarnessTenantFeatureFlagsRequestMetadata {
  tenant_id: string;
  source?: string;
  flags: Record<string, boolean>;
}

export interface BuildHarnessRequestMetadataOptions {
  base?: Record<string, unknown>;
  theme: string;
  turnPurpose?: Message["purpose"] | null;
  preferences: {
    task: boolean;
    subagent: boolean;
  };
  accessMode?: AgentAccessMode;
  sessionMode: HarnessSessionModeInput;
  gateKey?: string | null;
  runTitle?: string | null;
  contentId?: string | null;
  browserRequirement?: BrowserTaskRequirement | null;
  browserRequirementReason?: string | null;
  browserLaunchUrl?: string | null;
  browserAssistProfileKey?: string | null;
  browserAssistPreferredBackend?:
    | "current"
    | "lime_extension_bridge"
    | "cdp_direct"
    | null;
  browserAssistAutoLaunch?: boolean | null;
  workspaceSkillBindings?: AgentRuntimeWorkspaceSkillBinding[] | null;
  workspaceSkillRuntimeEnable?: WorkspaceSkillRuntimeEnableInput | null;
  agentResponseLanguage?: string | null;
  oemRouting?: HarnessOemRoutingRequestMetadata | null;
  tenantFeatureFlags?: HarnessTenantFeatureFlagsRequestMetadata | null;
}

export function extractExistingHarnessMetadata(
  requestMetadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const harnessValue = requestMetadata?.harness;
  if (
    typeof harnessValue !== "object" ||
    harnessValue === null ||
    Array.isArray(harnessValue)
  ) {
    return undefined;
  }

  return harnessValue as Record<string, unknown>;
}

function buildBoundThreadGoalMetadata(
  existing: Record<string, unknown> | undefined,
  source: string,
  sessionId: string,
): Record<string, unknown> {
  const existingSet = asRecord(existing?.set) || {};

  return {
    ...(existing || {}),
    enabled: true,
    source,
    status: "active",
    set: {
      ...existingSet,
      threadId: sessionId,
      objective: Object.prototype.hasOwnProperty.call(existingSet, "objective")
        ? existingSet.objective
        : null,
      status: "active",
      tokenBudget: Object.prototype.hasOwnProperty.call(
        existingSet,
        "tokenBudget",
      )
        ? existingSet.tokenBudget
        : null,
    },
  };
}

function readThreadGoalSource(
  threadGoal: Record<string, unknown> | undefined,
  goal: Record<string, unknown> | undefined,
): string {
  const source = threadGoal?.source ?? goal?.source;
  return typeof source === "string" && source.trim()
    ? source.trim()
    : "inputbar";
}

export function bindThreadGoalMetadataToSession(
  requestMetadata: Record<string, unknown> | undefined,
  sessionId?: string | null,
): Record<string, unknown> | undefined {
  const normalizedSessionId = sessionId?.trim();
  if (!requestMetadata || !normalizedSessionId) {
    return requestMetadata;
  }

  const root = { ...requestMetadata };
  const harness = {
    ...(asRecord(root.harness) || {}),
  };
  const existingThreadGoal =
    asRecord(harness.thread_goal) || asRecord(harness.threadGoal);
  const existingGoal = asRecord(harness.goal);
  const hasGoalMetadata =
    harness.goal_mode_enabled === true ||
    harness.goalModeEnabled === true ||
    Boolean(existingThreadGoal) ||
    Boolean(existingGoal);
  if (!hasGoalMetadata) {
    return requestMetadata;
  }

  const source = readThreadGoalSource(existingThreadGoal, existingGoal);
  root.harness = {
    ...harness,
    thread_goal: buildBoundThreadGoalMetadata(
      existingThreadGoal,
      source,
      normalizedSessionId,
    ),
    goal: buildBoundThreadGoalMetadata(
      existingGoal,
      source,
      normalizedSessionId,
    ),
  };

  return root;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

const LEGACY_HARNESS_STATE_KEYS = [
  "creation_mode",
  "creationMode",
  "chat_mode",
  "chatMode",
  "web_search_enabled",
  "webSearchEnabled",
  "thinking_enabled",
  "thinkingEnabled",
  "task_mode_enabled",
  "taskModeEnabled",
  "subagent_mode_enabled",
  "subagentModeEnabled",
  "turn_team_decision",
  "turnTeamDecision",
  "turn_team_reason",
  "turnTeamReason",
  "turn_team_blueprint",
  "turnTeamBlueprint",
  "selected_team_disabled",
  "selectedTeamDisabled",
  "preferred_team_preset_id",
  "preferredTeamPresetId",
  "selected_team_id",
  "selectedTeamId",
  "selected_team_source",
  "selectedTeamSource",
  "selected_team_label",
  "selectedTeamLabel",
  "selected_team_description",
  "selectedTeamDescription",
  "selected_team_summary",
  "selectedTeamSummary",
  "selected_team_roles",
  "selectedTeamRoles",
  "team_memory_shadow",
  "teamMemoryShadow",
] as const;

function clearLegacyHarnessStateFields(
  metadata: Record<string, unknown>,
): void {
  LEGACY_HARNESS_STATE_KEYS.forEach((key) => {
    delete metadata[key];
  });
}

export function buildHarnessRequestMetadata(
  options: BuildHarnessRequestMetadataOptions,
): Record<string, unknown> {
  const {
    base,
    theme,
    turnPurpose,
    preferences,
    accessMode,
    sessionMode,
    gateKey,
    runTitle,
    contentId,
    browserRequirement,
    browserRequirementReason,
    browserLaunchUrl,
    browserAssistProfileKey,
    browserAssistPreferredBackend,
    browserAssistAutoLaunch,
    workspaceSkillBindings,
    workspaceSkillRuntimeEnable,
    agentResponseLanguage,
    oemRouting,
    tenantFeatureFlags,
  } = options;

  const normalizedSessionMode =
    normalizeHarnessSessionMode(sessionMode) || "default";
  const existingBrowserAssist =
    asRecord(base?.browser_assist) || asRecord(base?.browserAssist);
  const browserAssistMetadata = browserAssistProfileKey
    ? {
        ...(existingBrowserAssist || {}),
        enabled: true,
        profile_key: browserAssistProfileKey,
        preferred_backend:
          browserAssistPreferredBackend ??
          readTrimmedString(existingBrowserAssist?.preferred_backend) ??
          readTrimmedString(existingBrowserAssist?.preferredBackend),
        auto_launch:
          browserAssistAutoLaunch ??
          readBoolean(existingBrowserAssist?.auto_launch) ??
          readBoolean(existingBrowserAssist?.autoLaunch) ??
          true,
        stream_mode:
          readTrimmedString(existingBrowserAssist?.stream_mode) ??
          readTrimmedString(existingBrowserAssist?.streamMode) ??
          "both",
      }
    : existingBrowserAssist;
  const workspaceSkillBindingsMetadata =
    buildWorkspaceSkillBindingsHarnessMetadata(workspaceSkillBindings);
  const workspaceSkillRuntimeEnableMetadata =
    buildWorkspaceSkillRuntimeEnableHarnessMetadata(
      workspaceSkillRuntimeEnable,
    );
  const resolvedAgentResponseLanguage =
    readTrimmedString(agentResponseLanguage) ??
    readTrimmedString(base?.agent_response_language) ??
    readTrimmedString(base?.agentResponseLanguage) ??
    readTrimmedString(base?.response_language) ??
    readTrimmedString(base?.responseLanguage);
  const existingPreferences = asRecord(base?.preferences);
  const existingTaskModePreference =
    readBoolean(existingPreferences?.task_mode) ??
    readBoolean(existingPreferences?.taskMode);
  const existingTaskModeEnabled =
    readBoolean(base?.task_mode_enabled) ??
    readBoolean(base?.taskModeEnabled) ??
    existingTaskModePreference;
  const existingGoalPreference =
    readBoolean(existingPreferences?.objective) ??
    readBoolean(existingPreferences?.goal);
  const existingGoalModeEnabled =
    readBoolean(base?.goal_mode_enabled) ??
    readBoolean(base?.goalModeEnabled) ??
    existingGoalPreference;
  const existingGoalMetadata = asRecord(base?.goal);
  const existingThreadGoalMetadata =
    asRecord(base?.thread_goal) ?? asRecord(base?.threadGoal);

  const metadata: Record<string, unknown> = {
    ...(base || {}),
    theme,
    turn_purpose: turnPurpose || undefined,
    preferences: {
      task: preferences.task,
      ...(typeof existingTaskModePreference === "boolean"
        ? { task_mode: preferences.task }
        : {}),
      subagent: preferences.subagent,
      ...(typeof existingGoalPreference === "boolean"
        ? {
            goal: existingGoalPreference,
            objective: existingGoalPreference,
          }
        : {}),
    },
    ...(typeof existingGoalModeEnabled === "boolean"
      ? { goal_mode_enabled: existingGoalModeEnabled }
      : {}),
    ...(existingGoalMetadata ? { goal: existingGoalMetadata } : {}),
    ...(existingThreadGoalMetadata
      ? { thread_goal: existingThreadGoalMetadata }
      : {}),
    ...(accessMode ? { access_mode: accessMode } : {}),
    session_mode: normalizedSessionMode,
    gate_key: isGeneralWorkbenchSessionMode(normalizedSessionMode)
      ? gateKey || undefined
      : undefined,
    run_title: runTitle || undefined,
    content_id: contentId || undefined,
    workspace_skill_bindings:
      workspaceSkillBindingsMetadata?.workspace_skill_bindings ??
      base?.workspace_skill_bindings ??
      base?.workspaceSkillBindings,
    workspace_skill_runtime_enable:
      workspaceSkillRuntimeEnableMetadata?.workspace_skill_runtime_enable ??
      base?.workspace_skill_runtime_enable ??
      base?.workspaceSkillRuntimeEnable,
    agent_response_language: resolvedAgentResponseLanguage,
    oem_routing: oemRouting || undefined,
    tenant_feature_flags: tenantFeatureFlags || undefined,
    browser_requirement: browserRequirement || undefined,
    browser_requirement_reason: browserRequirementReason || undefined,
    browser_launch_url: browserLaunchUrl || undefined,
    browser_user_step_required:
      browserRequirement === "required_with_user_step",
    ...(browserAssistMetadata ? { browser_assist: browserAssistMetadata } : {}),
  };

  clearLegacyHarnessStateFields(metadata);
  if (preferences.task && existingTaskModeEnabled === true) {
    metadata.task_mode_enabled = true;
  }
  return metadata;
}
