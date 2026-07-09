import type { AsterSubagentSessionInfo } from "@/lib/api/agentRuntime";
import type { HarnessSessionState } from "../utils/harnessState";
import type {
  FileDisplayMode,
  FileEventGroup,
  FileFilterValue,
  FilePreviewRequest,
  HarnessEnvironmentSummary,
  TranslationFunction,
} from "./HarnessActivityTypes";
import { HarnessApprovalsSection } from "./HarnessApprovalsSection";
import { HarnessContextCapabilitiesSections } from "./HarnessContextCapabilitiesSections";
import { HarnessDelegationSection } from "./HarnessDelegationSection";
import { HarnessFileActivitySection } from "./HarnessFileActivitySection";
import { HarnessPlanSection } from "./HarnessPlanSection";
import type { HarnessSectionKey } from "./HarnessStatusSectionFrame";
import type { ChildSubagentSessionSummary } from "./harnessStatusPanelViewModel";

interface HarnessActivitySectionsProps {
  harnessState: HarnessSessionState;
  registerSectionRef: (
    key: HarnessSectionKey,
    node: HTMLElement | null,
  ) => void;
  t: TranslationFunction;
  handleOpenExternalLink: (url: string) => void | Promise<void>;
  handleOpenPathValue: (path: string) => void | Promise<void>;
  fileFilterOptions: ReadonlyArray<{ value: FileFilterValue; label: string }>;
  fileFilter: FileFilterValue;
  setFileFilter: (value: FileFilterValue) => void;
  fileDisplayMode: FileDisplayMode;
  setFileDisplayMode: (value: FileDisplayMode) => void;
  filteredFileEvents: HarnessSessionState["recentFileEvents"];
  groupedFileEvents: FileEventGroup[];
  openPreview: (request: FilePreviewRequest) => void | Promise<void>;
  realTeamSummary: ChildSubagentSessionSummary;
  childSubagentSessions: AsterSubagentSessionInfo[];
  onOpenSubagentSession?: (sessionId: string) => void;
  environment: HarnessEnvironmentSummary;
}

export function HarnessActivitySections({
  harnessState,
  registerSectionRef,
  t,
  handleOpenExternalLink,
  handleOpenPathValue,
  fileFilterOptions,
  fileFilter,
  setFileFilter,
  fileDisplayMode,
  setFileDisplayMode,
  filteredFileEvents,
  groupedFileEvents,
  openPreview,
  realTeamSummary,
  childSubagentSessions,
  onOpenSubagentSession,
  environment,
}: HarnessActivitySectionsProps) {
  return (
    <>
      <HarnessApprovalsSection
        pendingApprovals={harnessState.pendingApprovals}
        registerSectionRef={registerSectionRef}
        t={t}
        handleOpenExternalLink={handleOpenExternalLink}
        handleOpenPathValue={handleOpenPathValue}
      />
      <HarnessFileActivitySection
        recentFileEvents={harnessState.recentFileEvents}
        registerSectionRef={registerSectionRef}
        handleOpenExternalLink={handleOpenExternalLink}
        handleOpenPathValue={handleOpenPathValue}
        fileFilterOptions={fileFilterOptions}
        fileFilter={fileFilter}
        setFileFilter={setFileFilter}
        fileDisplayMode={fileDisplayMode}
        setFileDisplayMode={setFileDisplayMode}
        filteredFileEvents={filteredFileEvents}
        groupedFileEvents={groupedFileEvents}
        openPreview={openPreview}
      />
      <HarnessPlanSection
        plan={harnessState.plan}
        registerSectionRef={registerSectionRef}
        handleOpenExternalLink={handleOpenExternalLink}
      />
      <HarnessDelegationSection
        delegatedTasks={harnessState.delegatedTasks}
        registerSectionRef={registerSectionRef}
        handleOpenExternalLink={handleOpenExternalLink}
        realTeamSummary={realTeamSummary}
        childSubagentSessions={childSubagentSessions}
        onOpenSubagentSession={onOpenSubagentSession}
      />
      <HarnessContextCapabilitiesSections
        latestContextTrace={harnessState.latestContextTrace}
        activity={harnessState.activity}
        environment={environment}
        registerSectionRef={registerSectionRef}
        handleOpenExternalLink={handleOpenExternalLink}
        handleOpenPathValue={handleOpenPathValue}
      />
    </>
  );
}
