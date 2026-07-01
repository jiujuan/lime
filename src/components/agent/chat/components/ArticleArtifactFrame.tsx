import { useTranslation } from "react-i18next";
import { ChevronRight, FileText, Loader2 } from "lucide-react";
import type { ArtifactFrameRendererProps } from "./artifactFrameRegistry";
import { resolveArticleArtifactFrameModel } from "./articleArtifactProjection";
import { MarkdownRenderer } from "./MarkdownRenderer";

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

  const isStreaming = artifact.status === "streaming";
  const documentTitlePrefix = dynamicT(
    isStreaming
      ? "agentChat.messageList.articleArtifact.documentCreatingPrefix"
      : "agentChat.messageList.articleArtifact.documentCreatedPrefix",
  );

  return (
    <section
      data-artifact-id={artifact.id}
      data-frame-kind={model.renderer}
      data-testid="article-artifact-frame"
      className="w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm shadow-slate-950/5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-200 bg-white px-3 py-3">
        <button
          type="button"
          onClick={() => onArtifactClick?.(artifact)}
          className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2 rounded-lg text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
          aria-label={dynamicT(
            "agentChat.messageList.articleArtifact.openDocumentAria",
            { title: model.title },
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-xs font-medium leading-5 text-slate-500">
                {documentTitlePrefix}
              </span>
              <span className="truncate text-[13px] font-semibold leading-5 text-slate-950">
                {model.title}
              </span>
              {isStreaming ? (
                <span className="inline-flex rounded-md border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                  {dynamicT("agentChat.messageList.artifactFrame.streaming")}
                </span>
              ) : null}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onArtifactClick?.(artifact)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
        >
          {dynamicT("agentChat.messageList.articleArtifact.openDocument")}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="bg-white">
        <div
          className="max-h-[520px] min-h-[180px] overflow-y-auto px-4 py-4"
          data-testid="article-artifact-frame-body"
        >
          <div
            className="article-artifact-frame-markdown text-sm leading-7 text-slate-800"
            data-testid="article-artifact-frame-markdown"
          >
            <MarkdownRenderer
              content={model.markdown}
              isStreaming={isStreaming}
              renderMode="light"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
