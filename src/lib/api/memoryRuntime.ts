import type {
  AutoMemoryIndexResponse,
  CleanupMemoryResult,
  EffectiveMemorySourcesResponse,
  MemoryExtractionStatusResponse,
  MemoryAnalysisResult,
  MemoryAutoToggleResponse,
  MemdirCleanupResult,
  MemdirScaffoldResult,
  MemdirMemoryType,
  MemoryStatsResponse,
  MemoryOverviewResponse,
  RuntimeAgentsTemplateScaffoldResult,
  RuntimeAgentsTemplateTarget,
  TurnMemoryPrefetchRequest,
  TurnMemoryPrefetchResult,
  WorkingMemoryView,
  WorkspaceGitignoreEnsureResult,
} from "./memoryRuntimeTypes";

function rejectRetiredMemoryRuntimeCommand(command: string): never {
  throw new Error(
    `${command} is retired; Memory runtime must move to App Server current methods before this API can be used`,
  );
}

export type {
  AutoMemoryIndexResponse,
  AutoMemoryIndexItem,
  CleanupMemoryResult,
  CompactionBoundarySnapshot,
  DurableMemoryRecallEntry,
  EffectiveMemorySourcesResponse,
  EffectiveMemorySource,
  MemoryExtractionStatusResponse,
  MemoryAnalysisResult,
  MemoryAutoConfig,
  MemoryAutoToggleResponse,
  MemoryEmbeddingConfig,
  MemoryEmbeddingProvider,
  MemdirScaffoldFile,
  MemdirCleanupResult,
  MemdirScaffoldResult,
  MemdirMemoryType,
  MemoryCategoryStat,
  MemoryConfig,
  MemoryEntryPreview,
  MemoryOverviewResponse,
  MemoryProfileConfig,
  MemorySoulArtifactVoiceConfig,
  MemorySoulArtifactVoiceSource,
  MemorySoulConfig,
  MemorySoulImportSource,
  MemoryResolveConfig,
  MemorySourcesConfig,
  MemoryStatsResponse,
  RuntimeAgentsTemplateScaffoldResult,
  RuntimeAgentsTemplateScaffoldStatus,
  RuntimeAgentsTemplateTarget,
  TeamMemoryShadowEntry,
  TurnMemoryPrefetchRequest,
  TurnMemoryPrefetchResult,
  WorkingMemoryFileSummary,
  WorkingMemorySessionSummary,
  WorkingMemoryView,
  WorkspaceGitignoreEnsureResult,
  WorkspaceGitignoreEnsureStatus,
} from "./memoryRuntimeTypes";

export async function getContextMemoryOverview(
  limit?: number,
): Promise<MemoryOverviewResponse> {
  void limit;
  return rejectRetiredMemoryRuntimeCommand("memory_runtime_get_overview");
}

export async function getContextMemoryStats(): Promise<MemoryStatsResponse> {
  return rejectRetiredMemoryRuntimeCommand("memory_runtime_get_stats");
}

export async function analyzeContextMemory(
  fromTimestamp?: number,
  toTimestamp?: number,
): Promise<MemoryAnalysisResult> {
  void fromTimestamp;
  void toTimestamp;
  return rejectRetiredMemoryRuntimeCommand("memory_runtime_request_analysis");
}

export async function cleanupContextMemory(): Promise<CleanupMemoryResult> {
  return rejectRetiredMemoryRuntimeCommand("memory_runtime_cleanup");
}

export async function getContextWorkingMemory(
  sessionId?: string,
  limit?: number,
): Promise<WorkingMemoryView> {
  void sessionId;
  void limit;
  return rejectRetiredMemoryRuntimeCommand("memory_runtime_get_working_memory");
}

export async function getContextMemoryExtractionStatus(): Promise<MemoryExtractionStatusResponse> {
  return rejectRetiredMemoryRuntimeCommand(
    "memory_runtime_get_extraction_status",
  );
}

export async function prefetchContextMemoryForTurn(
  request: TurnMemoryPrefetchRequest,
): Promise<TurnMemoryPrefetchResult> {
  void request;
  return rejectRetiredMemoryRuntimeCommand("memory_runtime_prefetch_for_turn");
}

export async function getContextMemoryEffectiveSources(
  workingDir?: string,
  activeRelativePath?: string,
): Promise<EffectiveMemorySourcesResponse> {
  void workingDir;
  void activeRelativePath;
  return rejectRetiredMemoryRuntimeCommand("memory_get_effective_sources");
}

export async function getContextMemoryAutoIndex(
  workingDir?: string,
): Promise<AutoMemoryIndexResponse> {
  void workingDir;
  return rejectRetiredMemoryRuntimeCommand("memory_get_auto_index");
}

export async function toggleContextMemoryAuto(
  enabled: boolean,
): Promise<MemoryAutoToggleResponse> {
  void enabled;
  return rejectRetiredMemoryRuntimeCommand("memory_toggle_auto");
}

export async function updateContextMemoryAutoNote(
  note: string,
  topic?: string,
  workingDir?: string,
  memoryType?: MemdirMemoryType,
): Promise<AutoMemoryIndexResponse> {
  void note;
  void topic;
  void workingDir;
  void memoryType;
  return rejectRetiredMemoryRuntimeCommand("memory_update_auto_note");
}

export async function cleanupContextMemdir(
  workingDir?: string,
): Promise<MemdirCleanupResult> {
  void workingDir;
  return rejectRetiredMemoryRuntimeCommand("memory_cleanup_memdir");
}

export async function scaffoldContextMemdir(
  workingDir?: string,
  overwrite?: boolean,
): Promise<MemdirScaffoldResult> {
  void workingDir;
  void overwrite;
  return rejectRetiredMemoryRuntimeCommand("memory_scaffold_memdir");
}

export async function scaffoldRuntimeAgentsTemplate(
  target: RuntimeAgentsTemplateTarget,
  workingDir?: string,
  overwrite?: boolean,
): Promise<RuntimeAgentsTemplateScaffoldResult> {
  void target;
  void workingDir;
  void overwrite;
  return rejectRetiredMemoryRuntimeCommand(
    "memory_scaffold_runtime_agents_template",
  );
}

export async function ensureWorkspaceLocalAgentsGitignore(
  workingDir?: string,
): Promise<WorkspaceGitignoreEnsureResult> {
  void workingDir;
  return rejectRetiredMemoryRuntimeCommand(
    "memory_ensure_workspace_local_agents_gitignore",
  );
}
