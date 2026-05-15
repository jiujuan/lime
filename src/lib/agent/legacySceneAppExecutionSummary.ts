import type {
  AgentRuntimeReviewDecisionTemplate,
  AgentRuntimeSaveReviewDecisionRequest,
} from "@/lib/api/agentRuntime";

export interface SceneAppDeliveryPartViewModel {
  key: string;
  label: string;
}

export interface SceneAppContextReferenceItemViewModel {
  key: string;
  label: string;
  sourceLabel?: string;
  contentTypeLabel?: string;
  usageLabel?: string;
  feedbackLabel?: string;
  selected?: boolean;
}

export interface SceneAppContextBaselineViewModel {
  activeLayers?: SceneAppDeliveryPartViewModel[];
  referenceCount?: number;
  referenceItems?: SceneAppContextReferenceItemViewModel[];
  tasteSummary?: string;
  feedbackSummary?: string;
  memoryRefs?: SceneAppDeliveryPartViewModel[];
  toolRefs?: SceneAppDeliveryPartViewModel[];
  tasteKeywords?: string[];
  avoidKeywords?: string[];
  feedbackSignals?: string[];
  notes?: string[];
}

export interface SceneAppProjectPackPlanViewModel {
  packKindLabel: string;
  completionStrategyLabel: string;
  viewerLabel?: string;
  primaryPart?: string;
  requiredParts: SceneAppDeliveryPartViewModel[];
  notes: string[];
}

export interface SceneAppGovernancePanelDestinationViewModel {
  key: string;
  label: string;
  description: string;
}

export interface SceneAppScorecardAggregateViewModel {
  status: "idle" | "good" | "watch" | "risk";
  statusLabel: string;
  summary: string;
  nextAction: string;
  actionLabel?: string;
  topFailureSignalLabel?: string;
  profileRef?: string;
  metricKeys: SceneAppDeliveryPartViewModel[];
  failureSignals: SceneAppDeliveryPartViewModel[];
  observedFailureSignals: SceneAppDeliveryPartViewModel[];
  destinations: SceneAppGovernancePanelDestinationViewModel[];
}

export interface SceneAppExecutionRuntimeBackflowViewModel {
  runId: string;
  statusLabel: string;
  statusTone: "default" | "accent" | "success" | "watch" | "risk";
  summary: string;
  nextAction: string;
  sourceLabel: string;
  deliveryCompletionLabel: string;
  evidenceSourceLabel: string;
  startedAtLabel: string;
  finishedAtLabel: string;
  scorecardActionLabel?: string;
  topFailureSignalLabel?: string;
  deliveryCompletedParts: SceneAppDeliveryPartViewModel[];
  deliveryMissingParts: SceneAppDeliveryPartViewModel[];
  observedFailureSignals: SceneAppDeliveryPartViewModel[];
  governanceArtifacts: SceneAppDeliveryPartViewModel[];
}

export interface SceneAppExecutionSummaryDescriptorSnapshot {
  deliveryContract?: string;
  deliveryProfile?: {
    viewerKind?: string;
    requiredParts?: string[];
    primaryPart?: string;
  };
  linkedServiceSkillId?: string;
  linkedSceneKey?: string;
}

export interface SceneAppExecutionSummaryViewModel {
  sceneappId: string;
  title: string;
  summary: string;
  businessLabel: string;
  typeLabel: string;
  executionChainLabel: string;
  deliveryContractLabel: string;
  planningStatusLabel: string;
  planningSummary: string;
  activeLayers: SceneAppDeliveryPartViewModel[];
  referenceCount: number;
  referenceItems: SceneAppContextReferenceItemViewModel[];
  tasteSummary?: string;
  feedbackSummary?: string;
  projectPackPlan: SceneAppProjectPackPlanViewModel | null;
  scorecardProfileRef?: string;
  scorecardMetricKeys: SceneAppDeliveryPartViewModel[];
  scorecardFailureSignals: SceneAppDeliveryPartViewModel[];
  scorecardAggregate?: SceneAppScorecardAggregateViewModel | null;
  notes: string[];
  descriptorSnapshot?: SceneAppExecutionSummaryDescriptorSnapshot;
  runtimeBackflow?: SceneAppExecutionRuntimeBackflowViewModel | null;
}

export type SceneAppRunStatus =
  | "queued"
  | "running"
  | "success"
  | "error"
  | "canceled"
  | "timeout";

export interface SceneAppRunSummary {
  runId: string;
  status: SceneAppRunStatus;
  sessionId?: string | null;
}

export interface SceneAppRuntimeArtifactRef {
  kind: string;
  label?: string | null;
  partKey?: string | null;
  relativePath?: string | null;
  absolutePath?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  source?: string | null;
}

export interface SceneAppRunEntryActionViewModel {
  kind: string;
  label: string;
  helperText: string;
  sessionId?: string | null;
  jobId?: string | null;
  serviceSceneRuntimeRef?: {
    sceneKey?: string | null;
  } | null;
}

export interface SceneAppRunDeliveryArtifactEntryViewModel {
  key: string;
  label: string;
  pathLabel: string;
  helperText: string;
  isPrimary: boolean;
  artifactRef: SceneAppRuntimeArtifactRef;
}

export interface SceneAppRunGovernanceArtifactEntryViewModel {
  key: string;
  label: string;
  pathLabel: string;
  helperText: string;
  artifactRef: SceneAppRuntimeArtifactRef;
}

export interface SceneAppRunGovernanceActionViewModel {
  key: string;
  label: string;
  helperText: string;
  primaryArtifactKind: string;
  primaryArtifactLabel: string;
  artifactKinds: string[];
}

export interface SceneAppRunDetailViewModel {
  runId: string;
  status: SceneAppRunStatus;
  statusLabel: string;
  stageLabel: string;
  summary: string;
  nextAction: string;
  sourceLabel: string;
  artifactCount: number;
  deliveryCompletionLabel: string;
  deliverySummary: string;
  deliveryRequiredParts: SceneAppDeliveryPartViewModel[];
  deliveryCompletedParts: SceneAppDeliveryPartViewModel[];
  deliveryMissingParts: SceneAppDeliveryPartViewModel[];
  deliveryPartCoverageKnown: boolean;
  deliveryViewerLabel?: string;
  packCompletionStrategyLabel?: string;
  packViewerLabel?: string;
  plannedDeliveryRequiredParts: SceneAppDeliveryPartViewModel[];
  packPlanNotes: string[];
  contextBaseline: SceneAppContextBaselineViewModel | null;
  deliveryArtifactEntries: SceneAppRunDeliveryArtifactEntryViewModel[];
  governanceActionEntries: SceneAppRunGovernanceActionViewModel[];
  governanceArtifactEntries: SceneAppRunGovernanceArtifactEntryViewModel[];
  failureSignalLabel?: string;
  evidenceSourceLabel: string;
  requestTelemetryLabel: string;
  artifactValidatorLabel: string;
  evidenceKnownGaps: string[];
  verificationFailureOutcomes: string[];
  startedAtLabel: string;
  finishedAtLabel: string;
  durationLabel: string;
  entryAction: SceneAppRunEntryActionViewModel | null;
}

export type SceneAppQuickReviewActionTone =
  | "positive"
  | "neutral"
  | "warning"
  | "risk";

export interface SceneAppQuickReviewAction {
  key: "accepted" | "deferred" | "rejected" | "needs_more_evidence";
  label: string;
  helperText: string;
  tone: SceneAppQuickReviewActionTone;
}

export const SCENEAPP_QUICK_REVIEW_ACTIONS: SceneAppQuickReviewAction[] = [
  {
    key: "accepted",
    label: "可继续复用",
    helperText: "这轮结果可以继续沿当前基线放量。",
    tone: "positive",
  },
  {
    key: "deferred",
    label: "继续观察",
    helperText: "先保留这轮结果，再补一轮样本判断。",
    tone: "neutral",
  },
  {
    key: "needs_more_evidence",
    label: "补证据",
    helperText: "先补齐会话证据、校验材料或复核记录。",
    tone: "warning",
  },
  {
    key: "rejected",
    label: "先别继续",
    helperText: "当前结果不建议继续复用，先修主卡点。",
    tone: "risk",
  },
] as const;

export function buildSceneAppQuickReviewDecisionRequest(params: {
  template: AgentRuntimeReviewDecisionTemplate;
  action: SceneAppQuickReviewAction;
  sceneTitle?: string | null;
  failureSignal?: string | null;
  sourceLabel?: string;
}): AgentRuntimeSaveReviewDecisionRequest {
  const sceneLabel = params.sceneTitle?.trim()
    ? `Skill「${params.sceneTitle.trim()}」`
    : "当前 Skill";
  const riskTags = params.failureSignal?.trim()
    ? [params.failureSignal.trim()]
    : [];
  const sourceLabel = params.sourceLabel?.trim() || "Skill";

  switch (params.action.key) {
    case "accepted":
      return {
        session_id: params.template.session_id,
        decision_status: "accepted",
        decision_summary: `${sceneLabel} 这轮结果可继续复用。`,
        chosen_fix_strategy: "沿当前参考、风格与这轮结果基线继续放量。",
        risk_level: "low",
        risk_tags: riskTags,
        human_reviewer: params.template.decision.human_reviewer,
        reviewed_at: undefined,
        followup_actions: ["继续复用当前结果链，补下一轮发布样本。"],
        regression_requirements:
          params.template.decision.regression_requirements,
        notes: `来自 ${sourceLabel} 轻量反馈入口。`,
      };
    case "deferred":
      return {
        session_id: params.template.session_id,
        decision_status: "deferred",
        decision_summary: `${sceneLabel} 先保留这轮结果，继续观察下一轮样本。`,
        chosen_fix_strategy: "补一轮样本后，再决定是否继续放量。",
        risk_level: "medium",
        risk_tags: riskTags,
        human_reviewer: params.template.decision.human_reviewer,
        reviewed_at: undefined,
        followup_actions: ["补下一轮样本，再回到这个 Skill 继续判断。"],
        regression_requirements:
          params.template.decision.regression_requirements,
        notes: `来自 ${sourceLabel} 轻量反馈入口。`,
      };
    case "needs_more_evidence":
      return {
        session_id: params.template.session_id,
        decision_status: "needs_more_evidence",
        decision_summary: `${sceneLabel} 当前证据不足，先补齐关键材料再判断。`,
        chosen_fix_strategy: "先补齐会话证据、结果校验与人工复核材料。",
        risk_level: "medium",
        risk_tags: riskTags,
        human_reviewer: params.template.decision.human_reviewer,
        reviewed_at: undefined,
        followup_actions: ["补会话证据", "补结果校验材料", "补人工复核记录"],
        regression_requirements:
          params.template.decision.regression_requirements,
        notes: `来自 ${sourceLabel} 轻量反馈入口。`,
      };
    case "rejected":
      return {
        session_id: params.template.session_id,
        decision_status: "rejected",
        decision_summary: `${sceneLabel} 当前结果暂不建议继续复用。`,
        chosen_fix_strategy: "先修主卡点，再重新启动这个 Skill。",
        risk_level: "high",
        risk_tags: riskTags,
        human_reviewer: params.template.decision.human_reviewer,
        reviewed_at: undefined,
        followup_actions: ["先修主要阻塞，再重新启动这个 Skill。"],
        regression_requirements:
          params.template.decision.regression_requirements,
        notes: `来自 ${sourceLabel} 轻量反馈入口。`,
      };
  }
}

export function formatSceneAppErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "请稍后重试";
}
