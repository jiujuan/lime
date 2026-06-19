import { AppWindow, Database, FileText, Link2 } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/lib/artifact/types";

export type PreviewSourceSummaryKind = "url" | "database_record" | "app";

interface PreviewSourceSummaryRendererProps {
  artifact: Artifact;
  sourceKind: PreviewSourceSummaryKind;
  tone?: "dark" | "light";
}

function readStringMeta(meta: Artifact["meta"], key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveSourceLabelKey(sourceKind: PreviewSourceSummaryKind): string {
  if (sourceKind === "url") {
    return "workspace.artifactRenderer.previewSource.source.url";
  }
  if (sourceKind === "app") {
    return "workspace.artifactRenderer.previewSource.source.app";
  }
  return "workspace.artifactRenderer.previewSource.source.databaseRecord";
}

function resolveDetailKey(sourceKind: PreviewSourceSummaryKind): string {
  if (sourceKind === "url") {
    return "workspace.artifactRenderer.previewSource.detail.url";
  }
  if (sourceKind === "app") {
    return "workspace.artifactRenderer.previewSource.detail.app";
  }
  return "workspace.artifactRenderer.previewSource.detail.databaseRecord";
}

function resolveIcon(sourceKind: PreviewSourceSummaryKind) {
  if (sourceKind === "url") {
    return Link2;
  }
  if (sourceKind === "app") {
    return AppWindow;
  }
  return Database;
}

function resolvePrimaryRef(artifact: Artifact): string {
  return (
    readStringMeta(artifact.meta, "sourceRef") ||
    readStringMeta(artifact.meta, "sourcePath") ||
    readStringMeta(artifact.meta, "url") ||
    readStringMeta(artifact.meta, "filePath") ||
    artifact.title
  );
}

function resolveSecondaryRef(artifact: Artifact): string | null {
  const candidates = [
    readStringMeta(artifact.meta, "sourcePath"),
    readStringMeta(artifact.meta, "recordId"),
    readStringMeta(artifact.meta, "record_id"),
    readStringMeta(artifact.meta, "appId"),
    readStringMeta(artifact.meta, "app_id"),
  ];
  const primaryRef = resolvePrimaryRef(artifact);
  return candidates.find((candidate) => candidate && candidate !== primaryRef) ?? null;
}

export const PreviewSourceSummaryRenderer = memo(
  function PreviewSourceSummaryRenderer({
    artifact,
    sourceKind,
    tone = "dark",
  }: PreviewSourceSummaryRendererProps) {
    const { t } = useTranslation("workspace");
    const isLight = tone === "light";
    const Icon = resolveIcon(sourceKind);
    const contentKind = readStringMeta(artifact.meta, "contentKind");
    const primaryRef = resolvePrimaryRef(artifact);
    const secondaryRef = resolveSecondaryRef(artifact);
    const summary = artifact.content.trim();

    return (
      <div
        data-testid="preview-source-summary-renderer"
        data-preview-source={sourceKind}
        data-preview-content-kind={contentKind || undefined}
        className={cn(
          "flex h-full min-h-[320px] flex-col px-6 py-6",
          isLight ? "bg-[#f5f6f8]" : "bg-[#1e2227]",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col rounded-[10px] border shadow-sm",
            isLight
              ? "border-slate-200 bg-white text-slate-600 shadow-slate-950/5"
              : "border-white/10 bg-white/5 text-gray-400 shadow-black/10",
          )}
        >
          <div
            className={cn(
              "border-b px-5 py-4",
              isLight ? "border-slate-200" : "border-white/10",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border",
                  isLight
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-sky-400/20 bg-sky-400/10 text-sky-200",
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-medium",
                      isLight
                        ? "border-slate-200 bg-slate-50 text-slate-600"
                        : "border-white/10 bg-white/10 text-gray-300",
                    )}
                  >
                    {t(resolveSourceLabelKey(sourceKind))}
                  </span>
                </div>
                <h2
                  className={cn(
                    "mt-2 truncate text-base font-semibold",
                    isLight ? "text-slate-950" : "text-white",
                  )}
                >
                  {artifact.title}
                </h2>
                <p
                  className={cn(
                    "mt-1 text-sm leading-6",
                    isLight ? "text-slate-500" : "text-gray-400",
                  )}
                >
                  {t(resolveDetailKey(sourceKind))}
                </p>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
            <div
              className={cn(
                "rounded-[10px] border border-dashed px-4 py-3 text-left text-xs leading-6",
                isLight
                  ? "border-slate-200 bg-slate-50 text-slate-500"
                  : "border-white/10 bg-black/20 text-gray-400",
              )}
            >
              <div
                className={cn(
                  "flex min-w-0 items-center gap-2 font-medium",
                  isLight ? "text-slate-700" : "text-gray-200",
                )}
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{primaryRef}</span>
              </div>
              {secondaryRef ? (
                <div className="mt-1 truncate">{secondaryRef}</div>
              ) : null}
            </div>

            {summary ? (
              <pre
                className={cn(
                  "mt-4 whitespace-pre-wrap rounded-[10px] border px-4 py-3 text-left text-sm leading-7",
                  isLight
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-white/10 bg-black/20 text-gray-200",
                )}
              >
                {summary}
              </pre>
            ) : (
              <div
                className={cn(
                  "mt-4 rounded-[10px] border px-4 py-5 text-center text-sm",
                  isLight
                    ? "border-slate-200 bg-white text-slate-500"
                    : "border-white/10 bg-black/20 text-gray-400",
                )}
              >
                {t("workspace.artifactRenderer.previewSource.empty")}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

PreviewSourceSummaryRenderer.displayName = "PreviewSourceSummaryRenderer";
