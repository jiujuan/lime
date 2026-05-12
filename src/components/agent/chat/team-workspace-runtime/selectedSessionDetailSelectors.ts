import type { AsterSubagentSkillInfo } from "@/lib/api/agentRuntime";
import { formatNumber } from "@/i18n/format";
import agentSourceResource from "@/i18n/resources/zh-CN/agent.json";
import { buildTeamWorkspaceSkillDisplayName } from "../utils/teamWorkspaceCopy";
import type { TeamWorkspaceRuntimeStatus } from "../teamWorkspaceRuntime";
import {
  buildRuntimeDetailSummary,
  type TeamWorkspaceRuntimeDetailCopy,
} from "./canvasLaneSelectors";

type SelectedSessionDetailResourceKey =
  | "agentChat.teamWorkspace.canvasLane.runtimeDetail.processingCount"
  | "agentChat.teamWorkspace.canvasLane.runtimeDetail.recentProgress"
  | "agentChat.teamWorkspace.canvasLane.runtimeDetail.stableProcessing"
  | "agentChat.teamWorkspace.canvasLane.runtimeDetail.waitingCount"
  | "agentChat.teamWorkspace.runtimeStatus.aborted"
  | "agentChat.teamWorkspace.runtimeStatus.closed"
  | "agentChat.teamWorkspace.runtimeStatus.completed"
  | "agentChat.teamWorkspace.runtimeStatus.failed"
  | "agentChat.teamWorkspace.runtimeStatus.idle"
  | "agentChat.teamWorkspace.runtimeStatus.queued"
  | "agentChat.teamWorkspace.runtimeStatus.running"
  | "agentChat.teamWorkspace.selectedSession.detail.metadata.createdFromTurn"
  | "agentChat.teamWorkspace.selectedSession.detail.metadata.model"
  | "agentChat.teamWorkspace.selectedSession.detail.metadata.originTool"
  | "agentChat.teamWorkspace.selectedSession.detail.metadata.parentSession"
  | "agentChat.teamWorkspace.selectedSession.detail.metadata.provider"
  | "agentChat.teamWorkspace.selectedSession.detail.metadata.role"
  | "agentChat.teamWorkspace.selectedSession.detail.roleHint.design"
  | "agentChat.teamWorkspace.selectedSession.detail.roleHint.designer"
  | "agentChat.teamWorkspace.selectedSession.detail.roleHint.editor"
  | "agentChat.teamWorkspace.selectedSession.detail.roleHint.executor"
  | "agentChat.teamWorkspace.selectedSession.detail.roleHint.explorer"
  | "agentChat.teamWorkspace.selectedSession.detail.roleHint.orchestrator"
  | "agentChat.teamWorkspace.selectedSession.detail.roleHint.planner"
  | "agentChat.teamWorkspace.selectedSession.detail.roleHint.researcher"
  | "agentChat.teamWorkspace.selectedSession.detail.roleHint.reviewer"
  | "agentChat.teamWorkspace.selectedSession.detail.roleHint.writer"
  | "agentChat.teamWorkspace.selectedSession.detail.sessionType.fork"
  | "agentChat.teamWorkspace.selectedSession.detail.sessionType.subAgent"
  | "agentChat.teamWorkspace.selectedSession.detail.sessionType.user"
  | "agentChat.teamWorkspace.selectedSession.detail.setting.preset"
  | "agentChat.teamWorkspace.selectedSession.detail.setting.profile"
  | "agentChat.teamWorkspace.selectedSession.detail.setting.role"
  | "agentChat.teamWorkspace.selectedSession.detail.setting.theme"
  | "agentChat.teamWorkspace.teamPreset.codeTriageTeam"
  | "agentChat.teamWorkspace.teamPreset.contentCreationTeam"
  | "agentChat.teamWorkspace.teamPreset.researchTeam";

export type SelectedSessionDetailTranslate = (
  key: SelectedSessionDetailResourceKey,
  options?: Record<string, unknown>,
) => string;

type AgentSourceResourceKey = keyof typeof agentSourceResource;

const TEAM_PRESET_LABEL_KEYS = {
  "code-triage-team": "agentChat.teamWorkspace.teamPreset.codeTriageTeam",
  "research-team": "agentChat.teamWorkspace.teamPreset.researchTeam",
  "content-creation-team":
    "agentChat.teamWorkspace.teamPreset.contentCreationTeam",
} as const satisfies Record<string, SelectedSessionDetailResourceKey>;

const ROLE_HINT_LABEL_KEYS = {
  explorer: "agentChat.teamWorkspace.selectedSession.detail.roleHint.explorer",
  executor: "agentChat.teamWorkspace.selectedSession.detail.roleHint.executor",
  reviewer: "agentChat.teamWorkspace.selectedSession.detail.roleHint.reviewer",
  writer: "agentChat.teamWorkspace.selectedSession.detail.roleHint.writer",
  planner: "agentChat.teamWorkspace.selectedSession.detail.roleHint.planner",
  researcher:
    "agentChat.teamWorkspace.selectedSession.detail.roleHint.researcher",
  designer: "agentChat.teamWorkspace.selectedSession.detail.roleHint.designer",
  design: "agentChat.teamWorkspace.selectedSession.detail.roleHint.design",
  editor: "agentChat.teamWorkspace.selectedSession.detail.roleHint.editor",
  orchestrator:
    "agentChat.teamWorkspace.selectedSession.detail.roleHint.orchestrator",
} as const satisfies Record<string, SelectedSessionDetailResourceKey>;

function interpolateSelectedSessionDetailSourceTemplate(
  template: string,
  values?: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    const value = values?.[name];
    return value == null ? match : String(value);
  });
}

function translateSelectedSessionDetailSourceKey(
  key: SelectedSessionDetailResourceKey,
  values?: Record<string, unknown>,
): string {
  const template = agentSourceResource[key as AgentSourceResourceKey] ?? key;
  return interpolateSelectedSessionDetailSourceTemplate(template, values);
}

function resolveRuntimeStatusResourceKey(
  status?: TeamWorkspaceRuntimeStatus | "idle",
): SelectedSessionDetailResourceKey {
  return `agentChat.teamWorkspace.runtimeStatus.${status ?? "idle"}` as SelectedSessionDetailResourceKey;
}

function resolveSessionTypeResourceKey(
  value: "fork" | "sub_agent" | "user",
): SelectedSessionDetailResourceKey {
  switch (value) {
    case "fork":
      return "agentChat.teamWorkspace.selectedSession.detail.sessionType.fork";
    case "sub_agent":
      return "agentChat.teamWorkspace.selectedSession.detail.sessionType.subAgent";
    case "user":
      return "agentChat.teamWorkspace.selectedSession.detail.sessionType.user";
  }
}

export interface SelectedSessionDetailCopy extends TeamWorkspaceRuntimeDetailCopy {
  formatCreatedFromTurn: (turnId: string) => string;
  formatMetadataModel: (model: string) => string;
  formatMetadataOriginTool: (tool: string) => string;
  formatMetadataParentSession: (name: string) => string;
  formatMetadataProvider: (name: string) => string;
  formatMetadataRole: (label: string) => string;
  formatSettingPreset: (label: string) => string;
  formatSettingProfile: (name: string) => string;
  formatSettingRole: (label: string) => string;
  formatSettingTheme: (theme: string) => string;
  getPresetLabel: (presetId: string) => string;
  getRoleHintLabel: (roleHint?: string | null) => string | null;
  getSessionTypeLabel: (sessionType?: string | null) => string | null;
}

export function buildSelectedSessionDetailCopy(params: {
  locale?: string | null;
  translate: SelectedSessionDetailTranslate;
}): SelectedSessionDetailCopy {
  const formatCount = (count: number) =>
    formatNumber(count, { locale: params.locale });

  return {
    formatCreatedFromTurn: (turnId) =>
      params.translate(
        "agentChat.teamWorkspace.selectedSession.detail.metadata.createdFromTurn",
        { turnId },
      ),
    formatMetadataModel: (model) =>
      params.translate(
        "agentChat.teamWorkspace.selectedSession.detail.metadata.model",
        { model },
      ),
    formatMetadataOriginTool: (tool) =>
      params.translate(
        "agentChat.teamWorkspace.selectedSession.detail.metadata.originTool",
        { tool },
      ),
    formatMetadataParentSession: (name) =>
      params.translate(
        "agentChat.teamWorkspace.selectedSession.detail.metadata.parentSession",
        { name },
      ),
    formatMetadataProvider: (name) =>
      params.translate(
        "agentChat.teamWorkspace.selectedSession.detail.metadata.provider",
        { name },
      ),
    formatMetadataRole: (label) =>
      params.translate(
        "agentChat.teamWorkspace.selectedSession.detail.metadata.role",
        { label },
      ),
    formatProcessingCount: (activeCount, totalCount) =>
      params.translate(
        "agentChat.teamWorkspace.canvasLane.runtimeDetail.processingCount",
        {
          activeCount: formatCount(activeCount),
          totalCount: formatCount(totalCount),
        },
      ),
    formatRecentProgress: (status) =>
      params.translate(
        "agentChat.teamWorkspace.canvasLane.runtimeDetail.recentProgress",
        { status },
      ),
    formatSettingPreset: (label) =>
      params.translate(
        "agentChat.teamWorkspace.selectedSession.detail.setting.preset",
        { label },
      ),
    formatSettingProfile: (name) =>
      params.translate(
        "agentChat.teamWorkspace.selectedSession.detail.setting.profile",
        { name },
      ),
    formatSettingRole: (label) =>
      params.translate(
        "agentChat.teamWorkspace.selectedSession.detail.setting.role",
        { label },
      ),
    formatSettingTheme: (theme) =>
      params.translate(
        "agentChat.teamWorkspace.selectedSession.detail.setting.theme",
        { theme },
      ),
    formatWaitingCount: (count) =>
      params.translate(
        "agentChat.teamWorkspace.canvasLane.runtimeDetail.waitingCount",
        { formattedCount: formatCount(count) },
      ),
    getPresetLabel: (presetId) => {
      const normalized = presetId.trim();
      const key =
        TEAM_PRESET_LABEL_KEYS[
          normalized as keyof typeof TEAM_PRESET_LABEL_KEYS
        ];
      return key ? params.translate(key) : normalized;
    },
    getRoleHintLabel: (roleHint) => {
      const normalized = roleHint?.trim();
      if (!normalized) {
        return null;
      }

      const key =
        ROLE_HINT_LABEL_KEYS[
          normalized.toLowerCase() as keyof typeof ROLE_HINT_LABEL_KEYS
        ];
      if (key) {
        return params.translate(key);
      }

      return /[\u4e00-\u9fff]/.test(normalized) ? normalized : null;
    },
    getRuntimeStatusLabel: (status) =>
      params.translate(resolveRuntimeStatusResourceKey(status)),
    getSessionTypeLabel: (sessionType) => {
      const normalized = sessionType?.trim();
      if (!normalized) {
        return null;
      }
      if (
        normalized === "fork" ||
        normalized === "sub_agent" ||
        normalized === "user"
      ) {
        return params.translate(resolveSessionTypeResourceKey(normalized));
      }
      return normalized;
    },
    stableProcessingLabel: params.translate(
      "agentChat.teamWorkspace.canvasLane.runtimeDetail.stableProcessing",
    ),
  };
}

const SOURCE_SELECTED_SESSION_DETAIL_COPY = buildSelectedSessionDetailCopy({
  locale: "zh-CN",
  translate: translateSelectedSessionDetailSourceKey,
});

export interface SelectedSessionDetailSession {
  blueprintRoleLabel?: string;
  createdFromTurnId?: string;
  latestTurnStatus?: TeamWorkspaceRuntimeStatus;
  model?: string;
  originTool?: string;
  outputContract?: string;
  profileName?: string;
  providerConcurrencyGroup?: string;
  providerName?: string;
  providerParallelBudget?: number;
  queueReason?: string;
  queuedTurnCount?: number;
  roleKey?: string;
  sessionType?: string;
  skills?: AsterSubagentSkillInfo[];
  teamActiveCount?: number;
  teamParallelBudget?: number;
  teamPresetId?: string;
  teamQueuedCount?: number;
  theme?: string;
}

export interface SelectedSessionDetailSkillBadge {
  id: string;
  label: string;
  title?: string;
}

export interface SelectedSessionDetailDisplayState {
  runtimeDetailSummary: string | null;
  queueReason: string | null;
  metadata: string[];
  settingBadges: string[];
  outputContract: string | null;
  skillBadges: SelectedSessionDetailSkillBadge[];
  hasSettings: boolean;
}

export function buildSelectedSessionDetailDisplayState(params: {
  selectedSession?: SelectedSessionDetailSession | null;
  isChildSession: boolean;
  parentSessionName?: string | null;
  copy?: SelectedSessionDetailCopy;
}): SelectedSessionDetailDisplayState {
  const selectedSession = params.selectedSession ?? null;
  const copy = params.copy ?? SOURCE_SELECTED_SESSION_DETAIL_COPY;
  const queuedCount =
    selectedSession?.teamQueuedCount ?? selectedSession?.queuedTurnCount ?? 0;
  const roleLabel = copy.getRoleHintLabel(selectedSession?.roleKey);
  const presetLabel = selectedSession?.teamPresetId
    ? copy.getPresetLabel(selectedSession.teamPresetId)
    : null;
  const skillBadges = (selectedSession?.skills ?? []).map((skill) => ({
    id: skill.id,
    label: buildTeamWorkspaceSkillDisplayName(skill),
    title: skill.description || skill.directory || undefined,
  }));
  const settingBadges = [
    presetLabel ? copy.formatSettingPreset(presetLabel) : null,
    selectedSession?.profileName
      ? copy.formatSettingProfile(selectedSession.profileName)
      : null,
    roleLabel ? copy.formatSettingRole(roleLabel) : null,
    selectedSession?.theme
      ? copy.formatSettingTheme(selectedSession.theme)
      : null,
  ].filter(Boolean) as string[];
  const metadata = [
    selectedSession?.blueprintRoleLabel
      ? copy.formatMetadataRole(selectedSession.blueprintRoleLabel)
      : null,
    selectedSession?.sessionType
      ? copy.getSessionTypeLabel(selectedSession.sessionType)
      : null,
    selectedSession?.providerName
      ? copy.formatMetadataProvider(selectedSession.providerName)
      : null,
    selectedSession?.model
      ? copy.formatMetadataModel(selectedSession.model)
      : null,
    selectedSession?.originTool
      ? copy.formatMetadataOriginTool(selectedSession.originTool)
      : null,
    selectedSession?.createdFromTurnId
      ? copy.formatCreatedFromTurn(selectedSession.createdFromTurnId)
      : null,
    queuedCount > 0 ? copy.formatWaitingCount(queuedCount) : null,
    selectedSession?.teamActiveCount !== undefined &&
    selectedSession?.teamParallelBudget !== undefined
      ? copy.formatProcessingCount(
          selectedSession.teamActiveCount,
          selectedSession.teamParallelBudget,
        )
      : null,
    selectedSession?.providerParallelBudget === 1 &&
    selectedSession?.providerConcurrencyGroup
      ? copy.stableProcessingLabel
      : null,
    selectedSession?.latestTurnStatus
      ? copy.formatRecentProgress(
          copy.getRuntimeStatusLabel(selectedSession.latestTurnStatus),
        )
      : null,
    params.isChildSession && params.parentSessionName?.trim()
      ? copy.formatMetadataParentSession(params.parentSessionName.trim())
      : null,
  ].filter(Boolean) as string[];

  return {
    runtimeDetailSummary: buildRuntimeDetailSummary(selectedSession, copy),
    queueReason: selectedSession?.queueReason?.trim() || null,
    metadata,
    settingBadges,
    outputContract: selectedSession?.outputContract?.trim() || null,
    skillBadges,
    hasSettings:
      settingBadges.length > 0 ||
      Boolean(selectedSession?.outputContract?.trim()) ||
      skillBadges.length > 0,
  };
}
