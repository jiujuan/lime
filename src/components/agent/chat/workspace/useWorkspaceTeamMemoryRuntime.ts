import { useMemo } from "react";
import { readTeamMemorySnapshot } from "@/lib/teamMemorySync";
import { useSelectedTeamPreference } from "../hooks/useSelectedTeamPreference";
import { useTeamMemoryShadowSync } from "../hooks/useTeamMemoryShadowSync";

type SelectedTeamPreferenceOptions = NonNullable<
  Parameters<typeof useSelectedTeamPreference>[1]
>;
type TeamMemoryShadowSyncOptions = Parameters<
  typeof useTeamMemoryShadowSync
>[0];

interface UseWorkspaceTeamMemoryRuntimeParams {
  activeTheme: string;
  childSubagentSessions: TeamMemoryShadowSyncOptions["childSubagentSessions"];
  runtimeSelection: SelectedTeamPreferenceOptions["runtimeSelection"];
  selectedTeamSessionSync: SelectedTeamPreferenceOptions["sessionSync"];
  sessionId?: string | null;
  subagentParentContext?: TeamMemoryShadowSyncOptions["subagentParentContext"];
  workspaceRoot?: string | null;
}

export function useWorkspaceTeamMemoryRuntime({
  activeTheme,
  childSubagentSessions,
  runtimeSelection,
  selectedTeamSessionSync,
  sessionId,
  subagentParentContext,
  workspaceRoot,
}: UseWorkspaceTeamMemoryRuntimeParams) {
  const persistedTeamMemoryShadowSnapshot = useMemo(() => {
    const repoScope = workspaceRoot?.trim();
    if (!repoScope || typeof localStorage === "undefined") {
      return null;
    }

    return readTeamMemorySnapshot(localStorage, repoScope);
  }, [workspaceRoot]);
  const shouldAllowPersistedTeamFallback =
    !persistedTeamMemoryShadowSnapshot && !runtimeSelection;

  const {
    selectedTeam,
    preferredTeamPresetId,
    selectedTeamLabel,
    selectedTeamSummary,
  } = useSelectedTeamPreference(activeTheme, {
    runtimeSelection,
    shadowSnapshot: persistedTeamMemoryShadowSnapshot,
    sessionSync: selectedTeamSessionSync,
    allowPersistedThemeFallback: shouldAllowPersistedTeamFallback,
  });
  const teamMemoryShadowSnapshot = useTeamMemoryShadowSync({
    repoScope: workspaceRoot || null,
    activeTheme,
    sessionId,
    selectedTeam,
    childSubagentSessions,
    subagentParentContext,
  });
  const resolvedTeamMemoryShadowSnapshot =
    teamMemoryShadowSnapshot ?? persistedTeamMemoryShadowSnapshot;

  return {
    preferredTeamPresetId,
    resolvedTeamMemoryShadowSnapshot,
    selectedTeam,
    selectedTeamLabel,
    selectedTeamSummary,
  };
}
