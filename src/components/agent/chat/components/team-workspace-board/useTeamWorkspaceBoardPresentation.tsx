import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  buildTeamWorkspaceBoardChromeCopy,
  buildTeamWorkspaceBoardChromeDisplayState,
  type TeamWorkspaceBoardChromeTranslate,
} from "../../team-workspace-runtime/boardChromeSelectors";
import {
  buildSelectedSessionDetailCopy,
  buildSelectedSessionDetailDisplayState,
  type SelectedSessionDetailDisplayState,
  type SelectedSessionDetailTranslate,
} from "../../team-workspace-runtime/selectedSessionDetailSelectors";
import type { TeamWorkspaceRuntimeFormationDisplayState } from "../../team-workspace-runtime/formationDisplaySelectors";
import type { TeamWorkspaceRuntimeFormationStatus } from "../../teamWorkspaceRuntime";
import {
  buildFallbackSummary,
  resolveStatusMeta,
  type TeamSessionCard,
} from "../../utils/teamWorkspaceSessions";
import {
  buildTeamWorkspaceBoardCopy,
  buildTeamWorkspaceBoardSurfaceClassNames,
  resolveTeamWorkspaceBoardCopyState,
  type TeamWorkspaceBoardTranslate,
} from "./teamWorkspaceBoardPresentationSelectors";

interface UseTeamWorkspaceBoardPresentationParams {
  canCloseCompletedTeamSessions: boolean;
  canWaitAnyActiveTeamSession: boolean;
  className?: string;
  completedCount: number;
  detailExpanded: boolean;
  dispatchPreviewStatus?: TeamWorkspaceRuntimeFormationStatus | null;
  embedded: boolean;
  hasRuntimeFormation: boolean;
  isChildSession: boolean;
  isEmptyShellState: boolean;
  parentSessionName?: string | null;
  selectedSession: TeamSessionCard | null;
  shellExpanded: boolean;
  siblingCount: number;
  statusSummary: Record<string, number>;
  totalTeamSessions: number;
  visibleSessionsCount: number;
  waitableCount: number;
  zoom: number;
  runtimeFormationDisplay: TeamWorkspaceRuntimeFormationDisplayState;
}

interface TeamWorkspaceBoardPresentationState {
  boardBodyClassName: string;
  boardChromeDisplay: ReturnType<
    typeof buildTeamWorkspaceBoardChromeDisplayState
  >;
  boardHeaderClassName: string;
  boardShellClassName: string;
  canvasStageHeight: string;
  detailCardClassName: string;
  detailSummary: string;
  detailToggleLabel: string;
  detailVisible: boolean;
  inlineDetailSectionClassName: string;
  inlineTimelineEntryClassName: string;
  inlineTimelineFeedClassName: string;
  memberCanvasSubtitle: string;
  memberCanvasTitle: string;
  railCardClassName: string;
  selectedSessionDetailDisplay: SelectedSessionDetailDisplayState;
  useCompactCanvasChrome: boolean;
}

export function useTeamWorkspaceBoardPresentation({
  canCloseCompletedTeamSessions,
  canWaitAnyActiveTeamSession,
  className,
  completedCount,
  detailExpanded,
  dispatchPreviewStatus = null,
  embedded,
  hasRuntimeFormation,
  isChildSession,
  isEmptyShellState,
  parentSessionName,
  selectedSession,
  shellExpanded,
  siblingCount,
  statusSummary,
  totalTeamSessions,
  visibleSessionsCount,
  waitableCount,
  zoom,
  runtimeFormationDisplay,
}: UseTeamWorkspaceBoardPresentationParams): TeamWorkspaceBoardPresentationState {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.resolvedLanguage || i18n.language;
  const translateBoard = useMemo<TeamWorkspaceBoardTranslate>(
    () => (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const translateBoardChrome = useMemo<TeamWorkspaceBoardChromeTranslate>(
    () => (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const translateSelectedSessionDetail =
    useMemo<SelectedSessionDetailTranslate>(
      () => (key, options) => String(t(key as never, options as never)),
      [t],
    );
  const boardCopy = useMemo(
    () =>
      buildTeamWorkspaceBoardCopy({
        locale,
        translate: translateBoard,
      }),
    [locale, translateBoard],
  );
  const boardChromeCopy = useMemo(
    () =>
      buildTeamWorkspaceBoardChromeCopy({
        locale,
        translate: translateBoardChrome,
      }),
    [locale, translateBoardChrome],
  );
  const selectedSessionDetailCopy = useMemo(
    () =>
      buildSelectedSessionDetailCopy({
        locale,
        translate: translateSelectedSessionDetail,
      }),
    [locale, translateSelectedSessionDetail],
  );
  const hasRuntimeSessions = isChildSession || totalTeamSessions > 0;
  const useCompactCanvasChrome = hasRuntimeSessions;
  const {
    detailToggleLabel,
    detailVisible,
    memberCanvasSubtitle,
    memberCanvasTitle,
  } = resolveTeamWorkspaceBoardCopyState({
    copy: boardCopy,
    detailExpanded,
    dispatchPreviewStatus,
    hasRuntimeSessions,
    isChildSession,
    isEmptyShellState,
    shellExpanded,
    visibleSessionsCount,
  });

  const boardChromeDisplay = useMemo(
    () =>
      buildTeamWorkspaceBoardChromeDisplayState({
        copy: boardChromeCopy,
        hasRuntimeSessions,
        runtimeFormationTitle: hasRuntimeFormation
          ? runtimeFormationDisplay.panelHeadline
          : null,
        runtimeFormationHint: runtimeFormationDisplay.hint,
        isChildSession,
        parentSessionName,
        totalTeamSessions,
        siblingCount,
        selectedSession,
        zoom,
        canWaitAnyActiveTeamSession,
        waitableCount,
        canCloseCompletedTeamSessions,
        completedCount,
        statusSummary,
      }),
    [
      canCloseCompletedTeamSessions,
      canWaitAnyActiveTeamSession,
      completedCount,
      boardChromeCopy,
      hasRuntimeSessions,
      hasRuntimeFormation,
      isChildSession,
      parentSessionName,
      runtimeFormationDisplay.hint,
      runtimeFormationDisplay.panelHeadline,
      selectedSession,
      siblingCount,
      statusSummary,
      totalTeamSessions,
      waitableCount,
      zoom,
    ],
  );

  const detailSummary =
    selectedSession?.taskSummary ||
    buildFallbackSummary({
      hasRuntimeSessions,
      isChildSession,
      selectedSession,
    });
  const selectedSessionDetailDisplay = useMemo(
    () =>
      buildSelectedSessionDetailDisplayState({
        copy: selectedSessionDetailCopy,
        selectedSession,
        isChildSession,
        parentSessionName,
      }),
    [
      isChildSession,
      parentSessionName,
      selectedSession,
      selectedSessionDetailCopy,
    ],
  );
  const selectedStatusMeta = resolveStatusMeta(selectedSession?.runtimeStatus);
  const {
    boardBodyClassName,
    boardHeaderClassName,
    boardShellClassName,
    canvasStageHeight,
    detailCardClassName,
    inlineDetailSectionClassName,
    inlineTimelineEntryClassName,
    inlineTimelineFeedClassName,
    railCardClassName,
  } = buildTeamWorkspaceBoardSurfaceClassNames({
    className,
    detailVisible,
    embedded,
    selectedSessionStatusCardClassName: selectedStatusMeta.cardClassName,
    selectedSessionVisible: Boolean(selectedSession),
    useCompactCanvasChrome,
  });

  return {
    boardBodyClassName,
    boardChromeDisplay,
    boardHeaderClassName,
    boardShellClassName,
    canvasStageHeight,
    detailCardClassName,
    detailSummary,
    detailToggleLabel,
    detailVisible,
    inlineDetailSectionClassName,
    inlineTimelineEntryClassName,
    inlineTimelineFeedClassName,
    memberCanvasSubtitle,
    memberCanvasTitle,
    railCardClassName,
    selectedSessionDetailDisplay,
    useCompactCanvasChrome,
  };
}
