import React from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import type { TFunction } from "i18next";
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
        const previewText =
          resolveProductProfileCardPreviewText(artifact, t) ??
          resolveArtifactPreviewText(artifact, 180);
        const knowledgeSource = resolveKnowledgeSourceFromArtifacts([artifact]);
        const canSaveArtifactAsKnowledge = Boolean(
          onSaveMessageAsKnowledge && knowledgeSource,
        );

        return (
          <div
            key={artifact.id}
            data-testid="message-artifact-card"
            className="flex w-full flex-col items-stretch gap-2 rounded-lg border border-slate-200 bg-white p-2 text-left shadow-sm shadow-slate-950/5 sm:flex-row"
          >
            <button
              type="button"
              onClick={() => onArtifactClick?.(artifact)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-slate-50"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                {artifact.status === "streaming" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                    {t("agentChat.messageList.artifact.documentBadge")}
                  </span>
                  {knowledgeSource ? (
                    <span className="inline-flex rounded-md border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                      {t("agentChat.messageList.artifact.saveableBadge")}
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-[13px] font-semibold leading-5 text-slate-900">
                  {displayTitle}
                </div>
                <div className="truncate font-mono text-[11px] leading-4 text-slate-500">
                  {filePath}
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <span className="inline-flex shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500">
                    {statusLabel}
                  </span>
                  {previewText ? (
                    <span className="min-w-0 truncate text-xs text-slate-600">
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
                className="flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-white sm:py-0"
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

interface ProductProfileCardPreviewFacts {
  layout?: string | null;
  summary?: string | null;
  counts?: Record<string, unknown> | null;
}

type ProductProfileGeneratedLayoutKey =
  | "briefForm"
  | "document"
  | "imageGrid"
  | "storyboard"
  | "checklist"
  | "generic";

type ProductProfileMetricKey =
  | "researchRounds"
  | "outlineSections"
  | "citations"
  | "imageSlots"
  | "reviewNotes"
  | "storyboardScenes"
  | "checklistItems"
  | "images"
  | "briefFields"
  | "artifacts";

function resolveProductProfileCardPreviewText(
  artifact: Artifact,
  t: TFunction<"agent">,
): string | undefined {
  if (artifact.meta.openedFrom !== "right_surface_product_profile") {
    return undefined;
  }
  const facts = readProductProfileCardPreviewFacts(
    artifact.meta.productProfileCardPreview,
  );
  if (!facts) {
    return undefined;
  }
  const parts: string[] = [];
  if (facts.summary) {
    parts.push(facts.summary);
  }
  const counts = facts.counts ?? {};

  const metricParts = [
    countMetricText(t, "researchRounds", counts.researchRounds),
    countMetricText(t, "outlineSections", counts.outlineSections),
    countMetricText(t, "citations", counts.citations),
    countMetricText(t, "imageSlots", counts.imageSlots),
    countMetricText(t, "reviewNotes", counts.reviewNotes),
    countMetricText(t, "storyboardScenes", counts.storyboardScenes),
    countMetricText(t, "checklistItems", counts.checklistItems),
    countMetricText(t, "images", counts.images),
    countMetricText(t, "briefFields", counts.briefFields),
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0 && metricParts.length === 0) {
    parts.push(productProfileGeneratedText(t, layoutKey(facts.layout)));
  }
  parts.push(...metricParts);
  const artifactsText = countMetricText(t, "artifacts", counts.artifacts);
  if (artifactsText) {
    parts.push(artifactsText);
  }
  return parts.slice(0, 4).join(" · ") || undefined;
}

function readProductProfileCardPreviewFacts(
  value: unknown,
): ProductProfileCardPreviewFacts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const counts =
    record.counts && typeof record.counts === "object"
      ? (record.counts as Record<string, unknown>)
      : {};
  const summary =
    typeof record.summary === "string" && record.summary.trim()
      ? record.summary.trim()
      : null;
  return {
    layout: typeof record.layout === "string" ? record.layout : null,
    summary,
    counts,
  };
}

function countMetricText(
  t: TFunction<"agent">,
  key: ProductProfileMetricKey,
  value: unknown,
): string | null {
  const count = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (count <= 0) {
    return null;
  }
  return t(`agentChat.messageList.artifact.productProfile.metric.${key}`, {
    count,
  });
}

function productProfileGeneratedText(
  t: TFunction<"agent">,
  key: ProductProfileGeneratedLayoutKey,
): string {
  return t(`agentChat.messageList.artifact.productProfile.generated.${key}`);
}

function layoutKey(layout: unknown): ProductProfileGeneratedLayoutKey {
  switch (layout) {
    case "briefForm":
    case "document":
    case "imageGrid":
    case "storyboard":
    case "checklist":
      return layout;
    default:
      return "generic";
  }
}
