import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface TeamWorkspaceCanvasToolbarProps {
  laneCount: number;
  onAutoArrangeCanvas: () => void;
  onFitCanvasView: () => void;
  onResetCanvasView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoom: number;
}

export function TeamWorkspaceCanvasToolbar({
  laneCount,
  onAutoArrangeCanvas,
  onFitCanvasView,
  onResetCanvasView,
  onZoomIn,
  onZoomOut,
  zoom,
}: TeamWorkspaceCanvasToolbarProps) {
  const { t } = useTranslation("agent");
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
          {t("agentChat.teamWorkspace.canvasToolbar.currentProgress")}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
          {t("agentChat.teamWorkspace.canvasToolbar.zoom", {
            percent: zoomPercent,
          })}
        </span>
        {laneCount > 0 ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
            {t("agentChat.teamWorkspace.canvasToolbar.laneCount", {
              count: laneCount,
            })}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onAutoArrangeCanvas}
          data-testid="team-workspace-auto-arrange-button"
        >
          {t("agentChat.teamWorkspace.canvasToolbar.autoArrange")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onZoomOut}>
          {t("agentChat.teamWorkspace.canvasToolbar.zoomOut")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onZoomIn}>
          {t("agentChat.teamWorkspace.canvasToolbar.zoomIn")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onResetCanvasView}
        >
          100%
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onFitCanvasView}
        >
          {t("agentChat.teamWorkspace.canvasToolbar.fitProgress")}
        </Button>
      </div>
    </div>
  );
}
