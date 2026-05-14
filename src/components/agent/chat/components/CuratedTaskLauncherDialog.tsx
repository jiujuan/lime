import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, LoaderCircle, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  summarizeCuratedTaskFollowUpActions,
  buildCuratedTaskTemplateCopy,
  summarizeCuratedTaskOutputContract,
  summarizeCuratedTaskRequiredInputs,
  findCuratedTaskTemplateById,
  hasFilledAllCuratedTaskRequiredInputs,
  resolveCuratedTaskInputValues,
  type CuratedTaskPresentationCopy,
  type CuratedTaskInputValues,
  type CuratedTaskTemplateItem,
} from "@/components/agent/chat/utils/curatedTaskTemplates";
import { formatNumber } from "@/i18n/format";
import { listUnifiedMemories } from "@/lib/api/unifiedMemory";
import { cn } from "@/lib/utils";
import {
  listCuratedTaskRecommendationSignals,
  subscribeCuratedTaskRecommendationSignalsChanged,
} from "@/components/agent/chat/utils/curatedTaskRecommendationSignals";
import { buildReviewFeedbackProjection } from "@/components/agent/chat/utils/reviewFeedbackProjection";
import {
  buildCuratedTaskLaunchInputPrefillFromReferenceEntries,
  buildCuratedTaskReferenceEntries,
  extractCuratedTaskReferenceMemoryIds,
  getCuratedTaskReferenceSourceLabel,
  mergeCuratedTaskReferenceEntries,
  normalizeCuratedTaskReferenceMemoryIds,
  type CuratedTaskReferenceEntry,
  type CuratedTaskReferenceSelection,
} from "@/components/agent/chat/utils/curatedTaskReferenceSelection";
import {
  buildSceneAppExecutionReviewPrefillHighlights,
  buildSceneAppExecutionReviewPrefillSnapshot,
} from "@/components/agent/chat/utils/sceneAppCuratedTaskReference";
import type { AgentI18nResource } from "@/i18n/agentResources";

type AgentI18nKey = keyof AgentI18nResource;

interface CuratedTaskLauncherDialogProps {
  open: boolean;
  task: CuratedTaskTemplateItem | null;
  projectId?: string | null;
  sessionId?: string | null;
  initialInputValues?: CuratedTaskInputValues | null;
  initialReferenceMemoryIds?: string[] | null;
  initialReferenceEntries?: CuratedTaskReferenceEntry[] | null;
  prefillHint?: string | null;
  onOpenChange: (open: boolean) => void;
  onApplyReviewSuggestion?: (
    task: CuratedTaskTemplateItem,
    options: {
      inputValues: CuratedTaskInputValues;
      referenceSelection: CuratedTaskReferenceSelection;
    },
  ) => void;
  onConfirm: (
    task: CuratedTaskTemplateItem,
    inputValues: CuratedTaskInputValues,
    referenceSelection: CuratedTaskReferenceSelection,
  ) => void;
}

const MAX_REFERENCE_SELECTION_COUNT = 3;

export function CuratedTaskLauncherDialog({
  open,
  task,
  projectId,
  sessionId,
  initialInputValues,
  initialReferenceMemoryIds,
  initialReferenceEntries,
  prefillHint,
  onOpenChange,
  onApplyReviewSuggestion,
  onConfirm,
}: CuratedTaskLauncherDialogProps) {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.language;
  const curatedTaskTemplateCopy = useMemo(
    () =>
      buildCuratedTaskTemplateCopy((key, values) =>
        t(key as AgentI18nKey, values ?? {}),
      ),
    [t],
  );
  const [inputValues, setInputValues] = useState<CuratedTaskInputValues>({});
  const [referenceEntries, setReferenceEntries] = useState<
    CuratedTaskReferenceEntry[]
  >([]);
  const [selectedReferenceEntryIds, setSelectedReferenceEntryIds] = useState<
    string[]
  >([]);
  const [isReferenceEntriesLoading, setIsReferenceEntriesLoading] =
    useState(false);
  const [referenceEntriesError, setReferenceEntriesError] = useState<
    string | null
  >(null);
  const [referenceEntriesVersion, setReferenceEntriesVersion] = useState(0);
  const selectedReferenceEntryIdsRef = useRef<string[]>([]);

  const seededReferenceEntries = useMemo(
    () => mergeCuratedTaskReferenceEntries(initialReferenceEntries ?? []),
    [initialReferenceEntries],
  );
  const seededReferenceEntryIds = useMemo(
    () =>
      normalizeCuratedTaskReferenceMemoryIds([
        ...(initialReferenceMemoryIds ?? []),
        ...seededReferenceEntries.map((entry) => entry.id),
      ]) ?? [],
    [initialReferenceMemoryIds, seededReferenceEntries],
  );

  useEffect(() => {
    return subscribeCuratedTaskRecommendationSignalsChanged(() => {
      setReferenceEntriesVersion((previous) => previous + 1);
    });
  }, []);

  useEffect(() => {
    selectedReferenceEntryIdsRef.current = selectedReferenceEntryIds;
  }, [selectedReferenceEntryIds]);

  useEffect(() => {
    if (!task || !open) {
      setInputValues({});
      return;
    }

    setInputValues(
      resolveCuratedTaskInputValues({
        task,
        inputValues: buildCuratedTaskLaunchInputPrefillFromReferenceEntries({
          taskId: task.id,
          inputValues: initialInputValues,
          referenceEntries: initialReferenceEntries,
        }),
      }),
    );
  }, [initialInputValues, initialReferenceEntries, open, task]);

  useEffect(() => {
    if (!task || !open) {
      setReferenceEntries([]);
      setSelectedReferenceEntryIds([]);
      setIsReferenceEntriesLoading(false);
      setReferenceEntriesError(null);
      return;
    }

    setReferenceEntries(seededReferenceEntries);
    setSelectedReferenceEntryIds(seededReferenceEntryIds);
    setReferenceEntriesError(null);
  }, [open, seededReferenceEntries, seededReferenceEntryIds, task]);

  useEffect(() => {
    if (!task || !open) {
      setIsReferenceEntriesLoading(false);
      return;
    }

    setIsReferenceEntriesLoading(true);
    setReferenceEntriesError(null);

    let cancelled = false;

    void listUnifiedMemories({
      archived: false,
      sort_by: "updated_at",
      order: "desc",
      limit: 12,
    })
      .then((memories) => {
        if (cancelled) {
          return;
        }

        setReferenceEntries((current) => {
          const selectedReferenceEntries = current.filter((entry) =>
            selectedReferenceEntryIdsRef.current.includes(entry.id),
          );

          return mergeCuratedTaskReferenceEntries([
            ...seededReferenceEntries,
            ...selectedReferenceEntries,
            ...buildCuratedTaskReferenceEntries(memories),
          ]);
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setReferenceEntries((current) => {
          const selectedReferenceEntries = current.filter((entry) =>
            selectedReferenceEntryIdsRef.current.includes(entry.id),
          );

          return mergeCuratedTaskReferenceEntries([
            ...seededReferenceEntries,
            ...selectedReferenceEntries,
          ]);
        });
        setReferenceEntriesError(t("curatedTask.launcher.reference.loadError"));
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setIsReferenceEntriesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, referenceEntriesVersion, seededReferenceEntries, task, t]);

  const isLaunchDisabled = useMemo(() => {
    if (!task) {
      return true;
    }

    return !hasFilledAllCuratedTaskRequiredInputs({
      task,
      inputValues,
    });
  }, [inputValues, task]);

  const selectedReferenceEntries = useMemo(() => {
    const referenceEntryMap = new Map(
      referenceEntries.map((entry) => [entry.id, entry]),
    );

    return selectedReferenceEntryIds
      .map((id) => referenceEntryMap.get(id))
      .filter((entry): entry is CuratedTaskReferenceEntry => Boolean(entry));
  }, [referenceEntries, selectedReferenceEntryIds]);

  const missingSelectedReferenceCount =
    selectedReferenceEntryIds.length - selectedReferenceEntries.length;

  const requiredFieldCount = task?.requiredInputFields.length ?? 0;
  const filledRequiredFieldCount = useMemo(() => {
    if (!task) {
      return 0;
    }

    return task.requiredInputFields.filter((field) => {
      const value = inputValues[field.key];
      return typeof value === "string" && value.trim().length > 0;
    }).length;
  }, [inputValues, task]);
  const remainingRequiredFieldCount = Math.max(
    requiredFieldCount - filledRequiredFieldCount,
    0,
  );
  const launcherReadinessLabel =
    remainingRequiredFieldCount === 0
      ? t("curatedTask.launcher.readiness.ready")
      : t("curatedTask.launcher.readiness.missing", {
          count: remainingRequiredFieldCount,
        });

  const launcherOutcomeSummary = useMemo(() => {
    if (!task) {
      return "";
    }

    const followUp = task.followUpActions[0];
    if (followUp) {
      return t("curatedTask.launcher.outcome.withFollowUp", {
        followUp,
        outputHint: task.outputHint,
      });
    }

    return t("curatedTask.launcher.outcome.default", {
      outputHint: task.outputHint,
    });
  }, [task, t]);
  const curatedTaskPresentationCopy = useMemo<CuratedTaskPresentationCopy>(
    () => ({
      formatFactItems: (visibleItems, totalCount) => {
        const items = visibleItems.join(
          t("curatedTask.launcher.summary.itemSeparator"),
        );
        if (visibleItems.length >= totalCount) {
          return items;
        }

        return t("curatedTask.launcher.summary.withMore", {
          items,
          remaining: formatNumber(totalCount - visibleItems.length, {
            locale,
          }),
          total: formatNumber(totalCount, { locale }),
        });
      },
    }),
    [locale, t],
  );
  const launcherStarterContract = useMemo(() => {
    if (!task) {
      return null;
    }

    return {
      requiredSummary:
        summarizeCuratedTaskRequiredInputs(
          task,
          2,
          curatedTaskPresentationCopy,
        ) || t("curatedTask.launcher.contract.requiredEmpty"),
      outputSummary:
        summarizeCuratedTaskOutputContract(
          task,
          2,
          curatedTaskPresentationCopy,
        ) || task.outputHint,
      followUpSummary: summarizeCuratedTaskFollowUpActions(
        task,
        2,
        curatedTaskPresentationCopy,
      ),
    };
  }, [curatedTaskPresentationCopy, task, t]);

  const latestReviewTaskSignal = useMemo(
    () =>
      listCuratedTaskRecommendationSignals({
        projectId,
        sessionId,
      })
        .filter((signal) => signal.source === "review_feedback")
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null,
    [projectId, sessionId],
  );
  const reviewFeedbackProjection = useMemo(() => {
    if (!task) {
      return null;
    }

    return buildReviewFeedbackProjection({
      signal: latestReviewTaskSignal,
      currentTaskId: task.id,
      currentTaskTitle: task.title,
    });
  }, [latestReviewTaskSignal, task]);
  const primarySuggestedTask = useMemo(() => {
    if (
      !reviewFeedbackProjection ||
      reviewFeedbackProjection.matchedCurrentTask
    ) {
      return null;
    }

    const suggestedTaskId = reviewFeedbackProjection.suggestedTasks[0]?.taskId;
    if (!suggestedTaskId) {
      return null;
    }

    return findCuratedTaskTemplateById(
      suggestedTaskId,
      curatedTaskTemplateCopy,
    );
  }, [curatedTaskTemplateCopy, reviewFeedbackProjection]);

  const activeReviewBaselineSnapshot = useMemo(() => {
    if (!task) {
      return null;
    }

    const activeReferenceEntries =
      selectedReferenceEntries.length > 0
        ? selectedReferenceEntries
        : seededReferenceEntries;

    return buildSceneAppExecutionReviewPrefillSnapshot({
      referenceEntries: activeReferenceEntries,
      taskId: task.id,
    });
  }, [seededReferenceEntries, selectedReferenceEntries, task]);

  const activeReviewBaselineHighlights = useMemo(
    () =>
      buildSceneAppExecutionReviewPrefillHighlights(
        activeReviewBaselineSnapshot,
      ),
    [activeReviewBaselineSnapshot],
  );

  const activeReviewBaselineCarryHint = useMemo(() => {
    if (!activeReviewBaselineSnapshot || !task) {
      return null;
    }

    const carriedFields = task.requiredInputFields
      .filter((field) => (inputValues[field.key] ?? "").trim())
      .map((field) => field.label);
    if (carriedFields.length === 0) {
      return null;
    }

    const fields = carriedFields.join(
      t("curatedTask.launcher.carry.fieldSeparator", " / "),
    );
    if (task.id === "account-project-review") {
      return t("curatedTask.launcher.carry.review", {
        fields,
      });
    }

    return t("curatedTask.launcher.carry.default", {
      fields,
    });
  }, [activeReviewBaselineSnapshot, inputValues, task, t]);

  const handleValueChange = (key: string, value: string) => {
    setInputValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleToggleReferenceEntry = (entryId: string) => {
    setSelectedReferenceEntryIds((current) => {
      if (current.includes(entryId)) {
        return current.filter((id) => id !== entryId);
      }

      if (current.length >= MAX_REFERENCE_SELECTION_COUNT) {
        return current;
      }

      return [...current, entryId];
    });
  };

  const handleConfirm = () => {
    if (!task || isLaunchDisabled) {
      return;
    }

    onConfirm(task, inputValues, {
      referenceMemoryIds:
        extractCuratedTaskReferenceMemoryIds(selectedReferenceEntries) ?? [],
      referenceEntries: selectedReferenceEntries,
    });
  };
  const handleApplyReviewSuggestion = () => {
    if (!primarySuggestedTask || !onApplyReviewSuggestion) {
      return;
    }

    onApplyReviewSuggestion(primarySuggestedTask, {
      inputValues,
      referenceSelection: {
        referenceMemoryIds:
          extractCuratedTaskReferenceMemoryIds(selectedReferenceEntries) ?? [],
        referenceEntries: selectedReferenceEntries,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lime-workbench-theme-scope lime-workbench-surface-scope w-[min(640px,calc(100vw-32px))] max-w-none overflow-hidden border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-0 text-[color:var(--lime-text)]">
        {task ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-white">
            <DialogHeader className="shrink-0 border-b border-[color:var(--lime-surface-border)] bg-[image:var(--lime-card-subtle)] px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium",
                    remainingRequiredFieldCount === 0
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border border-slate-200 bg-white text-slate-600",
                  )}
                >
                  {launcherReadinessLabel}
                </span>
              </div>
              <div className="space-y-2 pt-3">
                <DialogTitle className="text-[22px] font-semibold leading-8 text-slate-950">
                  {task.title}
                </DialogTitle>
                <DialogDescription className="max-w-2xl text-sm leading-6 text-slate-600">
                  {t("curatedTask.launcher.description", {
                    summary: task.summary,
                  })}
                </DialogDescription>
                <div className="rounded-[18px] border border-slate-200 bg-white/90 px-3.5 py-3 text-xs leading-5 text-slate-500">
                  {launcherOutcomeSummary}
                </div>
                {launcherStarterContract ? (
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600">
                    <div>
                      <span className="font-medium text-slate-700">
                        {t("curatedTask.launcher.contract.requiredPrefix")}
                      </span>
                      {launcherStarterContract.requiredSummary}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium text-slate-700">
                        {t("curatedTask.launcher.contract.outputPrefix")}
                      </span>
                      {launcherStarterContract.outputSummary}
                    </div>
                    {launcherStarterContract.followUpSummary ? (
                      <div className="mt-1">
                        <span className="font-medium text-slate-700">
                          {t("curatedTask.launcher.contract.followUpPrefix")}
                        </span>
                        {launcherStarterContract.followUpSummary}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </DialogHeader>

            <div
              className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5"
              data-testid="curated-task-launcher-scroll-body"
            >
              {prefillHint ? (
                <div className="rounded-[18px] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs leading-5 text-emerald-700">
                  {prefillHint}
                </div>
              ) : null}
              {reviewFeedbackProjection ? (
                <div
                  className="rounded-[18px] border border-sky-200 bg-sky-50/80 px-4 py-3"
                  data-testid="curated-task-launcher-review-feedback-banner"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      {t("curatedTask.launcher.review.badge")}
                    </span>
                    <div className="text-xs font-semibold leading-5 text-slate-900">
                      {t("curatedTask.launcher.review.title", {
                        title: reviewFeedbackProjection.signal.title,
                      })}
                    </div>
                  </div>
                  <div className="mt-1.5 text-xs leading-5 text-slate-600">
                    {reviewFeedbackProjection.signal.summary}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">
                    {primarySuggestedTask
                      ? t("curatedTask.launcher.review.switchSuggestion", {
                          title: primarySuggestedTask.title,
                        })
                      : reviewFeedbackProjection.suggestionText}
                  </div>
                  {primarySuggestedTask && onApplyReviewSuggestion ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50"
                        data-testid="curated-task-launcher-review-feedback-banner-action"
                        onClick={handleApplyReviewSuggestion}
                      >
                        {t("curatedTask.launcher.review.switchAction", {
                          title: primarySuggestedTask.title,
                        })}
                      </button>
                      <span className="text-[10px] leading-5 text-slate-500">
                        {t("curatedTask.launcher.review.keepFieldsHint")}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {activeReviewBaselineSnapshot ? (
                <section
                  className="rounded-[20px] border border-emerald-200 bg-emerald-50/80 px-4 py-4"
                  data-testid="curated-task-launcher-sceneapp-baseline-card"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      {t("curatedTask.launcher.baseline.badge")}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {t("curatedTask.launcher.baseline.projectResult")}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {activeReviewBaselineSnapshot.sourceTitle}
                  </div>
                  {activeReviewBaselineHighlights.length > 0 ? (
                    <div className="mt-2 space-y-1.5 text-xs leading-5 text-emerald-900">
                      {activeReviewBaselineHighlights.map((item) => (
                        <div key={`baseline-${item}`}>{item}</div>
                      ))}
                    </div>
                  ) : null}
                  {activeReviewBaselineCarryHint ? (
                    <div className="mt-2 text-xs leading-5 text-emerald-700">
                      {activeReviewBaselineCarryHint}
                    </div>
                  ) : null}
                </section>
              ) : null}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">
                    {t("curatedTask.launcher.inputs.title")}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {t("curatedTask.launcher.inputs.hint")}
                  </div>
                </div>
              </section>

              <div className="grid gap-3">
                {task.requiredInputFields.map((field) => {
                  const fieldId = `curated-task-${task.id}-${field.key}`;
                  const value = inputValues[field.key] ?? "";
                  const commonClassName =
                    "mt-2 rounded-[16px] border-slate-200 bg-slate-50 focus-visible:ring-emerald-300";

                  return (
                    <div key={field.key}>
                      <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label
                            htmlFor={fieldId}
                            className="text-sm font-semibold text-slate-900"
                          >
                            {field.label}
                          </Label>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            {t("curatedTask.launcher.inputs.requiredBadge")}
                          </span>
                        </div>
                        {field.helperText ? (
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {field.helperText}
                          </div>
                        ) : null}
                        {field.type === "textarea" ? (
                          <Textarea
                            id={fieldId}
                            value={value}
                            placeholder={field.placeholder}
                            className={`${commonClassName} min-h-[112px] resize-y`}
                            onChange={(event) =>
                              handleValueChange(field.key, event.target.value)
                            }
                          />
                        ) : (
                          <Input
                            id={fieldId}
                            value={value}
                            placeholder={field.placeholder}
                            className={commonClassName}
                            onChange={(event) =>
                              handleValueChange(field.key, event.target.value)
                            }
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <section className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                        {t("curatedTask.launcher.reference.limitBadge", {
                          count: MAX_REFERENCE_SELECTION_COUNT,
                        })}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {t("curatedTask.launcher.reference.title")}
                    </div>
                    <div className="text-xs leading-5 text-slate-500">
                      {t("curatedTask.launcher.reference.description")}
                    </div>
                  </div>
                  {selectedReferenceEntryIds.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl border-slate-200"
                      onClick={() => setSelectedReferenceEntryIds([])}
                    >
                      {t("curatedTask.launcher.reference.clear")}
                    </Button>
                  ) : null}
                </div>

                {isReferenceEntriesLoading ? (
                  <div className="mt-4 flex items-center gap-2 rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    <LoaderCircle className="h-4 w-4 animate-spin text-slate-500" />
                    {t("curatedTask.launcher.reference.loading")}
                  </div>
                ) : null}

                {!isReferenceEntriesLoading && referenceEntries.length > 0 ? (
                  <div className="mt-4 grid gap-2.5">
                    {referenceEntries.map((entry) => {
                      const selected = selectedReferenceEntryIds.includes(
                        entry.id,
                      );
                      const selectionFull =
                        !selected &&
                        selectedReferenceEntryIds.length >=
                          MAX_REFERENCE_SELECTION_COUNT;
                      const entryReviewSnapshot = task
                        ? buildSceneAppExecutionReviewPrefillSnapshot({
                            referenceEntries: [entry],
                            taskId: task.id,
                          })
                        : null;
                      const entryReviewHighlights =
                        buildSceneAppExecutionReviewPrefillHighlights(
                          entryReviewSnapshot,
                        );

                      return (
                        <button
                          key={entry.id}
                          type="button"
                          data-testid={`curated-task-reference-option-${entry.id}`}
                          className={cn(
                            "rounded-[18px] border px-4 py-3.5 text-left transition",
                            selected
                              ? "border-emerald-300 bg-emerald-50 shadow-sm shadow-emerald-950/5"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                            selectionFull
                              ? "cursor-not-allowed opacity-55"
                              : "cursor-pointer",
                          )}
                          disabled={selectionFull}
                          onClick={() => handleToggleReferenceEntry(entry.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2">
                              <div className="text-[11px] leading-5 text-slate-500">
                                {[
                                  getCuratedTaskReferenceSourceLabel(entry),
                                  entry.categoryLabel,
                                ]
                                  .filter((segment): segment is string =>
                                    Boolean(segment && segment.trim()),
                                  )
                                  .join(" · ")}
                              </div>
                              <div className="text-sm font-semibold text-slate-900">
                                {entry.title}
                              </div>
                              <div className="text-xs leading-5 text-slate-600">
                                {entry.summary}
                              </div>
                              {entry.tags.length > 0 ? (
                                <div className="text-[11px] leading-5 text-slate-500">
                                  {t("curatedTask.launcher.reference.tags", {
                                    tags: entry.tags
                                      .slice(0, 2)
                                      .join(
                                        t(
                                          "curatedTask.launcher.reference.tagSeparator",
                                        ),
                                      ),
                                  })}
                                </div>
                              ) : null}
                              {entryReviewHighlights.length > 0 ? (
                                <div className="rounded-[14px] border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs leading-5 text-emerald-900">
                                  <div className="font-medium text-emerald-900">
                                    {t(
                                      "curatedTask.launcher.baseline.entryTitle",
                                      {
                                        title:
                                          entryReviewSnapshot?.sourceTitle ||
                                          entry.title,
                                      },
                                    )}
                                  </div>
                                  <div className="mt-1 space-y-1">
                                    {entryReviewHighlights.map((item) => (
                                      <div key={`${entry.id}-${item}`}>
                                        {item}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            <div
                              className={cn(
                                "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border",
                                selected
                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                  : "border-slate-300 bg-white text-slate-400",
                              )}
                            >
                              {selected ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {!isReferenceEntriesLoading &&
                referenceEntries.length === 0 &&
                !referenceEntriesError ? (
                  <div className="mt-4 rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    {t("curatedTask.launcher.reference.empty")}
                  </div>
                ) : null}

                {referenceEntriesError ? (
                  <div className="mt-4 rounded-[18px] border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {referenceEntriesError}
                  </div>
                ) : null}

                {selectedReferenceEntryIds.length > 0 ? (
                  <div className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {t("curatedTask.launcher.reference.selected", {
                      count: selectedReferenceEntryIds.length,
                    })}
                    {missingSelectedReferenceCount > 0
                      ? t("curatedTask.launcher.reference.missingSelected", {
                          count: missingSelectedReferenceCount,
                        })
                      : ""}
                  </div>
                ) : null}
              </section>

              <section className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                <div className="text-sm font-semibold text-slate-900">
                  {t("curatedTask.launcher.output.title")}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {task.outputContract.join(
                    t("curatedTask.launcher.summary.itemSeparator"),
                  )}
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-500">
                  {task.resultDestination}
                </div>
              </section>
            </div>

            <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-5 py-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl border-slate-200"
                onClick={() => onOpenChange(false)}
              >
                {t("curatedTask.launcher.action.cancel")}
              </Button>
              <Button
                type="button"
                data-testid="curated-task-launcher-confirm"
                className="rounded-2xl border border-[color:var(--lime-brand-strong)] bg-[color:var(--lime-brand-strong)] px-4 text-white shadow-sm shadow-slate-950/10 hover:bg-[color:var(--lime-brand)]"
                disabled={isLaunchDisabled}
                onClick={handleConfirm}
              >
                {t("curatedTask.launcher.action.confirm")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
