import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CanvasWorkbenchBrowserPanel } from "../../../components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel";
import { resolveWorkspaceBrowserControlPresentation } from "../../workspaceBrowserControlMode";
import type { BrowserSessionRef } from "../../workspaceBrowserSessionRef";

type AgentTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export interface RightSurfaceBrowserPanelProps {
  initialUrl?: string | null;
  sessionRef?: BrowserSessionRef | null;
  controlMode?: string | null;
  lifecycleState?: string | null;
  active?: boolean;
  onNavigate?: (url: string, title?: string | null) => void;
}

const browserButtonClassName =
  "border-[color:var(--lime-chrome-border)] bg-[color:var(--lime-surface)] text-[color:var(--lime-chrome-text)] hover:bg-[color:var(--lime-chrome-tab-hover)] hover:text-[color:var(--lime-text-strong)]";

export const RightSurfaceBrowserPanel = memo(function RightSurfaceBrowserPanel({
  initialUrl,
  sessionRef = null,
  controlMode,
  lifecycleState,
  active = true,
  onNavigate,
}: RightSurfaceBrowserPanelProps) {
  const { t } = useTranslation("agent");
  const translateWorkbench = useCallback<AgentTranslation>(
    (key, options) => String(t(key as never, options as never)),
    [t],
  );

  if (!active) {
    return null;
  }

  const control = resolveWorkspaceBrowserControlPresentation({
    controlMode,
    lifecycleState,
  });
  const overlayClassName =
    control.owner === "human"
      ? "border-amber-300 bg-amber-50/95 text-amber-950"
      : "border-sky-300 bg-sky-50/95 text-sky-950";

  return (
    <div
      className="relative h-full min-h-0 bg-[color:var(--lime-surface)]"
      data-testid="right-surface-browser-panel"
      data-browser-adapter-kind={sessionRef?.adapterKind ?? ""}
      data-browser-control-mode={control.rawControlMode ?? ""}
      data-browser-control-owner={control.owner}
      data-browser-human-takeover={control.humanTakeover ? "true" : "false"}
      data-browser-lifecycle-state={control.rawLifecycleState ?? ""}
      data-browser-profile-key={sessionRef?.profileKey ?? ""}
      data-browser-session-id={sessionRef?.browserSessionId ?? ""}
    >
      {control.overlayVisible && control.labelKey && control.detailKey ? (
        <div
          aria-live="polite"
          className={`pointer-events-none absolute bottom-3 right-3 z-10 max-w-[min(360px,calc(100%-24px))] rounded-md border px-3 py-2 text-xs shadow-sm ${overlayClassName}`}
          data-testid="right-surface-browser-control-overlay"
        >
          <div className="font-medium leading-4">
            {t(control.labelKey as never)}
          </div>
          <div className="mt-0.5 text-[11px] leading-4 opacity-80">
            {t(control.detailKey as never)}
          </div>
        </div>
      ) : null}
      <CanvasWorkbenchBrowserPanel
        ghostButtonClassName={browserButtonClassName}
        translateWorkbench={translateWorkbench}
        initialUrl={initialUrl}
        onNavigate={onNavigate}
      />
    </div>
  );
});
