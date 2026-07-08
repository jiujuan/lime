import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Artifact } from "@/lib/artifact/types";
import {
  resolveMediaReferencePreviewPageIndex,
  resolveMediaReferencePreviewPageOpenRequest,
  type MediaReferencePreviewPageOpenRequest,
} from "./mediaReferencePreviewToolbarState";

interface MediaReferencePreviewPaginationActionsProps {
  artifact: Artifact;
  onOpenPage: (page: MediaReferencePreviewPageOpenRequest) => void;
}

function mediaPaginationButtonClassName(disabled: boolean): string {
  return [
    "flex h-7 w-7 items-center justify-center rounded transition-all",
    disabled
      ? "cursor-not-allowed text-muted-foreground/40"
      : "text-muted-foreground hover:bg-black/5 hover:text-foreground",
  ].join(" ");
}

export function MediaReferencePreviewPaginationActions({
  artifact,
  onOpenPage,
}: MediaReferencePreviewPaginationActionsProps) {
  const { t } = useTranslation("agent");
  if (artifact.meta.mediaPreviewRequiresPagination !== true) {
    return null;
  }

  const previousPage = resolveMediaReferencePreviewPageOpenRequest(
    artifact,
    "previous",
  );
  const nextPage = resolveMediaReferencePreviewPageOpenRequest(
    artifact,
    "next",
  );
  const previousLabel = t("agentChat.mediaReferencePreview.previousPage");
  const nextLabel = t("agentChat.mediaReferencePreview.nextPage");

  return (
    <div
      className="inline-flex items-center gap-1"
      data-testid="media-reference-preview-pagination-actions"
      data-media-preview-page-index={
        resolveMediaReferencePreviewPageIndex(artifact) ?? undefined
      }
    >
      <button
        type="button"
        className={mediaPaginationButtonClassName(!previousPage)}
        title={previousLabel}
        aria-label={previousLabel}
        disabled={!previousPage}
        onClick={() => {
          if (previousPage) {
            onOpenPage(previousPage);
          }
        }}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={mediaPaginationButtonClassName(!nextPage)}
        title={nextLabel}
        aria-label={nextLabel}
        disabled={!nextPage}
        onClick={() => {
          if (nextPage) {
            onOpenPage(nextPage);
          }
        }}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
