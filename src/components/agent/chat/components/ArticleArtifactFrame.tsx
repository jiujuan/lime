import React from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  FileText,
  ImagePlus,
  ListChecks,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { ArtifactFrameRendererProps } from "./artifactFrameRegistry";
import { resolveArticleArtifactFrameModel } from "./articleArtifactProjection";

type AgentDynamicTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export function ArticleArtifactFrame({
  artifact,
  onArtifactClick,
}: ArtifactFrameRendererProps) {
  const { t } = useTranslation("agent");
  const dynamicT = t as AgentDynamicTranslation;
  const model = resolveArticleArtifactFrameModel(artifact);
  if (!model) {
    return null;
  }

  const processSteps = [
    model.researchRoundCount > 0
      ? {
          key: "research",
          icon: <Search className="h-3.5 w-3.5" />,
          label: dynamicT(
            "agentChat.messageList.articleArtifact.process.research",
            { count: model.researchRoundCount },
          ),
        }
      : null,
    model.outlineSectionCount > 0
      ? {
          key: "outline",
          icon: <ListChecks className="h-3.5 w-3.5" />,
          label: dynamicT(
            "agentChat.messageList.articleArtifact.process.outline",
            { count: model.outlineSectionCount },
          ),
        }
      : null,
    model.imageSlotCount > 0
      ? {
          key: "images",
          icon: <ImagePlus className="h-3.5 w-3.5" />,
          label: dynamicT("agentChat.messageList.articleArtifact.process.images", {
            count: model.imageSlotCount,
          }),
        }
      : null,
    model.sourceCount > 0
      ? {
          key: "sources",
          icon: <ShieldCheck className="h-3.5 w-3.5" />,
          label: dynamicT(
            "agentChat.messageList.articleArtifact.process.sources",
            { count: model.sourceCount },
          ),
        }
      : null,
  ].filter(
    (
      item,
    ): item is {
      key: string;
      icon: React.ReactElement;
      label: string;
    } => item !== null,
  );

  const facts = [
    model.researchRoundCount > 0
      ? dynamicT("agentChat.messageList.articleArtifact.fact.researchRounds", {
          count: model.researchRoundCount,
        })
      : null,
    model.outlineSectionCount > 0
      ? dynamicT("agentChat.messageList.articleArtifact.fact.outlineSections", {
          count: model.outlineSectionCount,
        })
      : null,
    model.imageSlotCount > 0
      ? dynamicT("agentChat.messageList.articleArtifact.fact.imageSlots", {
          count: model.imageSlotCount,
        })
      : null,
    model.sourceCount > 0
      ? dynamicT("agentChat.messageList.articleArtifact.fact.sources", {
          count: model.sourceCount,
        })
      : null,
  ].filter((item): item is string => Boolean(item));
  const isStreaming = artifact.status === "streaming";

  return (
    <section
      data-artifact-id={artifact.id}
      data-frame-kind={model.renderer}
      data-testid="article-artifact-frame"
      className="w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm shadow-slate-950/5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-3">
        <button
          type="button"
          onClick={() => onArtifactClick?.(artifact)}
          className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg text-left transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-slate-300"
          aria-label={dynamicT(
            "agentChat.messageList.artifactFrame.openAria",
            { title: model.title },
          )}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-100 bg-sky-50 text-sky-700">
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="mb-1 flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded-md border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                {dynamicT("agentChat.messageList.articleArtifact.badge")}
              </span>
              <span className="inline-flex rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                {dynamicT("agentChat.messageList.articleArtifact.bodyLabel")}
              </span>
              {isStreaming ? (
                <span className="inline-flex rounded-md border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                  {dynamicT("agentChat.messageList.artifactFrame.streaming")}
                </span>
              ) : null}
            </span>
            <span className="block truncate text-[14px] font-semibold leading-5 text-slate-950">
              {model.title}
            </span>
            {model.summary ? (
              <span className="mt-0.5 block truncate text-xs leading-5 text-slate-500">
                {model.summary}
              </span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onArtifactClick?.(artifact)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
        >
          {dynamicT("agentChat.messageList.artifactFrame.open")}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {processSteps.length > 0 ? (
        <div
          className="grid gap-1.5 border-b border-slate-100 bg-white px-3 py-3 sm:grid-cols-2"
          data-testid="article-artifact-frame-process"
        >
          {processSteps.map((step) => (
            <div
              key={step.key}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700">
                {step.icon}
              </span>
              <span className="truncate text-xs font-medium text-slate-700">
                {step.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
          <span className="text-xs font-semibold text-slate-700">
            {dynamicT("agentChat.messageList.articleArtifact.bodyTitle")}
          </span>
          {isStreaming ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              {dynamicT("agentChat.messageList.artifactFrame.streaming")}
            </span>
          ) : null}
        </div>
        <div
          className="max-h-[560px] overflow-auto px-5 py-5"
          data-testid="article-artifact-frame-body"
        >
          <div
            className="prose prose-slate max-w-none text-sm leading-7 prose-headings:font-semibold prose-headings:tracking-normal prose-headings:text-slate-950 prose-p:text-slate-700 prose-li:text-slate-700"
            data-testid="article-artifact-renderer"
          >
            <MarkdownRenderer
              content={model.markdown}
              isStreaming={isStreaming}
              readOnlyA2UI
              renderA2UIInline={false}
              renderMode="light"
              showBlockActions={false}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2">
        {facts.length > 0 ? (
          <div
            className="flex min-w-0 flex-wrap gap-1.5"
            data-testid="article-artifact-frame-facts"
          >
            {facts.map((fact) => (
              <span
                key={fact}
                className="inline-flex rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600"
              >
                {fact}
              </span>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => onArtifactClick?.(artifact)}
          className="ml-auto inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          {dynamicT("agentChat.messageList.articleArtifact.openEditor")}
        </button>
      </div>
    </section>
  );
}
