import { memo, type ReactNode } from "react";
import type { CanvasWorkbenchUtilityView } from "../CanvasWorkbenchLayout";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface CanvasWorkbenchUtilityPanelProps {
  view: CanvasWorkbenchUtilityView | null | undefined;
  testId: string;
  fallbackTextKey: string;
  mutedPanelClassName: string;
  translateWorkbench: CanvasWorkbenchTranslation;
}

export const CanvasWorkbenchUtilityPanel = memo(
  function CanvasWorkbenchUtilityPanel({
    view,
    testId,
    fallbackTextKey,
    mutedPanelClassName,
    translateWorkbench,
  }: CanvasWorkbenchUtilityPanelProps): ReactNode {
    if (view?.enabled !== false && view?.renderPanel) {
      return (
        <div
          data-testid={testId}
          className="flex h-full min-h-0 flex-col overflow-hidden bg-white"
        >
          {view.leadContent ? (
            <div
              data-testid={`${testId}-lead`}
              className="border-b border-slate-200 px-3 py-2"
            >
              {view.leadContent}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">
            {view.renderPanel()}
          </div>
        </div>
      );
    }

    return (
      <div data-testid={testId} className="p-5">
        <div className={mutedPanelClassName}>
          {translateWorkbench(fallbackTextKey)}
        </div>
      </div>
    );
  },
);

CanvasWorkbenchUtilityPanel.displayName = "CanvasWorkbenchUtilityPanel";
