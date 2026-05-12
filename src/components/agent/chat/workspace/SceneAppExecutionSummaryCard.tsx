import { useTranslation } from "react-i18next";
import type {
  SceneAppContextReferenceItemViewModel,
  SceneAppDeliveryPartViewModel,
  SceneAppExecutionSummaryViewModel,
  SceneAppRunDetailViewModel,
} from "@/lib/sceneapp/product";
import { Button } from "@/components/ui/button";
import { SceneAppProjectPackRuntimePanel } from "@/components/sceneapps/SceneAppProjectPackRuntimePanel";
import {
  buildSceneAppExecutionFollowupDestinations,
  type SceneAppExecutionFollowupDestination,
} from "@/components/sceneapps/sceneAppExecutionFollowupDestinations";
import {
  buildSceneAppExecutionPromptActions,
  type SceneAppExecutionPromptAction,
  type SceneAppQuickReviewAction,
} from "@/lib/sceneapp";
import type { SceneAppExecutionContentPostEntry } from "./sceneAppExecutionContentPosts";
import {
  buildReviewFeedbackProjectionCopy,
  buildReviewFeedbackProjection,
  formatReviewFeedbackTemplate,
  type ReviewFeedbackProjection,
} from "../utils/reviewFeedbackProjection";
import type { CuratedTaskRecommendationSignal } from "../utils/curatedTaskRecommendationSignals";

interface SceneAppExecutionSummaryCardProps {
  summary?: SceneAppExecutionSummaryViewModel | null;
  latestPackResultDetailView?: SceneAppRunDetailViewModel | null;
  latestPackResultLoading?: boolean;
  latestPackResultUsesFallback?: boolean;
  latestReviewFeedbackSignal?: CuratedTaskRecommendationSignal | null;
  onContinueReviewFeedback?: (taskId: string) => void;
  onReviewCurrentProject?: () => void;
  savedAsInspiration?: boolean;
  onSaveAsInspiration?: () => void;
  onOpenInspirationLibrary?: () => void;
  onSaveAsSkill?: () => void;
  onOpenSceneAppDetail?: () => void;
  onOpenSceneAppGovernance?: () => void;
  humanReviewAvailable?: boolean;
  humanReviewLoading?: boolean;
  quickReviewActions?: SceneAppQuickReviewAction[];
  quickReviewPending?: boolean;
  onOpenHumanReview?: () => void;
  onApplyQuickReview?: (actionKey: SceneAppQuickReviewAction["key"]) => void;
  onDeliveryArtifactAction?: (
    action: SceneAppRunDetailViewModel["deliveryArtifactEntries"][number],
  ) => void;
  onGovernanceAction?: (
    action: SceneAppRunDetailViewModel["governanceActionEntries"][number],
  ) => void;
  onGovernanceArtifactAction?: (
    action: SceneAppRunDetailViewModel["governanceArtifactEntries"][number],
  ) => void;
  onEntryAction?: (
    action: NonNullable<SceneAppRunDetailViewModel["entryAction"]>,
  ) => void;
  contentPostEntries?: SceneAppExecutionContentPostEntry[];
  onContentPostAction?: (entry: SceneAppExecutionContentPostEntry) => void;
  promptActionPending?: boolean;
  onPromptAction?: (action: SceneAppExecutionPromptAction) => void;
}

function ReviewFeedbackProjectionBanner({
  projection,
  onContinueReviewFeedback,
}: {
  projection: ReviewFeedbackProjection;
  onContinueReviewFeedback?: (taskId: string) => void;
}) {
  const { t } = useTranslation("agent");
  const primarySuggestedTask = projection.suggestedTasks[0] ?? null;

  return (
    <div
      className="mt-3 rounded-[16px] border border-sky-200 bg-white px-3 py-3"
      data-testid="sceneapp-execution-summary-review-feedback-banner"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          {t("reviewFeedback.badge")}
        </span>
        {projection.suggestedTaskTitles.length > 0 ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {projection.suggestedTaskTitles.join(" / ")}
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-sm font-medium leading-6 text-slate-900">
        {formatReviewFeedbackTemplate(
          t("reviewFeedback.title", {
            title: projection.signal.title,
          }),
          { title: projection.signal.title },
        )}
      </div>
      <div className="mt-1 text-sm leading-6 text-slate-600">
        {projection.signal.summary}
      </div>
      <div className="mt-1 text-sm leading-6 text-slate-600">
        {projection.suggestionText}
      </div>
      {primarySuggestedTask && onContinueReviewFeedback ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-full border-sky-200 bg-white px-3 text-xs font-medium text-slate-700 hover:border-sky-300 hover:bg-sky-50"
            data-testid="sceneapp-execution-summary-review-feedback-action"
            onClick={() =>
              onContinueReviewFeedback(primarySuggestedTask.taskId)
            }
          >
            {formatReviewFeedbackTemplate(
              t("reviewFeedback.action", {
                title: primarySuggestedTask.title,
              }),
              { title: primarySuggestedTask.title },
            )}
          </Button>
          <span className="text-xs leading-5 text-slate-500">
            {t("reviewFeedback.helper.sceneApp")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function renderPartChips(
  items: SceneAppDeliveryPartViewModel[],
  className: string,
  testId?: string,
) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid={testId}>
      {items.map((item) => (
        <span
          key={item.key}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function formatReferenceItemLabel(
  item: SceneAppContextReferenceItemViewModel,
): string {
  return [item.label, item.usageLabel, item.feedbackLabel]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" · ");
}

function resolveRuntimeToneClass(
  tone: NonNullable<
    SceneAppExecutionSummaryViewModel["runtimeBackflow"]
  >["statusTone"],
): string {
  switch (tone) {
    case "accent":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "success":
      return "border-lime-200 bg-lime-50 text-lime-700";
    case "watch":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "risk":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "default":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function resolveAggregateToneClass(
  status: NonNullable<
    SceneAppExecutionSummaryViewModel["scorecardAggregate"]
  >["status"],
): string {
  switch (status) {
    case "good":
      return "border-lime-200 bg-lime-50 text-lime-700";
    case "watch":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "risk":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "idle":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function resolvePromptActionToneClass(
  tone: SceneAppExecutionPromptAction["tone"],
  disabled: boolean,
): string {
  if (disabled) {
    return "border-slate-200 bg-slate-100 text-slate-400";
  }

  switch (tone) {
    case "positive":
      return "border-lime-200 bg-lime-50/80 text-slate-900 hover:border-lime-300 hover:bg-white";
    case "warning":
      return "border-amber-200 bg-amber-50/80 text-slate-900 hover:border-amber-300 hover:bg-white";
    case "neutral":
    default:
      return "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50";
  }
}

function resolveContentPostReadinessToneClass(
  tone: SceneAppExecutionContentPostEntry["readinessTone"],
): string {
  switch (tone) {
    case "success":
      return "border-lime-200 bg-lime-50 text-lime-700";
    case "watch":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "default":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

export function SceneAppExecutionSummaryCard({
  summary,
  latestPackResultDetailView = null,
  latestPackResultLoading = false,
  latestPackResultUsesFallback = false,
  latestReviewFeedbackSignal = null,
  onContinueReviewFeedback,
  onReviewCurrentProject,
  savedAsInspiration = false,
  onSaveAsInspiration,
  onOpenInspirationLibrary,
  onSaveAsSkill,
  onOpenSceneAppDetail,
  onOpenSceneAppGovernance,
  humanReviewAvailable = false,
  humanReviewLoading = false,
  quickReviewActions = [],
  quickReviewPending = false,
  onOpenHumanReview,
  onApplyQuickReview,
  onDeliveryArtifactAction,
  onGovernanceAction,
  onGovernanceArtifactAction,
  onEntryAction,
  contentPostEntries = [],
  onContentPostAction,
  promptActionPending = false,
  onPromptAction,
}: SceneAppExecutionSummaryCardProps) {
  const { t } = useTranslation("agent");

  if (!summary) {
    return null;
  }

  const reviewFeedbackProjection = buildReviewFeedbackProjection({
    copy: buildReviewFeedbackProjectionCopy(t),
    signal: latestReviewFeedbackSignal,
  });

  const followupDestinations = latestPackResultDetailView
    ? buildSceneAppExecutionFollowupDestinations(latestPackResultDetailView)
    : [];
  const promptActions = latestPackResultDetailView
    ? buildSceneAppExecutionPromptActions(latestPackResultDetailView)
    : [];
  const deliveryContractLabel =
    summary.projectPackPlan?.packKindLabel ?? summary.deliveryContractLabel;
  const deliveryDestinationLabel =
    summary.projectPackPlan?.viewerLabel ||
    deliveryContractLabel ||
    t("sceneAppExecutionSummary.value.pending");
  const scorecardAggregate = summary.scorecardAggregate ?? null;
  const scorecardSummaryLabel =
    summary.scorecardProfileRef ||
    (summary.scorecardMetricKeys.length > 0
      ? t("sceneAppExecutionSummary.scorecard.metricCount", {
          count: summary.scorecardMetricKeys.length,
        })
      : t("sceneAppExecutionSummary.value.pending"));
  const hasFollowupSection = Boolean(
    onReviewCurrentProject ||
    onSaveAsInspiration ||
    onSaveAsSkill ||
    onOpenSceneAppDetail ||
    onOpenSceneAppGovernance ||
    humanReviewAvailable ||
    quickReviewActions.length ||
    latestPackResultDetailView,
  );
  const resolveFollowupDestinationAction = (
    destination: SceneAppExecutionFollowupDestination,
  ): { label: string; onClick: () => void } | null => {
    const action = destination.action;
    if (!action) {
      return null;
    }

    switch (action.kind) {
      case "review_current_project":
        return onReviewCurrentProject
          ? {
              label: action.label,
              onClick: onReviewCurrentProject,
            }
          : null;
      case "governance_action":
        return onGovernanceAction
          ? {
              label: action.label,
              onClick: () => onGovernanceAction(action.entry),
            }
          : null;
      case "governance_artifact":
        return onGovernanceArtifactAction
          ? {
              label: action.label,
              onClick: () => onGovernanceArtifactAction(action.entry),
            }
          : null;
      case "entry_action":
        return onEntryAction
          ? {
              label: action.label,
              onClick: () => onEntryAction(action.entry),
            }
          : null;
      case "delivery_artifact":
        return onDeliveryArtifactAction
          ? {
              label: action.label,
              onClick: () => onDeliveryArtifactAction(action.entry),
            }
          : null;
      default:
        return null;
    }
  };

  return (
    <section
      className="mx-4 mb-3 rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-950/5"
      data-testid="sceneapp-execution-summary-card"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium tracking-[0.08em] text-sky-700">
              {t("sceneAppExecutionSummary.title")}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {summary.title}
              </h3>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                {summary.businessLabel}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {summary.summary}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              {summary.typeLabel}
            </span>
            <span className="rounded-full border border-lime-200 bg-lime-50 px-2.5 py-1 text-[11px] font-medium text-lime-700">
              {deliveryContractLabel}
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
              {summary.planningStatusLabel}
            </span>
          </div>
        </div>

        <div className="rounded-[20px] border border-sky-200 bg-sky-50/70 p-4">
          <div className="text-xs font-medium text-slate-500">
            {t("sceneAppExecutionSummary.planning.compiled")}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {summary.planningSummary}
          </p>
          <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <span className="font-medium text-slate-900">
                {t("sceneAppExecutionSummary.overview.executionChain")}
              </span>
              {summary.executionChainLabel}
            </div>
            <div data-testid="sceneapp-execution-summary-reference-count">
              <span className="font-medium text-slate-900">
                {t("sceneAppExecutionSummary.overview.referenceLabel")}
              </span>
              {t("sceneAppExecutionSummary.overview.referenceCount", {
                count: summary.referenceCount,
              })}
            </div>
            <div>
              <span className="font-medium text-slate-900">
                {t("sceneAppExecutionSummary.overview.destination")}
              </span>
              {deliveryDestinationLabel}
            </div>
            <div>
              <span className="font-medium text-slate-900">
                {t("sceneAppExecutionSummary.overview.scorecard")}
              </span>
              {scorecardSummaryLabel}
            </div>
          </div>
        </div>

        {summary.runtimeBackflow ? (
          <section
            className="rounded-[20px] border border-emerald-200/80 bg-emerald-50/60 p-4"
            data-testid="sceneapp-execution-summary-runtime-backflow"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-slate-500">
                  {t("sceneAppExecutionSummary.runtime.title")}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {summary.runtimeBackflow.summary}
                </p>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${resolveRuntimeToneClass(summary.runtimeBackflow.statusTone)}`}
              >
                {summary.runtimeBackflow.statusLabel}
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <span className="font-medium text-slate-900">
                  {t("sceneAppExecutionSummary.runtime.recentRun")}
                </span>
                {summary.runtimeBackflow.sourceLabel}
              </div>
              <div>
                <span className="font-medium text-slate-900">
                  {t("sceneAppExecutionSummary.runtime.delivery")}
                </span>
                {summary.runtimeBackflow.deliveryCompletionLabel}
              </div>
              <div>
                <span className="font-medium text-slate-900">
                  {t("sceneAppExecutionSummary.runtime.evidence")}
                </span>
                {summary.runtimeBackflow.evidenceSourceLabel}
              </div>
              <div>
                <span className="font-medium text-slate-900">
                  {t("sceneAppExecutionSummary.runtime.time")}
                </span>
                {summary.runtimeBackflow.finishedAtLabel ||
                  summary.runtimeBackflow.startedAtLabel}
              </div>
            </div>
            <div className="mt-3 text-sm leading-6 text-slate-700">
              <span className="font-medium text-slate-900">
                {t("sceneAppExecutionSummary.runtime.next")}
              </span>
              {summary.runtimeBackflow.nextAction}
            </div>
            {summary.runtimeBackflow.scorecardActionLabel ||
            summary.runtimeBackflow.topFailureSignalLabel ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {summary.runtimeBackflow.scorecardActionLabel ? (
                  <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                    {summary.runtimeBackflow.scorecardActionLabel}
                  </span>
                ) : null}
                {summary.runtimeBackflow.topFailureSignalLabel ? (
                  <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700">
                    {summary.runtimeBackflow.topFailureSignalLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
            {summary.runtimeBackflow.deliveryCompletedParts.length ? (
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-500">
                  {t("sceneAppExecutionSummary.runtime.completedParts")}
                </div>
                {renderPartChips(
                  summary.runtimeBackflow.deliveryCompletedParts,
                  "border-lime-200 bg-white text-lime-700",
                  "sceneapp-execution-summary-runtime-completed-parts",
                )}
              </div>
            ) : null}
            {summary.runtimeBackflow.deliveryMissingParts.length ? (
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-500">
                  {t("sceneAppExecutionSummary.runtime.missingParts")}
                </div>
                {renderPartChips(
                  summary.runtimeBackflow.deliveryMissingParts,
                  "border-amber-200 bg-white text-amber-700",
                  "sceneapp-execution-summary-runtime-missing-parts",
                )}
              </div>
            ) : null}
            {summary.runtimeBackflow.observedFailureSignals.length ? (
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-500">
                  {t("sceneAppExecutionSummary.runtime.observedSignals")}
                </div>
                {renderPartChips(
                  summary.runtimeBackflow.observedFailureSignals,
                  "border-rose-200 bg-white text-rose-700",
                  "sceneapp-execution-summary-runtime-failure-signals",
                )}
              </div>
            ) : null}
            {summary.runtimeBackflow.governanceArtifacts.length ? (
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-500">
                  {t("sceneAppExecutionSummary.runtime.governanceArtifacts")}
                </div>
                {renderPartChips(
                  summary.runtimeBackflow.governanceArtifacts,
                  "border-sky-200 bg-white text-sky-700",
                  "sceneapp-execution-summary-runtime-governance",
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <section className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-sm font-medium text-slate-900">
              {t("sceneAppExecutionSummary.context.title")}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("sceneAppExecutionSummary.context.description")}
            </p>
            {renderPartChips(
              summary.activeLayers,
              "border-sky-200 bg-white text-sky-700",
              "sceneapp-execution-summary-active-layers",
            )}
            {summary.referenceItems.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {summary.referenceItems.slice(0, 4).map((item) => (
                  <span
                    key={item.key}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
                  >
                    {formatReferenceItemLabel(item)}
                  </span>
                ))}
                {summary.referenceItems.length > 4 ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                    {t("sceneAppExecutionSummary.context.moreReferences", {
                      count: summary.referenceItems.length - 4,
                    })}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {t("sceneAppExecutionSummary.context.emptyReferences")}
              </p>
            )}
            {summary.tasteSummary ? (
              <div className="mt-3 text-sm leading-6 text-slate-700">
                <span className="font-medium text-slate-900">
                  {t("sceneAppExecutionSummary.context.taste")}
                </span>
                {summary.tasteSummary}
              </div>
            ) : null}
            {summary.feedbackSummary ? (
              <div className="mt-2 text-sm leading-6 text-slate-700">
                <span className="font-medium text-slate-900">
                  {t("sceneAppExecutionSummary.context.feedback")}
                </span>
                {summary.feedbackSummary}
              </div>
            ) : null}
            {reviewFeedbackProjection ? (
              <ReviewFeedbackProjectionBanner
                projection={reviewFeedbackProjection}
                onContinueReviewFeedback={onContinueReviewFeedback}
              />
            ) : null}
          </section>

          <section
            className="rounded-[20px] border border-slate-200 bg-white p-4"
            data-testid="sceneapp-execution-summary-project-pack"
          >
            <div className="text-sm font-medium text-slate-900">
              {t("sceneAppExecutionSummary.projectPack.title")}
            </div>
            {summary.projectPackPlan ? (
              <>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  <div>
                    <span className="font-medium text-slate-900">
                      {t("sceneAppExecutionSummary.projectPack.kind")}
                    </span>
                    {summary.projectPackPlan.packKindLabel}
                  </div>
                  <div>
                    <span className="font-medium text-slate-900">
                      {t("sceneAppExecutionSummary.projectPack.completion")}
                    </span>
                    {summary.projectPackPlan.completionStrategyLabel}
                  </div>
                  {summary.projectPackPlan.primaryPart ? (
                    <div>
                      <span className="font-medium text-slate-900">
                        {t("sceneAppExecutionSummary.projectPack.primary")}
                      </span>
                      {summary.projectPackPlan.primaryPart}
                    </div>
                  ) : null}
                  {summary.projectPackPlan.viewerLabel ? (
                    <div>
                      <span className="font-medium text-slate-900">
                        {t("sceneAppExecutionSummary.projectPack.viewer")}
                      </span>
                      {summary.projectPackPlan.viewerLabel}
                    </div>
                  ) : null}
                </div>
                {renderPartChips(
                  summary.projectPackPlan.requiredParts,
                  "border-lime-200 bg-lime-50 text-lime-700",
                )}
                {summary.projectPackPlan.notes.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {summary.projectPackPlan.notes.map((note) => (
                      <span
                        key={note}
                        className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700"
                      >
                        {note}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {t("sceneAppExecutionSummary.projectPack.empty")}
              </p>
            )}
          </section>

          <section
            className="rounded-[20px] border border-slate-200 bg-white p-4"
            data-testid="sceneapp-execution-summary-scorecard"
          >
            <div className="text-sm font-medium text-slate-900">
              {t("sceneAppExecutionSummary.scorecard.title")}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("sceneAppExecutionSummary.scorecard.description")}
            </p>
            {scorecardAggregate ? (
              <div
                className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50/80 p-3"
                data-testid="sceneapp-execution-summary-scorecard-aggregate"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${resolveAggregateToneClass(
                      scorecardAggregate.status,
                    )}`}
                  >
                    {scorecardAggregate.statusLabel}
                  </span>
                  {scorecardAggregate.actionLabel ? (
                    <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                      {scorecardAggregate.actionLabel}
                    </span>
                  ) : null}
                  {scorecardAggregate.topFailureSignalLabel ? (
                    <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700">
                      {scorecardAggregate.topFailureSignalLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-800">
                  {scorecardAggregate.summary}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {scorecardAggregate.nextAction}
                </div>
                {scorecardAggregate.destinations.length ? (
                  <div
                    className="mt-3 flex flex-wrap gap-2"
                    data-testid="sceneapp-execution-summary-scorecard-destinations"
                  >
                    {scorecardAggregate.destinations.map((destination) => (
                      <span
                        key={destination.key}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
                      >
                        {destination.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {summary.scorecardProfileRef ? (
              <div className="mt-3 text-sm leading-6 text-slate-700">
                <span className="font-medium text-slate-900">
                  {t("sceneAppExecutionSummary.scorecard.baseline")}
                </span>
                {summary.scorecardProfileRef}
              </div>
            ) : null}
            {renderPartChips(
              summary.scorecardMetricKeys,
              "border-emerald-200 bg-emerald-50 text-emerald-700",
              "sceneapp-execution-summary-scorecard-metrics",
            )}
            {renderPartChips(
              summary.scorecardFailureSignals,
              "border-amber-200 bg-amber-50 text-amber-700",
              "sceneapp-execution-summary-scorecard-failure-signals",
            )}
          </section>
        </div>

        <SceneAppProjectPackRuntimePanel
          title={t("sceneAppExecutionSummary.runtimePack.title")}
          description={t("sceneAppExecutionSummary.runtimePack.description")}
          emptyMessage={t("sceneAppExecutionSummary.runtimePack.empty")}
          testIdPrefix="sceneapp-execution-summary"
          className="border-slate-200 bg-slate-50/70"
          runDetailView={latestPackResultDetailView}
          loading={latestPackResultLoading}
          usesFallbackRun={latestPackResultUsesFallback}
          onDeliveryArtifactAction={onDeliveryArtifactAction}
        />

        {hasFollowupSection ? (
          <section
            className="rounded-[18px] border border-slate-200 bg-white px-4 py-4"
            data-testid="sceneapp-execution-summary-followup-actions"
          >
            <div className="text-xs font-medium text-slate-500">
              {t("sceneAppExecutionSummary.followup.title")}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("sceneAppExecutionSummary.followup.description")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {onReviewCurrentProject ? (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="sceneapp-execution-summary-review-current-project"
                  onClick={onReviewCurrentProject}
                >
                  {t("sceneAppExecutionSummary.followup.action.reviewCurrent")}
                </Button>
              ) : null}
              {onSaveAsInspiration ? (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="sceneapp-execution-summary-save-as-inspiration"
                  disabled={savedAsInspiration}
                  className={
                    savedAsInspiration
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                      : undefined
                  }
                  onClick={onSaveAsInspiration}
                >
                  {savedAsInspiration
                    ? t(
                        "sceneAppExecutionSummary.followup.action.inspirationSaved",
                      )
                    : t(
                        "sceneAppExecutionSummary.followup.action.saveInspiration",
                      )}
                </Button>
              ) : null}
              {onSaveAsSkill ? (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="sceneapp-execution-summary-save-as-skill"
                  onClick={onSaveAsSkill}
                >
                  {t("sceneAppExecutionSummary.followup.action.saveAsSkill")}
                </Button>
              ) : null}
              {onOpenSceneAppDetail ? (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="sceneapp-execution-summary-open-detail"
                  onClick={onOpenSceneAppDetail}
                >
                  {t("sceneAppExecutionSummary.followup.action.openDetail")}
                </Button>
              ) : null}
              {onOpenSceneAppGovernance ? (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="sceneapp-execution-summary-open-governance"
                  onClick={onOpenSceneAppGovernance}
                >
                  {t("sceneAppExecutionSummary.followup.action.openGovernance")}
                </Button>
              ) : null}
              {humanReviewAvailable ? (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="sceneapp-execution-summary-open-human-review"
                  onClick={onOpenHumanReview}
                >
                  {humanReviewLoading
                    ? t(
                        "sceneAppExecutionSummary.followup.action.humanReviewLoading",
                      )
                    : t("sceneAppExecutionSummary.followup.action.humanReview")}
                </Button>
              ) : null}
            </div>
            {savedAsInspiration ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p
                  className="text-xs leading-5 text-emerald-700"
                  data-testid="sceneapp-execution-summary-saved-inspiration-hint"
                >
                  {t("sceneAppExecutionSummary.followup.savedHint")}
                </p>
                {onOpenInspirationLibrary ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-full px-2 text-xs font-medium text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"
                    data-testid="sceneapp-execution-summary-open-inspiration-library"
                    onClick={onOpenInspirationLibrary}
                  >
                    {t(
                      "sceneAppExecutionSummary.followup.action.openInspiration",
                    )}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {latestPackResultUsesFallback ? (
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {t("sceneAppExecutionSummary.followup.fallbackNotice")}
              </p>
            ) : null}
            {humanReviewAvailable && quickReviewActions.length ? (
              <div className="mt-4">
                <div className="text-xs font-medium text-slate-500">
                  {t("sceneAppExecutionSummary.quickReview.title")}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {quickReviewActions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      data-testid={`sceneapp-execution-summary-quick-review-${action.key}`}
                      disabled={quickReviewPending}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => onApplyQuickReview?.(action.key)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {latestPackResultDetailView &&
            (followupDestinations.length ||
              promptActions.length ||
              latestPackResultDetailView.governanceActionEntries.length ||
              latestPackResultDetailView.governanceArtifactEntries.length ||
              latestPackResultDetailView.entryAction) ? (
              <div
                className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50/70 p-4"
                data-testid="sceneapp-execution-summary-orchestration"
              >
                <div className="text-xs font-medium text-slate-500">
                  {t("sceneAppExecutionSummary.orchestration.title")}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t("sceneAppExecutionSummary.orchestration.description")}
                </p>

                {followupDestinations.length ? (
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    {followupDestinations.map((item) => {
                      const destinationAction =
                        resolveFollowupDestinationAction(item);

                      return (
                        <article
                          key={item.key}
                          className="rounded-[18px] border border-white bg-white px-3 py-3"
                        >
                          <div className="text-sm font-medium text-slate-900">
                            {item.label}
                          </div>
                          <div className="mt-2 text-xs leading-5 text-slate-600">
                            {item.description}
                          </div>
                          {destinationAction ? (
                            <div className="mt-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                data-testid={`sceneapp-execution-summary-destination-action-${item.key}`}
                                onClick={destinationAction.onClick}
                              >
                                {destinationAction.label}
                              </Button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : null}

                {latestPackResultDetailView.governanceActionEntries.length ||
                promptActions.length ||
                latestPackResultDetailView.entryAction ? (
                  <div className="mt-4">
                    <div className="text-xs font-medium text-slate-500">
                      {t("sceneAppExecutionSummary.orchestration.recommended")}
                    </div>
                    <div className="mt-2 grid gap-3 xl:grid-cols-2">
                      {latestPackResultDetailView.governanceActionEntries.map(
                        (entry) => (
                          <button
                            key={entry.key}
                            type="button"
                            data-testid={`sceneapp-execution-summary-governance-action-${entry.key}`}
                            className="rounded-[18px] border border-lime-200 bg-lime-50/80 p-3 text-left transition-colors hover:border-lime-300 hover:bg-white"
                            onClick={() => onGovernanceAction?.(entry)}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">
                                {entry.label}
                              </span>
                              <span className="rounded-full border border-lime-200 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-lime-700">
                                {t(
                                  "sceneAppExecutionSummary.orchestration.openArtifact",
                                  { label: entry.primaryArtifactLabel },
                                )}
                              </span>
                            </div>
                            <div className="mt-2 text-xs leading-5 text-slate-600">
                              {entry.helperText}
                            </div>
                          </button>
                        ),
                      )}

                      {latestPackResultDetailView.entryAction ? (
                        <button
                          type="button"
                          data-testid="sceneapp-execution-summary-entry-action"
                          className="rounded-[18px] border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                          onClick={() =>
                            onEntryAction?.(
                              latestPackResultDetailView.entryAction!,
                            )
                          }
                        >
                          <div className="text-sm font-medium text-slate-900">
                            {latestPackResultDetailView.entryAction.label}
                          </div>
                          <div className="mt-2 text-xs leading-5 text-slate-500">
                            {latestPackResultDetailView.entryAction.helperText}
                          </div>
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {promptActions.length ? (
                  <div className="mt-4">
                    <div className="text-xs font-medium text-slate-500">
                      {t("sceneAppExecutionSummary.orchestration.chat")}
                    </div>
                    <div className="mt-2 grid gap-3 xl:grid-cols-2">
                      {promptActions.map((action) => {
                        const disabled =
                          promptActionPending || Boolean(action.disabledReason);

                        return (
                          <button
                            key={action.key}
                            type="button"
                            data-testid={`sceneapp-execution-summary-prompt-action-${action.key}`}
                            disabled={disabled}
                            className={`rounded-[18px] border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-slate-100 ${resolvePromptActionToneClass(action.tone, disabled)}`}
                            onClick={() => onPromptAction?.(action)}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">
                                {action.label}
                              </span>
                              {action.disabledReason ? (
                                <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-amber-700">
                                  {t(
                                    "sceneAppExecutionSummary.orchestration.blockedBadge",
                                  )}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 text-xs leading-5 text-slate-600">
                              {action.helperText}
                            </div>
                            {action.disabledReason ? (
                              <div className="mt-2 text-[11px] leading-5 text-amber-700">
                                {t(
                                  "sceneAppExecutionSummary.orchestration.blockedReason",
                                  { reason: action.disabledReason },
                                )}
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {contentPostEntries.length ? (
                  <div
                    className="mt-4"
                    data-testid="sceneapp-execution-summary-content-posts"
                  >
                    <div className="text-xs font-medium text-slate-500">
                      {t("sceneAppExecutionSummary.contentPosts.title")}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {t("sceneAppExecutionSummary.contentPosts.description")}
                    </p>
                    <div className="mt-3 grid gap-3 xl:grid-cols-3">
                      {contentPostEntries.map((entry) => (
                        <button
                          key={entry.key}
                          type="button"
                          data-testid={`sceneapp-execution-summary-content-post-${entry.key}`}
                          className="rounded-[18px] border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                          onClick={() => onContentPostAction?.(entry)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-slate-900">
                              {entry.label}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] ${resolveContentPostReadinessToneClass(entry.readinessTone)}`}
                            >
                              {entry.readinessLabel}
                            </span>
                            {entry.platformLabel ? (
                              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-sky-700">
                                {entry.platformLabel}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 text-xs leading-5 text-slate-600">
                            {entry.helperText}
                          </div>
                          {entry.companionEntries.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {entry.companionEntries.map((companion) => (
                                <span
                                  key={companion.key}
                                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                                >
                                  {companion.label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-2 truncate text-[11px] leading-5 text-slate-500">
                            {entry.pathLabel}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {latestPackResultDetailView.governanceArtifactEntries.length ? (
                  <div className="mt-4">
                    <div className="text-xs font-medium text-slate-500">
                      {t("sceneAppExecutionSummary.orchestration.artifacts")}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {latestPackResultDetailView.governanceArtifactEntries.map(
                        (entry) => (
                          <button
                            key={entry.key}
                            type="button"
                            data-testid={`sceneapp-execution-summary-governance-artifact-${entry.key}`}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                            onClick={() => onGovernanceArtifactAction?.(entry)}
                          >
                            {entry.label}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {summary.notes.length ? (
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3.5 py-3">
            <div className="text-xs font-medium text-slate-500">
              {t("sceneAppExecutionSummary.notes.title")}
            </div>
            <div
              className="mt-2 flex flex-wrap gap-2"
              data-testid="sceneapp-execution-summary-notes"
            >
              {summary.notes.map((note) => (
                <span
                  key={note}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
                >
                  {note}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
