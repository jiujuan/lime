import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileText, Folder, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  skillsApi,
  type LocalSkillPackageFileEntry,
  type LocalSkillPackageInspectionResult,
} from "@/lib/api/skills";
import { cn } from "@/lib/utils";
import { renderSkillMarkdown } from "./skillMarkdownPreview";

interface SkillPackageInstallDialogProps {
  open: boolean;
  sourcePath: string | null;
  sourceName?: string | null;
  onOpenChange: (open: boolean) => void;
  onInstalled?: (directory: string) => void | Promise<void>;
}

function basenameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

function stripSkillPackageExtension(path: string): string {
  return path.replace(/\.(?:skill|skills)$/i, "");
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getEntryLabel(entry: LocalSkillPackageFileEntry): string {
  return entry.path.split("/").filter(Boolean).at(-1) || entry.path;
}

function getEntryDepth(entry: LocalSkillPackageFileEntry): number {
  return Math.max(0, entry.path.split("/").filter(Boolean).length - 1);
}

export function SkillPackageInstallDialog({
  open,
  sourcePath,
  sourceName,
  onOpenChange,
  onInstalled,
}: SkillPackageInstallDialogProps) {
  const { t } = useTranslation("agent");
  const [inspectionResult, setInspectionResult] =
    useState<LocalSkillPackageInspectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open || !sourcePath) {
      setInspectionResult(null);
      setLoading(false);
      setInstalling(false);
      setError(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setInspectionResult(null);
    setLoading(true);
    setError(null);

    void skillsApi
      .inspectLocalSkillPackage(sourcePath, "lime")
      .then((result) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setInspectionResult(result);
      })
      .catch((inspectError) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setError(
          inspectError instanceof Error
            ? inspectError.message
            : String(inspectError),
        );
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      });
  }, [open, sourcePath]);

  const packageName = useMemo(() => {
    if (inspectionResult?.directory) {
      return inspectionResult.directory;
    }
    if (sourceName?.trim()) {
      return stripSkillPackageExtension(sourceName.trim());
    }
    return sourcePath
      ? stripSkillPackageExtension(basenameFromPath(sourcePath))
      : "";
  }, [inspectionResult?.directory, sourceName, sourcePath]);

  const validationErrors =
    inspectionResult?.inspection.standardCompliance.validationErrors ?? [];
  const canInstall = Boolean(
    sourcePath && inspectionResult && validationErrors.length === 0 && !loading,
  );

  const handleInstall = useCallback(async () => {
    if (!sourcePath || !canInstall) {
      return;
    }

    setInstalling(true);
    try {
      const result = await skillsApi.installLocalSkillPackage(
        sourcePath,
        "lime",
      );
      toast.success(
        t("skills.localPackage.install.success", {
          directory: result.directory,
        }),
      );
      await onInstalled?.(result.directory);
      onOpenChange(false);
    } catch (installError) {
      toast.error(
        t("skills.localPackage.install.failed", {
          message:
            installError instanceof Error
              ? installError.message
              : String(installError),
        }),
      );
    } finally {
      setInstalling(false);
    }
  }, [canInstall, onInstalled, onOpenChange, sourcePath, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="lime-workbench-theme-scope lime-workbench-surface-scope overflow-hidden rounded-[18px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-0 text-[color:var(--lime-text)]"
        maxWidth="max-w-[960px]"
      >
        <div
          className="flex max-h-[calc(100vh-3rem)] min-h-[580px] flex-col bg-[color:var(--lime-surface)]"
          data-testid="skill-package-install-dialog"
        >
          <div className="shrink-0 border-b border-[color:var(--lime-surface-border)] px-6 py-5 pr-14">
            <DialogHeader className="space-y-0 text-left">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-amber-200 bg-amber-50 text-amber-800">
                  <Package className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="line-clamp-1 text-[22px] font-semibold leading-7 text-[color:var(--lime-text-strong)]">
                    {t("skills.localPackage.dialog.title", {
                      name:
                        packageName ||
                        t("skills.localPackage.dialog.fallbackName"),
                    })}
                  </DialogTitle>
                  <p className="mt-1 line-clamp-1 text-[13px] leading-5 text-[color:var(--lime-text-muted)]">
                    {t("skills.localPackage.dialog.subtitle")}
                  </p>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
            <aside className="min-h-0 border-r border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)]">
              <div className="border-b border-[color:var(--lime-surface-border)] px-4 py-3">
                <div className="text-[12px] font-semibold text-[color:var(--lime-text-strong)]">
                  {t("skills.localPackage.files.title")}
                </div>
                <div className="mt-1 truncate text-[11px] text-[color:var(--lime-text-muted)]">
                  {sourceName ||
                    (sourcePath ? basenameFromPath(sourcePath) : "")}
                </div>
              </div>
              <div className="max-h-full min-h-0 overflow-y-auto p-2">
                {loading ? (
                  <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-6 text-center text-sm text-[color:var(--lime-text-muted)]">
                    {t("skills.localPackage.loading")}
                  </div>
                ) : null}
                {!loading && inspectionResult?.files.length === 0 ? (
                  <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-6 text-center text-sm text-[color:var(--lime-text-muted)]">
                    {t("skills.localPackage.files.empty")}
                  </div>
                ) : null}
                {!loading && inspectionResult?.files.length ? (
                  <div className="space-y-1">
                    {inspectionResult.files.map((entry) => {
                      const EntryIcon = entry.isDirectory ? Folder : FileText;
                      const depth = getEntryDepth(entry);
                      return (
                        <div
                          key={`${entry.isDirectory ? "dir" : "file"}:${entry.path}`}
                          className={cn(
                            "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-[12px]",
                            entry.path === "SKILL.md"
                              ? "border border-amber-200 bg-amber-50 text-amber-900"
                              : "text-[color:var(--lime-text)]",
                          )}
                          style={{ paddingLeft: `${8 + depth * 14}px` }}
                        >
                          <EntryIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">
                            {getEntryLabel(entry)}
                          </span>
                          {!entry.isDirectory && entry.size > 0 ? (
                            <span className="shrink-0 text-[10px] text-[color:var(--lime-text-muted)]">
                              {formatFileSize(entry.size)}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </aside>

            <main className="min-h-0 overflow-y-auto px-6 py-5">
              {error ? (
                <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {t("skills.localPackage.inspect.failed", {
                      message: error,
                    })}
                  </span>
                </div>
              ) : null}
              {validationErrors.length > 0 ? (
                <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {t("skills.localPackage.inspect.validationFailed", {
                      message: validationErrors.join("; "),
                    })}
                  </span>
                </div>
              ) : null}

              <article className="mx-auto max-w-[720px] pb-8 text-left">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                    {t("skills.localPackage.preview.title")}
                  </h3>
                  {inspectionResult?.directory ? (
                    <span className="rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--lime-text-muted)]">
                      {inspectionResult.directory}
                    </span>
                  ) : null}
                </div>
                {loading ? (
                  <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-10 text-center text-sm text-[color:var(--lime-text-muted)]">
                    {t("skills.localPackage.loading")}
                  </div>
                ) : inspectionResult ? (
                  renderSkillMarkdown(inspectionResult.inspection.content)
                ) : error ? null : (
                  <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-10 text-center text-sm text-[color:var(--lime-text-muted)]">
                    {t("skills.localPackage.preview.empty")}
                  </div>
                )}
              </article>
            </main>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-6 py-4">
            <p className="min-w-0 truncate text-[12px] text-[color:var(--lime-text-muted)]">
              {t("skills.localPackage.install.destination")}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-full border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-5 text-sm font-semibold text-[color:var(--lime-text)] shadow-none hover:bg-[color:var(--lime-surface-hover)]"
                disabled={installing}
                onClick={() => onOpenChange(false)}
              >
                {t("skills.localPackage.action.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-full bg-[color:var(--lime-text-strong)] px-5 text-sm font-semibold text-[color:var(--lime-surface)] shadow-none hover:opacity-90"
                disabled={!canInstall || installing}
                onClick={() => void handleInstall()}
              >
                {installing
                  ? t("skills.localPackage.action.installing")
                  : t("skills.localPackage.action.install")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
