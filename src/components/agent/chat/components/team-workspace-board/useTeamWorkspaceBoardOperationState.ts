import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  TeamWorkspaceControlSummary,
  TeamWorkspaceWaitSummary,
} from "../../teamWorkspaceRuntime";
import { buildTeamWorkspaceSessionControlState } from "../../team-workspace-runtime/sessionStateSelectors";
import {
  buildTeamWorkspaceOperationCopy,
  buildVisibleTeamOperationState,
  type TeamOperationDisplayEntry,
  type TeamWorkspaceOperationTranslate,
} from "../../team-workspace-runtime/teamOperationSelectors";
import type { TeamSessionCard } from "../../utils/teamWorkspaceSessions";

interface UseTeamWorkspaceBoardOperationStateParams {
  currentChildSession?: TeamSessionCard | null;
  currentSessionId?: string | null;
  isChildSession: boolean;
  railSessions: TeamSessionCard[];
  teamControlSummary?: TeamWorkspaceControlSummary | null;
  teamWaitSummary?: TeamWorkspaceWaitSummary | null;
  visibleSessions: TeamSessionCard[];
}

interface TeamWorkspaceBoardOperationState {
  completedTeamSessionIds: string[];
  statusSummary: Record<string, number>;
  teamOperationEntries: TeamOperationDisplayEntry[];
  visibleTeamWaitSummary: TeamWorkspaceWaitSummary | null;
  waitableTeamSessionIds: string[];
}

export function useTeamWorkspaceBoardOperationState({
  currentChildSession = null,
  currentSessionId,
  isChildSession,
  railSessions,
  teamControlSummary = null,
  teamWaitSummary = null,
  visibleSessions,
}: UseTeamWorkspaceBoardOperationStateParams): TeamWorkspaceBoardOperationState {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.resolvedLanguage || i18n.language;
  const translateTeamOperation = useMemo<TeamWorkspaceOperationTranslate>(
    () => (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const operationCopy = useMemo(
    () =>
      buildTeamWorkspaceOperationCopy({
        locale,
        translate: translateTeamOperation,
      }),
    [locale, translateTeamOperation],
  );
  const teamOperationState = useMemo(
    () =>
      buildVisibleTeamOperationState({
        copy: operationCopy,
        railSessions,
        teamWaitSummary,
        teamControlSummary,
      }),
    [operationCopy, railSessions, teamControlSummary, teamWaitSummary],
  );
  const sessionControlState = useMemo(
    () =>
      buildTeamWorkspaceSessionControlState({
        visibleSessions,
        railSessions,
        currentChildSession,
        isChildSession,
        currentSessionId,
      }),
    [
      currentChildSession,
      currentSessionId,
      isChildSession,
      railSessions,
      visibleSessions,
    ],
  );

  return {
    completedTeamSessionIds: sessionControlState.completedSessionIds,
    statusSummary: sessionControlState.statusSummary,
    teamOperationEntries: teamOperationState.entries,
    visibleTeamWaitSummary: teamOperationState.visibleTeamWaitSummary,
    waitableTeamSessionIds: sessionControlState.waitableSessionIds,
  };
}
