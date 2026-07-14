import { useMemo } from "react";
import { readTeamMemorySnapshot } from "@/lib/teamMemorySync";
import { useSelectedTeamPreference } from "../hooks/useSelectedTeamPreference";
import { useTeamMemoryShadowSync } from "../hooks/useTeamMemoryShadowSync";

type SelectedTeamPreferenceOptions = NonNullable<
  Parameters<typeof useSelectedTeamPreference>[1]
>;

interface UseWorkspaceTeamMemoryRuntimeParams {
  activeTheme: string;
  runtimeSelection: SelectedTeamPreferenceOptions["runtimeSelection"];
  selectedTeamSessionSync: SelectedTeamPreferenceOptions["sessionSync"];
  sessionId?: string | null;
  workspaceRoot?: string | null;
}

export function useWorkspaceTeamMemoryRuntime({
  activeTheme,
  runtimeSelection,
  selectedTeamSessionSync,
  sessionId,
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
