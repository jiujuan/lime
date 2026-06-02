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
) {
  const [fileFilter, setFileFilter] = useState<FileFilterValue>("all");
  const [outputFilter, setOutputFilter] = useState<OutputFilterValue>("all");
  const [fileDisplayMode, setFileDisplayMode] =
    useState<FileDisplayMode>("timeline");

  const fileFilterOptions = useMemo(
    () => buildFileFilterOptions(harnessState.recentFileEvents),
    [harnessState.recentFileEvents],
  );
  const outputFilterOptions = useMemo(
    () => buildOutputFilterOptions(harnessState.outputSignals),
    [harnessState.outputSignals],
  );
  const filteredFileEvents = useMemo(
    () => buildFilteredFileEvents(harnessState.recentFileEvents, fileFilter),
    [fileFilter, harnessState.recentFileEvents],
  );
  const filteredOutputSignals = useMemo(
    () => buildFilteredOutputSignals(harnessState.outputSignals, outputFilter),
    [harnessState.outputSignals, outputFilter],
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
