import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
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

async function invokeMemoryRuntimeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = args
    ? await safeInvoke(command, args)
    : await safeInvoke(command);
  assertNotDiagnosticFacade(command, result, "真实 Memory runtime current 通道");
  return result as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || value === null || isNumber(value);
}

function isMemoryEntryPreview(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.session_id === "string" &&
    typeof value.file_type === "string" &&
    typeof value.category === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    isNumber(value.updated_at) &&
    isStringArray(value.tags)
  );
}

function isMemoryStatsResponse(
  value: unknown,
): value is MemoryStatsResponse {
  return (
    isRecord(value) &&
    isNumber(value.total_entries) &&
    isNumber(value.storage_used) &&
    isNumber(value.memory_count)
  );
}

function isMemoryOverviewResponse(
  value: unknown,
): value is MemoryOverviewResponse {
  return (
    isRecord(value) &&
    isMemoryStatsResponse(value.stats) &&
    Array.isArray(value.categories) &&
    Array.isArray(value.entries)
  );
}

function isCleanupMemoryResult(value: unknown): value is CleanupMemoryResult {
  return (
    isRecord(value) &&
    isNumber(value.cleaned_entries) &&
    isNumber(value.freed_space)
  );
}

function isMemoryAnalysisResult(value: unknown): value is MemoryAnalysisResult {
  return (
    isRecord(value) &&
    isNumber(value.analyzed_sessions) &&
    isNumber(value.analyzed_messages) &&
    isNumber(value.generated_entries) &&
    isNumber(value.deduplicated_entries)
  );
}

function isWorkingMemoryFileSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.file_type === "string" &&
    typeof value.path === "string" &&
    typeof value.exists === "boolean" &&
    isNumber(value.entry_count) &&
    isNumber(value.updated_at) &&
    typeof value.summary === "string"
  );
}

function isWorkingMemorySessionSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.session_id === "string" &&
    isNumber(value.total_entries) &&
    isNumber(value.updated_at) &&
    Array.isArray(value.files) &&
    value.files.every(isWorkingMemoryFileSummary) &&
    Array.isArray(value.highlights) &&
    value.highlights.every(isMemoryEntryPreview)
  );
}

function isWorkingMemoryView(value: unknown): value is WorkingMemoryView {
  return (
    isRecord(value) &&
    typeof value.memory_dir === "string" &&
    isNumber(value.total_sessions) &&
    isNumber(value.total_entries) &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isWorkingMemorySessionSummary)
  );
}

function isCompactionBoundarySnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.session_id === "string" &&
    typeof value.source === "string" &&
    typeof value.summary_preview === "string" &&
    isOptionalNumber(value.turn_count) &&
    isNumber(value.created_at) &&
    isOptionalString(value.trigger) &&
    isOptionalString(value.detail)
  );
}

function isMemoryExtractionStatusResponse(
  value: unknown,
): value is MemoryExtractionStatusResponse {
  return (
    isRecord(value) &&
    typeof value.enabled === "boolean" &&
    typeof value.status === "string" &&
    typeof value.status_summary === "string" &&
    isNumber(value.working_session_count) &&
    isNumber(value.working_entry_count) &&
    isOptionalNumber(value.latest_working_memory_at) &&
    (value.latest_compaction === undefined ||
      value.latest_compaction === null ||
      isCompactionBoundarySnapshot(value.latest_compaction)) &&
    Array.isArray(value.recent_compactions) &&
    value.recent_compactions.every(isCompactionBoundarySnapshot)
  );
}

function isDurableMemoryRecallEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.session_id === "string" &&
    typeof value.category === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    isNumber(value.updated_at) &&
    isStringArray(value.tags)
  );
}

function isTeamMemoryShadowEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.content === "string" &&
    isOptionalNumber(value.updated_at)
  );
}

function isTurnMemoryPrefetchResult(
  value: unknown,
): value is TurnMemoryPrefetchResult {
  return (
    isRecord(value) &&
    typeof value.session_id === "string" &&
    isStringArray(value.rules_source_paths) &&
    isOptionalString(value.working_memory_excerpt) &&
    Array.isArray(value.durable_memories) &&
    value.durable_memories.every(isDurableMemoryRecallEntry) &&
    Array.isArray(value.team_memory_entries) &&
    value.team_memory_entries.every(isTeamMemoryShadowEntry) &&
    (value.latest_compaction === undefined ||
      value.latest_compaction === null ||
      isCompactionBoundarySnapshot(value.latest_compaction)) &&
    isOptionalString(value.prompt)
  );
}

function isEffectiveMemorySource(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    isOptionalString(value.source_bucket) &&
    isOptionalString(value.provider) &&
    isOptionalString(value.memory_type) &&
    isOptionalNumber(value.updated_at) &&
    typeof value.path === "string" &&
    typeof value.exists === "boolean" &&
    typeof value.loaded === "boolean" &&
    isNumber(value.line_count) &&
    isNumber(value.import_count) &&
    isStringArray(value.warnings) &&
    isOptionalString(value.preview)
  );
}

function isEffectiveMemorySourcesResponse(
  value: unknown,
): value is EffectiveMemorySourcesResponse {
  return (
    isRecord(value) &&
    typeof value.working_dir === "string" &&
    isNumber(value.total_sources) &&
    isNumber(value.loaded_sources) &&
    typeof value.follow_imports === "boolean" &&
    isNumber(value.import_max_depth) &&
    Array.isArray(value.sources) &&
    value.sources.every(isEffectiveMemorySource)
  );
}

function isAutoMemoryIndexItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    isOptionalString(value.memory_type) &&
    isOptionalString(value.provider) &&
    isOptionalNumber(value.updated_at) &&
    typeof value.relative_path === "string" &&
    typeof value.exists === "boolean" &&
    isOptionalString(value.summary)
  );
}

function isAutoMemoryIndexResponse(
  value: unknown,
): value is AutoMemoryIndexResponse {
  return (
    isRecord(value) &&
    typeof value.enabled === "boolean" &&
    typeof value.root_dir === "string" &&
    typeof value.entrypoint === "string" &&
    isNumber(value.max_loaded_lines) &&
    typeof value.entry_exists === "boolean" &&
    isNumber(value.total_lines) &&
    isStringArray(value.preview_lines) &&
    Array.isArray(value.items) &&
    value.items.every(isAutoMemoryIndexItem)
  );
}

function isMemoryAutoToggleResponse(
  value: unknown,
): value is MemoryAutoToggleResponse {
  return isRecord(value) && typeof value.enabled === "boolean";
}

function isMemdirScaffoldFile(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.path === "string" &&
    typeof value.status === "string"
  );
}

function isMemdirScaffoldResult(value: unknown): value is MemdirScaffoldResult {
  return (
    isRecord(value) &&
    typeof value.root_dir === "string" &&
    typeof value.entrypoint === "string" &&
    typeof value.created_parent_dir === "boolean" &&
    Array.isArray(value.files) &&
    value.files.every(isMemdirScaffoldFile)
  );
}

function isMemdirCleanupResult(value: unknown): value is MemdirCleanupResult {
  return (
    isRecord(value) &&
    typeof value.root_dir === "string" &&
    typeof value.entrypoint === "string" &&
    isNumber(value.scanned_files) &&
    isNumber(value.updated_files) &&
    isNumber(value.removed_duplicate_links) &&
    isNumber(value.dropped_missing_links) &&
    isNumber(value.removed_duplicate_notes) &&
    isNumber(value.trimmed_notes) &&
    isNumber(value.curated_topic_files)
  );
}

function isRuntimeAgentsTemplateScaffoldResult(
  value: unknown,
): value is RuntimeAgentsTemplateScaffoldResult {
  return (
    isRecord(value) &&
    (value.target === "global" ||
      value.target === "workspace" ||
      value.target === "workspace_local") &&
    typeof value.path === "string" &&
    (value.status === "created" ||
      value.status === "exists" ||
      value.status === "overwritten") &&
    typeof value.createdParentDir === "boolean"
  );
}

function isWorkspaceGitignoreEnsureResult(
  value: unknown,
): value is WorkspaceGitignoreEnsureResult {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.entry === "string" &&
    (value.status === "created" ||
      value.status === "added" ||
      value.status === "exists")
  );
}

function serializeTurnMemoryPrefetchRequest(
  request: TurnMemoryPrefetchRequest,
): Record<string, unknown> {
  return {
    maxDurableEntries: request.max_durable_entries,
    maxWorkingChars: request.max_working_chars,
    requestMetadata: request.request_metadata,
    sessionId: request.session_id,
    userMessage: request.user_message,
    workingDir: request.working_dir,
  };
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
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_runtime_get_overview",
    { limit },
  );
  if (!isMemoryOverviewResponse(result)) {
    throw new Error(
      "memory_runtime_get_overview did not return memory overview",
    );
  }
  return result;
}

export async function getContextMemoryStats(): Promise<MemoryStatsResponse> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_runtime_get_stats",
  );
  if (!isMemoryStatsResponse(result)) {
    throw new Error("memory_runtime_get_stats did not return memory stats");
  }
  return result;
}

export async function analyzeContextMemory(
  fromTimestamp?: number,
  toTimestamp?: number,
): Promise<MemoryAnalysisResult> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_runtime_request_analysis",
    {
      fromTimestamp,
      toTimestamp,
    },
  );
  if (!isMemoryAnalysisResult(result)) {
    throw new Error(
      "memory_runtime_request_analysis did not return memory analysis result",
    );
  }
  return result;
}

export async function cleanupContextMemory(): Promise<CleanupMemoryResult> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_runtime_cleanup",
  );
  if (!isCleanupMemoryResult(result)) {
    throw new Error("memory_runtime_cleanup did not return cleanup result");
  }
  return result;
}

export async function getContextWorkingMemory(
  sessionId?: string,
  limit?: number,
): Promise<WorkingMemoryView> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_runtime_get_working_memory",
    {
      sessionId,
      limit,
    },
  );
  if (!isWorkingMemoryView(result)) {
    throw new Error(
      "memory_runtime_get_working_memory did not return working memory",
    );
  }
  return result;
}

export async function getContextMemoryExtractionStatus(): Promise<MemoryExtractionStatusResponse> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_runtime_get_extraction_status",
  );
  if (!isMemoryExtractionStatusResponse(result)) {
    throw new Error(
      "memory_runtime_get_extraction_status did not return extraction status",
    );
  }
  return result;
}

export async function prefetchContextMemoryForTurn(
  request: TurnMemoryPrefetchRequest,
): Promise<TurnMemoryPrefetchResult> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_runtime_prefetch_for_turn",
    {
      request: serializeTurnMemoryPrefetchRequest(request),
    },
  );
  if (!isTurnMemoryPrefetchResult(result)) {
    throw new Error(
      "memory_runtime_prefetch_for_turn did not return memory prefetch result",
    );
  }
  return result;
}

export async function getContextMemoryEffectiveSources(
  workingDir?: string,
  activeRelativePath?: string,
): Promise<EffectiveMemorySourcesResponse> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_get_effective_sources",
    {
      workingDir,
      activeRelativePath,
    },
  );
  if (!isEffectiveMemorySourcesResponse(result)) {
    throw new Error(
      "memory_get_effective_sources did not return effective memory sources",
    );
  }
  return result;
}

export async function getContextMemoryAutoIndex(
  workingDir?: string,
): Promise<AutoMemoryIndexResponse> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_get_auto_index",
    { workingDir },
  );
  if (!isAutoMemoryIndexResponse(result)) {
    throw new Error("memory_get_auto_index did not return auto memory index");
  }
  return result;
}

export async function toggleContextMemoryAuto(
  enabled: boolean,
): Promise<MemoryAutoToggleResponse> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_toggle_auto",
    { enabled },
  );
  if (!isMemoryAutoToggleResponse(result)) {
    throw new Error("memory_toggle_auto did not return memory auto toggle");
  }
  return result;
}

export async function updateContextMemoryAutoNote(
  note: string,
  topic?: string,
  workingDir?: string,
  memoryType?: MemdirMemoryType,
): Promise<AutoMemoryIndexResponse> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_update_auto_note",
    {
      note,
      topic,
      workingDir,
      memoryType,
    },
  );
  if (!isAutoMemoryIndexResponse(result)) {
    throw new Error(
      "memory_update_auto_note did not return auto memory index",
    );
  }
  return result;
}

export async function cleanupContextMemdir(
  workingDir?: string,
): Promise<MemdirCleanupResult> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_cleanup_memdir",
    { workingDir },
  );
  if (!isMemdirCleanupResult(result)) {
    throw new Error("memory_cleanup_memdir did not return memdir cleanup");
  }
  return result;
}

export async function scaffoldContextMemdir(
  workingDir?: string,
  overwrite?: boolean,
): Promise<MemdirScaffoldResult> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_scaffold_memdir",
    {
      workingDir,
      overwrite,
    },
  );
  if (!isMemdirScaffoldResult(result)) {
    throw new Error("memory_scaffold_memdir did not return memdir scaffold");
  }
  return result;
}

export async function scaffoldRuntimeAgentsTemplate(
  target: RuntimeAgentsTemplateTarget,
  workingDir?: string,
  overwrite?: boolean,
): Promise<RuntimeAgentsTemplateScaffoldResult> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_scaffold_runtime_agents_template",
    {
      target,
      workingDir,
      overwrite,
    },
  );
  if (!isRuntimeAgentsTemplateScaffoldResult(result)) {
    throw new Error(
      "memory_scaffold_runtime_agents_template did not return runtime agents template scaffold",
    );
  }
  return result;
}

export async function ensureWorkspaceLocalAgentsGitignore(
  workingDir?: string,
): Promise<WorkspaceGitignoreEnsureResult> {
  const result = await invokeMemoryRuntimeCommand<unknown>(
    "memory_ensure_workspace_local_agents_gitignore",
    {
      workingDir,
    },
  );
  if (!isWorkspaceGitignoreEnsureResult(result)) {
    throw new Error(
      "memory_ensure_workspace_local_agents_gitignore did not return workspace gitignore result",
    );
  }
  return result;
}
