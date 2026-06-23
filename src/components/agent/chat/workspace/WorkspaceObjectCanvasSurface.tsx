import { Loader2, Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkspaceObjectCanvasCandidate } from "./workspaceObjectCanvasModel";
import { buildWorkspaceObjectCanvasViewModel } from "./workspaceObjectCanvasViewModel";

interface WorkspaceObjectCanvasSurfaceProps {
  candidate?: WorkspaceObjectCanvasCandidate | null;
  onOpenBrowserRuntime?: () => void | Promise<void>;
}

export function WorkspaceObjectCanvasSurface({
  candidate,
  onOpenBrowserRuntime,
}: WorkspaceObjectCanvasSurfaceProps) {
  const { t } = useTranslation("workspace");
  const viewModel = buildWorkspaceObjectCanvasViewModel({
    candidate,
    hasOpenBrowserRuntimeAction: Boolean(onOpenBrowserRuntime),
  });
  const title =
    viewModel.object.title || t(viewModel.object.titleFallbackKey);

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-[color:var(--lime-surface)] text-[color:var(--lime-text)]"
      data-testid="workspace-object-canvas-surface"
    >
      <div className="shrink-0 border-b border-[color:var(--lime-surface-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]">
            {viewModel.object.launching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
              {title}
            </h2>
            <p className="mt-0.5 truncate text-xs text-[color:var(--lime-text-muted)]">
              {t(viewModel.object.stageLabelKey)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-4">
        <div className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-[color:var(--lime-text-strong)]">
                {t(viewModel.object.summaryTitleKey)}
              </div>
              <div className="mt-0.5 text-xs text-[color:var(--lime-text-muted)]">
                {t(viewModel.object.kindLabelKey)}
              </div>
            </div>
            <span
              className="shrink-0 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-2 py-1 text-[11px] font-medium text-[color:var(--lime-text-muted)]"
              data-testid="workspace-object-canvas-stage"
            >
              {t(viewModel.object.stageLabelKey)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[color:var(--lime-text-muted)]">
            {t(viewModel.object.summaryDetailKey)}
          </p>
        </div>

        <dl className="grid gap-2 text-xs">
          {viewModel.metadata.map((item) => (
            <ObjectCanvasMetaRow
              key={item.key}
              label={t(item.labelKey)}
              value={item.value}
            />
          ))}
        </dl>

        {viewModel.primaryAction && onOpenBrowserRuntime ? (
          <button
            type="button"
            className="mt-auto inline-flex h-9 w-full items-center justify-center rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm font-medium text-[color:var(--lime-text-strong)] transition hover:bg-[color:var(--lime-surface-hover)]"
            onClick={() => {
              void onOpenBrowserRuntime();
            }}
            data-testid="workspace-object-canvas-open-runtime"
          >
            {t(viewModel.primaryAction.labelKey)}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ObjectCanvasMetaRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2">
      <dt className="text-[color:var(--lime-text-muted)]">{label}</dt>
      <dd
        className="min-w-0 break-all text-[color:var(--lime-text-strong)]"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
