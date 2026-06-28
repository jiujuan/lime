import { useMemo, useState } from "react";
import type { HarnessSessionState } from "../utils/harnessState";
import type { FileDisplayMode, FileFilterValue } from "./HarnessActivityTypes";
import {
  buildFileFilterOptions,
  buildFilteredFileEvents,
  buildFilteredOutputSignals,
  buildOutputFilterOptions,
  groupHarnessFileEvents,
  groupHarnessOutputSignals,
  type OutputFilterValue,
} from "./harnessStatusPanelViewModel";

export function useHarnessActivityModel(
  harnessState: HarnessSessionState,
  enabled = true,
) {
  const [fileFilter, setFileFilter] = useState<FileFilterValue>("all");
  const [outputFilter, setOutputFilter] = useState<OutputFilterValue>("all");
  const [fileDisplayMode, setFileDisplayMode] =
    useState<FileDisplayMode>("timeline");

  const fileFilterOptions = useMemo(
    () =>
      enabled ? buildFileFilterOptions(harnessState.recentFileEvents) : [],
    [enabled, harnessState.recentFileEvents],
  );
  const outputFilterOptions = useMemo(
    () => (enabled ? buildOutputFilterOptions(harnessState.outputSignals) : []),
    [enabled, harnessState.outputSignals],
  );
  const filteredFileEvents = useMemo(
    () =>
      enabled
        ? buildFilteredFileEvents(harnessState.recentFileEvents, fileFilter)
        : [],
    [enabled, fileFilter, harnessState.recentFileEvents],
  );
  const filteredOutputSignals = useMemo(
    () =>
      enabled
        ? buildFilteredOutputSignals(harnessState.outputSignals, outputFilter)
        : [],
    [enabled, harnessState.outputSignals, outputFilter],
  );
  const groupedOutputEntries = useMemo(
    () => groupHarnessOutputSignals(filteredOutputSignals),
    [filteredOutputSignals],
  );
  const groupedFileEvents = useMemo(
    () => groupHarnessFileEvents(filteredFileEvents),
    [filteredFileEvents],
  );

  return {
    fileDisplayMode,
    fileFilter,
    fileFilterOptions,
    filteredFileEvents,
    filteredOutputSignals,
    groupedFileEvents,
    groupedOutputEntries,
    outputFilter,
    outputFilterOptions,
    setFileDisplayMode,
    setFileFilter,
    setOutputFilter,
  };
}
