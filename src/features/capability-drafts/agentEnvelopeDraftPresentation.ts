import type { WorkspaceRegisteredSkillRecord } from "@/lib/api/capabilityDrafts";
import type {
  AgentRuntimeCompletionAuditSummary,
  AgentRuntimeWorkspaceSkillBinding,
} from "@/lib/api/agentRuntime";

export type AgentEnvelopeDraftStage =
  | "blocked"
  | "manual_enable_required"
  | "source_metadata_ready"
  | "evidence_ready";

export type AgentEnvelopeDraftEvidenceStatus =
  | "missing"
  | "source_metadata_only"
  | "evidence_pack_ready";

export interface WorkspaceSkillRuntimeSourceMetadata {
  workspaceRoot?: string;
  workspace_root?: string;
  authorizationScope?: string;
  authorization_scope?: string;
  directory?: string;
  registeredSkillDirectory?: string;
  registered_skill_directory?: string;
  skillName?: string;
  skill?: string;
  sourceDraftId?: string;
  source_draft_id?: string;
  sourceVerificationReportId?: string | null;
  source_verification_report_id?: string | null;
  permissionSummary?: string[];
  permission_summary?: string[];
}

export interface AgentEnvelopeDraftPresentation {
  id: string;
  name: string;
  stage: AgentEnvelopeDraftStage;
  statusLabel: string;
  actionLabel: string;
  actionEnabled: boolean;
  description: string;
  agentCardLabel: string;
  sharingLabel: string;
  sharingDiscoveryLabel: string;
  runbookLabel: string;
  memoryLabel: string;
  widgetLabel: string;
  permissionLabel: string;
  scheduleLabel: string;
  evidenceStatus: AgentEnvelopeDraftEvidenceStatus;
  evidenceLabel: string;
  sourceDraftId: string;
  sourceVerificationReportId?: string | null;
  registeredSkillDirectory: string;
}

export interface AgentEnvelopeDraftCompletionAuditLabelParts {
  decision: string;
  successfulOwnerRunCount: number;
  ownerRunCount: number;
  workspaceSkillToolCallCount: number;
  artifactCount: number;
  controlledGetExecutedCount: number;
  controlledGetArtifactCount: number;
  controlledGetRequired: boolean;
  blockingReasons: string[];
  missingControlledGetRequirement: boolean;
}

export interface AgentEnvelopeDraftPresentationCopy {
  actionBlocked?: string;
  actionDraft?: string;
  actionManualEnable?: string;
  agentCardPending?: string;
  blockedReasonFallback?: string;
  description?: string;
  discoveryPending?: string;
  evidenceMissing?: string;
  evidenceSourceMetadataOnly?: string;
  formatAgentCardReady?: (directory: string) => string;
  formatCompletionAuditEvidenceLabel?: (
    parts: AgentEnvelopeDraftCompletionAuditLabelParts,
  ) => string;
  formatDiscoveryReady?: (registeredSkillDirectory: string) => string;
  formatMemoryWithReport?: (reportId: string) => string;
  formatPendingEvidencePack?: (packId: string) => string;
  formatCompletedEvidencePack?: (packId?: string) => string;
  formatPermissionWithSummary?: (summary: string) => string;
  formatRunbook?: (name: string) => string;
  memoryPending?: string;
  permissionEmpty?: string;
  schedule?: string;
  sharingPending?: string;
  sharingReady?: string;
  statusLabels?: Partial<Record<AgentEnvelopeDraftStage, string>>;
  widgetPending?: string;
  widgetReady?: string;
}

export interface BuildAgentEnvelopeDraftPresentationParams {
  skill: WorkspaceRegisteredSkillRecord;
  binding?: AgentRuntimeWorkspaceSkillBinding;
  sourceMetadata?: WorkspaceSkillRuntimeSourceMetadata | null;
  evidencePackId?: string | null;
  completionAuditSummary?: AgentRuntimeCompletionAuditSummary | null;
  copy?: AgentEnvelopeDraftPresentationCopy;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  return (
    values.find((value) => typeof value === "string" && value.trim())?.trim() ??
    ""
  );
}

function sourcePermissionSummary(
  skill: WorkspaceRegisteredSkillRecord,
  binding?: AgentRuntimeWorkspaceSkillBinding,
  sourceMetadata?: WorkspaceSkillRuntimeSourceMetadata | null,
): string[] {
  const fromMetadata =
    sourceMetadata?.permissionSummary ?? sourceMetadata?.permission_summary;
  if (Array.isArray(fromMetadata) && fromMetadata.length > 0) {
    return fromMetadata.filter(Boolean);
  }
  if (binding?.permission_summary?.length) {
    return binding.permission_summary;
  }
  return skill.permissionSummary;
}

function buildPermissionLabel(
  permissionSummary: string[],
  copy?: AgentEnvelopeDraftPresentationCopy,
): string {
  if (permissionSummary.length === 0) {
    return copy?.permissionEmpty ?? "权限：默认手动确认，未声明额外外部写权限。";
  }
  const summary = permissionSummary.slice(0, 2).join(" / ");
  return copy?.formatPermissionWithSummary?.(summary) ?? `权限：${summary}。`;
}

function resolveStage(
  binding?: AgentRuntimeWorkspaceSkillBinding,
  sourceMetadata?: WorkspaceSkillRuntimeSourceMetadata | null,
  evidencePackId?: string | null,
  completionAuditSummary?: AgentRuntimeCompletionAuditSummary | null,
): AgentEnvelopeDraftStage {
  if (binding?.binding_status === "blocked") {
    return "blocked";
  }
  if (isCompletionAuditReady(completionAuditSummary)) {
    return "evidence_ready";
  }
  if (completionAuditSummary) {
    return "source_metadata_ready";
  }
  if (sourceMetadata || evidencePackId?.trim()) {
    return "source_metadata_ready";
  }
  return "manual_enable_required";
}

function isCompletionAuditReady(
  summary?: AgentRuntimeCompletionAuditSummary | null,
): boolean {
  return Boolean(
    summary?.decision === "completed" &&
    summary.required_evidence.automation_owner &&
    summary.required_evidence.workspace_skill_tool_call &&
    summary.required_evidence.artifact_or_timeline &&
    isControlledGetEvidenceRequirementSatisfied(summary),
  );
}

function isControlledGetEvidenceRequirementSatisfied(
  summary: AgentRuntimeCompletionAuditSummary,
): boolean {
  if (!summary.controlled_get_evidence_required) {
    return true;
  }
  return summary.required_evidence.controlled_get_evidence === true;
}

function evidenceStatusForStage(
  stage: AgentEnvelopeDraftStage,
): AgentEnvelopeDraftEvidenceStatus {
  if (stage === "evidence_ready") {
    return "evidence_pack_ready";
  }
  if (stage === "source_metadata_ready") {
    return "source_metadata_only";
  }
  return "missing";
}

function buildCompletionAuditEvidenceLabel(
  summary: AgentRuntimeCompletionAuditSummary,
  copy?: AgentEnvelopeDraftPresentationCopy,
): string {
  const blockingReasons = summary.blocking_reasons.filter(Boolean);
  const controlledGetExecuted =
    summary.controlled_get_evidence_executed_count ?? 0;
  const controlledGetArtifacts =
    summary.controlled_get_evidence_artifact_count ?? 0;
  const controlledGetRequired =
    summary.controlled_get_evidence_required ?? false;
  const controlledGetLabel =
    controlledGetExecuted > 0 || controlledGetArtifacts > 0
      ? `，受控 GET ${controlledGetExecuted}/${controlledGetArtifacts} executed`
      : controlledGetRequired
        ? "，受控 GET required 0/0 executed"
        : "";
  const blockingLabel =
    blockingReasons.length > 0
      ? `，阻塞：${blockingReasons.slice(0, 2).join(" / ")}`
      : "";
  const missingControlledGetRequirement =
    !isControlledGetEvidenceRequirementSatisfied(summary);
  const parts: AgentEnvelopeDraftCompletionAuditLabelParts = {
    decision: summary.decision,
    successfulOwnerRunCount: summary.successful_owner_run_count,
    ownerRunCount: summary.owner_run_count,
    workspaceSkillToolCallCount: summary.workspace_skill_tool_call_count,
    artifactCount: summary.artifact_count,
    controlledGetExecutedCount: controlledGetExecuted,
    controlledGetArtifactCount: controlledGetArtifacts,
    controlledGetRequired,
    blockingReasons,
    missingControlledGetRequirement,
  };
  const copiedLabel = copy?.formatCompletionAuditEvidenceLabel?.(parts);
  if (copiedLabel) {
    return copiedLabel;
  }
  const suffix = missingControlledGetRequirement
    ? "；缺受控 GET evidence，不能固化为 Agent"
    : summary.decision === "completed"
      ? ""
      : "；未 completed，不能固化为 Agent";

  return `Evidence：completion audit ${summary.decision}，owner ${summary.successful_owner_run_count}/${summary.owner_run_count}，ToolCall ${summary.workspace_skill_tool_call_count}，artifact ${summary.artifact_count}${controlledGetLabel}${blockingLabel}${suffix}。`;
}

export function buildAgentEnvelopeDraftPresentation({
  skill,
  binding,
  sourceMetadata,
  evidencePackId,
  completionAuditSummary,
  copy,
}: BuildAgentEnvelopeDraftPresentationParams): AgentEnvelopeDraftPresentation {
  const completionAuditReady = isCompletionAuditReady(completionAuditSummary);
  const stage = resolveStage(
    binding,
    sourceMetadata,
    evidencePackId,
    completionAuditSummary,
  );
  const evidenceStatus = evidenceStatusForStage(stage);
  const sourceDraftId = firstNonEmpty(
    sourceMetadata?.sourceDraftId,
    sourceMetadata?.source_draft_id,
    binding?.registration.sourceDraftId,
    binding?.registration.source_draft_id,
    skill.registration.sourceDraftId,
  );
  const sourceVerificationReportId =
    firstNonEmpty(
      sourceMetadata?.sourceVerificationReportId ?? undefined,
      sourceMetadata?.source_verification_report_id ?? undefined,
      binding?.registration.sourceVerificationReportId ?? undefined,
      binding?.registration.source_verification_report_id ?? undefined,
      skill.registration.sourceVerificationReportId ?? undefined,
    ) || null;
  const registeredSkillDirectory = firstNonEmpty(
    sourceMetadata?.registeredSkillDirectory,
    sourceMetadata?.registered_skill_directory,
    binding?.registered_skill_directory,
    skill.registeredSkillDirectory,
    skill.registration.registeredSkillDirectory,
  );
  const permissionSummary = sourcePermissionSummary(
    skill,
    binding,
    sourceMetadata,
  );

  const blockedReason =
    binding?.binding_status === "blocked"
      ? binding.binding_status_reason ||
        copy?.blockedReasonFallback ||
        "runtime binding 当前被 gate 阻断"
      : "";

  const statusLabelByStage: Record<AgentEnvelopeDraftStage, string> = {
    blocked: copy?.statusLabels?.blocked ?? "Agent 草案阻塞",
    manual_enable_required:
      copy?.statusLabels?.manual_enable_required ?? "等待成功运行",
    source_metadata_ready:
      copy?.statusLabels?.source_metadata_ready ?? "等待 Completion Audit",
    evidence_ready: copy?.statusLabels?.evidence_ready ?? "Evidence 已就绪",
  };

  const pendingEvidencePackLabel =
    evidencePackId?.trim() && !completionAuditReady
      ? copy?.formatPendingEvidencePack?.(evidencePackId.trim()) ??
        `Evidence：已关联 evidence pack ${evidencePackId.trim()}，但还缺 completed completion audit，不能固化为 Agent。`
      : null;
  const completionAuditEvidenceLabel = completionAuditSummary
    ? buildCompletionAuditEvidenceLabel(completionAuditSummary, copy)
    : null;
  const completedEvidenceLabel =
    completionAuditEvidenceLabel ??
    copy?.formatCompletedEvidencePack?.(evidencePackId?.trim() || undefined) ??
    `Evidence：已关联 evidence pack${evidencePackId ? ` ${evidencePackId}` : ""}。`;

  const evidenceLabelByStatus: Record<
    AgentEnvelopeDraftEvidenceStatus,
    string
  > = {
    missing:
      copy?.evidenceMissing ??
      "Evidence：还没有成功运行证据；先通过本回合启用拿到一次结果。",
    source_metadata_only:
      completionAuditEvidenceLabel ??
      pendingEvidencePackLabel ??
      copy?.evidenceSourceMetadataOnly ??
      "Evidence：已有 P3E source metadata，可追踪本次 session 授权来源。",
    evidence_pack_ready: completedEvidenceLabel,
  };

  return {
    id: `agent-envelope:${skill.directory}`,
    name: skill.name || skill.directory,
    stage,
    statusLabel: statusLabelByStage[stage],
    actionLabel:
      stage === "blocked"
        ? copy?.actionBlocked ?? "先解除阻塞"
        : stage === "manual_enable_required"
          ? copy?.actionManualEnable ?? "先本回合启用"
          : copy?.actionDraft ?? "转成 Agent 草案",
    actionEnabled: completionAuditReady,
    description:
      stage === "blocked"
        ? blockedReason
        : copy?.description ??
          "成功运行后可把 Skill、权限、手动 rerun 和 evidence 组合成 Workspace Agent envelope。",
    agentCardLabel:
      stage === "evidence_ready"
        ? copy?.formatAgentCardReady?.(skill.directory) ??
          `Agent card：workspace-local/${skill.directory}，由已注册 Skill、Managed Job 和 completion audit 派生。`
        : copy?.agentCardPending ??
          "Agent card：等待 evidence-ready 后派生，不创建平行持久化实体。",
    sharingLabel:
      stage === "evidence_ready"
        ? copy?.sharingReady ??
          "Sharing：可在当前 workspace / team 内共享；不进入 public Marketplace。"
        : copy?.sharingPending ?? "Sharing：未完成审计前仅对当前操作者展示草案。",
    sharingDiscoveryLabel: registeredSkillDirectory
      ? copy?.formatDiscoveryReady?.(registeredSkillDirectory) ??
        `Discovery：同 workspace 成员通过 registered skill 发现 ${registeredSkillDirectory}，复用同一 Managed Job / evidence。`
      : copy?.discoveryPending ??
        "Discovery：等待 workspace-local skill 注册路径后再进入团队发现。",
    runbookLabel:
      copy?.formatRunbook?.(
        firstNonEmpty(
          sourceMetadata?.skillName,
          sourceMetadata?.skill,
          `project:${skill.directory}`,
        ),
      ) ??
      `Runbook：${firstNonEmpty(
        sourceMetadata?.skillName,
        sourceMetadata?.skill,
        `project:${skill.directory}`,
      )}`,
    memoryLabel: sourceVerificationReportId
      ? copy?.formatMemoryWithReport?.(sourceVerificationReportId) ??
        `Memory：引用 verification report ${sourceVerificationReportId} 与后续运行修正。`
      : copy?.memoryPending ??
        "Memory：等待首轮运行后记录用户偏好、方法论和修正历史。",
    widgetLabel:
      stage === "evidence_ready"
        ? copy?.widgetReady ??
          "Widget：展示 Managed Job 状态、最近产物、审计结论和下一步动作。"
        : copy?.widgetPending ??
          "Widget：等待运行后展示状态、产物、阻塞点和 evidence 入口。",
    permissionLabel: buildPermissionLabel(permissionSummary, copy),
    scheduleLabel:
      copy?.schedule ?? "Schedule：第一刀仅支持 manual rerun 草案，不创建长期任务。",
    evidenceStatus,
    evidenceLabel: evidenceLabelByStatus[evidenceStatus],
    sourceDraftId,
    sourceVerificationReportId,
    registeredSkillDirectory,
  };
}
