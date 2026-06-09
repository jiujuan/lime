import React, { memo, useMemo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { FileStack, Flag, Info, Link2 } from "lucide-react";
import {
  interceptHttpExternalLinkClick,
  resolveHttpExternalHref,
} from "@/lib/markdown/externalLinks";
import { cn } from "@/lib/utils";
import type {
  ArtifactDocumentBlock,
  ArtifactDocumentSource,
  ArtifactDocumentV1,
} from "@/lib/artifact-document";
import { ArtifactDocumentBlockRenderer } from "./artifact-document/ArtifactDocumentBlocks";
import {
  normalizeStringArray,
  normalizeText,
} from "./artifact-document/blockUtils";

interface ArtifactDocumentRendererProps {
  document: ArtifactDocumentV1;
  tone?: "dark" | "light";
}

interface ResolvedDocumentStat {
  label: string;
  value: string;
  detail: string;
}

type WorkspaceT = TFunction<"workspace", undefined>;

function getHttpExternalLinkProps(url: string) {
  const externalUrl = resolveHttpExternalHref(url);
  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    interceptHttpExternalLinkClick(event, url);
  };

  return {
    target: externalUrl ? undefined : "_blank",
    rel: "noreferrer noopener",
    onClick,
    onAuxClick: onClick,
  };
}

function getDocumentKindLabel(
  kind: ArtifactDocumentV1["kind"],
  t: WorkspaceT,
): string {
  switch (kind) {
    case "report":
      return t("workspace.artifactDocument.kind.report");
    case "roadmap":
      return t("workspace.artifactDocument.kind.roadmap");
    case "prd":
      return t("workspace.artifactDocument.kind.prd");
    case "brief":
      return t("workspace.artifactDocument.kind.brief");
    case "analysis":
      return t("workspace.artifactDocument.kind.analysis");
    case "comparison":
      return t("workspace.artifactDocument.kind.comparison");
    case "plan":
      return t("workspace.artifactDocument.kind.plan");
    case "table_report":
      return t("workspace.artifactDocument.kind.tableReport");
    default:
      return kind;
  }
}

function getDocumentStatusLabel(
  status: ArtifactDocumentV1["status"],
  t: WorkspaceT,
): string {
  switch (status) {
    case "draft":
      return t("workspace.artifactDocument.status.draft");
    case "streaming":
      return t("workspace.artifactDocument.status.streaming");
    case "ready":
      return t("workspace.artifactDocument.status.ready");
    case "failed":
      return t("workspace.artifactDocument.status.failed");
    case "archived":
      return t("workspace.artifactDocument.status.archived");
    default:
      return status;
  }
}

function getDocumentThemeLabel(
  theme: unknown,
  t: WorkspaceT,
): string | undefined {
  const normalizedTheme = normalizeText(theme);
  if (!normalizedTheme) {
    return undefined;
  }

  switch (normalizedTheme) {
    case "general":
      return t("workspace.artifactDocument.theme.general");
    case "blog":
      return t("workspace.artifactDocument.theme.blog");
    case "persistent":
      return t("workspace.artifactDocument.theme.persistent");
    case "temporary":
      return t("workspace.artifactDocument.theme.temporary");
    default:
      return t("workspace.artifactDocument.theme.general");
  }
}

function resolveStatusBadgeClasses(
  tone: "dark" | "light",
  status: ArtifactDocumentV1["status"],
): string {
  switch (status) {
    case "ready":
      return tone === "light"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "failed":
      return tone === "light"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "archived":
      return tone === "light"
        ? "border-slate-200 bg-slate-100 text-slate-600"
        : "border-white/10 bg-white/5 text-slate-300";
    case "streaming":
      return tone === "light"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-sky-500/30 bg-sky-500/10 text-sky-100";
    default:
      return tone === "light"
        ? "border-slate-200 bg-slate-50 text-slate-600"
        : "border-white/10 bg-white/5 text-slate-300";
  }
}

function resolveDocumentStats(
  document: ArtifactDocumentV1,
  visibleBlocks: ArtifactDocumentBlock[],
  t: WorkspaceT,
): ResolvedDocumentStat[] {
  const sectionCount = visibleBlocks.filter(
    (block) => block.type === "section_header",
  ).length;
  const highlightCount = visibleBlocks.reduce((count, block) => {
    if (block.type === "hero_summary") {
      return count + normalizeStringArray(block.highlights).length;
    }
    if (block.type === "key_points") {
      return count + normalizeStringArray(block.items).length;
    }
    return count;
  }, 0);

  return [
    {
      label: t("workspace.artifactDocument.stats.blocks.label"),
      value: String(visibleBlocks.length),
      detail:
        visibleBlocks.length > 0
          ? t("workspace.artifactDocument.stats.blocks.detail.visible")
          : t("workspace.artifactDocument.stats.blocks.detail.empty"),
    },
    {
      label: t("workspace.artifactDocument.stats.sections.label"),
      value: String(sectionCount),
      detail:
        sectionCount > 0
          ? t("workspace.artifactDocument.stats.sections.detail.visible")
          : t("workspace.artifactDocument.stats.sections.detail.empty"),
    },
    {
      label: t("workspace.artifactDocument.stats.sources.label"),
      value: String(document.sources.length),
      detail:
        document.sources.length > 0
          ? t("workspace.artifactDocument.stats.sources.detail.visible")
          : t("workspace.artifactDocument.stats.sources.detail.empty"),
    },
    {
      label: t("workspace.artifactDocument.stats.highlights.label"),
      value: String(highlightCount),
      detail:
        highlightCount > 0
          ? t("workspace.artifactDocument.stats.highlights.detail.visible")
          : t("workspace.artifactDocument.stats.highlights.detail.empty"),
    },
  ];
}

const SourceAppendix = memo(function SourceAppendix({
  sources,
  tone = "light",
}: {
  sources: ArtifactDocumentSource[];
  tone?: "dark" | "light";
}) {
  const { t } = useTranslation("workspace");

  if (sources.length === 0) {
    return null;
  }

  return (
    <section
      className={cn(
        "rounded-3xl border px-5 py-5",
        tone === "light"
          ? "border-slate-200 bg-slate-50"
          : "border-white/10 bg-white/5",
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <FileStack className="h-4 w-4 text-slate-400" />
        <h3
          className={cn(
            "text-lg font-semibold",
            tone === "light" ? "text-slate-900" : "text-white",
          )}
        >
          {t("workspace.artifactDocument.sourceAppendix.title")}
        </h3>
      </div>
      <div className="space-y-3">
        {sources.map((source) => (
          <div
            key={source.id}
            className={cn(
              "rounded-2xl border px-4 py-3",
              tone === "light"
                ? "border-slate-200 bg-white"
                : "border-white/10 bg-black/20",
            )}
          >
            <div
              className={cn(
                "text-sm font-medium",
                tone === "light" ? "text-slate-900" : "text-white",
              )}
            >
              {source.label ||
                source.locator?.url ||
                source.locator?.path ||
                source.id}
            </div>
            {source.snippet ? (
              <div
                className={cn(
                  "mt-1 text-sm leading-6",
                  tone === "light" ? "text-slate-600" : "text-slate-300",
                )}
              >
                {source.snippet}
              </div>
            ) : null}
            {source.locator?.url ? (
              <a
                href={source.locator.url}
                {...getHttpExternalLinkProps(source.locator.url)}
                className="mt-2 inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700"
              >
                <Link2 className="h-3.5 w-3.5" />
                <span className="truncate">{source.locator.url}</span>
              </a>
            ) : null}
            {source.locator?.path ? (
              <div className="mt-2 text-sm text-slate-500">
                {source.locator.path}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
});

export const ArtifactDocumentRenderer: React.FC<ArtifactDocumentRendererProps> =
  memo(({ document, tone = "light" }) => {
    const { t } = useTranslation("workspace");
    const visibleBlocks = useMemo(
      () => document.blocks.filter((block) => block.hidden !== true),
      [document.blocks],
    );
    const sourceLookup = useMemo(
      () => new Map(document.sources.map((source) => [source.id, source])),
      [document.sources],
    );
    const documentStats = useMemo(
      () => resolveDocumentStats(document, visibleBlocks, t),
      [document, t, visibleBlocks],
    );
    const themeLabel = useMemo(
      () => getDocumentThemeLabel(document.metadata.theme, t),
      [document.metadata.theme, t],
    );

    return (
      <div
        data-testid="artifact-document-renderer"
        className={cn(
          "h-full overflow-auto px-6 py-7",
          tone === "light" ? "bg-slate-50" : "bg-[#1e2227]",
        )}
      >
        <article className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
          <header
            className={cn(
              "rounded-[32px] border px-6 py-6 shadow-sm",
              tone === "light"
                ? "border-slate-200 bg-white"
                : "border-white/10 bg-white/5",
            )}
          >
            <div className="grid gap-5 xl:grid-cols-[1.32fr_0.92fr]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    {getDocumentKindLabel(document.kind, t)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
                      resolveStatusBadgeClasses(tone, document.status),
                    )}
                  >
                    {getDocumentStatusLabel(document.status, t)}
                  </span>
                  {themeLabel ? (
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                      {t("workspace.artifactDocument.meta.theme", {
                        theme: themeLabel,
                      })}
                    </span>
                  ) : null}
                </div>
                <h1
                  className={cn(
                    "mt-4 text-[2.2rem] font-semibold tracking-tight",
                    tone === "light" ? "text-slate-950" : "text-white",
                  )}
                >
                  {document.title}
                </h1>
                {document.summary ? (
                  <p
                    className={cn(
                      "mt-3 max-w-3xl text-[15px] leading-8",
                      tone === "light" ? "text-slate-600" : "text-slate-300",
                    )}
                  >
                    {document.summary}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-500">
                  {document.metadata.audience ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      <Flag className="h-3.5 w-3.5" />
                      {t("workspace.artifactDocument.meta.audience", {
                        audience: String(document.metadata.audience),
                      })}
                    </span>
                  ) : null}
                  {document.metadata.intent ? (
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      {t("workspace.artifactDocument.meta.intent", {
                        intent: String(document.metadata.intent),
                      })}
                    </span>
                  ) : null}
                  {normalizeText(document.language) ? (
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      {t("workspace.artifactDocument.meta.language", {
                        language: normalizeText(document.language),
                      })}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {documentStats.map((stat) => (
                  <div
                    key={stat.label}
                    className={cn(
                      "rounded-2xl border px-4 py-4",
                      tone === "light"
                        ? "border-slate-200 bg-slate-50"
                        : "border-white/10 bg-black/20",
                    )}
                  >
                    <div className="text-xs font-medium text-slate-500">
                      {stat.label}
                    </div>
                    <div
                      className={cn(
                        "mt-2 text-2xl font-semibold tracking-tight",
                        tone === "light" ? "text-slate-950" : "text-white",
                      )}
                    >
                      {stat.value}
                    </div>
                    <div
                      className={cn(
                        "mt-2 text-xs leading-5",
                        tone === "light" ? "text-slate-500" : "text-slate-300",
                      )}
                    >
                      {stat.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </header>

          {document.status === "failed" ? (
            <section
              className={cn(
                "rounded-2xl border px-5 py-4",
                tone === "light"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-100",
              )}
            >
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="text-sm leading-7">
                  {t("workspace.artifactDocument.failedNotice")}
                </div>
              </div>
            </section>
          ) : null}

          {visibleBlocks.map((block) => (
            <div
              key={block.id}
              id={`artifact-block-${block.id}`}
              data-artifact-block-id={block.id}
              data-artifact-block-type={block.type}
              className="scroll-mt-6"
            >
              <ArtifactDocumentBlockRenderer
                block={block}
                tone={tone}
                sourceLookup={sourceLookup}
              />
            </div>
          ))}

          <SourceAppendix sources={document.sources} tone={tone} />
        </article>
      </div>
    );
  });

ArtifactDocumentRenderer.displayName = "ArtifactDocumentRenderer";
