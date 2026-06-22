import React from "react";
import { Maximize2, Minimize2, PanelBottom, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { agentText } from "./harnessPanelText";
import { ProjectShellSurface } from "./ProjectShellSurface";

interface TaskCenterShellPanelProps {
  variant?: "bottom" | "surface";
  heightPx?: number;
  maximized?: boolean;
  projectRootPath?: string | null;
  onClose: () => void;
  onHeightChange?: (heightPx: number) => void;
  onToggleMaximize?: () => void;
}

export const TASK_CENTER_SHELL_PANEL_MIN_HEIGHT_PX = 180;
export const TASK_CENTER_SHELL_PANEL_DEFAULT_HEIGHT_PX = 236;
export const TASK_CENTER_SHELL_PANEL_MAX_HEIGHT_RATIO = 0.82;
export const TASK_CENTER_SHELL_PANEL_HEIGHT_PX =
  TASK_CENTER_SHELL_PANEL_DEFAULT_HEIGHT_PX;
export const TASK_CENTER_SHELL_PANEL_HEIGHT = `${TASK_CENTER_SHELL_PANEL_DEFAULT_HEIGHT_PX}px`;

export function TaskCenterShellPanel({
  variant = "bottom",
  heightPx = TASK_CENTER_SHELL_PANEL_DEFAULT_HEIGHT_PX,
  maximized = false,
  projectRootPath,
  onClose,
  onHeightChange,
  onToggleMaximize,
}: TaskCenterShellPanelProps) {
  useTranslation("agent");
  const dragStateRef = React.useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);

  const handleResize = React.useCallback(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  React.useEffect(() => {
    const animationFrame = requestAnimationFrame(handleResize);
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [handleResize, heightPx, maximized]);

  const handleResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startHeight: heightPx,
      };
    },
    [heightPx],
  );

  const handleResizePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      const viewportHeight =
        typeof window === "undefined" ? 900 : window.innerHeight;
      const maxHeight = Math.max(
        TASK_CENTER_SHELL_PANEL_MIN_HEIGHT_PX,
        Math.floor(viewportHeight * TASK_CENTER_SHELL_PANEL_MAX_HEIGHT_RATIO),
      );
      const nextHeight = Math.min(
        maxHeight,
        Math.max(
          TASK_CENTER_SHELL_PANEL_MIN_HEIGHT_PX,
          dragState.startHeight + (dragState.startY - event.clientY),
        ),
      );
      onHeightChange?.(nextHeight);
    },
    [onHeightChange],
  );

  const handleResizePointerEnd = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current;
      if (dragState?.pointerId === event.pointerId) {
        dragStateRef.current = null;
        handleResize();
      }
    },
    [handleResize],
  );

  const canResizeBottomPanel = variant === "bottom";
  const shellToolbarControls = (
    <>
      {canResizeBottomPanel ? (
        <button
          type="button"
          className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label={
            maximized
              ? agentText("agentChat.navbar.shell.restore", "还原 Shell")
              : agentText("agentChat.navbar.shell.maximize", "最大化 Shell")
          }
          title={
            maximized
              ? agentText("agentChat.navbar.shell.restore", "还原 Shell")
              : agentText("agentChat.navbar.shell.maximize", "最大化 Shell")
          }
          onClick={onToggleMaximize}
          data-testid="task-center-shell-maximize"
        >
          {maximized ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>
      ) : null}
      <button
        type="button"
        className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label={agentText(
          "agentChat.navbar.shell.fit",
          "重新适配 Shell 尺寸",
        )}
        title={agentText(
          "agentChat.navbar.shell.fit",
          "重新适配 Shell 尺寸",
        )}
        onClick={handleResize}
        data-testid="task-center-shell-fit"
      >
        <PanelBottom className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label={agentText("agentChat.navbar.shell.close", "关闭 Shell")}
        title={agentText("agentChat.navbar.shell.close", "关闭 Shell")}
        onClick={onClose}
        data-testid="task-center-shell-close"
      >
        <X className="h-4 w-4" />
      </button>
    </>
  );

  if (variant === "surface") {
    return (
      <section
        className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white"
        data-testid="task-center-right-surface-shell-panel"
      >
        <ProjectShellSurface
          projectRootPath={projectRootPath}
          onRequestResize={handleResize}
          onCloseLastTab={onClose}
          className="min-h-0 flex-1"
          trailingToolbarContent={shellToolbarControls}
        />
      </section>
    );
  }

  return (
    <section
      className="absolute inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white shadow-[0_-18px_42px_-34px_var(--lime-shadow-color)]"
      data-testid="task-center-bottom-shell-panel"
      data-maximized={maximized ? "true" : "false"}
      style={{ height: heightPx }}
    >
      <div className="flex h-full flex-col">
        <button
          type="button"
          className="absolute left-0 right-0 top-0 z-10 flex h-2 cursor-ns-resize items-center justify-center border-0 bg-transparent p-0 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
          aria-label={agentText(
            "agentChat.navbar.shell.resize",
            "拖动调整 Shell 高度",
          )}
          title={agentText(
            "agentChat.navbar.shell.resize",
            "拖动调整 Shell 高度",
          )}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
          data-testid="task-center-shell-resize-handle"
        >
          <span className="h-0.5 w-14 rounded-full bg-current" />
        </button>
        <ProjectShellSurface
          projectRootPath={projectRootPath}
          onRequestResize={handleResize}
          onCloseLastTab={onClose}
          className="min-h-0 flex-1"
          trailingToolbarContent={shellToolbarControls}
        />
      </div>
    </section>
  );
}
