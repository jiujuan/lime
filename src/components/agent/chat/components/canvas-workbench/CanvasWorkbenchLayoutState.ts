import { resolveCanvasWorkbenchPreferredPreviewModeFromPath } from "./CanvasWorkbenchPreviewModeViewModel";
import type { CanvasWorkbenchDefaultPreview } from "../CanvasWorkbenchLayoutViewModel";

export type { CanvasWorkbenchDefaultPreview } from "../CanvasWorkbenchLayoutViewModel";

export type CanvasWorkbenchFixedTab =
  | "markdown"
  | "html"
  | "code"
  | "workspace"
  | "changes"
  | "outputs"
  | "logs";
export type CanvasWorkbenchNewToolTab =
  | "terminal"
  | "browser"
  | "project-files";
export type CanvasWorkbenchToolTabId = `${CanvasWorkbenchNewToolTab}:${number}`;
export type CanvasWorkbenchToolTab =
  | CanvasWorkbenchNewToolTab
  | CanvasWorkbenchToolTabId;
export type CanvasWorkbenchTab =
  | CanvasWorkbenchFixedTab
  | CanvasWorkbenchToolTab;
export type CanvasWorkbenchLayoutMode = "split" | "stacked";
export type CanvasWorkbenchMode = "default" | "coding";

export interface CanvasWorkbenchBrowserOpenRequest {
  requestKey: string | number;
  url?: string | null;
}

export interface CanvasWorkbenchOpenedToolTab {
  id: CanvasWorkbenchToolTabId;
  kind: CanvasWorkbenchNewToolTab;
  sequence: number;
  browserUrl?: string | null;
}

export type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export const WORKBENCH_SHELL_CLASSNAME =
  "border-l border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)]";

export const WORKBENCH_PANEL_CLASSNAME =
  "rounded-[10px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)]";

export const WORKBENCH_MUTED_PANEL_CLASSNAME =
  "rounded-[10px] border border-dashed border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-5 text-sm text-[color:var(--lime-text-muted)]";

export const WORKBENCH_GHOST_BUTTON_CLASSNAME =
  "border-[color:var(--lime-surface-border)] text-[color:var(--lime-text-muted)] hover:bg-[color:var(--lime-surface-soft)] hover:text-[color:var(--lime-text-strong)]";

export function downloadCanvasWorkbenchText(
  filename: string,
  content: string,
): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function resolveInitialCanvasWorkbenchTab(
  defaultPreview: CanvasWorkbenchDefaultPreview | null,
  changeView: { items?: unknown[] } | null | undefined,
  initialDocumentPath: string | null | undefined,
  shouldPreferSessionTab: boolean,
  shouldPreferReviewTab: boolean,
): CanvasWorkbenchTab {
  if (
    shouldPreferReviewTab ||
    (changeView?.items?.length || 0) > 0 ||
    defaultPreview?.previousContent
  ) {
    return "changes";
  }

  if (defaultPreview || initialDocumentPath) {
    return resolveCanvasWorkbenchPreferredPreviewModeFromPath(
      defaultPreview?.filePath ||
        defaultPreview?.absolutePath ||
        defaultPreview?.title ||
        initialDocumentPath,
    );
  }

  return shouldPreferSessionTab ? "outputs" : "workspace";
}

export function translateCanvasWorkbenchText(
  t: CanvasWorkbenchTranslation,
  key: string,
  options?: Record<string, unknown>,
): string {
  return t(key, options);
}

export function isCanvasWorkbenchToolTab(
  tab: CanvasWorkbenchTab,
): tab is CanvasWorkbenchToolTab {
  return resolveCanvasWorkbenchToolTabKind(tab) !== null;
}

export function createCanvasWorkbenchToolTabId(
  kind: CanvasWorkbenchNewToolTab,
  sequence: number,
): CanvasWorkbenchToolTabId {
  return `${kind}:${sequence}` as CanvasWorkbenchToolTabId;
}

export function resolveCanvasWorkbenchToolTabKind(
  tab: CanvasWorkbenchTab,
): CanvasWorkbenchNewToolTab | null {
  if (tab === "terminal" || tab === "browser" || tab === "project-files") {
    return tab;
  }
  const [kind] = tab.split(":");
  if (kind === "terminal" || kind === "browser" || kind === "project-files") {
    return kind;
  }
  return null;
}
