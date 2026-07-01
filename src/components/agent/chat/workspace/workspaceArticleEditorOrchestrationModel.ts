import type {
  WorkspacePluginOrchestrationRailModel,
  WorkspacePluginOrchestrationRailStep,
} from "./WorkspacePluginOrchestrationRail";
import type {
  WorkspaceArticleWorkspace,
  WorkspaceArticleWorkspaceStructuredPreview,
  WorkspaceArticleWorkspaceWritingPlanStep,
} from "./workspaceArticleWorkspaceModel";
import type { WorkspaceArticleWorkspaceWorkerEvidenceItem } from "./workspaceArticleWorkspaceWorkerEvidence";

export function buildWorkspacePluginOrchestrationModel(
  articleWorkspace: WorkspaceArticleWorkspace,
  preview: WorkspaceArticleWorkspaceStructuredPreview,
): WorkspacePluginOrchestrationRailModel | null {
  const evidence = selectPluginOrchestrationEvidence(
    articleWorkspace.workerEvidence ?? [],
  );
  const evidenceSteps =
    evidence?.orchestration.map(
      (step): WorkspacePluginOrchestrationRailStep => {
        const planStep = preview.writingPlan.find(
          (item) => item.id === step.id,
        );
        return {
          id: step.id,
          title: step.title,
          subagent: step.subagent,
          skillRefs: step.skillRefs,
          status: step.status,
          summary: step.summary ?? step.expectedOutput,
          done: planStep?.done ?? statusToDone(step.status),
        };
      },
    ) ?? [];
  const planSteps =
    evidenceSteps.length > 0
      ? []
      : preview.writingPlan.map(readWritingPlanOrchestrationStep);
  const steps = evidenceSteps.length > 0 ? evidenceSteps : planSteps;
  const subagentRefs = uniqueStrings([
    ...(evidence?.subagents ?? []),
    ...steps.flatMap((step) => (step.subagent ? [step.subagent] : [])),
  ]);
  const skillRefs = uniqueStrings([
    ...(evidence?.skillRefs ?? []),
    ...steps.flatMap((step) => step.skillRefs),
  ]);
  const cliRefs = uniqueStrings(evidence?.cliRefs ?? []);
  const connectorRefs = uniqueStrings(evidence?.connectorRefs ?? []);
  const hookLabels = hookPolicyLabels(evidence);
  const hasEvidence =
    steps.length > 0 ||
    Boolean(evidence?.workflowKey) ||
    subagentRefs.length > 0 ||
    skillRefs.length > 0 ||
    cliRefs.length > 0 ||
    connectorRefs.length > 0 ||
    hookLabels.length > 0;

  if (!hasEvidence) {
    return null;
  }

  return {
    workflowKey: evidence?.workflowKey ?? null,
    steps,
    subagentRefs,
    skillRefs,
    cliRefs,
    connectorRefs,
    hookLabels,
  };
}

export const buildWorkspaceArticleEditorOrchestrationModel =
  buildWorkspacePluginOrchestrationModel;

function selectPluginOrchestrationEvidence(
  workerEvidence: readonly WorkspaceArticleWorkspaceWorkerEvidenceItem[],
): WorkspaceArticleWorkspaceWorkerEvidenceItem | null {
  return (
    workerEvidence.find(isCompletedOrchestrationEvidence) ??
    workerEvidence.find(isNonHookOrchestrationEvidence) ??
    null
  );
}

function isCompletedOrchestrationEvidence(
  evidence: WorkspaceArticleWorkspaceWorkerEvidenceItem,
): boolean {
  return (
    evidence.status === "completed" &&
    evidence.eventType === "artifact.snapshot" &&
    hasOrchestrationEvidence(evidence)
  );
}

function isNonHookOrchestrationEvidence(
  evidence: WorkspaceArticleWorkspaceWorkerEvidenceItem,
): boolean {
  return (
    evidence.eventType !== "agent_app_worker.hook" &&
    hasOrchestrationEvidence(evidence)
  );
}

function hasOrchestrationEvidence(
  evidence: WorkspaceArticleWorkspaceWorkerEvidenceItem,
): boolean {
  return Boolean(
    evidence.workflowKey ||
    evidence.subagents.length > 0 ||
    evidence.skillRefs.length > 0 ||
    evidence.cliRefs.length > 0 ||
    evidence.connectorRefs.length > 0 ||
    evidence.hookPolicy ||
    evidence.orchestration.length > 0,
  );
}

function readWritingPlanOrchestrationStep(
  step: WorkspaceArticleWorkspaceWritingPlanStep,
): WorkspacePluginOrchestrationRailStep {
  return {
    id: step.id,
    title: step.title,
    subagent: step.owner ?? null,
    skillRefs: step.skillRef ? [step.skillRef] : [],
    status: null,
    summary: step.output ?? step.goal ?? null,
    done: step.done ?? null,
  };
}

function hookPolicyLabels(
  evidence: WorkspaceArticleWorkspaceWorkerEvidenceItem | null | undefined,
): string[] {
  if (!evidence?.hookPolicy) {
    return [];
  }
  return Object.entries(evidence.hookPolicy).flatMap(([scope, hooks]) =>
    hooks.map((hook) => `${scope}:${hook}`),
  );
}

function statusToDone(status: string | null): boolean | null {
  if (!status) {
    return null;
  }
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "done") {
    return true;
  }
  if (normalized === "pending" || normalized === "queued") {
    return false;
  }
  return null;
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    items.push(normalized);
  }
  return items;
}
