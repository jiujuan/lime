import { useMemo } from "react";
import {
  buildTeamMemoryShadowRequestMetadata,
  type TeamMemorySnapshot,
} from "@/lib/teamMemorySync";
import type { AgentRuntimeWorkspaceSkillBinding } from "@/lib/api/agentRuntime";
import {
  buildHarnessRequestMetadata,
  type BuildHarnessRequestMetadataOptions,
} from "../utils/harnessRequestMetadata";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";
import type { TeamDefinition } from "../utils/teamDefinitions";
import type { WorkspaceSkillRuntimeEnableInput } from "../utils/workspaceSkillBindingsMetadata";

interface WorkspaceHarnessRequestMetadataParams {
  agentResponseLanguage?: string | null;
  browserAssistAutoLaunch?: boolean | null;
  browserAssistPreferredBackend?: BuildHarnessRequestMetadataOptions["browserAssistPreferredBackend"];
  browserAssistProfileKey?: string | null;
  contentId?: string | null;
  currentGateKey?: string | null;
  effectiveChatToolPreferences: Pick<ChatToolPreferences, "task" | "subagent">;
  isThemeWorkbench: boolean;
  mappedTheme: string;
  preferredTeamPresetId?: string | null;
  resolvedTeamMemoryShadowSnapshot?: TeamMemorySnapshot | null;
  selectedTeam?: Pick<
    TeamDefinition,
    "description" | "id" | "roles" | "source"
  > | null;
  selectedTeamLabel?: string | null;
  selectedTeamSummary?: string | null;
  themeWorkbenchActiveQueueTitle?: string | null;
  workspaceSkillBindings?: AgentRuntimeWorkspaceSkillBinding[];
  workspaceSkillRuntimeEnable?: WorkspaceSkillRuntimeEnableInput | null;
}

export function resolveWorkspaceHarnessRequestMetadata({
  agentResponseLanguage,
  browserAssistAutoLaunch,
  browserAssistPreferredBackend,
  browserAssistProfileKey,
  contentId,
  currentGateKey,
  effectiveChatToolPreferences,
  isThemeWorkbench,
  mappedTheme,
  preferredTeamPresetId,
  resolvedTeamMemoryShadowSnapshot,
  selectedTeam,
  selectedTeamLabel,
  selectedTeamSummary,
  themeWorkbenchActiveQueueTitle,
  workspaceSkillBindings,
  workspaceSkillRuntimeEnable,
}: WorkspaceHarnessRequestMetadataParams): Record<string, unknown> {
  return buildHarnessRequestMetadata({
    theme: mappedTheme,
    preferences: {
      task: effectiveChatToolPreferences.task,
      subagent: effectiveChatToolPreferences.subagent,
    },
    sessionMode: isThemeWorkbench ? "general_workbench" : "default",
    gateKey: isThemeWorkbench ? currentGateKey : undefined,
    runTitle: themeWorkbenchActiveQueueTitle?.trim() || undefined,
    contentId: contentId || undefined,
    browserAssistProfileKey,
    browserAssistPreferredBackend,
    browserAssistAutoLaunch,
    preferredTeamPresetId,
    selectedTeamId: selectedTeam?.id,
    selectedTeamSource: selectedTeam?.source,
    selectedTeamLabel,
    selectedTeamDescription: selectedTeam?.description,
    selectedTeamSummary,
    selectedTeamRoles: selectedTeam?.roles,
    teamMemoryShadow: buildTeamMemoryShadowRequestMetadata(
      resolvedTeamMemoryShadowSnapshot,
    ),
    workspaceSkillBindings:
      workspaceSkillBindings && workspaceSkillBindings.length > 0
        ? workspaceSkillBindings
        : undefined,
    workspaceSkillRuntimeEnable,
    agentResponseLanguage,
  });
}

export function useWorkspaceHarnessRequestMetadataRuntime(
  params: WorkspaceHarnessRequestMetadataParams,
): Record<string, unknown> {
  const {
    agentResponseLanguage,
    browserAssistAutoLaunch,
    browserAssistPreferredBackend,
    browserAssistProfileKey,
    contentId,
    currentGateKey,
    effectiveChatToolPreferences,
    isThemeWorkbench,
    mappedTheme,
    preferredTeamPresetId,
    resolvedTeamMemoryShadowSnapshot,
    selectedTeam,
    selectedTeamLabel,
    selectedTeamSummary,
    themeWorkbenchActiveQueueTitle,
    workspaceSkillBindings,
    workspaceSkillRuntimeEnable,
  } = params;
  const taskPreferenceEnabled = effectiveChatToolPreferences.task;
  const subagentPreferenceEnabled = effectiveChatToolPreferences.subagent;

  return useMemo(
    () =>
      resolveWorkspaceHarnessRequestMetadata({
        agentResponseLanguage,
        browserAssistAutoLaunch,
        browserAssistPreferredBackend,
        browserAssistProfileKey,
        contentId,
        currentGateKey,
        effectiveChatToolPreferences: {
          task: taskPreferenceEnabled,
          subagent: subagentPreferenceEnabled,
        },
        isThemeWorkbench,
        mappedTheme,
        preferredTeamPresetId,
        resolvedTeamMemoryShadowSnapshot,
        selectedTeam,
        selectedTeamLabel,
        selectedTeamSummary,
        themeWorkbenchActiveQueueTitle,
        workspaceSkillBindings,
        workspaceSkillRuntimeEnable,
      }),
    [
      agentResponseLanguage,
      browserAssistAutoLaunch,
      browserAssistPreferredBackend,
      browserAssistProfileKey,
      contentId,
      currentGateKey,
      isThemeWorkbench,
      mappedTheme,
      preferredTeamPresetId,
      resolvedTeamMemoryShadowSnapshot,
      selectedTeam,
      selectedTeamLabel,
      selectedTeamSummary,
      subagentPreferenceEnabled,
      taskPreferenceEnabled,
      themeWorkbenchActiveQueueTitle,
      workspaceSkillBindings,
      workspaceSkillRuntimeEnable,
    ],
  );
}
