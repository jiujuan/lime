import type {
  AgentUiPerformanceTraceHistoryExport,
  AgentUiPerformanceTraceHistoryRecord,
} from "@/lib/agentUiPerformanceTraceHistory";

export interface AgentUiPerformanceEntry {
  id: number;
  phase: string;
  at: number;
  wallTime: number;
  sessionId?: string | null;
  workspaceId?: string | null;
  source?: string | null;
  metrics: Record<string, string | number | boolean | null>;
}
export interface AgentUiPerformanceSessionSummary {
  sessionId: string;
  workspaceId?: string | null;
  inputbarTriggerToHomeSubmitMs?: number;
  inputbarTriggerToPendingShellMs?: number;
  inputbarTriggerToPendingPreviewCommitMs?: number;
  inputbarTriggerToPendingPreviewPaintMs?: number;
  inputbarTriggerToSendDispatchMs?: number;
  inputbarTriggerToSubmitAcceptedMs?: number;
  inputbarTriggerToFirstTextDeltaMs?: number;
  inputbarTriggerToFirstTextPaintMs?: number;
  homeInputToPendingShellMs?: number;
  homeInputToPendingPreviewCommitMs?: number;
  homeInputToPendingPreviewPaintMs?: number;
  homeInputToSendDispatchMs?: number;
  homeInputToSendPlanReadyMs?: number;
  homeInputToAssistantDraftMs?: number;
  homeInputToAssistantDraftPaintMs?: number;
  homeInputToStreamRequestStartMs?: number;
  homeInputToSubmitAcceptedMs?: number;
  homeInputToFirstEventMs?: number;
  homeInputToFirstRuntimeStatusMs?: number;
  homeInputToFirstThinkingDeltaMs?: number;
  homeInputToFirstTextDeltaMs?: number;
  homeInputToFirstTextRenderFlushMs?: number;
  homeInputToFirstTextPaintMs?: number;
  streamRequestStartToFirstTextPaintMs?: number;
  sendDispatchToSubmitAcceptedMs?: number;
  streamSubmitDispatchedToAcceptedMs?: number;
  submitAcceptedToFirstEventMs?: number;
  submitAcceptedToFirstTextPaintMs?: number;
  firstEventToFirstThinkingDeltaMs?: number;
  firstEventToFirstTextDeltaMs?: number;
  firstEventToFirstTextPaintMs?: number;
  firstThinkingDeltaToFirstTextDeltaMs?: number;
  firstTextDeltaToFirstTextPaintMs?: number;
  providerWaitMs?: number;
  serverToRendererFirstTextDeltaMs?: number;
  rendererApplyFirstTextDeltaMs?: number;
  clientLocalOutputMs?: number;
  streamEnsureSessionDurationMs?: number;
  streamSubmitInvokeDurationMs?: number;
  homeInputMaterializeDurationMs?: number;
  clickToSwitchStartMs?: number;
  clickToCachedSnapshotMs?: number;
  clickToPendingShellMs?: number;
  clickToFetchStartMs?: number;
  fetchDetailDurationMs?: number;
  runtimeGetSessionDurationMs?: number;
  clickToSwitchSuccessMs?: number;
  clickToFirstMessageListPaintMs?: number;
  clickToMessageListPaintMs?: number;
  switchStartCount?: number;
  fetchDetailStartCount?: number;
  fetchDetailErrorCount?: number;
  runtimeGetSessionStartCount?: number;
  runtimeGetSessionErrorCount?: number;
  messageListPaintCount?: number;
  finalMessagesCount?: number;
  finalRenderedMessagesCount?: number;
  finalThreadItemsCount?: number;
  hiddenHistoryCount?: number;
  persistedHiddenHistoryCount?: number;
  historicalContentPartsDeferredMax?: number;
  historicalMarkdownDeferredMax?: number;
  longTaskCount?: number;
  longTaskMaxMs?: number;
  messageListComputeMaxMs?: number;
  messageListGroupBuildMaxMs?: number;
  messageListHistoricalContentPartsScanMaxMs?: number;
  messageListHistoricalMarkdownTargetScanMaxMs?: number;
  messageListRenderGroupsMaxMs?: number;
  messageListThreadItemsScanMaxMs?: number;
  messageListTimelineBuildMaxMs?: number;
  threadItemsScanDeferredCount?: number;
  maxUsedJSHeapSize?: number;
  phases: string[];
}
export interface AgentUiPerformanceSnapshot {
  entries: AgentUiPerformanceEntry[];
  sessions: AgentUiPerformanceSessionSummary[];
}
export interface AgentUiPerformanceApi {
  entries: () => AgentUiPerformanceEntry[];
  clear: () => void;
  summary: () => AgentUiPerformanceSnapshot;
  clearHistory: () => void;
  exportHistory: () => AgentUiPerformanceTraceHistoryExport;
  history: () => AgentUiPerformanceTraceHistoryRecord[];
  saveSnapshot: (label?: string) => AgentUiPerformanceTraceHistoryRecord | null;
}
declare global {
  interface Window {
    __LIME_AGENTUI_PERF__?: AgentUiPerformanceApi;
  }
}
export declare const AGENT_UI_PERFORMANCE_METRIC_RECORDED_EVENT =
  "lime:agent-ui-performance-metric-recorded";
export interface AgentUiPerformanceMetricRecordedDetail {
  id: number;
  phase: string;
  sessionId?: string | null;
  source?: string | null;
  workspaceId?: string | null;
}
export declare function summarizeAgentUiPerformanceMetrics(): AgentUiPerformanceSnapshot;
export declare function clearAgentUiPerformanceMetrics(): void;
export declare function getAgentUiPerformanceMetrics(): AgentUiPerformanceEntry[];
export declare function recordAgentUiPerformanceMetric(
  phase: string,
  context?: Record<string, unknown>,
): AgentUiPerformanceEntry;
export declare function subscribeAgentUiPerformanceMetricRecorded(
  listener: (detail: AgentUiPerformanceMetricRecordedDetail) => void,
): () => void;
export declare function installAgentUiPerformanceApi(): AgentUiPerformanceApi | null;
