import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WorkspaceSettings } from "@/types/workspace";
import { toast } from "sonner";
import {
  BUILTIN_TEAM_PROFILE_OPTIONS,
  BUILTIN_TEAM_SKILL_OPTIONS,
  getBuiltinTeamProfileOption,
  getBuiltinTeamSkillOption,
} from "../../../utils/teamPresets";
import {
  cloneTeamDefinitionAsCustom,
  createTeamDefinitionFromPreset,
  listBuiltinTeamDefinitions,
  normalizeTeamDefinition,
  type TeamDefinition,
  type TeamRoleDefinition,
} from "../../../utils/teamDefinitions";
import { getTeamSuggestion } from "../../../utils/teamSuggestion";
import {
  resolveCustomTeams,
  saveCustomTeams,
} from "../../../utils/teamStorage";
import {
  buildInputbarTeamSelectorCopy,
  type InputbarTeamSelectorCopy,
} from "./inputbarTeamSelectorCopy";

interface TeamSelectorPanelProps {
  activeTheme?: string;
  input?: string;
  selectedTeam?: TeamDefinition | null;
  onSelectTeam: (team: TeamDefinition | null) => void;
  workspaceSettings?: WorkspaceSettings | null;
  onPersistCustomTeams?: (teams: TeamDefinition[]) => void | Promise<void>;
  onClose?: () => void;
}

const TEAM_SELECTOR_PRIMARY_BUTTON_CLASSNAME =
  "border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] text-white shadow-sm shadow-emerald-950/15 hover:opacity-95";

interface TeamDraft {
  id?: string;
  label: string;
  description: string;
  theme?: string;
  presetId?: string;
  roles: TeamRoleDefinition[];
}

function createBlankDraft(
  copy: InputbarTeamSelectorCopy,
  theme?: string,
): TeamDraft {
  return {
    label: "",
    description: "",
    theme,
    presetId: undefined,
    roles: [
      {
        id: "planner",
        label: copy.defaultRole.plannerLabel,
        summary: copy.defaultRole.plannerSummary,
      },
      {
        id: "executor",
        label: copy.defaultRole.executorLabel,
        summary: copy.defaultRole.executorSummary,
      },
    ],
  };
}

function formatTeamDefinitionSummary(
  team: TeamDefinition | null | undefined,
  copy: InputbarTeamSelectorCopy,
): string {
  if (!team) {
    return "";
  }

  const roleSummary = team.roles
    .map((role) => `${role.label}: ${role.summary}`)
    .join(copy.summary.roleSeparator);
  const description = team.description.trim();

  if (description && roleSummary) {
    return `${description} ${copy.summary.rolesPrefix}${roleSummary}`;
  }
  return description || roleSummary;
}

function buildDraftFromTeam(team: TeamDefinition): TeamDraft {
  return {
    id: team.source === "custom" ? team.id : undefined,
    label: team.label,
    description: team.description,
    theme: team.theme,
    presetId: team.presetId,
    roles: team.roles.map((role, index) => ({
      id: role.id || `role-${index + 1}`,
      label: role.label,
      summary: role.summary,
      profileId: role.profileId,
      roleKey: role.roleKey,
      skillIds: role.skillIds ? [...role.skillIds] : [],
    })),
  };
}

function matchTeamQuery(team: TeamDefinition, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    team.label.toLowerCase().includes(normalizedQuery) ||
    team.description.toLowerCase().includes(normalizedQuery) ||
    team.roles.some(
      (role) =>
        role.label.toLowerCase().includes(normalizedQuery) ||
        role.summary.toLowerCase().includes(normalizedQuery),
    )
  );
}

function parseSkillIdsInput(value: string): string[] {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function TeamCard({
  team,
  selected,
  expanded,
  selectedLabel,
  badgeLabel,
  onSelect,
  onToggleDetail,
  onCopy,
  onEdit,
  onDelete,
  copy,
}: {
  team: TeamDefinition;
  selected: boolean;
  expanded?: boolean;
  selectedLabel?: string;
  badgeLabel?: string;
  onSelect: () => void;
  onToggleDetail?: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  copy: InputbarTeamSelectorCopy;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-3 shadow-sm shadow-slate-950/5 transition-colors",
        selected
          ? "border-sky-300 bg-sky-50/60"
          : "border-slate-200/80 hover:border-slate-300",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
          data-testid={`team-selector-option-${team.id}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">
              {team.label}
            </span>
            {badgeLabel ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                {badgeLabel}
              </span>
            ) : null}
            {selected ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[11px] font-medium text-sky-700">
                <Check className="h-3.5 w-3.5" />
                {selectedLabel || copy.card.selected}
              </span>
            ) : null}
          </div>
          <div className="mt-1 break-words whitespace-normal text-xs leading-5 text-slate-600">
            {team.description}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {team.roles.map((role) => (
              <span
                key={`${team.id}-${role.id}`}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500"
              >
                {role.label}
              </span>
            ))}
          </div>
          {expanded ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5 text-slate-600">
              <div className="font-medium text-slate-800">
                {copy.card.detailTitle}
              </div>
              <div className="mt-1 break-words whitespace-normal">
                {formatTeamDefinitionSummary(team, copy)}
              </div>
              <div className="mt-2 space-y-1.5">
                {team.roles.map((role) => (
                  <div key={`${team.id}-detail-${role.id}`}>
                    <span className="font-medium text-slate-800">
                      {role.label}
                    </span>
                    <span> · {role.summary}</span>
                    {role.profileId || role.roleKey || role.skillIds?.length ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {role.profileId ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                            {copy.card.profilePrefix} ·{" "}
                            {getBuiltinTeamProfileOption(role.profileId)
                              ?.label || role.profileId}
                          </span>
                        ) : null}
                        {role.roleKey ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                            Role · {role.roleKey}
                          </span>
                        ) : null}
                        {role.skillIds?.map((skillId) => (
                          <span
                            key={`${team.id}-${role.id}-${skillId}`}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500"
                          >
                            {copy.card.skillPrefix} ·{" "}
                            {getBuiltinTeamSkillOption(skillId)?.label ||
                              skillId}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {onToggleDetail ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={onToggleDetail}
              title={expanded ? copy.card.collapseDetail : copy.card.viewDetail}
              aria-label={
                expanded ? copy.card.collapseDetail : copy.card.viewDetail
              }
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          ) : null}
          {onCopy ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={onCopy}
              title={copy.card.copyCustom}
              aria-label={copy.card.copyCustom}
            >
              <Copy className="h-4 w-4" />
            </button>
          ) : null}
          {onEdit ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={onEdit}
              title={copy.card.edit}
              aria-label={copy.card.edit}
            >
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              onClick={onDelete}
              title={copy.card.delete}
              aria-label={copy.card.delete}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const TeamSelectorPanel: React.FC<TeamSelectorPanelProps> = ({
  activeTheme,
  input,
  selectedTeam = null,
  onSelectTeam,
  workspaceSettings,
  onPersistCustomTeams,
  onClose,
}) => {
  const { t } = useTranslation("agent");
  const copy = useMemo(
    () => buildInputbarTeamSelectorCopy((key, values) => t(key, values ?? {})),
    [t],
  );
  const [query, setQuery] = useState("");
  const [customTeams, setCustomTeams] = useState<TeamDefinition[]>([]);
  const [draft, setDraft] = useState<TeamDraft | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const isProjectScopedCustomTeam = Boolean(
    workspaceSettings && onPersistCustomTeams,
  );

  useEffect(() => {
    setCustomTeams(resolveCustomTeams(workspaceSettings));
  }, [workspaceSettings]);

  const suggestion = useMemo(
    () =>
      getTeamSuggestion({
        input: input || "",
        activeTheme,
        subagentEnabled: false,
      }),
    [activeTheme, input],
  );

  const recommendedTeam = useMemo(
    () =>
      suggestion.shouldSuggest && suggestion.suggestedPresetId
        ? createTeamDefinitionFromPreset(suggestion.suggestedPresetId)
        : null,
    [suggestion.shouldSuggest, suggestion.suggestedPresetId],
  );

  const builtinTeams = useMemo(
    () =>
      listBuiltinTeamDefinitions().filter((team) =>
        matchTeamQuery(team, query),
      ),
    [query],
  );

  const filteredCustomTeams = useMemo(
    () => customTeams.filter((team) => matchTeamQuery(team, query)),
    [customTeams, query],
  );

  const currentSelectionSummary = formatTeamDefinitionSummary(
    selectedTeam,
    copy,
  );

  const updateDraftRole = (
    roleIndex: number,
    updater: (role: TeamRoleDefinition) => TeamRoleDefinition,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            roles: current.roles.map((item, index) =>
              index === roleIndex ? updater(item) : item,
            ),
          }
        : current,
    );
  };

  const toggleDraftRoleSkill = (roleIndex: number, skillId: string) => {
    updateDraftRole(roleIndex, (role) => {
      const currentSkillIds = role.skillIds || [];
      const nextSkillIds = currentSkillIds.includes(skillId)
        ? currentSkillIds.filter((item) => item !== skillId)
        : [...currentSkillIds, skillId];

      return {
        ...role,
        skillIds: nextSkillIds,
      };
    });
  };

  const handleStartCreate = (base?: TeamDefinition | null) => {
    setDraft(
      base
        ? buildDraftFromTeam(
            cloneTeamDefinitionAsCustom(base, {
              label:
                base.source === "builtin"
                  ? copy.editor.customCloneLabel(base.label)
                  : base.label,
            }),
          )
        : createBlankDraft(copy, activeTheme),
    );
  };

  const handleStartEdit = (team: TeamDefinition) => {
    setDraft(buildDraftFromTeam(team));
  };

  const persistCustomTeams = async (nextCustomTeams: TeamDefinition[]) => {
    if (onPersistCustomTeams) {
      await Promise.resolve(onPersistCustomTeams(nextCustomTeams));
      return;
    }

    saveCustomTeams(nextCustomTeams);
  };

  const handleSaveDraft = async () => {
    const normalized = normalizeTeamDefinition({
      id: draft?.id,
      source: "custom",
      label: draft?.label,
      description: draft?.description,
      theme: draft?.theme,
      presetId:
        draft?.presetId ||
        (draft?.id &&
          customTeams.find((team) => team.id === draft.id)?.presetId),
      roles: draft?.roles,
    });

    if (!normalized) {
      toast.error(copy.toast.invalidDraft);
      return;
    }

    const nextTeam = {
      ...normalized,
      source: "custom" as const,
      updatedAt: Date.now(),
      createdAt:
        customTeams.find((team) => team.id === normalized.id)?.createdAt ||
        Date.now(),
    };

    const nextCustomTeams = [
      ...customTeams.filter((team) => team.id !== nextTeam.id),
      nextTeam,
    ].sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
    try {
      await persistCustomTeams(nextCustomTeams);
      setCustomTeams(nextCustomTeams);
      setDraft(null);
      onSelectTeam(nextTeam);
      onClose?.();
      toast.success(
        isProjectScopedCustomTeam
          ? copy.toast.saveProjectSuccess(nextTeam.label)
          : copy.toast.saveLocalSuccess(nextTeam.label),
      );
    } catch (error) {
      toast.error(
        copy.toast.saveFailed(
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  };

  const handleDeleteCustom = async (team: TeamDefinition) => {
    const nextCustomTeams = customTeams.filter((item) => item.id !== team.id);

    try {
      await persistCustomTeams(nextCustomTeams);
      setCustomTeams(nextCustomTeams);
      setDraft((currentDraft) =>
        currentDraft?.id === team.id ? null : currentDraft,
      );
      if (selectedTeam?.id === team.id) {
        onSelectTeam(null);
      }
      toast.success(
        isProjectScopedCustomTeam
          ? copy.toast.deleteProjectSuccess(team.label)
          : copy.toast.deleteLocalSuccess(team.label),
      );
    } catch (error) {
      toast.error(
        copy.toast.deleteFailed(
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  };

  const handleClearSelection = () => {
    onSelectTeam(null);
    onClose?.();
  };

  const handleSelect = (team: TeamDefinition) => {
    onSelectTeam(team);
    onClose?.();
  };

  const recommendedSelected = Boolean(
    recommendedTeam && selectedTeam?.id === recommendedTeam.id,
  );

  const inspectorTeam = useMemo(() => {
    const teamById = new Map<string, TeamDefinition>();

    for (const candidate of [
      selectedTeam,
      recommendedTeam,
      ...filteredCustomTeams,
      ...builtinTeams,
    ]) {
      if (candidate && !teamById.has(candidate.id)) {
        teamById.set(candidate.id, candidate);
      }
    }

    const preferredId =
      expandedTeamId ||
      selectedTeam?.id ||
      recommendedTeam?.id ||
      filteredCustomTeams[0]?.id ||
      builtinTeams[0]?.id;

    if (!preferredId) {
      return null;
    }

    return teamById.get(preferredId) || null;
  }, [
    builtinTeams,
    expandedTeamId,
    filteredCustomTeams,
    recommendedTeam,
    selectedTeam,
  ]);

  const renderInspectorPanel = () => {
    if (!inspectorTeam) {
      return (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
          {copy.emptyInspector}
        </div>
      );
    }

    const isCurrent = selectedTeam?.id === inspectorTeam.id;
    const isCustom = inspectorTeam.source === "custom";
    const badgeLabel =
      inspectorTeam.id === recommendedTeam?.id
        ? copy.badge.recommended
        : isCustom
          ? copy.badge.custom
          : copy.badge.systemTemplate;

    return (
      <div
        className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5"
        data-testid="team-selector-inspector"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-slate-900">
                {inspectorTeam.label}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                {badgeLabel}
              </span>
              {isCurrent ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                  <Check className="h-3.5 w-3.5" />
                  {copy.inspector.current}
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              {inspectorTeam.description || copy.inspector.defaultDescription}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isCurrent ? (
              <Button
                type="button"
                className={TEAM_SELECTOR_PRIMARY_BUTTON_CLASSNAME}
                onClick={() => handleSelect(inspectorTeam)}
              >
                {copy.inspector.select}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              onClick={() => handleStartCreate(inspectorTeam)}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              {copy.inspector.copyCustom}
            </Button>
            {isCustom ? (
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                onClick={() => handleStartEdit(inspectorTeam)}
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                {copy.inspector.edit}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500">
            {copy.inspector.summaryTitle}
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-700">
            {formatTeamDefinitionSummary(inspectorTeam, copy)}
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500">
            {copy.inspector.rolesTitle}
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {inspectorTeam.roles.map((role) => (
              <div
                key={`${inspectorTeam.id}-inspector-${role.id}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {role.label}
                  </span>
                  {role.profileId ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                      {copy.card.profilePrefix} ·{" "}
                      {getBuiltinTeamProfileOption(role.profileId)?.label ||
                        role.profileId}
                    </span>
                  ) : null}
                  {role.roleKey ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                      Role · {role.roleKey}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {role.summary}
                </div>
                {role.skillIds?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {role.skillIds.map((skillId) => (
                      <span
                        key={`${inspectorTeam.id}-${role.id}-${skillId}`}
                        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500"
                      >
                        {copy.card.skillPrefix} ·{" "}
                        {getBuiltinTeamSkillOption(skillId)?.label || skillId}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {isCustom ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
              onClick={() => {
                void handleDeleteCustom(inspectorTeam);
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {copy.inspector.delete}
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderDraftEditor = () => {
    if (!draft) {
      return renderInspectorPanel();
    }

    return (
      <section
        className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5"
        data-testid="team-selector-editor"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">
              {draft.id ? copy.editor.editTitle : copy.editor.createTitle}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {copy.editor.description}
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={() => setDraft(null)}
            aria-label={copy.editor.close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-xs font-medium text-slate-600">
              {copy.editor.teamName}
            </label>
            <Input
              value={draft.label}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        label: event.target.value,
                      }
                    : current,
                )
              }
              placeholder={copy.editor.teamNamePlaceholder}
              className="border-slate-200 bg-white"
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <label className="text-xs font-medium text-slate-600">
              {copy.editor.teamDescription}
            </label>
            <Textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        description: event.target.value,
                      }
                    : current,
                )
              }
              placeholder={copy.editor.teamDescriptionPlaceholder}
              className="min-h-[88px] border-slate-200 bg-white"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-slate-600">
              {copy.editor.rolesTitle}
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              onClick={() =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        roles: [
                          ...current.roles,
                          {
                            id: `role-${current.roles.length + 1}`,
                            label: "",
                            summary: "",
                            skillIds: [],
                          },
                        ],
                      }
                    : current,
                )
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {copy.editor.addRole}
            </Button>
          </div>

          <div className="space-y-3">
            {draft.roles.map((role, index) => (
              <div
                key={`${role.id}-${index}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                {(() => {
                  const selectedProfile = getBuiltinTeamProfileOption(
                    role.profileId,
                  );
                  const resolvedSkillIds = role.skillIds || [];
                  const suggestedSkillIds = selectedProfile?.skillIds || [];

                  return (
                    <>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-xs font-medium text-slate-500">
                          {copy.editor.roleIndex(index + 1)}
                        </div>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-700"
                          onClick={() =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    roles: current.roles.filter(
                                      (_, roleIndex) => roleIndex !== index,
                                    ),
                                  }
                                : current,
                            )
                          }
                          aria-label={copy.editor.removeRole(index + 1)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid gap-3">
                        <Input
                          value={role.label}
                          onChange={(event) =>
                            updateDraftRole(index, (item) => ({
                              ...item,
                              label: event.target.value,
                            }))
                          }
                          placeholder={copy.editor.roleNamePlaceholder}
                          className="border-slate-200 bg-white"
                        />
                        <Textarea
                          value={role.summary}
                          onChange={(event) =>
                            updateDraftRole(index, (item) => ({
                              ...item,
                              summary: event.target.value,
                            }))
                          }
                          placeholder={copy.editor.roleSummaryPlaceholder}
                          className="min-h-[84px] border-slate-200 bg-white"
                        />
                        <div className="grid gap-3 xl:grid-cols-2">
                          <div className="grid gap-2">
                            <label className="text-xs font-medium text-slate-600">
                              {copy.editor.profileLabel}
                            </label>
                            <select
                              value={role.profileId || ""}
                              onChange={(event) => {
                                const nextProfileId =
                                  event.target.value.trim() || undefined;
                                const nextProfile =
                                  getBuiltinTeamProfileOption(nextProfileId);
                                updateDraftRole(index, (item) => ({
                                  ...item,
                                  profileId: nextProfileId,
                                  roleKey:
                                    item.roleKey?.trim() ||
                                    nextProfile?.roleKey ||
                                    "",
                                  skillIds:
                                    item.skillIds && item.skillIds.length > 0
                                      ? item.skillIds
                                      : nextProfile?.skillIds
                                        ? [...nextProfile.skillIds]
                                        : [],
                                }));
                              }}
                              data-testid={`team-role-profile-select-${index}`}
                              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-300"
                            >
                              <option value="">
                                {copy.editor.profileNone}
                              </option>
                              {BUILTIN_TEAM_PROFILE_OPTIONS.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label} · {option.id}
                                </option>
                              ))}
                            </select>
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-500">
                              {selectedProfile ? (
                                <>
                                  <span className="font-medium text-slate-700">
                                    {selectedProfile.label}
                                  </span>
                                  <span> · {selectedProfile.description}</span>
                                </>
                              ) : (
                                copy.editor.profileHelp
                              )}
                            </div>
                          </div>

                          <div className="grid gap-2">
                            <label className="text-xs font-medium text-slate-600">
                              roleKey
                            </label>
                            <Input
                              value={role.roleKey || ""}
                              onChange={(event) =>
                                updateDraftRole(index, (item) => ({
                                  ...item,
                                  roleKey: event.target.value,
                                }))
                              }
                              data-testid={`team-role-role-key-input-${index}`}
                              placeholder={copy.editor.roleKeyPlaceholder}
                              className="border-slate-200 bg-white"
                            />
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-500">
                              {copy.editor.roleKeyHelp}
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <label className="text-xs font-medium text-slate-600">
                            skills
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {BUILTIN_TEAM_SKILL_OPTIONS.map((option) => {
                              const active = resolvedSkillIds.includes(
                                option.id,
                              );
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  className={cn(
                                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                                    active
                                      ? "border-sky-300 bg-sky-50 text-sky-700"
                                      : suggestedSkillIds.includes(option.id)
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
                                  )}
                                  onClick={() =>
                                    toggleDraftRoleSkill(index, option.id)
                                  }
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                          <Input
                            value={resolvedSkillIds.join(", ")}
                            onChange={(event) =>
                              updateDraftRole(index, (item) => ({
                                ...item,
                                skillIds: parseSkillIdsInput(
                                  event.target.value,
                                ),
                              }))
                            }
                            data-testid={`team-role-skill-ids-input-${index}`}
                            placeholder={copy.editor.skillIdsPlaceholder}
                            className="border-slate-200 bg-white"
                          />
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-500">
                            {selectedProfile && suggestedSkillIds.length > 0 ? (
                              <>
                                {copy.editor.recommendedSkills(
                                  suggestedSkillIds.join(", "),
                                )}
                              </>
                            ) : (
                              copy.editor.skillIdsHelp
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            onClick={() => setDraft(null)}
          >
            {copy.editor.cancel}
          </Button>
          <Button
            type="button"
            className={TEAM_SELECTOR_PRIMARY_BUTTON_CLASSNAME}
            onClick={() => {
              void handleSaveDraft();
            }}
          >
            {copy.editor.save}
          </Button>
        </div>
      </section>
    );
  };

  return (
    <div
      className="flex h-[min(78vh,760px)] w-full flex-col bg-white"
      data-testid="team-selector-panel"
    >
      <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgb(255,255,255)_0%,rgb(248,250,252)_100%)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.08em] text-slate-500">
              {copy.header.eyebrow}
            </div>
            <div className="mt-1 text-sm text-slate-700">
              {copy.header.description}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {isProjectScopedCustomTeam
                ? copy.header.projectScope
                : copy.header.localScope}
            </div>
          </div>
          {selectedTeam ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={handleClearSelection}
              title={copy.header.clear}
              aria-label={copy.header.clear}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {selectedTeam ? (
          <div
            className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
            data-testid="team-selector-current"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Users className="h-3.5 w-3.5" />
              {copy.currentTitle}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {selectedTeam.label}
            </div>
            {currentSelectionSummary ? (
              <div className="mt-1 text-xs leading-5 text-slate-600">
                {currentSelectionSummary}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto border-b border-slate-200/80 bg-white p-4 lg:border-b-0 lg:border-r">
          <div className="space-y-4">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="border-slate-200 bg-white"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className={TEAM_SELECTOR_PRIMARY_BUTTON_CLASSNAME}
                onClick={() =>
                  handleStartCreate(
                    selectedTeam || recommendedTeam || builtinTeams[0] || null,
                  )
                }
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {copy.createCustom}
              </Button>
              {selectedTeam ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  onClick={handleClearSelection}
                >
                  {copy.clearCurrent}
                </Button>
              ) : null}
            </div>

            {recommendedTeam ? (
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-slate-500">
                  <Sparkles className="h-3.5 w-3.5" />
                  {copy.recommendedSection}
                </div>
                <TeamCard
                  team={recommendedTeam}
                  selected={recommendedSelected}
                  expanded={expandedTeamId === recommendedTeam.id}
                  selectedLabel={copy.recommendedSelected}
                  badgeLabel={copy.badge.recommended}
                  copy={copy}
                  onSelect={() => handleSelect(recommendedTeam)}
                  onToggleDetail={() =>
                    setExpandedTeamId((currentId) =>
                      currentId === recommendedTeam.id
                        ? null
                        : recommendedTeam.id,
                    )
                  }
                  onCopy={() => handleStartCreate(recommendedTeam)}
                />
              </section>
            ) : null}

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold tracking-[0.08em] text-slate-500">
                  {isProjectScopedCustomTeam
                    ? copy.customSectionProject
                    : copy.customSectionLocal}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  onClick={() =>
                    handleStartCreate(
                      selectedTeam ||
                        recommendedTeam ||
                        builtinTeams[0] ||
                        null,
                    )
                  }
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {copy.createShort}
                </Button>
              </div>
              {filteredCustomTeams.length > 0 ? (
                <div className="space-y-2">
                  {filteredCustomTeams.map((team) => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      selected={selectedTeam?.id === team.id}
                      expanded={expandedTeamId === team.id}
                      badgeLabel={copy.badge.custom}
                      copy={copy}
                      onSelect={() => handleSelect(team)}
                      onToggleDetail={() =>
                        setExpandedTeamId((currentId) =>
                          currentId === team.id ? null : team.id,
                        )
                      }
                      onCopy={() => handleStartCreate(team)}
                      onEdit={() => handleStartEdit(team)}
                      onDelete={() => {
                        void handleDeleteCustom(team);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  <div>
                    {isProjectScopedCustomTeam
                      ? copy.emptyCustomProject
                      : copy.emptyCustomLocal}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    onClick={() =>
                      handleStartCreate(
                        selectedTeam ||
                          recommendedTeam ||
                          builtinTeams[0] ||
                          null,
                      )
                    }
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {copy.createNow}
                  </Button>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <div className="text-[11px] font-semibold tracking-[0.08em] text-slate-500">
                {copy.systemSection}
              </div>
              <div className="space-y-2">
                {builtinTeams.map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    selected={selectedTeam?.id === team.id}
                    expanded={expandedTeamId === team.id}
                    badgeLabel={copy.badge.system}
                    copy={copy}
                    onSelect={() => handleSelect(team)}
                    onToggleDetail={() =>
                      setExpandedTeamId((currentId) =>
                        currentId === team.id ? null : team.id,
                      )
                    }
                    onCopy={() => handleStartCreate(team)}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto bg-slate-50 p-5">
          {renderDraftEditor()}
        </div>
      </div>
    </div>
  );
};
