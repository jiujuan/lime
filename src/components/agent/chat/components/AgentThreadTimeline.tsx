import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  Clock3,
  ListChecks,
  Loader2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
  ConfirmResponse,
  SiteSavedContentTarget,
} from "../types";
import {
  buildAgentThreadDisplayModel,
  type AgentThreadOrderedBlock,
} from "../utils/agentThreadGrouping";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import { isActionRequestA2UICompatible } from "../utils/actionRequestA2UI";
import { resolveRuntimeAttachmentTaskDisplayName } from "../utils/runtimeAttachmentPlaceholder";
import { isHiddenConversationArtifactPath } from "../utils/internalArtifactVisibility";
import { parseAIResponse } from "@/components/workspace/a2ui/parser";
import type { A2UIResponse } from "@/components/workspace/a2ui/types";
import { TIMELINE_A2UI_TASK_CARD_PRESET } from "@/components/workspace/a2ui/taskCardPresets";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ActionRequestA2UIPreviewCard } from "./ActionRequestA2UIPreviewCard";
import { A2UITaskCard, A2UITaskLoadingCard } from "./A2UITaskCard";
import { ToolCallItem } from "./ToolCallDisplay";
import { DecisionPanel } from "./DecisionPanel";
import { AgentThreadTimelineArtifactCard } from "./AgentThreadTimelineArtifactCard";
import { AgentThreadTimelineFileChangesCard } from "./AgentThreadTimelineFileChangesCard";
import type { ArtifactTimelineOpenTarget } from "../utils/artifactTimelineNavigation";
import {
  shouldHideTurnSummaryFromConversation,
} from "../utils/turnSummaryPresentation";
import {
  buildTimelineBlockRenderPlan,
  resolveTimelineBlockEmphasis,
  resolveVisibleTimelineItems,
  type TimelineBlockEmphasis,
} from "./AgentThreadTimelineViewModel";
import {
  toActionRequired,
  toToolCallState,
  resolveStatusBadgeVariant,
  resolveItemStatusLabel,
  formatTimestamp,
  stringifyItemForDebug,
  resolveUserFacingErrorMessage,
  resolveThinkingDisplayText,
  resolveTurnSummaryDisplayText,
  extractCompactThinkingParts,
  isThinkingTimelineItem,
  resolveActiveBlockIndex,
  resolveFocusBlockIndex,
  resolveExpandedBlockIndexes,
  resolveBlockSummaryLines,
  resolveProcessMixLabel,
  isInternalThinkingPreviewLine,
  resolveThreadInlineStatusHint,
  resolvePendingRuntimeConfirmationPrompt,
  hasSubmittedRuntimeActionConfirmation,
} from "./timeline-utils";

interface AgentThreadTimelineProps {
  turn: AgentThreadTurn;
  items: AgentThreadItem[];
  threadRead?: AgentRuntimeThreadReadModel | null;
  actionRequests?: ActionRequired[];
  isCurrentTurn?: boolean;
  placement?: "leading" | "trailing" | "default";
  onFileClick?: (fileName: string, content: string) => void;
  onOpenArtifactFromTimeline?: (target: ArtifactTimelineOpenTarget) => void;
  sourceMessageId?: string;
  onSaveFileArtifactAsKnowledge?: (source: {
    messageId: string;
    content: string;
    sourceName?: string;
    description?: string | null;
  }) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
  onOpenSubagentSession?: (sessionId: string) => void;
  onPermissionResponse?: (response: ConfirmResponse) => void;
  focusedItemId?: string | null;
  focusRequestKey?: number;
  deferCompletedSingleDetails?: boolean;
  collapseInactiveDetails?: boolean;
}

function SurfaceCard({
  icon: Icon,
  title,
  badge,
  timestamp,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: React.ReactNode;
  timestamp?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-start gap-2.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm leading-6 text-slate-900">{title}</div>
            {badge ? <div>{badge}</div> : null}
            {timestamp ? (
              <div className="text-xs text-slate-400">{timestamp}</div>
            ) : null}
          </div>
          <div className="ml-0 mt-1.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ThinkingItemCard({
  item,
}: {
  item: Extract<AgentThreadItem, { type: "reasoning" | "turn_summary" }>;
}) {
  const { t } = useTranslation("agent");
  const displayText = useMemo(
    () =>
      item.type === "reasoning"
        ? resolveThinkingDisplayText(item)
        : resolveTurnSummaryDisplayText(item),
    [item],
  );
  const parsedContent = useMemo(
    () => parseAIResponse(displayText, false),
    [displayText],
  );
  const hasStructuredPreview =
    parsedContent.hasA2UI || parsedContent.hasPending;
  const shouldHideTurnSummaryContent =
    item.type === "turn_summary" &&
    !hasStructuredPreview &&
    shouldHideTurnSummaryFromConversation(item);

  const content = hasStructuredPreview ? (
    <div className="space-y-3">
      {parsedContent.parts.map((part, index) => {
        if (part.type === "a2ui" && typeof part.content !== "string") {
          const readonlyResponse: A2UIResponse = {
            ...part.content,
            submitAction: undefined,
          };

          return (
            <A2UITaskCard
              key={`timeline-a2ui-${index}`}
              response={readonlyResponse}
              compact={true}
              preview={true}
              preset={TIMELINE_A2UI_TASK_CARD_PRESET}
            />
          );
        }

        if (part.type === "pending_a2ui") {
          return (
            <A2UITaskLoadingCard
              key={`timeline-pending-a2ui-${index}`}
              compact={true}
              preset={TIMELINE_A2UI_TASK_CARD_PRESET}
              subtitle={t("agentChat.threadTimeline.pendingA2ui")}
            />
          );
        }

        const textContent =
          typeof part.content === "string" ? part.content.trim() : "";
        if (!textContent) {
          return null;
        }

        return (
          <MarkdownRenderer
            key={`timeline-text-${index}`}
            content={textContent}
          />
        );
      })}
    </div>
  ) : shouldHideTurnSummaryContent ? null : (
    <MarkdownRenderer content={displayText} />
  );
  const statusLabel =
    item.type === "turn_summary"
      ? item.status === "in_progress"
        ? "处理中"
        : "当前进展"
      : item.status === "in_progress"
        ? "思考中"
        : null;
  const ToneIcon =
    item.type === "turn_summary"
      ? item.status === "in_progress"
        ? Loader2
        : Clock3
      : item.status === "in_progress"
        ? Loader2
        : Sparkles;

  return (
    <div className="py-1.5">
      <div className="flex items-start gap-2.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
          <ToneIcon
            className={cn(
              "h-4 w-4",
              item.status === "in_progress" && "animate-spin text-sky-600",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          {statusLabel ? (
            <div className="mb-1 text-xs text-slate-500">{statusLabel}</div>
          ) : null}
          {content ? (
            <div className="text-sm leading-7 text-slate-800">{content}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ContextCompactionCard({
  item,
}: {
  item: Extract<AgentThreadItem, { type: "context_compaction" }>;
}) {
  const { t } = useTranslation("agent");
  const triggerLabel =
    item.trigger === "manual"
      ? "手动压缩"
      : item.trigger === "overflow"
        ? "超限恢复"
        : item.trigger === "auto"
          ? "自动压缩"
          : "上下文压缩";
  const title =
    item.stage === "completed" || item.status === "completed"
      ? "压了上下文"
      : "正在压上下文";
  const detail =
    item.detail?.trim() ||
    (item.stage === "completed" || item.status === "completed"
      ? "把前面的对话压成摘要了，后面接着做。"
      : "在把前面的对话压成摘要，马上继续。");

  return (
    <SurfaceCard
      icon={Sparkles}
      title={title}
      badge={<Badge variant="outline">{triggerLabel}</Badge>}
    >
      <div className="text-sm text-slate-500">{detail}</div>
      {item.status === "in_progress" ? (
        <div className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{t("agentChat.threadTimeline.compacting")}</span>
        </div>
      ) : null}
    </SurfaceCard>
  );
}

function InlinePlanBlock({
  content,
  isComplete,
}: {
  content: string;
  isComplete: boolean;
}) {
  if (!content.trim()) {
    return null;
  }

  return (
    <div className="py-1.5">
      <div className="flex items-start gap-2.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
          {isComplete ? (
            <ListChecks className="h-4 w-4" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-xs text-slate-500">
            {isComplete ? "定了这些步骤" : "还在排步骤"}
          </div>
          <div className="text-sm leading-7 text-slate-800">
            <MarkdownRenderer content={content} />
          </div>
        </div>
      </div>
    </div>
  );
}

function renderThinkingItemDetails(item: AgentThreadItem) {
  if (item.type === "plan") {
    return (
      <InlinePlanBlock
        content={item.text}
        isComplete={item.status !== "in_progress"}
      />
    );
  }

  if (item.type === "reasoning" || item.type === "turn_summary") {
    return <ThinkingItemCard item={item} />;
  }

  if (item.type === "context_compaction") {
    return <ContextCompactionCard item={item} />;
  }

  return null;
}

function GroupedThinkingRow({
  item,
  groupMarker = "·",
}: {
  item: Extract<
    AgentThreadItem,
    { type: "plan" | "reasoning" | "turn_summary" | "context_compaction" }
  >;
  groupMarker?: string;
}) {
  const compact = extractCompactThinkingParts(item);

  if (!compact) {
    return renderThinkingItemDetails(item);
  }

  const ToneIcon =
    item.type === "plan"
      ? item.status === "in_progress"
        ? Loader2
        : ListChecks
      : item.type === "turn_summary"
        ? item.status === "in_progress"
          ? Loader2
          : Clock3
        : item.status === "in_progress"
          ? Loader2
          : Sparkles;

  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="pt-0.5 font-mono text-xs text-slate-400">
        {groupMarker}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <ToneIcon
            className={cn(
              "mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400",
              item.status === "in_progress" && "animate-spin text-sky-600",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm leading-6 text-slate-700">
              {compact.title}
            </div>
            {compact.detail ? (
              <div className="mt-0.5 text-sm leading-6 text-slate-500">
                <MarkdownRenderer content={compact.detail} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderGroupItemDetails(
  item: AgentThreadItem,
  onFileClick?: (fileName: string, content: string) => void,
  onOpenArtifactFromTimeline?: (target: ArtifactTimelineOpenTarget) => void,
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void,
  onOpenSubagentSession?: (sessionId: string) => void,
  onPermissionResponse?: (response: ConfirmResponse) => void,
  options?: {
    groupedToolCall?: boolean;
    groupMarker?: string;
    openSubagentLabel?: string;
    sourceMessageId?: string;
    onSaveFileArtifactAsKnowledge?: (source: {
      messageId: string;
      content: string;
      sourceName?: string;
      description?: string | null;
    }) => void;
  },
) {
  const toolCall = toToolCallState(item);
  const actionRequest = toActionRequired(item);
  const timestamp = formatTimestamp(item.completed_at || item.updated_at);
  const resolveSubagentStatusLabel = (
    statusLabel: string | undefined,
    status: AgentThreadItem["status"],
  ): string => {
    const normalized = statusLabel?.trim().toLowerCase();
    switch (normalized) {
      case "queued":
        return "稍后开始";
      case "running":
        return "处理中";
      case "completed":
        return "已完成";
      case "failed":
        return "失败";
      case "aborted":
        return "已暂停";
      default:
        return statusLabel || resolveItemStatusLabel(status);
    }
  };

  if (actionRequest) {
    if (isActionRequestA2UICompatible(actionRequest)) {
      return (
        <ActionRequestA2UIPreviewCard
          request={actionRequest}
          compact={true}
          context="timeline"
        />
      );
    }

    return (
      <DecisionPanel
        request={actionRequest}
        onSubmit={(response) => onPermissionResponse?.(response)}
      />
    );
  }

  if (toolCall) {
    return (
      <ToolCallItem
        toolCall={toolCall}
        defaultExpanded={item.status !== "completed"}
        onFileClick={onFileClick}
        onOpenSavedSiteContent={onOpenSavedSiteContent}
        grouped={options?.groupedToolCall}
        groupMarker={options?.groupMarker}
      />
    );
  }

  if (item.type === "file_artifact") {
    if (isHiddenConversationArtifactPath(item.path)) {
      return null;
    }

    return (
      <AgentThreadTimelineArtifactCard
        item={item}
        timestamp={timestamp}
        onFileClick={onFileClick}
        onOpenArtifactFromTimeline={onOpenArtifactFromTimeline}
        sourceMessageId={options?.sourceMessageId}
        onSaveFileArtifactAsKnowledge={options?.onSaveFileArtifactAsKnowledge}
      />
    );
  }

  if (item.type === "subagent_activity") {
    const subagentSessionId = item.session_id?.trim();
    const displayTitle =
      resolveRuntimeAttachmentTaskDisplayName(item.title) || "子任务";

    return (
      <SurfaceCard
        icon={Bot}
        title={`子任务：${displayTitle}`}
        badge={
          <Badge variant={resolveStatusBadgeVariant(item.status)}>
            {resolveSubagentStatusLabel(item.status_label, item.status)}
          </Badge>
        }
        timestamp={timestamp}
      >
        {item.summary ? (
          <div className="text-sm text-muted-foreground">{item.summary}</div>
        ) : null}
        {item.role || item.model ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {item.role ? <Badge variant="outline">{item.role}</Badge> : null}
            {item.model ? <Badge variant="outline">{item.model}</Badge> : null}
          </div>
        ) : null}
        {subagentSessionId && onOpenSubagentSession ? (
          <div className="mt-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenSubagentSession(subagentSessionId)}
            >
              {options?.openSubagentLabel}
            </Button>
          </div>
        ) : null}
      </SurfaceCard>
    );
  }

  if (item.type === "warning" || item.type === "error") {
    const displayMessage =
      item.type === "error"
        ? resolveUserFacingErrorMessage(item.message)
        : item.message;
    return (
      <SurfaceCard
        icon={item.type === "warning" ? AlertTriangle : ShieldAlert}
        title={item.type === "warning" ? "收到提醒" : "碰到错误"}
        badge={
          <Badge variant={resolveStatusBadgeVariant(item.status)}>
            {item.type === "warning" ? item.code || "warning" : "失败"}
          </Badge>
        }
        timestamp={timestamp}
      >
        <div
          className={
            item.type === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {displayMessage}
        </div>
      </SurfaceCard>
    );
  }

  return (
    <div className="py-1.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{item.type}</span>
        <Badge
          variant={resolveStatusBadgeVariant(item.status)}
          className="ml-auto"
        >
          {resolveItemStatusLabel(item.status)}
        </Badge>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
        {stringifyItemForDebug(item)}
      </pre>
    </div>
  );
}

function renderTimelineItemDetails(
  item: AgentThreadItem,
  onFileClick?: (fileName: string, content: string) => void,
  onOpenArtifactFromTimeline?: (target: ArtifactTimelineOpenTarget) => void,
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void,
  onOpenSubagentSession?: (sessionId: string) => void,
  onPermissionResponse?: (response: ConfirmResponse) => void,
  options?: {
    groupedToolCall?: boolean;
    groupMarker?: string;
    openSubagentLabel?: string;
    sourceMessageId?: string;
    onSaveFileArtifactAsKnowledge?: (source: {
      messageId: string;
      content: string;
      sourceName?: string;
      description?: string | null;
    }) => void;
  },
) {
  if (isThinkingTimelineItem(item)) {
    if (options?.groupedToolCall) {
      return (
        <GroupedThinkingRow item={item} groupMarker={options.groupMarker} />
      );
    }
    return renderThinkingItemDetails(item);
  }

  return renderGroupItemDetails(
    item,
    onFileClick,
    onOpenArtifactFromTimeline,
    onOpenSavedSiteContent,
    onOpenSubagentSession,
    onPermissionResponse,
    options,
  );
}

function ThreadInlineStatusHint({
  hint,
}: {
  hint: NonNullable<ReturnType<typeof resolveThreadInlineStatusHint>>;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 py-1 text-sm",
        hint.tone === "warning" && "text-amber-900",
        hint.tone === "error" && "text-rose-900",
        hint.tone === "neutral" && "text-slate-700",
      )}
      data-testid="agent-thread-inline-status"
    >
      <div
        className={cn(
          "mt-2 h-1.5 w-1.5 shrink-0 rounded-full",
          hint.tone === "warning" && "bg-amber-500",
          hint.tone === "error" && "bg-rose-500",
          hint.tone === "neutral" && "bg-slate-400",
        )}
      />
      <div className="min-w-0 flex-1 leading-6">
        <span className="mr-2 text-xs font-medium">{hint.label}</span>
        <span>{hint.detail}</span>
      </div>
    </div>
  );
}

function TimelineBlockStatusIndicator({
  block,
}: {
  block: AgentThreadOrderedBlock;
}) {
  if (block.kind === "approval" && block.status !== "completed") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Clock3 className="h-2.5 w-2.5" />
      </span>
    );
  }

  if (block.status === "in_progress") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-100 text-sky-600">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      </span>
    );
  }

  if (block.status === "failed" || block.kind === "alert") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 text-rose-700">
        <AlertTriangle className="h-2.5 w-2.5" />
      </span>
    );
  }

  return <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />;
}

function hasStructuredThinkingInlinePreview(item: AgentThreadItem): boolean {
  if (item.type !== "reasoning" && item.type !== "turn_summary") {
    return false;
  }

  const displayText =
    item.type === "reasoning"
      ? resolveThinkingDisplayText(item)
      : resolveTurnSummaryDisplayText(item);
  if (!displayText.trim()) {
    return false;
  }

  const parsed = parseAIResponse(displayText, false);
  return Boolean(parsed.hasA2UI || parsed.hasPending);
}

function TimelineBlockCard({
  block,
  index,
  emphasis,
  isExpanded,
  onFileClick,
  onOpenArtifactFromTimeline,
  sourceMessageId,
  onSaveFileArtifactAsKnowledge,
  onOpenSavedSiteContent,
  onOpenSubagentSession,
  onPermissionResponse,
  focusedItemId,
  focusRequestKey,
  preferInlineDetails,
  deferCompletedSingleDetails,
}: {
  block: AgentThreadOrderedBlock;
  index: number;
  emphasis: TimelineBlockEmphasis;
  isExpanded: boolean;
  preferInlineDetails: boolean;
  deferCompletedSingleDetails: boolean;
  onFileClick?: (fileName: string, content: string) => void;
  onOpenArtifactFromTimeline?: (target: ArtifactTimelineOpenTarget) => void;
  sourceMessageId?: string;
  onSaveFileArtifactAsKnowledge?: (source: {
    messageId: string;
    content: string;
    sourceName?: string;
    description?: string | null;
  }) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
  onOpenSubagentSession?: (sessionId: string) => void;
  onPermissionResponse?: (response: ConfirmResponse) => void;
  focusedItemId?: string | null;
  focusRequestKey?: number;
}) {
  const { t } = useTranslation("agent");
  const openSubagentLabel = t("agentChat.threadTimeline.openSubagent");
  const dataTestId = `agent-thread-block:${index + 1}:${block.kind}`;
  const summaryLines = resolveBlockSummaryLines(block);
  const headline = summaryLines[0] || block.title;
  const supportingLines = summaryLines.slice(1, 3);
  const focusedEntryRef = useRef<HTMLDivElement | null>(null);
  const initialPlan = buildTimelineBlockRenderPlan({
    block,
    isExpanded,
    preferInlineDetails,
    deferCompletedSingleDetails,
    focusedItemId,
    hasStructuredThinkingInlinePreview,
  });
  const [open, setOpen] = useState(
    isExpanded || initialPlan.hasFocusedItem,
  );
  const renderPlan = buildTimelineBlockRenderPlan({
    block,
    isExpanded: open,
    preferInlineDetails,
    deferCompletedSingleDetails,
    focusedItemId,
    hasStructuredThinkingInlinePreview,
  });

  useEffect(() => {
    setOpen(isExpanded || renderPlan.hasFocusedItem);
  }, [block.id, isExpanded, renderPlan.hasFocusedItem]);

  useEffect(() => {
    if (!renderPlan.hasFocusedItem || !focusRequestKey) {
      return;
    }

    setOpen(true);
    focusedEntryRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [focusRequestKey, renderPlan.hasFocusedItem]);
  const detailEntries = useMemo(() => {
    if (!renderPlan.shouldMaterializeDetailEntries) {
      return [];
    }

    return block.items.flatMap((item) => {
      const content = renderTimelineItemDetails(
        item,
        onFileClick,
        onOpenArtifactFromTimeline,
        onOpenSavedSiteContent,
        onOpenSubagentSession,
        onPermissionResponse,
        {
          groupedToolCall: renderPlan.shouldRenderGroupedToolRows,
          groupMarker: block.items[0]?.id === item.id ? "└" : "·",
          openSubagentLabel,
          sourceMessageId,
          onSaveFileArtifactAsKnowledge,
        },
      );

      return content ? [{ id: item.id, content }] : [];
    });
  }, [
    block.items,
    onFileClick,
    onOpenArtifactFromTimeline,
    sourceMessageId,
    onSaveFileArtifactAsKnowledge,
    onOpenSavedSiteContent,
    onOpenSubagentSession,
    onPermissionResponse,
    openSubagentLabel,
    renderPlan.shouldMaterializeDetailEntries,
    renderPlan.shouldRenderGroupedToolRows,
  ]);

  if (renderPlan.shouldRenderArtifactCardsInline) {
    return (
      <div
        className={cn("py-0.5", block.items.length === 1 && "space-y-2")}
        data-testid={dataTestId}
        data-emphasis={emphasis}
      >
        {block.items.length > 1 ? (
          <AgentThreadTimelineFileChangesCard
            items={
              block.items.filter(
                (item): item is Extract<
                  AgentThreadItem,
                  { type: "file_artifact" }
                > => item.type === "file_artifact",
              )
            }
            onFileClick={onFileClick}
            onOpenArtifactFromTimeline={onOpenArtifactFromTimeline}
          />
        ) : (
          detailEntries.map((entry) => (
            <div
              key={entry.id}
              data-thread-item-id={entry.id}
              ref={entry.id === focusedItemId ? focusedEntryRef : null}
              className={cn(
                entry.id === focusedItemId &&
                  "rounded-2xl ring-2 ring-sky-200 ring-offset-2 ring-offset-white",
              )}
            >
              {entry.content}
            </div>
          ))
        )}
      </div>
    );
  }

  const singleItemContent = renderPlan.shouldRenderSingleItemInline
    ? renderTimelineItemDetails(
        block.items[0]!,
        onFileClick,
        onOpenArtifactFromTimeline,
        onOpenSavedSiteContent,
        onOpenSubagentSession,
        onPermissionResponse,
        {
          openSubagentLabel,
          sourceMessageId,
          onSaveFileArtifactAsKnowledge,
        },
      )
    : null;

  if (singleItemContent) {
    return (
      <div
        className={cn(
          "py-0.5",
          emphasis === "active" &&
            !renderPlan.isThinkingOnlyBlock &&
            "rounded-xl bg-sky-50/45 px-2",
          emphasis === "quiet" && "opacity-80",
        )}
        data-testid={dataTestId}
        data-emphasis={emphasis}
      >
        <div
          data-thread-item-id={block.items[0]?.id}
          ref={block.items[0]?.id === focusedItemId ? focusedEntryRef : null}
          className={cn(
            block.items[0]?.id === focusedItemId &&
              "rounded-xl ring-2 ring-sky-200 ring-offset-2 ring-offset-white",
          )}
        >
          {singleItemContent}
        </div>
      </div>
    );
  }

  const visibleHeadline = headline;
  const safeThinkingSupportingLines = renderPlan.isThinkingOnlyBlock
    ? supportingLines.filter((line) => !isInternalThinkingPreviewLine(line))
    : supportingLines;
  const visibleSupportingLines =
    renderPlan.isThinkingOnlyBlock && open ? [] : safeThinkingSupportingLines;
  const summaryCountLabel = block.items.length > 1 ? block.countLabel : null;
  const processMixLabel = resolveProcessMixLabel(block);
  const summaryDetailHint =
    renderPlan.hasDetailEntries && block.items.length > 1 && !open
      ? processMixLabel || block.rawDetailLabel
      : null;
  const summaryToneClassName = cn(
    "text-slate-900",
    block.status === "in_progress" && "text-sky-700",
    block.kind === "approval" &&
      block.status !== "completed" &&
      "text-amber-800",
    (block.status === "failed" || block.kind === "alert") && "text-rose-700",
  );

  return (
    <div
      className="py-0.5"
      data-testid={`${dataTestId}:shell`}
      data-emphasis={emphasis}
    >
        <details
        data-testid={dataTestId}
        data-emphasis={emphasis}
        open={renderPlan.hasDetailEntries ? open : true}
      >
        <summary
          className={cn(
            "list-none rounded-md px-2 py-1.5",
            renderPlan.hasDetailEntries ? "cursor-pointer" : "cursor-default",
            emphasis === "active" &&
              !renderPlan.isThinkingOnlyBlock &&
              "bg-sky-50/45",
          )}
          onClick={(event) => {
            if (!renderPlan.hasDetailEntries) {
              event.preventDefault();
              return;
            }

            event.preventDefault();
            setOpen((current) => !current);
          }}
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
              <TimelineBlockStatusIndicator block={block} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm leading-6",
                    summaryToneClassName,
                  )}
                >
                  {visibleHeadline}
                </span>
                {summaryCountLabel ? (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] leading-none text-slate-500">
                    {summaryCountLabel}
                  </span>
                ) : null}
                {summaryDetailHint ? (
                  <span className="text-xs leading-5 text-slate-400">
                    {summaryDetailHint}
                  </span>
                ) : null}
              </div>

              {visibleSupportingLines.length > 0 ? (
                <div className="mt-0.5 space-y-1">
                  {visibleSupportingLines.map((line) => (
                    <div
                      key={line}
                      className="text-sm leading-6 text-slate-500"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {renderPlan.hasDetailEntries ? (
              <ChevronDown
                className={cn(
                  "mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform",
                  open && "rotate-180",
                )}
              />
            ) : null}
          </div>
        </summary>

        {renderPlan.hasDetailEntries && open ? (
          <div
            className="ml-6 space-y-2 pb-1 pl-3"
            data-testid={`${dataTestId}:details`}
          >
            {detailEntries.map((entry) => (
              <div
                key={entry.id}
                data-thread-item-id={entry.id}
                ref={entry.id === focusedItemId ? focusedEntryRef : null}
                className={cn(
                  entry.id === focusedItemId &&
                    "rounded-2xl ring-2 ring-sky-200 ring-offset-2 ring-offset-white",
                )}
              >
                {entry.content}
              </div>
            ))}
          </div>
        ) : null}
      </details>
    </div>
  );
}

export const AgentThreadTimeline: React.FC<AgentThreadTimelineProps> = ({
  turn,
  items,
  threadRead: _threadRead,
  actionRequests = [],
  isCurrentTurn = false,
  placement = "default",
  onFileClick,
  onOpenArtifactFromTimeline,
  sourceMessageId,
  onSaveFileArtifactAsKnowledge,
  onOpenSavedSiteContent,
  onOpenSubagentSession,
  onPermissionResponse,
  focusedItemId = null,
  focusRequestKey = 0,
  deferCompletedSingleDetails = false,
  collapseInactiveDetails = false,
}) => {
  const { t } = useTranslation("agent");
  const pendingRuntimeConfirmationPrompt = useMemo(
    () => resolvePendingRuntimeConfirmationPrompt({ items, actionRequests }),
    [actionRequests, items],
  );
  const hasSubmittedRuntimeConfirmation = useMemo(
    () => hasSubmittedRuntimeActionConfirmation({ items, actionRequests }),
    [actionRequests, items],
  );
  const visibleItems = useMemo(
    () => resolveVisibleTimelineItems(items),
    [items],
  );

  const displayModel = useMemo(
    () => buildAgentThreadDisplayModel(visibleItems, { t }),
    [t, visibleItems],
  );
  const activeBlockIndex = resolveActiveBlockIndex(displayModel.orderedBlocks);
  const focusBlockIndex = resolveFocusBlockIndex({
    blocks: displayModel.orderedBlocks,
    turn,
    actionRequests,
    activeBlockIndex,
  });
  const expandedBlockIndexes = resolveExpandedBlockIndexes({
    blocks: displayModel.orderedBlocks,
    isCurrentTurn,
    focusBlockIndex,
    turn,
    collapseInactiveDetails,
  });
  const inlineStatusHint = resolveThreadInlineStatusHint({
    turn,
    actionRequests,
    runtimeConfirmationPrompt: pendingRuntimeConfirmationPrompt,
    hasSubmittedRuntimeConfirmation,
  });

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div
      className={cn("space-y-2", placement === "leading" ? "mt-0" : "mt-3")}
      data-testid="agent-thread-flow"
      data-placement={placement}
    >
      {inlineStatusHint ? (
        <ThreadInlineStatusHint hint={inlineStatusHint} />
      ) : null}
      {displayModel.orderedBlocks.map((block, index) => {
        return (
          <TimelineBlockCard
            key={block.id}
            block={block}
            index={index}
            emphasis={
              resolveTimelineBlockEmphasis({
                block,
                index,
                activeBlockIndex,
                focusedItemId,
              })
            }
            isExpanded={expandedBlockIndexes.has(index)}
            preferInlineDetails={isCurrentTurn}
            deferCompletedSingleDetails={deferCompletedSingleDetails}
            onFileClick={onFileClick}
            onOpenArtifactFromTimeline={onOpenArtifactFromTimeline}
            sourceMessageId={sourceMessageId}
            onSaveFileArtifactAsKnowledge={onSaveFileArtifactAsKnowledge}
            onOpenSavedSiteContent={onOpenSavedSiteContent}
            onOpenSubagentSession={onOpenSubagentSession}
            onPermissionResponse={onPermissionResponse}
            focusedItemId={focusedItemId}
            focusRequestKey={focusRequestKey}
          />
        );
      })}
    </div>
  );
};
