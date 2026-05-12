import { formatNumber } from "@/i18n/format";
import type { TeamRoleDefinition } from "../utils/teamDefinitions";
import { normalizeTeamWorkspaceDisplayValue } from "../utils/teamWorkspaceDisplay";
import {
  type TeamWorkspaceRuntimeFormationStatus,
  type TeamWorkspaceRuntimeMemberStatus,
  resolveRuntimeFormationStatusMeta,
  resolveRuntimeMemberStatusMeta,
  type TeamWorkspaceRuntimeFormationState,
} from "../teamWorkspaceRuntime";

export interface TeamWorkspaceFormationBadge {
  key: string;
  text: string;
  className: string;
}

export interface TeamWorkspaceFormationRoleCard {
  id: string;
  label: string;
  summary: string;
}

export interface TeamWorkspaceFormationMemberCard {
  id: string;
  label: string;
  summary: string;
  badgeLabel: string;
  badgeClassName: string;
}

export interface TeamWorkspaceSelectedTeamPlanDisplayState {
  hasSelectedTeamPlan: boolean;
  summaryBadges: TeamWorkspaceFormationBadge[];
  label: string | null;
  summary: string | null;
  roleCards: TeamWorkspaceFormationRoleCard[];
}

export interface TeamWorkspaceRuntimeFormationDisplayState {
  hasRuntimeFormation: boolean;
  hint: string;
  emptyDetail: string;
  noticeText: string;
  summaryBadges: TeamWorkspaceFormationBadge[];
  panelTitle: string;
  panelStatusLabel: string | null;
  panelStatusBadgeClassName: string | null;
  panelLabel: string | null;
  panelHeadline: string;
  panelDescription: string;
  referenceLabel: string | null;
  memberCards: TeamWorkspaceFormationMemberCard[];
  blueprintRoleCards: TeamWorkspaceFormationRoleCard[];
}

type TeamWorkspaceFormationResourceKey =
  | "agentChat.teamWorkspace.formation.emptyDetail.default"
  | "agentChat.teamWorkspace.formation.emptyDetail.failed"
  | "agentChat.teamWorkspace.formation.emptyDetail.formed"
  | "agentChat.teamWorkspace.formation.emptyDetail.forming"
  | "agentChat.teamWorkspace.formation.detail.hint.planOnly"
  | "agentChat.teamWorkspace.formation.detail.hint.runtimeWithReference"
  | "agentChat.teamWorkspace.formation.detail.referenceSummaryDefault"
  | "agentChat.teamWorkspace.formation.detail.roleSection.plan"
  | "agentChat.teamWorkspace.formation.detail.roleSection.runtime"
  | "agentChat.teamWorkspace.formation.detail.summary.plan"
  | "agentChat.teamWorkspace.formation.detail.summary.runtime"
  | "agentChat.teamWorkspace.formation.hint.default"
  | "agentChat.teamWorkspace.formation.hint.failed"
  | "agentChat.teamWorkspace.formation.hint.formed"
  | "agentChat.teamWorkspace.formation.hint.forming"
  | "agentChat.teamWorkspace.formation.memberStatus.completed"
  | "agentChat.teamWorkspace.formation.memberStatus.failed"
  | "agentChat.teamWorkspace.formation.memberStatus.planned"
  | "agentChat.teamWorkspace.formation.memberStatus.running"
  | "agentChat.teamWorkspace.formation.memberStatus.spawning"
  | "agentChat.teamWorkspace.formation.memberStatus.waiting"
  | "agentChat.teamWorkspace.formation.notice.default"
  | "agentChat.teamWorkspace.formation.notice.failed"
  | "agentChat.teamWorkspace.formation.notice.formed"
  | "agentChat.teamWorkspace.formation.notice.forming"
  | "agentChat.teamWorkspace.formation.panel.description.default"
  | "agentChat.teamWorkspace.formation.panel.description.failed"
  | "agentChat.teamWorkspace.formation.panel.title"
  | "agentChat.teamWorkspace.formation.status.failed.label"
  | "agentChat.teamWorkspace.formation.status.failed.title"
  | "agentChat.teamWorkspace.formation.status.formed.label"
  | "agentChat.teamWorkspace.formation.status.formed.title"
  | "agentChat.teamWorkspace.formation.status.forming.label"
  | "agentChat.teamWorkspace.formation.status.forming.title"
  | "agentChat.teamWorkspace.formation.summaryBadge.memberCount"
  | "agentChat.teamWorkspace.formation.summaryBadge.planLabel"
  | "agentChat.teamWorkspace.formation.summaryBadge.planRoleCount"
  | "agentChat.teamWorkspace.formation.summaryBadge.referenceLabel"
  | "agentChat.teamWorkspace.formation.summaryBadge.taskCount"
  | "agentChat.teamWorkspace.formation.waitingHeadline";

export type TeamWorkspaceFormationTranslate = (
  key: TeamWorkspaceFormationResourceKey,
  options?: Record<string, unknown>,
) => string;

export interface TeamWorkspaceFormationCopy {
  emptyDetailDefault: string;
  emptyDetailFailed: string;
  emptyDetailFormed: string;
  emptyDetailForming: string;
  detailHintPlanOnly: string;
  detailHintRuntimeWithReference: string;
  detailReferenceSummaryDefault: string;
  detailRoleSectionPlanLabel: string;
  detailRoleSectionRuntimeLabel: string;
  detailSummaryPlanLabel: string;
  detailSummaryRuntimeLabel: string;
  formatMemberCountBadge: (count: number) => string;
  formatPlanLabelBadge: (label: string) => string;
  formatPlanRoleCountBadge: (count: number) => string;
  formatReferenceLabelBadge: (label: string) => string;
  formatTaskCountBadge: (count: number) => string;
  getFormationStatusLabel: (
    status: TeamWorkspaceRuntimeFormationStatus,
  ) => string;
  getFormationStatusTitle: (
    status: TeamWorkspaceRuntimeFormationStatus,
  ) => string;
  getMemberStatusLabel: (status: TeamWorkspaceRuntimeMemberStatus) => string;
  hintDefault: string;
  hintFailed: string;
  hintFormed: string;
  hintForming: string;
  noticeDefault: string;
  noticeFailed: string;
  noticeFormed: string;
  noticeForming: string;
  panelDescriptionDefault: string;
  panelDescriptionFailed: string;
  panelTitle: string;
  waitingHeadline: string;
}

export function buildTeamWorkspaceFormationCopy(params: {
  locale?: string | null;
  translate: TeamWorkspaceFormationTranslate;
}): TeamWorkspaceFormationCopy {
  const formatCount = (count: number) =>
    formatNumber(count, { locale: params.locale });

  return {
    emptyDetailDefault: params.translate(
      "agentChat.teamWorkspace.formation.emptyDetail.default",
    ),
    emptyDetailFailed: params.translate(
      "agentChat.teamWorkspace.formation.emptyDetail.failed",
    ),
    emptyDetailFormed: params.translate(
      "agentChat.teamWorkspace.formation.emptyDetail.formed",
    ),
    emptyDetailForming: params.translate(
      "agentChat.teamWorkspace.formation.emptyDetail.forming",
    ),
    detailHintPlanOnly: params.translate(
      "agentChat.teamWorkspace.formation.detail.hint.planOnly",
    ),
    detailHintRuntimeWithReference: params.translate(
      "agentChat.teamWorkspace.formation.detail.hint.runtimeWithReference",
    ),
    detailReferenceSummaryDefault: params.translate(
      "agentChat.teamWorkspace.formation.detail.referenceSummaryDefault",
    ),
    detailRoleSectionPlanLabel: params.translate(
      "agentChat.teamWorkspace.formation.detail.roleSection.plan",
    ),
    detailRoleSectionRuntimeLabel: params.translate(
      "agentChat.teamWorkspace.formation.detail.roleSection.runtime",
    ),
    detailSummaryPlanLabel: params.translate(
      "agentChat.teamWorkspace.formation.detail.summary.plan",
    ),
    detailSummaryRuntimeLabel: params.translate(
      "agentChat.teamWorkspace.formation.detail.summary.runtime",
    ),
    formatMemberCountBadge: (count) =>
      params.translate(
        "agentChat.teamWorkspace.formation.summaryBadge.memberCount",
        {
          formattedCount: formatCount(count),
        },
      ),
    formatPlanLabelBadge: (label) =>
      params.translate(
        "agentChat.teamWorkspace.formation.summaryBadge.planLabel",
        { label },
      ),
    formatPlanRoleCountBadge: (count) =>
      params.translate(
        "agentChat.teamWorkspace.formation.summaryBadge.planRoleCount",
        {
          formattedCount: formatCount(count),
        },
      ),
    formatReferenceLabelBadge: (label) =>
      params.translate(
        "agentChat.teamWorkspace.formation.summaryBadge.referenceLabel",
        { label },
      ),
    formatTaskCountBadge: (count) =>
      params.translate(
        "agentChat.teamWorkspace.formation.summaryBadge.taskCount",
        {
          formattedCount: formatCount(count),
        },
      ),
    getFormationStatusLabel: (status) =>
      params.translate(
        `agentChat.teamWorkspace.formation.status.${status}.label` as TeamWorkspaceFormationResourceKey,
      ),
    getFormationStatusTitle: (status) =>
      params.translate(
        `agentChat.teamWorkspace.formation.status.${status}.title` as TeamWorkspaceFormationResourceKey,
      ),
    getMemberStatusLabel: (status) =>
      params.translate(
        `agentChat.teamWorkspace.formation.memberStatus.${status}` as TeamWorkspaceFormationResourceKey,
      ),
    hintDefault: params.translate(
      "agentChat.teamWorkspace.formation.hint.default",
    ),
    hintFailed: params.translate(
      "agentChat.teamWorkspace.formation.hint.failed",
    ),
    hintFormed: params.translate(
      "agentChat.teamWorkspace.formation.hint.formed",
    ),
    hintForming: params.translate(
      "agentChat.teamWorkspace.formation.hint.forming",
    ),
    noticeDefault: params.translate(
      "agentChat.teamWorkspace.formation.notice.default",
    ),
    noticeFailed: params.translate(
      "agentChat.teamWorkspace.formation.notice.failed",
    ),
    noticeFormed: params.translate(
      "agentChat.teamWorkspace.formation.notice.formed",
    ),
    noticeForming: params.translate(
      "agentChat.teamWorkspace.formation.notice.forming",
    ),
    panelDescriptionDefault: params.translate(
      "agentChat.teamWorkspace.formation.panel.description.default",
    ),
    panelDescriptionFailed: params.translate(
      "agentChat.teamWorkspace.formation.panel.description.failed",
    ),
    panelTitle: params.translate(
      "agentChat.teamWorkspace.formation.panel.title",
    ),
    waitingHeadline: params.translate(
      "agentChat.teamWorkspace.formation.waitingHeadline",
    ),
  };
}

export function buildRuntimeFormationHint(
  copy: TeamWorkspaceFormationCopy,
  teamDispatchPreviewState?: TeamWorkspaceRuntimeFormationState | null,
) {
  switch (teamDispatchPreviewState?.status) {
    case "forming":
      return copy.hintForming;
    case "formed":
      return copy.hintFormed;
    case "failed":
      return copy.hintFailed;
    default:
      return copy.hintDefault;
  }
}

export function buildRuntimeFormationEmptyDetail(
  copy: TeamWorkspaceFormationCopy,
  teamDispatchPreviewState?: TeamWorkspaceRuntimeFormationState | null,
) {
  const errorMessage = normalizeTeamWorkspaceDisplayValue(
    teamDispatchPreviewState?.errorMessage,
  );

  switch (teamDispatchPreviewState?.status) {
    case "forming":
      return copy.emptyDetailForming;
    case "formed":
      return copy.emptyDetailFormed;
    case "failed":
      return errorMessage || copy.emptyDetailFailed;
    default:
      return copy.emptyDetailDefault;
  }
}

export function buildSelectedTeamPlanDisplayState(params: {
  copy: TeamWorkspaceFormationCopy;
  selectedTeamLabel?: string | null;
  selectedTeamSummary?: string | null;
  selectedTeamRoles?: TeamRoleDefinition[] | null;
}): TeamWorkspaceSelectedTeamPlanDisplayState {
  const label = normalizeTeamWorkspaceDisplayValue(params.selectedTeamLabel);
  const summary = normalizeTeamWorkspaceDisplayValue(
    params.selectedTeamSummary,
  );
  const roleCards = (params.selectedTeamRoles ?? [])
    .map((role) => ({
      id: role.id,
      label: normalizeTeamWorkspaceDisplayValue(role.label),
      summary:
        normalizeTeamWorkspaceDisplayValue(role.summary) || role.summary.trim(),
    }))
    .filter((role) => Boolean(role.label))
    .map((role) => ({
      id: role.id,
      label: role.label || "",
      summary: role.summary,
    }));

  return {
    hasSelectedTeamPlan:
      Boolean(label) || Boolean(summary) || roleCards.length > 0,
    summaryBadges: [
      ...(label
        ? [
            {
              key: "plan-label",
              text: params.copy.formatPlanLabelBadge(label),
              className:
                "rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700",
            },
          ]
        : []),
      ...(roleCards.length > 0
        ? [
            {
              key: "plan-role-count",
              text: params.copy.formatPlanRoleCountBadge(roleCards.length),
              className:
                "rounded-full border border-slate-200 bg-white px-2.5 py-1",
            },
          ]
        : []),
    ],
    label,
    summary,
    roleCards,
  };
}

export function buildRuntimeFormationDisplayState(params: {
  copy: TeamWorkspaceFormationCopy;
  teamDispatchPreviewState?: TeamWorkspaceRuntimeFormationState | null;
  fallbackLabel?: string | null;
  fallbackSummary?: string | null;
}): TeamWorkspaceRuntimeFormationDisplayState {
  const state = params.teamDispatchPreviewState ?? null;
  const meta = state
    ? {
        badgeClassName: resolveRuntimeFormationStatusMeta(state.status)
          .badgeClassName,
        label: params.copy.getFormationStatusLabel(state.status),
        title: params.copy.getFormationStatusTitle(state.status),
      }
    : null;
  const label = normalizeTeamWorkspaceDisplayValue(
    state?.label || state?.blueprint?.label || params.fallbackLabel,
  );
  const summary = normalizeTeamWorkspaceDisplayValue(
    state?.summary || state?.blueprint?.summary || params.fallbackSummary,
  );
  const errorMessage = normalizeTeamWorkspaceDisplayValue(state?.errorMessage);
  const referenceLabel = normalizeTeamWorkspaceDisplayValue(
    state?.blueprint?.label,
  );
  const memberCards = (state?.members ?? []).map((member) => {
    const memberMeta = resolveRuntimeMemberStatusMeta(member.status);
    return {
      id: member.id,
      label: normalizeTeamWorkspaceDisplayValue(member.label) || member.label,
      summary:
        normalizeTeamWorkspaceDisplayValue(member.summary) || member.summary,
      badgeLabel: params.copy.getMemberStatusLabel(member.status),
      badgeClassName: memberMeta.badgeClassName,
    };
  });
  const blueprintRoleCards = (state?.blueprint?.roles ?? []).map((role) => ({
    id: role.id,
    label: normalizeTeamWorkspaceDisplayValue(role.label) || role.label,
    summary: normalizeTeamWorkspaceDisplayValue(role.summary) || role.summary,
  }));

  const noticeText =
    state?.status === "forming"
      ? params.copy.noticeForming
      : state?.status === "formed"
        ? params.copy.noticeFormed
        : state?.status === "failed"
          ? errorMessage || params.copy.noticeFailed
          : params.copy.noticeDefault;

  return {
    hasRuntimeFormation: Boolean(state),
    hint: buildRuntimeFormationHint(params.copy, state),
    emptyDetail: buildRuntimeFormationEmptyDetail(params.copy, state),
    noticeText,
    summaryBadges: [
      ...(label
        ? [
            {
              key: "runtime-label",
              text: params.copy.formatPlanLabelBadge(label),
              className:
                "rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700",
            },
          ]
        : []),
      ...(meta
        ? [
            {
              key: "runtime-status",
              text: meta.label,
              className: `rounded-full px-2.5 py-1 font-medium ${meta.badgeClassName}`,
            },
          ]
        : []),
      ...(memberCards.length > 0
        ? [
            {
              key: "runtime-member-count",
              text: params.copy.formatMemberCountBadge(memberCards.length),
              className:
                "rounded-full border border-slate-200 bg-white px-2.5 py-1",
            },
          ]
        : []),
      ...(referenceLabel
        ? [
            {
              key: "runtime-blueprint-label",
              text: params.copy.formatReferenceLabelBadge(referenceLabel),
              className:
                "rounded-full border border-slate-200 bg-white px-2.5 py-1",
            },
          ]
        : []),
    ],
    panelTitle: params.copy.panelTitle,
    panelStatusLabel: meta?.label ?? null,
    panelStatusBadgeClassName: meta?.badgeClassName ?? null,
    panelLabel: label,
    panelHeadline: meta?.title || params.copy.waitingHeadline,
    panelDescription:
      state?.status === "failed"
        ? errorMessage || params.copy.panelDescriptionFailed
        : summary || params.copy.panelDescriptionDefault,
    referenceLabel,
    memberCards,
    blueprintRoleCards,
  };
}
