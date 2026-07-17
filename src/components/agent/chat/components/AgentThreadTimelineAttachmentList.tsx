import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AgentThreadItem } from "../types";
import type { ArtifactTimelineOpenTarget } from "../utils/artifactTimelineNavigation";
import { AgentThreadTimelineArtifactCard } from "./AgentThreadTimelineArtifactCard";

type FileArtifactItem = Extract<AgentThreadItem, { type: "file_artifact" }>;

interface AgentThreadTimelineAttachmentListProps {
  items: FileArtifactItem[];
  onFileClick?: (fileName: string, content: string) => void;
  onOpenArtifactFromTimeline?: (target: ArtifactTimelineOpenTarget) => void;
  sourceMessageId?: string;
  onSaveFileArtifactAsKnowledge?: (source: {
    messageId: string;
    content: string;
    sourceName?: string;
    description?: string | null;
  }) => void;
}

const COLLAPSED_ATTACHMENT_COUNT = 3;

export function AgentThreadTimelineAttachmentList({
  items,
  onFileClick,
  onOpenArtifactFromTimeline,
  sourceMessageId,
  onSaveFileArtifactAsKnowledge,
}: AgentThreadTimelineAttachmentListProps) {
  const { t } = useTranslation("agent");
  const [expanded, setExpanded] = useState(false);
  const canCollapse = items.length > COLLAPSED_ATTACHMENT_COUNT;
  const visibleItems = expanded
    ? items
    : items.slice(0, COLLAPSED_ATTACHMENT_COUNT);

  return (
    <div
      className="my-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white"
      data-testid="timeline-file-attachment-list"
    >
      <div className="divide-y divide-slate-100">
        {visibleItems.map((item) => (
          <AgentThreadTimelineArtifactCard
            key={item.id}
            item={item}
            groupedAttachment={true}
            onFileClick={onFileClick}
            onOpenArtifactFromTimeline={onOpenArtifactFromTimeline}
            sourceMessageId={sourceMessageId}
            onSaveFileArtifactAsKnowledge={onSaveFileArtifactAsKnowledge}
          />
        ))}
      </div>

      {canCollapse ? (
        <button
          type="button"
          data-testid="timeline-file-attachment-list-toggle"
          aria-expanded={expanded}
          className="flex w-full items-center justify-center gap-1 border-t border-slate-100 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded
            ? t("agentChat.messageList.fileArtifact.collapseFiles")
            : t("agentChat.messageList.fileArtifact.expandFiles", {
                count: items.length - COLLAPSED_ATTACHMENT_COUNT,
              })}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );
}
