import { cn } from "@/lib/utils";
import { formatNumber } from "@/i18n/format";
import type { TeamWorkspaceRuntimeFormationStatus } from "../../teamWorkspaceRuntime";
import { TEAM_WORKSPACE_CANVAS_STAGE_HEIGHT } from "../../utils/teamWorkspaceCanvas";

type TeamWorkspaceBoardResourceKey =
  | "agentChat.teamWorkspace.board.canvas.title"
  | "agentChat.teamWorkspace.board.canvas.subtitle.childRuntime"
  | "agentChat.teamWorkspace.board.canvas.subtitle.formation.default"
  | "agentChat.teamWorkspace.board.canvas.subtitle.formation.failed"
  | "agentChat.teamWorkspace.board.canvas.subtitle.formation.formed"
  | "agentChat.teamWorkspace.board.canvas.subtitle.formation.forming"
  | "agentChat.teamWorkspace.board.canvas.subtitle.runtime"
  | "agentChat.teamWorkspace.board.detail.collapse"
  | "agentChat.teamWorkspace.board.detail.expand";

export type TeamWorkspaceBoardTranslate = (
  key: TeamWorkspaceBoardResourceKey,
  options?: Record<string, unknown>,
) => string;

export interface TeamWorkspaceBoardCopy {
  detailCollapse: string;
  detailExpand: string;
  formatRuntimeCanvasSubtitle: (visibleSessionsCount: number) => string;
  memberCanvasSubtitleChildRuntime: string;
  memberCanvasSubtitleFormationDefault: string;
  memberCanvasSubtitleFormationFailed: string;
  memberCanvasSubtitleFormationFormed: string;
  memberCanvasSubtitleFormationForming: string;
  memberCanvasTitle: string;
}

export function buildTeamWorkspaceBoardCopy(params: {
  locale?: string | null;
  translate: TeamWorkspaceBoardTranslate;
}): TeamWorkspaceBoardCopy {
  const formatCount = (count: number) =>
    formatNumber(count, { locale: params.locale });

  return {
    detailCollapse: params.translate(
      "agentChat.teamWorkspace.board.detail.collapse",
    ),
    detailExpand: params.translate(
      "agentChat.teamWorkspace.board.detail.expand",
    ),
    formatRuntimeCanvasSubtitle: (visibleSessionsCount) =>
      params.translate(
        "agentChat.teamWorkspace.board.canvas.subtitle.runtime",
        {
          formattedCount: formatCount(visibleSessionsCount),
        },
      ),
    memberCanvasSubtitleChildRuntime: params.translate(
      "agentChat.teamWorkspace.board.canvas.subtitle.childRuntime",
    ),
    memberCanvasSubtitleFormationDefault: params.translate(
      "agentChat.teamWorkspace.board.canvas.subtitle.formation.default",
    ),
    memberCanvasSubtitleFormationFailed: params.translate(
      "agentChat.teamWorkspace.board.canvas.subtitle.formation.failed",
    ),
    memberCanvasSubtitleFormationFormed: params.translate(
      "agentChat.teamWorkspace.board.canvas.subtitle.formation.formed",
    ),
    memberCanvasSubtitleFormationForming: params.translate(
      "agentChat.teamWorkspace.board.canvas.subtitle.formation.forming",
    ),
    memberCanvasTitle: params.translate(
      "agentChat.teamWorkspace.board.canvas.title",
    ),
  };
}

interface ResolveTeamWorkspaceBoardCopyStateParams {
  copy: TeamWorkspaceBoardCopy;
  detailExpanded: boolean;
  dispatchPreviewStatus?: TeamWorkspaceRuntimeFormationStatus | null;
  hasRuntimeSessions: boolean;
  isChildSession: boolean;
  isEmptyShellState: boolean;
  shellExpanded: boolean;
  visibleSessionsCount: number;
}

interface TeamWorkspaceBoardCopyState {
  detailToggleLabel: string;
  detailVisible: boolean;
  memberCanvasSubtitle: string;
  memberCanvasTitle: string;
}

interface BuildTeamWorkspaceBoardSurfaceClassNamesParams {
  className?: string;
  detailVisible: boolean;
  embedded: boolean;
  selectedSessionStatusCardClassName?: string | null;
  selectedSessionVisible: boolean;
  useCompactCanvasChrome: boolean;
}

interface TeamWorkspaceBoardSurfaceClassNames {
  boardBodyClassName: string;
  boardHeaderClassName: string;
  boardShellClassName: string;
  canvasStageHeight: string;
  detailCardClassName: string;
  inlineDetailSectionClassName: string;
  inlineTimelineEntryClassName: string;
  inlineTimelineFeedClassName: string;
  railCardClassName: string;
}

export function resolveTeamWorkspaceBoardCopyState({
  copy,
  detailExpanded,
  dispatchPreviewStatus = null,
  hasRuntimeSessions,
  isChildSession,
  isEmptyShellState,
  shellExpanded,
  visibleSessionsCount,
}: ResolveTeamWorkspaceBoardCopyStateParams): TeamWorkspaceBoardCopyState {
  const detailVisible =
    isEmptyShellState || !hasRuntimeSessions
      ? detailExpanded || shellExpanded
      : false;

  return {
    detailToggleLabel: detailVisible ? copy.detailCollapse : copy.detailExpand,
    detailVisible,
    memberCanvasTitle: copy.memberCanvasTitle,
    memberCanvasSubtitle: hasRuntimeSessions
      ? isChildSession
        ? copy.memberCanvasSubtitleChildRuntime
        : copy.formatRuntimeCanvasSubtitle(visibleSessionsCount)
      : dispatchPreviewStatus === "forming"
        ? copy.memberCanvasSubtitleFormationForming
        : dispatchPreviewStatus === "formed"
          ? copy.memberCanvasSubtitleFormationFormed
          : dispatchPreviewStatus === "failed"
            ? copy.memberCanvasSubtitleFormationFailed
            : copy.memberCanvasSubtitleFormationDefault,
  };
}

export function buildTeamWorkspaceBoardSurfaceClassNames({
  className,
  detailVisible,
  embedded,
  selectedSessionStatusCardClassName = null,
  selectedSessionVisible,
  useCompactCanvasChrome,
}: BuildTeamWorkspaceBoardSurfaceClassNamesParams): TeamWorkspaceBoardSurfaceClassNames {
  return {
    boardBodyClassName: embedded
      ? cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          useCompactCanvasChrome
            ? "space-y-2.5 p-3 sm:p-3.5"
            : "space-y-3 p-3 sm:p-4",
        )
      : cn(useCompactCanvasChrome ? "p-3 sm:p-3.5" : "p-3 sm:p-4"),
    boardHeaderClassName: cn(
      "flex flex-wrap items-start justify-between gap-3",
      useCompactCanvasChrome ? "px-4 py-2.5 sm:px-4" : "px-4 py-3.5 sm:px-5",
      embedded
        ? cn(
            "sticky top-0 z-40 border-b border-slate-200",
            useCompactCanvasChrome ? "bg-white" : "bg-slate-50",
          )
        : cn(
            "border-b border-slate-200",
            useCompactCanvasChrome ? "bg-white" : "bg-slate-50",
          ),
    ),
    boardShellClassName: cn(
      "lime-workbench-theme-scope lime-workbench-surface-scope",
      embedded
        ? "pointer-events-auto flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-950/5"
        : "overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_18px_64px_-42px_rgba(15,23,42,0.24)]",
      embedded ? "mx-0 mt-0" : "mx-3 mt-2",
      className,
    ),
    canvasStageHeight:
      embedded && !detailVisible
        ? "clamp(560px, 76vh, 980px)"
        : TEAM_WORKSPACE_CANVAS_STAGE_HEIGHT,
    detailCardClassName: cn(
      embedded
        ? "rounded-[20px] border border-slate-200 bg-white p-4"
        : "rounded-[22px] border p-4 shadow-sm shadow-slate-950/5",
      !embedded &&
        (selectedSessionVisible
          ? selectedSessionStatusCardClassName
          : "border-slate-200 bg-white"),
    ),
    inlineDetailSectionClassName:
      "mt-3 rounded-[18px] border border-slate-200 bg-slate-50 p-3",
    inlineTimelineEntryClassName:
      "rounded-[14px] border border-slate-200 bg-white p-3",
    inlineTimelineFeedClassName:
      "mt-3 rounded-[16px] border border-slate-200 bg-white p-3",
    railCardClassName: embedded
      ? cn(
          "pointer-events-auto",
          useCompactCanvasChrome ? "space-y-3" : "space-y-4",
        )
      : "rounded-[22px] border border-slate-200 bg-slate-50 p-3.5 shadow-sm shadow-slate-950/5",
  };
}
