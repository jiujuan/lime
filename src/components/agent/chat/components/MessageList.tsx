import React, {
  useCallback,
  useState,
  useRef,
  useEffect,
  useMemo,
  useLayoutEffect,
} from "react";
import {
  AlertTriangle,
  Copy,
  Quote,
  Check,
  FileText,
  Loader2,
  ExternalLink,
  Sparkles,
  BookmarkPlus,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Artifact } from "@/lib/artifact/types";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import { recordAgentUiPerformanceMetric } from "@/lib/agentUiPerformanceMetrics";
import {
  resolveConfiguredProviderPromptCacheSupportNotice,
  useConfiguredProviders,
} from "@/hooks/useConfiguredProviders";
import { resolveArtifactProtocolFilePath } from "@/lib/artifact-protocol";
import {
  MessageListContainer,
  MessageWrapper,
  ContentColumn,
  MessageBubble,
  MessageActions,
} from "../styles";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { RuntimePeerMessageCards } from "./RuntimePeerMessageCards";
import { StreamingRenderer } from "./StreamingRenderer";
import { TokenUsageDisplay } from "./TokenUsageDisplay";
import { AgentThreadTimeline } from "./AgentThreadTimeline";
import { ImageWorkbenchMessagePreview } from "./ImageWorkbenchMessagePreview";
import { TaskMessagePreview } from "./TaskMessagePreview";
import { InputbarRuntimeStatusLine } from "./Inputbar/components/InputbarRuntimeStatusLine";
import {
  formatArtifactWritePhaseLabel,
  resolveArtifactPreviewText,
  resolveArtifactWritePhase,
} from "../utils/messageArtifacts";
import { resolveContentPostArtifactDisplayTitle } from "../utils/contentPostSkill";
import {
  sanitizeContentPartsForDisplay,
  sanitizeMessageTextForDisplay,
} from "../utils/internalImagePlaceholder";
import { shouldSuppressImageWorkbenchStatusText } from "../utils/imageWorkbenchStatusText";
import { isHiddenConversationArtifactPath } from "../utils/internalArtifactVisibility";
import {
  buildInputbarRuntimeStatusLineModel,
  type InputbarRuntimeStatusLineModel,
} from "../utils/inputbarRuntimeStatusLine";
import { resolvePromptCacheActivity } from "../utils/tokenUsageSummary";
import {
  isRuntimeStatusDiagnosticsOnly,
  shouldHideTurnSummaryFromConversation,
} from "../utils/turnSummaryPresentation";
import {
  Message,
  type ActionRequired,
  type AgentRuntimeStatus,
  type AgentThreadItem,
  type AgentThreadTurn,
  type MessagePreviewTarget,
  type SiteSavedContentTarget,
  type WriteArtifactContext,
  type PendingA2UISource,
} from "../types";
import type { A2UIFormData } from "@/lib/workspace/a2ui";
import type { ConfirmResponse } from "../types";
import type {
  AsterSubagentSessionInfo,
  AgentRuntimeThreadReadModel,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import { resolveLatestProjectFileSavedSiteContentTargetFromMessage } from "../utils/latestSavedSiteContentTarget";
import {
  resolveSiteSavedContentTargetDisplayName,
  resolveSiteSavedContentTargetRelativePath,
} from "../utils/siteToolResultSummary";
import { type ArtifactTimelineOpenTarget } from "../utils/artifactTimelineNavigation";
import { isPureRuntimePeerMessageText } from "../utils/runtimePeerMessageDisplay";
import { LIME_BRAND_LOGO_SRC, LIME_BRAND_NAME } from "@/lib/branding";
import {
  buildConversationMessageRenderWindowProjection,
  filterVisibleConversationMessages,
  resolveConversationMessageRenderWindowSettings,
  resolveInitialConversationRenderedMessageCount,
  shouldUseConversationProgressiveRender,
} from "../projection/messageRenderWindowProjection";
import {
  filterConversationThreadItemsForRenderedTurns,
  resolveConversationRenderedTurnIdSet,
  resolveConversationRenderedTurns,
} from "../projection/threadTimelineWindowProjection";
import {
  buildCurrentTurnTimelineProjection,
  buildMessageGroupsProjection,
  buildMessageRenderGroupsProjection,
  buildTimelineByMessageIdProjection,
  resolveLastAssistantMessage,
} from "../projection/messageTimelineRenderProjection";
import {
  buildHistoricalHydrationProjectionEvents,
  buildHistoricalMarkdownHydrationIndexByMessageId,
  buildHistoricalMarkdownHydrationTargets,
  countDeferredHistoricalContentParts,
  countDeferredHistoricalMarkdown,
  hasStructuredHistoricalContentHint,
  shouldDeferHistoricalAssistantMessageDetails as shouldDeferHistoricalAssistantMessageDetailsProjection,
} from "../projection/historicalMessageHydrationProjection";
import { recordAgentUiProjectionEvents } from "../projection/conversationProjectionStore";
import {
  type AgentStreamTextOverlaySnapshot,
  useAgentStreamTextOverlay,
} from "../hooks/agentStreamTextOverlayStore";
import { INPUTBAR_BUILTIN_COMMANDS } from "../skill-selection/builtinCommands";
import { isRetainedSkillProcessMessage } from "../utils/skillInlineProcessRetention";
import { formatNumber } from "@/i18n/format";

interface MessageListProps {
  sessionId?: string | null;
  messages: Message[];
  leadingContent?: React.ReactNode;
  emptyStateVariant?: "default" | "task-center";
  turns?: AgentThreadTurn[];
  threadItems?: AgentThreadItem[];
  currentTurnId?: string | null;
  threadRead?: AgentRuntimeThreadReadModel | null;
  pendingActions?: ActionRequired[];
  submittedActionsInFlight?: ActionRequired[];
  queuedTurns?: QueuedTurnSnapshot[];
  childSubagentSessions?: AsterSubagentSessionInfo[];
  sessionHistoryWindow?: {
    loadedMessages: number;
    totalMessages: number;
    isLoadingFull: boolean;
    error?: string | null;
  } | null;
  onLoadFullHistory?: () => void | Promise<void>;
  isSending?: boolean;
  assistantLabel?: string;
  onDeleteMessage?: (id: string) => void;
  onEditMessage?: (id: string, content: string) => void;
  onQuoteMessage?: (content: string, id: string) => void;
  /** A2UI 表单提交回调 */
  onA2UISubmit?: (formData: A2UIFormData, messageId: string) => void;
  /** 是否渲染消息内联 A2UI */
  renderA2UIInline?: boolean;
  /** A2UI 表单数据映射（按消息 ID 索引） */
  a2uiFormDataMap?: Record<string, { formId: string; formData: A2UIFormData }>;
  /** A2UI 表单数据变化回调（用于持久化） */
  onA2UIFormChange?: (formId: string, formData: A2UIFormData) => void;
  /** 文件写入回调 */
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: WriteArtifactContext,
  ) => void;
  /** 文件点击回调 */
  onFileClick?: (fileName: string, content: string) => void;
  /** 时间线内 artifact 精确跳转 */
  onOpenArtifactFromTimeline?: (target: ArtifactTimelineOpenTarget) => void;
  /** 打开站点能力已保存内容 */
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
  /** Artifact 点击回调 */
  onArtifactClick?: (artifact: Artifact) => void;
  /** 打开消息结果预览 */
  onOpenMessagePreview?: (
    target: MessagePreviewTarget,
    message: Message,
  ) => void;
  /** 将助手结果沉淀为技能草稿 */
  onSaveMessageAsSkill?: (source: {
    messageId: string;
    content: string;
  }) => void;
  /** 将助手结果沉淀到灵感库 */
  onSaveMessageAsInspiration?: (source: {
    messageId: string;
    content: string;
  }) => void;
  /** 将助手结果保存到项目资料 */
  onSaveMessageAsKnowledge?: (source: {
    messageId: string;
    content: string;
    sourceName?: string;
    description?: string | null;
  }) => void;
  /** 打开子代理会话 */
  onOpenSubagentSession?: (sessionId: string) => void;
  /** 权限确认响应回调 */
  onPermissionResponse?: (response: ConfirmResponse) => void;
  /** 是否折叠代码块（当画布打开时） */
  collapseCodeBlocks?: boolean;
  /** 按代码块决定是否折叠 */
  shouldCollapseCodeBlock?: (language: string, code: string) => boolean;
  /** 代码块点击回调（用于在画布中显示） */
  onCodeBlockClick?: (language: string, code: string) => void;
  /** 是否将待处理问答提升为输入区 A2UI 表单 */
  promoteActionRequestsToA2UI?: boolean;
  /** 会话是否仍在自动恢复 */
  isRestoringSession?: boolean;
  /** 中断当前执行 */
  onInterruptCurrentTurn?: () => void | Promise<void>;
  /** 恢复当前线程排队执行 */
  onResumeThread?: () => boolean | Promise<boolean>;
  /** 重新拉起当前最重要的待处理请求 */
  onReplayPendingRequest?: (
    requestId: string,
    assistantMessageId: string,
  ) => boolean | Promise<boolean>;
  /** 立即恢复下一条排队回合 */
  onPromoteQueuedTurn?: (queuedTurnId: string) => boolean | Promise<boolean>;
  /** 是否压缩左侧留白，适用于工作台右栏 */
  compactLeadingSpacing?: boolean;
  /** 需要高亮的 timeline item */
  focusedTimelineItemId?: string | null;
  /** 触发 timeline item 聚焦的请求序号 */
  timelineFocusRequestKey?: number;
  /** 当前由聊天区底部承载的待处理 A2UI 来源 */
  activePendingA2UISource?: PendingA2UISource | null;
  /** 当前会话的 provider 选择器 */
  providerType?: string;
}

const MESSAGE_LIST_PROGRESSIVE_RENDER_THRESHOLD = 72;
const MESSAGE_LIST_INITIAL_RENDER_COUNT = 36;
const MESSAGE_LIST_RENDER_BATCH_SIZE = 48;
const MESSAGE_LIST_RESTORED_PROGRESSIVE_RENDER_THRESHOLD = 20;
const MESSAGE_LIST_RESTORED_INITIAL_RENDER_COUNT = 10;
const MESSAGE_LIST_RESTORED_RENDER_BATCH_SIZE = 6;
const MESSAGE_LIST_PROGRESSIVE_RENDER_MINIMUM_DELAY_MS = 120;
const MESSAGE_LIST_RESTORED_PROGRESSIVE_RENDER_MINIMUM_DELAY_MS = 600;
const MESSAGE_LIST_TIMELINE_DEFER_MESSAGE_THRESHOLD = 24;
const MESSAGE_LIST_TIMELINE_DEFER_ITEM_THRESHOLD = 24;
const MESSAGE_LIST_HISTORICAL_TIMELINE_COMPACT_ITEM_THRESHOLD = 8;
const MESSAGE_LIST_HISTORICAL_TIMELINE_IDLE_DELAY_MS = 80;
const MESSAGE_LIST_RESTORED_HISTORICAL_TIMELINE_IDLE_DELAY_MS = 900;
const MESSAGE_LIST_COMPACT_HISTORICAL_ASSISTANT_THRESHOLD = 900;
const MESSAGE_LIST_COMPACT_HISTORICAL_ASSISTANT_PREVIEW_CHARS = 900;
const MESSAGE_LIST_LONG_HISTORICAL_MESSAGE_THRESHOLD = 24_000;
const MESSAGE_LIST_LONG_HISTORICAL_MESSAGE_PREVIEW_CHARS = 2_000;
const MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_INITIAL_COUNT = 2;
const MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_BATCH_SIZE = 2;
const MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_DELAY_MS = 140;
const MESSAGE_LIST_RENDER_WINDOW_SETTINGS = {
  regular: {
    progressiveRenderThreshold: MESSAGE_LIST_PROGRESSIVE_RENDER_THRESHOLD,
    initialRenderCount: MESSAGE_LIST_INITIAL_RENDER_COUNT,
    renderBatchSize: MESSAGE_LIST_RENDER_BATCH_SIZE,
    minimumDelayMs: MESSAGE_LIST_PROGRESSIVE_RENDER_MINIMUM_DELAY_MS,
  },
  restored: {
    progressiveRenderThreshold:
      MESSAGE_LIST_RESTORED_PROGRESSIVE_RENDER_THRESHOLD,
    initialRenderCount: MESSAGE_LIST_RESTORED_INITIAL_RENDER_COUNT,
    renderBatchSize: MESSAGE_LIST_RESTORED_RENDER_BATCH_SIZE,
    minimumDelayMs: MESSAGE_LIST_RESTORED_PROGRESSIVE_RENDER_MINIMUM_DELAY_MS,
  },
} as const;

function resolveKnowledgeSourceFromArtifact(artifact: Artifact): {
  sourceName?: string;
  description?: string | null;
  content: string;
} | null {
  if (
    isHiddenConversationArtifactPath(resolveArtifactProtocolFilePath(artifact))
  ) {
    return null;
  }

  const text = (artifact.content || "").trim();
  if (
    artifact.status === "error" ||
    text.length < 24 ||
    !["document", "code", "canvas:document"].includes(artifact.type)
  ) {
    return null;
  }

  const filename =
    typeof artifact.meta?.filename === "string" && artifact.meta.filename.trim()
      ? artifact.meta.filename.trim()
      : undefined;
  const title = (artifact.title || "").trim();

  return {
    sourceName: filename || title || undefined,
    description: title || filename || null,
    content: artifact.content,
  };
}

function resolveKnowledgeSourceFromArtifacts(
  artifacts: Artifact[] | undefined,
): {
  sourceName?: string;
  description?: string | null;
  content: string;
} | null {
  const visibleArtifacts =
    artifacts?.filter(
      (artifact) =>
        !isHiddenConversationArtifactPath(
          resolveArtifactProtocolFilePath(artifact),
        ),
    ) ?? [];

  return [...visibleArtifacts].reverse().reduce<{
    sourceName?: string;
    description?: string | null;
    content: string;
  } | null>((matched, artifact) => {
    if (matched) {
      return matched;
    }
    return resolveKnowledgeSourceFromArtifact(artifact);
  }, null);
}

function buildHistoricalMessagePreview(
  content: string,
  previewChars: number,
): string {
  const normalized = content.trim();
  if (normalized.length <= previewChars) {
    return normalized;
  }

  return `${normalized.slice(0, previewChars)}\n\n...`;
}

function buildLongHistoricalMessagePreview(content: string): string {
  return buildHistoricalMessagePreview(
    content,
    MESSAGE_LIST_LONG_HISTORICAL_MESSAGE_PREVIEW_CHARS,
  );
}

function formatContentLength(value: number): string {
  return formatNumber(value);
}

interface HistoricalAssistantMessagePreviewProps {
  content: string;
  contentLength: number;
  variant: "compact" | "long";
  onExpand: () => void;
}

function HistoricalAssistantMessagePreview({
  content,
  contentLength,
  variant,
  onExpand,
}: HistoricalAssistantMessagePreviewProps) {
  const { t } = useTranslation("agent");
  const isLong = variant === "long";
  const noticeKey = isLong
    ? "agentChat.messageList.historicalAssistantPreview.longNotice"
    : "agentChat.messageList.historicalAssistantPreview.compactNotice";

  return (
    <div
      data-testid={
        isLong
          ? "message-list-long-history-preview"
          : "message-list-historical-assistant-preview"
      }
      data-preview-variant={variant}
      className="space-y-3"
    >
      <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-800">
        {content}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
        <span>
          {t(noticeKey, {
            countLabel: formatContentLength(contentLength),
          })}
        </span>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          onClick={onExpand}
        >
          {t("agentChat.messageList.historicalAssistantPreview.expandFull")}
        </button>
      </div>
    </div>
  );
}

const HistoricalMarkdownHydrationPreview: React.FC<{ content: string }> = ({
  content,
}) => (
  <div
    data-testid="message-list-historical-markdown-preview"
    className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-800"
  >
    {content}
  </div>
);

const ImageWorkbenchAssistantIntro: React.FC<{ content: string }> = ({
  content,
}) => (
  <div
    data-testid="image-workbench-assistant-intro"
    className="max-w-[760px] whitespace-pre-line break-words px-0.5 text-[15px] leading-7 text-slate-950"
  >
    {content}
  </div>
);

function summarizeHistoricalTimelineItems(items: AgentThreadItem[]): {
  stepsCount: number;
  toolStepsCount: number;
  thinkingStepsCount: number;
  artifactStepsCount: number;
} {
  const visibleItems = items.filter((item) => {
    if (item.type === "user_message" || item.type === "agent_message") {
      return false;
    }

    return !(
      item.type === "file_artifact" &&
      isHiddenConversationArtifactPath(item.path)
    );
  });
  const toolStepsCount = visibleItems.filter(
    (item) =>
      item.type === "tool_call" ||
      item.type === "command_execution" ||
      item.type === "web_search",
  ).length;
  const thinkingStepsCount = visibleItems.filter(
    (item) =>
      item.type === "reasoning" ||
      item.type === "plan" ||
      item.type === "turn_summary" ||
      item.type === "context_compaction",
  ).length;
  const artifactStepsCount = visibleItems.filter(
    (item) => item.type === "file_artifact",
  ).length;
  return {
    stepsCount: visibleItems.length,
    toolStepsCount,
    thinkingStepsCount,
    artifactStepsCount,
  };
}

const HistoricalTimelinePreview: React.FC<{
  items: AgentThreadItem[];
  placement: "leading" | "trailing" | "default";
  detailsDeferred?: boolean;
  onExpand: () => void;
}> = ({ items, placement, detailsDeferred = false, onExpand }) => {
  const { t } = useTranslation("agent");
  const summary = useMemo(
    () => summarizeHistoricalTimelineItems(items),
    [items],
  );

  if (summary.stepsCount <= 0 && !detailsDeferred) {
    return null;
  }
  const metaParts = [
    summary.toolStepsCount > 0
      ? t("agentChat.messageList.historicalTimeline.toolSteps", {
          countLabel: formatContentLength(summary.toolStepsCount),
        })
      : null,
    summary.thinkingStepsCount > 0
      ? t("agentChat.messageList.historicalTimeline.thinkingSteps", {
          countLabel: formatContentLength(summary.thinkingStepsCount),
        })
      : null,
    summary.artifactStepsCount > 0
      ? t("agentChat.messageList.historicalTimeline.artifactSteps", {
          countLabel: formatContentLength(summary.artifactStepsCount),
        })
      : null,
  ].filter((part): part is string => Boolean(part));
  const summaryMetaText =
    metaParts.length > 0
      ? metaParts.join(t("agentChat.messageList.historicalTimeline.separator"))
      : t("agentChat.messageList.historicalTimeline.foldedMeta");
  const metaText =
    summary.stepsCount > 0
      ? t("agentChat.messageList.historicalTimeline.meta", {
          stepCountLabel: formatContentLength(summary.stepsCount),
          meta: summaryMetaText,
        })
      : t("agentChat.messageList.historicalTimeline.deferredMeta");

  return (
    <button
      type="button"
      data-testid={`message-list-historical-timeline-preview:${placement}`}
      className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-left text-sm text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100/80"
      onClick={onExpand}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-slate-800">
          {t("agentChat.messageList.historicalTimeline.title")}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
          {metaText}
        </span>
      </span>
      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
        {t("agentChat.messageList.historicalTimeline.expand")}
      </span>
    </button>
  );
};

function normalizeRuntimeStatusMetaText(value?: string | null): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

const MessageRuntimeStatusPill: React.FC<{
  status: AgentRuntimeStatus;
}> = ({ status }) => {
  const { t } = useTranslation("agent");
  const failed = status.phase === "failed";
  const cancelled = status.phase === "cancelled";
  const ToneIcon = failed ? AlertTriangle : cancelled ? Square : Loader2;
  const titleText = normalizeRuntimeStatusMetaText(status.title);
  const detailText = normalizeRuntimeStatusMetaText(status.detail);
  const checkpointsText = (status.checkpoints || [])
    .map((item) => normalizeRuntimeStatusMetaText(item))
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
  const tooltip = [titleText, detailText, checkpointsText]
    .filter(
      (item, index, array) => Boolean(item) && array.indexOf(item) === index,
    )
    .join("\n");

  return (
    <div
      data-testid="message-runtime-status-pill"
      className={[
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] leading-none",
        failed
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : cancelled
            ? "border-slate-200 bg-slate-50 text-slate-600"
            : "border-sky-200 bg-sky-50 text-sky-700",
      ].join(" ")}
      title={tooltip || undefined}
    >
      <ToneIcon
        className={[
          "h-3.5 w-3.5 shrink-0",
          failed || cancelled ? "" : "animate-spin",
        ].join(" ")}
      />
      <span className="truncate">
        {titleText || t("agentChat.messageList.firstTokenStatus.routing.title")}
      </span>
    </div>
  );
};

function truncateRuntimeStatusText(value: string, maxLength = 96): string {
  const normalized = normalizeRuntimeStatusMetaText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${Array.from(normalized).slice(0, maxLength).join("")}...`;
}

interface MessageListMeasuredComputation<T> {
  value: T;
  durationMs: number;
}

function getMessageListPerformanceNow(): number {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

function measureMessageListComputation<T>(
  compute: () => T,
): MessageListMeasuredComputation<T> {
  const startedAt = getMessageListPerformanceNow();
  const value = compute();
  const durationMs = getMessageListPerformanceNow() - startedAt;

  return {
    value,
    durationMs: Math.round(Math.max(0, durationMs) * 10) / 10,
  };
}

const AssistantFirstTokenRuntimeStatus: React.FC<{
  status?: AgentRuntimeStatus | null;
}> = ({ status }) => {
  const { t } = useTranslation("agent");
  const phase = status?.phase || "submitted";
  const title = truncateRuntimeStatusText(
    t(`agentChat.messageList.firstTokenStatus.${phase}.title`),
    48,
  );
  const detail = truncateRuntimeStatusText(
    t(`agentChat.messageList.firstTokenStatus.${phase}.detail`),
    120,
  );

  return (
    <div
      data-testid="assistant-first-token-runtime-status"
      className="inline-flex max-w-full items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600"
      aria-live="polite"
    >
      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-slate-500" />
      <span className="min-w-0">
        <span className="block font-medium leading-5 text-slate-700">
          {title}
        </span>
        <span className="mt-0.5 block leading-5 text-slate-500">{detail}</span>
      </span>
    </div>
  );
};

const AssistantStreamingInlineIndicator: React.FC<{
  runtime: InputbarRuntimeStatusLineModel;
}> = ({ runtime }) => {
  const { t } = useTranslation("agent");
  const status = runtime.status === "queued" ? "queued" : "running";
  const isQueued = status === "queued";

  return (
    <div
      data-testid="assistant-streaming-inline-indicator"
      data-status={status}
      role="status"
      aria-live="polite"
      className={[
        "inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[11px] font-medium leading-4",
        isQueued
          ? "bg-slate-100 text-slate-500"
          : "bg-slate-100 text-slate-600",
      ].join(" ")}
    >
      <Loader2
        className={[
          "h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none",
          isQueued ? "text-slate-400" : "text-emerald-600",
        ].join(" ")}
        aria-hidden
      />
      <span>
        {t(`agentChat.messageList.streamingInline.${status}`)}
      </span>
    </div>
  );
};

const USER_COMMAND_TAG_CANDIDATES = INPUTBAR_BUILTIN_COMMANDS.map((command) =>
  command.commandPrefix.trim(),
)
  .filter((prefix) => prefix.startsWith("@"))
  .sort((left, right) => right.length - left.length);

function resolveUserCommandRoutePrefix(
  route: Message["inputCapabilityRoute"],
): string | null {
  if (!route) {
    return null;
  }
  if (route.kind === "builtin_command" || route.kind === "runtime_scene") {
    const prefix = route.commandPrefix.trim();
    return prefix.startsWith("@") ? prefix : null;
  }
  return null;
}

function parseLeadingUserCommandTag(
  content: string,
  route?: Message["inputCapabilityRoute"],
): { tag: string; body: string } | null {
  const trimmed = content.trimStart();
  const routePrefix = resolveUserCommandRoutePrefix(route);
  if (!trimmed.startsWith("@")) {
    return routePrefix
      ? {
          tag: routePrefix,
          body: content.trim(),
        }
      : null;
  }

  const candidates = routePrefix
    ? [
        routePrefix,
        ...USER_COMMAND_TAG_CANDIDATES.filter(
          (candidate) =>
            candidate.toLowerCase() !== routePrefix.toLowerCase(),
        ),
      ]
    : USER_COMMAND_TAG_CANDIDATES;
  const matchedTag = candidates.find((candidate) => {
    const prefix = trimmed.slice(0, candidate.length);
    if (prefix.toLowerCase() !== candidate.toLowerCase()) {
      return false;
    }
    const nextChar = trimmed.charAt(candidate.length);
    return !nextChar || /\s/u.test(nextChar);
  });
  if (!matchedTag) {
    return null;
  }

  return {
    tag: matchedTag,
    body: trimmed.slice(matchedTag.length).trimStart(),
  };
}

const UserCommandMessageContent: React.FC<{
  content: string;
  route?: Message["inputCapabilityRoute"];
}> = ({ content, route }) => {
  const command = parseLeadingUserCommandTag(content, route);
  if (!command) {
    return null;
  }
  const ariaLabel = command.body
    ? `${command.tag} ${command.body}`.trim()
    : command.tag;

  return (
    <div
      data-testid="message-user-command-content"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-7 text-slate-950"
    >
      <span
        data-testid="message-user-command-tag"
        className="inline-flex items-center rounded-[6px] border border-[#c6dadd] bg-[#dcebed] px-1.5 py-[1px] text-[13px] font-semibold leading-5 text-[#2f6f79]"
      >
        {command.tag}
      </span>
      {command.body ? (
        <span className="whitespace-pre-wrap">{command.body}</span>
      ) : null}
    </div>
  );
};

function resolveInstalledSkillMessageLabel(message: Message): string | null {
  const route = message.inputCapabilityRoute;
  if (route?.kind !== "installed_skill") {
    return null;
  }

  return route.skillName?.trim() || route.skillKey.trim() || null;
}

const UserInstalledSkillMessageContent: React.FC<{
  content: string;
  label: string;
}> = ({ content, label }) => (
  <div
    data-testid="message-user-skill-content"
    aria-label={`@ ${label} ${content}`.trim()}
    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-7 text-slate-950"
  >
    <span
      data-testid="message-user-skill-tag"
      className="inline-flex items-center rounded-[6px] border border-sky-200 bg-sky-50 px-1.5 py-[1px] text-[13px] font-semibold leading-5 text-sky-800"
    >
      <span className="mr-1 text-sky-500">@</span>
      {label}
    </span>
    {content.trim() ? (
      <span className="whitespace-pre-wrap">{content}</span>
    ) : null}
  </div>
);

function shouldRenderRuntimeStatusPill(
  status?: AgentRuntimeStatus | null,
): boolean {
  return status?.phase === "failed" || status?.phase === "cancelled";
}

function isDeferredTimelineItem(item: AgentThreadItem): boolean {
  return item.type === "file_artifact" || item.type === "turn_summary";
}

function normalizeDeferredArtifactPath(path?: string | null): string {
  return (path || "").trim().replace(/\\/g, "/").toLowerCase();
}

function scoreDeferredArtifactItem(
  item: Extract<AgentThreadItem, { type: "file_artifact" }>,
): number {
  const contentScore = (item.content || "").trim().length;
  const completedAt = Date.parse(item.completed_at || item.updated_at || "");
  const timestampScore = Number.isFinite(completedAt) ? completedAt : 0;
  return contentScore * 1_000_000_000 + timestampScore;
}

function dedupeDeferredTimelineItems(
  items: AgentThreadItem[],
): AgentThreadItem[] {
  const deduped: AgentThreadItem[] = [];
  const artifactIndexByPath = new Map<string, number>();

  for (const item of items) {
    if (item.type !== "file_artifact") {
      deduped.push(item);
      continue;
    }

    const normalizedPath = normalizeDeferredArtifactPath(item.path);
    if (!normalizedPath) {
      deduped.push(item);
      continue;
    }

    const existingIndex = artifactIndexByPath.get(normalizedPath);
    if (existingIndex === undefined) {
      artifactIndexByPath.set(normalizedPath, deduped.length);
      deduped.push(item);
      continue;
    }

    const existingItem = deduped[existingIndex];
    if (
      existingItem?.type !== "file_artifact" ||
      scoreDeferredArtifactItem(item) >= scoreDeferredArtifactItem(existingItem)
    ) {
      deduped[existingIndex] = item;
    }
  }

  return deduped;
}

function shouldRenderConversationTimelineItem(
  item: AgentThreadItem,
  timelineItems: AgentThreadItem[],
  options?: {
    hasInlineRuntimeStatus?: boolean;
  },
): boolean {
  if (item.type === "user_message" || item.type === "agent_message") {
    return false;
  }

  if (item.type !== "turn_summary") {
    return true;
  }

  if (shouldHideTurnSummaryFromConversation(item)) {
    return false;
  }

  if (item.status === "in_progress" && options?.hasInlineRuntimeStatus) {
    return false;
  }

  if (item.status !== "completed") {
    return true;
  }

  return !timelineItems.some(
    (entry) => entry.id !== item.id && entry.type !== "turn_summary",
  );
}

function hasTimelineProcessItems(items?: AgentThreadItem[]): boolean {
  return Boolean(
    items?.some(
      (item) =>
        item.type === "plan" ||
        item.type === "reasoning" ||
        item.type === "tool_call" ||
        item.type === "command_execution" ||
        item.type === "web_search" ||
        item.type === "context_compaction",
    ),
  );
}

function hasInlineThinkingContent(message: Message): boolean {
  return (
    Boolean(message.thinkingContent?.trim()) ||
    Boolean(
      message.contentParts?.some(
        (part) => part.type === "thinking" && part.text.trim().length > 0,
      ),
    )
  );
}

function resolveInlineThinkingContent(message: Message): string | undefined {
  const explicitThinking = message.thinkingContent?.trim()
    ? message.thinkingContent
    : undefined;
  if (explicitThinking) {
    return explicitThinking;
  }

  const thinkingText = (message.contentParts || [])
    .filter(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "thinking"; text: string }
      > => part.type === "thinking" && part.text.trim().length > 0,
    )
    .map((part) => part.text)
    .join("");

  return thinkingText.trim() ? thinkingText : undefined;
}

function hasNonTextInlineProcessPart(message: Message): boolean {
  return Boolean(
    message.contentParts?.some(
      (part) => part.type !== "text" && part.type !== "thinking",
    ),
  );
}

function shouldSuppressAmbientStreamingReasoning(
  message: Message,
  displayContent: string,
): boolean {
  if (
    !hasInlineThinkingContent(message) ||
    displayContent.trim() ||
    !isRuntimeStatusDiagnosticsOnly(message.runtimeStatus)
  ) {
    return false;
  }

  if (
    hasNonTextInlineProcessPart(message) ||
    (message.toolCalls || []).length > 0 ||
    (message.actionRequests || []).length > 0
  ) {
    return false;
  }

  return true;
}

function isPreAnswerThinkingTimelineItem(item: AgentThreadItem): boolean {
  if (item.status === "failed") {
    return false;
  }

  return (
    item.type === "plan" ||
    item.type === "reasoning" ||
    item.type === "turn_summary" ||
    item.type === "context_compaction"
  );
}

function shouldSuppressPreAnswerThinkingTimeline(params: {
  message: Message;
  turn: AgentThreadTurn;
  items: AgentThreadItem[];
  displayContent: string;
}): boolean {
  if (
    !params.message.isThinking ||
    params.turn.status === "completed" ||
    params.displayContent.trim() ||
    params.items.length === 0
  ) {
    return false;
  }

  return params.items.every(isPreAnswerThinkingTimelineItem);
}

interface InlineProcessCoverage {
  hasInlineProcessEntries: boolean;
  thinking: boolean;
  toolNameCounts: Map<string, number>;
  actionRequestCounts: Map<string, number>;
}

function normalizeInlineCoverageKey(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function incrementInlineCoverageCount(
  counts: Map<string, number>,
  key: string | null,
) {
  if (!key) {
    return;
  }
  counts.set(key, (counts.get(key) || 0) + 1);
}

function consumeInlineCoverageCount(
  counts: Map<string, number>,
  key: string | null,
): boolean {
  if (!key) {
    return false;
  }
  const current = counts.get(key) || 0;
  if (current <= 0) {
    return false;
  }
  if (current === 1) {
    counts.delete(key);
  } else {
    counts.set(key, current - 1);
  }
  return true;
}

function createInlineCoverageMatcher(coverage: InlineProcessCoverage) {
  const remainingToolNameCounts = new Map(coverage.toolNameCounts);
  const remainingActionRequestCounts = new Map(coverage.actionRequestCounts);

  return (item: AgentThreadItem): boolean => {
    switch (item.type) {
      case "reasoning":
        return coverage.thinking;
      case "tool_call":
        return consumeInlineCoverageCount(
          remainingToolNameCounts,
          normalizeInlineCoverageKey(item.tool_name),
        );
      case "approval_request":
      case "request_user_input":
        return consumeInlineCoverageCount(
          remainingActionRequestCounts,
          normalizeInlineCoverageKey(item.request_id),
        );
      default:
        return false;
    }
  };
}

function resolveInlineProcessCoverage(params: {
  contentParts?: Message["contentParts"];
  thinkingContent?: string;
  toolCalls?: Message["toolCalls"];
  actionRequests?: Message["actionRequests"];
}): InlineProcessCoverage {
  const contentParts = params.contentParts || [];
  const toolNameCounts = new Map<string, number>();
  const actionRequestCounts = new Map<string, number>();
  let thinking = false;

  if (contentParts.length > 0) {
    thinking = contentParts.some(
      (part) => part.type === "thinking" && part.text.trim().length > 0,
    );
    contentParts.forEach((part) => {
      if (part.type === "tool_use") {
        incrementInlineCoverageCount(
          toolNameCounts,
          normalizeInlineCoverageKey(part.toolCall.name),
        );
        return;
      }
      if (part.type === "action_required") {
        incrementInlineCoverageCount(
          actionRequestCounts,
          normalizeInlineCoverageKey(part.actionRequired.requestId),
        );
      }
    });
  } else {
    thinking = Boolean(params.thinkingContent?.trim());
    (params.toolCalls || []).forEach((toolCall) => {
      incrementInlineCoverageCount(
        toolNameCounts,
        normalizeInlineCoverageKey(toolCall.name),
      );
    });
  }

  (params.actionRequests || []).forEach((actionRequest) => {
    const actionKey = normalizeInlineCoverageKey(actionRequest.requestId);
    if (actionKey && !actionRequestCounts.has(actionKey)) {
      incrementInlineCoverageCount(actionRequestCounts, actionKey);
    }
  });

  return {
    hasInlineProcessEntries:
      thinking || toolNameCounts.size > 0 || actionRequestCounts.size > 0,
    thinking,
    toolNameCounts,
    actionRequestCounts,
  };
}

function filterConversationDisplayContentParts(
  parts: Message["contentParts"] | undefined,
  options: {
    includeProcessFlow: boolean;
    preserveToolUseParts: boolean;
  },
): Message["contentParts"] | undefined {
  if (!parts || parts.length === 0 || options.includeProcessFlow) {
    return parts;
  }

  const filtered = parts.filter((part) => {
    if (part.type === "thinking") {
      return false;
    }

    if (part.type === "tool_use") {
      return options.preserveToolUseParts;
    }

    return true;
  });
  return filtered.length > 0 ? filtered : undefined;
}

function mergeStreamingOverlayContentParts(
  parts: Message["contentParts"] | undefined,
  overlayContent: string | null,
): Message["contentParts"] | undefined {
  if (!overlayContent) {
    return parts;
  }

  const textPart: NonNullable<Message["contentParts"]>[number] = {
    type: "text",
    text: overlayContent,
  };
  if (!parts?.length) {
    return [textPart];
  }

  const firstTextIndex = parts.findIndex((part) => part.type === "text");
  if (firstTextIndex < 0) {
    return [...parts, textPart];
  }

  return parts.flatMap<NonNullable<Message["contentParts"]>[number]>(
    (part, index) => {
      if (part.type !== "text") {
        return [part];
      }
      return index === firstTextIndex ? [textPart] : [];
    },
  );
}

interface MessageListItemWithStreamingOverlayProps {
  msg: Message;
  group: ReturnType<typeof buildMessageRenderGroupsProjection>[number];
  onOverlayUpdate?: () => void;
  render: (
    msg: Message,
    group: ReturnType<typeof buildMessageRenderGroupsProjection>[number],
    overlay: AgentStreamTextOverlaySnapshot | null,
  ) => React.ReactNode;
}

const MessageListItemWithStreamingOverlay = React.memo(
  ({
    msg,
    group,
    onOverlayUpdate,
    render,
  }: MessageListItemWithStreamingOverlayProps) => {
    const overlay = useAgentStreamTextOverlay(
      msg.role === "assistant" ? msg.id : null,
    );
    useEffect(() => {
      if (!overlay?.content) {
        return;
      }
      onOverlayUpdate?.();
    }, [onOverlayUpdate, overlay?.content, overlay?.updatedAt]);

    return <>{render(msg, group, overlay)}</>;
  },
);
MessageListItemWithStreamingOverlay.displayName =
  "MessageListItemWithStreamingOverlay";

const MessageListInner: React.FC<MessageListProps> = ({
  sessionId = null,
  messages,
  leadingContent,
  emptyStateVariant = "default",
  turns = [],
  threadItems = [],
  currentTurnId = null,
  threadRead = null,
  pendingActions = [],
  submittedActionsInFlight = [],
  queuedTurns = [],
  childSubagentSessions = [],
  sessionHistoryWindow = null,
  onLoadFullHistory,
  isSending = false,
  assistantLabel = "Lime",
  onQuoteMessage,
  onA2UISubmit,
  renderA2UIInline = true,
  a2uiFormDataMap,
  onA2UIFormChange,
  onWriteFile,
  onFileClick,
  onOpenArtifactFromTimeline,
  onOpenSavedSiteContent,
  onArtifactClick,
  onOpenMessagePreview,
  onSaveMessageAsSkill,
  onSaveMessageAsInspiration,
  onSaveMessageAsKnowledge,
  onOpenSubagentSession,
  onPermissionResponse,
  collapseCodeBlocks,
  shouldCollapseCodeBlock,
  onCodeBlockClick,
  promoteActionRequestsToA2UI = false,
  isRestoringSession = false,
  onInterruptCurrentTurn,
  compactLeadingSpacing = false,
  focusedTimelineItemId = null,
  timelineFocusRequestKey = 0,
  activePendingA2UISource = null,
  providerType,
}) => {
  const { t } = useTranslation("agent");
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousVisibleMessageCountRef = useRef<number | null>(null);
  const restoredSessionMetricRef = useRef<string | null>(null);
  const isTaskCenterEmptyState = emptyStateVariant === "task-center";
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [
    expandedLongHistoricalMessageIds,
    setExpandedLongHistoricalMessageIds,
  ] = useState<Set<string>>(() => new Set());
  const [
    expandedHistoricalAssistantMessageIds,
    setExpandedHistoricalAssistantMessageIds,
  ] = useState<Set<string>>(() => new Set());
  const [expandedHistoricalTimelineKeys, setExpandedHistoricalTimelineKeys] =
    useState<Set<string>>(() => new Set());

  const visibleMessages = useMemo(
    () => filterVisibleConversationMessages(messages),
    [messages],
  );
  const visibleMessageFirstId = visibleMessages[0]?.id ?? null;
  const visibleMessageLastId =
    visibleMessages[visibleMessages.length - 1]?.id ?? null;
  const persistedHiddenHistoryCount =
    sessionHistoryWindow &&
    sessionHistoryWindow.totalMessages > sessionHistoryWindow.loadedMessages
      ? sessionHistoryWindow.totalMessages - sessionHistoryWindow.loadedMessages
      : 0;
  const isRestoredHistoryWindow =
    isRestoringSession || persistedHiddenHistoryCount > 0;
  const [restoredPromptCacheNoticeReady, setRestoredPromptCacheNoticeReady] =
    useState(() => !isRestoredHistoryWindow);

  useEffect(() => {
    if (!isRestoredHistoryWindow) {
      setRestoredPromptCacheNoticeReady(true);
      return;
    }

    setRestoredPromptCacheNoticeReady(false);
    return scheduleMinimumDelayIdleTask(
      () => {
        setRestoredPromptCacheNoticeReady(true);
      },
      {
        minimumDelayMs: 1_500,
        idleTimeoutMs: 3_000,
      },
    );
  }, [isRestoredHistoryWindow, visibleMessageFirstId, visibleMessageLastId]);
  const messageRenderWindowSettings =
    resolveConversationMessageRenderWindowSettings(
      MESSAGE_LIST_RENDER_WINDOW_SETTINGS,
      isRestoredHistoryWindow,
    );
  const progressiveInitialRenderCount =
    messageRenderWindowSettings.initialRenderCount;
  const progressiveRenderBatchSize =
    messageRenderWindowSettings.renderBatchSize;
  const progressiveRenderMinimumDelayMs =
    messageRenderWindowSettings.minimumDelayMs;
  const shouldUseProgressiveRender = shouldUseConversationProgressiveRender({
    isSending,
    visibleMessageCount: visibleMessages.length,
    settings: messageRenderWindowSettings,
  });
  const visibleMessageWindowRef = useRef<{
    firstId: string | null;
    lastId: string | null;
    length: number;
  } | null>(null);
  const [renderedMessageCount, setRenderedMessageCount] = useState(() =>
    resolveInitialConversationRenderedMessageCount({
      isSending,
      visibleMessageCount: visibleMessages.length,
      settings: messageRenderWindowSettings,
    }),
  );

  useEffect(() => {
    const previousWindow = visibleMessageWindowRef.current;
    visibleMessageWindowRef.current = {
      firstId: visibleMessageFirstId,
      lastId: visibleMessageLastId,
      length: visibleMessages.length,
    };

    if (!shouldUseProgressiveRender) {
      setRenderedMessageCount(visibleMessages.length);
      return;
    }

    const isAppendOnlyUpdate =
      previousWindow !== null &&
      previousWindow.firstId === visibleMessageFirstId &&
      previousWindow.length <= visibleMessages.length &&
      previousWindow.lastId !== visibleMessageLastId;

    if (!isAppendOnlyUpdate) {
      setRenderedMessageCount(
        Math.min(visibleMessages.length, progressiveInitialRenderCount),
      );
      return;
    }

    const appendedCount = visibleMessages.length - previousWindow.length;
    if (appendedCount <= 0) {
      return;
    }

    setRenderedMessageCount((current) =>
      Math.min(
        visibleMessages.length,
        Math.max(current + appendedCount, progressiveInitialRenderCount),
      ),
    );
  }, [
    progressiveInitialRenderCount,
    shouldUseProgressiveRender,
    visibleMessageFirstId,
    visibleMessageLastId,
    visibleMessages.length,
  ]);

  const messageRenderWindow = useMemo(
    () =>
      buildConversationMessageRenderWindowProjection({
        visibleMessages,
        renderedMessageCount,
        isSending,
        isRestoredHistoryWindow,
        settings: messageRenderWindowSettings,
      }),
    [
      isRestoredHistoryWindow,
      isSending,
      messageRenderWindowSettings,
      renderedMessageCount,
      visibleMessages,
    ],
  );
  const hiddenHistoryCount = messageRenderWindow.hiddenHistoryCount;
  const shouldAutoHydrateHiddenHistory =
    messageRenderWindow.shouldAutoHydrateHiddenHistory;

  useEffect(() => {
    if (
      !shouldAutoHydrateHiddenHistory ||
      hiddenHistoryCount <= 0 ||
      isUserScrolling
    ) {
      return;
    }

    return scheduleMinimumDelayIdleTask(
      () => {
        setRenderedMessageCount((current) =>
          Math.min(
            visibleMessages.length,
            current + progressiveRenderBatchSize,
          ),
        );
      },
      {
        minimumDelayMs: progressiveRenderMinimumDelayMs,
        idleTimeoutMs: 1_200,
      },
    );
  }, [
    hiddenHistoryCount,
    isUserScrolling,
    progressiveRenderBatchSize,
    progressiveRenderMinimumDelayMs,
    shouldAutoHydrateHiddenHistory,
    visibleMessages.length,
  ]);

  const renderedMessages = messageRenderWindow.renderedMessages;
  const renderedAssistantMessageCount = useMemo(
    () =>
      renderedMessages.reduce(
        (count, message) => count + (message.role === "assistant" ? 1 : 0),
        0,
      ),
    [renderedMessages],
  );
  const renderedTurns = useMemo(() => {
    return resolveConversationRenderedTurns({
      turns,
      currentTurnId,
      hiddenHistoryCount,
      isRestoredHistoryWindow,
      renderedAssistantMessageCount,
      renderedMessageCount,
      progressiveInitialRenderCount,
    });
  }, [
    currentTurnId,
    hiddenHistoryCount,
    isRestoredHistoryWindow,
    progressiveInitialRenderCount,
    renderedAssistantMessageCount,
    renderedMessageCount,
    turns,
  ]);
  const renderedTurnIdSet = useMemo(() => {
    return resolveConversationRenderedTurnIdSet({
      renderedTurns,
      hiddenHistoryCount,
      isRestoredHistoryWindow,
    });
  }, [hiddenHistoryCount, isRestoredHistoryWindow, renderedTurns]);
  const activeCurrentTurn = useMemo(() => {
    if (!currentTurnId) {
      return null;
    }

    return renderedTurns.find((entry) => entry.id === currentTurnId) ?? null;
  }, [currentTurnId, renderedTurns]);
  const activeCurrentTurnId =
    activeCurrentTurn &&
    (activeCurrentTurn.status === "running" ||
      activeCurrentTurn.status === "failed")
      ? activeCurrentTurn.id
      : null;
  const timelineHydrationKey = [
    renderedMessages[renderedMessages.length - 1]?.id ?? "no-message",
    renderedTurns[renderedTurns.length - 1]?.id ?? "no-turn",
    `${threadItems.length}:${
      threadItems[threadItems.length - 1]?.id ?? "no-item"
    }`,
  ].join("|");
  const shouldDeferHistoricalTimeline =
    !isSending &&
    !activeCurrentTurnId &&
    !focusedTimelineItemId &&
    threadItems.length >= MESSAGE_LIST_TIMELINE_DEFER_ITEM_THRESHOLD &&
    (isRestoredHistoryWindow ||
      renderedMessages.length >= MESSAGE_LIST_TIMELINE_DEFER_MESSAGE_THRESHOLD);
  const shouldDeferHistoricalTimelineDetails =
    !focusedTimelineItemId &&
    (shouldDeferHistoricalTimeline ||
      hiddenHistoryCount > 0 ||
      persistedHiddenHistoryCount > 0);
  const [isHistoricalTimelineReady, setIsHistoricalTimelineReady] = useState(
    () => !shouldDeferHistoricalTimeline,
  );
  useEffect(() => {
    if (!shouldDeferHistoricalTimeline) {
      setIsHistoricalTimelineReady(true);
      return;
    }

    setIsHistoricalTimelineReady(false);
    return scheduleMinimumDelayIdleTask(
      () => {
        setIsHistoricalTimelineReady(true);
      },
      {
        minimumDelayMs: isRestoredHistoryWindow
          ? MESSAGE_LIST_RESTORED_HISTORICAL_TIMELINE_IDLE_DELAY_MS
          : MESSAGE_LIST_HISTORICAL_TIMELINE_IDLE_DELAY_MS,
        idleTimeoutMs: isRestoredHistoryWindow ? 1_800 : 900,
      },
    );
  }, [
    isRestoredHistoryWindow,
    shouldDeferHistoricalTimeline,
    timelineHydrationKey,
  ]);
  const canBuildHistoricalTimeline =
    !shouldDeferHistoricalTimeline || isHistoricalTimelineReady;
  const shouldDeferTailRuntimeStatusLine =
    isRestoredHistoryWindow &&
    shouldDeferHistoricalTimeline &&
    !isHistoricalTimelineReady &&
    !isSending &&
    !activeCurrentTurnId &&
    pendingActions.length === 0 &&
    queuedTurns.length === 0 &&
    (threadRead?.pending_requests?.length ?? 0) === 0;
  const shouldDeferRestoredThreadItemsUntilExpand =
    isRestoredHistoryWindow &&
    !focusedTimelineItemId &&
    !isSending &&
    !activeCurrentTurnId &&
    expandedHistoricalTimelineKeys.size === 0 &&
    threadItems.length >= MESSAGE_LIST_TIMELINE_DEFER_ITEM_THRESHOLD;
  const shouldDeferThreadItemsScan =
    !activeCurrentTurnId &&
    ((shouldDeferHistoricalTimeline && !isHistoricalTimelineReady) ||
      shouldDeferRestoredThreadItemsUntilExpand);
  const renderedThreadItemsMeasurement = useMemo(
    () =>
      measureMessageListComputation(() =>
        filterConversationThreadItemsForRenderedTurns({
          threadItems,
          renderedTurnIdSet,
          shouldDeferThreadItemsScan,
        }),
      ),
    [renderedTurnIdSet, shouldDeferThreadItemsScan, threadItems],
  );
  const renderedThreadItems = renderedThreadItemsMeasurement.value;
  const timelineByMessageIdMeasurement = useMemo(
    () =>
      measureMessageListComputation(() =>
        buildTimelineByMessageIdProjection({
          canBuildHistoricalTimeline,
          renderedMessages,
          renderedTurns,
          renderedThreadItems,
        }),
      ),
    [
      canBuildHistoricalTimeline,
      renderedMessages,
      renderedThreadItems,
      renderedTurns,
    ],
  );
  const timelineByMessageId = timelineByMessageIdMeasurement.value;
  const lastAssistantMessage = useMemo(
    () => resolveLastAssistantMessage(renderedMessages),
    [renderedMessages],
  );
  const lastAssistantMessageId = lastAssistantMessage?.id ?? null;
  const shouldInspectPromptCacheNotice = useMemo(
    () =>
      Boolean(
        providerType?.trim() &&
        restoredPromptCacheNoticeReady &&
        lastAssistantMessage?.usage &&
        !lastAssistantMessage.isThinking &&
        resolvePromptCacheActivity(lastAssistantMessage.usage) <= 0,
      ),
    [lastAssistantMessage, providerType, restoredPromptCacheNoticeReady],
  );
  const { providers } = useConfiguredProviders({
    autoLoad: shouldInspectPromptCacheNotice,
  });
  const promptCacheNotice = useMemo(
    () =>
      shouldInspectPromptCacheNotice
        ? resolveConfiguredProviderPromptCacheSupportNotice(
            providers,
            providerType,
          )
        : null,
    [providerType, providers, shouldInspectPromptCacheNotice],
  );
  const activeConversationRuntimeStatusLine = useMemo(
    () =>
      buildInputbarRuntimeStatusLineModel({
        messages: renderedMessages,
        turns: renderedTurns,
        threadItems: renderedThreadItems,
        currentTurnId: activeCurrentTurnId,
        threadRead,
        pendingActions,
        submittedActionsInFlight,
        queuedTurns,
        childSubagentSessions,
        isSending,
      }),
    [
      activeCurrentTurnId,
      childSubagentSessions,
      isSending,
      pendingActions,
      queuedTurns,
      renderedMessages,
      renderedThreadItems,
      renderedTurns,
      submittedActionsInFlight,
      threadRead,
    ],
  );
  const tailRuntimeStatusLine = useMemo(() => {
    if (!lastAssistantMessageId || shouldDeferTailRuntimeStatusLine) {
      return null;
    }

    return activeConversationRuntimeStatusLine;
  }, [
    activeConversationRuntimeStatusLine,
    lastAssistantMessageId,
    shouldDeferTailRuntimeStatusLine,
  ]);
  const currentTurnTimeline = useMemo(() => {
    return buildCurrentTurnTimelineProjection({
      activeCurrentTurnId,
      activeCurrentTurn,
      lastAssistantMessageId,
      timelineByMessageId,
      renderedThreadItems,
      renderedMessages,
    });
  }, [
    activeCurrentTurn,
    activeCurrentTurnId,
    lastAssistantMessageId,
    renderedMessages,
    renderedThreadItems,
    timelineByMessageId,
  ]);
  const messageGroupsMeasurement = useMemo(
    () =>
      measureMessageListComputation(() =>
        buildMessageGroupsProjection(renderedMessages),
      ),
    [renderedMessages],
  );
  const messageGroups = messageGroupsMeasurement.value;
  const renderGroupsMeasurement = useMemo(
    () =>
      measureMessageListComputation(() =>
        buildMessageRenderGroupsProjection({
          messageGroups,
          timelineByMessageId,
          currentTurnTimeline,
          lastAssistantMessageId,
        }),
      ),
    [
      currentTurnTimeline,
      lastAssistantMessageId,
      messageGroups,
      timelineByMessageId,
    ],
  );
  const renderGroups = renderGroupsMeasurement.value;
  const historicalMessageHydrationState = useMemo(
    () => ({
      activeCurrentTurnId,
      focusedTimelineItemId,
      isRestoredHistoryWindow,
      isSending,
    }),
    [
      activeCurrentTurnId,
      focusedTimelineItemId,
      isRestoredHistoryWindow,
      isSending,
    ],
  );
  const historicalMarkdownHydrationTargetsMeasurement = useMemo(
    () =>
      measureMessageListComputation(() =>
        buildHistoricalMarkdownHydrationTargets({
          messages: renderedMessages,
          state: historicalMessageHydrationState,
        }),
      ),
    [historicalMessageHydrationState, renderedMessages],
  );
  const historicalMarkdownHydrationTargets =
    historicalMarkdownHydrationTargetsMeasurement.value;
  const historicalMarkdownHydrationKey =
    historicalMarkdownHydrationTargets.join("|");
  const [hydratedHistoricalMarkdownCount, setHydratedHistoricalMarkdownCount] =
    useState(0);
  useEffect(() => {
    const total = historicalMarkdownHydrationTargets.length;
    if (!isRestoredHistoryWindow || !isHistoricalTimelineReady || total <= 0) {
      setHydratedHistoricalMarkdownCount(0);
      return;
    }

    setHydratedHistoricalMarkdownCount((current) => {
      const clampedCurrent = Math.min(current, total);
      if (clampedCurrent > 0) {
        return clampedCurrent;
      }
      return Math.min(
        total,
        MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_INITIAL_COUNT,
      );
    });
  }, [
    historicalMarkdownHydrationKey,
    historicalMarkdownHydrationTargets.length,
    isHistoricalTimelineReady,
    isRestoredHistoryWindow,
  ]);
  useEffect(() => {
    const total = historicalMarkdownHydrationTargets.length;
    if (
      !isRestoredHistoryWindow ||
      !isHistoricalTimelineReady ||
      hydratedHistoricalMarkdownCount >= total
    ) {
      return;
    }

    return scheduleMinimumDelayIdleTask(
      () => {
        setHydratedHistoricalMarkdownCount((current) =>
          Math.min(
            total,
            Math.max(
              current,
              MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_INITIAL_COUNT,
            ) + MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_BATCH_SIZE,
          ),
        );
      },
      {
        minimumDelayMs: MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_DELAY_MS,
        idleTimeoutMs: 700,
      },
    );
  }, [
    hydratedHistoricalMarkdownCount,
    historicalMarkdownHydrationKey,
    historicalMarkdownHydrationTargets.length,
    isHistoricalTimelineReady,
    isRestoredHistoryWindow,
  ]);
  const historicalMarkdownHydrationIndexByMessageId = useMemo(
    () =>
      buildHistoricalMarkdownHydrationIndexByMessageId(
        historicalMarkdownHydrationTargets,
      ),
    [historicalMarkdownHydrationTargets],
  );
  const shouldDeferHistoricalAssistantMessageDetails = useCallback(
    (message: Message): boolean =>
      shouldDeferHistoricalAssistantMessageDetailsProjection({
        message,
        state: historicalMessageHydrationState,
        isHistoricalTimelineReady,
        hydrationIndexByMessageId: historicalMarkdownHydrationIndexByMessageId,
        hydratedHistoricalMarkdownCount,
      }),
    [
      hydratedHistoricalMarkdownCount,
      historicalMarkdownHydrationIndexByMessageId,
      historicalMessageHydrationState,
      isHistoricalTimelineReady,
    ],
  );
  const historicalContentPartsDeferredMeasurement = useMemo(
    () =>
      measureMessageListComputation(() =>
        countDeferredHistoricalContentParts({
          messages: renderedMessages,
          state: historicalMessageHydrationState,
          isHistoricalTimelineReady,
          hydrationIndexByMessageId:
            historicalMarkdownHydrationIndexByMessageId,
          hydratedHistoricalMarkdownCount,
        }),
      ),
    [
      hydratedHistoricalMarkdownCount,
      historicalMarkdownHydrationIndexByMessageId,
      historicalMessageHydrationState,
      isHistoricalTimelineReady,
      renderedMessages,
    ],
  );
  const historicalContentPartsDeferredCount =
    historicalContentPartsDeferredMeasurement.value;
  const historicalMarkdownDeferredCount = countDeferredHistoricalMarkdown({
    isRestoredHistoryWindow,
    targetCount: historicalMarkdownHydrationTargets.length,
    hydratedHistoricalMarkdownCount,
  });
  const messageListMeasuredComputeMs =
    renderedThreadItemsMeasurement.durationMs +
    timelineByMessageIdMeasurement.durationMs +
    messageGroupsMeasurement.durationMs +
    renderGroupsMeasurement.durationMs +
    historicalMarkdownHydrationTargetsMeasurement.durationMs +
    historicalContentPartsDeferredMeasurement.durationMs;
  useEffect(() => {
    if (!sessionId) {
      restoredSessionMetricRef.current = null;
      return;
    }

    if (
      restoredSessionMetricRef.current &&
      restoredSessionMetricRef.current !== sessionId
    ) {
      restoredSessionMetricRef.current = null;
    }

    const shouldTrackRestoredSession =
      isRestoringSession ||
      isRestoredHistoryWindow ||
      hiddenHistoryCount > 0 ||
      persistedHiddenHistoryCount > 0;
    if (shouldTrackRestoredSession) {
      restoredSessionMetricRef.current = sessionId;
    }

    const shouldRecordRestoredFollowUp =
      restoredSessionMetricRef.current === sessionId &&
      visibleMessages.length > 0;
    const shouldRecord =
      shouldTrackRestoredSession || shouldRecordRestoredFollowUp;
    if (!shouldRecord) {
      return;
    }
    const shouldFinishRestoredFollowUp =
      shouldRecordRestoredFollowUp &&
      renderedMessages.length >= visibleMessages.length;

    const metricContext = {
      canBuildHistoricalTimeline,
      hiddenHistoryCount,
      isHistoricalTimelineReady,
      isRestoredHistoryWindow,
      isRestoringSession,
      historicalContentPartsDeferredCount,
      hydratedHistoricalMarkdownCount,
      historicalMarkdownDeferredCount,
      messageListComputeMs: messageListMeasuredComputeMs,
      messageListGroupBuildMs: messageGroupsMeasurement.durationMs,
      messageListHistoricalContentPartsScanMs:
        historicalContentPartsDeferredMeasurement.durationMs,
      messageListHistoricalMarkdownTargetScanMs:
        historicalMarkdownHydrationTargetsMeasurement.durationMs,
      messageListRenderGroupsMs: renderGroupsMeasurement.durationMs,
      messageListThreadItemsScanMs: renderedThreadItemsMeasurement.durationMs,
      messageListTimelineBuildMs: timelineByMessageIdMeasurement.durationMs,
      messagesCount: messages.length,
      persistedHiddenHistoryCount,
      renderedMessagesCount: renderedMessages.length,
      renderedTurnsCount: renderedTurns.length,
      recordReason: shouldTrackRestoredSession
        ? "restored-window"
        : "restored-follow-up",
      sessionId,
      shouldDeferHistoricalTimeline,
      tailRuntimeStatusDeferred: shouldDeferTailRuntimeStatusLine,
      threadItemsScanDeferred: shouldDeferThreadItemsScan,
      threadItemsCount: renderedThreadItems.length,
      timelineGroupsCount: renderGroups.length,
      turnsCount: turns.length,
      visibleMessagesCount: visibleMessages.length,
    };

    recordAgentUiPerformanceMetric("messageList.commit", metricContext);
    recordAgentUiProjectionEvents(
      buildHistoricalHydrationProjectionEvents(
        {
          sessionId,
          threadId: threadRead?.thread_id ?? null,
          recordReason: metricContext.recordReason,
          isRestoringSession,
          isRestoredHistoryWindow,
          isHistoricalTimelineReady,
          canBuildHistoricalTimeline,
          shouldDeferHistoricalTimeline,
          shouldDeferThreadItemsScan,
          shouldDeferTailRuntimeStatusLine,
          hiddenHistoryCount,
          persistedHiddenHistoryCount,
          targetCount: historicalMarkdownHydrationTargets.length,
          hydratedHistoricalMarkdownCount,
          historicalMarkdownDeferredCount,
          historicalContentPartsDeferredCount,
          messagesCount: messages.length,
          visibleMessagesCount: visibleMessages.length,
          renderedMessagesCount: renderedMessages.length,
          renderedTurnsCount: renderedTurns.length,
          threadItemsCount: renderedThreadItems.length,
          messageListComputeMs: messageListMeasuredComputeMs,
        },
        {
          timestamp: new Date().toISOString(),
          sessionId,
          threadId: threadRead?.thread_id ?? null,
        },
      ),
    );

    if (typeof window === "undefined" || !window.requestAnimationFrame) {
      recordAgentUiPerformanceMetric("messageList.paint", metricContext);
      if (shouldFinishRestoredFollowUp) {
        restoredSessionMetricRef.current = null;
      }
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      recordAgentUiPerformanceMetric("messageList.paint", metricContext);
      if (shouldFinishRestoredFollowUp) {
        restoredSessionMetricRef.current = null;
      }
    });

    return () => {
      window.cancelAnimationFrame?.(frameId);
    };
  }, [
    canBuildHistoricalTimeline,
    hiddenHistoryCount,
    historicalContentPartsDeferredCount,
    historicalContentPartsDeferredMeasurement.durationMs,
    historicalMarkdownHydrationTargets.length,
    historicalMarkdownHydrationTargetsMeasurement.durationMs,
    hydratedHistoricalMarkdownCount,
    historicalMarkdownDeferredCount,
    isHistoricalTimelineReady,
    isRestoredHistoryWindow,
    isRestoringSession,
    messageGroupsMeasurement.durationMs,
    messageListMeasuredComputeMs,
    messages.length,
    persistedHiddenHistoryCount,
    renderedThreadItemsMeasurement.durationMs,
    renderGroups.length,
    renderGroupsMeasurement.durationMs,
    renderedMessages.length,
    renderedThreadItems.length,
    renderedTurns.length,
    sessionId,
    shouldDeferHistoricalTimeline,
    shouldDeferTailRuntimeStatusLine,
    shouldDeferThreadItemsScan,
    threadRead?.thread_id,
    timelineByMessageIdMeasurement.durationMs,
    turns.length,
    visibleMessages.length,
  ]);
  const shouldKeepInlineProcessForActiveAssistant = useCallback(
    (
      message: Message,
      isConversationTailAssistant: boolean,
      hasProcessTimelineItems: boolean,
      hasTurnContext: boolean,
      displayContent: string,
    ): boolean => {
      if (message.role !== "assistant") {
        return false;
      }

      if (message.isThinking) {
        if (shouldSuppressAmbientStreamingReasoning(message, displayContent)) {
          return false;
        }
        return true;
      }

      if (
        isRetainedSkillProcessMessage(message) &&
        hasInlineThinkingContent(message)
      ) {
        return true;
      }

      if (!isConversationTailAssistant) {
        return false;
      }

      if (
        hasTurnContext &&
        !hasProcessTimelineItems &&
        hasInlineThinkingContent(message)
      ) {
        return true;
      }

      if (
        !hasTurnContext &&
        message.runtimeTurnId?.trim() &&
        hasInlineThinkingContent(message)
      ) {
        return true;
      }

      const hasRunningToolCall =
        (message.toolCalls || []).some(
          (toolCall) => toolCall.status === "running",
        ) ||
        (message.contentParts || []).some(
          (part) =>
            part.type === "tool_use" && part.toolCall.status === "running",
        );
      const hasPendingActionRequest =
        (message.actionRequests || []).some(
          (request) => request.status !== "submitted",
        ) ||
        (message.contentParts || []).some(
          (part) =>
            part.type === "action_required" &&
            part.actionRequired.status !== "submitted",
        );
      const hasActiveRuntimeStatus =
        Boolean(message.runtimeStatus) &&
        (message.isThinking || isSending) &&
        message.runtimeStatus?.phase !== "failed" &&
        message.runtimeStatus?.phase !== "cancelled";

      return (
        hasRunningToolCall || hasPendingActionRequest || hasActiveRuntimeStatus
      );
    },
    [isSending],
  );
  const handleExpandAllHistory = useCallback(() => {
    setRenderedMessageCount(visibleMessages.length);
  }, [visibleMessages.length]);
  const handleExpandLongHistoricalMessage = useCallback((messageId: string) => {
    setExpandedLongHistoricalMessageIds((current) => {
      if (current.has(messageId)) {
        return current;
      }

      const next = new Set(current);
      next.add(messageId);
      return next;
    });
  }, []);
  const handleExpandHistoricalAssistantMessage = useCallback(
    (messageId: string) => {
      setExpandedHistoricalAssistantMessageIds((current) => {
        if (current.has(messageId)) {
          return current;
        }

        const next = new Set(current);
        next.add(messageId);
        return next;
      });
    },
    [],
  );
  const handleExpandHistoricalTimeline = useCallback((timelineKey: string) => {
    setExpandedHistoricalTimelineKeys((current) => {
      if (current.has(timelineKey)) {
        return current;
      }

      const next = new Set(current);
      next.add(timelineKey);
      return next;
    });
  }, []);

  // 检测用户是否在手动滚动
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px 容差

      setIsUserScrolling(true);
      setShouldAutoScroll(isAtBottom);

      // 清除之前的定时器
      clearTimeout(scrollTimeout);

      // 500ms 后认为用户停止滚动
      scrollTimeout = setTimeout(() => {
        setIsUserScrolling(false);
      }, 500);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  // 恢复历史会话时需要在首帧前把视口定位到底部，避免先闪顶部空白再平滑滚动。
  useLayoutEffect(() => {
    const previousVisibleMessageCount = previousVisibleMessageCountRef.current;
    previousVisibleMessageCountRef.current = renderedMessages.length;

    if (!shouldAutoScroll || isUserScrolling || !scrollRef.current) {
      return;
    }

    const shouldAnimateScroll =
      !isRestoringSession &&
      previousVisibleMessageCount !== null &&
      previousVisibleMessageCount > 0 &&
      renderedMessages.length <= previousVisibleMessageCount + 1;

    scrollRef.current.scrollIntoView({
      behavior: shouldAnimateScroll ? "smooth" : "auto",
      block: "end",
    });
  }, [renderedMessages, shouldAutoScroll, isUserScrolling, isRestoringSession]);

  const handleCopy = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      toast.success(t("agentChat.messageList.toast.copySuccess"));
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error(t("agentChat.messageList.toast.copyFailed"));
    }
  };

  const handleStreamingOverlayUpdate = useCallback(() => {
    if (!shouldAutoScroll || isUserScrolling || !scrollRef.current) {
      return;
    }

    const scrollToTail = () => {
      scrollRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
    };

    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(scrollToTail);
      return;
    }

    scrollToTail();
  }, [isUserScrolling, shouldAutoScroll]);

  const renderMessageItem = (
    msg: Message,
    group: (typeof renderGroups)[number],
    streamingTextOverlay: AgentStreamTextOverlaySnapshot | null = null,
  ) => {
    const rawDisplayContent =
      msg.role === "assistant" && streamingTextOverlay?.content
        ? streamingTextOverlay.content
        : msg.content || "";
    const hasImages = Array.isArray(msg.images) && msg.images.length > 0;
    const shouldSuppressStandaloneImageWorkbenchProcess =
      msg.role === "assistant" &&
      !msg.imageWorkbenchPreview &&
      shouldSuppressImageWorkbenchStatusText(rawDisplayContent);
    const shouldSuppressImageProcessFlow = Boolean(
      msg.imageWorkbenchPreview ||
      shouldSuppressStandaloneImageWorkbenchProcess,
    );
    const shouldSuppressImageWorkbenchAssistantText =
      msg.role === "assistant" &&
      Boolean(msg.imageWorkbenchPreview) &&
      shouldSuppressImageWorkbenchStatusText(rawDisplayContent);
    const visibleRawDisplayContent =
      msg.role === "assistant" &&
      (shouldSuppressImageWorkbenchAssistantText ||
        shouldSuppressStandaloneImageWorkbenchProcess)
        ? ""
        : rawDisplayContent;
    const displayContent = sanitizeMessageTextForDisplay(
      visibleRawDisplayContent,
      {
        role: msg.role,
        hasImages,
      },
    );
    const shouldDeferMessageDetails =
      shouldDeferHistoricalAssistantMessageDetails(msg);
    const rawRuntimePeerContent = visibleRawDisplayContent.trim();
    const shouldRenderRuntimePeerCards =
      rawRuntimePeerContent.length > 0 &&
      isPureRuntimePeerMessageText(rawRuntimePeerContent);
    const displayContentParts = shouldDeferMessageDetails
      ? undefined
      : shouldSuppressImageProcessFlow
        ? undefined
        : sanitizeContentPartsForDisplay(msg.contentParts, {
            role: msg.role,
            hasImages,
          });
    const isConversationTailAssistant =
      msg.role === "assistant" && msg.id === group.lastAssistantId;
    const timeline =
      msg.role !== "assistant"
        ? null
        : isConversationTailAssistant
          ? group.timeline
          : null;
    const hasProcessTimelineItems = hasTimelineProcessItems(timeline?.items);
    const includeInlineProcessFlow =
      !shouldDeferMessageDetails &&
      !shouldSuppressImageProcessFlow &&
      msg.role === "assistant" &&
      shouldKeepInlineProcessForActiveAssistant(
        msg,
        isConversationTailAssistant,
        hasProcessTimelineItems,
        Boolean(timeline),
        displayContent,
      );
    const conversationContentParts =
      msg.role === "assistant"
        ? mergeStreamingOverlayContentParts(
            filterConversationDisplayContentParts(displayContentParts, {
              includeProcessFlow: includeInlineProcessFlow,
              preserveToolUseParts: !hasProcessTimelineItems,
            }),
            streamingTextOverlay?.content || null,
          )
        : displayContentParts;
    const conversationThinkingContent =
      msg.role === "assistant" && includeInlineProcessFlow
        ? msg.thinkingContent
        : undefined;
    const imageWorkbenchThinkingContent =
      msg.role === "assistant" && msg.imageWorkbenchPreview
        ? resolveInlineThinkingContent(msg)
        : undefined;
    const conversationToolCalls =
      msg.role === "assistant" && includeInlineProcessFlow
        ? msg.toolCalls
        : undefined;
    const inlineProcessCoverage = resolveInlineProcessCoverage({
      contentParts: conversationContentParts,
      thinkingContent: conversationThinkingContent,
      toolCalls: conversationToolCalls,
      actionRequests: msg.actionRequests,
    });
    const shouldLetInlineProcessOwnActiveTurn =
      timeline !== null &&
      timeline.turn.status !== "completed" &&
      includeInlineProcessFlow &&
      inlineProcessCoverage.hasInlineProcessEntries;
    const timelineConversationItems = timeline
      ? timeline.items.filter((item) =>
          shouldRenderConversationTimelineItem(item, timeline.items, {
            hasInlineRuntimeStatus: Boolean(msg.runtimeStatus),
          }),
        )
      : [];
    const timelineConversationItemIds =
      timelineConversationItems.length > 0
        ? new Set(timelineConversationItems.map((item) => item.id))
        : null;
    const isInlineCoveredTimelineItem = createInlineCoverageMatcher(
      inlineProcessCoverage,
    );
    const primaryTimelineItems = timeline
      ? timeline.items.filter((item) => {
          if (shouldLetInlineProcessOwnActiveTurn) {
            return false;
          }

          if (!timelineConversationItemIds?.has(item.id)) {
            return false;
          }

          if (isDeferredTimelineItem(item)) {
            return false;
          }

          if (!inlineProcessCoverage.hasInlineProcessEntries) {
            return true;
          }

          if (isInlineCoveredTimelineItem(item)) {
            return false;
          }

          return true;
        })
      : [];
    const shouldHoldPreAnswerThinkingTimeline =
      timeline !== null &&
      shouldSuppressPreAnswerThinkingTimeline({
        message: msg,
        turn: timeline.turn,
        items: primaryTimelineItems,
        displayContent,
      });
    const visiblePrimaryTimelineItems = shouldHoldPreAnswerThinkingTimeline
      ? []
      : primaryTimelineItems;
    const trailingTimelineItems = timeline
      ? dedupeDeferredTimelineItems(
          timelineConversationItems.filter((item) =>
            isDeferredTimelineItem(item),
          ),
        ).filter(
          (item) =>
            item.type !== "file_artifact" ||
            !isHiddenConversationArtifactPath(item.path),
        )
      : [];
    const hasDeferredHistoricalTimelineDetails =
      Boolean(timeline) &&
      isRestoredHistoryWindow &&
      shouldDeferThreadItemsScan &&
      timeline?.turn.status === "completed" &&
      timeline.turn.id !== activeCurrentTurnId;
    const primaryTimeline =
      !shouldSuppressImageProcessFlow &&
      timeline &&
      (visiblePrimaryTimelineItems.length > 0 ||
        hasDeferredHistoricalTimelineDetails)
        ? { ...timeline, items: visiblePrimaryTimelineItems }
        : null;
    const trailingTimeline =
      !shouldSuppressImageProcessFlow &&
      timeline &&
      trailingTimelineItems.length > 0
        ? { ...timeline, items: trailingTimelineItems }
        : null;
    const hasTrailingArtifactTimelineItems = trailingTimelineItems.some(
      (item) => item.type === "file_artifact",
    );
    const timelineActionRequests = inlineProcessCoverage.actionRequestCounts
      .size
      ? undefined
      : msg.actionRequests;
    const primaryActionRequests =
      visiblePrimaryTimelineItems.length > 0
        ? timelineActionRequests
        : undefined;
    const trailingActionRequests =
      visiblePrimaryTimelineItems.length === 0
        ? timelineActionRequests
        : undefined;
    const shouldSuppressInlineA2UI =
      activePendingA2UISource?.kind !== "action_request" &&
      activePendingA2UISource?.messageId === msg.id;
    const suppressedActionRequestId =
      activePendingA2UISource?.kind === "action_request" &&
      (msg.actionRequests || []).some(
        (request) => request.requestId === activePendingA2UISource.requestId,
      )
        ? activePendingA2UISource.requestId
        : null;
    const actionContent = displayContent.trim();
    const installedSkillMessageLabel =
      msg.role === "user" ? resolveInstalledSkillMessageLabel(msg) : null;
    const isUserCommandMessage =
      msg.role === "user" &&
      !installedSkillMessageLabel &&
      Boolean(
        parseLeadingUserCommandTag(displayContent, msg.inputCapabilityRoute),
      );
    const hasVisibleAssistantText = Boolean(actionContent);
    const shouldCollapseLongHistoricalMessage =
      isRestoredHistoryWindow &&
      msg.role === "assistant" &&
      !msg.isThinking &&
      actionContent.length > MESSAGE_LIST_LONG_HISTORICAL_MESSAGE_THRESHOLD &&
      !expandedLongHistoricalMessageIds.has(msg.id);
    const hasNonTextConversationContentParts = Boolean(
      conversationContentParts?.some((part) => part.type !== "text"),
    );
    const shouldFlattenHistoricalAssistantContent =
      isRestoredHistoryWindow &&
      msg.role === "assistant" &&
      !msg.isThinking &&
      !includeInlineProcessFlow &&
      !hasNonTextConversationContentParts &&
      actionContent.length > 0 &&
      !shouldCollapseLongHistoricalMessage;
    const shouldCompactHistoricalAssistantMessage =
      isRestoredHistoryWindow &&
      msg.role === "assistant" &&
      !msg.isThinking &&
      !focusedTimelineItemId &&
      !includeInlineProcessFlow &&
      !hasNonTextConversationContentParts &&
      !((msg.actionRequests || []).length > 0) &&
      !actionContent.includes("```a2ui") &&
      actionContent.length >
        MESSAGE_LIST_COMPACT_HISTORICAL_ASSISTANT_THRESHOLD &&
      !expandedLongHistoricalMessageIds.has(msg.id) &&
      !expandedHistoricalAssistantMessageIds.has(msg.id);
    const shouldPreviewHistoricalAssistantMessage =
      shouldCollapseLongHistoricalMessage ||
      shouldCompactHistoricalAssistantMessage;
    const historicalAssistantPreviewContent =
      shouldCollapseLongHistoricalMessage
        ? buildLongHistoricalMessagePreview(displayContent)
        : shouldCompactHistoricalAssistantMessage
          ? buildHistoricalMessagePreview(
              displayContent,
              MESSAGE_LIST_COMPACT_HISTORICAL_ASSISTANT_PREVIEW_CHARS,
            )
          : "";
    const rendererContent = shouldCollapseLongHistoricalMessage
      ? buildLongHistoricalMessagePreview(displayContent)
      : displayContent;
    const rendererRawContent =
      shouldCollapseLongHistoricalMessage ||
      shouldFlattenHistoricalAssistantContent
        ? rendererContent
        : visibleRawDisplayContent;
    const rendererContentParts =
      shouldCollapseLongHistoricalMessage ||
      shouldFlattenHistoricalAssistantContent
        ? undefined
        : conversationContentParts;
    const rendererThinkingContent = shouldCollapseLongHistoricalMessage
      ? undefined
      : conversationThinkingContent;
    const rendererToolCalls = shouldCollapseLongHistoricalMessage
      ? undefined
      : conversationToolCalls;
    const rendererActionRequests =
      shouldCollapseLongHistoricalMessage || shouldSuppressImageProcessFlow
        ? undefined
        : msg.actionRequests;
    const rendererMarkdownRenderMode =
      shouldCollapseLongHistoricalMessage ||
      shouldFlattenHistoricalAssistantContent
        ? "light"
        : "standard";
    const canQuoteMessage = Boolean(onQuoteMessage && actionContent);
    const canCopyMessage = Boolean(actionContent);
    const canSaveMessageAsSkill = Boolean(
      onSaveMessageAsSkill &&
      msg.role === "assistant" &&
      !msg.imageWorkbenchPreview &&
      !msg.isThinking &&
      actionContent &&
      actionContent.length >= 24,
    );
    const canSaveMessageAsInspiration = Boolean(
      onSaveMessageAsInspiration &&
      msg.role === "assistant" &&
      !msg.imageWorkbenchPreview &&
      !msg.isThinking &&
      actionContent &&
      actionContent.length >= 24,
    );
    const knowledgeArtifactSource =
      msg.role === "assistant"
        ? resolveKnowledgeSourceFromArtifacts(msg.artifacts)
        : null;
    const knowledgeSaveContent =
      knowledgeArtifactSource?.content.trim() || actionContent;
    const canSaveMessageAsKnowledge = Boolean(
      onSaveMessageAsKnowledge &&
      msg.role === "assistant" &&
      !msg.imageWorkbenchPreview &&
      !msg.isThinking &&
      knowledgeSaveContent &&
      knowledgeSaveContent.length >= 24,
    );
    const showMessageActions =
      ((msg.role === "user" &&
        !isUserCommandMessage &&
        (canQuoteMessage || canCopyMessage)) ||
        (msg.role === "assistant" &&
          Boolean(msg.imageWorkbenchPreview) &&
          (canQuoteMessage || canCopyMessage)) ||
        canSaveMessageAsSkill ||
        canSaveMessageAsInspiration ||
        canSaveMessageAsKnowledge);
    const messageSavedSiteContentTarget =
      msg.role === "assistant"
        ? resolveLatestProjectFileSavedSiteContentTargetFromMessage(msg)
        : null;
    const shouldRenderMessageCanvasShortcut = Boolean(
      messageSavedSiteContentTarget &&
      onOpenSavedSiteContent &&
      !msg.imageWorkbenchPreview &&
      !hasTrailingArtifactTimelineItems,
    );
    const visibleAssistantArtifacts =
      msg.role === "assistant" && !shouldSuppressImageProcessFlow
        ? (msg.artifacts || []).filter(
            (artifact) =>
              !isHiddenConversationArtifactPath(
                resolveArtifactProtocolFilePath(artifact),
              ),
          )
        : [];
    const messageCanvasShortcutTitle = messageSavedSiteContentTarget
      ? resolveSiteSavedContentTargetDisplayName(
          messageSavedSiteContentTarget,
        ) || "导出稿"
      : "文件";
    const messageCanvasShortcutPath = messageSavedSiteContentTarget
      ? resolveSiteSavedContentTargetRelativePath(messageSavedSiteContentTarget)
      : null;
    const shouldDeferHistoricalMarkdownRender =
      shouldDeferMessageDetails &&
      msg.role === "assistant" &&
      hasVisibleAssistantText &&
      !shouldPreviewHistoricalAssistantMessage &&
      !hasImages &&
      !hasNonTextConversationContentParts &&
      visibleAssistantArtifacts.length === 0 &&
      !shouldRenderMessageCanvasShortcut &&
      !msg.imageWorkbenchPreview &&
      !msg.taskPreview &&
      !hasStructuredHistoricalContentHint(actionContent);
    const shouldRenderFirstTokenRuntimeStatus =
      msg.role === "assistant" &&
      msg.isThinking &&
      !shouldSuppressImageProcessFlow &&
      !shouldRenderRuntimeStatusPill(msg.runtimeStatus) &&
      !hasVisibleAssistantText &&
      !conversationContentParts?.length &&
      !conversationThinkingContent?.trim() &&
      !conversationToolCalls?.length &&
      !((rendererActionRequests || []).length > 0) &&
      !((msg.images || []).length > 0) &&
      visibleAssistantArtifacts.length === 0 &&
      !shouldRenderMessageCanvasShortcut &&
      !msg.imageWorkbenchPreview &&
      !msg.taskPreview;
    const shouldCollapseAssistantShell =
      msg.role === "assistant" &&
      !hasVisibleAssistantText &&
      !conversationContentParts?.length &&
      !conversationThinkingContent?.trim() &&
      !conversationToolCalls?.length &&
      !((rendererActionRequests || []).length > 0) &&
      !primaryTimeline &&
      !trailingTimeline &&
      !((msg.images || []).length > 0) &&
      visibleAssistantArtifacts.length === 0 &&
      !shouldRenderMessageCanvasShortcut &&
      !msg.imageWorkbenchPreview &&
      !msg.taskPreview;
    const hasAssistantBodyContent =
      msg.role !== "assistant" || !shouldCollapseAssistantShell;
    const shouldSuppressActiveRuntimeLine =
      tailRuntimeStatusLine?.status === "running" ||
      tailRuntimeStatusLine?.status === "queued";
    const shouldRenderTailRuntimeStatusLine =
      msg.role === "assistant" &&
      !msg.imageWorkbenchPreview &&
      msg.id === lastAssistantMessageId &&
      isConversationTailAssistant &&
      Boolean(tailRuntimeStatusLine) &&
      !shouldSuppressActiveRuntimeLine;
    const shouldRenderActiveRuntimeFooterIndicator =
      msg.role === "assistant" &&
      !msg.imageWorkbenchPreview &&
      msg.id === lastAssistantMessageId &&
      isConversationTailAssistant &&
      hasAssistantBodyContent &&
      Boolean(activeConversationRuntimeStatusLine) &&
      (activeConversationRuntimeStatusLine?.status === "running" ||
        activeConversationRuntimeStatusLine?.status === "queued") &&
      !shouldPreviewHistoricalAssistantMessage &&
      !shouldDeferHistoricalMarkdownRender;
    const shouldRenderImageWorkbenchUsageFooter =
      msg.role === "assistant" &&
      Boolean(msg.imageWorkbenchPreview) &&
      msg.imageWorkbenchPreview?.status === "complete" &&
      isConversationTailAssistant &&
      !msg.isThinking &&
      Boolean(msg.usage);
    const shouldSuppressAssistantMetaFooter =
      shouldSuppressStandaloneImageWorkbenchProcess ||
      Boolean(msg.imageWorkbenchPreview && !shouldRenderImageWorkbenchUsageFooter);
    const shouldRenderUsageFooter =
      shouldRenderImageWorkbenchUsageFooter ||
      (!msg.imageWorkbenchPreview &&
        isConversationTailAssistant &&
        !shouldSuppressAssistantMetaFooter &&
        !shouldRenderTailRuntimeStatusLine &&
        !shouldRenderActiveRuntimeFooterIndicator &&
        !msg.isThinking &&
        Boolean(msg.usage));
    const shouldRenderStatusPill =
      !msg.imageWorkbenchPreview &&
      !shouldSuppressAssistantMetaFooter &&
      !shouldRenderTailRuntimeStatusLine &&
      shouldRenderRuntimeStatusPill(msg.runtimeStatus);
    const assistantMetaFooter =
      msg.role === "assistant" &&
      !shouldSuppressAssistantMetaFooter &&
      (shouldRenderTailRuntimeStatusLine ||
        shouldRenderActiveRuntimeFooterIndicator ||
        shouldRenderStatusPill ||
        shouldRenderUsageFooter) ? (
        <div
          className={
            hasAssistantBodyContent
              ? "mt-2 flex flex-wrap items-center gap-2"
              : "flex flex-wrap items-center gap-2 px-1 py-0.5"
          }
          data-testid="assistant-message-meta-footer"
        >
          {shouldRenderTailRuntimeStatusLine ? (
            <InputbarRuntimeStatusLine
              runtime={tailRuntimeStatusLine || null}
              providerType={providerType}
              canStop={Boolean(onInterruptCurrentTurn)}
            />
          ) : null}
          {shouldRenderActiveRuntimeFooterIndicator &&
          activeConversationRuntimeStatusLine ? (
            <AssistantStreamingInlineIndicator
              runtime={activeConversationRuntimeStatusLine}
            />
          ) : null}
          {shouldRenderStatusPill && msg.runtimeStatus ? (
            <MessageRuntimeStatusPill status={msg.runtimeStatus} />
          ) : null}
          {shouldRenderUsageFooter ? (
            <TokenUsageDisplay
              usage={msg.usage!}
              inline={true}
              promptCacheNotice={
                resolvePromptCacheActivity(msg.usage!) <= 0
                  ? promptCacheNotice
                  : undefined
              }
            />
          ) : null}
        </div>
      ) : null;
    const firstTokenRuntimeStatusNode = shouldRenderFirstTokenRuntimeStatus ? (
      <AssistantFirstTokenRuntimeStatus status={msg.runtimeStatus} />
    ) : null;

    if (
      msg.role === "assistant" &&
      !hasAssistantBodyContent &&
      !assistantMetaFooter &&
      !firstTokenRuntimeStatusNode
    ) {
      return null;
    }

    const primaryTimelineKey = primaryTimeline
      ? `leading:${primaryTimeline.turn.id}`
      : null;
    const arePrimaryTimelineDetailsDeferred =
      Boolean(primaryTimeline) &&
      shouldDeferThreadItemsScan &&
      primaryTimeline?.turn.status === "completed" &&
      primaryTimeline.turn.id !== activeCurrentTurnId;
    const shouldRenderCompactPrimaryTimeline =
      Boolean(primaryTimelineKey) &&
      isRestoredHistoryWindow &&
      !focusedTimelineItemId &&
      primaryTimeline?.turn.status === "completed" &&
      primaryTimeline.turn.id !== activeCurrentTurnId &&
      (arePrimaryTimelineDetailsDeferred ||
        primaryTimeline.items.length >=
          MESSAGE_LIST_HISTORICAL_TIMELINE_COMPACT_ITEM_THRESHOLD) &&
      !expandedHistoricalTimelineKeys.has(primaryTimelineKey!);
    const primaryTimelineNode =
      msg.role === "assistant" && primaryTimeline ? (
        shouldRenderCompactPrimaryTimeline && primaryTimelineKey ? (
          <HistoricalTimelinePreview
            items={primaryTimeline.items}
            placement="leading"
            detailsDeferred={arePrimaryTimelineDetailsDeferred}
            onExpand={() => handleExpandHistoricalTimeline(primaryTimelineKey)}
          />
        ) : (
          <AgentThreadTimeline
            turn={primaryTimeline.turn}
            items={primaryTimeline.items}
            threadRead={threadRead}
            actionRequests={primaryActionRequests}
            isCurrentTurn={primaryTimeline.turn.id === activeCurrentTurnId}
            collapseInactiveDetails={!isSending}
            deferCompletedSingleDetails={
              shouldDeferHistoricalTimelineDetails &&
              primaryTimeline.turn.id !== activeCurrentTurnId
            }
            placement="leading"
            onFileClick={onFileClick}
            onOpenArtifactFromTimeline={onOpenArtifactFromTimeline}
            sourceMessageId={msg.id}
            onSaveFileArtifactAsKnowledge={onSaveMessageAsKnowledge}
            onOpenSavedSiteContent={onOpenSavedSiteContent}
            onOpenSubagentSession={onOpenSubagentSession}
            onPermissionResponse={onPermissionResponse}
            focusedItemId={focusedTimelineItemId}
            focusRequestKey={timelineFocusRequestKey}
          />
        )
      ) : null;
    const shouldRenderPrimaryTimelineOutsideBubble =
      msg.role === "assistant" &&
      Boolean(primaryTimelineNode) &&
      hasVisibleAssistantText;
    const shouldRenderImageWorkbenchBareBubble =
      msg.role === "assistant" &&
      Boolean(msg.imageWorkbenchPreview) &&
      !primaryTimeline &&
      !trailingTimeline &&
      !hasImages &&
      visibleAssistantArtifacts.length === 0 &&
      !shouldRenderMessageCanvasShortcut &&
      !msg.taskPreview;

    return (
      <MessageWrapper
        key={msg.id}
        $isUser={msg.role === "user"}
        $compactLeadingSpacing={compactLeadingSpacing}
      >
        <ContentColumn $isUser={msg.role === "user"}>
          {shouldRenderPrimaryTimelineOutsideBubble ? (
            <div
              className="mb-2"
              data-testid="assistant-primary-timeline-shell"
            >
              {primaryTimelineNode}
            </div>
          ) : null}
          {firstTokenRuntimeStatusNode ? (
            <div
              className="mb-1.5 px-1"
              data-testid="assistant-runtime-status-shell"
            >
              {firstTokenRuntimeStatusNode}
            </div>
          ) : null}
          {hasAssistantBodyContent ? (
            <MessageBubble
              $isUser={msg.role === "user"}
              $bareMedia={shouldRenderImageWorkbenchBareBubble}
              className={
                isUserCommandMessage ? "message-bubble-user-command" : undefined
              }
              aria-label={msg.role === "assistant" ? assistantLabel : undefined}
            >
              {msg.role === "assistant" ? (
                <>
                  {shouldRenderPrimaryTimelineOutsideBubble
                    ? null
                    : primaryTimelineNode}

                  {shouldPreviewHistoricalAssistantMessage ? (
                    <HistoricalAssistantMessagePreview
                      content={historicalAssistantPreviewContent}
                      contentLength={actionContent.length}
                      variant={
                        shouldCollapseLongHistoricalMessage ? "long" : "compact"
                      }
                      onExpand={() => {
                        if (shouldCollapseLongHistoricalMessage) {
                          handleExpandLongHistoricalMessage(msg.id);
                          return;
                        }

                        handleExpandHistoricalAssistantMessage(msg.id);
                      }}
                    />
                  ) : shouldDeferHistoricalMarkdownRender ? (
                    <HistoricalMarkdownHydrationPreview
                      content={rendererContent}
                    />
                  ) : msg.imageWorkbenchPreview ? (
                    <>
                      {imageWorkbenchThinkingContent ? (
                        <StreamingRenderer
                          content=""
                          rawContent=""
                          isStreaming={false}
                          showCursor={false}
                          thinkingContent={imageWorkbenchThinkingContent}
                          contentParts={undefined}
                          toolCalls={undefined}
                          actionRequests={undefined}
                          markdownRenderMode="light"
                        />
                      ) : null}
                      {hasVisibleAssistantText ? (
                        <ImageWorkbenchAssistantIntro
                          content={rendererContent}
                        />
                      ) : null}
                    </>
                  ) : (
                    <StreamingRenderer
                      content={rendererContent}
                      rawContent={rendererRawContent}
                      isStreaming={msg.isThinking}
                      toolCalls={rendererToolCalls}
                      showCursor={msg.isThinking && !displayContent}
                      thinkingContent={rendererThinkingContent}
                      runtimeStatus={msg.runtimeStatus}
                      contentParts={rendererContentParts}
                      actionRequests={rendererActionRequests}
                      onA2UISubmit={
                        onA2UISubmit
                          ? (formData) => onA2UISubmit(formData, msg.id)
                          : undefined
                      }
                      a2uiFormId={a2uiFormDataMap?.[msg.id]?.formId}
                      a2uiInitialFormData={a2uiFormDataMap?.[msg.id]?.formData}
                      onA2UIFormChange={onA2UIFormChange}
                      renderA2UIInline={
                        renderA2UIInline && !shouldSuppressInlineA2UI
                      }
                      onWriteFile={
                        onWriteFile
                          ? (content, fileName, context) =>
                              onWriteFile(content, fileName, {
                                ...context,
                                sourceMessageId:
                                  context?.sourceMessageId || msg.id,
                                source: context?.source || "message_content",
                              })
                          : undefined
                      }
                      onFileClick={onFileClick}
                      onOpenSavedSiteContent={onOpenSavedSiteContent}
                      onPermissionResponse={onPermissionResponse}
                      collapseCodeBlocks={collapseCodeBlocks}
                      shouldCollapseCodeBlock={shouldCollapseCodeBlock}
                      onCodeBlockClick={onCodeBlockClick}
                      promoteActionRequestsToA2UI={promoteActionRequestsToA2UI}
                      suppressedActionRequestId={suppressedActionRequestId}
                      showRuntimeStatusInline={true}
                      renderProposedPlanBlocks={
                        !primaryTimeline ||
                        inlineProcessCoverage.hasInlineProcessEntries
                      }
                      suppressProcessFlow={shouldSuppressImageProcessFlow}
                      showContentBlockActions={Boolean(actionContent)}
                      markdownRenderMode={rendererMarkdownRenderMode}
                      onQuoteContent={
                        onQuoteMessage
                          ? (quotedContent) =>
                              onQuoteMessage(quotedContent, msg.id)
                          : undefined
                      }
                    />
                  )}
                  {shouldRenderMessageCanvasShortcut ? (
                    <button
                      type="button"
                      className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-left transition-colors hover:bg-emerald-100/80"
                      data-testid="message-canvas-shortcut"
                      onClick={() => {
                        if (
                          messageSavedSiteContentTarget &&
                          onOpenSavedSiteContent
                        ) {
                          onOpenSavedSiteContent(messageSavedSiteContentTarget);
                        }
                      }}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-6 text-emerald-900">
                          在画布中打开 {messageCanvasShortcutTitle}
                        </span>
                        {messageCanvasShortcutPath ? (
                          <span className="block truncate text-xs leading-5 text-emerald-700/80">
                            {messageCanvasShortcutPath}
                          </span>
                        ) : null}
                      </span>
                      <ExternalLink className="h-4 w-4 shrink-0 text-emerald-700" />
                    </button>
                  ) : null}
                  {msg.imageWorkbenchPreview ? (
                    <div className={hasVisibleAssistantText ? "mt-2.5" : ""}>
                      <ImageWorkbenchMessagePreview
                        preview={msg.imageWorkbenchPreview}
                        onOpen={
                          onOpenMessagePreview
                            ? (preview) =>
                                onOpenMessagePreview(
                                  {
                                    kind: "image_workbench",
                                    preview,
                                  },
                                  msg,
                                )
                            : undefined
                        }
                      />
                    </div>
                  ) : null}
                  {msg.taskPreview ? (
                    <TaskMessagePreview
                      preview={msg.taskPreview}
                      onOpen={
                        onOpenMessagePreview
                          ? (preview) =>
                              onOpenMessagePreview(
                                {
                                  kind: "task",
                                  preview,
                                },
                                msg,
                              )
                          : undefined
                      }
                    />
                  ) : null}
                </>
              ) : displayContent ? (
                installedSkillMessageLabel ? (
                  <UserInstalledSkillMessageContent
                    content={displayContent}
                    label={installedSkillMessageLabel}
                  />
                ) : isUserCommandMessage ? (
                  <UserCommandMessageContent
                    content={displayContent}
                    route={msg.inputCapabilityRoute}
                  />
                ) : shouldRenderRuntimePeerCards ? (
                  <RuntimePeerMessageCards text={rawRuntimePeerContent} />
                ) : (
                  <MarkdownRenderer
                    content={displayContent}
                    onA2UISubmit={
                      onA2UISubmit
                        ? (formData) => onA2UISubmit(formData, msg.id)
                        : undefined
                    }
                    renderA2UIInline={renderA2UIInline}
                  />
                )
              ) : null}

              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {msg.images.map((img, i) => (
                    <img
                      key={i}
                      src={`data:${img.mediaType};base64,${img.data}`}
                      className="max-w-xs rounded-lg border border-border"
                      alt="attachment"
                    />
                  ))}
                </div>
              )}

              {msg.role === "assistant" &&
                renderArtifactCards(visibleAssistantArtifacts, msg.id)}

              {msg.role === "assistant" &&
              trailingTimeline &&
              !shouldRenderFirstTokenRuntimeStatus ? (
                <AgentThreadTimeline
                  turn={trailingTimeline.turn}
                  items={trailingTimeline.items}
                  threadRead={threadRead}
                  actionRequests={trailingActionRequests}
                  isCurrentTurn={
                    trailingTimeline.turn.id === activeCurrentTurnId
                  }
                  collapseInactiveDetails={!isSending}
                  deferCompletedSingleDetails={
                    shouldDeferHistoricalTimelineDetails &&
                    trailingTimeline.turn.id !== activeCurrentTurnId
                  }
                  placement="trailing"
                  onFileClick={onFileClick}
                  onOpenArtifactFromTimeline={onOpenArtifactFromTimeline}
                  sourceMessageId={msg.id}
                  onSaveFileArtifactAsKnowledge={onSaveMessageAsKnowledge}
                  onOpenSavedSiteContent={onOpenSavedSiteContent}
                  onOpenSubagentSession={onOpenSubagentSession}
                  onPermissionResponse={onPermissionResponse}
                  focusedItemId={focusedTimelineItemId}
                  focusRequestKey={timelineFocusRequestKey}
                />
              ) : null}

              {assistantMetaFooter}

              {showMessageActions ? (
                <MessageActions
                  className={[
                    "message-actions",
                    msg.imageWorkbenchPreview
                      ? "image-workbench-message-actions"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {canQuoteMessage ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full border border-slate-200/90 bg-white/92 text-slate-400 shadow-sm shadow-slate-950/5 hover:bg-slate-50 hover:text-slate-700"
                      onClick={() => onQuoteMessage?.(actionContent, msg.id)}
                      aria-label={t("agentChat.messageList.actions.quote")}
                      title={t("agentChat.messageList.actions.quote")}
                    >
                      <Quote size={12} />
                    </Button>
                  ) : null}
                  {canCopyMessage ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full border border-slate-200/90 bg-white/92 text-slate-400 shadow-sm shadow-slate-950/5 hover:bg-slate-50 hover:text-slate-700"
                      onClick={() => handleCopy(actionContent, msg.id)}
                      aria-label={t("agentChat.messageList.actions.copy")}
                      title={t("agentChat.messageList.actions.copy")}
                    >
                      {copiedId === msg.id ? (
                        <Check size={12} className="text-emerald-600" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </Button>
                  ) : null}
                  {canSaveMessageAsSkill ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full border border-emerald-200/90 bg-emerald-50/92 text-emerald-600 shadow-sm shadow-emerald-950/5 hover:bg-emerald-100 hover:text-emerald-700"
                      onClick={() =>
                        onSaveMessageAsSkill?.({
                          messageId: msg.id,
                          content: actionContent,
                        })
                      }
                      aria-label={t("agentChat.messageList.actions.saveAsSkill")}
                      title={t("agentChat.messageList.actions.saveAsSkill")}
                    >
                      <Sparkles size={12} />
                    </Button>
                  ) : null}
                  {canSaveMessageAsInspiration ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full border border-amber-200/90 bg-amber-50/92 text-amber-600 shadow-sm shadow-amber-950/5 hover:bg-amber-100 hover:text-amber-700"
                      onClick={() =>
                        onSaveMessageAsInspiration?.({
                          messageId: msg.id,
                          content: actionContent,
                        })
                      }
                      aria-label={t(
                        "agentChat.messageList.actions.saveToInspiration",
                      )}
                      title={t(
                        "agentChat.messageList.actions.saveToInspiration",
                      )}
                    >
                      <BookmarkPlus size={12} />
                    </Button>
                  ) : null}
                  {canSaveMessageAsKnowledge ? (
                    <Button
                      variant="ghost"
                      className="relative z-10 h-8 w-auto gap-1.5 rounded-full border border-sky-200/90 bg-sky-50/92 px-2.5 text-xs font-semibold text-sky-700 shadow-sm shadow-sky-950/5 hover:bg-sky-100 hover:text-sky-800"
                      onClick={() =>
                        onSaveMessageAsKnowledge?.({
                          messageId: msg.id,
                          content:
                            knowledgeArtifactSource?.content || actionContent,
                          sourceName: knowledgeArtifactSource?.sourceName,
                          description: knowledgeArtifactSource?.description,
                        })
                      }
                      aria-label={t(
                        "agentChat.messageList.actions.saveToKnowledge",
                      )}
                      title={t(
                        "agentChat.messageList.actions.saveToKnowledge",
                      )}
                    >
                      <FileText size={12} />
                      <span>
                        {t("agentChat.messageList.actions.saveToKnowledge")}
                      </span>
                    </Button>
                  ) : null}
                </MessageActions>
              ) : null}
            </MessageBubble>
          ) : null}
          {!hasAssistantBodyContent ? assistantMetaFooter : null}
        </ContentColumn>
      </MessageWrapper>
    );
  };

  const renderArtifactCards = (
    artifacts: Artifact[] | undefined,
    messageId: string,
  ) => {
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
          const knowledgeSource = resolveKnowledgeSourceFromArtifact(artifact);
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
  };

  return (
    <MessageListContainer
      ref={containerRef}
      $taskCenterSurface={isTaskCenterEmptyState}
    >
      <div
        data-testid="message-list-column"
        className={[
          "mx-auto flex min-h-full w-full max-w-[1040px] flex-col gap-4 py-4",
          compactLeadingSpacing ? "pl-2.5 pr-3" : "pl-4 pr-4",
          "justify-start",
        ].join(" ")}
      >
        {leadingContent ? (
          <div data-testid="message-list-leading-content">{leadingContent}</div>
        ) : null}
        {persistedHiddenHistoryCount > 0 ? (
          <div
            data-testid="message-list-persisted-history-window"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600"
          >
            <div className="min-w-0 flex-1">
              {t("agentChat.messageList.history.persistedSummary", {
                loaded: formatContentLength(
                  sessionHistoryWindow?.loadedMessages ??
                    renderedMessages.length,
                ),
                total: formatContentLength(
                  sessionHistoryWindow?.totalMessages ??
                    renderedMessages.length,
                ),
              })}
              {sessionHistoryWindow?.error ? (
                <span className="ml-2 text-red-600">
                  {sessionHistoryWindow.error}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              data-testid="message-list-load-full-history"
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                sessionHistoryWindow?.isLoadingFull === true ||
                !onLoadFullHistory
              }
              onClick={() => {
                void onLoadFullHistory?.();
              }}
            >
              {sessionHistoryWindow?.isLoadingFull
                ? t("agentChat.messageList.history.loadingMore")
                : t("agentChat.messageList.history.loadMore")}
            </button>
          </div>
        ) : null}
        {hiddenHistoryCount > 0 ? (
          <div
            data-testid="message-list-history-window"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600"
          >
            <div className="min-w-0 flex-1">
              {t(
                isRestoredHistoryWindow
                  ? "agentChat.messageList.history.windowSummaryRestored"
                  : "agentChat.messageList.history.windowSummaryDeferred",
                {
                  loaded: formatContentLength(renderedMessages.length),
                  hidden: formatContentLength(hiddenHistoryCount),
                },
              )}
            </div>
            <button
              type="button"
              data-testid="message-list-expand-history"
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
              onClick={handleExpandAllHistory}
            >
              {t("agentChat.messageList.history.expandEarlier")}
            </button>
          </div>
        ) : null}
        {messageGroups.length === 0 &&
          (isRestoringSession ? (
            <div
              className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground"
              data-testid="message-list-restoring-session"
              role="status"
              aria-live="polite"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background/80 shadow-sm">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-lg font-medium text-foreground">
                  {t("agentChat.messageList.restoring.title")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("agentChat.messageList.restoring.description")}
                </p>
              </div>
            </div>
          ) : isTaskCenterEmptyState ? (
            <div className="flex min-h-[24rem] items-center justify-center py-8">
              <section
                data-testid="message-list-empty-task-center"
                className="w-full max-w-[760px] rounded-[30px] border border-slate-200/80 bg-white px-6 py-7 text-left shadow-sm shadow-slate-950/5 md:px-8 md:py-8"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-slate-200/80 bg-slate-50/80">
                    <img
                      src={LIME_BRAND_LOGO_SRC}
                      alt={LIME_BRAND_NAME}
                      className="h-7 w-7 opacity-80"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                      {t("agentChat.messageList.taskCenterEmpty.badge")}
                    </span>

                    <div className="mt-4 space-y-2">
                      <h2 className="text-[32px] font-semibold tracking-tight text-slate-900 md:text-[36px]">
                        {t("agentChat.messageList.taskCenterEmpty.title")}
                      </h2>
                      <p className="max-w-[48rem] text-[15px] leading-7 text-slate-600">
                        {t("agentChat.messageList.taskCenterEmpty.description")}
                      </p>
                      <p className="text-sm leading-7 text-slate-500">
                        {t("agentChat.messageList.taskCenterEmpty.helper")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs text-slate-500">
                    {t("agentChat.messageList.taskCenterEmpty.chip.pending")}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs text-slate-500">
                    {t("agentChat.messageList.taskCenterEmpty.chip.organized")}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs text-slate-500">
                    {t("agentChat.messageList.taskCenterEmpty.chip.restore")}
                  </span>
                </div>
              </section>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground opacity-50">
              <img
                src={LIME_BRAND_LOGO_SRC}
                alt={LIME_BRAND_NAME}
                className="w-12 h-12 mb-4 opacity-20"
              />
              <p className="text-lg font-medium">
                {t("agentChat.messageList.empty.defaultTitle")}
              </p>
            </div>
          ))}

        {renderGroups.map((group, groupIndex) => {
          return (
            <section
              key={group.id}
              data-testid="message-turn-group"
              data-group-index={groupIndex + 1}
              className="py-2"
            >
              <div className="space-y-1">
                {group.messages.map((msg, messageIndex) => (
                  <MessageListItemWithStreamingOverlay
                    key={msg.id ?? `${group.id}:${messageIndex}`}
                    msg={msg}
                    group={group}
                    onOverlayUpdate={handleStreamingOverlayUpdate}
                    render={renderMessageItem}
                  />
                ))}
              </div>
            </section>
          );
        })}
        <div ref={scrollRef} />
      </div>
    </MessageListContainer>
  );
};

export const MessageList = React.memo(MessageListInner);
MessageList.displayName = "MessageList";
