import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  capabilityDraftsApi,
  type CapabilityDraftRegistrationApprovalRequest,
  type CapabilityDraftRegistrationVerificationGate,
  type CapabilityDraftVerificationEvidence,
  type WorkspaceRegisteredSkillRecord,
} from "@/lib/api/capabilityDrafts";
import {
  exportAgentRuntimeEvidencePack,
  listWorkspaceSkillBindings,
  type AgentRuntimeCompletionAuditSummary,
  type AgentRuntimeWorkspaceSkillBinding,
} from "@/lib/api/agentRuntime";
import {
  getAutomationJobs,
  getAutomationRunHistory,
  updateAutomationJob,
  type AutomationJobRecord,
} from "@/lib/api/automation";
import {
  recordAutomationJobAgentUiProjection,
  recordAutomationJobsAgentUiProjection,
} from "@/components/agent/chat/projection/automationJobAgentUiProjection";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/lib/utils";
import {
  buildAgentEnvelopeDraftPresentation,
  type AgentEnvelopeDraftCompletionAuditLabelParts,
  type AgentEnvelopeDraftPresentationCopy,
} from "../agentEnvelopeDraftPresentation";
import {
  buildWorkspaceSkillManagedAutomationPresentation,
  canBuildWorkspaceSkillAgentAutomationDraft,
  isWorkspaceSkillAgentAutomationJobForDirectory,
  type WorkspaceSkillManagedAutomationPresentationCopy,
  type WorkspaceSkillAgentAutomationDraftOptions,
} from "../workspaceSkillAgentAutomationDraft";

interface WorkspaceRegisteredSkillsPanelProps {
  workspaceRoot?: string | null;
  projectPending?: boolean;
  projectError?: string | null;
  refreshSignal?: number;
  workspaceId?: string | null;
  onEnableRuntime?: (binding: AgentRuntimeWorkspaceSkillBinding) => void;
  onCreateManagedAutomationDraft?: (
    binding: AgentRuntimeWorkspaceSkillBinding,
    options?: WorkspaceSkillAgentAutomationDraftOptions,
  ) => void;
  completionAuditSummariesByDirectory?: Record<
    string,
    AgentRuntimeCompletionAuditSummary | undefined
  >;
  className?: string;
}

interface WorkspaceRegisteredSummaryCopy {
  bindingBlockedFallback: string;
  bindingCandidateFallback: string;
  bindingPending: string;
  permissionEmpty: string;
  resourceEmpty: string;
  standardPassed: string;
  standardPending: string;
  formatStandardIssueCount: (count: number) => string;
}

interface ReadonlyHttpApprovalPreviewCopy {
  notGenerated: string;
  notRecorded: string;
  previewOnly: string;
}

function summarizePermissionSummary(
  skill: WorkspaceRegisteredSkillRecord,
  copy: WorkspaceRegisteredSummaryCopy,
) {
  if (skill.permissionSummary.length === 0) {
    return copy.permissionEmpty;
  }
  return skill.permissionSummary.slice(0, 2).join(" / ");
}

function summarizeResourceSummary(
  skill: WorkspaceRegisteredSkillRecord,
  copy: WorkspaceRegisteredSummaryCopy,
) {
  const resources = [
    skill.resourceSummary.hasScripts ? "scripts" : null,
    skill.resourceSummary.hasReferences ? "references" : null,
    skill.resourceSummary.hasAssets ? "assets" : null,
  ].filter((item): item is string => Boolean(item));

  return resources.length > 0 ? resources.join(" / ") : copy.resourceEmpty;
}

function summarizeStandardCompliance(
  skill: WorkspaceRegisteredSkillRecord,
  copy: WorkspaceRegisteredSummaryCopy,
) {
  if (skill.standardCompliance.validationErrors.length > 0) {
    return copy.formatStandardIssueCount(
      skill.standardCompliance.validationErrors.length,
    );
  }
  return skill.standardCompliance.isStandard
    ? copy.standardPassed
    : copy.standardPending;
}

function summarizeBindingStatus(
  binding: AgentRuntimeWorkspaceSkillBinding | undefined,
  copy: WorkspaceRegisteredSummaryCopy,
) {
  if (!binding) {
    return copy.bindingPending;
  }
  if (binding.binding_status === "blocked") {
    return binding.binding_status_reason || copy.bindingBlockedFallback;
  }
  return binding.binding_status_reason || copy.bindingCandidateFallback;
}

const REGISTRATION_EVIDENCE_LABELS: Record<string, string> = {
  credentialReferenceId: "凭证引用",
  endpointSource: "Endpoint",
  evidenceSchema: "证据 Schema",
  method: "方法",
  policyPath: "Policy",
  preflightMode: "Preflight",
};

const READONLY_HTTP_PREFLIGHT_CHECK_ID = "readonly_http_execution_preflight";

function skillRequiresControlledGetEvidence(
  skill: WorkspaceRegisteredSkillRecord,
): boolean {
  return Boolean(
    skill.registration.approvalRequests?.some(
      (request) => request.sourceCheckId === READONLY_HTTP_PREFLIGHT_CHECK_ID,
    ) ||
    skill.registration.verificationGates?.some(
      (gate) => gate.checkId === READONLY_HTTP_PREFLIGHT_CHECK_ID,
    ),
  );
}

function formatRegistrationEvidenceKey(
  key: string,
  labels: Record<string, string>,
): string {
  return labels[key] ?? REGISTRATION_EVIDENCE_LABELS[key] ?? key;
}

function formatRegistrationEvidenceValue(
  evidence: CapabilityDraftVerificationEvidence,
) {
  return evidence.value.trim().replace(/\s+/g, " ");
}

function findRegistrationEvidenceValue(
  gate: CapabilityDraftRegistrationVerificationGate,
  key: string,
  copy: ReadonlyHttpApprovalPreviewCopy,
) {
  const evidence = gate.evidence.find((item) => item.key === key);
  return evidence
    ? formatRegistrationEvidenceValue(evidence)
    : copy.notRecorded;
}

function buildReadonlyHttpApprovalPreview(
  gate?: CapabilityDraftRegistrationVerificationGate,
  approvalRequest?: CapabilityDraftRegistrationApprovalRequest,
  copy?: ReadonlyHttpApprovalPreviewCopy,
) {
  if (!gate) {
    return null;
  }
  const fallback: ReadonlyHttpApprovalPreviewCopy = copy ?? {
    notGenerated: "未生成",
    notRecorded: "未记录",
    previewOnly: "preview_only",
  };

  return {
    approvalId: approvalRequest?.approvalId ?? fallback.notGenerated,
    createdAt: approvalRequest?.createdAt ?? fallback.notRecorded,
    status: approvalRequest?.status ?? fallback.previewOnly,
    credentialReferenceId:
      approvalRequest?.credentialReferenceId ??
      findRegistrationEvidenceValue(gate, "credentialReferenceId", fallback),
    endpointSource:
      approvalRequest?.endpointSource ??
      findRegistrationEvidenceValue(gate, "endpointSource", fallback),
    evidenceSchema:
      approvalRequest?.evidenceSchema.join(",") ??
      findRegistrationEvidenceValue(gate, "evidenceSchema", fallback),
    method:
      approvalRequest?.method ??
      findRegistrationEvidenceValue(gate, "method", fallback),
    policyPath:
      approvalRequest?.policyPath ??
      findRegistrationEvidenceValue(gate, "policyPath", fallback),
    consumptionGate: approvalRequest?.consumptionGate ?? null,
    credentialResolver: approvalRequest?.credentialResolver ?? null,
    consumptionInputSchema: approvalRequest?.consumptionInputSchema ?? null,
    sessionInputIntake: approvalRequest?.sessionInputIntake ?? null,
    sessionInputSubmissionContract:
      approvalRequest?.sessionInputSubmissionContract ?? null,
  };
}

function sortRegisteredSkills(
  skills: WorkspaceRegisteredSkillRecord[],
): WorkspaceRegisteredSkillRecord[] {
  return [...skills].sort((left, right) =>
    right.registration.registeredAt.localeCompare(
      left.registration.registeredAt,
    ),
  );
}

async function loadWorkspaceRegisteredState(workspaceRoot: string) {
  const [nextSkills, bindingSnapshot, automationJobs] = await Promise.all([
    capabilityDraftsApi.listRegisteredSkills({ workspaceRoot }),
    listWorkspaceSkillBindings({
      workspaceRoot,
      caller: "assistant",
      workbench: true,
    }),
    getAutomationJobs().catch(() => [] as AutomationJobRecord[]),
  ]);

  return {
    skills: nextSkills,
    bindings: Array.isArray(bindingSnapshot.bindings)
      ? bindingSnapshot.bindings
      : [],
    automationJobs,
  };
}

function WorkspaceRegisteredSkillCard({
  skill,
  binding,
  managedAutomationJobs,
  managedAutomationUpdatingJobId,
  completionAuditAuditingDirectory,
  completionAuditSummary,
  onToggleManagedAutomationJob,
  onAuditManagedAutomationJob,
  onEnableRuntime,
  onCreateManagedAutomationDraft,
}: {
  skill: WorkspaceRegisteredSkillRecord;
  binding?: AgentRuntimeWorkspaceSkillBinding;
  managedAutomationJobs: AutomationJobRecord[];
  managedAutomationUpdatingJobId?: string | null;
  completionAuditAuditingDirectory?: string | null;
  completionAuditSummary?: AgentRuntimeCompletionAuditSummary;
  onToggleManagedAutomationJob?: (
    job: AutomationJobRecord,
    enabled: boolean,
  ) => void;
  onAuditManagedAutomationJob?: (
    directory: string,
    job: AutomationJobRecord,
  ) => void;
  onEnableRuntime?: (binding: AgentRuntimeWorkspaceSkillBinding) => void;
  onCreateManagedAutomationDraft?: (
    binding: AgentRuntimeWorkspaceSkillBinding,
    options?: WorkspaceSkillAgentAutomationDraftOptions,
  ) => void;
}) {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.language;
  const summaryCopy = useMemo<WorkspaceRegisteredSummaryCopy>(
    () => ({
      bindingBlockedFallback: t(
        "capabilityDraft.registeredPanel.summary.bindingBlockedFallback",
        "Runtime binding 当前被 gate 阻断。",
      ),
      bindingCandidateFallback: t(
        "capabilityDraft.registeredPanel.summary.bindingCandidateFallback",
        "已具备后续 runtime binding 候选资格，但当前仍未进入默认工具面。",
      ),
      bindingPending: t(
        "capabilityDraft.registeredPanel.summary.bindingPending",
        "等待 runtime binding readiness 盘点。",
      ),
      formatStandardIssueCount: (count) =>
        t("capabilityDraft.registeredPanel.summary.standardIssueCount", {
          defaultValue: "标准检查仍有 {{count}} 个问题",
          count,
        }),
      permissionEmpty: t(
        "capabilityDraft.registeredPanel.summary.permissionEmpty",
        "未声明额外权限，默认停留在只读发现与注册审计。",
      ),
      resourceEmpty: t(
        "capabilityDraft.registeredPanel.summary.resourceEmpty",
        "纯 Skill 说明",
      ),
      standardPassed: t(
        "capabilityDraft.registeredPanel.summary.standardPassed",
        "Agent Skills 标准通过",
      ),
      standardPending: t(
        "capabilityDraft.registeredPanel.summary.standardPending",
        "Agent Skills 标准状态待确认",
      ),
    }),
    [t],
  );
  const evidenceLabels = useMemo<Record<string, string>>(
    () => ({
      credentialReferenceId: t(
        "capabilityDraft.registeredPanel.evidence.credentialReferenceId",
        REGISTRATION_EVIDENCE_LABELS.credentialReferenceId,
      ),
      endpointSource: t(
        "capabilityDraft.registeredPanel.evidence.endpointSource",
        REGISTRATION_EVIDENCE_LABELS.endpointSource,
      ),
      evidenceSchema: t(
        "capabilityDraft.registeredPanel.evidence.evidenceSchema",
        REGISTRATION_EVIDENCE_LABELS.evidenceSchema,
      ),
      method: t(
        "capabilityDraft.registeredPanel.evidence.method",
        REGISTRATION_EVIDENCE_LABELS.method,
      ),
      policyPath: t(
        "capabilityDraft.registeredPanel.evidence.policyPath",
        REGISTRATION_EVIDENCE_LABELS.policyPath,
      ),
      preflightMode: t(
        "capabilityDraft.registeredPanel.evidence.preflightMode",
        REGISTRATION_EVIDENCE_LABELS.preflightMode,
      ),
    }),
    [t],
  );
  const approvalPreviewCopy = useMemo<ReadonlyHttpApprovalPreviewCopy>(
    () => ({
      notGenerated: t(
        "capabilityDraft.registeredPanel.approval.notGenerated",
        "未生成",
      ),
      notRecorded: t(
        "capabilityDraft.registeredPanel.approval.notRecorded",
        "未记录",
      ),
      previewOnly: t(
        "capabilityDraft.registeredPanel.approval.previewOnly",
        "preview_only",
      ),
    }),
    [t],
  );
  const buildCompletionAuditLabel = useCallback(
    (parts: AgentEnvelopeDraftCompletionAuditLabelParts) => {
      const controlledGetLabel =
        parts.controlledGetExecutedCount > 0 ||
        parts.controlledGetArtifactCount > 0
          ? t(
              "capabilityDraft.registeredPanel.agentEnvelope.evidence.controlledGet.executed",
              {
                defaultValue: "，受控 GET {{executed}}/{{artifacts}} executed",
                artifacts: formatNumber(parts.controlledGetArtifactCount, {
                  locale,
                }),
                executed: formatNumber(parts.controlledGetExecutedCount, {
                  locale,
                }),
              },
            )
          : parts.controlledGetRequired
            ? t(
                "capabilityDraft.registeredPanel.agentEnvelope.evidence.controlledGet.requiredMissing",
                "，受控 GET required 0/0 executed",
              )
            : "";
      const blockingLabel =
        parts.blockingReasons.length > 0
          ? t(
              "capabilityDraft.registeredPanel.agentEnvelope.evidence.blocking",
              {
                defaultValue: "，阻塞：{{reasons}}",
                reasons: parts.blockingReasons.slice(0, 2).join(" / "),
              },
            )
          : "";
      const suffix = parts.missingControlledGetRequirement
        ? t(
            "capabilityDraft.registeredPanel.agentEnvelope.evidence.suffix.missingControlledGet",
            "；缺受控 GET evidence，不能固化为 Agent",
          )
        : parts.decision === "completed"
          ? ""
          : t(
              "capabilityDraft.registeredPanel.agentEnvelope.evidence.suffix.notCompleted",
              "；未 completed，不能固化为 Agent",
            );

      return t(
        "capabilityDraft.registeredPanel.agentEnvelope.evidence.completionAudit",
        {
          defaultValue:
            "Evidence：completion audit {{decision}}，owner {{successfulOwnerRunCount}}/{{ownerRunCount}}，ToolCall {{toolCallCount}}，artifact {{artifactCount}}{{controlledGetLabel}}{{blockingLabel}}{{suffix}}。",
          artifactCount: formatNumber(parts.artifactCount, { locale }),
          blockingLabel,
          controlledGetLabel,
          decision: parts.decision,
          ownerRunCount: formatNumber(parts.ownerRunCount, { locale }),
          successfulOwnerRunCount: formatNumber(parts.successfulOwnerRunCount, {
            locale,
          }),
          suffix,
          toolCallCount: formatNumber(parts.workspaceSkillToolCallCount, {
            locale,
          }),
        },
      );
    },
    [locale, t],
  );
  const envelopeCopy = useMemo<AgentEnvelopeDraftPresentationCopy>(
    () => ({
      actionBlocked: t(
        "capabilityDraft.registeredPanel.agentEnvelope.action.blocked",
        "先解除阻塞",
      ),
      actionDraft: t(
        "capabilityDraft.registeredPanel.agentEnvelope.action.draft",
        "转成 Agent 草案",
      ),
      actionManualEnable: t(
        "capabilityDraft.registeredPanel.agentEnvelope.action.manualEnable",
        "先本回合启用",
      ),
      agentCardPending: t(
        "capabilityDraft.registeredPanel.agentEnvelope.agentCard.pending",
        "Agent card：等待 evidence-ready 后派生，不创建平行持久化实体。",
      ),
      blockedReasonFallback: t(
        "capabilityDraft.registeredPanel.agentEnvelope.blockedReasonFallback",
        "runtime binding 当前被 gate 阻断",
      ),
      description: t(
        "capabilityDraft.registeredPanel.agentEnvelope.description",
        "成功运行后可把 Skill、权限、手动 rerun 和 evidence 组合成 Workspace Agent envelope。",
      ),
      discoveryPending: t(
        "capabilityDraft.registeredPanel.agentEnvelope.discovery.pending",
        "Discovery：等待 workspace-local skill 注册路径后再进入团队发现。",
      ),
      evidenceMissing: t(
        "capabilityDraft.registeredPanel.agentEnvelope.evidence.missing",
        "Evidence：还没有成功运行证据；先通过本回合启用拿到一次结果。",
      ),
      evidenceSourceMetadataOnly: t(
        "capabilityDraft.registeredPanel.agentEnvelope.evidence.sourceMetadataOnly",
        "Evidence：已有 P3E source metadata，可追踪本次 session 授权来源。",
      ),
      formatAgentCardReady: (directory) =>
        t("capabilityDraft.registeredPanel.agentEnvelope.agentCard.ready", {
          defaultValue:
            "Agent card：workspace-local/{{directory}}，由已注册 Skill、Managed Job 和 completion audit 派生。",
          directory,
        }),
      formatCompletionAuditEvidenceLabel: buildCompletionAuditLabel,
      formatCompletedEvidencePack: (packId) =>
        packId
          ? t(
              "capabilityDraft.registeredPanel.agentEnvelope.evidence.completedPack",
              {
                defaultValue: "Evidence：已关联 evidence pack {{packId}}。",
                packId,
              },
            )
          : t(
              "capabilityDraft.registeredPanel.agentEnvelope.evidence.completedPackFallback",
              "Evidence：已关联 evidence pack。",
            ),
      formatDiscoveryReady: (registeredSkillDirectory) =>
        t("capabilityDraft.registeredPanel.agentEnvelope.discovery.ready", {
          defaultValue:
            "Discovery：同 workspace 成员通过 registered skill 发现 {{directory}}，复用同一 Managed Job / evidence。",
          directory: registeredSkillDirectory,
        }),
      formatMemoryWithReport: (reportId) =>
        t("capabilityDraft.registeredPanel.agentEnvelope.memory.withReport", {
          defaultValue:
            "Memory：引用 verification report {{reportId}} 与后续运行修正。",
          reportId,
        }),
      formatPendingEvidencePack: (packId) =>
        t(
          "capabilityDraft.registeredPanel.agentEnvelope.evidence.pendingPack",
          {
            defaultValue:
              "Evidence：已关联 evidence pack {{packId}}，但还缺 completed completion audit，不能固化为 Agent。",
            packId,
          },
        ),
      formatPermissionWithSummary: (summary) =>
        t(
          "capabilityDraft.registeredPanel.agentEnvelope.permission.withSummary",
          {
            defaultValue: "权限：{{summary}}。",
            summary,
          },
        ),
      formatRunbook: (name) =>
        t("capabilityDraft.registeredPanel.agentEnvelope.runbook", {
          defaultValue: "Runbook：{{name}}",
          name,
        }),
      memoryPending: t(
        "capabilityDraft.registeredPanel.agentEnvelope.memory.pending",
        "Memory：等待首轮运行后记录用户偏好、方法论和修正历史。",
      ),
      permissionEmpty: t(
        "capabilityDraft.registeredPanel.agentEnvelope.permission.empty",
        "权限：默认手动确认，未声明额外外部写权限。",
      ),
      schedule: t(
        "capabilityDraft.registeredPanel.agentEnvelope.schedule",
        "Schedule：第一刀仅支持 manual rerun 草案，不创建长期任务。",
      ),
      sharingPending: t(
        "capabilityDraft.registeredPanel.agentEnvelope.sharing.pending",
        "Sharing：未完成审计前仅对当前操作者展示草案。",
      ),
      sharingReady: t(
        "capabilityDraft.registeredPanel.agentEnvelope.sharing.ready",
        "Sharing：可在当前 workspace / team 内共享；不进入 public Marketplace。",
      ),
      statusLabels: {
        blocked: t(
          "capabilityDraft.registeredPanel.agentEnvelope.status.blocked",
          "Agent 草案阻塞",
        ),
        evidence_ready: t(
          "capabilityDraft.registeredPanel.agentEnvelope.status.evidenceReady",
          "Evidence 已就绪",
        ),
        manual_enable_required: t(
          "capabilityDraft.registeredPanel.agentEnvelope.status.manualEnableRequired",
          "等待成功运行",
        ),
        source_metadata_ready: t(
          "capabilityDraft.registeredPanel.agentEnvelope.status.sourceMetadataReady",
          "等待 Completion Audit",
        ),
      },
      widgetPending: t(
        "capabilityDraft.registeredPanel.agentEnvelope.widget.pending",
        "Widget：等待运行后展示状态、产物、阻塞点和 evidence 入口。",
      ),
      widgetReady: t(
        "capabilityDraft.registeredPanel.agentEnvelope.widget.ready",
        "Widget：展示 Managed Job 状态、最近产物、审计结论和下一步动作。",
      ),
    }),
    [buildCompletionAuditLabel, t],
  );
  const managedAutomationCopy =
    useMemo<WorkspaceSkillManagedAutomationPresentationCopy>(
      () => ({
        auditBlocked: t(
          "capabilityDraft.registeredPanel.managedJob.audit.blocked",
          "Completion Audit：blocked，需处理失败原因。",
        ),
        auditMissing: t(
          "capabilityDraft.registeredPanel.managedJob.audit.missing",
          "Completion Audit：缺少运行与 evidence，不能判定完成。",
        ),
        auditPaused: t(
          "capabilityDraft.registeredPanel.managedJob.audit.paused",
          "Completion Audit：paused，恢复并产生运行证据后再审计。",
        ),
        auditPlanned: t(
          "capabilityDraft.registeredPanel.managedJob.audit.planned",
          "Completion Audit：planned，等待首次运行证据。",
        ),
        auditRunning: t(
          "capabilityDraft.registeredPanel.managedJob.audit.running",
          "Completion Audit：运行中，等待 automation run 结束后再审计。",
        ),
        auditVerifying: t(
          "capabilityDraft.registeredPanel.managedJob.audit.verifying",
          "Completion Audit：运行成功后仍需 artifact / timeline / evidence 审计，暂不直接标记 completed。",
        ),
        formatAtSchedule: (at) =>
          t("capabilityDraft.registeredPanel.managedJob.schedule.at", {
            defaultValue: "一次性 {{at}}",
            at,
          }),
        formatAuditBlocked: (error) =>
          error
            ? t(
                "capabilityDraft.registeredPanel.managedJob.audit.blockedWithError",
                {
                  defaultValue:
                    "Completion Audit：blocked，需处理失败原因：{{error}}",
                  error,
                },
              )
            : t(
                "capabilityDraft.registeredPanel.managedJob.audit.blocked",
                "Completion Audit：blocked，需处理失败原因。",
              ),
        formatCronSchedule: (expr, timezone) =>
          t("capabilityDraft.registeredPanel.managedJob.schedule.cron", {
            defaultValue: "Cron {{expr}}{{timezone}}",
            expr,
            timezone: timezone
              ? t(
                  "capabilityDraft.registeredPanel.managedJob.schedule.timezone",
                  {
                    defaultValue: " · {{timezone}}",
                    timezone,
                  },
                )
              : "",
          }),
        formatEverySchedule: (seconds) =>
          t("capabilityDraft.registeredPanel.managedJob.schedule.every", {
            defaultValue: "每 {{seconds}} 秒",
            seconds: formatNumber(seconds, { locale }),
          }),
        formatLastRun: (lastRun, error) =>
          t("capabilityDraft.registeredPanel.managedJob.lastRun.withValue", {
            defaultValue: "最近运行：{{lastRun}}{{error}}",
            error: error
              ? t("capabilityDraft.registeredPanel.managedJob.lastRun.error", {
                  defaultValue: " · {{error}}",
                  error,
                })
              : "",
            lastRun,
          }),
        formatManagedObjective: (state) =>
          t("capabilityDraft.registeredPanel.managedJob.objective.withState", {
            defaultValue: "Managed Objective：{{state}}",
            state,
          }),
        formatSchedule: (schedule, nextRun) =>
          t("capabilityDraft.registeredPanel.managedJob.schedule.withValue", {
            defaultValue: "Schedule：{{schedule}}{{nextRun}}",
            nextRun: nextRun
              ? t(
                  "capabilityDraft.registeredPanel.managedJob.schedule.nextRun",
                  {
                    defaultValue: " · 下次 {{nextRun}}",
                    nextRun,
                  },
                )
              : "",
            schedule,
          }),
        formatStatus: (state, lastStatus) =>
          t("capabilityDraft.registeredPanel.managedJob.status.withValue", {
            defaultValue: "Managed Job：{{state}} · {{lastStatus}}",
            lastStatus,
            state,
          }),
        lastRunNone: t(
          "capabilityDraft.registeredPanel.managedJob.lastRun.none",
          "最近运行：暂无",
        ),
        lastRunValueNone: t(
          "capabilityDraft.registeredPanel.managedJob.lastRun.valueNone",
          "暂无",
        ),
        managedObjectivePlanned: t(
          "capabilityDraft.registeredPanel.managedJob.objective.planned",
          "Managed Objective：planned，等待绑定 automation job。",
        ),
        notCreatedSchedule: t(
          "capabilityDraft.registeredPanel.managedJob.schedule.notCreated",
          "Schedule：等待创建 automation job 草案。",
        ),
        notCreatedStatus: t(
          "capabilityDraft.registeredPanel.managedJob.status.notCreated",
          "Managed Job：未创建",
        ),
        notRunStatus: t(
          "capabilityDraft.registeredPanel.managedJob.status.notRun",
          "尚未运行",
        ),
        stateEnabled: t(
          "capabilityDraft.registeredPanel.managedJob.state.enabled",
          "已启用",
        ),
        statePaused: t(
          "capabilityDraft.registeredPanel.managedJob.state.paused",
          "草案暂停",
        ),
        unknownSchedule: t(
          "capabilityDraft.registeredPanel.managedJob.schedule.unknown",
          "未知调度",
        ),
      }),
      [locale, t],
    );
  const bindingBlocked = binding?.binding_status === "blocked";
  const runtimeEnableReady =
    binding?.binding_status === "ready_for_manual_enable";
  const automationDraftOptions = {
    requiresControlledGetEvidence: skillRequiresControlledGetEvidence(skill),
  };
  const envelopeDraft = buildAgentEnvelopeDraftPresentation({
    skill,
    binding,
    completionAuditSummary,
    copy: envelopeCopy,
  });
  const canCreateManagedAutomationDraft =
    canBuildWorkspaceSkillAgentAutomationDraft(binding);
  const canCreateAgentEnvelopeDraft =
    envelopeDraft.actionEnabled &&
    canCreateManagedAutomationDraft &&
    Boolean(onCreateManagedAutomationDraft);
  const managedAutomationPresentation =
    buildWorkspaceSkillManagedAutomationPresentation(
      managedAutomationJobs,
      managedAutomationCopy,
    );
  const [managedAutomationJob] = managedAutomationJobs;
  const managedAutomationUpdating =
    managedAutomationJob?.id === managedAutomationUpdatingJobId;
  const completionAuditAuditing =
    completionAuditAuditingDirectory === skill.directory;
  const preflightGate = skill.registration.verificationGates?.find(
    (gate) => gate.checkId === READONLY_HTTP_PREFLIGHT_CHECK_ID,
  );
  const approvalRequest = skill.registration.approvalRequests?.find(
    (request) => request.sourceCheckId === READONLY_HTTP_PREFLIGHT_CHECK_ID,
  );
  const approvalPreview = buildReadonlyHttpApprovalPreview(
    preflightGate,
    approvalRequest,
    approvalPreviewCopy,
  );

  return (
    <article className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {t("capabilityDraft.registeredPanel.card.badge.registered", "已注册")}
        </span>
        <span
          className={cn(
            "rounded-full border bg-white px-2.5 py-1 text-[11px] font-medium",
            bindingBlocked
              ? "border-amber-200 text-amber-700"
              : "border-sky-200 text-sky-700",
          )}
        >
          {bindingBlocked
            ? t(
                "capabilityDraft.registeredPanel.card.binding.blocked",
                "Binding 阻塞",
              )
            : t(
                "capabilityDraft.registeredPanel.card.binding.candidate",
                "P3C binding 候选",
              )}
        </span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <h3 className="text-sm font-semibold text-slate-900">
          {skill.name || skill.directory}
        </h3>
        <p className="line-clamp-2 text-[12px] leading-5 text-slate-600">
          {skill.description ||
            t(
              "capabilityDraft.registeredPanel.card.descriptionFallback",
              "已注册为当前 Workspace 的本地 Skill 包。",
            )}
        </p>
      </div>
      <div className="mt-3 space-y-1 text-[11px] leading-5 text-slate-500">
        <div>
          <span className="font-medium text-slate-700">
            {t(
              "capabilityDraft.registeredPanel.card.field.directory",
              "目录：",
            )}
          </span>
          {skill.directory}
        </div>
        <div>
          <span className="font-medium text-slate-700">
            {t("capabilityDraft.registeredPanel.card.field.source", "来源：")}
          </span>
          {skill.registration.sourceDraftId}
          {skill.registration.sourceVerificationReportId
            ? ` / ${skill.registration.sourceVerificationReportId}`
            : ""}
        </div>
        <div>
          <span className="font-medium text-slate-700">
            {t(
              "capabilityDraft.registeredPanel.card.field.permission",
              "权限：",
            )}
          </span>
          {summarizePermissionSummary(skill, summaryCopy)}
        </div>
        <div>
          <span className="font-medium text-slate-700">
            {t("capabilityDraft.registeredPanel.card.field.resource", "资源：")}
          </span>
          {summarizeResourceSummary(skill, summaryCopy)}
        </div>
        <div>
          <span className="font-medium text-slate-700">
            {t("capabilityDraft.registeredPanel.card.field.standard", "标准：")}
          </span>
          {summarizeStandardCompliance(skill, summaryCopy)}
        </div>
        <div>
          <span className="font-medium text-slate-700">
            {t(
              "capabilityDraft.registeredPanel.card.field.runtimeBinding",
              "运行绑定：",
            )}
          </span>
          {summarizeBindingStatus(binding, summaryCopy)}
        </div>
        <div className="text-sky-700">
          {t(
            "capabilityDraft.registeredPanel.card.field.nextGate",
            "下一道 gate：",
          )}
          {binding?.next_gate ||
            t(
              "capabilityDraft.registeredPanel.card.nextGateFallback",
              "manual_runtime_enable / Query Loop metadata / tool_runtime 授权裁剪",
            )}
        </div>
      </div>
      {preflightGate ? (
        <div className="mt-3 rounded-2xl border border-sky-100 bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-800">
              {t(
                "capabilityDraft.registeredPanel.provenance.title",
                "注册 provenance",
              )}
            </span>
            <span className="text-[10px] leading-4 text-sky-700">
              {preflightGate.label || preflightGate.checkId}
            </span>
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {preflightGate.evidence.slice(0, 6).map((evidence) => (
              <div
                key={`${preflightGate.checkId}:${evidence.key}`}
                className="rounded-xl border border-sky-100 bg-sky-50 px-2.5 py-1.5"
              >
                <div className="text-[10px] leading-4 text-slate-400">
                  {formatRegistrationEvidenceKey(evidence.key, evidenceLabels)}
                </div>
                <div className="truncate font-mono text-[10px] leading-4 text-slate-700">
                  {formatRegistrationEvidenceValue(evidence)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {approvalPreview ? (
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-amber-900">
              {t(
                "capabilityDraft.registeredPanel.approval.title",
                "Session approval request artifact",
              )}
            </span>
            <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-medium text-amber-700">
              {t("capabilityDraft.registeredPanel.approval.statusSummary", {
                defaultValue: "{{status}} / 未执行 / 未保存凭证",
                status: approvalPreview.status,
              })}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-amber-800">
            {t(
              "capabilityDraft.registeredPanel.approval.description",
              "真实 API 执行前必须先消费这条授权请求 artifact；当前只持久化审计入口，不保存 token，也不发请求。",
            )}
          </p>
          {approvalPreview.consumptionGate ? (
            <div className="mt-2 rounded-xl border border-amber-200 bg-white px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-amber-700">
                  {t(
                    "capabilityDraft.registeredPanel.approval.consumptionGate.title",
                    "消费门禁",
                  )}
                </span>
                <span className="font-mono text-[10px] text-slate-700">
                  {approvalPreview.consumptionGate.status}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-amber-800">
                {approvalPreview.consumptionGate.blockedReason}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {approvalPreview.consumptionGate.requiredInputs.map((input) => (
                  <span
                    key={input}
                    className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-800"
                  >
                    {input}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 text-[10px] leading-4 text-slate-600">
                {t(
                  "capabilityDraft.registeredPanel.approval.flag.runtimeExecution",
                  {
                    defaultValue: "runtimeExecution={{value}}",
                    value: String(
                      approvalPreview.consumptionGate.runtimeExecutionEnabled,
                    ),
                  },
                )}{" "}
                /{" "}
                {t(
                  "capabilityDraft.registeredPanel.approval.flag.credentialStorage",
                  {
                    defaultValue: "credentialStorage={{value}}",
                    value: String(
                      approvalPreview.consumptionGate.credentialStorageEnabled,
                    ),
                  },
                )}
              </div>
            </div>
          ) : null}
          {approvalPreview.credentialResolver ? (
            <div className="mt-2 rounded-xl border border-amber-200 bg-white px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-amber-700">
                  {t(
                    "capabilityDraft.registeredPanel.approval.credentialResolver.title",
                    "Session credential resolver",
                  )}
                </span>
                <span className="font-mono text-[10px] text-slate-700">
                  {approvalPreview.credentialResolver.status}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-amber-800">
                {approvalPreview.credentialResolver.blockedReason}
              </p>
              <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {[
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.reference",
                      "Reference",
                    ),
                    approvalPreview.credentialResolver.referenceId,
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.scope",
                      "Scope",
                    ),
                    approvalPreview.credentialResolver.scope,
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.source",
                      "Source",
                    ),
                    approvalPreview.credentialResolver.source,
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.secret",
                      "Secret",
                    ),
                    approvalPreview.credentialResolver.secretMaterialStatus,
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.tokenPersisted",
                      "tokenPersisted",
                    ),
                    String(approvalPreview.credentialResolver.tokenPersisted),
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.runtimeInjection",
                      "runtimeInjection",
                    ),
                    String(
                      approvalPreview.credentialResolver
                        .runtimeInjectionEnabled,
                    ),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-1"
                  >
                    <span className="text-[10px] text-amber-600">{label}</span>
                    <span className="ml-1 break-words font-mono text-[10px] text-slate-700">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {approvalPreview.consumptionInputSchema ? (
            <div className="mt-2 rounded-xl border border-amber-200 bg-white px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-amber-700">
                  {t(
                    "capabilityDraft.registeredPanel.approval.inputSchema.title",
                    "Approval consumption input schema",
                  )}
                </span>
                <span className="font-mono text-[10px] text-slate-700">
                  {approvalPreview.consumptionInputSchema.schemaId}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-amber-800">
                {approvalPreview.consumptionInputSchema.blockedReason}
              </p>
              <div className="mt-1.5 text-[10px] leading-4 text-slate-600">
                {t(
                  "capabilityDraft.registeredPanel.approval.flag.uiSubmission",
                  {
                    defaultValue: "uiSubmission={{value}}",
                    value: String(
                      approvalPreview.consumptionInputSchema
                        .uiSubmissionEnabled,
                    ),
                  },
                )}{" "}
                /{" "}
                {t(
                  "capabilityDraft.registeredPanel.approval.flag.runtimeExecution",
                  {
                    defaultValue: "runtimeExecution={{value}}",
                    value: String(
                      approvalPreview.consumptionInputSchema
                        .runtimeExecutionEnabled,
                    ),
                  },
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {approvalPreview.consumptionInputSchema.fields.map((field) => (
                  <span
                    key={field.key}
                    className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-800"
                    title={field.description}
                  >
                    {field.key}:{field.kind}
                    {field.required
                      ? t(
                          "capabilityDraft.registeredPanel.approval.suffix.required",
                          ":required",
                        )
                      : ""}
                    {field.secret
                      ? t(
                          "capabilityDraft.registeredPanel.approval.suffix.secret",
                          ":secret",
                        )
                      : ""}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {approvalPreview.sessionInputIntake ? (
            <div className="mt-2 rounded-xl border border-amber-200 bg-white px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-amber-700">
                  {t(
                    "capabilityDraft.registeredPanel.approval.sessionInputIntake.title",
                    "Session input intake",
                  )}
                </span>
                <span className="font-mono text-[10px] text-slate-700">
                  {approvalPreview.sessionInputIntake.status}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-amber-800">
                {approvalPreview.sessionInputIntake.blockedReason}
              </p>
              <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {[
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.schema",
                      "Schema",
                    ),
                    approvalPreview.sessionInputIntake.schemaId,
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.scope",
                      "Scope",
                    ),
                    approvalPreview.sessionInputIntake.scope,
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.credential",
                      "Credential",
                    ),
                    approvalPreview.sessionInputIntake.credentialReferenceId,
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.secret",
                      "Secret",
                    ),
                    approvalPreview.sessionInputIntake.secretMaterialStatus,
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.endpointPersisted",
                      "endpointPersisted",
                    ),
                    String(
                      approvalPreview.sessionInputIntake.endpointInputPersisted,
                    ),
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.tokenPersisted",
                      "tokenPersisted",
                    ),
                    String(approvalPreview.sessionInputIntake.tokenPersisted),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-1"
                  >
                    <span className="text-[10px] text-amber-600">{label}</span>
                    <span className="ml-1 break-words font-mono text-[10px] text-slate-700">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 text-[10px] leading-4 text-slate-600">
                {t(
                  "capabilityDraft.registeredPanel.approval.flag.uiSubmission",
                  {
                    defaultValue: "uiSubmission={{value}}",
                    value: String(
                      approvalPreview.sessionInputIntake.uiSubmissionEnabled,
                    ),
                  },
                )}{" "}
                /{" "}
                {t(
                  "capabilityDraft.registeredPanel.approval.flag.runtimeExecution",
                  {
                    defaultValue: "runtimeExecution={{value}}",
                    value: String(
                      approvalPreview.sessionInputIntake
                        .runtimeExecutionEnabled,
                    ),
                  },
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {approvalPreview.sessionInputIntake.missingFieldKeys.map(
                  (fieldKey) => (
                    <span
                      key={fieldKey}
                      className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-800"
                    >
                      {t(
                        "capabilityDraft.registeredPanel.approval.prefix.missing",
                        "missing:",
                      )}
                      {fieldKey}
                    </span>
                  ),
                )}
              </div>
            </div>
          ) : null}
          {approvalPreview.sessionInputSubmissionContract ? (
            <div className="mt-2 rounded-xl border border-amber-200 bg-white px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-amber-700">
                  {t(
                    "capabilityDraft.registeredPanel.approval.sessionSubmissionContract.title",
                    "Session submission contract",
                  )}
                </span>
                <span className="font-mono text-[10px] text-slate-700">
                  {approvalPreview.sessionInputSubmissionContract.status}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-amber-800">
                {approvalPreview.sessionInputSubmissionContract.blockedReason}
              </p>
              <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {[
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.mode",
                      "Mode",
                    ),
                    approvalPreview.sessionInputSubmissionContract.mode,
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.retention",
                      "Retention",
                    ),
                    approvalPreview.sessionInputSubmissionContract
                      .valueRetention,
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.submitHandler",
                      "submitHandler",
                    ),
                    String(
                      approvalPreview.sessionInputSubmissionContract
                        .submissionHandlerEnabled,
                    ),
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.secretAccepted",
                      "secretAccepted",
                    ),
                    String(
                      approvalPreview.sessionInputSubmissionContract
                        .secretMaterialAccepted,
                    ),
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.evidenceRequired",
                      "evidenceRequired",
                    ),
                    String(
                      approvalPreview.sessionInputSubmissionContract
                        .evidenceCaptureRequired,
                    ),
                  ],
                  [
                    t(
                      "capabilityDraft.registeredPanel.approval.label.runtimeExecution",
                      "runtimeExecution",
                    ),
                    String(
                      approvalPreview.sessionInputSubmissionContract
                        .runtimeExecutionEnabled,
                    ),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-1"
                  >
                    <span className="text-[10px] text-amber-600">{label}</span>
                    <span className="ml-1 break-words font-mono text-[10px] text-slate-700">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {approvalPreview.sessionInputSubmissionContract.validationRules.map(
                  (rule) => (
                    <span
                      key={rule.fieldKey}
                      className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-800"
                      title={rule.rule}
                    >
                      {t(
                        "capabilityDraft.registeredPanel.approval.prefix.validate",
                        "validate:",
                      )}
                      {rule.fieldKey}:{rule.kind}
                      {rule.required
                        ? t(
                            "capabilityDraft.registeredPanel.approval.suffix.required",
                            ":required",
                          )
                        : ""}
                    </span>
                  ),
                )}
              </div>
            </div>
          ) : null}
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {[
              {
                label: t(
                  "capabilityDraft.registeredPanel.approval.label.approvalId",
                  "Approval ID",
                ),
                value: approvalPreview.approvalId,
              },
              {
                label: t(
                  "capabilityDraft.registeredPanel.approval.label.status",
                  "状态",
                ),
                value: approvalPreview.status,
              },
              {
                label: t(
                  "capabilityDraft.registeredPanel.approval.label.endpoint",
                  "Endpoint",
                ),
                value: approvalPreview.endpointSource,
              },
              {
                label: t(
                  "capabilityDraft.registeredPanel.approval.label.method",
                  "方法",
                ),
                value: approvalPreview.method,
              },
              {
                label: t(
                  "capabilityDraft.registeredPanel.approval.label.credentialReference",
                  "凭证引用",
                ),
                value: approvalPreview.credentialReferenceId,
              },
              {
                label: t(
                  "capabilityDraft.registeredPanel.approval.label.policy",
                  "Policy",
                ),
                value: approvalPreview.policyPath,
              },
              {
                label: t(
                  "capabilityDraft.registeredPanel.approval.label.createdAt",
                  "创建时间",
                ),
                value: approvalPreview.createdAt,
              },
              {
                label: t(
                  "capabilityDraft.registeredPanel.approval.label.evidenceSchema",
                  "证据 Schema",
                ),
                value: approvalPreview.evidenceSchema,
                wide: true,
              },
            ].map(({ label, value, wide }) => (
              <div
                key={label}
                className={cn(
                  "rounded-xl border border-amber-100 bg-white px-2.5 py-1.5",
                  wide && "sm:col-span-2",
                )}
              >
                <div className="text-[10px] leading-4 text-amber-600">
                  {label}
                </div>
                <div className="break-words font-mono text-[10px] leading-4 text-slate-700">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-3 rounded-2xl border border-dashed border-cyan-200 bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-cyan-800">
            {t(
              "capabilityDraft.registeredPanel.agentEnvelope.title",
              "Agent envelope 草案",
            )}
          </span>
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
            {envelopeDraft.statusLabel}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-5 text-slate-600">
          {envelopeDraft.description}
        </p>
        <div className="mt-2 grid gap-1 text-[11px] leading-5 text-slate-500">
          <span>{envelopeDraft.agentCardLabel}</span>
          <span>{envelopeDraft.sharingLabel}</span>
          <span>{envelopeDraft.sharingDiscoveryLabel}</span>
          <span>{envelopeDraft.runbookLabel}</span>
          <span>{envelopeDraft.memoryLabel}</span>
          <span>{envelopeDraft.widgetLabel}</span>
          <span>{envelopeDraft.permissionLabel}</span>
          <span>{envelopeDraft.scheduleLabel}</span>
          <span>{envelopeDraft.evidenceLabel}</span>
          <span>{managedAutomationPresentation.statusLabel}</span>
          <span>{managedAutomationPresentation.scheduleLabel}</span>
          <span>{managedAutomationPresentation.lastRunLabel}</span>
          <span>{managedAutomationPresentation.objectiveLabel}</span>
          <span>{managedAutomationPresentation.auditLabel}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2 h-7 rounded-xl px-2.5 text-[11px] text-cyan-700 hover:bg-cyan-50"
          disabled={!canCreateAgentEnvelopeDraft}
          onClick={() => {
            if (binding && canCreateAgentEnvelopeDraft) {
              onCreateManagedAutomationDraft?.(binding, automationDraftOptions);
            }
          }}
          data-testid="workspace-registered-agent-envelope-action"
        >
          {envelopeDraft.actionLabel}
        </Button>
        {onCreateManagedAutomationDraft && binding ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-2 mt-2 h-7 rounded-xl border-cyan-200 bg-cyan-50 px-2.5 text-[11px] text-cyan-800 hover:bg-cyan-100"
            disabled={!canCreateManagedAutomationDraft}
            onClick={() =>
              onCreateManagedAutomationDraft(binding, automationDraftOptions)
            }
            data-testid="workspace-registered-agent-managed-automation"
          >
            {t(
              "capabilityDraft.registeredPanel.action.createManagedJobDraft",
              "创建 Managed Job 草案",
            )}
          </Button>
        ) : null}
        {managedAutomationJob && onToggleManagedAutomationJob ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-2 mt-2 h-7 rounded-xl px-2.5 text-[11px] text-slate-600 hover:bg-slate-50"
            disabled={managedAutomationUpdating}
            onClick={() =>
              onToggleManagedAutomationJob(
                managedAutomationJob,
                !managedAutomationJob.enabled,
              )
            }
            data-testid="workspace-registered-agent-managed-automation-toggle"
          >
            {managedAutomationJob.enabled
              ? t(
                  "capabilityDraft.registeredPanel.action.pauseManagedJob",
                  "暂停 Managed Job",
                )
              : t(
                  "capabilityDraft.registeredPanel.action.resumeManagedJob",
                  "恢复 Managed Job",
                )}
          </Button>
        ) : null}
        {managedAutomationJob && onAuditManagedAutomationJob ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-2 mt-2 h-7 rounded-xl px-2.5 text-[11px] text-emerald-700 hover:bg-emerald-50"
            disabled={completionAuditAuditing}
            onClick={() =>
              onAuditManagedAutomationJob(skill.directory, managedAutomationJob)
            }
            data-testid="workspace-registered-agent-completion-audit"
          >
            {completionAuditAuditing
              ? t(
                  "capabilityDraft.registeredPanel.action.auditRunning",
                  "正在审计",
                )
              : t(
                  "capabilityDraft.registeredPanel.action.auditRecentRun",
                  "审计最近运行",
                )}
          </Button>
        ) : null}
      </div>
      {onEnableRuntime && binding ? (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-2xl border-sky-200 bg-white px-3 text-[12px] text-sky-700 hover:bg-sky-50 hover:text-sky-900"
            disabled={!runtimeEnableReady}
            onClick={() => onEnableRuntime(binding)}
            data-testid="workspace-registered-skill-enable-runtime"
          >
            {t(
              "capabilityDraft.registeredPanel.action.enableRuntime",
              "本回合启用",
            )}
          </Button>
          <span className="ml-2 align-middle text-[11px] text-slate-500">
            {t(
              "capabilityDraft.registeredPanel.action.enableRuntimeHelp",
              "只写入 session enable metadata，不创建自动化。",
            )}
          </span>
        </div>
      ) : null}
    </article>
  );
}

export function WorkspaceRegisteredSkillsPanel({
  workspaceRoot,
  projectPending = false,
  projectError,
  refreshSignal = 0,
  workspaceId,
  onEnableRuntime,
  onCreateManagedAutomationDraft,
  completionAuditSummariesByDirectory,
  className,
}: WorkspaceRegisteredSkillsPanelProps) {
  const { t } = useTranslation("agent");
  const [skills, setSkills] = useState<WorkspaceRegisteredSkillRecord[]>([]);
  const [bindings, setBindings] = useState<AgentRuntimeWorkspaceSkillBinding[]>(
    [],
  );
  const [automationJobs, setAutomationJobs] = useState<AutomationJobRecord[]>(
    [],
  );
  const [managedAutomationUpdatingJobId, setManagedAutomationUpdatingJobId] =
    useState<string | null>(null);
  const [completionAuditSummaries, setCompletionAuditSummaries] = useState<
    Record<string, AgentRuntimeCompletionAuditSummary | undefined>
  >({});
  const [
    completionAuditAuditingDirectory,
    setCompletionAuditAuditingDirectory,
  ] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedWorkspaceRoot = workspaceRoot?.trim() || null;

  const loadRegisteredSkills = useCallback(async () => {
    if (!normalizedWorkspaceRoot) {
      setSkills([]);
      setBindings([]);
      setAutomationJobs([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextState = await loadWorkspaceRegisteredState(
        normalizedWorkspaceRoot,
      );
      setSkills(nextState.skills);
      setBindings(nextState.bindings);
      setAutomationJobs(nextState.automationJobs);
      recordAutomationJobsAgentUiProjection(nextState.automationJobs, "loaded");
    } catch (loadError) {
      setSkills([]);
      setBindings([]);
      setAutomationJobs([]);
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, [normalizedWorkspaceRoot]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!normalizedWorkspaceRoot) {
        setSkills([]);
        setBindings([]);
        setAutomationJobs([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const nextState = await loadWorkspaceRegisteredState(
          normalizedWorkspaceRoot,
        );
        if (!cancelled) {
          setSkills(nextState.skills);
          setBindings(nextState.bindings);
          setAutomationJobs(nextState.automationJobs);
          recordAutomationJobsAgentUiProjection(
            nextState.automationJobs,
            "loaded",
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setSkills([]);
          setBindings([]);
          setAutomationJobs([]);
          setError(String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [normalizedWorkspaceRoot, refreshSignal]);

  const visibleSkills = useMemo(
    () => sortRegisteredSkills(skills).slice(0, 4),
    [skills],
  );
  const bindingByDirectory = useMemo(() => {
    const next = new Map<string, AgentRuntimeWorkspaceSkillBinding>();
    bindings.forEach((binding) => {
      if (binding.directory) {
        next.set(binding.directory, binding);
      }
    });
    return next;
  }, [bindings]);
  const managedAutomationJobsByDirectory = useMemo(() => {
    const next = new Map<string, AutomationJobRecord[]>();
    for (const skill of skills) {
      next.set(
        skill.directory,
        automationJobs.filter(
          (job) =>
            (!workspaceId || job.workspace_id === workspaceId) &&
            isWorkspaceSkillAgentAutomationJobForDirectory(
              job,
              skill.directory,
            ),
        ),
      );
    }
    return next;
  }, [automationJobs, skills, workspaceId]);
  const handleToggleManagedAutomationJob = useCallback(
    async (job: AutomationJobRecord, enabled: boolean) => {
      setManagedAutomationUpdatingJobId(job.id);
      setError(null);
      try {
        const updatedJob = await updateAutomationJob(job.id, { enabled });
        setAutomationJobs((previousJobs) =>
          previousJobs.map((item) =>
            item.id === updatedJob.id ? updatedJob : item,
          ),
        );
        recordAutomationJobAgentUiProjection(updatedJob, "updated");
      } catch (toggleError) {
        setError(String(toggleError));
      } finally {
        setManagedAutomationUpdatingJobId(null);
      }
    },
    [],
  );
  const handleAuditManagedAutomationJob = useCallback(
    async (directory: string, job: AutomationJobRecord) => {
      setCompletionAuditAuditingDirectory(directory);
      setError(null);
      try {
        const runs = await getAutomationRunHistory(job.id, 5);
        const sessionId = runs.find((run) => run.session_id)?.session_id;
        if (!sessionId) {
          throw new Error(
            t(
              "capabilityDraft.registeredPanel.error.missingAutomationSession",
              "最近 automation run 没有关联 session，无法导出 evidence。",
            ),
          );
        }
        const evidencePack = await exportAgentRuntimeEvidencePack(sessionId);
        setCompletionAuditSummaries((previous) => ({
          ...previous,
          [directory]: evidencePack.completion_audit_summary,
        }));
      } catch (auditError) {
        setError(String(auditError));
      } finally {
        setCompletionAuditAuditingDirectory(null);
      }
    },
    [t],
  );
  const effectiveError = projectError || error;
  const isBusy = projectPending || loading;

  return (
    <section
      className={cn(
        "rounded-[28px] border border-sky-200/80 bg-white p-5 shadow-sm shadow-sky-950/5",
        className,
      )}
      data-testid="workspace-registered-skills-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
              {t("capabilityDraft.registeredPanel.badge", "注册区")}
            </span>
            <h2 className="text-[15px] font-semibold text-slate-900">
              {t(
                "capabilityDraft.registeredPanel.title",
                "Workspace 已注册能力",
              )}
            </h2>
          </div>
          <p className="text-[11px] leading-5 text-slate-500">
            {t(
              "capabilityDraft.registeredPanel.description",
              "这里只有已通过验证并写入当前项目的 Skill 包；运行仍要等 runtime gate。",
            )}
          </p>
        </div>
        {normalizedWorkspaceRoot ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-2xl px-3 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => void loadRegisteredSkills()}
            disabled={isBusy}
            data-testid="workspace-registered-skills-refresh"
          >
            <RefreshCw
              className={cn("mr-1.5 h-3.5 w-3.5", isBusy && "animate-spin")}
            />
            {t("capabilityDraft.registeredPanel.action.refresh", "刷新")}
          </Button>
        ) : null}
      </div>

      {!normalizedWorkspaceRoot ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-sky-200 bg-sky-50/60 px-4 py-5 text-sm leading-6 text-sky-800">
          {t(
            "capabilityDraft.registeredPanel.empty.missingProject",
            "选择或进入一个项目后，才能查看该项目已注册的 generated skill。",
          )}
        </div>
      ) : effectiveError ? (
        <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-5 text-sm leading-6 text-rose-700">
          {t("capabilityDraft.registeredPanel.empty.error", {
            defaultValue: "已注册能力暂时没读到：{{message}}",
            message: effectiveError,
          })}
        </div>
      ) : isBusy ? (
        <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
          {t(
            "capabilityDraft.registeredPanel.empty.loading",
            "正在读取已注册能力...",
          )}
        </div>
      ) : visibleSkills.length === 0 ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-sky-200 bg-sky-50/60 px-4 py-5 text-sm leading-6 text-sky-800">
          {t(
            "capabilityDraft.registeredPanel.empty.noSkills",
            "当前项目还没有通过 P3A 注册的能力。草案通过验证并注册后，会先出现在这里。",
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {visibleSkills.map((skill) => (
            <WorkspaceRegisteredSkillCard
              key={skill.key || skill.directory}
              skill={skill}
              binding={bindingByDirectory.get(skill.directory)}
              managedAutomationJobs={
                managedAutomationJobsByDirectory.get(skill.directory) ?? []
              }
              managedAutomationUpdatingJobId={managedAutomationUpdatingJobId}
              completionAuditAuditingDirectory={
                completionAuditAuditingDirectory
              }
              completionAuditSummary={
                completionAuditSummaries[skill.directory] ??
                completionAuditSummariesByDirectory?.[skill.directory]
              }
              onToggleManagedAutomationJob={handleToggleManagedAutomationJob}
              onAuditManagedAutomationJob={handleAuditManagedAutomationJob}
              onEnableRuntime={onEnableRuntime}
              onCreateManagedAutomationDraft={onCreateManagedAutomationDraft}
            />
          ))}
        </div>
      )}
    </section>
  );
}
