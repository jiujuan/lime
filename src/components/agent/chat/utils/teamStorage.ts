import type {
  WorkspaceAgentCustomTeamSettings,
  WorkspaceSettings,
  WorkspaceTeamSelectionReference,
} from "@/types/workspace";
import type { TeamDefinition } from "./teamDefinitions";
import {
  createTeamDefinitionFromPreset,
  buildTeamSelectionReference,
  normalizeTeamDefinition,
  type TeamSelectionReference,
} from "./teamDefinitions";

const TEAM_SELECTION_STORAGE_KEY_PREFIX = "lime.chat.team_selection.v1";

type TeamSelectionLike = Pick<TeamSelectionReference, "id" | "source">;

interface ResolveSelectedTeamPreferenceOptions {
  theme?: string | null;
  workspaceSettings?: WorkspaceSettings | null;
  allowPersistedThemeFallback?: boolean;
}

type WorkspaceTeamPreferenceState =
  | { kind: "unset" }
  | { kind: "disabled" }
  | { kind: "selected"; selection: TeamSelectionReference };

function normalizeCustomTeamList(
  teams: Array<Partial<TeamDefinition>> | TeamDefinition[],
): TeamDefinition[] {
  const uniqueTeams = new Map<string, TeamDefinition>();

  for (const team of teams) {
    const normalized = normalizeTeamDefinition(team);
    if (!normalized || normalized.source !== "custom") {
      continue;
    }

    const existing = uniqueTeams.get(normalized.id);
    if (!existing || (normalized.updatedAt || 0) >= (existing.updatedAt || 0)) {
      uniqueTeams.set(normalized.id, normalized);
    }
  }

  return Array.from(uniqueTeams.values()).sort(
    (left, right) => (right.updatedAt || 0) - (left.updatedAt || 0),
  );
}

function normalizeThemeScope(theme?: string | null): string {
  const normalized = theme?.trim().toLowerCase();
  return normalized || "general";
}

function getTeamSelectionStorageKey(theme?: string | null): string {
  return `${TEAM_SELECTION_STORAGE_KEY_PREFIX}.${normalizeThemeScope(theme)}`;
}

function normalizeWorkspaceTeamSelectionReference(
  value?: Partial<WorkspaceTeamSelectionReference> | null,
): TeamSelectionReference | null {
  if (
    typeof value?.id !== "string" ||
    !value.id.trim() ||
    (value.source !== "builtin" && value.source !== "custom")
  ) {
    return null;
  }

  return {
    id: value.id.trim(),
    source: value.source,
  };
}

function resolveTeamFromSelection(
  selection?: TeamSelectionReference | null,
  customTeams?: TeamDefinition[],
): TeamDefinition | null {
  if (!selection) {
    return null;
  }

  if (selection.source === "builtin") {
    return createTeamDefinitionFromPreset(selection.id);
  }

  return customTeams?.find((team) => team.id === selection.id) || null;
}

function normalizeWorkspaceCustomTeamList(
  teams?: Array<Partial<WorkspaceAgentCustomTeamSettings>> | null,
): TeamDefinition[] | null {
  if (!Array.isArray(teams)) {
    return null;
  }

  return normalizeCustomTeamList(
    teams.map((team) => ({
      ...team,
      source: "custom" as const,
      roles: Array.isArray(team.roles)
        ? team.roles.map((role) => ({
            ...role,
            skillIds: Array.isArray(role.skillIds) ? [...role.skillIds] : [],
          }))
        : [],
    })),
  );
}

export function persistSelectedTeam(
  team: TeamDefinition | null,
  theme?: string | null,
): void {
  try {
    const key = getTeamSelectionStorageKey(theme);
    const selection = buildTeamSelectionReference(team);
    if (!team || !selection || selection.source !== "builtin") {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(selection));
  } catch {
    // ignore persistence errors
  }
}

export function loadSelectedTeamReference(
  theme?: string | null,
): TeamSelectionReference | null {
  try {
    const raw = localStorage.getItem(getTeamSelectionStorageKey(theme));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<TeamSelectionReference>;
    if (
      typeof parsed?.id !== "string" ||
      !parsed.id.trim() ||
      parsed.source !== "builtin"
    ) {
      return null;
    }
    return {
      id: parsed.id.trim(),
      source: parsed.source,
    };
  } catch {
    return null;
  }
}

export function resolveWorkspaceTeamPreferenceState(
  settings?: WorkspaceSettings | null,
): WorkspaceTeamPreferenceState {
  const agentTeam = settings?.agentTeam;
  if (!agentTeam) {
    return { kind: "unset" };
  }

  if (agentTeam.disabled) {
    return { kind: "disabled" };
  }

  const selection = normalizeWorkspaceTeamSelectionReference(
    agentTeam.selectedTeam,
  );
  return selection ? { kind: "selected", selection } : { kind: "unset" };
}

export function loadCustomTeamsFromWorkspaceSettings(
  settings?: WorkspaceSettings | null,
): TeamDefinition[] | null {
  return normalizeWorkspaceCustomTeamList(settings?.agentTeam?.customTeams);
}

export function loadSelectedTeamReferenceFromWorkspaceSettings(
  settings?: WorkspaceSettings | null,
): TeamSelectionReference | null {
  const state = resolveWorkspaceTeamPreferenceState(settings);
  return state.kind === "selected" ? state.selection : null;
}

export function buildWorkspaceSettingsWithSelectedTeam(
  currentSettings: WorkspaceSettings | null | undefined,
  team: TeamDefinition | null,
): WorkspaceSettings {
  const selection = buildTeamSelectionReference(team);
  if (team?.source === "ephemeral") {
    return {
      ...(currentSettings || {}),
      agentTeam: {
        ...(currentSettings?.agentTeam || {}),
        disabled: false,
        selectedTeam: undefined,
      },
    };
  }

  return {
    ...(currentSettings || {}),
    agentTeam: selection
      ? {
          ...(currentSettings?.agentTeam || {}),
          disabled: false,
          selectedTeam: selection,
        }
      : {
          ...(currentSettings?.agentTeam || {}),
          disabled: true,
        },
  };
}

export function isSameTeamSelectionReference(
  left?: TeamSelectionLike | null,
  right?: TeamSelectionLike | null,
): boolean {
  return (
    (left?.id || "") === (right?.id || "") &&
    (left?.source || "") === (right?.source || "")
  );
}

export function resolvePersistedSelectedTeam(
  theme?: string | null,
): TeamDefinition | null {
  return resolveTeamFromSelection(loadSelectedTeamReference(theme));
}

export function resolveSelectedTeamPreference({
  theme,
  workspaceSettings,
  allowPersistedThemeFallback = true,
}: ResolveSelectedTeamPreferenceOptions): TeamDefinition | null {
  const workspaceState = resolveWorkspaceTeamPreferenceState(workspaceSettings);
  const workspaceCustomTeams =
    loadCustomTeamsFromWorkspaceSettings(workspaceSettings);
  if (workspaceState.kind === "disabled") {
    return null;
  }

  if (workspaceState.kind === "selected") {
    return resolveTeamFromSelection(
      workspaceState.selection,
      workspaceCustomTeams || undefined,
    );
  }

  if (!allowPersistedThemeFallback) {
    return null;
  }

  return resolvePersistedSelectedTeam(theme);
}
