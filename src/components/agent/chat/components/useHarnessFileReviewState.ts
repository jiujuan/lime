import { useEffect, useMemo, useState } from "react";
import type { HarnessSessionState } from "../utils/harnessState";
import {
  buildFileChangeReviewEntries,
  countFileChangeStatuses,
  type FileChangeDecisionStatus,
} from "./harnessStatusPanelViewModel";

export interface HarnessFileChangeReviewSummary {
  total: number;
  pending: number;
  applied: number;
  rejected: number;
}

export function useHarnessFileReviewState(
  harnessState: HarnessSessionState,
  enabled = true,
) {
  const [fileChangeDecisions, setFileChangeDecisions] = useState<
    Record<string, FileChangeDecisionStatus>
  >({});
  const [selectedFileChangeKeys, setSelectedFileChangeKeys] = useState<
    string[]
  >([]);

  const fileChangeReviewEntries = useMemo(
    () =>
      enabled
        ? buildFileChangeReviewEntries({
            activeFileWrites: harnessState.activeFileWrites,
            recentFileEvents: harnessState.recentFileEvents,
            decisions: fileChangeDecisions,
          })
        : [],
    [
      enabled,
      fileChangeDecisions,
      harnessState.activeFileWrites,
      harnessState.recentFileEvents,
    ],
  );
  const fileChangeStatusCounts = useMemo(
    () => countFileChangeStatuses(fileChangeReviewEntries),
    [fileChangeReviewEntries],
  );
  const fileChangeReviewSummary = useMemo<HarnessFileChangeReviewSummary>(
    () => ({
      total: fileChangeReviewEntries.length,
      pending: fileChangeStatusCounts.pending,
      applied: fileChangeStatusCounts.applied,
      rejected: fileChangeStatusCounts.rejected,
    }),
    [
      fileChangeReviewEntries.length,
      fileChangeStatusCounts.applied,
      fileChangeStatusCounts.pending,
      fileChangeStatusCounts.rejected,
    ],
  );
  const selectableFileChangeKeys = useMemo(
    () => fileChangeReviewEntries.map((entry) => entry.key),
    [fileChangeReviewEntries],
  );
  const selectedFileChangeSet = useMemo(
    () => new Set(selectedFileChangeKeys),
    [selectedFileChangeKeys],
  );
  const selectedFileChangeEntries = useMemo(
    () =>
      fileChangeReviewEntries.filter((entry) =>
        selectedFileChangeSet.has(entry.key),
      ),
    [fileChangeReviewEntries, selectedFileChangeSet],
  );
  const selectedFileChangeCount = selectedFileChangeEntries.length;
  const allFileChangesSelected =
    selectableFileChangeKeys.length > 0 &&
    selectedFileChangeCount === selectableFileChangeKeys.length;

  useEffect(() => {
    const knownKeys = new Set(selectableFileChangeKeys);
    setSelectedFileChangeKeys((previous) =>
      previous.filter((key) => knownKeys.has(key)),
    );
    setFileChangeDecisions((previous) => {
      let changed = false;
      const next: Record<string, FileChangeDecisionStatus> = {};
      for (const key of Object.keys(previous)) {
        if (knownKeys.has(key)) {
          next[key] = previous[key];
        } else {
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [selectableFileChangeKeys]);

  return {
    allFileChangesSelected,
    fileChangeReviewEntries,
    fileChangeReviewSummary,
    fileChangeStatusCounts,
    selectableFileChangeKeys,
    selectedFileChangeCount,
    selectedFileChangeEntries,
    selectedFileChangeSet,
    setFileChangeDecisions,
    setSelectedFileChangeKeys,
  };
}
