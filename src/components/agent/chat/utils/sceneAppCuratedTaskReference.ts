import type {
  SceneAppExecutionSummaryViewModel,
  SceneAppRunDetailViewModel,
} from "@/lib/sceneapp/product";
import {
  buildCuratedTaskLaunchInputPrefillFromReferenceEntries,
  extractCuratedTaskReferenceMemoryIds,
  mergeCuratedTaskReferenceEntries,
  type CuratedTaskReferenceEntry,
} from "./curatedTaskReferenceSelection";
import {
  buildCuratedTaskLaunchPrompt,
  type CuratedTaskInputValues,
  findCuratedTaskTemplateById,
} from "./curatedTaskTemplates";
import agentSourceResource from "@/i18n/resources/zh-CN/agent.json";
import type { InputCapabilitySendRoute } from "../skill-selection/inputCapabilitySelection";

type AgentSourceResourceKey = keyof typeof agentSourceResource;

function interpolateSceneAppReferenceSourceTemplate(
  template: string,
  values?: Record<string, number | string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    const value = values?.[name];
    return value == null ? match : String(value);
  });
}

function translateSceneAppReferenceSourceKey(
  key: string,
  values?: Record<string, number | string>,
): string {
  const template = agentSourceResource[key as AgentSourceResourceKey] ?? key;
  return interpolateSceneAppReferenceSourceTemplate(template, values);
}

function normalizeOptionalText(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function dedupeNonEmptyText(
  values: Array<string | null | undefined>,
): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeOptionalText(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMarkedSection(
  source: string,
  label: string,
  nextLabels: string[],
): string | undefined {
  const lookahead = nextLabels
    .map((item) => `${escapeRegExp(item)}：`)
    .join("|");
  const pattern =
    lookahead.length > 0
      ? `${escapeRegExp(label)}：\\s*(.+?)(?=\\s*(?:${lookahead})|$)`
      : `${escapeRegExp(label)}：\\s*(.+)$`;
  const match = source.match(new RegExp(pattern));
  return normalizeOptionalText(match?.[1]);
}

function buildSceneAppExistingResultsSummary(params: {
  summary: SceneAppExecutionSummaryViewModel;
  latestRunDetailView?: SceneAppRunDetailViewModel | null;
}): string {
  const { summary, latestRunDetailView } = params;
  const sections = [
    summary.summary,
    latestRunDetailView?.summary,
    latestRunDetailView?.deliveryCompletionLabel,
    latestRunDetailView?.failureSignalLabel
      ? `当前卡点：${latestRunDetailView.failureSignalLabel}`
      : null,
    latestRunDetailView?.nextAction
      ? `建议下一步：${latestRunDetailView.nextAction}`
      : null,
    summary.scorecardAggregate?.statusLabel
      ? `当前判断：${summary.scorecardAggregate.statusLabel}`
      : null,
    summary.scorecardAggregate?.summary,
    summary.scorecardAggregate?.nextAction
      ? `经营动作：${summary.scorecardAggregate.nextAction}`
      : null,
    summary.scorecardAggregate?.destinations?.length
      ? `更适合去向：${summary.scorecardAggregate.destinations
          .map((item) => item.label)
          .join(" / ")}`
      : null,
    summary.feedbackSummary,
  ];

  return truncateText(dedupeNonEmptyText(sections).join(" "), 280);
}

export interface SceneAppExecutionReviewPrefillSnapshot {
  sourceTitle: string;
  projectGoal?: string;
  existingResults?: string;
  statusLabel?: string;
  failureSignalLabel?: string;
  nextAction?: string;
  operatingAction?: string;
  destinationsLabel?: string;
}

export interface SceneAppCuratedTaskReferenceCopy {
  categoryLabel?: string;
  resultSummaryFallback?: string;
  resultTitleFallback?: string;
  formatDestinationHighlight?: (value: string) => string;
  formatFailureSignalHighlight?: (value: string) => string;
  formatFollowUpBannerMessage?: (title: string) => string;
  formatOperatingActionHighlight?: (value: string) => string;
  formatStatusHighlight?: (value: string) => string;
}

export interface ResolvedSceneAppCuratedTaskReferenceCopy {
  categoryLabel: string;
  resultSummaryFallback: string;
  resultTitleFallback: string;
  formatDestinationHighlight: (value: string) => string;
  formatFailureSignalHighlight: (value: string) => string;
  formatFollowUpBannerMessage: (title: string) => string;
  formatOperatingActionHighlight: (value: string) => string;
  formatStatusHighlight: (value: string) => string;
}

const SOURCE_SCENE_APP_CURATED_TASK_REFERENCE_COPY: ResolvedSceneAppCuratedTaskReferenceCopy =
  {
    categoryLabel: translateSceneAppReferenceSourceKey(
      "curatedTask.sceneAppReference.categoryLabel",
    ),
    resultSummaryFallback: translateSceneAppReferenceSourceKey(
      "curatedTask.sceneAppReference.resultSummaryFallback",
    ),
    resultTitleFallback: translateSceneAppReferenceSourceKey(
      "curatedTask.sceneAppReference.resultTitleFallback",
    ),
    formatDestinationHighlight: (value) =>
      translateSceneAppReferenceSourceKey(
        "curatedTask.sceneAppReference.highlight.destination",
        { value },
      ),
    formatFailureSignalHighlight: (value) =>
      translateSceneAppReferenceSourceKey(
        "curatedTask.sceneAppReference.highlight.failureSignal",
        { value },
      ),
    formatFollowUpBannerMessage: (title) =>
      translateSceneAppReferenceSourceKey(
        "curatedTask.sceneAppReference.followUpBanner",
        { title },
      ),
    formatOperatingActionHighlight: (value) =>
      translateSceneAppReferenceSourceKey(
        "curatedTask.sceneAppReference.highlight.operatingAction",
        { value },
      ),
    formatStatusHighlight: (value) =>
      translateSceneAppReferenceSourceKey(
        "curatedTask.sceneAppReference.highlight.status",
        { value },
      ),
  };

export function resolveSceneAppCuratedTaskReferenceCopy(
  copy?: SceneAppCuratedTaskReferenceCopy,
): ResolvedSceneAppCuratedTaskReferenceCopy {
  return {
    ...SOURCE_SCENE_APP_CURATED_TASK_REFERENCE_COPY,
    ...(copy ?? {}),
  };
}

const SCENEAPP_REVIEW_BASELINE_FALLBACK_TASK_ID = "account-project-review";

function hasBaselinePrefillFields(
  prefill?: CuratedTaskInputValues | null,
): boolean {
  if (!prefill) {
    return false;
  }

  return Boolean(
    normalizeOptionalText(prefill.project_goal) ||
    normalizeOptionalText(prefill.existing_results),
  );
}

export function buildSceneAppExecutionReviewPrefillSnapshot(params: {
  referenceEntries?: Array<CuratedTaskReferenceEntry | null | undefined> | null;
  taskId?: string | null;
}): SceneAppExecutionReviewPrefillSnapshot | null {
  const taskId =
    normalizeOptionalText(params.taskId) ||
    SCENEAPP_REVIEW_BASELINE_FALLBACK_TASK_ID;
  const candidateTaskIds = Array.from(
    new Set([taskId, SCENEAPP_REVIEW_BASELINE_FALLBACK_TASK_ID]),
  );
  const referenceEntry = mergeCuratedTaskReferenceEntries(
    params.referenceEntries ?? [],
  ).find((entry) => {
    return candidateTaskIds.some((candidateTaskId) =>
      Boolean(entry.taskPrefillByTaskId?.[candidateTaskId]),
    );
  });

  if (!referenceEntry) {
    return null;
  }

  const matchedTaskId = candidateTaskIds.find((candidateTaskId) =>
    hasBaselinePrefillFields(
      referenceEntry.taskPrefillByTaskId?.[candidateTaskId],
    ),
  );
  const prefill = matchedTaskId
    ? referenceEntry.taskPrefillByTaskId?.[matchedTaskId]
    : candidateTaskIds
        .map(
          (candidateTaskId) =>
            referenceEntry.taskPrefillByTaskId?.[candidateTaskId],
        )
        .find((item) => Boolean(item));
  const existingResults = normalizeOptionalText(prefill?.existing_results);
  const normalizedExistingResults = existingResults || "";
  const snapshot: SceneAppExecutionReviewPrefillSnapshot = {
    sourceTitle: referenceEntry.title,
    projectGoal: normalizeOptionalText(prefill?.project_goal),
    existingResults,
    statusLabel: extractMarkedSection(normalizedExistingResults, "当前判断", [
      "经营动作",
      "更适合去向",
      "当前卡点",
      "当前信号",
      "建议下一步",
    ]),
    failureSignalLabel:
      extractMarkedSection(normalizedExistingResults, "当前卡点", [
        "建议下一步",
        "当前判断",
        "经营动作",
        "更适合去向",
        "当前信号",
      ]) ||
      extractMarkedSection(normalizedExistingResults, "当前信号", [
        "建议下一步",
        "当前判断",
        "经营动作",
        "更适合去向",
      ]),
    nextAction: extractMarkedSection(normalizedExistingResults, "建议下一步", [
      "当前判断",
      "经营动作",
      "更适合去向",
    ]),
    operatingAction: extractMarkedSection(
      normalizedExistingResults,
      "经营动作",
      ["更适合去向"],
    ),
    destinationsLabel: extractMarkedSection(
      normalizedExistingResults,
      "更适合去向",
      [],
    ),
  };

  return snapshot;
}

export function buildSceneAppExecutionReviewPrefillHighlights(
  snapshot?: SceneAppExecutionReviewPrefillSnapshot | null,
  copyInput?: SceneAppCuratedTaskReferenceCopy,
): string[] {
  if (!snapshot) {
    return [];
  }

  const copy = resolveSceneAppCuratedTaskReferenceCopy(copyInput);
  return dedupeNonEmptyText([
    snapshot.statusLabel
      ? copy.formatStatusHighlight(snapshot.statusLabel)
      : null,
    snapshot.failureSignalLabel
      ? copy.formatFailureSignalHighlight(snapshot.failureSignalLabel)
      : null,
    snapshot.operatingAction
      ? copy.formatOperatingActionHighlight(snapshot.operatingAction)
      : null,
    snapshot.destinationsLabel
      ? copy.formatDestinationHighlight(snapshot.destinationsLabel)
      : null,
  ]);
}

function buildSceneAppExecutionBaselinePromptBlock(
  snapshot?: SceneAppExecutionReviewPrefillSnapshot | null,
): string | null {
  if (!snapshot) {
    return null;
  }

  const lines = dedupeNonEmptyText([
    snapshot.sourceTitle ? `当前结果基线：${snapshot.sourceTitle}` : null,
    snapshot.projectGoal ? `当前项目目标：${snapshot.projectGoal}` : null,
    snapshot.existingResults
      ? `当前已有结果：${snapshot.existingResults}`
      : null,
  ]);
  if (lines.length === 0) {
    return null;
  }

  return `继续沿这轮项目结果基线推进：\n${lines
    .map((line) => `- ${line}`)
    .join("\n")}`;
}

export function buildCuratedTaskReferenceEntryFromSceneAppExecution(params: {
  summary?: SceneAppExecutionSummaryViewModel | null;
  latestRunDetailView?: SceneAppRunDetailViewModel | null;
  copy?: SceneAppCuratedTaskReferenceCopy;
}): CuratedTaskReferenceEntry | null {
  const { summary, latestRunDetailView } = params;
  const sceneappId = normalizeOptionalText(summary?.sceneappId);
  if (!summary || !sceneappId) {
    return null;
  }

  const copy = resolveSceneAppCuratedTaskReferenceCopy(params.copy);
  const runId =
    normalizeOptionalText(latestRunDetailView?.runId) ||
    normalizeOptionalText(summary.runtimeBackflow?.runId);
  const id = runId
    ? `sceneapp:${sceneappId}:run:${runId}`
    : `sceneapp:${sceneappId}`;
  const title =
    normalizeOptionalText(summary.title) || copy.resultTitleFallback;
  const summaryText = truncateText(
    dedupeNonEmptyText([
      latestRunDetailView?.summary,
      summary.runtimeBackflow?.summary,
      summary.feedbackSummary,
      summary.summary,
    ]).join(" "),
    180,
  );
  const tags = dedupeNonEmptyText([
    summary.businessLabel,
    summary.typeLabel,
    summary.scorecardAggregate?.statusLabel,
    latestRunDetailView?.statusLabel,
    latestRunDetailView?.failureSignalLabel,
    summary.runtimeBackflow?.topFailureSignalLabel,
    ...summary.scorecardFailureSignals.map((item) => item.label),
  ]).slice(0, 6);

  return {
    id,
    sourceKind: "sceneapp_execution_summary",
    title,
    summary: summaryText || copy.resultSummaryFallback,
    category: "experience",
    categoryLabel: copy.categoryLabel,
    tags,
    taskPrefillByTaskId: {
      "account-project-review": {
        project_goal:
          normalizeOptionalText(summary.title) ||
          "判断当前这轮项目结果并明确下一步优化动作",
        existing_results: buildSceneAppExistingResultsSummary({
          summary,
          latestRunDetailView,
        }),
      },
    },
  };
}

export function buildSceneAppExecutionReviewFollowUpAction(params: {
  referenceEntries?: Array<CuratedTaskReferenceEntry | null | undefined> | null;
  copy?: SceneAppCuratedTaskReferenceCopy;
}): {
  prompt: string;
  bannerMessage?: string;
  capabilityRoute: Extract<InputCapabilitySendRoute, { kind: "curated_task" }>;
} | null {
  return buildSceneAppExecutionCuratedTaskFollowUpAction({
    referenceEntries: params.referenceEntries,
    taskId: "account-project-review",
    copy: params.copy,
  });
}

export function buildSceneAppExecutionCuratedTaskFollowUpAction(params: {
  referenceEntries?: Array<CuratedTaskReferenceEntry | null | undefined> | null;
  taskId: string;
  inputValues?: CuratedTaskInputValues | null;
  copy?: SceneAppCuratedTaskReferenceCopy;
}): {
  prompt: string;
  bannerMessage?: string;
  capabilityRoute: Extract<InputCapabilitySendRoute, { kind: "curated_task" }>;
} | null {
  const taskId = normalizeOptionalText(params.taskId);
  if (!taskId) {
    return null;
  }

  const task = findCuratedTaskTemplateById(taskId);
  if (!task) {
    return null;
  }

  const copy = resolveSceneAppCuratedTaskReferenceCopy(params.copy);
  const referenceEntries = mergeCuratedTaskReferenceEntries(
    params.referenceEntries ?? [],
  ).slice(0, 3);
  if (referenceEntries.length === 0) {
    return null;
  }

  const inputValues = buildCuratedTaskLaunchInputPrefillFromReferenceEntries({
    taskId: task.id,
    inputValues: params.inputValues,
    referenceEntries,
  });
  const baselinePromptBlock =
    task.id === SCENEAPP_REVIEW_BASELINE_FALLBACK_TASK_ID
      ? null
      : buildSceneAppExecutionBaselinePromptBlock(
          buildSceneAppExecutionReviewPrefillSnapshot({
            referenceEntries,
            taskId: task.id,
          }),
        );
  const prompt = [
    buildCuratedTaskLaunchPrompt({
      task,
      inputValues: inputValues ?? {},
      referenceEntries,
    }).trim(),
    baselinePromptBlock,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
    .trim();
  if (!prompt) {
    return null;
  }

  const referenceMemoryIds =
    extractCuratedTaskReferenceMemoryIds(referenceEntries) ?? [];

  return {
    prompt,
    bannerMessage: copy.formatFollowUpBannerMessage(task.title),
    capabilityRoute: {
      kind: "curated_task",
      taskId: task.id,
      taskTitle: task.title,
      prompt,
      ...(inputValues
        ? {
            launchInputValues: inputValues,
          }
        : {}),
      ...(referenceMemoryIds.length > 0
        ? {
            referenceMemoryIds,
          }
        : {}),
      referenceEntries,
    },
  };
}
