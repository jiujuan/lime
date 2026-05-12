import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  TeamWorkspaceRuntimeFormationDisplayState,
  TeamWorkspaceSelectedTeamPlanDisplayState,
} from "../../team-workspace-runtime/formationDisplaySelectors";
import {
  buildTeamWorkspaceFormationCopy,
  buildRuntimeFormationDisplayState,
  buildSelectedTeamPlanDisplayState,
  type TeamWorkspaceFormationTranslate,
} from "../../team-workspace-runtime/formationDisplaySelectors";
import type { TeamWorkspaceRuntimeFormationState } from "../../teamWorkspaceRuntime";
import type { TeamRoleDefinition } from "../../utils/teamDefinitions";

interface UseTeamWorkspaceBoardFormationStateParams {
  selectedTeamLabel?: string | null;
  selectedTeamRoles?: TeamRoleDefinition[] | null;
  selectedTeamSummary?: string | null;
  teamDispatchPreviewState?: TeamWorkspaceRuntimeFormationState | null;
}

interface TeamWorkspaceBoardFormationState {
  hasRuntimeFormation: boolean;
  hasSelectedTeamPlan: boolean;
  plannedRoles: TeamRoleDefinition[];
  runtimeFormationDisplay: TeamWorkspaceRuntimeFormationDisplayState;
  selectedTeamPlanDisplay: TeamWorkspaceSelectedTeamPlanDisplayState;
}

export function useTeamWorkspaceBoardFormationState({
  selectedTeamLabel = null,
  selectedTeamRoles = [],
  selectedTeamSummary = null,
  teamDispatchPreviewState = null,
}: UseTeamWorkspaceBoardFormationStateParams): TeamWorkspaceBoardFormationState {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.resolvedLanguage || i18n.language;
  const translateFormation = useMemo<TeamWorkspaceFormationTranslate>(
    () => (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const formationCopy = useMemo(
    () =>
      buildTeamWorkspaceFormationCopy({
        locale,
        translate: translateFormation,
      }),
    [locale, translateFormation],
  );
  const normalizedSelectedTeamLabel = selectedTeamLabel?.trim() || null;
  const normalizedSelectedTeamSummary = selectedTeamSummary?.trim() || null;
  const plannedRoles = useMemo(
    () => (selectedTeamRoles ?? []).filter((role) => role.label.trim()),
    [selectedTeamRoles],
  );
  const selectedTeamPlanDisplay = useMemo(
    () =>
      buildSelectedTeamPlanDisplayState({
        copy: formationCopy,
        selectedTeamLabel: normalizedSelectedTeamLabel,
        selectedTeamSummary: normalizedSelectedTeamSummary,
        selectedTeamRoles: plannedRoles,
      }),
    [
      formationCopy,
      normalizedSelectedTeamLabel,
      normalizedSelectedTeamSummary,
      plannedRoles,
    ],
  );
  const runtimeFormationDisplay = useMemo(
    () =>
      buildRuntimeFormationDisplayState({
        copy: formationCopy,
        teamDispatchPreviewState,
        fallbackLabel: normalizedSelectedTeamLabel,
        fallbackSummary: normalizedSelectedTeamSummary,
      }),
    [
      formationCopy,
      normalizedSelectedTeamLabel,
      normalizedSelectedTeamSummary,
      teamDispatchPreviewState,
    ],
  );

  return {
    hasRuntimeFormation: runtimeFormationDisplay.hasRuntimeFormation,
    hasSelectedTeamPlan: selectedTeamPlanDisplay.hasSelectedTeamPlan,
    plannedRoles,
    runtimeFormationDisplay,
    selectedTeamPlanDisplay,
  };
}
