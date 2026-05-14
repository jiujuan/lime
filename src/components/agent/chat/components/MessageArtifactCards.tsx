import React from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Artifact } from "@/lib/artifact/types";
import { resolveArtifactProtocolFilePath } from "@/lib/artifact-protocol";
import {
  formatArtifactWritePhaseLabel,
  resolveArtifactPreviewText,
  resolveArtifactWritePhase,
} from "../utils/messageArtifacts";
import { resolveContentPostArtifactDisplayTitle } from "../utils/contentPostSkill";
import { isHiddenConversationArtifactPath } from "../utils/internalArtifactVisibility";
import { resolveKnowledgeSourceFromArtifacts } from "./messageListKnowledgeSource";

interface SaveMessageAsKnowledgeSource {
  messageId: string;
  content: string;
  sourceName?: string;
  description?: string | null;
}

interface MessageArtifactCardsProps {
  artifacts: Artifact[] | undefined;
  messageId: string;
  onArtifactClick?: (artifact: Artifact) => void;
  onSaveMessageAsKnowledge?: (source: SaveMessageAsKnowledgeSource) => void;
}

export function MessageArtifactCards({
  artifacts,
  messageId,
  onArtifactClick,
  onSaveMessageAsKnowledge,
}: MessageArtifactCardsProps) {
  const { t } = useTranslation("agent");
  const visibleArtifacts =
    artifacts?.filter(
      (artifact) =>
        !isHiddenConversationArtifactPath(
          resolveArtifactProtocolFilePath(artifact),
        ),
    ) || [];

  if (visibleArtifacts.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {visibleArtifacts.map((artifact) => {
        const filePath = resolveArtifactProtocolFilePath(artifact);
        const displayTitle = resolveContentPostArtifactDisplayTitle({
          title: artifact.title,
          filePath,
          metadata: artifact.meta,
        });
        const writePhase = resolveArtifactWritePhase(artifact);
        const statusLabel = formatArtifactWritePhaseLabel(writePhase);
        const previewText = resolveArtifactPreviewText(artifact, 180);
        const knowledgeSource = resolveKnowledgeSourceFromArtifacts([artifact]);
        const canSaveArtifactAsKnowledge = Boolean(
          onSaveMessageAsKnowledge && knowledgeSource,
        );

        return (
          <div
            key={artifact.id}
            className="flex w-full flex-col items-stretch gap-2 rounded-xl border border-sky-200/80 bg-sky-50 p-2 text-left shadow-sm shadow-sky-950/5 sm:flex-row"
          >
            <button
              type="button"
              onClick={() => onArtifactClick?.(artifact)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-white"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                {artifact.status === "streaming" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                    {t("agentChat.messageList.artifact.documentBadge")}
                  </span>
                  {knowledgeSource ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      {t("agentChat.messageList.artifact.saveableBadge")}
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-sm font-semibold text-slate-900">
                  {displayTitle}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {filePath}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500">
                    {statusLabel}
                  </span>
                  {previewText ? (
                    <span className="line-clamp-1 text-xs text-slate-600">
                      {previewText}
                    </span>
                  ) : artifact.status === "streaming" ? (
                    <span className="text-xs text-slate-500">
                      {t("agentChat.messageList.artifact.streaming")}
                    </span>
                  ) : null}
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>
            {canSaveArtifactAsKnowledge ? (
              <button
                type="button"
                onClick={() =>
                  onSaveMessageAsKnowledge?.({
                    messageId,
                    content: knowledgeSource?.content || artifact.content,
                    sourceName: knowledgeSource?.sourceName,
                    description: knowledgeSource?.description,
                  })
                }
                className="flex shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100 sm:py-0"
              >
                {t("agentChat.messageList.artifact.saveDocument")}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
