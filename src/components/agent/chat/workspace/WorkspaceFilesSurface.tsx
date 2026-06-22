import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export interface WorkspaceFilesSurfaceTarget {
  relativePath: string;
  title?: string | null;
}

interface WorkspaceFilesSurfaceProps {
  target?: WorkspaceFilesSurfaceTarget | null;
  onOpenResultFile?: (relativePath: string) => void | Promise<void>;
}

export function WorkspaceFilesSurface({
  target,
  onOpenResultFile,
}: WorkspaceFilesSurfaceProps) {
  const { t } = useTranslation("agent");
  const relativePath = target?.relativePath?.trim() || "";
  const title =
    target?.title?.trim() || relativePath.split("/").filter(Boolean).at(-1);
  const openFileLabel = t("agentChat.fileChangesSummary.openFile");

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-[color:var(--lime-surface)] text-[color:var(--lime-text)]"
      data-testid="workspace-files-surface"
    >
      <div className="shrink-0 border-b border-[color:var(--lime-surface-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
              {t("agentChat.canvasWorkbench.tabs.files")}
            </h2>
            {relativePath ? (
              <p
                className="mt-0.5 truncate text-xs text-[color:var(--lime-text-muted)]"
                title={relativePath}
              >
                {relativePath}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4">
        <div className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] p-3">
          <div className="min-w-0 text-sm font-medium text-[color:var(--lime-text-strong)]">
            {title || t("agentChat.canvasWorkbench.tabs.files")}
          </div>
          {relativePath ? (
            <div
              className="mt-1 break-all text-xs leading-5 text-[color:var(--lime-text-muted)]"
              data-testid="workspace-files-surface-path"
            >
              {relativePath}
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full justify-center"
          disabled={!relativePath || !onOpenResultFile}
          onClick={() => {
            if (relativePath) {
              void onOpenResultFile?.(relativePath);
            }
          }}
          data-testid="workspace-files-surface-open"
        >
          {openFileLabel}
        </Button>
      </div>
    </section>
  );
}
