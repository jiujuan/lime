import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Package, X } from "lucide-react";
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
  type LocalSkillPackageInspectionResult,
} from "@/lib/api/skills";
import { renderSkillMarkdown } from "./skillMarkdownPreview";
import {
  SkillFileContentPreview,
  SkillFileTree,
} from "./skillFilePreview";
import {
  getDefaultSkillFilePath,
  getSkillFilePreviewContent,
} from "./skillFilePreviewModel";

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
  const [selectedFilePath, setSelectedFilePath] = useState<string>("SKILL.md");
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
    setSelectedFilePath("SKILL.md");

    void skillsApi
      .inspectLocalSkillPackage(sourcePath, "lime")
      .then((result) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setInspectionResult(result);
        setSelectedFilePath(getDefaultSkillFilePath(result.files));
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
  const selectedFile = inspectionResult?.files.find(
    (entry) => entry.path === selectedFilePath,
  );
  const selectedFilePreview = getSkillFilePreviewContent(
    selectedFile,
    selectedFile?.path === "SKILL.md"
      ? inspectionResult?.inspection.content ?? null
      : null,
  );
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
        maxWidth="max-w-[1080px]"
      >
        <div
          className="flex max-h-[calc(100vh-3rem)] min-h-[620px] flex-col bg-[color:var(--lime-surface)]"
          data-testid="skill-package-install-dialog"
        >
          <div className="shrink-0 border-b border-[color:var(--lime-surface-border)] px-6 py-5 pr-16">
            <DialogHeader className="space-y-0 text-left">
              <div className="flex items-start justify-between gap-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-emerald-200 bg-emerald-50 text-emerald-800">
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
                    <p className="mt-2 line-clamp-1 text-[12px] leading-5 text-[color:var(--lime-text-muted)]">
                      {sourceName ||
                        (sourcePath ? basenameFromPath(sourcePath) : "")}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 text-sm font-semibold text-[color:var(--lime-text)] shadow-none hover:bg-[color:var(--lime-surface-hover)]"
                    disabled={installing}
                    onClick={() => onOpenChange(false)}
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    {t("skills.executionDialog.action.close")}
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
            </DialogHeader>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
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
                {!loading && inspectionResult?.files.length ? (
                  <SkillFileTree
                    files={inspectionResult.files}
                    selectedPath={selectedFilePath}
                    onSelect={setSelectedFilePath}
                    emptyLabel={t("skills.localPackage.files.empty")}
                  />
                ) : null}
                {!loading && inspectionResult?.files.length === 0 ? (
                  <SkillFileTree
                    files={[]}
                    selectedPath={selectedFilePath}
                    onSelect={setSelectedFilePath}
                    emptyLabel={t("skills.localPackage.files.empty")}
                  />
                ) : null}
              </div>
            </aside>

            <main className="flex min-h-0 flex-col overflow-hidden bg-[color:var(--lime-surface)]">
              {error ? (
                <div className="mx-6 mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {t("skills.localPackage.inspect.failed", {
                      message: error,
                    })}
                  </span>
                </div>
              ) : null}
              {validationErrors.length > 0 ? (
                <div className="mx-6 mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {t("skills.localPackage.inspect.validationFailed", {
                      message: validationErrors.join("; "),
                    })}
                  </span>
                </div>
              ) : null}

              <article className="flex min-h-0 flex-1 flex-col text-left">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--lime-surface-border)] px-6 py-3">
                  <h3 className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                    {t("skills.localPackage.preview.title")}
                  </h3>
                  {selectedFile?.path || inspectionResult?.directory ? (
                    <span className="rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--lime-text-muted)]">
                      {selectedFile?.path || inspectionResult?.directory}
                    </span>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  <div className="mx-auto max-w-[760px] pb-8">
                    {loading ? (
                      <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-10 text-center text-sm text-[color:var(--lime-text-muted)]">
                        {t("skills.localPackage.loading")}
                      </div>
                    ) : selectedFile ? (
                      <SkillFileContentPreview
                        content={selectedFilePreview}
                        selectedFile={selectedFile}
                        emptyLabel={t("skills.localPackage.preview.empty")}
                      />
                    ) : inspectionResult ? (
                      renderSkillMarkdown(inspectionResult.inspection.content)
                    ) : error ? null : (
                      <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-10 text-center text-sm text-[color:var(--lime-text-muted)]">
                        {t("skills.localPackage.preview.empty")}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            </main>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
