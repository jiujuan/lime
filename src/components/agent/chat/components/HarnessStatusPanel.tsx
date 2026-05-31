import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  FileArchive,
  FileCode2,
  FileText,
  FolderOpen,
  HardDriveDownload,
  ListChecks,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
  SquareCheckBig,
  TerminalSquare,
  Undo2,
  Workflow,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { StepStatus } from "@/lib/workspace/workbenchContract";
import type {
  AgentRuntimeAnalysisHandoff,
  AgentRuntimeEvidenceBrowserActionIndex,
  AgentRuntimeEvidenceLimeCorePolicyIndex,
  AgentRuntimeEvidenceLimeCorePolicyItem,
  AgentRuntimeEvidencePack,
  AgentRuntimeHandoffBundle,
  AgentRuntimeSaveReviewDecisionRequest,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecisionTemplate,
  AgentRuntimeToolInventory,
  AgentRuntimeToolInventoryCatalogEntry,
  AgentRuntimeToolInventoryRegistryEntry,
  AgentRuntimeToolInventoryRuntimeEntry,
  AgentRuntimeThreadReadModel,
  AgentToolExecutionPolicySource,
  AsterSubagentSessionInfo,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import {
  exportAgentRuntimeAnalysisHandoff,
  exportAgentRuntimeEvidencePack,
  exportAgentRuntimeHandoffBundle,
  exportAgentRuntimeReplayCase,
  exportAgentRuntimeReviewDecisionTemplate,
  saveAgentRuntimeReviewDecision,
} from "@/lib/api/agentRuntime";
import { getMcpInnerToolName } from "@/lib/api/mcp";
import { ArtifactRenderer } from "@/components/artifact/ArtifactRenderer";
import type { Artifact } from "@/lib/artifact/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  openPathWithDefaultApp,
  revealPathInFinder,
} from "@/lib/api/fileSystem";
import { extractArtifactProtocolPathsFromValue } from "@/lib/artifact-protocol";
import {
  buildAgentUiEvidenceChangedEvent,
  buildAgentUiHandoffProjectionEvents,
  buildAgentUiReviewProjectionEvents,
} from "../projection/agentUiEventProjection";
import {
  formatAgentUiProjectionEventDetail,
  formatAgentUiProjectionControl,
  formatAgentUiProjectionEventType,
  formatAgentUiProjectionPhase,
  formatAgentUiProjectionSourceType,
  summarizeAgentUiProjectionEvents,
  type AgentUiProjectionTranslation,
} from "../projection/agentUiProjectionSummary";
import {
  recordAgentUiProjectionEvents,
  type AgentUiProjectionScopeFilter,
} from "../projection/conversationProjectionStore";
import { recordTeamControlAgentUiProjection } from "../projection/teamControlAgentUiProjection";
import { useAgentUiProjectionEvents } from "../projection/useConversationProjectionStore";
import { SearchResultPreviewList } from "./SearchResultPreviewList";
import type {
  ActionRequired,
  ConfirmResponse,
  AgentThreadItem,
  AgentThreadTurn,
  Message,
} from "../types";
import type {
  HarnessFileAction,
  HarnessActiveFileWrite,
  HarnessFileKind,
  HarnessOutputSignal,
  HarnessSessionState,
} from "../utils/harnessState";
import { resolveFileKind } from "../utils/harnessState";
import { formatArtifactWritePhaseLabel } from "../utils/messageArtifacts";
import {
  isUnifiedWebSearchToolName,
  resolveSearchResultPreviewItemsFromText,
} from "../utils/searchResultPreview";
import {
  classifySearchQuerySemantic,
  summarizeSearchQuerySemantics,
} from "../utils/searchQueryGrouping";
import { normalizeToolNameKey } from "../utils/toolDisplayInfo";
import {
  buildDiffReviewFileTreeItems,
  buildDiffReviewSideBySideRows,
  resolveDiffReviewSummaryFromCandidates,
  type DiffReviewFile,
  type DiffReviewLine,
  type DiffReviewSummary,
} from "../utils/diffReview";
import { deriveRuntimeToolAvailability } from "../utils/runtimeToolAvailability";
import {
  buildWorkflowSummaryText,
  getWorkflowStatusLabel,
} from "../utils/workflowStepPresentation";
import { buildThreadReliabilityView } from "../utils/threadReliabilityView";
import { resolveTeamWorkspaceStableProcessingLabel } from "../utils/teamWorkspaceCopy";
import { isRuntimeStatusDiagnosticsOnly } from "../utils/turnSummaryPresentation";
import { resolveAgentRuntimeErrorPresentation } from "../utils/agentRuntimeErrorPresentation";
import { isFailedHarnessOutputSignal } from "../utils/harnessOutputSignals";
import type { TeamRoleDefinition } from "../utils/teamDefinitions";
import type { TeamMemorySnapshot } from "@/lib/teamMemorySync";
import { AgentThreadReliabilityPanel } from "./AgentThreadReliabilityPanel";
import { HarnessVerificationSummarySection } from "./HarnessVerificationSummarySection";
import { HarnessTaskIndexSection } from "./HarnessTaskIndexSection";
import { ManagedObjectivePanel } from "./ManagedObjectivePanel";
import { RuntimeReviewDecisionDialog } from "./RuntimeReviewDecisionDialog";
import {
  formatBrowserActionStatusLabel,
  formatCompletionAuditDecisionLabel,
  formatLimeCorePolicyDecisionLabel,
  formatLimeCorePolicyStatusLabel,
  formatPermissionConfirmationStatusLabel,
  formatReviewDecisionArtifactKindLabel,
  formatReviewDecisionRiskLevelLabel,
  formatReviewDecisionStatusLabel,
  formatReviewLimitStatusLabel,
  resolveFriendlyToolLabel,
  resolveSubagentRuntimeStatusLabel,
  resolveSubagentRuntimeStatusVariant,
  resolveSubagentSessionTypeLabel,
  summarizeChildSubagentSessions,
} from "./harnessStatusPanelViewModel";

function interpolateDefaultText(
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  if (!options) {
    return defaultValue;
  }
  return defaultValue.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key) => {
    const value = options[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function agentText(
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  if (!i18next.isInitialized) {
    return interpolateDefaultText(defaultValue, options);
  }
  return String(
    i18next.t(key, {
      defaultValue,
      ns: "agent",
      ...options,
    }),
  );
}

interface HarnessEnvironmentSummary {
  skillsCount: number;
  skillNames: string[];
  memorySignals: string[];
  contextItemsCount: number;
  activeContextCount: number;
  contextItemNames: string[];
  contextEnabled: boolean;
}

export interface HarnessFilePreviewResult {
  path?: string;
  content?: string | null;
  error?: string | null;
  isBinary?: boolean;
  size?: number;
}

export interface HarnessFileChangeReviewSummary {
  total: number;
  pending: number;
  applied: number;
  rejected: number;
}

interface HarnessLeadContentContext {
  fileChangeReviewSummary: HarnessFileChangeReviewSummary;
}

type HarnessLeadContent =
  | ReactNode
  | ((context: HarnessLeadContentContext) => ReactNode);

interface HarnessStatusPanelProps {
  harnessState: HarnessSessionState;
  environment: HarnessEnvironmentSummary;
  layout?: "default" | "sidebar" | "dialog";
  onLoadFilePreview?: (path: string) => Promise<HarnessFilePreviewResult>;
  onOpenFile?: (fileName: string, content: string) => void;
  onRevealPath?: (path: string) => Promise<void>;
  onOpenPath?: (path: string) => Promise<void>;
  onOpenFileCheckpoints?: () => void;
  childSubagentSessions?: AsterSubagentSessionInfo[];
  onOpenSubagentSession?: (sessionId: string) => void;
  toolInventory?: AgentRuntimeToolInventory | null;
  toolInventoryLoading?: boolean;
  toolInventoryError?: string | null;
  onRefreshToolInventory?: () => void;
  title?: string;
  description?: string;
  toggleLabel?: string;
  leadContent?: HarnessLeadContent;
  selectedTeamLabel?: string | null;
  selectedTeamSummary?: string | null;
  selectedTeamRoles?: TeamRoleDefinition[] | null;
  threadRead?: AgentRuntimeThreadReadModel | null;
  turns?: AgentThreadTurn[];
  threadItems?: AgentThreadItem[];
  currentTurnId?: string | null;
  pendingActions?: ActionRequired[];
  submittedActionsInFlight?: ActionRequired[];
  onRespondToAction?: (response: ConfirmResponse) => void | Promise<void>;
  queuedTurns?: QueuedTurnSnapshot[];
  canInterrupt?: boolean;
  onInterruptCurrentTurn?: () => void | Promise<void>;
  onResumeThread?: () => boolean | Promise<boolean>;
  onReplayPendingRequest?: (requestId: string) => boolean | Promise<boolean>;
  onPromoteQueuedTurn?: (queuedTurnId: string) => boolean | Promise<boolean>;
  onObjectiveChanged?: () => void | Promise<void>;
  onOpenMemoryWorkbench?: () => void;
  messages?: Message[];
  teamMemorySnapshot?: TeamMemorySnapshot | null;
  diagnosticRuntimeContext?: {
    sessionId?: string | null;
    workspaceId?: string | null;
    workingDir?: string | null;
    providerType?: string | null;
    model?: string | null;
    executionStrategy?: string | null;
    activeTheme?: string | null;
    selectedTeamLabel?: string | null;
  } | null;
}

interface PreviewDialogState {
  open: boolean;
  title: string;
  description?: string;
  path?: string;
  displayName: string;
  content?: string;
  preview?: string;
  artifact?: Artifact;
  error?: string;
  isBinary: boolean;
  size?: number;
  loading: boolean;
}

type FileFilterValue = "all" | HarnessFileKind;
type OutputFilterValue = "all" | "path" | "offload" | "truncated" | "summary";
type FileDisplayMode = "timeline" | "grouped";
type ToolInventoryFilterValue = "all" | "runtime" | "persisted" | "default";
type ApprovalRiskKind = "file_change" | "command" | "input" | "default";
type OutputPathKind = "output" | "offload" | "artifact";
type FileChangeDecisionStatus = "pending" | "applied" | "rejected";

interface FileChangeReviewEntry {
  key: string;
  path: string;
  displayName: string;
  kind: HarnessFileKind;
  latestAction: HarnessFileAction;
  latestEvent?: HarnessSessionState["recentFileEvents"][number];
  activeWrite?: HarnessActiveFileWrite;
  count: number;
  events: HarnessSessionState["recentFileEvents"];
  actionSummaryItems: FileChangeReviewSummaryItem[];
  preview?: string;
  content?: string;
  timestamp?: Date;
  status: FileChangeDecisionStatus;
}

type FileChangeReviewSummaryItem =
  | {
      type: "action";
      action: HarnessFileAction;
      count: number;
    }
  | {
      type: "phase";
      phase: HarnessActiveFileWrite["phase"];
      count: number;
    };

type AgentTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

const APPROVAL_RISK_LABEL_KEY_BY_KIND: Record<ApprovalRiskKind, string> = {
  file_change: "agentChat.harness.approvals.risk.file_change",
  command: "agentChat.harness.approvals.risk.command",
  input: "agentChat.harness.approvals.risk.input",
  default: "agentChat.harness.approvals.risk.default",
};

const OUTPUT_PATH_LABEL_KEY_BY_KIND: Record<OutputPathKind, string> = {
  output: "agentChat.harness.outputs.paths.output",
  offload: "agentChat.harness.outputs.paths.offload",
  artifact: "agentChat.harness.outputs.paths.artifact",
};

const FILE_CHANGE_STATUS_LABEL_KEY_BY_STATUS: Record<
  FileChangeDecisionStatus,
  string
> = {
  pending: "agentChat.harness.fileReview.status.pending",
  applied: "agentChat.harness.fileReview.status.applied",
  rejected: "agentChat.harness.fileReview.status.rejected",
};

const FILE_REVIEW_ACTION_LABEL_KEY_BY_ACTION: Record<
  HarnessFileAction,
  string
> = {
  read: "agentChat.harness.fileReview.action.read",
  write: "agentChat.harness.fileReview.action.write",
  edit: "agentChat.harness.fileReview.action.edit",
  offload: "agentChat.harness.fileReview.action.offload",
  persist: "agentChat.harness.fileReview.action.persist",
};

const FILE_REVIEW_KIND_LABEL_KEY_BY_KIND: Record<HarnessFileKind, string> = {
  document: "agentChat.harness.fileReview.kind.document",
  code: "agentChat.harness.fileReview.kind.code",
  log: "agentChat.harness.fileReview.kind.log",
  artifact: "agentChat.harness.fileReview.kind.artifact",
  offload: "agentChat.harness.fileReview.kind.offload",
  other: "agentChat.harness.fileReview.kind.other",
};

const FILE_REVIEW_PHASE_LABEL_KEY_BY_PHASE: Record<
  HarnessActiveFileWrite["phase"],
  string
> = {
  preparing: "agentChat.harness.fileReview.phase.preparing",
  streaming: "agentChat.harness.fileReview.phase.streaming",
  persisted: "agentChat.harness.fileReview.phase.persisted",
  completed: "agentChat.harness.fileReview.phase.completed",
  failed: "agentChat.harness.fileReview.phase.failed",
};

type HarnessSectionKey =
  | "team_config"
  | "runtime"
  | "objective"
  | "agentui"
  | "handoff"
  | "reliability"
  | "runtime-facts"
  | "inventory"
  | "file_review"
  | "approvals"
  | "writes"
  | "files"
  | "outputs"
  | "plan"
  | "delegation"
  | "context"
  | "capabilities";

interface HarnessSectionNavItem {
  key: HarnessSectionKey;
  label: string;
}

interface HarnessSummaryCard {
  sectionKey: HarnessSectionKey;
  title: string;
  value: string;
  hint: string;
  icon: LucideIcon;
}

interface RuntimeTaskPresentation {
  title: string;
  summaryText: string;
  phaseLabel: string;
  statusLabel: string;
  progressLabel: string;
  stepStatus: StepStatus;
  checkpoints: string[];
}

interface TextSegment {
  type: "text" | "url";
  value: string;
}

const URL_PATTERN_SOURCE = String.raw`\bhttps?:\/\/[^\s<>"'\`]+`;
const URL_TRAILING_PUNCTUATION = /[),.;!?]+$/;

function createUrlPattern(): RegExp {
  return new RegExp(URL_PATTERN_SOURCE, "gi");
}

function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || path;
}

function formatTime(value?: Date): string {
  if (!value) {
    return "刚刚";
  }

  return value.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUnixTimestamp(value?: number): string {
  if (!value) {
    return "未知";
  }

  return new Date(value * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatIsoDateTime(value?: string): string {
  if (!value) {
    return "未知";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveReviewDecisionRegressionFacts(
  verificationSummary?:
    | AgentRuntimeReviewDecisionTemplate["verification_summary"]
    | null,
): {
  regressionOutcome?: "blocking_failure" | "recovered";
  regressionFailureOutcomes?: string[];
  regressionRecoveredOutcomes?: string[];
  requestedFixExecutionResults?: Array<{
    requestedFix?: string;
    requestedFixIndex?: number;
    executionStatus?:
      | "pending"
      | "assigned"
      | "running"
      | "completed"
      | "failed"
      | "blocked"
      | "cancelled";
    regressionOutcome?: string;
    summaryPreview?: string;
    resultRef?: string;
    artifactIds?: string[];
    artifactPaths?: string[];
  }>;
} {
  const regressionFailureOutcomes =
    verificationSummary?.focus_verification_failure_outcomes;
  const regressionRecoveredOutcomes =
    verificationSummary?.focus_verification_recovered_outcomes;
  const artifactOutcome = verificationSummary?.artifact_validator?.outcome;
  const regressionOutcome = regressionFailureOutcomes?.length
    ? "blocking_failure"
    : regressionRecoveredOutcomes?.length
      ? "recovered"
      : artifactOutcome === "blocking_failure" ||
          artifactOutcome === "recovered"
        ? artifactOutcome
        : undefined;

  return {
    regressionOutcome,
    regressionFailureOutcomes,
    regressionRecoveredOutcomes,
    requestedFixExecutionResults: (
      verificationSummary?.requested_fix_execution_results ?? []
    ).map((result) => ({
      requestedFix: result.requested_fix,
      requestedFixIndex: result.requested_fix_index,
      executionStatus: result.execution_status,
      regressionOutcome: result.regression_outcome,
      summaryPreview: result.summary_preview,
      resultRef: result.result_ref,
      artifactIds: result.artifact_ids,
      artifactPaths: result.artifact_paths,
    })),
  };
}

function joinDisplayParts(
  parts: Array<string | null | undefined>,
): string | undefined {
  const normalized = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return normalized.length > 0 ? normalized.join(" · ") : undefined;
}

function formatSize(value?: number): string | null {
  if (!value || value <= 0) {
    return null;
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
}

function formatHandoffStatusLabel(value?: string | null): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "未知";
  }

  switch (normalized) {
    case "idle":
      return "空闲";
    case "pending":
      return "待处理";
    case "queued":
      return "排队中";
    case "running":
      return "处理中";
    case "waiting_request":
      return "等待请求";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "interrupting":
      return "中断中";
    case "interrupted":
      return "已中断";
    default:
      return normalized;
  }
}

function formatHandoffArtifactKindLabel(
  kind: AgentRuntimeHandoffBundle["artifacts"][number]["kind"],
): string {
  switch (kind) {
    case "plan":
      return "计划";
    case "progress":
      return "进度";
    case "handoff":
      return "交接";
    case "review_summary":
      return "审查";
    default:
      return kind;
  }
}

function formatEvidenceArtifactKindLabel(
  kind: AgentRuntimeEvidencePack["artifacts"][number]["kind"],
): string {
  switch (kind) {
    case "summary":
      return "摘要";
    case "runtime":
      return "运行时";
    case "timeline":
      return "时间线";
    case "artifacts":
      return "产物";
    default:
      return kind;
  }
}

function formatBrowserActionArtifactKindLabel(kind?: string): string {
  switch (kind?.trim()) {
    case "browser_session":
      return "browser_session";
    case "browser_snapshot":
      return "browser_snapshot";
    default:
      return kind?.trim() || "未知产物";
  }
}

function formatLimeCorePolicyInputStatusLabel(value?: string): string {
  switch (value?.trim()) {
    case "declared_only":
      return "仅声明";
    default:
      return value?.trim() || "未知";
  }
}

function formatLimeCorePolicyInputSourceLabel(value?: string): string {
  switch (value?.trim()) {
    case "limecore_pending":
      return "等待 LimeCore";
    default:
      return value?.trim() || "未知来源";
  }
}

function uniqueNonEmptyStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function collectLimeCorePolicyRefKeys(
  index: AgentRuntimeEvidenceLimeCorePolicyIndex,
): string[] {
  return uniqueNonEmptyStrings([
    ...index.ref_keys,
    ...index.items.flatMap((item) => item.refs),
  ]);
}

function collectLimeCorePolicyMissingInputs(
  index: AgentRuntimeEvidenceLimeCorePolicyIndex,
): string[] {
  return uniqueNonEmptyStrings([
    ...(index.missing_inputs ?? []),
    ...index.items.flatMap((item) => item.missing_inputs ?? []),
    ...index.items.flatMap((item) => item.unresolved_refs ?? []),
  ]);
}

function summarizeLimeCorePolicyDecision(
  index: AgentRuntimeEvidenceLimeCorePolicyIndex,
): string {
  const decisionCounts = index.decision_counts.filter((entry) =>
    entry.decision.trim(),
  );
  if (decisionCounts.length === 0) {
    return "未评估";
  }
  if (decisionCounts.length === 1) {
    return formatLimeCorePolicyDecisionLabel(decisionCounts[0].decision);
  }
  return decisionCounts
    .map(
      (entry) =>
        `${formatLimeCorePolicyDecisionLabel(entry.decision)} ${entry.count}`,
    )
    .join(" / ");
}

function formatReplayArtifactKindLabel(
  kind: AgentRuntimeReplayCase["artifacts"][number]["kind"],
): string {
  switch (kind) {
    case "input":
      return "输入";
    case "expected":
      return "期望";
    case "grader":
      return "评分";
    case "evidence_links":
      return "证据链接";
    default:
      return kind;
  }
}

function formatAnalysisArtifactKindLabel(
  kind: AgentRuntimeAnalysisHandoff["artifacts"][number]["kind"],
): string {
  switch (kind) {
    case "analysis_brief":
      return "简报";
    case "analysis_context":
      return "上下文";
    default:
      return kind;
  }
}

function slugifyHarnessCase(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "replay-case";
}

function quoteShellArg(value: string): string {
  return JSON.stringify(value);
}

function buildReplayPromotionContext(params: {
  replayCase: AgentRuntimeReplayCase;
  analysisTitle?: string | null;
  reviewTitle?: string | null;
}) {
  const titleSource =
    params.reviewTitle?.trim() ||
    params.analysisTitle?.trim() ||
    `Replay case ${params.replayCase.session_id}`;
  const slugSource =
    params.reviewTitle?.trim() ||
    params.analysisTitle?.trim() ||
    params.replayCase.session_id;

  return {
    suiteId: "repo-promoted-replays",
    title: titleSource,
    slug: slugifyHarnessCase(slugSource),
  };
}

function buildReplayPromotionCommand(params: {
  replayCase: AgentRuntimeReplayCase;
  analysisTitle?: string | null;
  reviewTitle?: string | null;
}): string {
  const context = buildReplayPromotionContext(params);
  return [
    "npm run harness:eval:promote --",
    `--session-id ${quoteShellArg(params.replayCase.session_id)}`,
    `--slug ${quoteShellArg(context.slug)}`,
    `--title ${quoteShellArg(context.title)}`,
  ].join(" ");
}

function buildReplayEvalCommand(): string {
  return "npm run harness:eval";
}

function buildReplayTrendCommand(): string {
  return "npm run harness:eval:trend";
}

function describeAction(action: HarnessFileAction): string {
  switch (action) {
    case "read":
      return "读取";
    case "write":
      return "写入";
    case "edit":
      return "编辑";
    case "offload":
      return "转存";
    case "persist":
      return "落盘";
    default:
      return action;
  }
}

function describeKind(kind: HarnessFileKind): string {
  switch (kind) {
    case "document":
      return "文档";
    case "code":
      return "代码";
    case "log":
      return "日志";
    case "artifact":
      return "产物";
    case "offload":
      return "转存";
    default:
      return "文件";
  }
}

function resolveKindIcon(kind: HarnessFileKind): LucideIcon {
  switch (kind) {
    case "code":
      return FileCode2;
    case "artifact":
    case "offload":
      return FileArchive;
    default:
      return FileText;
  }
}

function getSignalPath(signal: HarnessOutputSignal): string | undefined {
  return signal.offloadFile || signal.outputFile || signal.artifactPath;
}

function normalizeUrlCandidate(rawUrl: string): {
  url: string;
  trailing: string;
} {
  const normalized = rawUrl.replace(URL_TRAILING_PUNCTUATION, "");
  return {
    url: normalized || rawUrl,
    trailing: rawUrl.slice((normalized || rawUrl).length),
  };
}

function splitTextIntoSegments(text: string): TextSegment[] {
  if (!text.trim()) {
    return [{ type: "text", value: text }];
  }

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  const urlPattern = createUrlPattern();

  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      segments.push({
        type: "text",
        value: text.slice(lastIndex, matchIndex),
      });
    }

    const { url, trailing } = normalizeUrlCandidate(rawUrl);
    segments.push({ type: "url", value: url });
    if (trailing) {
      segments.push({ type: "text", value: trailing });
    }
    lastIndex = matchIndex + rawUrl.length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }];
}

function findFirstUrl(
  ...values: Array<string | undefined>
): string | undefined {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const match = value.match(createUrlPattern());
    if (!match || match.length === 0) {
      continue;
    }
    return normalizeUrlCandidate(match[0]).url;
  }
  return undefined;
}

function isSearchOutputSignal(signal: HarnessOutputSignal): boolean {
  if (isUnifiedWebSearchToolName(signal.toolName)) {
    return true;
  }

  return signal.title === "联网检索摘要";
}

function isLikelyFilePath(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || /^https?:\/\//i.test(normalized)) {
    return false;
  }

  if (/^(~\/|\/|[A-Za-z]:[\\/]|\.{1,2}[\\/])/.test(normalized)) {
    return true;
  }

  return (
    /[\\/]/.test(normalized) &&
    /\.[A-Za-z0-9_-]{1,12}(?:[#?].*)?$/.test(normalized)
  );
}

function summarizeFileActions(
  events: HarnessSessionState["recentFileEvents"],
): string {
  const counts = new Map<HarnessFileAction, number>();

  for (const event of events) {
    counts.set(event.action, (counts.get(event.action) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([action, count]) => `${describeAction(action)} ${count}`)
    .join(" · ");
}

function summarizeFileReviewActions(
  events: HarnessSessionState["recentFileEvents"],
  activeWrite?: HarnessActiveFileWrite,
): FileChangeReviewSummaryItem[] {
  const items: FileChangeReviewSummaryItem[] = [];

  if (activeWrite) {
    items.push({
      type: "phase",
      phase: activeWrite.phase,
      count: 1,
    });
  }

  const counts = new Map<HarnessFileAction, number>();
  for (const event of events) {
    counts.set(event.action, (counts.get(event.action) ?? 0) + 1);
  }

  for (const [action, count] of counts.entries()) {
    items.push({
      type: "action",
      action,
      count,
    });
  }

  return items;
}

function translateFileReviewAction(
  translate: AgentTranslation,
  action: HarnessFileAction,
): string {
  return translate(FILE_REVIEW_ACTION_LABEL_KEY_BY_ACTION[action] || action);
}

function translateFileReviewKind(
  translate: AgentTranslation,
  kind: HarnessFileKind,
): string {
  return translate(FILE_REVIEW_KIND_LABEL_KEY_BY_KIND[kind] || kind);
}

function translateFileReviewPhase(
  translate: AgentTranslation,
  phase: HarnessActiveFileWrite["phase"],
): string {
  return translate(FILE_REVIEW_PHASE_LABEL_KEY_BY_PHASE[phase] || phase);
}

function formatFileReviewSummaryItem(
  translate: AgentTranslation,
  item: FileChangeReviewSummaryItem,
): string {
  if (item.type === "phase") {
    return translate("agentChat.harness.fileReview.phaseCount", {
      label: translateFileReviewPhase(translate, item.phase),
      count: item.count,
    });
  }

  return translate("agentChat.harness.fileReview.actionCount", {
    label: translateFileReviewAction(translate, item.action),
    count: item.count,
  });
}

function summarizeFileReviewActionText(
  translate: AgentTranslation,
  items: FileChangeReviewSummaryItem[],
): string {
  return items
    .map((item) => formatFileReviewSummaryItem(translate, item))
    .join(" · ");
}

function isReviewableFileEvent(
  event: HarnessSessionState["recentFileEvents"][number],
): boolean {
  if (!event.path.trim()) {
    return false;
  }
  if (event.action === "write" || event.action === "edit") {
    return true;
  }
  if (event.action !== "persist") {
    return false;
  }
  return event.kind !== "log" && event.kind !== "offload";
}

function buildFileChangeReviewEntries(params: {
  activeFileWrites: HarnessActiveFileWrite[];
  recentFileEvents: HarnessSessionState["recentFileEvents"];
  decisions: Record<string, FileChangeDecisionStatus>;
}): FileChangeReviewEntry[] {
  const entries = new Map<string, FileChangeReviewEntry>();

  for (const write of params.activeFileWrites) {
    const path = write.path.trim();
    if (!path) {
      continue;
    }
    const key = path;
    entries.set(key, {
      key,
      path,
      displayName: write.displayName || getFileName(path),
      kind: resolveFileKind(path, "artifact"),
      latestAction: "write",
      activeWrite: write,
      count: 1,
      events: [],
      actionSummaryItems: summarizeFileReviewActions([], write),
      preview: write.preview || write.latestChunk,
      content: write.content,
      timestamp: write.updatedAt,
      status: params.decisions[key] || "pending",
    });
  }

  for (const event of params.recentFileEvents) {
    if (!isReviewableFileEvent(event)) {
      continue;
    }

    const key = event.path.trim();
    const existing = entries.get(key);
    const eventTime = event.timestamp?.getTime() ?? 0;
    const existingTime = existing?.timestamp?.getTime() ?? 0;
    if (!existing) {
      entries.set(key, {
        key,
        path: event.path,
        displayName: event.displayName,
        kind: event.kind,
        latestAction: event.action,
        latestEvent: event,
        count: 1,
        events: [event],
        actionSummaryItems: summarizeFileReviewActions([event]),
        preview: event.preview,
        content: event.content,
        timestamp: event.timestamp,
        status: params.decisions[key] || "pending",
      });
      continue;
    }

    const events = [...existing.events, event];
    entries.set(key, {
      ...existing,
      displayName:
        eventTime >= existingTime ? event.displayName : existing.displayName,
      kind: eventTime >= existingTime ? event.kind : existing.kind,
      latestAction:
        eventTime >= existingTime ? event.action : existing.latestAction,
      latestEvent: eventTime >= existingTime ? event : existing.latestEvent,
      count: events.length + (existing.activeWrite ? 1 : 0),
      events,
      actionSummaryItems: summarizeFileReviewActions(
        events,
        existing.activeWrite,
      ),
      preview: event.preview || existing.preview,
      content: event.content || existing.content,
      timestamp:
        eventTime >= existingTime ? event.timestamp : existing.timestamp,
      status: params.decisions[key] || "pending",
    });
  }

  return Array.from(entries.values()).sort((left, right) => {
    const leftTime = left.timestamp?.getTime() ?? 0;
    const rightTime = right.timestamp?.getTime() ?? 0;
    return rightTime - leftTime;
  });
}

function countFileChangeStatuses(
  entries: FileChangeReviewEntry[],
): Record<FileChangeDecisionStatus, number> {
  return entries.reduce(
    (result, entry) => ({
      ...result,
      [entry.status]: result[entry.status] + 1,
    }),
    { pending: 0, applied: 0, rejected: 0 },
  );
}

function matchesOutputFilter(
  signal: HarnessOutputSignal,
  filter: OutputFilterValue,
): boolean {
  const signalPath = getSignalPath(signal);

  switch (filter) {
    case "path":
      return Boolean(signalPath);
    case "offload":
      return Boolean(signal.offloaded || signal.offloadFile);
    case "truncated":
      return signal.truncated === true;
    case "summary":
      return !signalPath && Boolean(signal.preview?.trim());
    default:
      return true;
  }
}

function pickPathFromArguments(
  argumentsValue?: Record<string, unknown>,
): string | undefined {
  return extractArtifactProtocolPathsFromValue(argumentsValue)[0];
}

function pickCommandFromArguments(
  argumentsValue?: Record<string, unknown>,
): string | undefined {
  const command = argumentsValue?.cmd ?? argumentsValue?.command;
  return typeof command === "string" && command.trim()
    ? command.trim()
    : undefined;
}

function isFileMutationApproval(item: ActionRequired): boolean {
  const normalizedToolName = normalizeToolNameKey(item.toolName || "");
  return [
    "write",
    "writefile",
    "edit",
    "editfile",
    "multiedit",
    "createfile",
    "delete",
    "remove",
    "move",
    "patch",
    "applypatch",
  ].some((keyword) => normalizedToolName.includes(keyword));
}

function resolveApprovalRiskKind(item: ActionRequired): ApprovalRiskKind {
  if (pickCommandFromArguments(item.arguments)) {
    return "command";
  }
  if (pickPathFromArguments(item.arguments) && isFileMutationApproval(item)) {
    return "file_change";
  }
  if (item.actionType === "ask_user" || item.actionType === "elicitation") {
    return "input";
  }
  return "default";
}

function resolveApprovalActionLabelKey(item: ActionRequired): string {
  switch (item.actionType) {
    case "ask_user":
      return "agentChat.harness.approvals.action.askUser";
    case "elicitation":
      return "agentChat.harness.approvals.action.elicitation";
    case "tool_confirmation":
    default:
      return "agentChat.harness.approvals.action.tool";
  }
}

function describeApproval(item: ActionRequired): string | undefined {
  const hints: string[] = [];

  if (item.toolName?.trim()) {
    hints.push(resolveFriendlyToolLabel(item.toolName) || item.toolName.trim());
  }

  const path = pickPathFromArguments(item.arguments);
  if (path) {
    hints.push(path);
  }

  const command = pickCommandFromArguments(item.arguments);
  if (command) {
    hints.push(command);
  }

  return hints.length > 0 ? hints.join(" · ") : undefined;
}

function resolveDiffReviewStatusLabelKey(
  status?: DiffReviewFile["status"],
): string {
  switch (status) {
    case "added":
      return "agentChat.harness.diff.status.added";
    case "deleted":
      return "agentChat.harness.diff.status.deleted";
    case "modified":
      return "agentChat.harness.diff.status.modified";
    case "unknown":
    default:
      return "agentChat.harness.diff.status.unknown";
  }
}

function resolveDiffReviewLineClass(
  kind: DiffReviewLine["kind"] | "change",
  side: "before" | "after",
): string {
  if (kind === "hunk") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (kind === "change") {
    return side === "before"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (kind === "remove") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (kind === "add") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  return "border-border bg-background text-muted-foreground";
}

function buildFileChangeReviewDiffSummary(
  entry: FileChangeReviewEntry,
): DiffReviewSummary | null {
  return resolveDiffReviewSummaryFromCandidates(
    [
      entry.content,
      entry.preview,
      entry.latestEvent?.content,
      entry.latestEvent?.preview,
      entry.activeWrite?.content,
      entry.activeWrite?.preview,
      entry.activeWrite?.latestChunk,
    ],
    { fallbackPath: entry.path },
  );
}

function buildOutputSignalDiffSummary(
  signal: HarnessOutputSignal,
): DiffReviewSummary | null {
  return resolveDiffReviewSummaryFromCandidates(
    [signal.content, signal.preview, signal.summary],
    { fallbackPath: getSignalPath(signal) },
  );
}

function DiffReviewMiniPanel({
  summary,
  translate,
  onOpenPath,
  stopPropagation = false,
}: {
  summary: DiffReviewSummary;
  translate: AgentTranslation;
  onOpenPath: (path: string) => void | Promise<void>;
  stopPropagation?: boolean;
}) {
  const treeItems = buildDiffReviewFileTreeItems(summary.files).filter(
    (item) => item.kind === "file",
  );
  const visibleTreeItems = treeItems.slice(0, 5);
  const remainingTreeItemCount = Math.max(0, treeItems.length - 5);
  const firstFile = summary.files[0] ?? null;
  const sideBySideRows = firstFile
    ? buildDiffReviewSideBySideRows(firstFile, { maxRows: 8 })
    : [];

  return (
    <div
      className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3"
      data-testid="harness-diff-review-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
          <FileCode2 className="h-4 w-4 text-slate-600" />
          {translate("agentChat.harness.diff.title")}
        </div>
        <Badge variant="outline" className="border-slate-300 bg-background">
          {translate("agentChat.harness.diff.badge", {
            files: summary.files.length,
            additions: summary.additions,
            deletions: summary.deletions,
            hunks: summary.hunks,
          })}
        </Badge>
      </div>

      {visibleTreeItems.length > 0 ? (
        <div className="mt-3 space-y-1">
          <div className="text-[11px] font-medium text-slate-700">
            {translate("agentChat.harness.diff.filesTitle")}
          </div>
          <div className="space-y-1">
            {visibleTreeItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-slate-200 bg-background px-2 py-1 text-[11px] text-slate-700"
              >
                <Badge variant="secondary">
                  {translate(resolveDiffReviewStatusLabelKey(item.status))}
                </Badge>
                <PathTextLink
                  path={item.path}
                  className="text-[11px]"
                  stopPropagation={stopPropagation}
                  onOpenPath={onOpenPath}
                />
                <span className="text-emerald-700">+{item.additions}</span>
                <span className="text-rose-700">-{item.deletions}</span>
              </div>
            ))}
            {remainingTreeItemCount > 0 ? (
              <div className="text-[11px] text-muted-foreground">
                {translate("agentChat.harness.diff.moreFiles", {
                  count: remainingTreeItemCount,
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {firstFile && sideBySideRows.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-slate-700">
              {translate("agentChat.harness.diff.sideBySideTitle")}
            </div>
            <PathTextLink
              path={firstFile.path}
              className="text-[11px]"
              stopPropagation={stopPropagation}
              onOpenPath={onOpenPath}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="text-[11px] font-medium text-rose-700">
              {translate("agentChat.harness.diff.before")}
            </div>
            <div className="text-[11px] font-medium text-emerald-700">
              {translate("agentChat.harness.diff.after")}
            </div>
          </div>
          <div className="space-y-1">
            {sideBySideRows.map((row) => (
              <div key={row.id} className="grid gap-1 sm:grid-cols-2">
                <div
                  className={cn(
                    "min-h-6 whitespace-pre-wrap break-words rounded-md border px-2 py-1 font-mono text-[11px] leading-5",
                    row.before === null
                      ? "border-dashed border-slate-200 bg-background text-slate-400"
                      : resolveDiffReviewLineClass(row.kind, "before"),
                  )}
                >
                  {row.before ?? ""}
                </div>
                <div
                  className={cn(
                    "min-h-6 whitespace-pre-wrap break-words rounded-md border px-2 py-1 font-mono text-[11px] leading-5",
                    row.after === null
                      ? "border-dashed border-slate-200 bg-background text-slate-400"
                      : resolveDiffReviewLineClass(row.kind, "after"),
                  )}
                >
                  {row.after ?? ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildOutputStatusDescriptors(signal: HarnessOutputSignal): Array<{
  key: string;
  labelKey: string;
  values?: Record<string, string | number>;
  variant: ComponentProps<typeof Badge>["variant"];
}> {
  const descriptors: Array<{
    key: string;
    labelKey: string;
    values?: Record<string, string | number>;
    variant: ComponentProps<typeof Badge>["variant"];
  }> = [];

  if (signal.exitCode !== undefined) {
    descriptors.push({
      key: "exit-code",
      labelKey:
        signal.exitCode === 0
          ? "agentChat.harness.outputs.status.exitSuccess"
          : "agentChat.harness.outputs.status.exitFailed",
      values: { code: signal.exitCode },
      variant: signal.exitCode === 0 ? "secondary" : "destructive",
    });
  }

  if (signal.truncated) {
    descriptors.push({
      key: "truncated",
      labelKey: "agentChat.harness.outputs.status.truncated",
      variant: "outline",
    });
  }

  if (signal.offloaded || signal.offloadFile) {
    descriptors.push({
      key: "offloaded",
      labelKey: "agentChat.harness.outputs.status.offloaded",
      variant: "outline",
    });
  }

  if (signal.sandboxed !== undefined) {
    descriptors.push({
      key: "sandboxed",
      labelKey: signal.sandboxed
        ? "agentChat.harness.outputs.status.sandboxed"
        : "agentChat.harness.outputs.status.unsandboxed",
      variant: "outline",
    });
  }

  if (signal.stdoutLength !== undefined) {
    descriptors.push({
      key: "stdout",
      labelKey: "agentChat.harness.outputs.status.stdout",
      values: { count: signal.stdoutLength },
      variant: "outline",
    });
  }

  if (signal.stderrLength !== undefined) {
    descriptors.push({
      key: "stderr",
      labelKey: "agentChat.harness.outputs.status.stderr",
      values: { count: signal.stderrLength },
      variant: signal.stderrLength > 0 ? "destructive" : "outline",
    });
  }

  if (signal.offloadOriginalChars !== undefined) {
    descriptors.push({
      key: "original-chars",
      labelKey: "agentChat.harness.outputs.status.originalChars",
      values: { count: signal.offloadOriginalChars },
      variant: "outline",
    });
  }

  if (signal.offloadOriginalTokens !== undefined) {
    descriptors.push({
      key: "original-tokens",
      labelKey: "agentChat.harness.outputs.status.originalTokens",
      values: { count: signal.offloadOriginalTokens },
      variant: "outline",
    });
  }

  return descriptors;
}

function isNoisyRuntimeOutputText(value: string): boolean {
  const normalized = value.toLowerCase();
  return /(?:-32603|-32002|troubleshooting|json-?rpc)/i.test(normalized);
}

function resolveOutputCardPresentation(
  signal: HarnessOutputSignal,
  translate: AgentTranslation,
): {
  summary: string;
  preview: string | undefined;
  collapsedHint: string | null;
  rawDetailsCollapsed: boolean;
  tone: "failed" | "default";
} {
  const rawText = [signal.summary, signal.preview, signal.content]
    .filter(Boolean)
    .join("\n");
  const failed = isFailedHarnessOutputSignal(signal);
  const rawDetailsCollapsed = failed && isNoisyRuntimeOutputText(rawText);
  const summary = rawDetailsCollapsed
    ? resolveAgentRuntimeErrorPresentation(rawText).displayMessage
    : signal.summary;

  return {
    summary,
    preview: rawDetailsCollapsed ? undefined : signal.preview,
    collapsedHint: rawDetailsCollapsed
      ? translate("agentChat.harness.outputs.rawDetailsCollapsed")
      : null,
    rawDetailsCollapsed,
    tone: failed ? "failed" : "default",
  };
}

function getOutputSignalPaths(signal: HarnessOutputSignal): Array<{
  key: OutputPathKind;
  path: string;
}> {
  return [
    signal.outputFile
      ? { key: "output" as const, path: signal.outputFile }
      : null,
    signal.offloadFile
      ? { key: "offload" as const, path: signal.offloadFile }
      : null,
    signal.artifactPath
      ? { key: "artifact" as const, path: signal.artifactPath }
      : null,
  ].filter((item): item is { key: OutputPathKind; path: string } =>
    Boolean(item),
  );
}

function formatRuntimePhaseLabel(
  runtimeStatus: HarnessSessionState["runtimeStatus"],
): string {
  if (!runtimeStatus) {
    return "空闲";
  }

  switch (runtimeStatus.phase) {
    case "preparing":
      return "准备中";
    case "routing":
      return "处理中";
    case "context":
      return "整理信息";
    case "cancelled":
      return "已取消";
    case "failed":
      return "需要处理";
    default:
      return runtimeStatus.phase;
  }
}

function resolveRuntimeStepStatus(
  runtimeStatus: NonNullable<HarnessSessionState["runtimeStatus"]>,
): StepStatus {
  if (runtimeStatus.phase === "failed") {
    return "error";
  }
  if (runtimeStatus.phase === "cancelled") {
    return "skipped";
  }
  return "active";
}

function resolveRuntimeStatusLabel(
  runtimeStatus: NonNullable<HarnessSessionState["runtimeStatus"]>,
): string {
  if (runtimeStatus.phase === "cancelled") {
    return "已取消";
  }
  return getWorkflowStatusLabel(resolveRuntimeStepStatus(runtimeStatus));
}

function buildRuntimeSummaryText(
  runtimeStatus: NonNullable<HarnessSessionState["runtimeStatus"]>,
): string {
  const detail = runtimeStatus.detail?.trim();
  if (detail) {
    return detail;
  }
  if (runtimeStatus.phase === "cancelled") {
    return "当前流程已取消，可重新发起新的任务继续。";
  }
  return buildWorkflowSummaryText({
    leadingStep: {
      status: resolveRuntimeStepStatus(runtimeStatus),
    },
    remainingCount: 1,
    emptyLabel: "当前流程已完成",
  });
}

function formatRuntimeProgressLabel(
  runtimeStatus: NonNullable<HarnessSessionState["runtimeStatus"]>,
  checkpoints: string[],
): string {
  if (checkpoints.length > 0) {
    return `已记录 ${checkpoints.length} 个任务节点`;
  }
  if (runtimeStatus.phase === "failed") {
    return "等待处理异常后重试";
  }
  if (runtimeStatus.phase === "cancelled") {
    return "当前流程已取消";
  }
  return "等待更多执行进展";
}

function buildRuntimeTaskPresentation(
  runtimeStatus: HarnessSessionState["runtimeStatus"],
): RuntimeTaskPresentation | null {
  if (!runtimeStatus || isRuntimeStatusDiagnosticsOnly(runtimeStatus)) {
    return null;
  }

  const checkpoints = (runtimeStatus.checkpoints ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return {
    title: runtimeStatus.title?.trim() || "正在整理当前任务",
    summaryText: buildRuntimeSummaryText(runtimeStatus),
    phaseLabel: formatRuntimePhaseLabel(runtimeStatus),
    statusLabel: resolveRuntimeStatusLabel(runtimeStatus),
    progressLabel: formatRuntimeProgressLabel(runtimeStatus, checkpoints),
    stepStatus: resolveRuntimeStepStatus(runtimeStatus),
    checkpoints,
  };
}

function formatWriteSourceLabel(source?: string): string {
  switch (source) {
    case "tool_start":
      return "工具启动";
    case "artifact_snapshot":
      return "快照同步";
    case "tool_result":
      return "工具结果";
    case "message_content":
      return "消息流";
    default:
      return source || "处理中";
  }
}

function formatExecutionSourceLabel(
  source: AgentToolExecutionPolicySource,
): string {
  switch (source) {
    case "runtime":
      return "运行时覆盖";
    case "persisted":
      return "持久化覆盖";
    case "default":
    default:
      return "默认策略";
  }
}

function resolveExecutionSourceVariant(
  source: AgentToolExecutionPolicySource,
): ComponentProps<typeof Badge>["variant"] {
  switch (source) {
    case "runtime":
      return "default";
    case "persisted":
      return "secondary";
    case "default":
    default:
      return "outline";
  }
}

function formatExecutionWarningPolicyLabel(value: string): string {
  switch (value) {
    case "shell_command_risk":
      return "命令风险告警";
    case "none":
    default:
      return "无告警";
  }
}

function formatExecutionRestrictionProfileLabel(value: string): string {
  switch (value) {
    case "workspace_path_required":
      return "必须提供工作区路径";
    case "workspace_path_optional":
      return "可选工作区路径";
    case "workspace_absolute_path_required":
      return "必须提供绝对工作区路径";
    case "workspace_shell_command":
      return "工作区命令限制";
    case "analyze_image_input":
      return "仅图像输入";
    case "safe_https_url_required":
      return "仅安全 HTTPS URL";
    case "none":
    default:
      return "无额外限制";
  }
}

function formatExecutionSandboxProfileLabel(value: string): string {
  switch (value) {
    case "workspace_command":
      return "工作区命令沙箱";
    case "none":
    default:
      return "无沙箱";
  }
}

function formatToolLifecycleLabel(value: string): string {
  switch (value) {
    case "current":
      return "现役";
    case "compat":
      return "兼容";
    case "deprecated":
      return "待清理";
    default:
      return value;
  }
}

function formatToolPermissionPlaneLabel(value: string): string {
  switch (value) {
    case "session_allowlist":
      return "会话白名单";
    case "parameter_restricted":
      return "参数受限";
    case "caller_filtered":
      return "调用方过滤";
    default:
      return value;
  }
}

function formatToolSourceKindLabel(value: string): string {
  switch (value) {
    case "aster_builtin":
      return "Aster 内置";
    case "lime_injected":
      return "Lime 注入";
    case "browser_compatibility":
      return "Browser Assist";
    default:
      return value;
  }
}

function formatExtensionSourceKindLabel(value: string): string {
  switch (value) {
    case "mcp_bridge":
      return "MCP Bridge";
    case "runtime_extension":
      return "Runtime Extension";
    default:
      return value;
  }
}

function formatRuntimeToolSourceKindLabel(value: string): string {
  switch (value) {
    case "registry_native":
      return "Registry";
    case "current_surface":
      return "当前工具面";
    case "runtime_extension":
      return "Extension";
    case "mcp":
      return "MCP";
    default:
      return value;
  }
}

function formatRuntimeToolAvailabilitySourceLabel(value: string): string {
  switch (value) {
    case "runtime_tools":
      return "runtime_tools";
    case "registry_tools":
      return "registry_tools";
    case "none":
    default:
      return "未就绪";
  }
}

function collectCatalogExecutionSources(
  entry: AgentRuntimeToolInventoryCatalogEntry,
): AgentToolExecutionPolicySource[] {
  return [
    entry.execution_warning_policy_source,
    entry.execution_restriction_profile_source,
    entry.execution_sandbox_profile_source,
  ];
}

function collectRegistryExecutionSources(
  entry: AgentRuntimeToolInventoryRegistryEntry,
): AgentToolExecutionPolicySource[] {
  return [
    entry.catalog_execution_warning_policy_source,
    entry.catalog_execution_restriction_profile_source,
    entry.catalog_execution_sandbox_profile_source,
  ].filter((value): value is AgentToolExecutionPolicySource => Boolean(value));
}

function sortRuntimeToolsByVisibility(
  tools: AgentRuntimeToolInventoryRuntimeEntry[],
): AgentRuntimeToolInventoryRuntimeEntry[] {
  return [...tools].sort((left, right) => {
    if (left.visible_in_context !== right.visible_in_context) {
      return left.visible_in_context ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

function matchesCatalogToolInventoryFilter(
  entry: AgentRuntimeToolInventoryCatalogEntry,
  filter: ToolInventoryFilterValue,
): boolean {
  const sources = collectCatalogExecutionSources(entry);

  switch (filter) {
    case "runtime":
      return sources.includes("runtime");
    case "persisted":
      return sources.includes("persisted");
    case "default":
      return sources.every((source) => source === "default");
    case "all":
    default:
      return true;
  }
}

function countCatalogToolsByInventoryFilter(
  catalogTools: AgentRuntimeToolInventoryCatalogEntry[],
  filter: ToolInventoryFilterValue,
): number {
  return catalogTools.filter((entry) =>
    matchesCatalogToolInventoryFilter(entry, filter),
  ).length;
}

function buildToolInventorySourceStats(
  catalogTools: AgentRuntimeToolInventoryCatalogEntry[],
): Record<AgentToolExecutionPolicySource, number> {
  const stats: Record<AgentToolExecutionPolicySource, number> = {
    default: 0,
    persisted: 0,
    runtime: 0,
  };

  for (const entry of catalogTools) {
    for (const source of collectCatalogExecutionSources(entry)) {
      stats[source] += 1;
    }
  }

  return stats;
}

function getActiveWriteDescription(write: HarnessActiveFileWrite): string {
  const parts = [
    formatArtifactWritePhaseLabel(write.phase),
    write.source ? formatWriteSourceLabel(write.source) : undefined,
    write.updatedAt ? formatTime(write.updatedAt) : undefined,
  ].filter(Boolean);

  return parts.join(" · ");
}

async function openExternalUrl(url: string): Promise<void> {
  try {
    await openExternal(url);
  } catch {
    if (typeof window !== "undefined" && typeof window.open === "function") {
      window.open(url, "_blank");
      return;
    }
    throw new Error("当前环境不支持打开外部链接");
  }
}

function InteractiveText({
  text,
  className,
  mono = false,
  stopPropagation = false,
  onOpenUrl,
}: {
  text?: string;
  className?: string;
  mono?: boolean;
  stopPropagation?: boolean;
  onOpenUrl: (url: string) => void | Promise<void>;
}) {
  if (!text?.trim()) {
    return null;
  }

  const segments = splitTextIntoSegments(text);

  return (
    <span
      className={cn(
        "whitespace-pre-wrap break-all",
        mono && "font-mono",
        className,
      )}
    >
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return (
            <span key={`text-${index}`} className="whitespace-pre-wrap">
              {segment.value}
            </span>
          );
        }

        const handleOpen = (
          event:
            | ReactMouseEvent<HTMLSpanElement>
            | ReactKeyboardEvent<HTMLSpanElement>,
        ) => {
          if ("key" in event && event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          if (stopPropagation) {
            event.stopPropagation();
          }
          void onOpenUrl(segment.value);
        };

        return (
          <span
            key={`url-${segment.value}-${index}`}
            role="link"
            tabIndex={0}
            aria-label={`打开链接：${segment.value}`}
            className="cursor-pointer underline decoration-dotted underline-offset-2 text-primary transition-colors hover:text-primary/80"
            onClick={handleOpen}
            onKeyDown={handleOpen}
          >
            {segment.value}
          </span>
        );
      })}
    </span>
  );
}

function PathTextLink({
  path,
  className,
  stopPropagation = false,
  onOpenPath,
}: {
  path?: string;
  className?: string;
  stopPropagation?: boolean;
  onOpenPath: (path: string) => void | Promise<void>;
}) {
  if (!path?.trim()) {
    return null;
  }

  const normalizedPath = path.trim();

  const handleOpen = (
    event:
      | ReactMouseEvent<HTMLSpanElement>
      | ReactKeyboardEvent<HTMLSpanElement>,
  ) => {
    if ("key" in event && event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    if (stopPropagation) {
      event.stopPropagation();
    }
    void onOpenPath(normalizedPath);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`系统打开路径：${normalizedPath}`}
      className={cn(
        "cursor-pointer break-all underline decoration-dotted underline-offset-2 text-primary transition-colors hover:text-primary/80",
        className,
      )}
      onClick={handleOpen}
      onKeyDown={handleOpen}
    >
      {normalizedPath}
    </span>
  );
}

function ActionableBadge({
  value,
  variant,
  onOpenUrl,
  onOpenPath,
}: {
  value: string;
  variant: ComponentProps<typeof Badge>["variant"];
  onOpenUrl: (url: string) => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
}) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const matchedUrl = findFirstUrl(normalized);
  if (matchedUrl && matchedUrl === normalized) {
    return (
      <Badge variant={variant} className="max-w-full whitespace-normal">
        <InteractiveText text={normalized} onOpenUrl={onOpenUrl} />
      </Badge>
    );
  }

  if (isLikelyFilePath(normalized)) {
    return (
      <Badge variant={variant} className="max-w-full whitespace-normal">
        <PathTextLink path={normalized} onOpenPath={onOpenPath} />
      </Badge>
    );
  }

  return <Badge variant={variant}>{normalized}</Badge>;
}

function SearchOutputCard({
  signal,
  onOpenUrl,
  onOpenDetail,
}: {
  signal: HarnessOutputSignal;
  onOpenUrl: (url: string) => void | Promise<void>;
  onOpenDetail: () => void;
}) {
  const [resultsExpanded, setResultsExpanded] = useState(true);
  const results = useMemo(
    () =>
      resolveSearchResultPreviewItemsFromText(
        signal.content?.trim() ||
          signal.preview?.trim() ||
          signal.summary.trim(),
      ),
    [signal.content, signal.preview, signal.summary],
  );

  useEffect(() => {
    setResultsExpanded(true);
  }, [signal.id]);
  const semantic = useMemo(
    () => classifySearchQuerySemantic(signal.summary),
    [signal.summary],
  );

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-medium text-orange-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <Search className="h-3.5 w-3.5" />
            <span>
              {agentText("agentChat.harness.generated.3fd8a99317", "已搜索")}
            </span>
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-foreground">
            {signal.summary}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {signal.title}
            {results.length > 0 ? ` · ${results.length} 条结果` : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{semantic.label}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {results.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              aria-label={
                resultsExpanded
                  ? `收起搜索结果：${signal.summary}`
                  : `展开搜索结果：${signal.summary}`
              }
              onClick={() => setResultsExpanded((prev) => !prev)}
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  resultsExpanded && "rotate-180",
                )}
              />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            aria-label={`查看工具输出：${signal.title}`}
            onClick={onOpenDetail}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {results.length > 0 && resultsExpanded ? (
        <SearchResultPreviewList
          items={results}
          onOpenUrl={onOpenUrl}
          popoverSide="left"
          popoverAlign="start"
          className="mt-3"
        />
      ) : !results.length && signal.preview ? (
        <div className="mt-3 rounded-xl bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
          <InteractiveText text={signal.preview} onOpenUrl={onOpenUrl} />
        </div>
      ) : null}
    </div>
  );
}

function SearchOutputBatchCard({
  signals,
  onOpenUrl,
  onOpenDetail,
}: {
  signals: HarnessOutputSignal[];
  onOpenUrl: (url: string) => void | Promise<void>;
  onOpenDetail: (signal: HarnessOutputSignal) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const semanticSummaries = useMemo(
    () =>
      summarizeSearchQuerySemantics(signals.map((signal) => signal.summary)),
    [signals],
  );
  const preview = signals
    .slice(0, 2)
    .map((signal) => signal.summary)
    .join(" · ");
  const hiddenCount = Math.max(signals.length - 2, 0);

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-label={expanded ? "收起搜索批次" : "展开搜索批次"}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-medium text-orange-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <Search className="h-3.5 w-3.5" />
            <span>
              {agentText("agentChat.harness.generated.3fd8a99317", "已搜索")}{" "}
              {signals.length}{" "}
              {agentText("agentChat.harness.generated.eea45025c0", "组查询")}
            </span>
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-foreground">
            {preview}
            {hiddenCount > 0 ? ` 等 ${hiddenCount} 组` : ""}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {agentText(
              "agentChat.harness.generated.2ecb34de2f",
              "联网检索批次",
            )}
          </div>
        </div>
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          aria-hidden="true"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>
      {semanticSummaries.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {semanticSummaries.map((item) => (
            <Badge key={item.key} variant="secondary">
              {item.label} {item.count}
            </Badge>
          ))}
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-3 space-y-3">
          {signals.map((signal) => (
            <SearchOutputCard
              key={signal.id}
              signal={signal}
              onOpenUrl={onOpenUrl}
              onOpenDetail={() => onOpenDetail(signal)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
  onClick,
  compact = false,
}: {
  title: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  onClick?: () => void;
  compact?: boolean;
}) {
  const cardContent = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        <div
          className={cn(
            "mt-1 font-semibold text-foreground",
            compact ? "text-sm" : "text-base",
          )}
        >
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      </div>
      <div className="rounded-lg bg-muted p-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(
          "rounded-xl border border-border bg-background/80 text-left transition-colors hover:bg-muted/60",
          compact ? "p-2.5" : "p-3",
        )}
        onClick={onClick}
        aria-label={`跳转到${title}`}
      >
        {cardContent}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background/80",
        compact ? "p-2.5" : "p-3",
      )}
    >
      {cardContent}
    </div>
  );
}

function InventoryStatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-1 text-base font-semibold text-foreground">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function BrowserActionIndexSummarySection({
  index,
  onOpenReplay,
}: {
  index: AgentRuntimeEvidenceBrowserActionIndex;
  onOpenReplay?: () => void;
}) {
  if (index.action_count <= 0 && index.items.length === 0) {
    return null;
  }

  const recentItems = index.items.slice(-3).reverse();
  const latestUrl =
    index.last_url ||
    recentItems.find((item) => item.last_url)?.last_url ||
    "暂无 URL";

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-sky-950">
        <Eye className="h-4 w-4 text-sky-700" />
        <span>
          {agentText(
            "agentChat.harness.generated.a8d571b990",
            "Browser Assist 索引",
          )}
        </span>
      </div>
      <p className="mt-1 text-xs text-sky-800">
        {agentText(
          "agentChat.harness.generated.47e2036a10",
          "来自 modalityRuntimeContracts.snapshotIndex.browserActionIndex，复盘 browser_session / browser_snapshot 的执行证据。",
        )}
      </p>

      {onOpenReplay ? (
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2 bg-background"
            onClick={onOpenReplay}
            aria-label={agentText(
              "agentChat.harness.generated.38ccfba4fd",
              "打开 Browser Assist 复盘",
            )}
          >
            <Eye className="h-4 w-4" />
            {agentText("agentChat.harness.generated.e0dfe06ac9", "打开复盘")}
          </Button>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.e5d6795411",
            "浏览器动作",
          )}
          value={`${index.action_count}`}
          hint="browser_control action"
        />
        <InventoryStatCard
          title={agentText("agentChat.harness.generated.836ffe0e10", "会话")}
          value={`${index.session_count}`}
          hint={
            index.profile_keys.length > 0
              ? `profile ${index.profile_keys.slice(0, 2).join(" / ")}`
              : "session / target"
          }
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.17e12280d3",
            "观察 / 截图",
          )}
          value={`${index.observation_count} / ${index.screenshot_count}`}
          hint="observation / screenshot"
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.bf662d18eb",
            "最近 URL",
          )}
          value={latestUrl === "暂无 URL" ? latestUrl : "已记录"}
          hint={latestUrl}
        />
      </div>

      {recentItems.length > 0 ? (
        <div className="mt-3 space-y-2">
          {recentItems.map((item, indexInList) => {
            const itemKey = [
              item.request_id,
              item.session_id,
              item.action,
              indexInList,
            ]
              .filter(Boolean)
              .join(":");
            return (
              <div
                key={itemKey}
                className="rounded-lg border border-sky-200/80 bg-background/85 p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {item.action || item.tool_name || "browser action"}
                  </span>
                  <Badge variant="outline">
                    {formatBrowserActionArtifactKindLabel(item.artifact_kind)}
                  </Badge>
                  <Badge
                    variant={
                      item.success === false ? "destructive" : "secondary"
                    }
                  >
                    {formatBrowserActionStatusLabel(item)}
                  </Badge>
                  {item.backend ? (
                    <Badge variant="outline">{item.backend}</Badge>
                  ) : null}
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {item.last_url ? (
                    <div className="break-all">
                      {agentText(
                        "agentChat.harness.generated.6e1359115e",
                        "URL：",
                      )}
                      <span className="ml-1 font-mono text-foreground">
                        {item.last_url}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {item.session_id ? (
                      <span>
                        {agentText(
                          "agentChat.harness.generated.d0d6758917",
                          "session：",
                        )}
                        <span className="ml-1 font-mono text-foreground">
                          {item.session_id}
                        </span>
                      </span>
                    ) : null}
                    {item.target_id ? (
                      <span>
                        {agentText(
                          "agentChat.harness.generated.2b252e0cfe",
                          "target：",
                        )}
                        <span className="ml-1 font-mono text-foreground">
                          {item.target_id}
                        </span>
                      </span>
                    ) : null}
                    {item.entry_source ? (
                      <span>
                        {agentText(
                          "agentChat.harness.generated.dd1909c1cb",
                          "entry：",
                        )}
                        <span className="ml-1 font-mono text-foreground">
                          {item.entry_source}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function LimeCorePolicyItemCard({
  item,
}: {
  item: AgentRuntimeEvidenceLimeCorePolicyItem;
}) {
  const missingInputs = uniqueNonEmptyStrings([
    ...(item.missing_inputs ?? []),
    ...(item.unresolved_refs ?? []),
  ]);
  const policyInputs = item.policy_inputs ?? [];
  const policyInputPreview = policyInputs.slice(0, 4);
  const contractLabel = item.contract_key || "runtime_contract";

  return (
    <div className="rounded-lg border border-amber-200/80 bg-background/85 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          {contractLabel}
        </span>
        <Badge variant="outline">
          {formatLimeCorePolicyStatusLabel(item.status)}
        </Badge>
        <Badge variant={item.decision === "deny" ? "destructive" : "secondary"}>
          {formatLimeCorePolicyDecisionLabel(item.decision)}
        </Badge>
        {item.decision_source ? (
          <Badge variant="outline">{item.decision_source}</Badge>
        ) : null}
      </div>

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {item.execution_profile_key ? (
            <span>
              {agentText("agentChat.harness.generated.6a0ea95fa7", "profile：")}
              <span className="ml-1 font-mono text-foreground">
                {item.execution_profile_key}
              </span>
            </span>
          ) : null}
          {item.executor_adapter_key ? (
            <span>
              {agentText("agentChat.harness.generated.adc8d92098", "adapter：")}
              <span className="ml-1 font-mono text-foreground">
                {item.executor_adapter_key}
              </span>
            </span>
          ) : null}
          {item.decision_scope ? (
            <span>
              {agentText("agentChat.harness.generated.09819d76d1", "scope：")}
              <span className="ml-1 font-mono text-foreground">
                {item.decision_scope}
              </span>
            </span>
          ) : null}
        </div>
        {item.decision_reason ? (
          <div>
            {agentText("agentChat.harness.generated.0f93c2bb0a", "原因：")}
            <span className="ml-1 text-foreground">{item.decision_reason}</span>
          </div>
        ) : null}
        <div>
          {agentText("agentChat.harness.generated.5a00a7de0d", "refs：")}
          <span className="ml-1 font-mono text-foreground">
            {item.refs.length > 0 ? item.refs.join(" / ") : "暂无"}
          </span>
        </div>
        {missingInputs.length > 0 ? (
          <div>
            {agentText("agentChat.harness.generated.dcd0ea07f2", "missing：")}
            <span className="ml-1 font-mono text-foreground">
              {missingInputs.join(" / ")}
            </span>
          </div>
        ) : null}
      </div>

      {policyInputPreview.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {policyInputPreview.map((input) => (
            <Badge
              key={`${contractLabel}:${input.ref_key}`}
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-800"
            >
              {input.ref_key} ·{" "}
              {formatLimeCorePolicyInputStatusLabel(input.status)} ·{" "}
              {formatLimeCorePolicyInputSourceLabel(input.value_source)}
            </Badge>
          ))}
          {policyInputs.length > policyInputPreview.length ? (
            <Badge variant="outline">
              +{policyInputs.length - policyInputPreview.length}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LimeCorePolicyIndexSummarySection({
  index,
}: {
  index: AgentRuntimeEvidenceLimeCorePolicyIndex;
}) {
  const refKeys = collectLimeCorePolicyRefKeys(index);
  const missingInputs = collectLimeCorePolicyMissingInputs(index);
  const recentItems = index.items.slice(-3).reverse();

  if (index.snapshot_count <= 0 && recentItems.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-950">
        <ShieldAlert className="h-4 w-4 text-amber-700" />
        <span>
          {agentText(
            "agentChat.harness.generated.5ff0237c2a",
            "LimeCore 策略缺口",
          )}
        </span>
      </div>
      <p className="mt-1 text-xs text-amber-800">
        {agentText(
          "agentChat.harness.generated.dd61dfc98f",
          "来自 modalityRuntimeContracts.snapshotIndex.limecorePolicyIndex；当前 allow 仅代表本地默认未阻断，missing inputs 仍等待 LimeCore 控制面命中。",
        )}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.9862eec754",
            "策略快照",
          )}
          value={`${index.snapshot_count}`}
          hint="runtime contract snapshots"
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.1bdaad7e35",
            "控制面引用",
          )}
          value={`${refKeys.length}`}
          hint={refKeys.slice(0, 3).join(" / ") || "暂无 refs"}
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.f60047f6ac",
            "缺失输入",
          )}
          value={`${missingInputs.length}`}
          hint={missingInputs.slice(0, 3).join(" / ") || "暂无缺口"}
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.6b803cba6a",
            "策略决策",
          )}
          value={summarizeLimeCorePolicyDecision(index)}
          hint="allow / ask / deny"
        />
      </div>

      {missingInputs.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {missingInputs.map((input) => (
            <Badge
              key={input}
              variant="outline"
              className="border-amber-300 bg-background text-amber-800"
            >
              {input}
            </Badge>
          ))}
        </div>
      ) : null}

      {recentItems.length > 0 ? (
        <div className="mt-3 space-y-2">
          {recentItems.map((item, indexInList) => (
            <LimeCorePolicyItemCard
              key={[
                item.contract_key,
                item.execution_profile_key,
                item.executor_adapter_key,
                indexInList,
              ]
                .filter(Boolean)
                .join(":")}
              item={item}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildBrowserReplayArtifact(
  evidencePack: AgentRuntimeEvidencePack,
  index: AgentRuntimeEvidenceBrowserActionIndex,
): Artifact {
  const timestamp = Date.parse(evidencePack.exported_at);
  return {
    id: `browser-replay:${evidencePack.session_id}`,
    type: "browser_assist",
    title: "Browser Assist 复盘",
    content: "",
    status: "complete",
    meta: {
      browserActionIndex: {
        actionCount: index.action_count,
        sessionCount: index.session_count,
        observationCount: index.observation_count,
        screenshotCount: index.screenshot_count,
        lastUrl: index.last_url,
        sessionIds: index.session_ids,
        targetIds: index.target_ids,
        profileKeys: index.profile_keys,
        items: index.items.map((item) => ({
          artifactKind: item.artifact_kind,
          toolName: item.tool_name,
          action: item.action,
          status: item.status,
          success: item.success,
          sessionId: item.session_id,
          targetId: item.target_id,
          profileKey: item.profile_key,
          backend: item.backend,
          requestId: item.request_id,
          lastUrl: item.last_url,
          title: item.title,
          entrySource: item.entry_source,
          observationAvailable: item.observation_available,
          screenshotAvailable: item.screenshot_available,
        })),
      },
      modalityContractKey: "browser_control",
      viewerSurface: "browser_replay_viewer",
      evidencePackRoot: evidencePack.pack_relative_root,
      sessionId: index.session_ids[0] || evidencePack.session_id,
      profileKey: index.profile_keys[0],
      targetId: index.target_ids[0],
      url: index.last_url,
    },
    position: { start: 0, end: 0 },
    createdAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
    updatedAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}

function Section({
  sectionKey,
  title,
  badge,
  children,
  registerRef,
}: {
  sectionKey?: HarnessSectionKey;
  title: string;
  badge?: string;
  children: ReactNode;
  registerRef?: (key: HarnessSectionKey, node: HTMLElement | null) => void;
}) {
  return (
    <section
      ref={(node) =>
        sectionKey && registerRef ? registerRef(sectionKey, node) : undefined
      }
      data-harness-section={sectionKey}
      className="rounded-xl border border-border bg-background/80 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
      {children}
    </section>
  );
}

export function HarnessStatusPanel({
  harnessState,
  environment,
  layout = "default",
  onLoadFilePreview,
  onOpenFile,
  onRevealPath,
  onOpenPath,
  onOpenFileCheckpoints,
  childSubagentSessions = [],
  onOpenSubagentSession,
  toolInventory,
  toolInventoryLoading = false,
  toolInventoryError = null,
  onRefreshToolInventory,
  title = "处理工作台",
  description = "集中查看最新进展、文件变更、处理结果和待确认事项。",
  toggleLabel = "详情",
  leadContent,
  selectedTeamLabel = null,
  selectedTeamSummary = null,
  selectedTeamRoles = [],
  threadRead = null,
  turns = [],
  threadItems = [],
  currentTurnId = null,
  pendingActions = [],
  submittedActionsInFlight = [],
  onRespondToAction,
  queuedTurns = [],
  canInterrupt = false,
  onInterruptCurrentTurn,
  onResumeThread,
  onReplayPendingRequest,
  onPromoteQueuedTurn,
  onObjectiveChanged,
  onOpenMemoryWorkbench,
  messages = [],
  teamMemorySnapshot = null,
  diagnosticRuntimeContext = null,
}: HarnessStatusPanelProps) {
  const { t, i18n } = useTranslation("agent");
  const translateAgent = useCallback<AgentTranslation>(
    (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const translateProjection = useCallback<AgentUiProjectionTranslation>(
    (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const locale = i18n.resolvedLanguage || i18n.language;
  const [expanded, setExpanded] = useState(true);
  const isDialogLayout = layout === "dialog";
  const isDetailsExpanded = isDialogLayout ? true : expanded;
  const [fileFilter, setFileFilter] = useState<FileFilterValue>("all");
  const [outputFilter, setOutputFilter] = useState<OutputFilterValue>("all");
  const [fileDisplayMode, setFileDisplayMode] =
    useState<FileDisplayMode>("timeline");
  const [toolInventoryFilter, setToolInventoryFilter] =
    useState<ToolInventoryFilterValue>("all");
  const [fileChangeDecisions, setFileChangeDecisions] = useState<
    Record<string, FileChangeDecisionStatus>
  >({});
  const [selectedFileChangeKeys, setSelectedFileChangeKeys] = useState<
    string[]
  >([]);
  const [previewDialog, setPreviewDialog] = useState<PreviewDialogState>({
    open: false,
    title: "",
    displayName: "",
    isBinary: false,
    loading: false,
  });
  const [handoffBundle, setHandoffBundle] =
    useState<AgentRuntimeHandoffBundle | null>(null);
  const [handoffExporting, setHandoffExporting] = useState(false);
  const [handoffExportError, setHandoffExportError] = useState<string | null>(
    null,
  );
  const [evidencePack, setEvidencePack] =
    useState<AgentRuntimeEvidencePack | null>(null);
  const [evidenceExporting, setEvidenceExporting] = useState(false);
  const [evidenceExportError, setEvidenceExportError] = useState<string | null>(
    null,
  );
  const [replayCase, setReplayCase] = useState<AgentRuntimeReplayCase | null>(
    null,
  );
  const [replayExporting, setReplayExporting] = useState(false);
  const [replayExportError, setReplayExportError] = useState<string | null>(
    null,
  );
  const [analysisHandoff, setAnalysisHandoff] =
    useState<AgentRuntimeAnalysisHandoff | null>(null);
  const [analysisExporting, setAnalysisExporting] = useState(false);
  const [analysisExportError, setAnalysisExportError] = useState<string | null>(
    null,
  );
  const [reviewDecisionTemplate, setReviewDecisionTemplate] =
    useState<AgentRuntimeReviewDecisionTemplate | null>(null);
  const [reviewDecisionEditorOpen, setReviewDecisionEditorOpen] =
    useState(false);
  const [reviewDecisionExporting, setReviewDecisionExporting] = useState(false);
  const [reviewDecisionSaving, setReviewDecisionSaving] = useState(false);
  const [reviewDecisionExportError, setReviewDecisionExportError] = useState<
    string | null
  >(null);
  const previewRequestIdRef = useRef(0);
  const sectionRefs = useRef<
    Partial<Record<HarnessSectionKey, HTMLElement | null>>
  >({});
  const currentSessionId = diagnosticRuntimeContext?.sessionId?.trim() || null;
  const agentUiProjectionFilter = useMemo<AgentUiProjectionScopeFilter | null>(
    () => (currentSessionId ? { sessionId: currentSessionId } : null),
    [currentSessionId],
  );
  const agentUiProjectionEvents = useAgentUiProjectionEvents(
    agentUiProjectionFilter,
  );
  const agentUiProjectionSummary = useMemo(
    () =>
      currentSessionId
        ? summarizeAgentUiProjectionEvents(agentUiProjectionEvents)
        : summarizeAgentUiProjectionEvents([]),
    [agentUiProjectionEvents, currentSessionId],
  );
  const hasAgentUiProjectionSection = agentUiProjectionSummary.total > 0;

  useEffect(() => {
    setHandoffBundle(null);
    setHandoffExportError(null);
    setHandoffExporting(false);
    setEvidencePack(null);
    setEvidenceExportError(null);
    setEvidenceExporting(false);
    setReplayCase(null);
    setReplayExportError(null);
    setReplayExporting(false);
    setAnalysisHandoff(null);
    setAnalysisExportError(null);
    setAnalysisExporting(false);
    setReviewDecisionTemplate(null);
    setReviewDecisionEditorOpen(false);
    setReviewDecisionExportError(null);
    setReviewDecisionExporting(false);
    setReviewDecisionSaving(false);
  }, [currentSessionId]);

  const registerSectionRef = useCallback(
    (key: HarnessSectionKey, node: HTMLElement | null) => {
      sectionRefs.current[key] = node;
    },
    [],
  );

  const scrollToSection = useCallback((key: HarnessSectionKey) => {
    const target = sectionRefs.current[key];
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleExportHandoffBundle = useCallback(async () => {
    if (!currentSessionId) {
      toast.error("当前没有可导出的会话上下文");
      return;
    }

    setHandoffExporting(true);
    setHandoffExportError(null);
    try {
      const bundle = await exportAgentRuntimeHandoffBundle(currentSessionId);
      setHandoffBundle(bundle);
      recordAgentUiProjectionEvents(
        buildAgentUiHandoffProjectionEvents(
          {
            evidenceId: bundle.bundle_relative_root,
            handoffId: bundle.bundle_relative_root,
            sessionId: bundle.session_id,
            threadId: bundle.thread_id,
            kind: "runtime_handoff_bundle",
            status: "handoff_requested",
            verdict: "complete",
            from: "lime_runtime",
            to: "specialist_runtime",
            reason: "handoff_bundle_exported",
            resumeTarget: bundle.bundle_relative_root,
            contextBoundary: bundle.workspace_root,
            summaryPreview: `已导出 ${bundle.artifacts.length} 个交接制品`,
            artifactPaths: bundle.artifacts.map(
              (artifact) => artifact.relative_path,
            ),
            itemCount: bundle.artifacts.length,
          },
          {
            timestamp: bundle.exported_at,
            sessionId: bundle.session_id,
            threadId: bundle.thread_id,
          },
        ),
      );
      toast.success(`已导出 ${bundle.artifacts.length} 个交接制品`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出交接制品失败";
      setHandoffExportError(message);
      recordAgentUiProjectionEvents(
        buildAgentUiHandoffProjectionEvents(
          {
            evidenceId: `handoff-bundle:${currentSessionId}`,
            handoffId: `handoff-bundle:${currentSessionId}`,
            sessionId: currentSessionId,
            kind: "runtime_handoff_bundle",
            status: "failed",
            verdict: "export_failed",
            from: "lime_runtime",
            to: "specialist_runtime",
            reason: "handoff_bundle_export_failed",
            summaryPreview: message,
          },
          {
            timestamp: new Date().toISOString(),
            sessionId: currentSessionId,
          },
        ),
      );
      toast.error(message);
    } finally {
      setHandoffExporting(false);
    }
  }, [currentSessionId]);

  const handleExportEvidencePack = useCallback(async () => {
    if (!currentSessionId) {
      toast.error("当前没有可导出的会话上下文");
      return;
    }

    setEvidenceExporting(true);
    setEvidenceExportError(null);
    try {
      const pack = await exportAgentRuntimeEvidencePack(currentSessionId);
      setEvidencePack(pack);
      recordAgentUiProjectionEvents([
        buildAgentUiEvidenceChangedEvent(
          {
            evidenceId: pack.pack_relative_root,
            sessionId: pack.session_id,
            threadId: pack.thread_id,
            kind: "evidence_pack",
            status: "ready",
            verdict: pack.known_gaps.length > 0 ? "gaps_present" : "complete",
            summaryPreview: `已导出 ${pack.artifacts.length} 个问题证据文件`,
            artifactPaths: pack.artifacts.map(
              (artifact) => artifact.relative_path,
            ),
            itemCount: pack.item_count,
          },
          {
            timestamp: pack.exported_at,
            sessionId: pack.session_id,
            threadId: pack.thread_id,
          },
        ),
      ]);
      toast.success(`已导出 ${pack.artifacts.length} 个问题证据文件`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出问题证据包失败";
      setEvidenceExportError(message);
      recordAgentUiProjectionEvents([
        buildAgentUiEvidenceChangedEvent(
          {
            evidenceId: `evidence-pack:${currentSessionId}`,
            sessionId: currentSessionId,
            kind: "evidence_pack",
            status: "failed",
            verdict: "export_failed",
            summaryPreview: message,
          },
          {
            timestamp: new Date().toISOString(),
            sessionId: currentSessionId,
          },
        ),
      ]);
      toast.error(message);
    } finally {
      setEvidenceExporting(false);
    }
  }, [currentSessionId]);

  const handleExportReplayCase = useCallback(async () => {
    if (!currentSessionId) {
      toast.error("当前没有可导出的会话上下文");
      return null;
    }

    setReplayExporting(true);
    setReplayExportError(null);
    try {
      const replay = await exportAgentRuntimeReplayCase(currentSessionId);
      setReplayCase(replay);
      recordAgentUiProjectionEvents([
        buildAgentUiEvidenceChangedEvent(
          {
            evidenceId: replay.replay_relative_root,
            sessionId: replay.session_id,
            threadId: replay.thread_id,
            kind: "replay_case",
            status: "ready",
            verdict: "complete",
            summaryPreview: `已导出 ${replay.artifacts.length} 个 Replay 样本文件`,
            artifactPaths: replay.artifacts.map(
              (artifact) => artifact.relative_path,
            ),
            itemCount: replay.artifacts.length,
          },
          {
            timestamp: replay.exported_at,
            sessionId: replay.session_id,
            threadId: replay.thread_id,
          },
        ),
      ]);
      toast.success(`已导出 ${replay.artifacts.length} 个 Replay 样本文件`);
      return replay;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出 Replay 样本失败";
      setReplayExportError(message);
      recordAgentUiProjectionEvents([
        buildAgentUiEvidenceChangedEvent(
          {
            evidenceId: `replay-case:${currentSessionId}`,
            sessionId: currentSessionId,
            kind: "replay_case",
            status: "failed",
            verdict: "export_failed",
            summaryPreview: message,
          },
          {
            timestamp: new Date().toISOString(),
            sessionId: currentSessionId,
          },
        ),
      ]);
      toast.error(message);
      return null;
    } finally {
      setReplayExporting(false);
    }
  }, [currentSessionId]);

  const handleExportAnalysisHandoff = useCallback(async () => {
    if (!currentSessionId) {
      toast.error("当前没有可导出的会话上下文");
      return null;
    }

    setAnalysisExporting(true);
    setAnalysisExportError(null);
    try {
      const analysis =
        await exportAgentRuntimeAnalysisHandoff(currentSessionId);
      setAnalysisHandoff(analysis);
      recordAgentUiProjectionEvents(
        buildAgentUiHandoffProjectionEvents(
          {
            evidenceId: analysis.analysis_relative_root,
            handoffId: analysis.handoff_bundle_relative_root,
            sessionId: analysis.session_id,
            threadId: analysis.thread_id,
            kind: "analysis_handoff",
            status: "handoff_requested",
            verdict: "complete",
            from: "lime_harness",
            to: "external_reviewer",
            reason: "analysis_handoff_exported",
            resumeTarget: analysis.analysis_relative_root,
            contextBoundary: analysis.sanitized_workspace_root,
            summaryPreview: `已导出 ${analysis.artifacts.length} 个外部分析文件`,
            artifactPaths: analysis.artifacts.map(
              (artifact) => artifact.relative_path,
            ),
            itemCount: analysis.artifacts.length,
          },
          {
            timestamp: analysis.exported_at,
            sessionId: analysis.session_id,
            threadId: analysis.thread_id,
          },
        ),
      );
      toast.success(`已导出 ${analysis.artifacts.length} 个外部分析文件`);
      return analysis;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出外部分析交接失败";
      setAnalysisExportError(message);
      recordAgentUiProjectionEvents(
        buildAgentUiHandoffProjectionEvents(
          {
            evidenceId: `analysis-handoff:${currentSessionId}`,
            handoffId: `analysis-handoff:${currentSessionId}`,
            sessionId: currentSessionId,
            kind: "analysis_handoff",
            status: "failed",
            verdict: "export_failed",
            from: "lime_harness",
            to: "external_reviewer",
            reason: "analysis_handoff_export_failed",
            summaryPreview: message,
          },
          {
            timestamp: new Date().toISOString(),
            sessionId: currentSessionId,
          },
        ),
      );
      toast.error(message);
      return null;
    } finally {
      setAnalysisExporting(false);
    }
  }, [currentSessionId]);

  const handleCopyAnalysisPrompt = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("当前环境不支持剪贴板复制");
      return;
    }

    const analysis = analysisHandoff || (await handleExportAnalysisHandoff());
    if (!analysis?.copy_prompt) {
      return;
    }

    try {
      await navigator.clipboard.writeText(analysis.copy_prompt);
      toast.success("已复制 AI 诊断与修复指令");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "复制 AI 诊断与修复指令失败",
      );
    }
  }, [analysisHandoff, handleExportAnalysisHandoff]);

  const handleCopyReplayPromotionCommand = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("当前环境不支持剪贴板复制");
      return;
    }

    const replay = replayCase || (await handleExportReplayCase());
    if (!replay) {
      return;
    }

    const promoteCommand = buildReplayPromotionCommand({
      replayCase: replay,
      analysisTitle: analysisHandoff?.title,
      reviewTitle: reviewDecisionTemplate?.title,
    });
    const evalCommand = buildReplayEvalCommand();
    const trendCommand = buildReplayTrendCommand();

    try {
      await navigator.clipboard.writeText(
        `${promoteCommand}\n${evalCommand}\n${trendCommand}\n`,
      );
      toast.success("已复制回归沉淀、验证与趋势命令");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "复制回归沉淀、验证与趋势命令失败",
      );
    }
  }, [
    analysisHandoff?.title,
    handleExportReplayCase,
    replayCase,
    reviewDecisionTemplate?.title,
  ]);

  const handleExportReviewDecisionTemplate = useCallback(async () => {
    if (!currentSessionId) {
      toast.error("当前没有可导出的会话上下文");
      return null;
    }

    setReviewDecisionExporting(true);
    setReviewDecisionExportError(null);
    try {
      const template =
        await exportAgentRuntimeReviewDecisionTemplate(currentSessionId);
      const regressionFacts = resolveReviewDecisionRegressionFacts(
        template.verification_summary,
      );
      setReviewDecisionTemplate(template);
      recordAgentUiProjectionEvents(
        buildAgentUiReviewProjectionEvents(
          {
            reviewEvent: "requested",
            evidenceId: template.review_relative_root,
            reviewId: template.review_relative_root,
            sessionId: template.session_id,
            threadId: template.thread_id,
            kind: "review_decision",
            status: "ready",
            verdict: template.default_decision_status,
            decisionStatus: template.default_decision_status,
            riskLevel: template.decision.risk_level,
            checklistCount: template.review_checklist.length,
            ...regressionFacts,
            requestedFixes: template.decision.followup_actions,
            followupActions: template.decision.followup_actions,
            regressionRequirements: template.decision.regression_requirements,
            summaryPreview: `已导出 ${template.artifacts.length} 个人工审核文件`,
            artifactPaths: template.artifacts.map(
              (artifact) => artifact.relative_path,
            ),
            itemCount: template.artifacts.length,
          },
          {
            timestamp: template.exported_at,
            sessionId: template.session_id,
            threadId: template.thread_id,
          },
        ),
      );
      recordTeamControlAgentUiProjection(
        {
          action: "request_review",
          requestedSessionIds: [],
          affectedSessionIds: [],
          reviewId: template.review_relative_root,
          workItemId: template.review_relative_root,
          runtimeEntity: "work_item",
          messagePreview: `已导出 ${template.artifacts.length} 个人工审核文件`,
          timestamp: template.exported_at,
        },
        {
          timestamp: template.exported_at,
          sessionId: template.session_id,
          threadId: template.thread_id,
        },
      );
      toast.success(`已导出 ${template.artifacts.length} 个人工审核文件`);
      return template;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出人工审核记录失败";
      setReviewDecisionExportError(message);
      recordAgentUiProjectionEvents(
        buildAgentUiReviewProjectionEvents(
          {
            reviewEvent: "completed",
            evidenceId: `review-decision:${currentSessionId}`,
            reviewId: `review-decision:${currentSessionId}`,
            sessionId: currentSessionId,
            kind: "review_decision",
            status: "failed",
            verdict: "export_failed",
            decisionStatus: "export_failed",
            summaryPreview: message,
          },
          {
            timestamp: new Date().toISOString(),
            sessionId: currentSessionId,
          },
        ),
      );
      toast.error(message);
      return null;
    } finally {
      setReviewDecisionExporting(false);
    }
  }, [currentSessionId]);

  const handleOpenReviewDecisionEditor = useCallback(async () => {
    const template =
      reviewDecisionTemplate || (await handleExportReviewDecisionTemplate());
    if (!template) {
      return;
    }

    setReviewDecisionTemplate(template);
    setReviewDecisionEditorOpen(true);
  }, [handleExportReviewDecisionTemplate, reviewDecisionTemplate]);

  const handleSaveReviewDecision = useCallback(
    async (request: AgentRuntimeSaveReviewDecisionRequest) => {
      setReviewDecisionSaving(true);
      setReviewDecisionExportError(null);
      try {
        const template = await saveAgentRuntimeReviewDecision(request);
        const regressionFacts = resolveReviewDecisionRegressionFacts(
          template.verification_summary,
        );
        setReviewDecisionTemplate(template);
        setReviewDecisionEditorOpen(false);
        recordAgentUiProjectionEvents(
          buildAgentUiReviewProjectionEvents(
            {
              reviewEvent: "completed",
              evidenceId: template.review_relative_root,
              reviewId: template.review_relative_root,
              sessionId: template.session_id,
              threadId: template.thread_id,
              kind: "review_decision",
              status: "completed",
              verdict: template.decision.decision_status,
              decisionStatus: template.decision.decision_status,
              reviewer: template.decision.human_reviewer,
              riskLevel: template.decision.risk_level,
              followupActionCount: template.decision.followup_actions.length,
              regressionRequirementCount:
                template.decision.regression_requirements.length,
              checklistCount: template.review_checklist.length,
              ...regressionFacts,
              requestedFixes: template.decision.followup_actions,
              followupActions: template.decision.followup_actions,
              regressionRequirements: template.decision.regression_requirements,
              summaryPreview: template.decision.decision_summary,
              artifactPaths: template.artifacts.map(
                (artifact) => artifact.relative_path,
              ),
              itemCount: template.artifacts.length,
            },
            {
              timestamp: template.exported_at,
              sessionId: template.session_id,
              threadId: template.thread_id,
            },
          ),
        );
        toast.success("已保存人工审核结果");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "保存人工审核结果失败";
        setReviewDecisionExportError(message);
        recordAgentUiProjectionEvents(
          buildAgentUiReviewProjectionEvents(
            {
              reviewEvent: "completed",
              evidenceId: `review-decision:${request.session_id}`,
              reviewId: `review-decision:${request.session_id}`,
              sessionId: request.session_id,
              kind: "review_decision",
              status: "failed",
              verdict: "save_failed",
              decisionStatus: "save_failed",
              summaryPreview: message,
            },
            {
              timestamp: new Date().toISOString(),
              sessionId: request.session_id,
            },
          ),
        );
        toast.error(message);
      } finally {
        setReviewDecisionSaving(false);
      }
    },
    [],
  );

  const hasToolInventorySection =
    toolInventoryLoading ||
    Boolean(toolInventoryError) ||
    Boolean(toolInventory);
  const hasHandoffSection = Boolean(currentSessionId);
  const runtimeTaskPresentation = useMemo(
    () => buildRuntimeTaskPresentation(harnessState.runtimeStatus),
    [harnessState.runtimeStatus],
  );
  const toolInventorySourceStats = useMemo(
    () => buildToolInventorySourceStats(toolInventory?.catalog_tools || []),
    [toolInventory],
  );
  const filteredCatalogTools = useMemo(
    () =>
      (toolInventory?.catalog_tools || []).filter((entry) =>
        matchesCatalogToolInventoryFilter(entry, toolInventoryFilter),
      ),
    [toolInventory, toolInventoryFilter],
  );
  const toolInventoryWarnings = toolInventory?.warnings || [];
  const toolInventoryCatalogTools = toolInventory?.catalog_tools || [];
  const toolInventoryRegistryTools = toolInventory?.registry_tools || [];
  const toolInventoryRuntimeTools = useMemo(
    () => sortRuntimeToolsByVisibility(toolInventory?.runtime_tools || []),
    [toolInventory?.runtime_tools],
  );
  const runtimeToolAvailability = useMemo(
    () => deriveRuntimeToolAvailability(toolInventory),
    [toolInventory],
  );
  const toolInventoryExtensionSurfaces =
    toolInventory?.extension_surfaces || [];
  const toolInventoryExtensionTools = toolInventory?.extension_tools || [];
  const toolInventoryMcpTools = toolInventory?.mcp_tools || [];
  const runtimeToolTotal =
    toolInventory?.counts.runtime_total ?? toolInventoryRuntimeTools.length;
  const runtimeToolVisibleTotal =
    toolInventory?.counts.runtime_visible_total ??
    toolInventoryRuntimeTools.filter((entry) => entry.visible_in_context)
      .length;
  const runtimeToolCapabilityGaps = useMemo(() => {
    if (!toolInventory || !runtimeToolAvailability.known) {
      return [];
    }

    const gaps: Array<{ key: string; title: string; missing: string[] }> = [];

    if (!runtimeToolAvailability.webSearch) {
      gaps.push({
        key: "web_search",
        title: "WebSearch",
        missing: ["WebSearch"],
      });
    }

    if (!runtimeToolAvailability.subagentCore) {
      gaps.push({
        key: "subagent_core",
        title: "子任务核心 tools",
        missing: runtimeToolAvailability.missingSubagentCoreTools,
      });
    }

    if (!runtimeToolAvailability.subagentTeamTools) {
      gaps.push({
        key: "subagent_team",
        title: "Team current tools",
        missing: runtimeToolAvailability.missingSubagentTeamTools,
      });
    }

    if (!runtimeToolAvailability.taskRuntime) {
      gaps.push({
        key: "task_runtime",
        title: "Task current tools",
        missing: runtimeToolAvailability.missingTaskTools,
      });
    }

    return gaps;
  }, [runtimeToolAvailability, toolInventory]);
  const realTeamSummary = useMemo(
    () => summarizeChildSubagentSessions(childSubagentSessions),
    [childSubagentSessions],
  );
  const hasSelectedTeamConfig =
    Boolean(selectedTeamLabel?.trim()) ||
    Boolean(selectedTeamSummary?.trim()) ||
    (selectedTeamRoles?.length ?? 0) > 0;
  const threadReliabilityView = useMemo(
    () =>
      buildThreadReliabilityView({
        threadRead,
        turns,
        threadItems,
        currentTurnId,
        pendingActions,
        submittedActionsInFlight,
        queuedTurns,
        t: translateProjection,
        locale,
      }),
    [
      currentTurnId,
      locale,
      pendingActions,
      queuedTurns,
      submittedActionsInFlight,
      threadItems,
      threadRead,
      translateProjection,
      turns,
    ],
  );
  const submittedActionIds = useMemo(
    () => new Set(submittedActionsInFlight.map((item) => item.requestId)),
    [submittedActionsInFlight],
  );
  const handleApprovalResponse = useCallback(
    (item: ActionRequired, confirmed: boolean) => {
      if (!onRespondToAction || item.actionType !== "tool_confirmation") {
        return;
      }

      void onRespondToAction({
        requestId: item.requestId,
        actionType: item.actionType,
        confirmed,
        response: confirmed ? "approved" : "rejected",
      });
    },
    [onRespondToAction],
  );
  const runtimeFactSummary = useMemo(() => {
    const decisionReason =
      threadRead?.decision_reason ||
      ((
        threadRead?.runtime_summary as { decisionReason?: string | null } | null
      )?.decisionReason ??
        null);
    const fallbackChain = Array.isArray(threadRead?.fallback_chain)
      ? threadRead?.fallback_chain || []
      : Array.isArray(
            (
              threadRead?.runtime_summary as {
                fallbackChain?: string[] | null;
              } | null
            )?.fallbackChain,
          )
        ? (threadRead?.runtime_summary as { fallbackChain?: string[] | null })
            .fallbackChain || []
        : [];
    const oemPolicy = threadRead?.oem_policy as {
      locked?: boolean | null;
      quotaLow?: boolean | null;
      defaultModel?: string | null;
      selectedModel?: string | null;
      quotaStatus?: string | null;
      offerState?: string | null;
      providerSource?: string | null;
      providerKey?: string | null;
      fallbackToLocalAllowed?: boolean | null;
      canInvoke?: boolean | null;
      tenantId?: string | null;
    } | null;

    if (!decisionReason && fallbackChain.length === 0 && !oemPolicy) {
      return null;
    }

    return {
      decisionReason,
      fallbackChain,
      oemPolicy,
    };
  }, [threadRead]);

  const fileFilterOptions = useMemo(
    () =>
      [
        { value: "all" as const, label: "全部" },
        { value: "document" as const, label: "文档" },
        { value: "code" as const, label: "代码" },
        { value: "log" as const, label: "日志" },
        { value: "artifact" as const, label: "产物" },
        { value: "offload" as const, label: "转存" },
        { value: "other" as const, label: "其他" },
      ].filter(
        (option) =>
          option.value === "all" ||
          harnessState.recentFileEvents.some(
            (event) => event.kind === option.value,
          ),
      ),
    [harnessState.recentFileEvents],
  );

  const outputFilterOptions = useMemo(
    () =>
      [
        { value: "all" as const, label: "全部" },
        { value: "path" as const, label: "有路径" },
        { value: "offload" as const, label: "转存" },
        { value: "truncated" as const, label: "截断" },
        { value: "summary" as const, label: "仅摘要" },
      ].filter(
        (option) =>
          option.value === "all" ||
          harnessState.outputSignals.some((signal) =>
            matchesOutputFilter(signal, option.value),
          ),
      ),
    [harnessState.outputSignals],
  );

  const filteredFileEvents = useMemo(
    () =>
      harnessState.recentFileEvents.filter(
        (event) => fileFilter === "all" || event.kind === fileFilter,
      ),
    [fileFilter, harnessState.recentFileEvents],
  );

  const filteredOutputSignals = useMemo(
    () =>
      harnessState.outputSignals.filter((signal) =>
        matchesOutputFilter(signal, outputFilter),
      ),
    [harnessState.outputSignals, outputFilter],
  );

  const groupedOutputEntries = useMemo(() => {
    const entries: Array<
      | { type: "single"; signal: HarnessOutputSignal }
      | { type: "search_batch"; signals: HarnessOutputSignal[] }
    > = [];

    for (const signal of filteredOutputSignals) {
      const isSearch = isSearchOutputSignal(signal);
      const lastEntry = entries[entries.length - 1];

      if (isSearch && lastEntry && lastEntry.type === "search_batch") {
        lastEntry.signals.push(signal);
        continue;
      }

      if (isSearch) {
        entries.push({ type: "search_batch", signals: [signal] });
        continue;
      }

      entries.push({ type: "single", signal });
    }

    return entries;
  }, [filteredOutputSignals]);

  const groupedFileEvents = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        path: string;
        displayName: string;
        kind: HarnessFileKind;
        latestEvent: HarnessSessionState["recentFileEvents"][number];
        count: number;
        events: HarnessSessionState["recentFileEvents"];
      }
    >();

    for (const event of filteredFileEvents) {
      const key = event.path.trim() || event.id;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          key,
          path: event.path,
          displayName: event.displayName,
          kind: event.kind,
          latestEvent: event,
          count: 1,
          events: [event],
        });
        continue;
      }

      existing.events.push(event);
      existing.count += 1;

      const currentTime = existing.latestEvent.timestamp?.getTime() ?? 0;
      const nextTime = event.timestamp?.getTime() ?? 0;
      if (nextTime >= currentTime) {
        existing.latestEvent = event;
        existing.displayName = event.displayName;
        existing.kind = event.kind;
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        actionSummary: summarizeFileActions(group.events),
      }))
      .sort((left, right) => {
        const leftTime = left.latestEvent.timestamp?.getTime() ?? 0;
        const rightTime = right.latestEvent.timestamp?.getTime() ?? 0;
        return rightTime - leftTime;
      });
  }, [filteredFileEvents]);

  const fileChangeReviewEntries = useMemo(
    () =>
      buildFileChangeReviewEntries({
        activeFileWrites: harnessState.activeFileWrites,
        recentFileEvents: harnessState.recentFileEvents,
        decisions: fileChangeDecisions,
      }),
    [
      fileChangeDecisions,
      harnessState.activeFileWrites,
      harnessState.recentFileEvents,
    ],
  );
  const fileChangeStatusCounts = useMemo(
    () => countFileChangeStatuses(fileChangeReviewEntries),
    [fileChangeReviewEntries],
  );
  const fileChangeReviewSummary = useMemo<HarnessFileChangeReviewSummary>(
    () => ({
      total: fileChangeReviewEntries.length,
      pending: fileChangeStatusCounts.pending,
      applied: fileChangeStatusCounts.applied,
      rejected: fileChangeStatusCounts.rejected,
    }),
    [
      fileChangeReviewEntries.length,
      fileChangeStatusCounts.applied,
      fileChangeStatusCounts.pending,
      fileChangeStatusCounts.rejected,
    ],
  );
  const resolvedLeadContent =
    typeof leadContent === "function"
      ? leadContent({ fileChangeReviewSummary })
      : leadContent;
  const selectableFileChangeKeys = useMemo(
    () => fileChangeReviewEntries.map((entry) => entry.key),
    [fileChangeReviewEntries],
  );
  const selectedFileChangeSet = useMemo(
    () => new Set(selectedFileChangeKeys),
    [selectedFileChangeKeys],
  );
  const selectedFileChangeEntries = useMemo(
    () =>
      fileChangeReviewEntries.filter((entry) =>
        selectedFileChangeSet.has(entry.key),
      ),
    [fileChangeReviewEntries, selectedFileChangeSet],
  );
  const selectedFileChangeCount = selectedFileChangeEntries.length;
  const allFileChangesSelected =
    selectableFileChangeKeys.length > 0 &&
    selectedFileChangeCount === selectableFileChangeKeys.length;

  useEffect(() => {
    const knownKeys = new Set(selectableFileChangeKeys);
    setSelectedFileChangeKeys((previous) =>
      previous.filter((key) => knownKeys.has(key)),
    );
    setFileChangeDecisions((previous) => {
      let changed = false;
      const next: Record<string, FileChangeDecisionStatus> = {};
      for (const key of Object.keys(previous)) {
        if (knownKeys.has(key)) {
          next[key] = previous[key];
        } else {
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [selectableFileChangeKeys]);

  const availableSections = useMemo(() => {
    const sections: HarnessSectionNavItem[] = [];

    if (hasSelectedTeamConfig) {
      sections.push({ key: "team_config", label: "任务分工" });
    }

    if (runtimeTaskPresentation) {
      sections.push({ key: "runtime", label: "任务进行时" });
    }
    if (hasAgentUiProjectionSection) {
      sections.push({ key: "agentui", label: "AgentUI 投影" });
    }
    if (hasHandoffSection) {
      sections.push({ key: "handoff", label: "交接制品" });
    }
    if (threadReliabilityView.shouldRender) {
      sections.push({ key: "reliability", label: "可靠性" });
    }
    if (fileChangeReviewEntries.length > 0) {
      sections.push({
        key: "file_review",
        label: String(t("agentChat.harness.fileReview.title" as never)),
      });
    }
    if (harnessState.activeFileWrites.length > 0) {
      sections.push({ key: "writes", label: "文件写入" });
    }
    if (harnessState.outputSignals.length > 0) {
      sections.push({ key: "outputs", label: "工具输出" });
    }
    if (hasToolInventorySection) {
      sections.push({ key: "inventory", label: "工具与权限" });
    }
    if (harnessState.pendingApprovals.length > 0) {
      sections.push({ key: "approvals", label: "待审批" });
    }
    if (harnessState.recentFileEvents.length > 0) {
      sections.push({ key: "files", label: "文件活动" });
    }
    if (
      harnessState.plan.phase !== "idle" ||
      harnessState.plan.items.length > 0
    ) {
      sections.push({ key: "plan", label: "规划状态" });
    }
    if (realTeamSummary.total > 0 || harnessState.delegatedTasks.length > 0) {
      sections.push({ key: "delegation", label: "子任务" });
    }
    if (harnessState.latestContextTrace.length > 0) {
      sections.push({ key: "context", label: "上下文轨迹" });
    }

    if (environment.skillsCount > 0) {
      sections.push({ key: "capabilities", label: "已激活技能" });
    }

    return sections;
  }, [
    environment.skillsCount,
    fileChangeReviewEntries.length,
    hasAgentUiProjectionSection,
    hasToolInventorySection,
    harnessState.delegatedTasks.length,
    harnessState.activeFileWrites.length,
    harnessState.latestContextTrace.length,
    harnessState.outputSignals.length,
    harnessState.pendingApprovals.length,
    harnessState.plan.items.length,
    harnessState.plan.phase,
    harnessState.recentFileEvents.length,
    hasHandoffSection,
    hasSelectedTeamConfig,
    realTeamSummary.total,
    runtimeTaskPresentation,
    t,
    threadReliabilityView.shouldRender,
  ]);

  const summaryCards = useMemo(() => {
    const cards: HarnessSummaryCard[] = [];

    if (runtimeTaskPresentation) {
      cards.push({
        sectionKey: "runtime",
        title: "当前任务",
        value: runtimeTaskPresentation.title,
        hint: `${runtimeTaskPresentation.statusLabel} · ${runtimeTaskPresentation.progressLabel}`,
        icon: Loader2,
      });
    }

    if (hasAgentUiProjectionSection) {
      const latestEvent = agentUiProjectionSummary.latestEvent;
      cards.push({
        sectionKey: "agentui",
        title: "AgentUI 投影",
        value: `${agentUiProjectionSummary.total} 条`,
        hint: latestEvent
          ? `${formatAgentUiProjectionEventType(latestEvent.type, translateProjection)} · ${formatAgentUiProjectionPhase(
              latestEvent.phase,
              translateProjection,
            )}`
          : "读取 conversationProjectionStore.agentUi",
        icon: Bot,
      });
    }

    if (hasHandoffSection) {
      cards.push({
        sectionKey: "handoff",
        title: "交接制品",
        value: handoffBundle
          ? `${handoffBundle.artifacts.length} 个文件`
          : "待导出",
        hint: handoffBundle
          ? `最近导出 ${formatIsoDateTime(handoffBundle.exported_at)}`
          : "导出当前会话的 plan / progress / handoff / review 四件套",
        icon: HardDriveDownload,
      });
    }

    if (threadReliabilityView.shouldRender) {
      cards.push({
        sectionKey: "reliability",
        title: "可靠性",
        value: threadReliabilityView.statusLabel,
        hint: threadReliabilityView.summary,
        icon: AlertCircle,
      });
    }

    if (hasSelectedTeamConfig) {
      cards.push({
        sectionKey: "team_config",
        title: "任务分工",
        value:
          selectedTeamLabel?.trim() ||
          `${selectedTeamRoles?.length || 0} 个角色`,
        hint:
          selectedTeamSummary?.trim() ||
          ((selectedTeamRoles?.length || 0) > 0
            ? `已配置 ${selectedTeamRoles?.length || 0} 个角色`
            : "本次已启用任务分工"),
        icon: Workflow,
      });
    }

    if (fileChangeReviewEntries.length > 0) {
      cards.push({
        sectionKey: "file_review",
        title: String(t("agentChat.harness.fileReview.title" as never)),
        value: String(
          t(
            "agentChat.harness.fileReview.summaryValue" as never,
            {
              pending: fileChangeStatusCounts.pending,
              total: fileChangeReviewEntries.length,
            } as never,
          ),
        ),
        hint:
          fileChangeReviewEntries[0]?.displayName ||
          String(t("agentChat.harness.fileReview.emptyHint" as never)),
        icon: SquareCheckBig,
      });
    }

    if (harnessState.activeFileWrites.length > 0) {
      cards.push({
        sectionKey: "writes",
        title: "文件写入",
        value: `${harnessState.activeFileWrites.length}`,
        hint:
          harnessState.activeFileWrites[0]?.displayName || "暂无正在处理的文件",
        icon: FileText,
      });
    }

    if (realTeamSummary.total > 0) {
      cards.push({
        sectionKey: "delegation",
        title: "子任务",
        value:
          realTeamSummary.active > 0
            ? `${realTeamSummary.active}/${realTeamSummary.total}`
            : `${realTeamSummary.total}`,
        hint:
          realTeamSummary.active > 0
            ? `处理中 ${realTeamSummary.running} · 等待中 ${realTeamSummary.queued} · 已完成 ${realTeamSummary.settled}`
            : `已完成 ${realTeamSummary.settled} · 需处理 ${realTeamSummary.failed}`,
        icon: Workflow,
      });
    }

    if (hasToolInventorySection) {
      cards.push({
        sectionKey: "inventory",
        title: "工具库存",
        value: toolInventoryLoading
          ? "读取中"
          : toolInventory
            ? `${runtimeToolVisibleTotal}`
            : "异常",
        hint: toolInventoryError
          ? toolInventoryError
          : toolInventory
            ? `runtime ${runtimeToolVisibleTotal}/${runtimeToolTotal} · registry ${toolInventory.counts.registry_visible_total}`
            : "等待拉取运行时库存",
        icon: Wrench,
      });
    }

    cards.push(
      {
        sectionKey: "approvals",
        title: "待审批",
        value: `${harnessState.pendingApprovals.length}`,
        hint:
          harnessState.pendingApprovals.length > 0
            ? "需要你确认的操作"
            : "当前无阻塞审批",
        icon: ShieldAlert,
      },
      {
        sectionKey: "files",
        title: "文件活动",
        value: `${harnessState.recentFileEvents.length}`,
        hint:
          harnessState.recentFileEvents[0]?.displayName || "暂无可展示文件活动",
        icon: FolderOpen,
      },
      {
        sectionKey: "plan",
        title: "计划状态",
        value:
          harnessState.plan.phase === "planning"
            ? "进行中"
            : harnessState.plan.phase === "ready"
              ? "已就绪"
              : "空闲",
        hint:
          harnessState.plan.items[0]?.content ||
          harnessState.plan.summaryText ||
          "未检测到显式计划快照",
        icon: ListChecks,
      },
      {
        sectionKey: "context",
        title: "上下文",
        value: `${environment.activeContextCount}/${environment.contextItemsCount}`,
        hint: environment.contextEnabled
          ? "上下文工作台已启用"
          : "普通聊天模式",
        icon: Sparkles,
      },
    );

    return cards;
  }, [
    environment.activeContextCount,
    environment.contextEnabled,
    environment.contextItemsCount,
    agentUiProjectionSummary,
    handoffBundle,
    hasAgentUiProjectionSection,
    hasHandoffSection,
    hasToolInventorySection,
    hasSelectedTeamConfig,
    fileChangeReviewEntries,
    fileChangeStatusCounts.pending,
    harnessState.activeFileWrites,
    harnessState.pendingApprovals.length,
    harnessState.plan.items,
    harnessState.plan.phase,
    harnessState.plan.summaryText,
    harnessState.recentFileEvents,
    realTeamSummary.active,
    realTeamSummary.failed,
    realTeamSummary.queued,
    realTeamSummary.running,
    realTeamSummary.settled,
    realTeamSummary.total,
    runtimeTaskPresentation,
    selectedTeamLabel,
    selectedTeamRoles?.length,
    selectedTeamSummary,
    toolInventory,
    toolInventoryError,
    toolInventoryLoading,
    runtimeToolTotal,
    runtimeToolVisibleTotal,
    threadReliabilityView.shouldRender,
    threadReliabilityView.statusLabel,
    threadReliabilityView.summary,
    translateProjection,
    t,
  ]);

  const openPreview = useCallback(
    async ({
      title,
      description,
      path,
      content,
      preview,
    }: {
      title: string;
      description?: string;
      path?: string;
      content?: string;
      preview?: string;
    }) => {
      const requestId = previewRequestIdRef.current + 1;
      previewRequestIdRef.current = requestId;

      const shouldLoad =
        !content?.trim() && !!path && typeof onLoadFilePreview === "function";

      setPreviewDialog({
        open: true,
        title,
        description,
        path,
        displayName: path ? getFileName(path) : title,
        content: content?.trim() || preview?.trim(),
        preview,
        artifact: undefined,
        error:
          content?.trim() || preview?.trim()
            ? undefined
            : shouldLoad
              ? undefined
              : "暂无可预览内容",
        isBinary: false,
        loading: shouldLoad,
      });

      if (!shouldLoad || !path) {
        return;
      }

      try {
        const result = await onLoadFilePreview(path);
        if (previewRequestIdRef.current !== requestId) {
          return;
        }

        const nextPath = result.path || path;
        const normalizedContent = result.content ?? undefined;

        setPreviewDialog((current) => ({
          ...current,
          path: nextPath,
          displayName: getFileName(nextPath),
          content: normalizedContent?.trim()
            ? normalizedContent
            : current.content,
          isBinary: result.isBinary === true,
          size: result.size,
          error:
            result.isBinary === true
              ? undefined
              : result.error || (normalizedContent ? undefined : current.error),
          loading: false,
        }));
      } catch (error) {
        if (previewRequestIdRef.current !== requestId) {
          return;
        }

        setPreviewDialog((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    },
    [onLoadFilePreview],
  );

  const handleOpenFile = useCallback(() => {
    if (!onOpenFile || !previewDialog.content?.trim()) {
      return;
    }

    onOpenFile(
      previewDialog.path || previewDialog.displayName,
      previewDialog.content,
    );
  }, [
    onOpenFile,
    previewDialog.content,
    previewDialog.displayName,
    previewDialog.path,
  ]);

  const handleCopyPath = useCallback(async () => {
    const path = previewDialog.path?.trim();
    if (!path) {
      toast.error("当前没有可复制的文件路径");
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("当前环境不支持剪贴板复制");
      return;
    }

    try {
      await navigator.clipboard.writeText(path);
      toast.success("文件路径已复制");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制路径失败");
    }
  }, [previewDialog.path]);

  const handleCopyContent = useCallback(async () => {
    const content = previewDialog.content?.trim();
    if (!content) {
      toast.error("当前没有可复制的内容");
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("当前环境不支持剪贴板复制");
      return;
    }

    try {
      await navigator.clipboard.writeText(previewDialog.content || "");
      toast.success("内容已复制");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制内容失败");
    }
  }, [previewDialog.content]);

  const openBrowserReplayPreview = useCallback(
    (
      pack: AgentRuntimeEvidencePack,
      index: AgentRuntimeEvidenceBrowserActionIndex,
    ) => {
      setPreviewDialog({
        open: true,
        title: "Browser Assist 复盘",
        description:
          "来自 evidence browserActionIndex 的 browser_session / browser_snapshot 复盘。",
        displayName: "browser_replay_viewer",
        artifact: buildBrowserReplayArtifact(pack, index),
        isBinary: false,
        loading: false,
      });
    },
    [],
  );

  const handleOpenPathValue = useCallback(
    async (path: string) => {
      const normalizedPath = path.trim();
      if (!normalizedPath) {
        toast.error("当前没有可打开的文件路径");
        return;
      }

      try {
        await (onOpenPath ?? openPathWithDefaultApp)(normalizedPath);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "打开文件失败");
      }
    },
    [onOpenPath],
  );

  const handleOpenExternalLink = useCallback(async (url: string) => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      toast.error("当前没有可打开的链接");
      return;
    }

    try {
      await openExternalUrl(normalizedUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打开链接失败");
    }
  }, []);

  const handleRevealPath = useCallback(async () => {
    const path = previewDialog.path?.trim();
    if (!path) {
      toast.error("当前没有可定位的文件路径");
      return;
    }

    try {
      await (onRevealPath ?? revealPathInFinder)(path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "定位文件失败");
    }
  }, [onRevealPath, previewDialog.path]);

  const handleOpenPath = useCallback(async () => {
    const path = previewDialog.path?.trim();
    if (!path) {
      toast.error("当前没有可打开的文件路径");
      return;
    }

    await handleOpenPathValue(path);
  }, [handleOpenPathValue, previewDialog.path]);

  return (
    <>
      <div
        data-testid="harness-status-panel"
        data-layout={layout}
        className={cn(
          "lime-workbench-theme-scope lime-workbench-surface-scope text-[color:var(--lime-text)]",
          layout === "sidebar"
            ? "rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)]"
            : layout === "dialog"
              ? "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)]"
              : "mx-3 mt-2 rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)]",
        )}
      >
        <div
          data-harness-drag-handle={isDialogLayout ? "true" : undefined}
          className={cn(
            "flex items-center justify-between gap-3 border-b border-border px-4 py-3",
            isDialogLayout &&
              "shrink-0 cursor-grab select-none px-5 py-4 active:cursor-grabbing",
          )}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              {realTeamSummary.active > 0 ? (
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {agentText(
                    "agentChat.harness.generated.8e5dbad1d1",
                    "任务进行中",
                  )}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          {!isDialogLayout ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={isDetailsExpanded}
              aria-label={
                isDetailsExpanded ? `折叠${toggleLabel}` : `展开${toggleLabel}`
              }
            >
              {isDetailsExpanded ? (
                <ChevronDown className="mr-1 h-4 w-4" />
              ) : (
                <ChevronRight className="mr-1 h-4 w-4" />
              )}
              {isDetailsExpanded ? `收起${toggleLabel}` : `展开${toggleLabel}`}
            </Button>
          ) : null}
        </div>

        {!isDialogLayout && resolvedLeadContent ? (
          <div
            className={cn(
              "border-b border-border px-4 py-4",
              isDialogLayout && "shrink-0 px-5 py-4",
            )}
          >
            {resolvedLeadContent}
          </div>
        ) : null}

        {!isDialogLayout ? (
          <div
            className={cn(
              "grid gap-2 px-4 py-4",
              layout === "sidebar"
                ? "grid-cols-1"
                : "md:grid-cols-2 xl:grid-cols-4",
            )}
          >
            {summaryCards.map((card) => (
              <SummaryCard
                key={card.title}
                title={card.title}
                value={card.value}
                hint={card.hint}
                icon={card.icon}
                onClick={() => scrollToSection(card.sectionKey)}
                compact={false}
              />
            ))}
          </div>
        ) : null}

        {isDetailsExpanded ? (
          <ScrollArea
            className={cn(
              "border-t border-border px-4 py-4",
              layout === "sidebar"
                ? "max-h-[24rem]"
                : layout === "dialog"
                  ? "flex-1 min-h-0 overscroll-contain px-5"
                  : "max-h-[28rem]",
            )}
          >
            <div className="space-y-4 pb-1">
              {isDialogLayout && resolvedLeadContent ? (
                <div className="pt-4">{resolvedLeadContent}</div>
              ) : null}

              {isDialogLayout ? (
                <div className="grid gap-2 pt-1 sm:grid-cols-2 xl:grid-cols-5">
                  {summaryCards.map((card) => (
                    <SummaryCard
                      key={card.title}
                      title={card.title}
                      value={card.value}
                      hint={card.hint}
                      icon={card.icon}
                      onClick={() => scrollToSection(card.sectionKey)}
                      compact={true}
                    />
                  ))}
                </div>
              ) : null}

              {availableSections.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {availableSections.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                      onClick={() => scrollToSection(item.key)}
                      aria-label={`跳转到${item.label}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {hasSelectedTeamConfig ? (
                <Section
                  sectionKey="team_config"
                  title={agentText(
                    "agentChat.harness.generated.618a4c825b",
                    "当前任务分工",
                  )}
                  badge={
                    selectedTeamRoles && selectedTeamRoles.length > 0
                      ? `${selectedTeamRoles.length} 个角色`
                      : undefined
                  }
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3">
                    <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Workflow className="h-4 w-4 text-sky-600" />
                        <span>{selectedTeamLabel || "当前已启用分工方案"}</span>
                      </div>
                      {selectedTeamSummary ? (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {selectedTeamSummary}
                        </div>
                      ) : (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {agentText(
                            "agentChat.harness.generated.1c66e4e8ac",
                            "本次会优先参考所选分工方案，按需拆出子任务继续处理。",
                          )}
                        </div>
                      )}
                    </div>

                    {selectedTeamRoles && selectedTeamRoles.length > 0 ? (
                      <div className="grid gap-2 lg:grid-cols-2">
                        {selectedTeamRoles.map((role, index) => (
                          <div
                            key={`${role.id || role.label}-${index}`}
                            className="rounded-xl border border-border bg-background p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-medium text-foreground">
                                {role.label}
                              </div>
                              {role.profileId ? (
                                <Badge variant="outline">
                                  {agentText(
                                    "agentChat.harness.generated.06d0f38dd2",
                                    "模板",
                                  )}{" "}
                                  {role.profileId}
                                </Badge>
                              ) : null}
                              {role.roleKey ? (
                                <Badge variant="outline">
                                  {agentText(
                                    "agentChat.harness.generated.db181821a1",
                                    "职责",
                                  )}{" "}
                                  {role.roleKey}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-2 text-xs leading-5 text-muted-foreground">
                              {role.summary}
                            </div>
                            {role.skillIds && role.skillIds.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {role.skillIds.map((skillId) => (
                                  <Badge
                                    key={`${role.id || role.label}-${skillId}`}
                                    variant="secondary"
                                  >
                                    {skillId}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Section>
              ) : null}
              {runtimeTaskPresentation ? (
                <Section
                  sectionKey="runtime"
                  title={agentText(
                    "agentChat.harness.generated.f7fc8b8014",
                    "任务进行时",
                  )}
                  badge={
                    runtimeTaskPresentation.checkpoints.length > 0
                      ? `${runtimeTaskPresentation.checkpoints.length} 个节点`
                      : runtimeTaskPresentation.phaseLabel
                  }
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border bg-background p-4 shadow-sm shadow-slate-950/5">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                            runtimeTaskPresentation.stepStatus === "error" &&
                              "bg-destructive/10 text-destructive",
                            runtimeTaskPresentation.stepStatus === "skipped" &&
                              "bg-muted text-muted-foreground",
                            runtimeTaskPresentation.stepStatus === "active" &&
                              "bg-primary/10 text-primary",
                          )}
                        >
                          {runtimeTaskPresentation.stepStatus === "error" ? (
                            <AlertCircle className="h-4 w-4" />
                          ) : runtimeTaskPresentation.stepStatus ===
                            "skipped" ? (
                            <Clock3 className="h-4 w-4" />
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-muted-foreground">
                            {agentText(
                              "agentChat.harness.generated.e94d425276",
                              "当前任务",
                            )}
                          </div>
                          <div className="mt-1 text-sm font-semibold leading-6 text-foreground">
                            {runtimeTaskPresentation.title}
                          </div>
                          <InteractiveText
                            text={runtimeTaskPresentation.summaryText}
                            className="mt-2 text-sm leading-6 text-muted-foreground"
                            onOpenUrl={handleOpenExternalLink}
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge
                              variant={
                                runtimeTaskPresentation.stepStatus === "error"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {runtimeTaskPresentation.statusLabel}
                            </Badge>
                            <Badge variant="outline">
                              {runtimeTaskPresentation.phaseLabel}
                            </Badge>
                            <Badge variant="outline">
                              {runtimeTaskPresentation.progressLabel}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    {runtimeTaskPresentation.checkpoints.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold text-muted-foreground">
                            {agentText(
                              "agentChat.harness.generated.67c022795d",
                              "任务节点",
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {runtimeTaskPresentation.progressLabel}
                          </div>
                        </div>
                        <div className="space-y-2">
                          {runtimeTaskPresentation.checkpoints.map(
                            (checkpoint, index) => {
                              const isCurrentCheckpoint =
                                index ===
                                runtimeTaskPresentation.checkpoints.length - 1;
                              return (
                                <div
                                  key={`${checkpoint}-${index}`}
                                  className={cn(
                                    "flex items-start gap-3 rounded-xl border px-3 py-2.5",
                                    isCurrentCheckpoint &&
                                      runtimeTaskPresentation.stepStatus ===
                                        "error" &&
                                      "border-destructive/30 bg-destructive/5",
                                    isCurrentCheckpoint &&
                                      runtimeTaskPresentation.stepStatus ===
                                        "active" &&
                                      "border-primary/20 bg-primary/5",
                                    isCurrentCheckpoint &&
                                      runtimeTaskPresentation.stepStatus ===
                                        "skipped" &&
                                      "border-border bg-muted/30",
                                    !isCurrentCheckpoint &&
                                      "border-border bg-muted/20",
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                                      isCurrentCheckpoint &&
                                        runtimeTaskPresentation.stepStatus ===
                                          "error" &&
                                        "bg-destructive/10 text-destructive",
                                      isCurrentCheckpoint &&
                                        runtimeTaskPresentation.stepStatus ===
                                          "active" &&
                                        "bg-primary/10 text-primary",
                                      isCurrentCheckpoint &&
                                        runtimeTaskPresentation.stepStatus ===
                                          "skipped" &&
                                        "bg-background text-muted-foreground",
                                      !isCurrentCheckpoint &&
                                        "bg-background text-muted-foreground",
                                    )}
                                  >
                                    {isCurrentCheckpoint ? (
                                      runtimeTaskPresentation.stepStatus ===
                                      "error" ? (
                                        <AlertCircle className="h-3.5 w-3.5" />
                                      ) : runtimeTaskPresentation.stepStatus ===
                                        "skipped" ? (
                                        <Clock3 className="h-3.5 w-3.5" />
                                      ) : (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      )
                                    ) : (
                                      index + 1
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <InteractiveText
                                      text={checkpoint}
                                      className="text-sm leading-6 text-foreground"
                                      onOpenUrl={handleOpenExternalLink}
                                    />
                                  </div>
                                  <Badge
                                    variant={
                                      isCurrentCheckpoint
                                        ? "secondary"
                                        : "outline"
                                    }
                                  >
                                    {isCurrentCheckpoint ? "当前" : "已记录"}
                                  </Badge>
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                        {runtimeTaskPresentation.progressLabel}
                      </div>
                    )}
                  </div>
                </Section>
              ) : null}

              {hasHandoffSection ? (
                <Section
                  sectionKey="handoff"
                  title={agentText(
                    "agentChat.harness.generated.8d0323ba12",
                    "交接制品",
                  )}
                  badge={
                    handoffBundle
                      ? `已导出 ${handoffBundle.artifacts.length} 个文件`
                      : "待导出"
                  }
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3">
                    <div className="rounded-xl border border-sky-200/80 bg-sky-50/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <HardDriveDownload className="h-4 w-4 text-sky-600" />
                            <span>
                              {agentText(
                                "agentChat.harness.generated.eaca4f7907",
                                "会话交接四件套",
                              )}
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            {agentText(
                              "agentChat.harness.generated.6e95623055",
                              "把当前 session 的 plan / progress / handoff / review 摘要落到工作区 `.lime/harness/sessions` 下，便于下一次恢复和审查。",
                            )}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {agentText(
                              "agentChat.harness.generated.ce46eb8c00",
                              "当前会话：",
                            )}
                            {currentSessionId}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={handoffBundle ? "outline" : "default"}
                            className="gap-2"
                            aria-label={agentText(
                              "agentChat.harness.generated.aa38b7342e",
                              "导出交接制品",
                            )}
                            disabled={handoffExporting}
                            onClick={() => void handleExportHandoffBundle()}
                          >
                            {handoffExporting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <HardDriveDownload className="h-4 w-4" />
                            )}
                            {handoffBundle ? "刷新导出" : "导出交接制品"}
                          </Button>
                          {handoffBundle ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              aria-label={agentText(
                                "agentChat.harness.generated.f3571bab00",
                                "打开交接目录",
                              )}
                              onClick={() =>
                                void handleOpenPathValue(
                                  handoffBundle.bundle_absolute_root,
                                )
                              }
                            >
                              <FolderOpen className="h-4 w-4" />
                              {agentText(
                                "agentChat.harness.generated.031c105578",
                                "打开目录",
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {handoffExportError ? (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                        {handoffExportError}
                      </div>
                    ) : null}

                    {handoffBundle ? (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <InventoryStatCard
                            title={agentText(
                              "agentChat.harness.generated.2a36de35aa",
                              "线程状态",
                            )}
                            value={formatHandoffStatusLabel(
                              handoffBundle.thread_status,
                            )}
                            hint={`最近导出 ${formatIsoDateTime(handoffBundle.exported_at)}`}
                          />
                          <InventoryStatCard
                            title={agentText(
                              "agentChat.harness.generated.90cc62f7c2",
                              "最新 Turn",
                            )}
                            value={formatHandoffStatusLabel(
                              handoffBundle.latest_turn_status,
                            )}
                            hint={`待处理请求 ${handoffBundle.pending_request_count} · 排队 ${handoffBundle.queued_turn_count}`}
                          />
                          <InventoryStatCard
                            title={agentText(
                              "agentChat.harness.generated.fdebf66721",
                              "Todo",
                            )}
                            value={`${handoffBundle.todo_completed}/${handoffBundle.todo_total}`}
                            hint={`待开始 ${handoffBundle.todo_pending} · 进行中 ${handoffBundle.todo_in_progress}`}
                          />
                          <InventoryStatCard
                            title={agentText(
                              "agentChat.harness.generated.2a8ce33ff0",
                              "子任务",
                            )}
                            value={`${handoffBundle.active_subagent_count}`}
                            hint={`workspace ${handoffBundle.workspace_id || "未绑定"}`}
                          />
                        </div>

                        <div className="rounded-xl border border-border bg-background p-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {agentText(
                                "agentChat.harness.generated.f2d022980f",
                                "导出目录",
                              )}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            <div>
                              {agentText(
                                "agentChat.harness.generated.2ee19fe8b0",
                                "相对路径：",
                              )}
                              <span className="ml-1 break-all font-mono text-foreground">
                                {handoffBundle.bundle_relative_root}
                              </span>
                            </div>
                            <div>
                              {agentText(
                                "agentChat.harness.generated.f9c616413f",
                                "绝对路径：",
                              )}
                              <PathTextLink
                                path={handoffBundle.bundle_absolute_root}
                                className="ml-1"
                                onOpenPath={handleOpenPathValue}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {handoffBundle.artifacts.map((artifact) => {
                            const sizeLabel = formatSize(artifact.bytes);
                            return (
                              <div
                                key={artifact.absolute_path}
                                className="rounded-xl border border-border bg-background p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <FileText className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-sm font-medium text-foreground">
                                        {artifact.title}
                                      </span>
                                      <Badge variant="outline">
                                        {formatHandoffArtifactKindLabel(
                                          artifact.kind,
                                        )}
                                      </Badge>
                                      {sizeLabel ? (
                                        <Badge variant="secondary">
                                          {sizeLabel}
                                        </Badge>
                                      ) : null}
                                    </div>
                                    <div className="mt-2 text-xs text-muted-foreground">
                                      <div>
                                        {agentText(
                                          "agentChat.harness.generated.2ee19fe8b0",
                                          "相对路径：",
                                        )}
                                        <span className="ml-1 break-all font-mono text-foreground">
                                          {artifact.relative_path}
                                        </span>
                                      </div>
                                      <div className="mt-1">
                                        {agentText(
                                          "agentChat.harness.generated.f9c616413f",
                                          "绝对路径：",
                                        )}
                                        <PathTextLink
                                          path={artifact.absolute_path}
                                          className="ml-1"
                                          onOpenPath={handleOpenPathValue}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="gap-2"
                                      aria-label={`预览交接制品：${artifact.title}`}
                                      onClick={() =>
                                        void openPreview({
                                          title: artifact.title,
                                          description: `交接制品 · ${formatHandoffArtifactKindLabel(
                                            artifact.kind,
                                          )}`,
                                          path: artifact.absolute_path,
                                        })
                                      }
                                    >
                                      <Eye className="h-4 w-4" />
                                      {agentText(
                                        "agentChat.harness.generated.de61aa8e1c",
                                        "预览",
                                      )}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="gap-2"
                                      aria-label={`系统打开交接制品：${artifact.absolute_path}`}
                                      onClick={() =>
                                        void handleOpenPathValue(
                                          artifact.absolute_path,
                                        )
                                      }
                                    >
                                      <FolderOpen className="h-4 w-4" />
                                      {agentText(
                                        "agentChat.harness.generated.65fc81e161",
                                        "打开",
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                        {agentText(
                          "agentChat.harness.generated.8b54ad21d4",
                          "尚未导出交接制品。建议在需要跨会话接手、准备审查或切换执行人前先导出一次。",
                        )}
                      </div>
                    )}

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <ShieldAlert className="h-4 w-4 text-amber-600" />
                            <span>
                              {agentText(
                                "agentChat.harness.generated.153b1d0f0a",
                                "问题证据包",
                              )}
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            {agentText(
                              "agentChat.harness.generated.1a81e7e23f",
                              "把当前 runtime、timeline、最近产物和已知缺口导出为最小证据包，为后续 replay、eval 和故障复盘提供输入。",
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={evidencePack ? "outline" : "default"}
                            className="gap-2"
                            aria-label={agentText(
                              "agentChat.harness.generated.f1e4d07649",
                              "导出问题证据包",
                            )}
                            disabled={evidenceExporting}
                            onClick={() => void handleExportEvidencePack()}
                          >
                            {evidenceExporting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldAlert className="h-4 w-4" />
                            )}
                            {evidencePack ? "刷新证据包" : "导出问题证据包"}
                          </Button>
                          {evidencePack ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              aria-label={agentText(
                                "agentChat.harness.generated.d6913f073d",
                                "打开问题证据目录",
                              )}
                              onClick={() =>
                                void handleOpenPathValue(
                                  evidencePack.pack_absolute_root,
                                )
                              }
                            >
                              <FolderOpen className="h-4 w-4" />
                              {agentText(
                                "agentChat.harness.generated.031c105578",
                                "打开目录",
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {evidenceExportError ? (
                        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                          {evidenceExportError}
                        </div>
                      ) : null}

                      {evidencePack ? (
                        <div className="mt-3 space-y-3">
                          {(() => {
                            const verificationSummary =
                              evidencePack.observability_summary
                                ?.verification_summary;
                            const failureFocus =
                              verificationSummary?.focus_verification_failure_outcomes ??
                              [];
                            const exportedSignals =
                              evidencePack.observability_summary?.signal_coverage.filter(
                                (entry) => entry.status === "exported",
                              ).length ?? 0;

                            return (
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                <InventoryStatCard
                                  title={agentText(
                                    "agentChat.harness.generated.2a36de35aa",
                                    "线程状态",
                                  )}
                                  value={formatHandoffStatusLabel(
                                    evidencePack.thread_status,
                                  )}
                                  hint={`最近导出 ${formatIsoDateTime(evidencePack.exported_at)}`}
                                />
                                <InventoryStatCard
                                  title={agentText(
                                    "agentChat.harness.generated.4f8ef92599",
                                    "时间线",
                                  )}
                                  value={`${evidencePack.turn_count} / ${evidencePack.item_count}`}
                                  hint="turns / items"
                                />
                                <InventoryStatCard
                                  title={agentText(
                                    "agentChat.harness.generated.df85462148",
                                    "阻塞线索",
                                  )}
                                  value={`${evidencePack.pending_request_count} / ${evidencePack.queued_turn_count}`}
                                  hint="pending request / queued turn"
                                />
                                <InventoryStatCard
                                  title={agentText(
                                    "agentChat.harness.generated.0c7b23bb31",
                                    "已知缺口",
                                  )}
                                  value={`${evidencePack.known_gaps.length}`}
                                  hint={
                                    verificationSummary
                                      ? `验证焦点 ${failureFocus.length} · 已导出信号 ${exportedSignals}`
                                      : `最近产物 ${evidencePack.recent_artifact_count} 个`
                                  }
                                />
                              </div>
                            );
                          })()}

                          {evidencePack.completion_audit_summary ? (
                            <div className="rounded-xl border border-border bg-background p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                    <ShieldAlert className="h-4 w-4 text-emerald-600" />
                                    <span>
                                      {agentText(
                                        "agentChat.harness.generated.1c3af0bdc1",
                                        "Completion Audit",
                                      )}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                                    {agentText(
                                      "agentChat.harness.generated.3bd3ec2245",
                                      "基于 automation owner、Workspace Skill ToolCall 与 artifact / timeline evidence 的完成判定，不读取模型自报。",
                                    )}
                                  </div>
                                </div>
                                <Badge variant="outline">
                                  {formatCompletionAuditDecisionLabel(
                                    evidencePack.completion_audit_summary
                                      .decision,
                                  )}
                                </Badge>
                              </div>
                              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                                <div>
                                  {agentText(
                                    "agentChat.harness.generated.feb6327847",
                                    "Owner success：",
                                  )}
                                  <span className="ml-1 font-mono text-foreground">
                                    {
                                      evidencePack.completion_audit_summary
                                        .successful_owner_run_count
                                    }
                                    /
                                    {
                                      evidencePack.completion_audit_summary
                                        .owner_run_count
                                    }
                                  </span>
                                </div>
                                <div>
                                  {agentText(
                                    "agentChat.harness.generated.085f91c13e",
                                    "Skill ToolCall：",
                                  )}
                                  <span className="ml-1 font-mono text-foreground">
                                    {
                                      evidencePack.completion_audit_summary
                                        .workspace_skill_tool_call_count
                                    }
                                  </span>
                                </div>
                                <div>
                                  {agentText(
                                    "agentChat.harness.generated.6245faf559",
                                    "Artifact evidence：",
                                  )}
                                  <span className="ml-1 font-mono text-foreground">
                                    {
                                      evidencePack.completion_audit_summary
                                        .artifact_count
                                    }
                                  </span>
                                </div>
                                <div>
                                  {agentText(
                                    "agentChat.harness.generated.aa4af1af73",
                                    "Blocking：",
                                  )}
                                  <span className="ml-1 text-foreground">
                                    {evidencePack.completion_audit_summary
                                      .blocking_reasons.length > 0
                                      ? evidencePack.completion_audit_summary.blocking_reasons.join(
                                          "、",
                                        )
                                      : "无"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          <div className="rounded-xl border border-border bg-background p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                              <FolderOpen className="h-4 w-4 text-muted-foreground" />
                              <span>
                                {agentText(
                                  "agentChat.harness.generated.101e014f74",
                                  "证据目录",
                                )}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.2ee19fe8b0",
                                  "相对路径：",
                                )}
                                <span className="ml-1 break-all font-mono text-foreground">
                                  {evidencePack.pack_relative_root}
                                </span>
                              </div>
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.f9c616413f",
                                  "绝对路径：",
                                )}
                                <PathTextLink
                                  path={evidencePack.pack_absolute_root}
                                  className="ml-1"
                                  onOpenPath={handleOpenPathValue}
                                />
                              </div>
                            </div>
                          </div>

                          {evidencePack.observability_summary
                            ?.modality_runtime_contracts?.snapshot_index
                            ?.browser_action_index
                            ? (() => {
                                const browserActionIndex =
                                  evidencePack.observability_summary
                                    .modality_runtime_contracts.snapshot_index
                                    .browser_action_index;
                                return (
                                  <BrowserActionIndexSummarySection
                                    index={browserActionIndex}
                                    onOpenReplay={() =>
                                      openBrowserReplayPreview(
                                        evidencePack,
                                        browserActionIndex,
                                      )
                                    }
                                  />
                                );
                              })()
                            : null}

                          {evidencePack.observability_summary
                            ?.modality_runtime_contracts?.snapshot_index
                            ?.task_index ? (
                            <HarnessTaskIndexSection
                              index={
                                evidencePack.observability_summary
                                  .modality_runtime_contracts.snapshot_index
                                  .task_index
                              }
                            />
                          ) : null}

                          {evidencePack.observability_summary
                            ?.modality_runtime_contracts?.snapshot_index
                            ?.limecore_policy_index ? (
                            <LimeCorePolicyIndexSummarySection
                              index={
                                evidencePack.observability_summary
                                  .modality_runtime_contracts.snapshot_index
                                  .limecore_policy_index
                              }
                            />
                          ) : null}

                          {evidencePack.observability_summary
                            ?.verification_summary ? (
                            <HarnessVerificationSummarySection
                              summary={
                                evidencePack.observability_summary
                                  .verification_summary
                              }
                            />
                          ) : null}

                          {evidencePack.known_gaps.length > 0 ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                              <div className="text-sm font-medium text-amber-900">
                                {agentText(
                                  "agentChat.harness.generated.1d2aef0cb3",
                                  "当前已知缺口",
                                )}
                              </div>
                              <div className="mt-2 space-y-1 text-xs text-amber-800">
                                {evidencePack.known_gaps.map((gap, index) => (
                                  <div key={`${gap}-${index}`}>{gap}</div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="space-y-3">
                            {evidencePack.artifacts.map((artifact) => {
                              const sizeLabel = formatSize(artifact.bytes);
                              return (
                                <div
                                  key={artifact.absolute_path}
                                  className="rounded-xl border border-border bg-background p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium text-foreground">
                                          {artifact.title}
                                        </span>
                                        <Badge variant="outline">
                                          {formatEvidenceArtifactKindLabel(
                                            artifact.kind,
                                          )}
                                        </Badge>
                                        {sizeLabel ? (
                                          <Badge variant="secondary">
                                            {sizeLabel}
                                          </Badge>
                                        ) : null}
                                      </div>
                                      <div className="mt-2 text-xs text-muted-foreground">
                                        <div>
                                          {agentText(
                                            "agentChat.harness.generated.2ee19fe8b0",
                                            "相对路径：",
                                          )}
                                          <span className="ml-1 break-all font-mono text-foreground">
                                            {artifact.relative_path}
                                          </span>
                                        </div>
                                        <div className="mt-1">
                                          {agentText(
                                            "agentChat.harness.generated.f9c616413f",
                                            "绝对路径：",
                                          )}
                                          <PathTextLink
                                            path={artifact.absolute_path}
                                            className="ml-1"
                                            onOpenPath={handleOpenPathValue}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="gap-2"
                                        aria-label={`预览问题证据：${artifact.title}`}
                                        onClick={() =>
                                          void openPreview({
                                            title: artifact.title,
                                            description: `问题证据 · ${formatEvidenceArtifactKindLabel(
                                              artifact.kind,
                                            )}`,
                                            path: artifact.absolute_path,
                                          })
                                        }
                                      >
                                        <Eye className="h-4 w-4" />
                                        {agentText(
                                          "agentChat.harness.generated.de61aa8e1c",
                                          "预览",
                                        )}
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="gap-2"
                                        aria-label={`系统打开问题证据：${artifact.absolute_path}`}
                                        onClick={() =>
                                          void handleOpenPathValue(
                                            artifact.absolute_path,
                                          )
                                        }
                                      >
                                        <FolderOpen className="h-4 w-4" />
                                        {agentText(
                                          "agentChat.harness.generated.65fc81e161",
                                          "打开",
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                          {agentText(
                            "agentChat.harness.generated.913ad2f0a2",
                            "尚未导出问题证据包。建议在出现阻塞、需要复盘失败链路，或准备把真实案例沉淀成 replay / eval 样本前导出一次。",
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <FileCode2 className="h-4 w-4 text-emerald-600" />
                            <span>
                              {agentText(
                                "agentChat.harness.generated.55d5260546",
                                "Replay 样本",
                              )}
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            {agentText(
                              "agentChat.harness.generated.4222677beb",
                              "基于当前 session 复用 handoff bundle 与 evidence pack，导出 `input / expected / grader / evidence-links` 四件套，把真实失败转成可回放、可评分、可回归的最小样本。",
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={replayCase ? "outline" : "default"}
                            className="gap-2"
                            aria-label={agentText(
                              "agentChat.harness.generated.0a671912df",
                              "导出 Replay 样本",
                            )}
                            disabled={replayExporting}
                            onClick={() => void handleExportReplayCase()}
                          >
                            {replayExporting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileCode2 className="h-4 w-4" />
                            )}
                            {replayCase
                              ? "刷新 Replay 样本"
                              : "导出 Replay 样本"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            aria-label={agentText(
                              "agentChat.harness.generated.0532c40ed4",
                              "复制回归沉淀与验证命令",
                            )}
                            disabled={replayExporting}
                            onClick={() =>
                              void handleCopyReplayPromotionCommand()
                            }
                          >
                            {replayExporting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            {agentText(
                              "agentChat.harness.generated.d79b117468",
                              "复制回归命令",
                            )}
                          </Button>
                          {replayCase ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              aria-label={agentText(
                                "agentChat.harness.generated.30fbb13bf7",
                                "打开 Replay 样本目录",
                              )}
                              onClick={() =>
                                void handleOpenPathValue(
                                  replayCase.replay_absolute_root,
                                )
                              }
                            >
                              <FolderOpen className="h-4 w-4" />
                              {agentText(
                                "agentChat.harness.generated.031c105578",
                                "打开目录",
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {replayExportError ? (
                        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                          {replayExportError}
                        </div>
                      ) : null}

                      {replayCase ? (
                        <div className="mt-3 space-y-3">
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.2a36de35aa",
                                "线程状态",
                              )}
                              value={formatHandoffStatusLabel(
                                replayCase.thread_status,
                              )}
                              hint={`最近导出 ${formatIsoDateTime(replayCase.exported_at)}`}
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.df85462148",
                                "阻塞线索",
                              )}
                              value={`${replayCase.pending_request_count} / ${replayCase.queued_turn_count}`}
                              hint="pending request / queued turn"
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.6d61c09b06",
                                "关联证据",
                              )}
                              value={`${replayCase.linked_handoff_artifact_count} / ${replayCase.linked_evidence_artifact_count}`}
                              hint="handoff / evidence"
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.818507effc",
                                "最近产物",
                              )}
                              value={`${replayCase.recent_artifact_count}`}
                              hint={`workspace ${replayCase.workspace_id || "未绑定"}`}
                            />
                          </div>

                          <div className="rounded-xl border border-border bg-background p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                              <FolderOpen className="h-4 w-4 text-muted-foreground" />
                              <span>
                                {agentText(
                                  "agentChat.harness.generated.3c1180e2c6",
                                  "Replay 目录",
                                )}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.2ee19fe8b0",
                                  "相对路径：",
                                )}
                                <span className="ml-1 break-all font-mono text-foreground">
                                  {replayCase.replay_relative_root}
                                </span>
                              </div>
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.f9c616413f",
                                  "绝对路径：",
                                )}
                                <PathTextLink
                                  path={replayCase.replay_absolute_root}
                                  className="ml-1"
                                  onOpenPath={handleOpenPathValue}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                            <div className="text-sm font-medium text-emerald-900">
                              {agentText(
                                "agentChat.harness.generated.16429e5f71",
                                "关联证据主链",
                              )}
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-emerald-800">
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.0788808854",
                                  "handoff：",
                                )}
                                <span className="ml-1 break-all font-mono text-emerald-950">
                                  {replayCase.handoff_bundle_relative_root}
                                </span>
                              </div>
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.d50a6b5d6c",
                                  "evidence：",
                                )}
                                <span className="ml-1 break-all font-mono text-emerald-950">
                                  {replayCase.evidence_pack_relative_root}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-sky-950">
                              <Workflow className="h-4 w-4 text-sky-700" />
                              <span>
                                {agentText(
                                  "agentChat.harness.generated.349f37479e",
                                  "回归资产沉淀",
                                )}
                              </span>
                            </div>
                            <div className="mt-2 text-xs leading-5 text-sky-900">
                              {agentText(
                                "agentChat.harness.generated.75c0a945e1",
                                "这一步直接复用仓库已有的 `harness:eval:promote` 与 `harness:eval` 主命令，把当前 replay case 提升为仓库 current 样本，并立即跑一次统一摘要验证； 点击“复制回归命令”后不需要你再手写参数。",
                              )}
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              <InventoryStatCard
                                title={agentText(
                                  "agentChat.harness.generated.b14686a384",
                                  "目标 Suite",
                                )}
                                value={
                                  buildReplayPromotionContext({
                                    replayCase,
                                    analysisTitle: analysisHandoff?.title,
                                    reviewTitle: reviewDecisionTemplate?.title,
                                  }).suiteId
                                }
                                hint="仓库 current 样本集"
                              />
                              <InventoryStatCard
                                title={agentText(
                                  "agentChat.harness.generated.7d69461cc6",
                                  "建议 Slug",
                                )}
                                value={
                                  buildReplayPromotionContext({
                                    replayCase,
                                    analysisTitle: analysisHandoff?.title,
                                    reviewTitle: reviewDecisionTemplate?.title,
                                  }).slug
                                }
                                hint="promotion 目录名"
                              />
                              <InventoryStatCard
                                title={agentText(
                                  "agentChat.harness.generated.1781d59f60",
                                  "后续验证",
                                )}
                                value="eval + trend"
                                hint="统一摘要与趋势入口"
                              />
                            </div>
                          </div>

                          <div className="space-y-3">
                            {replayCase.artifacts.map((artifact) => {
                              const sizeLabel = formatSize(artifact.bytes);
                              return (
                                <div
                                  key={artifact.absolute_path}
                                  className="rounded-xl border border-border bg-background p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium text-foreground">
                                          {artifact.title}
                                        </span>
                                        <Badge variant="outline">
                                          {formatReplayArtifactKindLabel(
                                            artifact.kind,
                                          )}
                                        </Badge>
                                        {sizeLabel ? (
                                          <Badge variant="secondary">
                                            {sizeLabel}
                                          </Badge>
                                        ) : null}
                                      </div>
                                      <div className="mt-2 text-xs text-muted-foreground">
                                        <div>
                                          {agentText(
                                            "agentChat.harness.generated.2ee19fe8b0",
                                            "相对路径：",
                                          )}
                                          <span className="ml-1 break-all font-mono text-foreground">
                                            {artifact.relative_path}
                                          </span>
                                        </div>
                                        <div className="mt-1">
                                          {agentText(
                                            "agentChat.harness.generated.f9c616413f",
                                            "绝对路径：",
                                          )}
                                          <PathTextLink
                                            path={artifact.absolute_path}
                                            className="ml-1"
                                            onOpenPath={handleOpenPathValue}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="gap-2"
                                        aria-label={`预览 Replay 样本：${artifact.title}`}
                                        onClick={() =>
                                          void openPreview({
                                            title: artifact.title,
                                            description: `Replay 样本 · ${formatReplayArtifactKindLabel(
                                              artifact.kind,
                                            )}`,
                                            path: artifact.absolute_path,
                                          })
                                        }
                                      >
                                        <Eye className="h-4 w-4" />
                                        {agentText(
                                          "agentChat.harness.generated.de61aa8e1c",
                                          "预览",
                                        )}
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="gap-2"
                                        aria-label={`系统打开 Replay 样本：${artifact.absolute_path}`}
                                        onClick={() =>
                                          void handleOpenPathValue(
                                            artifact.absolute_path,
                                          )
                                        }
                                      >
                                        <FolderOpen className="h-4 w-4" />
                                        {agentText(
                                          "agentChat.harness.generated.65fc81e161",
                                          "打开",
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                          {agentText(
                            "agentChat.harness.generated.dc204bc209",
                            "尚未导出 Replay 样本。建议在 handoff 和 evidence 都稳定后，再把真实失败沉淀成 `input / expected / grader / evidence-links` 四件套。",
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Sparkles className="h-4 w-4 text-violet-600" />
                            <span>
                              {agentText(
                                "agentChat.harness.generated.d182d6ca5e",
                                "外部分析交接",
                              )}
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            {agentText(
                              "agentChat.harness.generated.d3e119bf04",
                              "把 handoff / evidence / replay 主链重新包装成外部 AI 可直接消费的分析交接；复制后可直接粘贴给 AI， 不需要你再手写补充 prompt。",
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={analysisHandoff ? "outline" : "default"}
                            className="gap-2"
                            aria-label={agentText(
                              "agentChat.harness.generated.6ee9d41fc9",
                              "导出外部分析交接",
                            )}
                            disabled={analysisExporting}
                            onClick={() => void handleExportAnalysisHandoff()}
                          >
                            {analysisExporting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                            {analysisHandoff ? "刷新分析交接" : "导出分析交接"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            aria-label={agentText(
                              "agentChat.harness.generated.29ae25dba3",
                              "一键复制给 AI",
                            )}
                            disabled={analysisExporting}
                            onClick={() => void handleCopyAnalysisPrompt()}
                          >
                            {analysisExporting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            {agentText(
                              "agentChat.harness.generated.29ae25dba3",
                              "一键复制给 AI",
                            )}
                          </Button>
                          {analysisHandoff ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              aria-label={agentText(
                                "agentChat.harness.generated.dbf50b71fe",
                                "打开外部分析目录",
                              )}
                              onClick={() =>
                                void handleOpenPathValue(
                                  analysisHandoff.analysis_absolute_root,
                                )
                              }
                            >
                              <FolderOpen className="h-4 w-4" />
                              {agentText(
                                "agentChat.harness.generated.031c105578",
                                "打开目录",
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {analysisExportError ? (
                        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                          {analysisExportError}
                        </div>
                      ) : null}

                      {analysisHandoff ? (
                        <div className="mt-3 space-y-3">
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.2a36de35aa",
                                "线程状态",
                              )}
                              value={formatHandoffStatusLabel(
                                analysisHandoff.thread_status,
                              )}
                              hint={`最近导出 ${formatIsoDateTime(analysisHandoff.exported_at)}`}
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.90cc62f7c2",
                                "最新 Turn",
                              )}
                              value={formatHandoffStatusLabel(
                                analysisHandoff.latest_turn_status,
                              )}
                              hint={`待处理请求 ${analysisHandoff.pending_request_count} · 排队 ${analysisHandoff.queued_turn_count}`}
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.9f052ffbf5",
                                "分析标题",
                              )}
                              value={analysisHandoff.title || "未命名"}
                              hint={`工作区 ${analysisHandoff.workspace_id || "未绑定"}`}
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.f8bd8bc1e8",
                                "分析文件",
                              )}
                              value={`${analysisHandoff.artifacts.length}`}
                              hint="analysis brief / context"
                            />
                          </div>

                          <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-violet-950">
                              <Copy className="h-4 w-4 text-violet-700" />
                              <span>
                                {agentText(
                                  "agentChat.harness.generated.fb7e40eb5b",
                                  "复制说明",
                                )}
                              </span>
                            </div>
                            <div className="mt-2 text-xs leading-5 text-violet-900">
                              {agentText(
                                "agentChat.harness.generated.00423f2e35",
                                "复制内容来自后端导出的 `copy_prompt`，已经包含分析入口文件、关联目录和输出要求； 外部 AI 可直接开始诊断，证据足够明确时也可直接实施最小修复。",
                              )}
                            </div>
                          </div>

                          <div className="rounded-xl border border-border bg-background p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                              <FolderOpen className="h-4 w-4 text-muted-foreground" />
                              <span>
                                {agentText(
                                  "agentChat.harness.generated.0da0f10ea9",
                                  "分析目录",
                                )}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.2ee19fe8b0",
                                  "相对路径：",
                                )}
                                <span className="ml-1 break-all font-mono text-foreground">
                                  {analysisHandoff.analysis_relative_root}
                                </span>
                              </div>
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.f9c616413f",
                                  "绝对路径：",
                                )}
                                <PathTextLink
                                  path={analysisHandoff.analysis_absolute_root}
                                  className="ml-1"
                                  onOpenPath={handleOpenPathValue}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-border bg-background p-3">
                            <div className="text-sm font-medium text-foreground">
                              {agentText(
                                "agentChat.harness.generated.3d4597d82b",
                                "关联主链目录",
                              )}
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.0788808854",
                                  "handoff：",
                                )}
                                <span className="ml-1 break-all font-mono text-foreground">
                                  {analysisHandoff.handoff_bundle_relative_root}
                                </span>
                              </div>
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.d50a6b5d6c",
                                  "evidence：",
                                )}
                                <span className="ml-1 break-all font-mono text-foreground">
                                  {analysisHandoff.evidence_pack_relative_root}
                                </span>
                              </div>
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.498f3b30f7",
                                  "replay：",
                                )}
                                <span className="ml-1 break-all font-mono text-foreground">
                                  {analysisHandoff.replay_case_relative_root}
                                </span>
                              </div>
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.b140ad22fb",
                                  "路径占位根：",
                                )}
                                <span className="ml-1 break-all font-mono text-foreground">
                                  {analysisHandoff.sanitized_workspace_root}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {analysisHandoff.artifacts.map((artifact) => {
                              const sizeLabel = formatSize(artifact.bytes);
                              return (
                                <div
                                  key={artifact.absolute_path}
                                  className="rounded-xl border border-border bg-background p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium text-foreground">
                                          {artifact.title}
                                        </span>
                                        <Badge variant="outline">
                                          {formatAnalysisArtifactKindLabel(
                                            artifact.kind,
                                          )}
                                        </Badge>
                                        {sizeLabel ? (
                                          <Badge variant="secondary">
                                            {sizeLabel}
                                          </Badge>
                                        ) : null}
                                      </div>
                                      <div className="mt-2 text-xs text-muted-foreground">
                                        <div>
                                          {agentText(
                                            "agentChat.harness.generated.2ee19fe8b0",
                                            "相对路径：",
                                          )}
                                          <span className="ml-1 break-all font-mono text-foreground">
                                            {artifact.relative_path}
                                          </span>
                                        </div>
                                        <div className="mt-1">
                                          {agentText(
                                            "agentChat.harness.generated.f9c616413f",
                                            "绝对路径：",
                                          )}
                                          <PathTextLink
                                            path={artifact.absolute_path}
                                            className="ml-1"
                                            onOpenPath={handleOpenPathValue}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="gap-2"
                                        aria-label={`预览外部分析文件：${artifact.title}`}
                                        onClick={() =>
                                          void openPreview({
                                            title: artifact.title,
                                            description: `外部分析交接 · ${formatAnalysisArtifactKindLabel(
                                              artifact.kind,
                                            )}`,
                                            path: artifact.absolute_path,
                                          })
                                        }
                                      >
                                        <Eye className="h-4 w-4" />
                                        {agentText(
                                          "agentChat.harness.generated.de61aa8e1c",
                                          "预览",
                                        )}
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="gap-2"
                                        aria-label={`系统打开外部分析文件：${artifact.absolute_path}`}
                                        onClick={() =>
                                          void handleOpenPathValue(
                                            artifact.absolute_path,
                                          )
                                        }
                                      >
                                        <FolderOpen className="h-4 w-4" />
                                        {agentText(
                                          "agentChat.harness.generated.65fc81e161",
                                          "打开",
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                          {agentText(
                            "agentChat.harness.generated.f48629deea",
                            "尚未导出外部分析交接。点击“一键复制给 AI”时会自动先导出再复制， 用于把当前 Lime 证据链直接交给外部 AI 做诊断与最小修复。",
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <ListChecks className="h-4 w-4 text-emerald-600" />
                            <span>
                              {agentText(
                                "agentChat.harness.generated.4a50d21f62",
                                "人工审核记录",
                              )}
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            {agentText(
                              "agentChat.harness.generated.97b53a81c7",
                              "把外部 AI 的分析结论回挂为 `review-decision.md/json` 模板，固定接受、延后、拒绝与回归要求；最终决策仍由开发者审核，不是 Lime 自动闭环。",
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              reviewDecisionTemplate ? "outline" : "default"
                            }
                            className="gap-2"
                            aria-label={agentText(
                              "agentChat.harness.generated.955a9d2951",
                              "导出人工审核记录",
                            )}
                            disabled={reviewDecisionExporting}
                            onClick={() =>
                              void handleExportReviewDecisionTemplate()
                            }
                          >
                            {reviewDecisionExporting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ListChecks className="h-4 w-4" />
                            )}
                            {reviewDecisionTemplate
                              ? "刷新人工审核记录"
                              : "导出人工审核记录"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            aria-label={agentText(
                              "agentChat.harness.generated.1ced04d169",
                              "填写人工审核结果",
                            )}
                            disabled={
                              reviewDecisionExporting || reviewDecisionSaving
                            }
                            onClick={() =>
                              void handleOpenReviewDecisionEditor()
                            }
                          >
                            <ShieldAlert className="h-4 w-4" />
                            {agentText(
                              "agentChat.harness.generated.1ced04d169",
                              "填写人工审核结果",
                            )}
                          </Button>
                          {reviewDecisionTemplate ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              aria-label={agentText(
                                "agentChat.harness.generated.265890359d",
                                "打开人工审核目录",
                              )}
                              onClick={() =>
                                void handleOpenPathValue(
                                  reviewDecisionTemplate.review_absolute_root,
                                )
                              }
                            >
                              <FolderOpen className="h-4 w-4" />
                              {agentText(
                                "agentChat.harness.generated.031c105578",
                                "打开目录",
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {reviewDecisionExportError ? (
                        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                          {reviewDecisionExportError}
                        </div>
                      ) : null}

                      {reviewDecisionTemplate ? (
                        <div className="mt-3 space-y-3">
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.045859e792",
                                "当前状态",
                              )}
                              value={formatReviewDecisionStatusLabel(
                                reviewDecisionTemplate.decision
                                  .decision_status ||
                                  reviewDecisionTemplate.default_decision_status,
                              )}
                              hint={`最近写入 ${formatIsoDateTime(reviewDecisionTemplate.exported_at)}`}
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.2a36de35aa",
                                "线程状态",
                              )}
                              value={formatHandoffStatusLabel(
                                reviewDecisionTemplate.thread_status,
                              )}
                              hint={`待处理请求 ${reviewDecisionTemplate.pending_request_count} · 排队 ${reviewDecisionTemplate.queued_turn_count}`}
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.a90f1e5591",
                                "风险等级",
                              )}
                              value={formatReviewDecisionRiskLevelLabel(
                                reviewDecisionTemplate.decision.risk_level,
                              )}
                              hint={
                                reviewDecisionTemplate.decision.risk_tags
                                  .length > 0
                                  ? reviewDecisionTemplate.decision.risk_tags.join(
                                      " / ",
                                    )
                                  : "尚未填写风险标签"
                              }
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.302eda3ced",
                                "权限确认",
                              )}
                              value={formatPermissionConfirmationStatusLabel(
                                reviewDecisionTemplate.permission_confirmation_status,
                              )}
                              hint={
                                reviewDecisionTemplate.permission_confirmation_summary ||
                                reviewDecisionTemplate.permission_confirmation_request_id ||
                                "未导出权限确认摘要"
                              }
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.0c5a6323af",
                                "模型锁定",
                              )}
                              value={formatReviewLimitStatusLabel(
                                reviewDecisionTemplate.limit_status,
                              )}
                              hint={
                                reviewDecisionTemplate.user_locked_capability_summary ||
                                reviewDecisionTemplate.capability_gap ||
                                "未导出模型锁定能力缺口"
                              }
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.f8bd8bc1e8",
                                "分析文件",
                              )}
                              value={`${reviewDecisionTemplate.analysis_artifacts.length}`}
                              hint="沿用 analysis handoff 主链"
                            />
                            <InventoryStatCard
                              title={agentText(
                                "agentChat.harness.generated.7d5028f2c7",
                                "审核文件",
                              )}
                              value={`${reviewDecisionTemplate.artifacts.length}`}
                              hint="review-decision.md / json"
                            />
                          </div>

                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-emerald-950">
                              <ShieldAlert className="h-4 w-4 text-emerald-700" />
                              <span>
                                {agentText(
                                  "agentChat.harness.generated.99b1a346a7",
                                  "职责边界",
                                )}
                              </span>
                            </div>
                            <div className="mt-2 text-xs leading-5 text-emerald-900">
                              {agentText(
                                "agentChat.harness.generated.be6144aa41",
                                "运行时事实继续以 aster-rust 的 session / thread / turn 为准，外部分析形状对齐 Codex 的交接习惯，但最终是否接受修复、补哪些回归，必须由开发者写入 review decision。",
                              )}
                            </div>
                          </div>

                          {reviewDecisionTemplate.permission_confirmation_status?.trim() ===
                          "denied" ? (
                            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                <span>
                                  {agentText(
                                    "agentChat.harness.generated.3908997f9f",
                                    "权限确认已拒绝",
                                  )}
                                </span>
                              </div>
                              <div className="mt-2 text-xs leading-5 text-destructive/90">
                                {reviewDecisionTemplate.permission_confirmation_summary ||
                                  "当前 review decision 不能作为成功交付证据，请先处理真实权限确认。"}
                              </div>
                            </div>
                          ) : null}

                          {reviewDecisionTemplate.limit_status?.trim() ===
                          "user_locked_capability_gap" ? (
                            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                <span>
                                  {agentText(
                                    "agentChat.harness.generated.41e558488a",
                                    "模型锁定能力缺口",
                                  )}
                                </span>
                              </div>
                              <div className="mt-2 text-xs leading-5 text-destructive/90">
                                {reviewDecisionTemplate.user_locked_capability_summary ||
                                  "当前显式用户模型锁定不满足 execution profile，不能作为成功交付证据。"}
                              </div>
                              {reviewDecisionTemplate.capability_gap ? (
                                <div className="mt-1 font-mono text-[11px] text-destructive/80">
                                  {agentText(
                                    "agentChat.harness.generated.43400bb0f7",
                                    "capabilityGap=",
                                  )}
                                  {reviewDecisionTemplate.capability_gap}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {reviewDecisionTemplate.verification_summary ? (
                            <HarnessVerificationSummarySection
                              summary={
                                reviewDecisionTemplate.verification_summary
                              }
                            />
                          ) : null}

                          <div className="rounded-xl border border-border bg-background p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-medium text-foreground">
                                {agentText(
                                  "agentChat.harness.generated.bbb8d9b533",
                                  "当前人工审核结论",
                                )}
                              </div>
                              <Badge variant="outline">
                                {formatReviewDecisionStatusLabel(
                                  reviewDecisionTemplate.decision
                                    .decision_status ||
                                    reviewDecisionTemplate.default_decision_status,
                                )}
                              </Badge>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.8132b4b996",
                                  "审核人：",
                                )}
                                <span className="ml-1 text-foreground">
                                  {reviewDecisionTemplate.decision
                                    .human_reviewer || "待填写"}
                                </span>
                              </div>
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.0c0f6228df",
                                  "审核时间：",
                                )}
                                <span className="ml-1 text-foreground">
                                  {reviewDecisionTemplate.decision.reviewed_at
                                    ? formatIsoDateTime(
                                        reviewDecisionTemplate.decision
                                          .reviewed_at,
                                      )
                                    : "待填写"}
                                </span>
                              </div>
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.7b48e37522",
                                  "风险等级：",
                                )}
                                <span className="ml-1 text-foreground">
                                  {formatReviewDecisionRiskLevelLabel(
                                    reviewDecisionTemplate.decision.risk_level,
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="mt-3 space-y-3 text-xs leading-5 text-muted-foreground">
                              <div>
                                <div className="font-medium text-foreground">
                                  {agentText(
                                    "agentChat.harness.generated.8480d012ec",
                                    "决策摘要",
                                  )}
                                </div>
                                <div className="mt-1 whitespace-pre-wrap">
                                  {reviewDecisionTemplate.decision
                                    .decision_summary || "尚未填写决策摘要。"}
                                </div>
                              </div>
                              <div>
                                <div className="font-medium text-foreground">
                                  {agentText(
                                    "agentChat.harness.generated.b0be2cde74",
                                    "采用的修复策略",
                                  )}
                                </div>
                                <div className="mt-1 whitespace-pre-wrap">
                                  {reviewDecisionTemplate.decision
                                    .chosen_fix_strategy ||
                                    "尚未填写修复策略。"}
                                </div>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <div className="font-medium text-foreground">
                                    {agentText(
                                      "agentChat.harness.generated.30861463a7",
                                      "回归要求",
                                    )}
                                  </div>
                                  <div className="mt-1 space-y-1">
                                    {reviewDecisionTemplate.decision
                                      .regression_requirements.length > 0 ? (
                                      reviewDecisionTemplate.decision.regression_requirements.map(
                                        (item) => (
                                          <div key={item}>- {item}</div>
                                        ),
                                      )
                                    ) : (
                                      <div>
                                        {agentText(
                                          "agentChat.harness.generated.5702b85071",
                                          "尚未填写回归要求。",
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="font-medium text-foreground">
                                    {agentText(
                                      "agentChat.harness.generated.db26286d9f",
                                      "后续动作",
                                    )}
                                  </div>
                                  <div className="mt-1 space-y-1">
                                    {reviewDecisionTemplate.decision
                                      .followup_actions.length > 0 ? (
                                      reviewDecisionTemplate.decision.followup_actions.map(
                                        (item) => (
                                          <div key={item}>- {item}</div>
                                        ),
                                      )
                                    ) : (
                                      <div>
                                        {agentText(
                                          "agentChat.harness.generated.84cf3cd090",
                                          "尚未填写后续动作。",
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {reviewDecisionTemplate.decision.notes ? (
                                <div>
                                  <div className="font-medium text-foreground">
                                    {agentText(
                                      "agentChat.harness.generated.d7343a628d",
                                      "审核备注",
                                    )}
                                  </div>
                                  <div className="mt-1 whitespace-pre-wrap">
                                    {reviewDecisionTemplate.decision.notes}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="rounded-xl border border-border bg-background p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                              <FolderOpen className="h-4 w-4 text-muted-foreground" />
                              <span>
                                {agentText(
                                  "agentChat.harness.generated.b74ba0f7e8",
                                  "审核目录",
                                )}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.2ee19fe8b0",
                                  "相对路径：",
                                )}
                                <span className="ml-1 break-all font-mono text-foreground">
                                  {reviewDecisionTemplate.review_relative_root}
                                </span>
                              </div>
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.f9c616413f",
                                  "绝对路径：",
                                )}
                                <PathTextLink
                                  path={
                                    reviewDecisionTemplate.review_absolute_root
                                  }
                                  className="ml-1"
                                  onOpenPath={handleOpenPathValue}
                                />
                              </div>
                              <div>
                                {agentText(
                                  "agentChat.harness.generated.0c51e2d5aa",
                                  "关联 analysis：",
                                )}
                                <span className="ml-1 break-all font-mono text-foreground">
                                  {
                                    reviewDecisionTemplate.analysis_relative_root
                                  }
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-border bg-background p-3">
                            <div className="text-sm font-medium text-foreground">
                              {agentText(
                                "agentChat.harness.generated.9a6c8cf2e8",
                                "人工审核清单",
                              )}
                            </div>
                            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                              {reviewDecisionTemplate.review_checklist.map(
                                (item) => (
                                  <div
                                    key={item}
                                    className="rounded-lg border border-dashed border-border px-3 py-2"
                                  >
                                    {item}
                                  </div>
                                ),
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="text-sm font-medium text-foreground">
                              {agentText(
                                "agentChat.harness.generated.b7ba9e9504",
                                "关联分析文件",
                              )}
                            </div>
                            {reviewDecisionTemplate.analysis_artifacts.map(
                              (artifact) => {
                                const sizeLabel = formatSize(artifact.bytes);
                                return (
                                  <div
                                    key={artifact.absolute_path}
                                    className="rounded-xl border border-border bg-background p-3"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <FileText className="h-4 w-4 text-muted-foreground" />
                                          <span className="text-sm font-medium text-foreground">
                                            {artifact.title}
                                          </span>
                                          <Badge variant="outline">
                                            {formatAnalysisArtifactKindLabel(
                                              artifact.kind,
                                            )}
                                          </Badge>
                                          {sizeLabel ? (
                                            <Badge variant="secondary">
                                              {sizeLabel}
                                            </Badge>
                                          ) : null}
                                        </div>
                                        <div className="mt-2 text-xs text-muted-foreground">
                                          <div>
                                            {agentText(
                                              "agentChat.harness.generated.2ee19fe8b0",
                                              "相对路径：",
                                            )}
                                            <span className="ml-1 break-all font-mono text-foreground">
                                              {artifact.relative_path}
                                            </span>
                                          </div>
                                          <div className="mt-1">
                                            {agentText(
                                              "agentChat.harness.generated.f9c616413f",
                                              "绝对路径：",
                                            )}
                                            <PathTextLink
                                              path={artifact.absolute_path}
                                              className="ml-1"
                                              onOpenPath={handleOpenPathValue}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="gap-2"
                                          aria-label={`预览关联分析文件：${artifact.title}`}
                                          onClick={() =>
                                            void openPreview({
                                              title: artifact.title,
                                              description: `关联分析文件 · ${formatAnalysisArtifactKindLabel(
                                                artifact.kind,
                                              )}`,
                                              path: artifact.absolute_path,
                                            })
                                          }
                                        >
                                          <Eye className="h-4 w-4" />
                                          {agentText(
                                            "agentChat.harness.generated.de61aa8e1c",
                                            "预览",
                                          )}
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          className="gap-2"
                                          aria-label={`系统打开关联分析文件：${artifact.absolute_path}`}
                                          onClick={() =>
                                            void handleOpenPathValue(
                                              artifact.absolute_path,
                                            )
                                          }
                                        >
                                          <FolderOpen className="h-4 w-4" />
                                          {agentText(
                                            "agentChat.harness.generated.65fc81e161",
                                            "打开",
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>

                          <div className="space-y-3">
                            <div className="text-sm font-medium text-foreground">
                              {agentText(
                                "agentChat.harness.generated.d19ad31eb3",
                                "审核记录模板文件",
                              )}
                            </div>
                            {reviewDecisionTemplate.artifacts.map(
                              (artifact) => {
                                const sizeLabel = formatSize(artifact.bytes);
                                return (
                                  <div
                                    key={artifact.absolute_path}
                                    className="rounded-xl border border-border bg-background p-3"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <FileText className="h-4 w-4 text-muted-foreground" />
                                          <span className="text-sm font-medium text-foreground">
                                            {artifact.title}
                                          </span>
                                          <Badge variant="outline">
                                            {formatReviewDecisionArtifactKindLabel(
                                              artifact.kind,
                                            )}
                                          </Badge>
                                          {sizeLabel ? (
                                            <Badge variant="secondary">
                                              {sizeLabel}
                                            </Badge>
                                          ) : null}
                                        </div>
                                        <div className="mt-2 text-xs text-muted-foreground">
                                          <div>
                                            {agentText(
                                              "agentChat.harness.generated.2ee19fe8b0",
                                              "相对路径：",
                                            )}
                                            <span className="ml-1 break-all font-mono text-foreground">
                                              {artifact.relative_path}
                                            </span>
                                          </div>
                                          <div className="mt-1">
                                            {agentText(
                                              "agentChat.harness.generated.f9c616413f",
                                              "绝对路径：",
                                            )}
                                            <PathTextLink
                                              path={artifact.absolute_path}
                                              className="ml-1"
                                              onOpenPath={handleOpenPathValue}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="gap-2"
                                          aria-label={`预览人工审核文件：${artifact.title}`}
                                          onClick={() =>
                                            void openPreview({
                                              title: artifact.title,
                                              description: `人工审核记录 · ${formatReviewDecisionArtifactKindLabel(
                                                artifact.kind,
                                              )}`,
                                              path: artifact.absolute_path,
                                            })
                                          }
                                        >
                                          <Eye className="h-4 w-4" />
                                          {agentText(
                                            "agentChat.harness.generated.de61aa8e1c",
                                            "预览",
                                          )}
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          className="gap-2"
                                          aria-label={`系统打开人工审核文件：${artifact.absolute_path}`}
                                          onClick={() =>
                                            void handleOpenPathValue(
                                              artifact.absolute_path,
                                            )
                                          }
                                        >
                                          <FolderOpen className="h-4 w-4" />
                                          {agentText(
                                            "agentChat.harness.generated.65fc81e161",
                                            "打开",
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                          {agentText(
                            "agentChat.harness.generated.fb2456e37b",
                            "尚未导出人工审核记录。建议在外部 AI 完成诊断后立刻导出 `review-decision.md/json`，把接受、延后、拒绝和回归要求回挂到工作区， 而不是散落在聊天窗口或临时笔记里。",
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Section>
              ) : null}

              {diagnosticRuntimeContext?.sessionId ? (
                <Section
                  sectionKey="objective"
                  title={String(t("agentChat.managedObjective.sectionTitle"))}
                  badge={
                    threadRead?.managed_objective
                      ? String(
                          t(
                            `agentChat.managedObjective.status.${threadRead.managed_objective.status}` as never,
                          ),
                        )
                      : String(t("agentChat.managedObjective.badge.empty"))
                  }
                  registerRef={registerSectionRef}
                >
                  <ManagedObjectivePanel
                    sessionId={diagnosticRuntimeContext.sessionId}
                    workspaceId={diagnosticRuntimeContext.workspaceId}
                    objective={threadRead?.managed_objective ?? null}
                    runtimeBusy={
                      threadRead?.status === "running" ||
                      threadRead?.status === "queued" ||
                      canInterrupt
                    }
                    onObjectiveChanged={onObjectiveChanged}
                  />
                </Section>
              ) : null}

              {threadReliabilityView.shouldRender ? (
                <Section
                  sectionKey="reliability"
                  title={agentText(
                    "agentChat.harness.generated.8f2d0db713",
                    "线程可靠性",
                  )}
                  badge={threadReliabilityView.statusLabel}
                  registerRef={registerSectionRef}
                >
                  <AgentThreadReliabilityPanel
                    className="mb-0 border-border bg-background shadow-none"
                    threadRead={threadRead}
                    turns={turns}
                    threadItems={threadItems}
                    currentTurnId={currentTurnId}
                    pendingActions={pendingActions}
                    submittedActionsInFlight={submittedActionsInFlight}
                    queuedTurns={queuedTurns}
                    canInterrupt={canInterrupt}
                    onInterruptCurrentTurn={onInterruptCurrentTurn}
                    onResumeThread={onResumeThread}
                    onReplayPendingRequest={onReplayPendingRequest}
                    onPromoteQueuedTurn={onPromoteQueuedTurn}
                    onOpenMemoryWorkbench={onOpenMemoryWorkbench}
                    harnessState={harnessState}
                    messages={messages}
                    teamMemorySnapshot={teamMemorySnapshot}
                    diagnosticRuntimeContext={diagnosticRuntimeContext}
                  />
                </Section>
              ) : null}

              {fileChangeReviewEntries.length > 0 ? (
                <Section
                  sectionKey="file_review"
                  title={String(
                    t("agentChat.harness.fileReview.title" as never),
                  )}
                  badge={String(
                    t(
                      "agentChat.harness.fileReview.badge" as never,
                      {
                        pending: fileChangeStatusCounts.pending,
                        total: fileChangeReviewEntries.length,
                      } as never,
                    ),
                  )}
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3">
                    <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-sky-950">
                            {String(
                              t(
                                "agentChat.harness.fileReview.summaryTitle" as never,
                              ),
                            )}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-sky-800">
                            {String(
                              t(
                                "agentChat.harness.fileReview.summary" as never,
                                {
                                  pending: fileChangeStatusCounts.pending,
                                  applied: fileChangeStatusCounts.applied,
                                  rejected: fileChangeStatusCounts.rejected,
                                } as never,
                              ),
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className="border-sky-300 bg-white text-sky-700"
                          >
                            {String(
                              t(
                                "agentChat.harness.fileReview.pendingCount" as never,
                                {
                                  count: fileChangeStatusCounts.pending,
                                } as never,
                              ),
                            )}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-emerald-300 bg-white text-emerald-700"
                          >
                            {String(
                              t(
                                "agentChat.harness.fileReview.appliedCount" as never,
                                {
                                  count: fileChangeStatusCounts.applied,
                                } as never,
                              ),
                            )}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-rose-300 bg-white text-rose-700"
                          >
                            {String(
                              t(
                                "agentChat.harness.fileReview.rejectedCount" as never,
                                {
                                  count: fileChangeStatusCounts.rejected,
                                } as never,
                              ),
                            )}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSelectedFileChangeKeys(
                              allFileChangesSelected
                                ? []
                                : selectableFileChangeKeys,
                            )
                          }
                          aria-label={String(
                            t(
                              allFileChangesSelected
                                ? ("agentChat.harness.fileReview.clearSelectionAria" as never)
                                : ("agentChat.harness.fileReview.selectAllAria" as never),
                            ),
                          )}
                        >
                          <SquareCheckBig className="mr-1 h-4 w-4" />
                          {allFileChangesSelected
                            ? String(
                                t(
                                  "agentChat.harness.fileReview.clearSelection" as never,
                                ),
                              )
                            : String(
                                t(
                                  "agentChat.harness.fileReview.selectAll" as never,
                                ),
                              )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={selectedFileChangeCount === 0}
                          onClick={() => {
                            setFileChangeDecisions((previous) => ({
                              ...previous,
                              ...Object.fromEntries(
                                selectedFileChangeEntries.map((entry) => [
                                  entry.key,
                                  "applied" as const,
                                ]),
                              ),
                            }));
                            toast.success(
                              String(
                                t(
                                  "agentChat.harness.fileReview.toast.applied" as never,
                                  {
                                    count: selectedFileChangeCount,
                                  } as never,
                                ),
                              ),
                            );
                          }}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          {String(
                            t(
                              "agentChat.harness.fileReview.markApplied" as never,
                              {
                                count: selectedFileChangeCount,
                              } as never,
                            ),
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={selectedFileChangeCount === 0}
                          onClick={() => {
                            setFileChangeDecisions((previous) => ({
                              ...previous,
                              ...Object.fromEntries(
                                selectedFileChangeEntries.map((entry) => [
                                  entry.key,
                                  "rejected" as const,
                                ]),
                              ),
                            }));
                            if (onOpenFileCheckpoints) {
                              onOpenFileCheckpoints();
                            } else {
                              toast.info(
                                String(
                                  t(
                                    "agentChat.harness.fileReview.toast.rejectedNoCheckpoint" as never,
                                  ),
                                ),
                              );
                            }
                          }}
                        >
                          <XCircle className="mr-1 h-4 w-4" />
                          {String(
                            t(
                              "agentChat.harness.fileReview.markRejected" as never,
                              {
                                count: selectedFileChangeCount,
                              } as never,
                            ),
                          )}
                        </Button>
                      </div>
                      {onOpenFileCheckpoints ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={onOpenFileCheckpoints}
                        >
                          <Undo2 className="mr-1 h-4 w-4" />
                          {String(
                            t(
                              "agentChat.harness.fileReview.openCheckpoints" as never,
                            ),
                          )}
                        </Button>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      {fileChangeReviewEntries.map((entry) => {
                        const Icon = resolveKindIcon(entry.kind);
                        const selected = selectedFileChangeSet.has(entry.key);
                        const latestActionLabel = translateFileReviewAction(
                          translateAgent,
                          entry.latestAction,
                        );
                        const kindLabel = translateFileReviewKind(
                          translateAgent,
                          entry.kind,
                        );
                        const actionSummary = summarizeFileReviewActionText(
                          translateAgent,
                          entry.actionSummaryItems,
                        );
                        const diffSummary =
                          buildFileChangeReviewDiffSummary(entry);
                        return (
                          <div
                            key={entry.key}
                            className={cn(
                              "rounded-xl border bg-background p-3",
                              selected
                                ? "border-primary/50 ring-1 ring-primary/20"
                                : "border-border",
                            )}
                            data-testid={`harness-file-review-item-${entry.displayName}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <label className="flex min-w-0 flex-1 items-start gap-3">
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 rounded border-border"
                                  checked={selected}
                                  onChange={(event) => {
                                    const checked = event.currentTarget.checked;
                                    setSelectedFileChangeKeys((previous) =>
                                      checked
                                        ? previous.includes(entry.key)
                                          ? previous
                                          : [...previous, entry.key]
                                        : previous.filter(
                                            (key) => key !== entry.key,
                                          ),
                                    );
                                  }}
                                  aria-label={String(
                                    t(
                                      "agentChat.harness.fileReview.selectItemAria" as never,
                                      {
                                        path: entry.path,
                                      } as never,
                                    ),
                                  )}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                    <span className="truncate text-sm font-medium text-foreground">
                                      {entry.displayName}
                                    </span>
                                  </span>
                                  <PathTextLink
                                    path={entry.path}
                                    className="mt-1 text-xs"
                                    stopPropagation={true}
                                    onOpenPath={handleOpenPathValue}
                                  />
                                  <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <Clock3 className="h-3.5 w-3.5" />
                                    <span>{formatTime(entry.timestamp)}</span>
                                    <span>·</span>
                                    <span>{latestActionLabel}</span>
                                    <span>·</span>
                                    <span>{actionSummary}</span>
                                  </span>
                                </span>
                              </label>
                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <Badge variant="secondary">{kindLabel}</Badge>
                                <Badge
                                  variant={
                                    entry.status === "applied"
                                      ? "secondary"
                                      : entry.status === "rejected"
                                        ? "destructive"
                                        : "outline"
                                  }
                                >
                                  {String(
                                    t(
                                      FILE_CHANGE_STATUS_LABEL_KEY_BY_STATUS[
                                        entry.status
                                      ] as never,
                                    ),
                                  )}
                                </Badge>
                              </div>
                            </div>

                            {diffSummary ? (
                              <DiffReviewMiniPanel
                                summary={diffSummary}
                                translate={translateAgent}
                                onOpenPath={handleOpenPathValue}
                                stopPropagation={true}
                              />
                            ) : entry.preview ? (
                              <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                                <InteractiveText
                                  text={entry.preview}
                                  mono={true}
                                  stopPropagation={true}
                                  onOpenUrl={handleOpenExternalLink}
                                />
                              </div>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void openPreview({
                                    title: entry.displayName,
                                    description: joinDisplayParts([
                                      latestActionLabel,
                                      kindLabel,
                                      actionSummary,
                                    ]),
                                    path: entry.path,
                                    content: entry.content,
                                    preview: entry.preview,
                                  })
                                }
                              >
                                <Eye className="mr-1 h-4 w-4" />
                                {String(
                                  t(
                                    "agentChat.harness.fileReview.preview" as never,
                                  ),
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setFileChangeDecisions((previous) => ({
                                    ...previous,
                                    [entry.key]: "applied",
                                  }))
                                }
                              >
                                <CheckCircle2 className="mr-1 h-4 w-4" />
                                {String(
                                  t(
                                    "agentChat.harness.fileReview.applyOne" as never,
                                  ),
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setFileChangeDecisions((previous) => ({
                                    ...previous,
                                    [entry.key]: "rejected",
                                  }));
                                  if (onOpenFileCheckpoints) {
                                    onOpenFileCheckpoints();
                                  } else {
                                    toast.info(
                                      String(
                                        t(
                                          "agentChat.harness.fileReview.toast.rejectedNoCheckpoint" as never,
                                        ),
                                      ),
                                    );
                                  }
                                }}
                              >
                                <Undo2 className="mr-1 h-4 w-4" />
                                {String(
                                  t(
                                    "agentChat.harness.fileReview.rejectOne" as never,
                                  ),
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Section>
              ) : null}

              {hasAgentUiProjectionSection ? (
                <Section
                  sectionKey="agentui"
                  title={agentText(
                    "agentChat.harness.generated.bca7a0c006",
                    "AgentUI 标准投影",
                  )}
                  badge={`${agentUiProjectionSummary.total} 条`}
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-sky-300 bg-background text-sky-800"
                      >
                        {agentText(
                          "agentChat.harness.generated.7d96e65980",
                          "current projection",
                        )}
                      </Badge>
                      <span className="text-xs text-sky-900">
                        {agentText(
                          "agentChat.harness.generated.f931108be0",
                          "只读取 conversationProjectionStore.agentUi；不从 assistant 文本反推工具、证据或审批状态。",
                        )}
                      </span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                      <InventoryStatCard
                        title={agentText(
                          "agentChat.harness.generated.bf38ab4875",
                          "Action / HITL",
                        )}
                        value={`${agentUiProjectionSummary.actionCount}`}
                        hint="action.required / permission.changed"
                      />
                      <InventoryStatCard
                        title={agentText(
                          "agentChat.harness.generated.7be19a3bbe",
                          "Task / Agent",
                        )}
                        value={`${agentUiProjectionSummary.taskCount}`}
                        hint="queue.changed / task.changed / agent.changed"
                      />
                      <InventoryStatCard
                        title={agentText(
                          "agentChat.harness.generated.aa778b50a1",
                          "Artifact",
                        )}
                        value={`${agentUiProjectionSummary.artifactCount}`}
                        hint="artifact.* typed events"
                      />
                      <InventoryStatCard
                        title={agentText(
                          "agentChat.harness.generated.7ea014de7b",
                          "Evidence",
                        )}
                        value={`${agentUiProjectionSummary.evidenceCount}`}
                        hint="evidence.changed"
                      />
                      <InventoryStatCard
                        title={agentText(
                          "agentChat.harness.generated.3af2279f9e",
                          "Diagnostics",
                        )}
                        value={`${agentUiProjectionSummary.diagnosticsCount}`}
                        hint="context / metric / diagnostic"
                      />
                    </div>

                    {agentUiProjectionSummary.latestNotableEvents.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-sky-950">
                          {agentText(
                            "agentChat.harness.generated.1a89b7738c",
                            "最近标准事件",
                          )}
                        </div>
                        {agentUiProjectionSummary.latestNotableEvents.map(
                          (event, index) => (
                            <div
                              key={[
                                event.sequence,
                                event.type,
                                event.sourceType,
                                index,
                              ].join(":")}
                              className="rounded-xl border border-sky-200 bg-background p-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">
                                  {formatAgentUiProjectionEventType(
                                    event.type,
                                    translateProjection,
                                  )}
                                </Badge>
                                <Badge variant="outline">
                                  {formatAgentUiProjectionPhase(
                                    event.phase,
                                    translateProjection,
                                  )}
                                </Badge>
                                {event.control ? (
                                  <Badge variant="outline">
                                    {agentText(
                                      "agentChat.harness.generated.74f4646cb4",
                                      "control ·",
                                    )}{" "}
                                    {formatAgentUiProjectionControl(
                                      event.control,
                                      translateProjection,
                                    )}
                                  </Badge>
                                ) : null}
                                {event.timestamp ? (
                                  <span className="text-xs text-muted-foreground">
                                    {formatIsoDateTime(event.timestamp)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                <span className="text-foreground">
                                  {formatAgentUiProjectionSourceType(
                                    event.sourceType,
                                    translateProjection,
                                  )}
                                </span>
                                <span className="mx-1">·</span>
                                {formatAgentUiProjectionEventDetail(event)}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>
                </Section>
              ) : null}

              {runtimeFactSummary ? (
                <Section
                  sectionKey="runtime-facts"
                  title={agentText(
                    "agentChat.harness.generated.33926941a3",
                    "运行时事实",
                  )}
                  badge="current"
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-4">
                    {runtimeFactSummary.decisionReason ? (
                      <div className="text-sm text-slate-700">
                        <span className="font-medium text-foreground">
                          {agentText(
                            "agentChat.harness.generated.6418acb28a",
                            "决策原因：",
                          )}
                        </span>
                        {runtimeFactSummary.decisionReason}
                      </div>
                    ) : null}

                    {runtimeFactSummary.fallbackChain.length > 0 ? (
                      <div className="text-sm text-slate-700">
                        <span className="font-medium text-foreground">
                          {agentText(
                            "agentChat.harness.generated.7dda9f12bc",
                            "回退链：",
                          )}
                        </span>
                        {runtimeFactSummary.fallbackChain.join(" → ")}
                      </div>
                    ) : null}

                    {runtimeFactSummary.oemPolicy ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {runtimeFactSummary.oemPolicy.locked ? (
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-white text-amber-700"
                            >
                              {agentText(
                                "agentChat.harness.generated.8bda487786",
                                "品牌云端托管锁定",
                              )}
                            </Badge>
                          ) : null}
                          {runtimeFactSummary.oemPolicy.quotaLow ? (
                            <Badge
                              variant="outline"
                              className="border-orange-300 bg-white text-orange-700"
                            >
                              {agentText(
                                "agentChat.harness.generated.f90b84fdd1",
                                "品牌云端额度偏低",
                              )}
                            </Badge>
                          ) : null}
                          {runtimeFactSummary.oemPolicy.canInvoke === false ? (
                            <Badge
                              variant="outline"
                              className="border-rose-300 bg-white text-rose-700"
                            >
                              {agentText(
                                "agentChat.harness.generated.b5034aede8",
                                "品牌云端当前不可调用",
                              )}
                            </Badge>
                          ) : null}
                          {runtimeFactSummary.oemPolicy
                            .fallbackToLocalAllowed === true ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-300 bg-white text-emerald-700"
                            >
                              {agentText(
                                "agentChat.harness.generated.b9044a46f4",
                                "允许回退本地",
                              )}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {runtimeFactSummary.oemPolicy.defaultModel ||
                          runtimeFactSummary.oemPolicy.selectedModel ? (
                            <span>
                              {agentText(
                                "agentChat.harness.generated.ba5a177dbc",
                                "品牌云端模型",
                              )}{" "}
                              {runtimeFactSummary.oemPolicy.defaultModel ||
                                runtimeFactSummary.oemPolicy.selectedModel}
                            </span>
                          ) : null}
                          {runtimeFactSummary.oemPolicy.quotaStatus ? (
                            <span>
                              {agentText(
                                "agentChat.harness.generated.9689f96384",
                                "额度状态",
                              )}{" "}
                              {runtimeFactSummary.oemPolicy.quotaStatus}
                            </span>
                          ) : null}
                          {runtimeFactSummary.oemPolicy.offerState ? (
                            <span>
                              {agentText(
                                "agentChat.harness.generated.eb4e63ff82",
                                "策略状态",
                              )}
                              {runtimeFactSummary.oemPolicy.offerState}
                            </span>
                          ) : null}
                          {runtimeFactSummary.oemPolicy.providerSource ? (
                            <span>
                              {agentText(
                                "agentChat.harness.generated.c63f79e636",
                                "来源",
                              )}
                              {runtimeFactSummary.oemPolicy.providerSource}
                            </span>
                          ) : null}
                          {runtimeFactSummary.oemPolicy.providerKey ? (
                            <span>
                              {agentText(
                                "agentChat.harness.generated.2684f75e20",
                                "Provider Key",
                              )}{" "}
                              {runtimeFactSummary.oemPolicy.providerKey}
                            </span>
                          ) : null}
                          {runtimeFactSummary.oemPolicy.tenantId ? (
                            <span>
                              {agentText(
                                "agentChat.harness.generated.cc04fa896e",
                                "租户",
                              )}
                              {runtimeFactSummary.oemPolicy.tenantId}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Section>
              ) : null}

              {harnessState.activeFileWrites.length > 0 ? (
                <Section
                  sectionKey="writes"
                  title={agentText(
                    "agentChat.harness.generated.e36ba9e753",
                    "当前文件写入",
                  )}
                  badge={`${harnessState.activeFileWrites.length} 条`}
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3">
                    {harnessState.activeFileWrites.map((write) => (
                      <button
                        key={write.id}
                        type="button"
                        className="w-full rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/60"
                        onClick={() =>
                          void openPreview({
                            title: write.displayName,
                            description: getActiveWriteDescription(write),
                            path: write.path,
                            content: write.content,
                            preview: write.preview || write.latestChunk,
                          })
                        }
                        aria-label={`查看文件写入：${write.displayName}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="truncate text-sm font-medium text-foreground">
                                {write.displayName}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {getActiveWriteDescription(write)}
                            </div>
                            <PathTextLink
                              path={write.path}
                              className="mt-1 text-xs"
                              stopPropagation={true}
                              onOpenPath={handleOpenPathValue}
                            />
                          </div>
                          <Badge variant="outline">
                            {formatArtifactWritePhaseLabel(write.phase)}
                          </Badge>
                        </div>
                        {write.preview || write.latestChunk ? (
                          <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                            <InteractiveText
                              text={write.preview || write.latestChunk}
                              mono={true}
                              stopPropagation={true}
                              onOpenUrl={handleOpenExternalLink}
                            />
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {agentText(
                              "agentChat.harness.generated.54f5c230c9",
                              "正在准备文件内容...",
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </Section>
              ) : null}

              {harnessState.outputSignals.length > 0 ? (
                <Section
                  sectionKey="outputs"
                  title={agentText(
                    "agentChat.harness.generated.fb7edd231f",
                    "工具输出",
                  )}
                  badge={
                    filteredOutputSignals.length ===
                    harnessState.outputSignals.length
                      ? `${harnessState.outputSignals.length} 条`
                      : `${filteredOutputSignals.length} / ${harnessState.outputSignals.length} 条`
                  }
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {outputFilterOptions.map((option) => {
                        const count =
                          option.value === "all"
                            ? harnessState.outputSignals.length
                            : harnessState.outputSignals.filter((signal) =>
                                matchesOutputFilter(signal, option.value),
                              ).length;
                        const active = option.value === outputFilter;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs transition-colors",
                              active
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                            )}
                            onClick={() => setOutputFilter(option.value)}
                            aria-pressed={active}
                            aria-label={`工具输出筛选：${option.label}`}
                          >
                            {option.label} {count}
                          </button>
                        );
                      })}
                    </div>
                    {filteredOutputSignals.length > 0 ? (
                      groupedOutputEntries.map((entry) => {
                        if (entry.type === "search_batch") {
                          if (entry.signals.length === 1) {
                            const signal = entry.signals[0];
                            return (
                              <SearchOutputCard
                                key={signal.id}
                                signal={signal}
                                onOpenUrl={handleOpenExternalLink}
                                onOpenDetail={() =>
                                  void openPreview({
                                    title: signal.title,
                                    description: signal.summary,
                                    path: getSignalPath(signal),
                                    content: signal.content,
                                    preview: signal.preview,
                                  })
                                }
                              />
                            );
                          }

                          return (
                            <SearchOutputBatchCard
                              key={entry.signals
                                .map((signal) => signal.id)
                                .join("|")}
                              signals={entry.signals}
                              onOpenUrl={handleOpenExternalLink}
                              onOpenDetail={(signal) =>
                                void openPreview({
                                  title: signal.title,
                                  description: signal.summary,
                                  path: getSignalPath(signal),
                                  content: signal.content,
                                  preview: signal.preview,
                                })
                              }
                            />
                          );
                        }

                        const signal = entry.signal;
                        const signalPath = getSignalPath(signal);
                        const signalUrl = findFirstUrl(
                          signal.summary,
                          signal.content,
                          signal.preview,
                          signal.title,
                        );
                        const canOpenPreview = Boolean(
                          signalPath || signal.content || signal.preview,
                        );
                        const canOpenUrl =
                          !canOpenPreview && Boolean(signalUrl);
                        const outputStatusDescriptors =
                          buildOutputStatusDescriptors(signal);
                        const outputPaths = getOutputSignalPaths(signal);
                        const diffSummary =
                          buildOutputSignalDiffSummary(signal);
                        const outputPresentation =
                          resolveOutputCardPresentation(signal, translateAgent);

                        return (
                          <button
                            key={signal.id}
                            type="button"
                            className={cn(
                              "w-full rounded-[10px] border bg-background p-3 text-left transition-colors hover:bg-muted/60",
                              outputPresentation.tone === "failed" &&
                                "border-amber-200 bg-amber-50/70 hover:bg-amber-50",
                              !canOpenPreview &&
                                !canOpenUrl &&
                                "cursor-default",
                            )}
                            data-output-raw-details-collapsed={
                              outputPresentation.rawDetailsCollapsed
                                ? "true"
                                : undefined
                            }
                            onClick={() =>
                              canOpenPreview
                                ? void openPreview({
                                    title: signal.title,
                                    description: signal.summary,
                                    path: signalPath,
                                    content: signal.content,
                                    preview: signal.preview,
                                  })
                                : signalUrl
                                  ? void handleOpenExternalLink(signalUrl)
                                  : undefined
                            }
                            aria-label={`查看工具输出：${signal.title}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                                  <span className="truncate text-sm font-medium text-foreground">
                                    {signal.title}
                                  </span>
                                </div>
                                <InteractiveText
                                  text={outputPresentation.summary}
                                  className="mt-1 text-xs text-muted-foreground"
                                  stopPropagation={true}
                                  onOpenUrl={handleOpenExternalLink}
                                />
                                {outputStatusDescriptors.length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {outputStatusDescriptors.map(
                                      (descriptor) => (
                                        <Badge
                                          key={descriptor.key}
                                          variant={descriptor.variant}
                                        >
                                          {String(
                                            t(
                                              descriptor.labelKey as never,
                                              descriptor.values as never,
                                            ),
                                          )}
                                        </Badge>
                                      ),
                                    )}
                                  </div>
                                ) : null}
                              </div>
                              <Badge variant="outline">
                                {resolveFriendlyToolLabel(signal.toolName) ||
                                  signal.toolName}
                              </Badge>
                            </div>
                            {outputPaths.length > 0 ? (
                              <div className="mt-3 space-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                                <div className="font-medium text-foreground">
                                  {String(
                                    t(
                                      "agentChat.harness.outputs.paths.title" as never,
                                    ),
                                  )}
                                </div>
                                {outputPaths.map((item) => (
                                  <div
                                    key={`${item.key}:${item.path}`}
                                    className="flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground"
                                  >
                                    <span>
                                      {String(
                                        t(
                                          OUTPUT_PATH_LABEL_KEY_BY_KIND[
                                            item.key
                                          ] as never,
                                        ),
                                      )}
                                    </span>
                                    <PathTextLink
                                      path={item.path}
                                      stopPropagation={true}
                                      onOpenPath={handleOpenPathValue}
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {diffSummary ? (
                              <DiffReviewMiniPanel
                                summary={diffSummary}
                                translate={translateAgent}
                                onOpenPath={handleOpenPathValue}
                                stopPropagation={true}
                              />
                            ) : outputPresentation.preview ? (
                              <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                                <InteractiveText
                                  text={outputPresentation.preview}
                                  mono={true}
                                  stopPropagation={true}
                                  onOpenUrl={handleOpenExternalLink}
                                />
                              </div>
                            ) : outputPresentation.collapsedHint ? (
                              <div className="mt-2 rounded-[8px] border border-amber-200 bg-white/75 px-2.5 py-2 text-xs text-amber-800">
                                {outputPresentation.collapsedHint}
                              </div>
                            ) : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                        {agentText(
                          "agentChat.harness.generated.1146635328",
                          "当前筛选条件下暂无记录。",
                        )}
                      </div>
                    )}
                  </div>
                </Section>
              ) : null}

              {hasToolInventorySection ? (
                <Section
                  sectionKey="inventory"
                  title={agentText(
                    "agentChat.harness.generated.0ddd6d9a60",
                    "工具与权限",
                  )}
                  badge={
                    toolInventoryLoading
                      ? "读取中"
                      : toolInventory
                        ? `runtime ${runtimeToolVisibleTotal}/${runtimeToolTotal}`
                        : toolInventoryError
                          ? "读取失败"
                          : "待同步"
                  }
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        {toolInventory ? (
                          <>
                            <Badge variant="secondary">
                              {agentText(
                                "agentChat.harness.generated.82aec0037c",
                                "caller：",
                              )}
                              {toolInventory.request?.caller || "未知"}
                            </Badge>
                            <Badge variant="outline">
                              {agentText(
                                "agentChat.harness.generated.9d523f85db",
                                "工作台：",
                              )}
                              {toolInventory.request?.surface?.workbench
                                ? "开启"
                                : "关闭"}
                            </Badge>
                            <Badge variant="outline">
                              {agentText(
                                "agentChat.harness.generated.4a68d070e6",
                                "Browser Assist：",
                              )}
                              {toolInventory.request?.surface?.browser_assist
                                ? "开启"
                                : "关闭"}
                            </Badge>
                            <Badge variant="outline">
                              {agentText(
                                "agentChat.harness.generated.e96cdaadb1",
                                "默认允许：",
                              )}
                              {toolInventory.counts.default_allowed_total}
                            </Badge>
                          </>
                        ) : (
                          <Badge variant="outline">
                            {agentText(
                              "agentChat.harness.generated.0f4d7157ea",
                              "等待工具库存",
                            )}
                          </Badge>
                        )}
                      </div>
                      {onRefreshToolInventory ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          aria-label={agentText(
                            "agentChat.harness.generated.908fe49fe3",
                            "刷新工具库存",
                          )}
                          onClick={onRefreshToolInventory}
                        >
                          {toolInventoryLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wrench className="h-4 w-4" />
                          )}
                          {agentText(
                            "agentChat.harness.generated.f79c583e24",
                            "刷新库存",
                          )}
                        </Button>
                      ) : null}
                    </div>

                    {toolInventoryLoading ? (
                      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {agentText(
                          "agentChat.harness.generated.713fb7c6d1",
                          "正在读取当前工具库存与权限策略...",
                        )}
                      </div>
                    ) : null}

                    {toolInventoryError ? (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                        {toolInventoryError}
                      </div>
                    ) : null}

                    {toolInventory ? (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                          <InventoryStatCard
                            title={agentText(
                              "agentChat.harness.generated.c4740e4ca2",
                              "Runtime",
                            )}
                            value={`${runtimeToolVisibleTotal}`}
                            hint={`可见 / 总数 ${runtimeToolVisibleTotal} / ${runtimeToolTotal}`}
                          />
                          <InventoryStatCard
                            title={agentText(
                              "agentChat.harness.generated.4a88d27bba",
                              "Catalog",
                            )}
                            value={`${toolInventory.counts.catalog_total}`}
                            hint={`现役 ${toolInventory.counts.catalog_current_total} · 兼容 ${toolInventory.counts.catalog_compat_total}`}
                          />
                          <InventoryStatCard
                            title={agentText(
                              "agentChat.harness.generated.1fd6a805da",
                              "Registry",
                            )}
                            value={`${toolInventory.counts.registry_visible_total}`}
                            hint={`可见 / 总数 ${toolInventory.counts.registry_visible_total} / ${toolInventory.counts.registry_total}`}
                          />
                          <InventoryStatCard
                            title={agentText(
                              "agentChat.harness.generated.659087d3ca",
                              "Extension",
                            )}
                            value={`${toolInventory.counts.extension_tool_visible_total}`}
                            hint={`可见 / 总数 ${toolInventory.counts.extension_tool_visible_total} / ${toolInventory.counts.extension_tool_total}`}
                          />
                          <InventoryStatCard
                            title={agentText(
                              "agentChat.harness.generated.21593b807a",
                              "MCP",
                            )}
                            value={`${toolInventory.counts.mcp_tool_visible_total}`}
                            hint={`服务 ${toolInventory.counts.mcp_server_total} · 工具 ${toolInventory.counts.mcp_tool_total}`}
                          />
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3">
                          {(
                            [
                              ["default", "默认策略"],
                              ["persisted", "持久化覆盖"],
                              ["runtime", "运行时覆盖"],
                            ] as Array<[AgentToolExecutionPolicySource, string]>
                          ).map(([source, label]) => (
                            <InventoryStatCard
                              key={source}
                              title={label}
                              value={`${toolInventorySourceStats[source]}`}
                              hint="按 warning / restriction / sandbox 三字段累计"
                            />
                          ))}
                        </div>

                        {toolInventoryWarnings.length > 0 ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                            <div className="text-sm font-medium text-amber-900">
                              {agentText(
                                "agentChat.harness.generated.9dd4dc2098",
                                "库存告警",
                              )}
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-amber-800">
                              {toolInventoryWarnings.map((warning, index) => (
                                <div key={`${warning}-${index}`}>{warning}</div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {toolInventory ? (
                          <div
                            className="space-y-3"
                            data-testid="harness-runtime-tool-capability-summary"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-medium text-foreground">
                                {agentText(
                                  "agentChat.harness.generated.b8f1306458",
                                  "Runtime 能力摘要",
                                )}
                              </div>
                              <Badge
                                variant={
                                  runtimeToolAvailability.known
                                    ? "secondary"
                                    : "outline"
                                }
                                data-testid="harness-runtime-tool-capability-source"
                              >
                                {runtimeToolAvailability.known
                                  ? `来源 ${formatRuntimeToolAvailabilitySourceLabel(
                                      runtimeToolAvailability.source,
                                    )}`
                                  : "Runtime 工具面未就绪"}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant={
                                  runtimeToolAvailability.webSearch
                                    ? "secondary"
                                    : "outline"
                                }
                                data-testid="harness-runtime-tool-capability-web-search"
                              >
                                {runtimeToolAvailability.webSearch
                                  ? "WebSearch 已接通"
                                  : "WebSearch 未接通"}
                              </Badge>
                              <Badge
                                variant={
                                  runtimeToolAvailability.subagentCore
                                    ? "secondary"
                                    : "outline"
                                }
                                data-testid="harness-runtime-tool-capability-subagent-core"
                              >
                                {runtimeToolAvailability.subagentCore
                                  ? "子任务核心 tools 已接通"
                                  : `子任务核心 tools 缺 ${runtimeToolAvailability.missingSubagentCoreTools.length} 项`}
                              </Badge>
                              <Badge
                                variant={
                                  runtimeToolAvailability.subagentTeamTools
                                    ? "secondary"
                                    : "outline"
                                }
                                data-testid="harness-runtime-tool-capability-team"
                              >
                                {runtimeToolAvailability.subagentTeamTools
                                  ? "Team current tools 已接通"
                                  : `Team current tools 缺 ${runtimeToolAvailability.missingSubagentTeamTools.length} 项`}
                              </Badge>
                              <Badge
                                variant={
                                  runtimeToolAvailability.taskRuntime
                                    ? "secondary"
                                    : "outline"
                                }
                                data-testid="harness-runtime-tool-capability-task"
                              >
                                {runtimeToolAvailability.taskRuntime
                                  ? "Task current tools 已接通"
                                  : `Task current tools 缺 ${runtimeToolAvailability.missingTaskTools.length} 项`}
                              </Badge>
                            </div>
                            {runtimeToolAvailability.known ? (
                              runtimeToolCapabilityGaps.length > 0 ? (
                                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                                  <div className="font-medium text-foreground">
                                    {agentText(
                                      "agentChat.harness.generated.ab8deade1a",
                                      "当前 runtime current surface 仍有缺口",
                                    )}
                                  </div>
                                  <div className="mt-2 space-y-2">
                                    {runtimeToolCapabilityGaps.map((gap) => (
                                      <div key={gap.key}>
                                        <span className="font-medium text-foreground">
                                          {gap.title}
                                        </span>
                                        <span>：</span>
                                        <span>{gap.missing.join(" / ")}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3 text-sm text-emerald-900">
                                  {agentText(
                                    "agentChat.harness.generated.ff5e6ffa0a",
                                    "当前 runtime current surface 已覆盖 WebSearch、子任务、Team 与 Task 主链。",
                                  )}
                                </div>
                              )
                            ) : (
                              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                                {agentText(
                                  "agentChat.harness.generated.9ef6c1f213",
                                  "当前 inventory 尚未提供可用 runtime tool surface，暂时只能回看 registry/raw inventory。",
                                )}
                              </div>
                            )}
                          </div>
                        ) : null}

                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-foreground">
                              {agentText(
                                "agentChat.harness.generated.37e40f8034",
                                "实际 Runtime 工具面",
                              )}
                            </div>
                            <Badge variant="secondary">
                              {runtimeToolVisibleTotal} / {runtimeToolTotal}
                            </Badge>
                          </div>
                          {toolInventoryRuntimeTools.length > 0 ? (
                            toolInventoryRuntimeTools.map((entry) => (
                              <div
                                key={`${entry.source_kind}:${entry.name}`}
                                className="rounded-xl border border-border bg-background p-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">
                                    {entry.name}
                                  </span>
                                  <Badge variant="outline">
                                    {formatRuntimeToolSourceKindLabel(
                                      entry.source_kind,
                                    )}
                                  </Badge>
                                  {entry.source_label ? (
                                    <Badge variant="outline">
                                      {entry.source_label}
                                    </Badge>
                                  ) : null}
                                  {entry.status ? (
                                    <Badge variant="outline">
                                      {entry.status}
                                    </Badge>
                                  ) : null}
                                  {entry.visible_in_context ? (
                                    <Badge variant="secondary">
                                      {agentText(
                                        "agentChat.harness.generated.87dfd0b2c8",
                                        "上下文可见",
                                      )}
                                    </Badge>
                                  ) : null}
                                  {entry.deferred_loading ? (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.714ae55e88",
                                        "Deferred",
                                      )}
                                    </Badge>
                                  ) : null}
                                  {!entry.caller_allowed ? (
                                    <Badge variant="destructive">
                                      {agentText(
                                        "agentChat.harness.generated.8a1c797eb2",
                                        "Caller 拒绝",
                                      )}
                                    </Badge>
                                  ) : null}
                                  {entry.catalog_entry_name ? (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.43353e0245",
                                        "映射",
                                      )}
                                      {entry.catalog_entry_name}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {entry.description}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  {entry.allowed_callers.length > 0 ? (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.e8835d1775",
                                        "callers：",
                                      )}
                                      {entry.allowed_callers.join(", ")}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.1ba5809394",
                                        "callers：全部",
                                      )}
                                    </Badge>
                                  )}
                                  {entry.always_visible ? (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.6aec99f141",
                                        "Always Visible",
                                      )}
                                    </Badge>
                                  ) : null}
                                  <Badge variant="outline">
                                    {agentText(
                                      "agentChat.harness.generated.d434319af0",
                                      "input_examples：",
                                    )}
                                    {entry.input_examples_count}
                                  </Badge>
                                  {entry.tags.map((tag) => (
                                    <Badge
                                      key={`${entry.name}-${entry.source_kind}-${tag}`}
                                      variant="outline"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                              {agentText(
                                "agentChat.harness.generated.27cc47a711",
                                "当前尚未构建统一 runtime 工具面。",
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-foreground">
                              {agentText(
                                "agentChat.harness.generated.c6670bdd88",
                                "Catalog 工具",
                              )}
                            </div>
                            <Badge variant="secondary">
                              {filteredCatalogTools.length} /{" "}
                              {toolInventoryCatalogTools.length}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { value: "all" as const, label: "全部" },
                              {
                                value: "runtime" as const,
                                label: "运行时覆盖",
                              },
                              {
                                value: "persisted" as const,
                                label: "持久化覆盖",
                              },
                              { value: "default" as const, label: "纯默认" },
                            ].map((option) => {
                              const active =
                                option.value === toolInventoryFilter;
                              const count = countCatalogToolsByInventoryFilter(
                                toolInventoryCatalogTools,
                                option.value,
                              );

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={cn(
                                    "rounded-full border px-3 py-1 text-xs transition-colors",
                                    active
                                      ? "border-primary bg-primary/10 text-foreground"
                                      : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                  )}
                                  onClick={() =>
                                    setToolInventoryFilter(option.value)
                                  }
                                  aria-pressed={active}
                                  aria-label={`工具库存筛选：${option.label}`}
                                >
                                  {option.label} {count}
                                </button>
                              );
                            })}
                          </div>

                          {filteredCatalogTools.length > 0 ? (
                            filteredCatalogTools.map((entry) => (
                              <div
                                key={entry.name}
                                className="rounded-xl border border-border bg-background p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-medium text-foreground">
                                        {entry.name}
                                      </span>
                                      <Badge variant="outline">
                                        {formatToolLifecycleLabel(
                                          entry.lifecycle,
                                        )}
                                      </Badge>
                                      <Badge variant="outline">
                                        {formatToolSourceKindLabel(
                                          entry.source,
                                        )}
                                      </Badge>
                                      <Badge variant="outline">
                                        {formatToolPermissionPlaneLabel(
                                          entry.permission_plane,
                                        )}
                                      </Badge>
                                      {entry.workspace_default_allow ? (
                                        <Badge variant="secondary">
                                          {agentText(
                                            "agentChat.harness.generated.e58fb44bb8",
                                            "默认允许",
                                          )}
                                        </Badge>
                                      ) : null}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                      {entry.profiles.map((profile) => (
                                        <Badge
                                          key={`${entry.name}-${profile}`}
                                          variant="outline"
                                        >
                                          {profile}
                                        </Badge>
                                      ))}
                                      {entry.capabilities.map((capability) => (
                                        <Badge
                                          key={`${entry.name}-${capability}`}
                                          variant="outline"
                                        >
                                          {capability}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 grid gap-2 xl:grid-cols-3">
                                  <div className="rounded-lg bg-muted/50 p-2">
                                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                      {agentText(
                                        "agentChat.harness.generated.e9c4556335",
                                        "Warning",
                                      )}
                                    </div>
                                    <div className="mt-1 text-sm text-foreground">
                                      {formatExecutionWarningPolicyLabel(
                                        entry.execution_warning_policy,
                                      )}
                                    </div>
                                    <div className="mt-2">
                                      <Badge
                                        variant={resolveExecutionSourceVariant(
                                          entry.execution_warning_policy_source,
                                        )}
                                      >
                                        {formatExecutionSourceLabel(
                                          entry.execution_warning_policy_source,
                                        )}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="rounded-lg bg-muted/50 p-2">
                                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                      {agentText(
                                        "agentChat.harness.generated.5de5861112",
                                        "Restriction",
                                      )}
                                    </div>
                                    <div className="mt-1 text-sm text-foreground">
                                      {formatExecutionRestrictionProfileLabel(
                                        entry.execution_restriction_profile,
                                      )}
                                    </div>
                                    <div className="mt-2">
                                      <Badge
                                        variant={resolveExecutionSourceVariant(
                                          entry.execution_restriction_profile_source,
                                        )}
                                      >
                                        {formatExecutionSourceLabel(
                                          entry.execution_restriction_profile_source,
                                        )}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="rounded-lg bg-muted/50 p-2">
                                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                      {agentText(
                                        "agentChat.harness.generated.0a771c36be",
                                        "Sandbox",
                                      )}
                                    </div>
                                    <div className="mt-1 text-sm text-foreground">
                                      {formatExecutionSandboxProfileLabel(
                                        entry.execution_sandbox_profile,
                                      )}
                                    </div>
                                    <div className="mt-2">
                                      <Badge
                                        variant={resolveExecutionSourceVariant(
                                          entry.execution_sandbox_profile_source,
                                        )}
                                      >
                                        {formatExecutionSourceLabel(
                                          entry.execution_sandbox_profile_source,
                                        )}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                              {agentText(
                                "agentChat.harness.generated.e3271612de",
                                "当前筛选条件下暂无 catalog 工具。",
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="text-sm font-medium text-foreground">
                            {agentText(
                              "agentChat.harness.generated.bf99f1197c",
                              "Runtime Registry",
                            )}
                          </div>
                          {toolInventoryRegistryTools.length > 0 ? (
                            toolInventoryRegistryTools.map((entry) => (
                              <div
                                key={entry.name}
                                className="rounded-xl border border-border bg-background p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-medium text-foreground">
                                        {entry.name}
                                      </span>
                                      {entry.catalog_entry_name ? (
                                        <Badge variant="outline">
                                          {agentText(
                                            "agentChat.harness.generated.43353e0245",
                                            "映射",
                                          )}
                                          {entry.catalog_entry_name}
                                        </Badge>
                                      ) : (
                                        <Badge variant="destructive">
                                          {agentText(
                                            "agentChat.harness.generated.8ff2d94cfe",
                                            "未映射 catalog",
                                          )}
                                        </Badge>
                                      )}
                                      {entry.visible_in_context ? (
                                        <Badge variant="secondary">
                                          {agentText(
                                            "agentChat.harness.generated.87dfd0b2c8",
                                            "上下文可见",
                                          )}
                                        </Badge>
                                      ) : null}
                                      {entry.deferred_loading ? (
                                        <Badge variant="outline">
                                          {agentText(
                                            "agentChat.harness.generated.714ae55e88",
                                            "Deferred",
                                          )}
                                        </Badge>
                                      ) : null}
                                      {!entry.caller_allowed ? (
                                        <Badge variant="destructive">
                                          {agentText(
                                            "agentChat.harness.generated.8a1c797eb2",
                                            "Caller 拒绝",
                                          )}
                                        </Badge>
                                      ) : null}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {entry.description}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                      {entry.allowed_callers.length > 0 ? (
                                        <Badge variant="outline">
                                          {agentText(
                                            "agentChat.harness.generated.e8835d1775",
                                            "callers：",
                                          )}
                                          {entry.allowed_callers.join(", ")}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline">
                                          {agentText(
                                            "agentChat.harness.generated.1ba5809394",
                                            "callers：全部",
                                          )}
                                        </Badge>
                                      )}
                                      {entry.tags.map((tag) => (
                                        <Badge
                                          key={`${entry.name}-${tag}`}
                                          variant="outline"
                                        >
                                          {tag}
                                        </Badge>
                                      ))}
                                      <Badge variant="outline">
                                        {agentText(
                                          "agentChat.harness.generated.d434319af0",
                                          "input_examples：",
                                        )}
                                        {entry.input_examples_count}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>

                                {collectRegistryExecutionSources(entry).length >
                                0 ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {entry.catalog_execution_warning_policy &&
                                    entry.catalog_execution_warning_policy_source ? (
                                      <Badge
                                        variant={resolveExecutionSourceVariant(
                                          entry.catalog_execution_warning_policy_source,
                                        )}
                                      >
                                        {agentText(
                                          "agentChat.harness.generated.3ec66d862b",
                                          "Warning：",
                                        )}
                                        {formatExecutionSourceLabel(
                                          entry.catalog_execution_warning_policy_source,
                                        )}
                                      </Badge>
                                    ) : null}
                                    {entry.catalog_execution_restriction_profile &&
                                    entry.catalog_execution_restriction_profile_source ? (
                                      <Badge
                                        variant={resolveExecutionSourceVariant(
                                          entry.catalog_execution_restriction_profile_source,
                                        )}
                                      >
                                        {agentText(
                                          "agentChat.harness.generated.8624f470d1",
                                          "Restriction：",
                                        )}
                                        {formatExecutionSourceLabel(
                                          entry.catalog_execution_restriction_profile_source,
                                        )}
                                      </Badge>
                                    ) : null}
                                    {entry.catalog_execution_sandbox_profile &&
                                    entry.catalog_execution_sandbox_profile_source ? (
                                      <Badge
                                        variant={resolveExecutionSourceVariant(
                                          entry.catalog_execution_sandbox_profile_source,
                                        )}
                                      >
                                        {agentText(
                                          "agentChat.harness.generated.9a6d423d73",
                                          "Sandbox：",
                                        )}
                                        {formatExecutionSourceLabel(
                                          entry.catalog_execution_sandbox_profile_source,
                                        )}
                                      </Badge>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ))
                          ) : (
                            <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                              {agentText(
                                "agentChat.harness.generated.421a99f0ff",
                                "当前 runtime registry 为空。",
                              )}
                            </div>
                          )}
                        </div>

                        {toolInventoryExtensionSurfaces.length > 0 ? (
                          <div className="space-y-3">
                            <div className="text-sm font-medium text-foreground">
                              {agentText(
                                "agentChat.harness.generated.0fec57f640",
                                "Extension Surfaces",
                              )}
                            </div>
                            {toolInventoryExtensionSurfaces.map((entry) => (
                              <div
                                key={entry.extension_name}
                                className="rounded-xl border border-border bg-background p-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">
                                    {entry.extension_name}
                                  </span>
                                  <Badge variant="outline">
                                    {formatExtensionSourceKindLabel(
                                      entry.source_kind,
                                    )}
                                  </Badge>
                                  {entry.deferred_loading ? (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.714ae55e88",
                                        "Deferred",
                                      )}
                                    </Badge>
                                  ) : null}
                                  {entry.allowed_caller ? (
                                    <Badge variant="secondary">
                                      {agentText(
                                        "agentChat.harness.generated.82aec0037c",
                                        "caller：",
                                      )}
                                      {entry.allowed_caller}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {entry.description}
                                </div>
                                <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                                  <div>
                                    {agentText(
                                      "agentChat.harness.generated.9f11b02c89",
                                      "可用工具：",
                                    )}
                                    {entry.available_tools.length}
                                  </div>
                                  <div>
                                    {agentText(
                                      "agentChat.harness.generated.6dc2d6edaa",
                                      "常驻工具：",
                                    )}
                                    {entry.always_expose_tools.length}
                                  </div>
                                  <div>
                                    {agentText(
                                      "agentChat.harness.generated.809f7ca51e",
                                      "已加载：",
                                    )}
                                    {entry.loaded_tools.length}
                                  </div>
                                  <div>
                                    {agentText(
                                      "agentChat.harness.generated.baf59a0b05",
                                      "可搜索：",
                                    )}
                                    {entry.searchable_tools.length}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {toolInventoryExtensionTools.length > 0 ? (
                          <div className="space-y-3">
                            <div className="text-sm font-medium text-foreground">
                              {agentText(
                                "agentChat.harness.generated.d2f47a899a",
                                "Extension Tools",
                              )}
                            </div>
                            {toolInventoryExtensionTools.map((entry) => (
                              <div
                                key={entry.name}
                                className="rounded-xl border border-border bg-background p-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">
                                    {entry.name}
                                  </span>
                                  <Badge variant="outline">
                                    {entry.status}
                                  </Badge>
                                  <Badge variant="outline">
                                    {formatExtensionSourceKindLabel(
                                      entry.source_kind,
                                    )}
                                  </Badge>
                                  {entry.visible_in_context ? (
                                    <Badge variant="secondary">
                                      {agentText(
                                        "agentChat.harness.generated.87dfd0b2c8",
                                        "上下文可见",
                                      )}
                                    </Badge>
                                  ) : null}
                                  {!entry.caller_allowed ? (
                                    <Badge variant="destructive">
                                      {agentText(
                                        "agentChat.harness.generated.8a1c797eb2",
                                        "Caller 拒绝",
                                      )}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  {entry.extension_name ? (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.81ca3b433b",
                                        "extension：",
                                      )}
                                      {entry.extension_name}
                                    </Badge>
                                  ) : null}
                                  {entry.allowed_caller ? (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.82aec0037c",
                                        "caller：",
                                      )}
                                      {entry.allowed_caller}
                                    </Badge>
                                  ) : null}
                                  {entry.deferred_loading ? (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.714ae55e88",
                                        "Deferred",
                                      )}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {entry.description}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {toolInventoryMcpTools.length > 0 ? (
                          <div className="space-y-3">
                            <div className="text-sm font-medium text-foreground">
                              {agentText(
                                "agentChat.harness.generated.1fa4eaed37",
                                "MCP Tools",
                              )}
                            </div>
                            {toolInventoryMcpTools.map((entry) => (
                              <div
                                key={`${entry.server_name}:${entry.name}`}
                                className="rounded-xl border border-border bg-background p-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">
                                    {getMcpInnerToolName(
                                      entry.name,
                                      entry.server_name,
                                    )}
                                  </span>
                                  <Badge variant="outline">
                                    {entry.server_name}
                                  </Badge>
                                  {entry.visible_in_context ? (
                                    <Badge variant="secondary">
                                      {agentText(
                                        "agentChat.harness.generated.87dfd0b2c8",
                                        "上下文可见",
                                      )}
                                    </Badge>
                                  ) : null}
                                  {entry.always_visible ? (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.6aec99f141",
                                        "Always Visible",
                                      )}
                                    </Badge>
                                  ) : null}
                                  {entry.deferred_loading ? (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.714ae55e88",
                                        "Deferred",
                                      )}
                                    </Badge>
                                  ) : null}
                                  {!entry.caller_allowed ? (
                                    <Badge variant="destructive">
                                      {agentText(
                                        "agentChat.harness.generated.8a1c797eb2",
                                        "Caller 拒绝",
                                      )}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {entry.description}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  {entry.allowed_callers.length > 0 ? (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.e8835d1775",
                                        "callers：",
                                      )}
                                      {entry.allowed_callers.join(", ")}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">
                                      {agentText(
                                        "agentChat.harness.generated.1ba5809394",
                                        "callers：全部",
                                      )}
                                    </Badge>
                                  )}
                                  {entry.tags.map((tag) => (
                                    <Badge
                                      key={`${entry.server_name}:${entry.name}:${tag}`}
                                      variant="outline"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                  <Badge variant="outline">
                                    {agentText(
                                      "agentChat.harness.generated.d434319af0",
                                      "input_examples：",
                                    )}
                                    {entry.input_examples_count}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : !toolInventoryLoading && !toolInventoryError ? (
                      <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                        {agentText(
                          "agentChat.harness.generated.1f864fb681",
                          "当前尚未拿到工具库存快照。",
                        )}
                      </div>
                    ) : null}
                  </div>
                </Section>
              ) : null}

              {harnessState.pendingApprovals.length > 0 ? (
                <Section
                  sectionKey="approvals"
                  title={agentText(
                    "agentChat.harness.generated.e862f8292d",
                    "待处理审批",
                  )}
                  badge={`${harnessState.pendingApprovals.length} 条`}
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3">
                    {harnessState.pendingApprovals.map((item) => {
                      const approvalPath = pickPathFromArguments(
                        item.arguments,
                      );
                      const approvalCommand = pickCommandFromArguments(
                        item.arguments,
                      );
                      const approvalSummary = describeApproval(item);
                      const riskKind = resolveApprovalRiskKind(item);
                      const approvalTarget =
                        approvalSummary || item.toolName || item.requestId;
                      const canInlineRespond =
                        item.actionType === "tool_confirmation" &&
                        Boolean(onRespondToAction);
                      const approvalSubmitting =
                        submittedActionIds.has(item.requestId) ||
                        item.status === "submitted";
                      const approvalOutcomeHint = (
                        <div
                          className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2 text-xs leading-5 text-amber-800"
                          data-testid="harness-approval-outcome-hint"
                        >
                          {String(
                            t(
                              "agentChat.harness.approvals.outcomeHint" as never,
                            ),
                          )}
                        </div>
                      );

                      return (
                        <div
                          key={item.requestId}
                          className="rounded-xl border border-amber-200 bg-amber-50/80 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-sm font-medium text-amber-950">
                                <ShieldAlert className="h-4 w-4 shrink-0" />
                                <InteractiveText
                                  text={
                                    item.prompt ||
                                    String(
                                      t(
                                        "agentChat.harness.approvals.waiting" as never,
                                      ),
                                    )
                                  }
                                  className="text-sm"
                                  onOpenUrl={handleOpenExternalLink}
                                />
                              </div>
                            </div>
                            <Badge variant="secondary">
                              {String(
                                t(resolveApprovalActionLabelKey(item) as never),
                              )}
                            </Badge>
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <div className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2">
                              <div className="text-[11px] font-medium text-amber-950">
                                {String(
                                  t(
                                    "agentChat.harness.approvals.impactScope" as never,
                                  ),
                                )}
                              </div>
                              {approvalPath ? (
                                <PathTextLink
                                  path={approvalPath}
                                  className="mt-1 text-xs"
                                  onOpenPath={handleOpenPathValue}
                                />
                              ) : approvalCommand ? (
                                <InteractiveText
                                  text={approvalCommand}
                                  mono={true}
                                  className="mt-1 text-xs text-amber-900"
                                  onOpenUrl={handleOpenExternalLink}
                                />
                              ) : (
                                <div className="mt-1 text-xs text-amber-800">
                                  {String(
                                    t(
                                      "agentChat.harness.approvals.scope.currentRun" as never,
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2">
                              <div className="text-[11px] font-medium text-amber-950">
                                {String(
                                  t(
                                    "agentChat.harness.approvals.riskTitle" as never,
                                  ),
                                )}
                              </div>
                              <div className="mt-1 text-xs text-amber-800">
                                {String(
                                  t(
                                    APPROVAL_RISK_LABEL_KEY_BY_KIND[
                                      riskKind
                                    ] as never,
                                  ),
                                )}
                              </div>
                            </div>
                          </div>
                          {approvalSummary ? (
                            <div className="mt-3 rounded-lg bg-amber-100/60 px-3 py-2">
                              <div className="text-[11px] font-medium text-amber-950">
                                {String(
                                  t(
                                    "agentChat.harness.approvals.argumentSummary" as never,
                                  ),
                                )}
                              </div>
                              <InteractiveText
                                text={approvalSummary}
                                className="mt-1 text-xs text-amber-800"
                                onOpenUrl={handleOpenExternalLink}
                              />
                            </div>
                          ) : null}
                          <div className="mt-2 text-xs text-amber-700">
                            {String(
                              t(
                                "agentChat.harness.approvals.requestRef" as never,
                                { id: item.requestId } as never,
                              ),
                            )}
                          </div>
                          {canInlineRespond ? (
                            <div className="mt-3 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={approvalSubmitting}
                                  aria-label={String(
                                    t(
                                      "agentChat.harness.approvals.approveAria" as never,
                                      { target: approvalTarget } as never,
                                    ),
                                  )}
                                  onClick={() =>
                                    handleApprovalResponse(item, true)
                                  }
                                >
                                  {approvalSubmitting ? (
                                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="mr-1 h-4 w-4" />
                                  )}
                                  {String(
                                    t(
                                      approvalSubmitting
                                        ? ("agentChat.harness.approvals.submitting" as never)
                                        : ("agentChat.harness.approvals.approve" as never),
                                    ),
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={approvalSubmitting}
                                  aria-label={String(
                                    t(
                                      "agentChat.harness.approvals.rejectAria" as never,
                                      { target: approvalTarget } as never,
                                    ),
                                  )}
                                  onClick={() =>
                                    handleApprovalResponse(item, false)
                                  }
                                >
                                  <XCircle className="mr-1 h-4 w-4" />
                                  {String(
                                    t(
                                      "agentChat.harness.approvals.reject" as never,
                                    ),
                                  )}
                                </Button>
                              </div>
                              {approvalOutcomeHint}
                            </div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              <div className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2 text-xs text-amber-800">
                                {String(
                                  t(
                                    "agentChat.harness.approvals.responseHint" as never,
                                  ),
                                )}
                              </div>
                              {approvalOutcomeHint}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Section>
              ) : null}

              {harnessState.recentFileEvents.length > 0 ? (
                <Section
                  sectionKey="files"
                  title={agentText(
                    "agentChat.harness.generated.45a433f860",
                    "最近文件活动",
                  )}
                  badge={
                    fileDisplayMode === "grouped"
                      ? `${groupedFileEvents.length} 个文件 / ${filteredFileEvents.length} 条`
                      : filteredFileEvents.length ===
                          harnessState.recentFileEvents.length
                        ? `${harnessState.recentFileEvents.length} 条`
                        : `${filteredFileEvents.length} / ${harnessState.recentFileEvents.length} 条`
                  }
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        {fileFilterOptions.map((option) => {
                          const count =
                            option.value === "all"
                              ? harnessState.recentFileEvents.length
                              : harnessState.recentFileEvents.filter(
                                  (event) => event.kind === option.value,
                                ).length;
                          const active = option.value === fileFilter;

                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={cn(
                                "rounded-full border px-3 py-1 text-xs transition-colors",
                                active
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                              )}
                              onClick={() => setFileFilter(option.value)}
                              aria-pressed={active}
                              aria-label={`文件活动筛选：${option.label}`}
                            >
                              {option.label} {count}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: "timeline" as const, label: "时间流" },
                          { value: "grouped" as const, label: "按文件" },
                        ].map((option) => {
                          const active = option.value === fileDisplayMode;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={cn(
                                "rounded-full border px-3 py-1 text-xs transition-colors",
                                active
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                              )}
                              onClick={() => setFileDisplayMode(option.value)}
                              aria-pressed={active}
                              aria-label={`文件视图：${option.label}`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {filteredFileEvents.length > 0 ? (
                      fileDisplayMode === "grouped" ? (
                        groupedFileEvents.map((group) => {
                          const latestEvent = group.latestEvent;
                          const Icon = resolveKindIcon(group.kind);
                          return (
                            <button
                              key={group.key}
                              type="button"
                              className="w-full rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/60"
                              onClick={() =>
                                void openPreview({
                                  title: latestEvent.displayName,
                                  description: joinDisplayParts([
                                    describeAction(latestEvent.action),
                                    describeKind(group.kind),
                                    resolveFriendlyToolLabel(
                                      latestEvent.sourceToolName,
                                    ) || latestEvent.sourceToolName,
                                  ]),
                                  path: latestEvent.path,
                                  content: latestEvent.content,
                                  preview: latestEvent.preview,
                                })
                              }
                              aria-label={`查看聚合文件活动：${group.displayName}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                    <span className="truncate text-sm font-medium text-foreground">
                                      {group.displayName}
                                    </span>
                                  </div>
                                  <PathTextLink
                                    path={group.path}
                                    className="mt-1 text-xs"
                                    stopPropagation={true}
                                    onOpenPath={handleOpenPathValue}
                                  />
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Badge variant="outline">
                                    {group.count}{" "}
                                    {agentText(
                                      "agentChat.harness.generated.38c39c83cd",
                                      "次活动",
                                    )}
                                  </Badge>
                                  <Badge variant="secondary">
                                    {describeKind(group.kind)}
                                  </Badge>
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Clock3 className="h-3.5 w-3.5" />
                                <span>{formatTime(latestEvent.timestamp)}</span>
                                <span>·</span>
                                <span>
                                  {agentText(
                                    "agentChat.harness.generated.8c73d90eca",
                                    "最近",
                                  )}
                                  {describeAction(latestEvent.action)}
                                </span>
                                <span>·</span>
                                <span>{group.actionSummary}</span>
                              </div>
                              {latestEvent.preview ? (
                                <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                                  <InteractiveText
                                    text={latestEvent.preview}
                                    mono={true}
                                    stopPropagation={true}
                                    onOpenUrl={handleOpenExternalLink}
                                  />
                                </div>
                              ) : null}
                            </button>
                          );
                        })
                      ) : (
                        filteredFileEvents.map((event) => {
                          const Icon = resolveKindIcon(event.kind);
                          return (
                            <button
                              key={event.id}
                              type="button"
                              className="w-full rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/60"
                              onClick={() =>
                                void openPreview({
                                  title: event.displayName,
                                  description: joinDisplayParts([
                                    describeAction(event.action),
                                    describeKind(event.kind),
                                    resolveFriendlyToolLabel(
                                      event.sourceToolName,
                                    ) || event.sourceToolName,
                                  ]),
                                  path: event.path,
                                  content: event.content,
                                  preview: event.preview,
                                })
                              }
                              aria-label={`查看文件活动：${event.displayName}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                    <span className="truncate text-sm font-medium text-foreground">
                                      {event.displayName}
                                    </span>
                                  </div>
                                  <PathTextLink
                                    path={event.path}
                                    className="mt-1 text-xs"
                                    stopPropagation={true}
                                    onOpenPath={handleOpenPathValue}
                                  />
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Badge variant="outline">
                                    {describeAction(event.action)}
                                  </Badge>
                                  <Badge variant="secondary">
                                    {describeKind(event.kind)}
                                  </Badge>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock3 className="h-3.5 w-3.5" />
                                <span>{formatTime(event.timestamp)}</span>
                                <span>·</span>
                                <span>
                                  {resolveFriendlyToolLabel(
                                    event.sourceToolName,
                                  ) || event.sourceToolName}
                                </span>
                              </div>
                              {event.preview ? (
                                <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                                  <InteractiveText
                                    text={event.preview}
                                    mono={true}
                                    stopPropagation={true}
                                    onOpenUrl={handleOpenExternalLink}
                                  />
                                </div>
                              ) : null}
                            </button>
                          );
                        })
                      )
                    ) : (
                      <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                        {agentText(
                          "agentChat.harness.generated.1146635328",
                          "当前筛选条件下暂无记录。",
                        )}
                      </div>
                    )}
                  </div>
                </Section>
              ) : null}

              {harnessState.plan.phase !== "idle" ||
              harnessState.plan.items.length > 0 ? (
                <Section
                  sectionKey="plan"
                  title={agentText(
                    "agentChat.harness.generated.3d801c3537",
                    "规划状态",
                  )}
                  badge={
                    harnessState.plan.phase === "planning"
                      ? "规划中"
                      : harnessState.plan.phase === "ready"
                        ? "已就绪"
                        : "空闲"
                  }
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-2">
                    {harnessState.plan.items.length > 0 ? (
                      harnessState.plan.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                        >
                          <InteractiveText
                            text={item.content}
                            className="min-w-0 text-sm text-foreground"
                            onOpenUrl={handleOpenExternalLink}
                          />
                          <Badge
                            variant={
                              item.status === "completed"
                                ? "secondary"
                                : item.status === "in_progress"
                                  ? "default"
                                  : "outline"
                            }
                          >
                            {item.status === "completed"
                              ? "已完成"
                              : item.status === "in_progress"
                                ? "进行中"
                                : "待开始"}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                        {harnessState.plan.summaryText ||
                          "已进入规划流程，但暂无可展示的 Todo 快照。"}
                      </div>
                    )}
                  </div>
                </Section>
              ) : null}

              {realTeamSummary.total > 0 ||
              harnessState.delegatedTasks.length > 0 ? (
                <Section
                  sectionKey="delegation"
                  title={agentText(
                    "agentChat.harness.generated.2a8ce33ff0",
                    "子任务",
                  )}
                  badge={
                    realTeamSummary.active > 0
                      ? `处理中 ${realTeamSummary.active}`
                      : realTeamSummary.total > 0
                        ? `${realTeamSummary.total} 个子任务`
                        : harnessState.delegatedTasks.length > 0
                          ? `${harnessState.delegatedTasks.length} 条`
                          : undefined
                  }
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3">
                    {realTeamSummary.total > 0 ? (
                      <div className="rounded-xl border border-border bg-background p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-foreground">
                            {agentText(
                              "agentChat.harness.generated.2e18241824",
                              "当前子任务",
                            )}
                          </div>
                          <Badge variant="outline">
                            {realTeamSummary.total}{" "}
                            {agentText(
                              "agentChat.harness.generated.f7b2a6ee68",
                              "个",
                            )}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>
                            {agentText(
                              "agentChat.harness.generated.fcb979ef0b",
                              "处理中",
                            )}
                            {realTeamSummary.running}
                          </span>
                          <span>
                            {agentText(
                              "agentChat.harness.generated.bd3488d0a9",
                              "等待中",
                            )}
                            {realTeamSummary.queued}
                          </span>
                          <span>
                            {agentText(
                              "agentChat.harness.generated.e99b48a29b",
                              "已完成",
                            )}
                            {realTeamSummary.settled}
                          </span>
                          <span>
                            {agentText(
                              "agentChat.harness.generated.ed5909bac1",
                              "需处理",
                            )}
                            {realTeamSummary.failed}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {harnessState.delegatedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-xl border border-border bg-background p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4 text-muted-foreground" />
                              <span className="truncate text-sm font-medium text-foreground">
                                {task.title}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              {task.role ? (
                                <span>
                                  {agentText(
                                    "agentChat.harness.generated.908a9f1d6a",
                                    "角色：",
                                  )}
                                  {task.role}
                                </span>
                              ) : null}
                              {task.taskType ? (
                                <span>
                                  {agentText(
                                    "agentChat.harness.generated.8f3e9e1fe7",
                                    "类型：",
                                  )}
                                  {task.taskType}
                                </span>
                              ) : null}
                              {task.model ? (
                                <span>
                                  {agentText(
                                    "agentChat.harness.generated.7ac64a2b44",
                                    "模型：",
                                  )}
                                  {task.model}
                                </span>
                              ) : null}
                            </div>
                            {task.summary ? (
                              <InteractiveText
                                text={task.summary}
                                className="mt-2 text-xs text-muted-foreground"
                                onOpenUrl={handleOpenExternalLink}
                              />
                            ) : null}
                          </div>
                          <Badge
                            variant={
                              task.status === "completed"
                                ? "secondary"
                                : task.status === "running"
                                  ? "default"
                                  : "destructive"
                            }
                          >
                            {task.status === "completed"
                              ? "已完成"
                              : task.status === "running"
                                ? "处理中"
                                : "失败"}
                          </Badge>
                        </div>
                      </div>
                    ))}

                    {childSubagentSessions.length > 0 ? (
                      <div className="space-y-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          {agentText(
                            "agentChat.harness.generated.f4b507ed0d",
                            "实时子任务",
                          )}
                        </div>
                        {childSubagentSessions.map((session) => (
                          <div
                            key={session.id}
                            className="rounded-xl border border-border bg-background p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <Workflow className="h-4 w-4 text-muted-foreground" />
                                  <span className="truncate text-sm font-medium text-foreground">
                                    {session.name}
                                  </span>
                                  <Badge
                                    variant={resolveSubagentRuntimeStatusVariant(
                                      session.runtime_status,
                                    )}
                                  >
                                    {resolveSubagentRuntimeStatusLabel(
                                      session.runtime_status,
                                    )}
                                  </Badge>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <span>
                                    {agentText(
                                      "agentChat.harness.generated.8f3e9e1fe7",
                                      "类型：",
                                    )}
                                    {resolveSubagentSessionTypeLabel(
                                      session.session_type,
                                    )}
                                  </span>
                                  {session.role_hint ? (
                                    <span>
                                      {agentText(
                                        "agentChat.harness.generated.908a9f1d6a",
                                        "角色：",
                                      )}
                                      {session.role_hint}
                                    </span>
                                  ) : null}
                                  {session.model ? (
                                    <span>
                                      {agentText(
                                        "agentChat.harness.generated.7ac64a2b44",
                                        "模型：",
                                      )}
                                      {session.model}
                                    </span>
                                  ) : null}
                                  {session.provider_name ? (
                                    <span>
                                      {agentText(
                                        "agentChat.harness.generated.74dd99b7b0",
                                        "提供方：",
                                      )}
                                      {session.provider_name}
                                    </span>
                                  ) : null}
                                  {session.team_parallel_budget !== undefined &&
                                  session.team_active_count !== undefined ? (
                                    <span>
                                      {agentText(
                                        "agentChat.harness.generated.9375445b14",
                                        "处理窗口：",
                                      )}
                                      {session.team_active_count}/
                                      {session.team_parallel_budget}
                                    </span>
                                  ) : null}
                                  {session.provider_parallel_budget === 1 &&
                                  session.provider_concurrency_group ? (
                                    <span>
                                      {resolveTeamWorkspaceStableProcessingLabel()}
                                      {agentText(
                                        "agentChat.harness.generated.d057313512",
                                        "： 当前服务按顺序处理",
                                      )}
                                    </span>
                                  ) : null}
                                  {session.origin_tool ? (
                                    <span>
                                      {agentText(
                                        "agentChat.harness.generated.64b3b59a15",
                                        "来源：",
                                      )}
                                      {resolveFriendlyToolLabel(
                                        session.origin_tool,
                                      ) || session.origin_tool}
                                    </span>
                                  ) : null}
                                  <span>
                                    {agentText(
                                      "agentChat.harness.generated.943f4e3ee6",
                                      "更新：",
                                    )}
                                    {formatUnixTimestamp(session.updated_at)}
                                  </span>
                                </div>
                                {session.task_summary ? (
                                  <InteractiveText
                                    text={session.task_summary}
                                    className="mt-2 text-xs text-muted-foreground"
                                    onOpenUrl={handleOpenExternalLink}
                                  />
                                ) : null}
                                {session.queue_reason ? (
                                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-900">
                                    {session.queue_reason}
                                  </div>
                                ) : null}
                              </div>
                              {onOpenSubagentSession ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    onOpenSubagentSession(session.id)
                                  }
                                >
                                  {agentText(
                                    "agentChat.harness.generated.faea8c1db9",
                                    "查看详情",
                                  )}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Section>
              ) : null}

              {harnessState.latestContextTrace.length > 0 ? (
                <Section
                  sectionKey="context"
                  title={agentText(
                    "agentChat.harness.generated.674960a8f7",
                    "最新上下文轨迹",
                  )}
                  badge={`${harnessState.latestContextTrace.length} 步`}
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-2">
                    {harnessState.latestContextTrace.map((step, index) => (
                      <div
                        key={`${step.stage}-${index}`}
                        className="rounded-lg border border-border bg-background px-3 py-2"
                      >
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Workflow className="h-4 w-4 text-muted-foreground" />
                          <span>{step.stage}</span>
                        </div>
                        <InteractiveText
                          text={step.detail}
                          className="mt-1 text-xs text-muted-foreground"
                          onOpenUrl={handleOpenExternalLink}
                        />
                      </div>
                    ))}
                  </div>
                </Section>
              ) : null}

              {environment.skillsCount > 0 ? (
                <Section
                  sectionKey="capabilities"
                  title={agentText(
                    "agentChat.harness.generated.bc407ad9b5",
                    "已激活技能",
                  )}
                  badge={`${environment.skillsCount} 个技能`}
                  registerRef={registerSectionRef}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {environment.skillNames.map((name) => (
                        <ActionableBadge
                          key={name}
                          variant="secondary"
                          value={name}
                          onOpenUrl={handleOpenExternalLink}
                          onOpenPath={handleOpenPathValue}
                        />
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {environment.memorySignals.length > 0 ? (
                        environment.memorySignals.map((signal) => (
                          <ActionableBadge
                            key={signal}
                            variant="outline"
                            value={signal}
                            onOpenUrl={handleOpenExternalLink}
                            onOpenPath={handleOpenPathValue}
                          />
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {agentText(
                            "agentChat.harness.generated.570b39776f",
                            "当前未识别到持久记忆信号",
                          )}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div>
                        {agentText(
                          "agentChat.harness.generated.680f509d88",
                          "上下文条目：",
                        )}
                        {environment.activeContextCount}/
                        {environment.contextItemsCount}
                      </div>
                      {environment.contextItemNames.length > 0 ? (
                        <div className="space-y-1">
                          <div>
                            {agentText(
                              "agentChat.harness.generated.10460a6f9c",
                              "活跃上下文：",
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {environment.contextItemNames.map((item) => (
                              <ActionableBadge
                                key={item}
                                variant="outline"
                                value={item}
                                onOpenUrl={handleOpenExternalLink}
                                onOpenPath={handleOpenPathValue}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {agentText(
                          "agentChat.harness.generated.6c09b4e917",
                          "规划",
                        )}
                        {harnessState.activity.planning}
                      </Badge>
                      <Badge variant="outline">
                        {agentText(
                          "agentChat.harness.generated.49deaf7da2",
                          "文件",
                        )}
                        {harnessState.activity.filesystem}
                      </Badge>
                      <Badge variant="outline">
                        {agentText(
                          "agentChat.harness.generated.28febba225",
                          "执行",
                        )}
                        {harnessState.activity.execution}
                      </Badge>
                      <Badge variant="outline">
                        {agentText(
                          "agentChat.harness.generated.06caf5dc95",
                          "网页",
                        )}
                        {harnessState.activity.web}
                      </Badge>
                      <Badge variant="outline">
                        {agentText(
                          "agentChat.harness.generated.53da139b6a",
                          "技能",
                        )}
                        {harnessState.activity.skills}
                      </Badge>
                      <Badge variant="outline">
                        {agentText(
                          "agentChat.harness.generated.b78f388086",
                          "委派",
                        )}
                        {harnessState.activity.delegation}
                      </Badge>
                    </div>
                  </div>
                </Section>
              ) : null}
            </div>
          </ScrollArea>
        ) : null}
      </div>

      <RuntimeReviewDecisionDialog
        open={reviewDecisionEditorOpen}
        template={reviewDecisionTemplate}
        saving={reviewDecisionSaving}
        onOpenChange={setReviewDecisionEditorOpen}
        onSave={handleSaveReviewDecision}
      />

      <Dialog
        open={previewDialog.open}
        onOpenChange={(open) =>
          setPreviewDialog((current) => ({
            ...current,
            open,
            loading: open ? current.loading : false,
          }))
        }
      >
        <DialogContent maxWidth="max-w-4xl" className="p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="pr-8">{previewDialog.title}</DialogTitle>
            <DialogDescription className="space-y-1">
              {previewDialog.description ? (
                <InteractiveText
                  text={previewDialog.description}
                  className="block"
                  onOpenUrl={handleOpenExternalLink}
                />
              ) : null}
              {previewDialog.path ? (
                <PathTextLink
                  path={previewDialog.path}
                  className="block text-xs"
                  onOpenPath={handleOpenPathValue}
                />
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{previewDialog.displayName}</Badge>
              {formatSize(previewDialog.size) ? (
                <Badge variant="outline">
                  {formatSize(previewDialog.size)}
                </Badge>
              ) : null}
              {previewDialog.loading ? (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {agentText(
                    "agentChat.harness.generated.995ffb79c5",
                    "正在加载完整内容",
                  )}
                </Badge>
              ) : null}
              {previewDialog.preview &&
              previewDialog.content === previewDialog.preview &&
              !previewDialog.loading ? (
                <Badge variant="outline">
                  {agentText(
                    "agentChat.harness.generated.4d7905b93d",
                    "当前展示为摘要预览",
                  )}
                </Badge>
              ) : null}
            </div>

            <ScrollArea className="max-h-[60vh] rounded-xl border border-border bg-muted/30">
              {previewDialog.artifact ? (
                <div className="h-[58vh] min-h-[360px] bg-background">
                  <ArtifactRenderer
                    artifact={previewDialog.artifact}
                    tone="light"
                    hideToolbar
                  />
                </div>
              ) : previewDialog.isBinary ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                  <HardDriveDownload className="h-4 w-4" />
                  {agentText(
                    "agentChat.harness.generated.bdc2620ca1",
                    "该文件为二进制内容，暂不支持文本预览。",
                  )}
                </div>
              ) : previewDialog.error ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {previewDialog.error}
                </div>
              ) : previewDialog.content ? (
                <div className="px-4 py-4 text-xs leading-6 text-foreground">
                  <InteractiveText
                    text={previewDialog.content}
                    mono={true}
                    onOpenUrl={handleOpenExternalLink}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  {agentText(
                    "agentChat.harness.generated.4579c8c918",
                    "暂无可展示内容",
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            {previewDialog.path ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCopyPath()}
              >
                {agentText(
                  "agentChat.harness.generated.e0c29eaeb3",
                  "复制路径",
                )}
              </Button>
            ) : null}
            {previewDialog.content?.trim() ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCopyContent()}
              >
                {agentText(
                  "agentChat.harness.generated.3aeb16d4b1",
                  "复制内容",
                )}
              </Button>
            ) : null}
            {previewDialog.path ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleRevealPath()}
              >
                {agentText(
                  "agentChat.harness.generated.6cd39eba27",
                  "定位文件",
                )}
              </Button>
            ) : null}
            {previewDialog.path ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleOpenPath()}
              >
                {agentText(
                  "agentChat.harness.generated.e252faadbf",
                  "系统打开",
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setPreviewDialog((current) => ({ ...current, open: false }))
              }
            >
              {agentText("agentChat.harness.generated.6c14bd7f6f", "关闭")}
            </Button>
            {onOpenFile &&
            !previewDialog.isBinary &&
            previewDialog.content?.trim() ? (
              <Button type="button" onClick={handleOpenFile}>
                {agentText(
                  "agentChat.harness.generated.1ac483c406",
                  "在会话中打开",
                )}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
