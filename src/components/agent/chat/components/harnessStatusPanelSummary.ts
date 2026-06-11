import {
  AlertCircle,
  Bot,
  FileText,
  FolderOpen,
  ListChecks,
  Loader2,
  ShieldAlert,
  Sparkles,
  SquareCheckBig,
  Workflow,
  Wrench,
} from "lucide-react";
import type {
  AgentRuntimeEvidencePack,
  AgentRuntimeToolInventory,
} from "@/lib/api/agentRuntime";
import type {
  AgentUiProjectionSummary,
  AgentUiProjectionTranslation,
} from "../projection/agentUiProjectionSummary";
import {
  formatAgentUiProjectionEventType,
  formatAgentUiProjectionPhase,
} from "../projection/agentUiProjectionSummary";
import type { HarnessSessionState } from "../utils/harnessState";
import type { HarnessEnvironmentSummary } from "./HarnessActivityTypes";
import type { HarnessSectionNavItem } from "./HarnessStatusSectionFrame";
import type { HarnessSummaryCard } from "./HarnessStatusPanelTypes";
import {
  formatIsoDateTime,
  type ChildSubagentSessionSummary,
  type FileChangeReviewEntry,
  type RuntimeTaskPresentation,
} from "./harnessStatusPanelViewModel";

interface HarnessFileReviewSummaryCopy {
  title: string;
  summaryValue: string;
  emptyHint: string;
}

interface HarnessThreadReliabilitySummary {
  shouldRender: boolean;
  statusLabel: string;
  summary: string;
}

interface BuildHarnessPanelSectionNavItemsInput {
  environment: HarnessEnvironmentSummary;
  fileChangeReviewEntriesLength: number;
  hasAgentUiProjectionSection: boolean;
  hasHandoffSection: boolean;
  hasSelectedTeamConfig: boolean;
  hasToolInventorySection: boolean;
  harnessState: Pick<
    HarnessSessionState,
    | "activeFileWrites"
    | "delegatedTasks"
    | "latestContextTrace"
    | "outputSignals"
    | "pendingApprovals"
    | "plan"
    | "recentFileEvents"
  >;
  realTeamSummary: ChildSubagentSessionSummary;
  runtimeTaskPresentation: RuntimeTaskPresentation | null;
  threadReliability: HarnessThreadReliabilitySummary;
  fileReviewTitle: string;
}

export function buildHarnessPanelSectionNavItems({
  environment,
  fileChangeReviewEntriesLength,
  hasAgentUiProjectionSection,
  hasHandoffSection,
  hasSelectedTeamConfig,
  hasToolInventorySection,
  harnessState,
  realTeamSummary,
  runtimeTaskPresentation,
  threadReliability,
  fileReviewTitle,
}: BuildHarnessPanelSectionNavItemsInput): HarnessSectionNavItem[] {
  const sections: HarnessSectionNavItem[] = [];

  if (hasSelectedTeamConfig) {
    sections.push({ key: "team_config", label: "Subagents" });
  }

  if (runtimeTaskPresentation) {
    sections.push({ key: "runtime", label: "任务进行时" });
  }
  if (hasAgentUiProjectionSection) {
    sections.push({ key: "agentui", label: "AgentUI 投影" });
  }
  if (hasHandoffSection) {
    sections.push({ key: "handoff", label: "问题证据包" });
  }
  if (threadReliability.shouldRender) {
    sections.push({ key: "reliability", label: "可靠性" });
  }
  if (fileChangeReviewEntriesLength > 0) {
    sections.push({
      key: "file_review",
      label: fileReviewTitle,
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
}

interface BuildHarnessSummaryCardsInput {
  agentUiProjectionSummary: AgentUiProjectionSummary;
  environment: HarnessEnvironmentSummary;
  fileChangeReviewEntries: FileChangeReviewEntry[];
  fileReviewCopy: HarnessFileReviewSummaryCopy;
  evidencePack: AgentRuntimeEvidencePack | null;
  hasAgentUiProjectionSection: boolean;
  hasHandoffSection: boolean;
  hasSelectedTeamConfig: boolean;
  hasToolInventorySection: boolean;
  harnessState: Pick<
    HarnessSessionState,
    "activeFileWrites" | "pendingApprovals" | "plan" | "recentFileEvents"
  >;
  realTeamSummary: ChildSubagentSessionSummary;
  runtimeTaskPresentation: RuntimeTaskPresentation | null;
  runtimeToolTotal: number;
  runtimeToolVisibleTotal: number;
  selectedTeamLabel: string | null;
  selectedTeamRolesCount: number;
  selectedTeamSummary: string | null;
  threadReliability: HarnessThreadReliabilitySummary;
  toolInventory: AgentRuntimeToolInventory | null;
  toolInventoryError: string | null;
  toolInventoryLoading: boolean;
  translateProjection: AgentUiProjectionTranslation;
}

export function buildHarnessSummaryCards({
  agentUiProjectionSummary,
  environment,
  fileChangeReviewEntries,
  fileReviewCopy,
  evidencePack,
  hasAgentUiProjectionSection,
  hasHandoffSection,
  hasSelectedTeamConfig,
  hasToolInventorySection,
  harnessState,
  realTeamSummary,
  runtimeTaskPresentation,
  runtimeToolTotal,
  runtimeToolVisibleTotal,
  selectedTeamLabel,
  selectedTeamRolesCount,
  selectedTeamSummary,
  threadReliability,
  toolInventory,
  toolInventoryError,
  toolInventoryLoading,
  translateProjection,
}: BuildHarnessSummaryCardsInput): HarnessSummaryCard[] {
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
      title: "问题证据包",
      value: evidencePack
        ? `${evidencePack.artifacts.length} 个文件`
        : "待导出",
      hint: evidencePack
        ? `最近导出 ${formatIsoDateTime(evidencePack.exported_at)}`
        : "导出当前会话的 runtime、timeline、最近产物和已知缺口",
      icon: ShieldAlert,
    });
  }

  if (threadReliability.shouldRender) {
    cards.push({
      sectionKey: "reliability",
      title: "可靠性",
      value: threadReliability.statusLabel,
      hint: threadReliability.summary,
      icon: AlertCircle,
    });
  }

  if (hasSelectedTeamConfig) {
    cards.push({
      sectionKey: "team_config",
      title: "Subagents",
      value: selectedTeamLabel?.trim() || `${selectedTeamRolesCount} 个子代理`,
      hint:
        selectedTeamSummary?.trim() ||
        (selectedTeamRolesCount > 0
          ? `已配置 ${selectedTeamRolesCount} 个子代理`
          : "本次已启用 Subagents"),
      icon: Bot,
    });
  }

  if (fileChangeReviewEntries.length > 0) {
    cards.push({
      sectionKey: "file_review",
      title: fileReviewCopy.title,
      value: fileReviewCopy.summaryValue,
      hint: fileChangeReviewEntries[0]?.displayName || fileReviewCopy.emptyHint,
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
      hint: environment.contextEnabled ? "上下文工作台已启用" : "普通聊天模式",
      icon: Sparkles,
    },
  );

  return cards;
}
