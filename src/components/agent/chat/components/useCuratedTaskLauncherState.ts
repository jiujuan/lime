import { useCallback, useState } from "react";
import {
  extractCuratedTaskReferenceMemoryIds,
  mergeCuratedTaskReferenceEntries,
  normalizeCuratedTaskReferenceMemoryIds,
} from "../utils/curatedTaskReferenceSelection";
import type {
  CuratedTaskReferenceEntry,
  CuratedTaskReferenceSelection,
} from "../utils/curatedTaskReferenceSelection";
import type {
  CuratedTaskInputValues,
  CuratedTaskTemplateItem,
} from "../utils/curatedTaskTemplates";

interface UseCuratedTaskLauncherStateInput {
  effectiveDefaultCuratedTaskReferenceEntries: CuratedTaskReferenceEntry[];
  effectiveDefaultCuratedTaskReferenceMemoryIds: string[];
  reviewSuggestionPrefillHint: string;
}

export function useCuratedTaskLauncherState({
  effectiveDefaultCuratedTaskReferenceEntries,
  effectiveDefaultCuratedTaskReferenceMemoryIds,
  reviewSuggestionPrefillHint,
}: UseCuratedTaskLauncherStateInput) {
  const [task, setTask] = useState<CuratedTaskTemplateItem | null>(null);
  const [initialInputValues, setInitialInputValues] =
    useState<CuratedTaskInputValues | null>(null);
  const [initialReferenceMemoryIds, setInitialReferenceMemoryIds] = useState<
    string[] | null
  >(null);
  const [initialReferenceEntries, setInitialReferenceEntries] = useState<
    CuratedTaskReferenceEntry[] | null
  >(null);
  const [prefillHint, setPrefillHint] = useState<string | null>(null);

  const reset = useCallback(() => {
    setTask(null);
    setInitialInputValues(null);
    setInitialReferenceMemoryIds(null);
    setInitialReferenceEntries(null);
    setPrefillHint(null);
  }, []);

  const open = useCallback(
    (
      nextTask: CuratedTaskTemplateItem,
      nextInitialInputValues?: CuratedTaskInputValues | null,
      nextInitialReferenceMemoryIds?: string[] | null,
      nextInitialReferenceEntries?: CuratedTaskReferenceEntry[] | null,
      nextPrefillHint?: string | null,
    ) => {
      const mergedReferenceEntries = mergeCuratedTaskReferenceEntries([
        ...(nextInitialReferenceEntries ?? []),
        ...effectiveDefaultCuratedTaskReferenceEntries,
      ]);
      const mergedReferenceMemoryIds =
        normalizeCuratedTaskReferenceMemoryIds([
          ...(nextInitialReferenceMemoryIds ?? []),
          ...(extractCuratedTaskReferenceMemoryIds(mergedReferenceEntries) ??
            []),
          ...effectiveDefaultCuratedTaskReferenceMemoryIds,
        ]) ?? null;

      setTask(nextTask);
      setInitialInputValues(nextInitialInputValues ?? null);
      setInitialReferenceMemoryIds(mergedReferenceMemoryIds);
      setInitialReferenceEntries(mergedReferenceEntries);
      setPrefillHint(nextPrefillHint ?? null);
    },
    [
      effectiveDefaultCuratedTaskReferenceEntries,
      effectiveDefaultCuratedTaskReferenceMemoryIds,
    ],
  );

  const handleOpenChange = useCallback(
    (openState: boolean) => {
      if (!openState) {
        reset();
      }
    },
    [reset],
  );

  const applyReviewSuggestion = useCallback(
    (
      nextTask: CuratedTaskTemplateItem,
      options: {
        inputValues: CuratedTaskInputValues;
        referenceSelection: CuratedTaskReferenceSelection;
      },
    ) => {
      setTask(nextTask);
      setInitialInputValues(options.inputValues);
      setInitialReferenceMemoryIds(
        options.referenceSelection.referenceMemoryIds,
      );
      setInitialReferenceEntries(options.referenceSelection.referenceEntries);
      setPrefillHint(reviewSuggestionPrefillHint);
    },
    [reviewSuggestionPrefillHint],
  );

  return {
    applyReviewSuggestion,
    handleOpenChange,
    initialInputValues,
    initialReferenceEntries,
    initialReferenceMemoryIds,
    open,
    prefillHint,
    reset,
    task,
  };
}
