import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TeamWorkspaceBoardChromeDisplayState } from "../../team-workspace-runtime/boardChromeSelectors";
import type { TeamWorkspaceRuntimeStatus } from "../../teamWorkspaceRuntime";

interface TeamWorkspaceStatusMeta {
  badgeClassName: string;
}

interface TeamWorkspaceTeamActionButtonsProps {
  buttonClassName?: string;
  canCloseCompletedTeamSessions: boolean;
  canWaitAnyActiveTeamSession: boolean;
  onCloseCompletedTeamSessions: () => void | Promise<void>;
  onWaitAnyActiveTeamSessions: () => void | Promise<void>;
  pendingTeamAction: "wait_any" | "close_completed" | null;
}

export function TeamWorkspaceTeamActionButtons({
  buttonClassName,
  canCloseCompletedTeamSessions,
  canWaitAnyActiveTeamSession,
  onCloseCompletedTeamSessions,
  onWaitAnyActiveTeamSessions,
  pendingTeamAction,
}: TeamWorkspaceTeamActionButtonsProps) {
  const { t } = useTranslation("agent");

  return (
    <>
      {canWaitAnyActiveTeamSession ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={buttonClassName}
          disabled={pendingTeamAction === "wait_any"}
          onClick={() => void onWaitAnyActiveTeamSessions()}
          data-testid="team-workspace-wait-active-button"
        >
          {pendingTeamAction === "wait_any" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : null}
          {pendingTeamAction === "wait_any"
            ? t("agentChat.teamWorkspace.teamActions.waiting")
            : t("agentChat.teamWorkspace.teamActions.waitAny")}
        </Button>
      ) : null}
      {canCloseCompletedTeamSessions ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={buttonClassName}
          disabled={pendingTeamAction === "close_completed"}
          onClick={() => void onCloseCompletedTeamSessions()}
          data-testid="team-workspace-close-completed-button"
        >
          {pendingTeamAction === "close_completed" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : null}
          {pendingTeamAction === "close_completed"
            ? t("agentChat.teamWorkspace.teamActions.closing")
            : t("agentChat.teamWorkspace.teamActions.closeCompleted")}
        </Button>
      ) : null}
    </>
  );
}

interface TeamWorkspaceCanvasViewButtonsProps {
  buttonClassName?: string;
  includeZoomControls?: boolean;
  onAutoArrangeCanvas: () => void;
  onFitCanvasView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function TeamWorkspaceCanvasViewButtons({
  buttonClassName,
  includeZoomControls = true,
  onAutoArrangeCanvas,
  onFitCanvasView,
  onZoomIn,
  onZoomOut,
}: TeamWorkspaceCanvasViewButtonsProps) {
  const { t } = useTranslation("agent");

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={buttonClassName}
        onClick={onFitCanvasView}
      >
        {t("agentChat.teamWorkspace.canvasToolbar.fitProgress")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={buttonClassName}
        onClick={onAutoArrangeCanvas}
        data-testid="team-workspace-auto-arrange-button"
      >
        {t("agentChat.teamWorkspace.canvasToolbar.autoArrange")}
      </Button>
      {includeZoomControls ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={buttonClassName}
            onClick={onZoomOut}
          >
            {t("agentChat.teamWorkspace.canvasToolbar.zoomOut")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={buttonClassName}
            onClick={onZoomIn}
          >
            {t("agentChat.teamWorkspace.canvasToolbar.zoomIn")}
          </Button>
        </>
      ) : null}
    </>
  );
}

interface TeamWorkspaceCompactToolbarChipProps {
  chip: TeamWorkspaceBoardChromeDisplayState["compactToolbarChips"][number];
  compactCanvasMutedChipClassName: string;
  compactCanvasSummaryChipClassName: string;
  resolveStatusMeta: (
    status?: TeamWorkspaceRuntimeStatus,
  ) => TeamWorkspaceStatusMeta;
}

export function TeamWorkspaceCompactToolbarChip({
  chip,
  compactCanvasMutedChipClassName,
  compactCanvasSummaryChipClassName,
  resolveStatusMeta,
}: TeamWorkspaceCompactToolbarChipProps) {
  if (chip.tone === "status") {
    return (
      <span
        className={cn(
          "rounded-full px-2.5 py-1 text-[11px] font-medium",
          resolveStatusMeta(chip.status).badgeClassName,
        )}
      >
        {chip.text}
      </span>
    );
  }

  return (
    <span
      className={
        chip.tone === "summary"
          ? compactCanvasSummaryChipClassName
          : compactCanvasMutedChipClassName
      }
    >
      {chip.text}
    </span>
  );
}
