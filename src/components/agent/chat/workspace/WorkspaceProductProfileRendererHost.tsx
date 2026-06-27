import { PackageCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkspaceProductProfileRendererHost } from "./workspaceProductProfileRendererHostModel";

export function WorkspaceProductProfileRendererHostCard({
  artifactIds,
  rendererHost,
}: {
  artifactIds: readonly string[];
  rendererHost: WorkspaceProductProfileRendererHost;
}) {
  const { t } = useTranslation("workspace");
  return (
    <div
      className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3"
      data-testid="workspace-product-profile-app-declared-renderer"
    >
      <div className="flex items-start gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]">
          <PackageCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-[color:var(--lime-text-strong)]">
            {t("workspace.productProfile.rendererHost.title")}
          </div>
          <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-[color:var(--lime-text-muted)]">
            {t("workspace.productProfile.rendererHost.detail", {
              count: artifactIds.length,
            })}
          </div>
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-xs">
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.plugin")}
          value={rendererHost.pluginId}
        />
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.renderer")}
          value={rendererHost.rendererKind}
        />
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.surface")}
          value={rendererHost.surfaceKind}
        />
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.pane")}
          value={rendererHost.paneKind}
        />
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.output")}
          value={rendererHost.outputArtifactKind}
        />
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.entry")}
          value={rendererHost.entry}
        />
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.actions")}
          value={rendererHost.actionKeys.join(", ")}
        />
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.execution")}
          value={t(
            rendererHost.policy.status === "blocked"
              ? "workspace.productProfile.rendererHost.executionBlocked"
              : "workspace.productProfile.rendererHost.executionPlaceholder",
          )}
        />
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.executionMode")}
          value={rendererHost.policy.executionMode}
        />
        <RendererHostMetaRow
          label={t(
            "workspace.productProfile.rendererHost.rendererExecutionModel",
          )}
          value={rendererHost.policy.rendererExecutionModel}
        />
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.entryLoadPolicy")}
          value={rendererHost.policy.entryLoadPolicy}
        />
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.reason")}
          value={rendererHost.policy.reasonCode}
        />
        <RendererHostMetaRow
          label={t("workspace.productProfile.rendererHost.allowedOutputs")}
          value={rendererHost.policy.allowedOutputArtifactKinds.join(", ")}
        />
      </dl>
    </div>
  );
}

function RendererHostMetaRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) {
    return null;
  }
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-3 py-2">
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
