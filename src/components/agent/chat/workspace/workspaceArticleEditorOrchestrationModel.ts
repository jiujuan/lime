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
import type {
  WorkspaceArticleWorkflowRun,
  WorkspaceArticleWorkflowStep,
} from "./workspaceArticleWorkspaceWorkflowFacts";

export function buildWorkspacePluginOrchestrationModel(
  articleWorkspace: WorkspaceArticleWorkspace,
  preview: WorkspaceArticleWorkspaceStructuredPreview,
): WorkspacePluginOrchestrationRailModel | null {
  const workerEvidence = articleWorkspace.workerEvidence ?? [];
  const workflowRun = selectPluginWorkflowRun(
    articleWorkspace.workflowRuns ?? [],
  );
  const evidence = selectPluginOrchestrationEvidence(workerEvidence);
  const relatedEvidence = selectRelatedOrchestrationEvidence(
    workerEvidence,
    evidence,
    workflowRun?.workflowKey ?? evidence?.workflowKey ?? null,
  );
  const workflowSteps =
    workflowRun?.steps.map(readWorkflowRunStep).filter(Boolean) ?? [];
  const evidenceSteps =
    workflowSteps.length > 0
      ? []
      : (evidence?.orchestration.map(
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
        ) ?? []);
  const planSteps =
    workflowSteps.length > 0 || evidenceSteps.length > 0
      ? []
      : preview.writingPlan.map(readWritingPlanOrchestrationStep);
  const steps =
    workflowSteps.length > 0
      ? workflowSteps
      : evidenceSteps.length > 0
        ? evidenceSteps
        : planSteps;
  const subagentRefs = uniqueStrings([
    ...(workflowRun?.steps.flatMap((step) =>
      step.subagent ? [step.subagent] : [],
    ) ?? []),
    ...(evidence?.subagents ?? []),
    ...steps.flatMap((step) => (step.subagent ? [step.subagent] : [])),
  ]);
  const skillRefs = uniqueStrings([
    ...(workflowRun?.steps.flatMap((step) => step.skillRefs) ?? []),
    ...(evidence?.skillRefs ?? []),
    ...steps.flatMap((step) => step.skillRefs),
  ]);
  const cliRefs = uniqueStrings(
    relatedEvidence.flatMap((item) => item.cliRefs ?? []),
  );
  const connectorRefs = uniqueStrings(
    relatedEvidence.flatMap((item) => item.connectorRefs ?? []),
  );
  const hookLabels = uniqueStrings(
    relatedEvidence.flatMap((item) => hookPolicyLabels(item)),
  );
  const hasEvidence =
    steps.length > 0 ||
    Boolean(workflowRun?.workflowKey) ||
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
    workflowKey: workflowRun?.workflowKey ?? evidence?.workflowKey ?? null,
    steps,
    subagentRefs,
    skillRefs,
    cliRefs,
    connectorRefs,
    hookLabels,
  };
}

function selectRelatedOrchestrationEvidence(
  workerEvidence: readonly WorkspaceArticleWorkspaceWorkerEvidenceItem[],
  selected: WorkspaceArticleWorkspaceWorkerEvidenceItem | null,
  preferredWorkflowKey: string | null,
): WorkspaceArticleWorkspaceWorkerEvidenceItem[] {
  if (!selected && !preferredWorkflowKey) {
    return [];
  }
  const workflowKey = preferredWorkflowKey ?? selected?.workflowKey ?? null;
  const related = workerEvidence.filter((item) => {
    if (item.eventType === "plugin_worker.hook") {
      return false;
    }
    if (workflowKey) {
      return item.workflowKey === workflowKey;
    }
    return item === selected;
  });
  if (related.length > 0) {
    return related;
  }
  return selected ? [selected] : [];
}

export const buildWorkspaceArticleEditorOrchestrationModel =
  buildWorkspacePluginOrchestrationModel;

function selectPluginOrchestrationEvidence(
  workerEvidence: readonly WorkspaceArticleWorkspaceWorkerEvidenceItem[],
): WorkspaceArticleWorkspaceWorkerEvidenceItem | null {
  let selected: WorkspaceArticleWorkspaceWorkerEvidenceItem | null = null;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (const evidence of workerEvidence) {
    if (evidence.eventType === "plugin_worker.hook") {
      continue;
    }
    const score = orchestrationEvidenceScore(evidence);
    if (score > selectedScore) {
      selected = evidence;
      selectedScore = score;
    }
  }
  return selected;
}

function selectPluginWorkflowRun(
  workflowRuns: readonly WorkspaceArticleWorkflowRun[],
): WorkspaceArticleWorkflowRun | null {
  let selected: WorkspaceArticleWorkflowRun | null = null;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (const run of workflowRuns) {
    const score = workflowRunScore(run);
    if (score > selectedScore) {
      selected = run;
      selectedScore = score;
    }
  }
  return selected;
}

function workflowRunScore(run: WorkspaceArticleWorkflowRun): number {
  if (!run.workflowKey && run.steps.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }
  return (
    (run.status === "running" ? 120 : 0) +
    (run.status === "completed" ? 100 : 0) +
    (run.status === "failed" ? 80 : 0) +
    (run.workflowKey ? 20 : 0) +
    run.steps.length * 10 +
    (run.eventCount ?? 0)
  );
}

function readWorkflowRunStep(
  step: WorkspaceArticleWorkflowStep,
): WorkspacePluginOrchestrationRailStep {
  return {
    id: step.id,
    title: step.title,
    subagent: step.subagent,
    skillRefs: step.skillRefs,
    status: step.status,
    summary: step.progressMessage ?? step.expectedOutput,
    done: statusToDone(step.status),
  };
}

function hasOrchestrationEvidence(
  evidence: WorkspaceArticleWorkspaceWorkerEvidenceItem,
): boolean {
  return Boolean(
    evidence.workflowKey ||
    evidence.subagents.length > 0 ||
    evidence.skillRefs.length > 0 ||
    (evidence.cliRefs ?? []).length > 0 ||
    (evidence.connectorRefs ?? []).length > 0 ||
    (evidence.hookRefs ?? []).length > 0 ||
    evidence.hookPolicy ||
    evidence.orchestration.length > 0,
  );
}

function orchestrationEvidenceScore(
  evidence: WorkspaceArticleWorkspaceWorkerEvidenceItem,
): number {
  if (!hasOrchestrationEvidence(evidence)) {
    return Number.NEGATIVE_INFINITY;
  }
  return (
    (evidence.status === "completed" ? 100 : 0) +
    (evidence.eventType === "artifact.snapshot" ? 50 : 0) +
    (evidence.taskKind === "content.article.generate" ? 20 : 0) +
    (evidence.workflowKey ? 10 : 0) +
    evidence.orchestration.length * 8 +
    evidence.subagents.length * 4 +
    evidence.skillRefs.length * 4 +
    (evidence.cliRefs ?? []).length * 2 +
    (evidence.connectorRefs ?? []).length * 2 +
    (evidence.hookRefs ?? []).length * 2 +
    (evidence.hookPolicy ? 4 : 0)
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
    return evidence?.hookRefs ?? [];
  }
  return [
    ...(evidence.hookRefs ?? []),
    ...Object.entries(evidence.hookPolicy).flatMap(([scope, hooks]) =>
      hooks.map((hook) => `${scope}:${hook}`),
    ),
  ];
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
