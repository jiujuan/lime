import type {
  AgentRuntimeThreadReadModel,
  AsterSubagentSessionInfo,
} from "@/lib/api/agentRuntime";
import type { AgentThreadItem } from "../types";
import {
  type MinimalTranslate,
  translateTaskRailText,
} from "./generalWorkbenchTaskRailText";

interface TaskRailChangeSummaryReadModel {
  changed_file_count?: number;
  changed_files?: string[];
  patch_count?: number;
  applied_patch_count?: number;
  failed_patch_count?: number;
  running_patch_count?: number;
}

type TaskRailThreadReadModel = AgentRuntimeThreadReadModel & {
  change_summary?: TaskRailChangeSummaryReadModel | null;
};

interface CodexImportFidelityCounts {
  messages?: number | null;
  attachments?: number | null;
  reasoning?: number | null;
  tools?: number | null;
  commands?: number | null;
  patches?: number | null;
  approvals?: number | null;
  mcp?: number | null;
  webSearch?: number | null;
  unsupported?: number | null;
  provenanceOnly?: number | null;
  budgetDropped?: number | null;
}

export interface GeneralWorkbenchTaskRailContextInput {
  providerType?: string | null;
  model?: string | null;
  accessMode?: "read-only" | "current" | "full-access" | string | null;
  reasoningEffort?: string | null;
  workspacePath?: string | null;
  objectiveText?: string | null;
  changedFileCount?: number | null;
  changedFiles?: string[] | null;
  patchCount?: number | null;
  appliedPatchCount?: number | null;
  failedPatchCount?: number | null;
  runningPatchCount?: number | null;
  sourceCount?: number | null;
  sourceLabels?: string[] | null;
  sourceEvidenceCount?: number | null;
  sourceMissingCount?: number | null;
  sourceConsistencyStatus?:
    | "linked"
    | "needs-evidence"
    | "missing-source"
    | string
    | null;
  subtaskTotalCount?: number | null;
  subtaskActiveCount?: number | null;
  subtaskCompletedCount?: number | null;
  subtaskFailedCount?: number | null;
  importedSourceClient?: string | null;
  importedSourceThreadId?: string | null;
  importedFidelityCounts?: CodexImportFidelityCounts | null;
}

export interface GeneralWorkbenchTaskRailContextItem {
  id: string;
  label: string;
  value: string;
  title?: string | null;
  detailLabels?: string[];
  detailOverflowLabel?: string | null;
  detailStatus?: {
    label: string;
    tone: "success" | "warning" | "muted";
    title?: string | null;
  } | null;
}

function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || path;
}

function positiveInteger(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function positiveIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

function recordString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
  }
  return null;
}

function compactSourceClientLabel(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return null;
  }
  if (raw.toLowerCase() === "codex") {
    return "Codex";
  }
  return truncateText(raw.replace(/[_-]+/g, " "), 32);
}

function readThreadItemMetadata(
  item: AgentThreadItem,
): Record<string, unknown> | null {
  return asRecord((item as unknown as { metadata?: unknown }).metadata);
}

function readSourceProvenanceRecord(
  item: AgentThreadItem,
): Record<string, unknown> | null {
  const metadata = readThreadItemMetadata(item);
  const candidates = [
    metadata?.source_provenance,
    metadata?.sourceProvenance,
    (item as unknown as { sourceProvenance?: unknown }).sourceProvenance,
    (item as unknown as { source_provenance?: unknown }).source_provenance,
  ];
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (record) {
      return record;
    }
  }
  return null;
}

function readFidelityCounts(value: unknown): CodexImportFidelityCounts | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const counts: CodexImportFidelityCounts = {
    messages: recordNumber(record, ["messages"]),
    attachments: recordNumber(record, ["attachments"]),
    reasoning: recordNumber(record, ["reasoning"]),
    tools: recordNumber(record, ["tools"]),
    commands: recordNumber(record, ["commands"]),
    patches: recordNumber(record, ["patches"]),
    approvals: recordNumber(record, ["approvals"]),
    mcp: recordNumber(record, ["mcp"]),
    webSearch: recordNumber(record, ["webSearch", "web_search"]),
    unsupported: recordNumber(record, ["unsupported"]),
    provenanceOnly: recordNumber(record, [
      "provenanceOnly",
      "provenance_only",
    ]),
    budgetDropped: recordNumber(record, ["budgetDropped", "budget_dropped"]),
  };

  return Object.values(counts).some((count) => typeof count === "number")
    ? counts
    : null;
}

function resolveImportedFidelityCounts(
  threadItems: readonly AgentThreadItem[] | undefined,
): CodexImportFidelityCounts | null {
  for (const item of threadItems ?? []) {
    const metadata = readThreadItemMetadata(item);
    const counts = readFidelityCounts(
      metadata?.codexImportFidelity ?? metadata?.codex_import_fidelity,
    );
    if (counts) {
      return counts;
    }
  }
  return null;
}

function collectImportedSourceContext(
  threadItems: readonly AgentThreadItem[] | undefined,
): Pick<
  GeneralWorkbenchTaskRailContextInput,
  "importedSourceClient" | "importedSourceThreadId"
> {
  for (const item of threadItems ?? []) {
    const metadata = readThreadItemMetadata(item);
    const provenance = readSourceProvenanceRecord(item);
    const sourceClient =
      recordString(metadata ?? {}, ["source_client", "sourceClient"]) ??
      recordString(provenance ?? {}, ["sourceClient", "source_client"]);
    const sourceThreadId = recordString(provenance ?? {}, [
      "sourceThreadId",
      "source_thread_id",
      "threadId",
      "thread_id",
    ]);
    if (sourceClient || sourceThreadId) {
      return {
        importedSourceClient: sourceClient,
        importedSourceThreadId: sourceThreadId,
      };
    }
  }

  return {};
}

function compactSourceLabel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const host = new URL(trimmed).hostname.replace(/^www\./i, "");
      return host || truncateText(trimmed, 48);
    } catch {
      return truncateText(trimmed, 48);
    }
  }

  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return truncateText(basename(trimmed), 48);
  }

  return truncateText(trimmed, 48);
}

function appendSourceLabel(labels: string[], value: unknown) {
  const label = compactSourceLabel(value);
  if (!label) {
    return;
  }

  const normalized = label.toLocaleLowerCase();
  if (labels.some((item) => item.toLocaleLowerCase() === normalized)) {
    return;
  }

  labels.push(label);
}

function collectThreadReadSourceLabels(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
): string[] {
  const labels: string[] = [];
  const contextSummary = threadRead?.context_summary;

  appendSourceLabel(labels, contextSummary?.source);
  for (const source of contextSummary?.sources ?? []) {
    appendSourceLabel(labels, source);
  }

  for (const ref of contextSummary?.retrieval_refs ?? []) {
    appendSourceLabel(
      labels,
      ref.title || ref.path || ref.url || ref.source_id || ref.source,
    );
  }

  for (const ref of contextSummary?.team_memory_refs ?? []) {
    appendSourceLabel(labels, ref.key || ref.repo_scope || ref.source);
  }

  for (const evidenceRef of threadRead?.evidence_summary?.evidence_refs ?? []) {
    appendSourceLabel(labels, evidenceRef);
  }

  for (const artifact of threadRead?.artifacts ?? []) {
    appendSourceLabel(
      labels,
      recordString(artifact, [
        "title",
        "name",
        "path",
        "filePath",
        "artifactPath",
        "artifact_ref",
        "artifactRef",
        "ref",
        "id",
      ]),
    );
  }

  return labels;
}

function collectThreadItemSourceLabels(
  threadItems: readonly AgentThreadItem[] | undefined,
): string[] {
  const labels: string[] = [];

  for (const item of threadItems ?? []) {
    const provenance = readSourceProvenanceRecord(item);
    appendSourceLabel(
      labels,
      recordString(provenance ?? {}, [
        "sourcePath",
        "source_path",
        "sourceThreadId",
        "source_thread_id",
      ]),
    );

    if (item.type === "web_search") {
      appendSourceLabel(labels, item.query || item.action);
      continue;
    }

    if (item.type === "file_artifact") {
      appendSourceLabel(labels, item.path || item.source);
    }
  }

  return labels;
}

function mergeSourceLabels(...groups: readonly string[][]): string[] {
  const labels: string[] = [];
  for (const group of groups) {
    for (const label of group) {
      appendSourceLabel(labels, label);
    }
  }
  return labels;
}

function countEvidenceRefs(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
): number {
  const evidenceRefs = stringArray(threadRead?.evidence_summary?.evidence_refs);
  const verificationOutcomes =
    threadRead?.evidence_summary?.verification_outcomes ?? [];
  return evidenceRefs.length + verificationOutcomes.length;
}

function countMissingContext(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
): number {
  return threadRead?.context_summary?.missing_context?.filter((item) => {
    const status = item.status?.trim().toLowerCase();
    return status !== "resolved" && status !== "available";
  }).length ?? 0;
}

function countSearchSourceItems(
  threadItems: readonly AgentThreadItem[] | undefined,
): number {
  return (threadItems ?? []).filter((item) => item.type === "web_search")
    .length;
}

function resolveSourceConsistencyStatus({
  sourceCount,
  sourceEvidenceCount,
  sourceMissingCount,
}: {
  sourceCount: number;
  sourceEvidenceCount: number;
  sourceMissingCount: number;
}): GeneralWorkbenchTaskRailContextInput["sourceConsistencyStatus"] {
  if (sourceCount === 0 || sourceMissingCount > 0) {
    return "missing-source";
  }
  if (sourceEvidenceCount > 0) {
    return "linked";
  }
  return "needs-evidence";
}

function resolveSubtaskStats(
  childSubagentSessions: readonly AsterSubagentSessionInfo[] | undefined,
) {
  return (childSubagentSessions ?? []).reduce(
    (stats, session) => {
      const status =
        session.runtime_status || session.latest_turn_status || "idle";
      stats.total += 1;
      if (status === "running" || status === "queued") {
        stats.active += 1;
      } else if (status === "completed" || status === "closed") {
        stats.completed += 1;
      } else if (status === "failed" || status === "aborted") {
        stats.failed += 1;
      }
      return stats;
    },
    { total: 0, active: 0, completed: 0, failed: 0 },
  );
}

function formatAccessMode(
  accessMode: GeneralWorkbenchTaskRailContextInput["accessMode"],
  t: MinimalTranslate,
): string | null {
  const normalized = accessMode?.trim();
  if (!normalized) {
    return null;
  }

  switch (normalized) {
    case "read-only":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.access.readOnly",
        "只读",
      );
    case "current":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.access.current",
        "按需确认",
      );
    case "full-access":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.access.fullAccess",
        "完全访问",
      );
    default:
      return normalized;
  }
}

function formatReasoningEffort(
  reasoningEffort: GeneralWorkbenchTaskRailContextInput["reasoningEffort"],
  t: MinimalTranslate,
): string | null {
  const normalized = reasoningEffort?.trim();
  if (!normalized) {
    return null;
  }

  switch (normalized) {
    case "low":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.reasoning.low",
        "低",
      );
    case "medium":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.reasoning.medium",
        "中",
      );
    case "high":
      return translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.reasoning.high",
        "高",
      );
    default:
      return normalized;
  }
}

function truncateText(value: string, maxLength = 120): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildObjectiveContextItem(
  context: GeneralWorkbenchTaskRailContextInput,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailContextItem | null {
  const objectiveText = context.objectiveText?.trim();
  if (!objectiveText) {
    return null;
  }

  return {
    id: "objective",
    label: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.context.objective",
      "目标",
    ),
    value: truncateText(objectiveText, 36),
    title: objectiveText,
  };
}

function buildChangesContextItem(
  context: GeneralWorkbenchTaskRailContextInput,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailContextItem | null {
  const changedFileCount = positiveInteger(context.changedFileCount);
  const patchCount = positiveInteger(context.patchCount);
  if (changedFileCount === 0 && patchCount === 0) {
    return null;
  }

  const failedPatchCount = positiveInteger(context.failedPatchCount);
  const runningPatchCount = positiveInteger(context.runningPatchCount);
  const changedFiles = (context.changedFiles ?? [])
    .map((path) => path.trim())
    .filter(Boolean);
  const titleKey =
    failedPatchCount > 0
      ? "generalWorkbench.taskRail.context.changesFailedTitle"
      : runningPatchCount > 0
        ? "generalWorkbench.taskRail.context.changesRunningTitle"
        : "generalWorkbench.taskRail.context.changesTitle";
  const defaultTitle =
    failedPatchCount > 0
      ? "变更 {{files}} 文件，{{failed}} 个补丁失败"
      : runningPatchCount > 0
        ? "变更 {{files}} 文件，{{running}} 个补丁进行中"
        : "变更 {{files}} 文件，补丁 {{patches}} 个";
  const titlePrefix = translateTaskRailText(t, titleKey, defaultTitle, {
    files: changedFileCount,
    patches: patchCount,
    applied: positiveInteger(context.appliedPatchCount),
    failed: failedPatchCount,
    running: runningPatchCount,
  });

  return {
    id: "changes",
    label: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.context.changes",
      "变更",
    ),
    value: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.context.changesValue",
      "{{files}} 文件",
      { files: changedFileCount },
    ),
    title:
      changedFiles.length > 0
        ? `${titlePrefix} · ${changedFiles.slice(0, 4).join(" / ")}`
        : titlePrefix,
  };
}

function buildSourcesContextItem(
  context: GeneralWorkbenchTaskRailContextInput,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailContextItem | null {
  const sourceLabels = mergeSourceLabels(stringArray(context.sourceLabels));
  const sourceCount = positiveInteger(context.sourceCount) || sourceLabels.length;
  const evidenceCount = positiveInteger(context.sourceEvidenceCount);
  const missingCount = positiveInteger(context.sourceMissingCount);
  if (sourceCount === 0 && missingCount === 0) {
    return null;
  }

  const visibleLabels = sourceLabels.slice(0, 3);
  const hiddenCount = Math.max(sourceCount - visibleLabels.length, 0);
  const sourcesText = visibleLabels.join(" / ");
  const title =
    visibleLabels.length === 0
      ? null
      : hiddenCount > 0
        ? translateTaskRailText(
            t,
            "generalWorkbench.taskRail.context.sourcesMoreTitle",
            "来源：{{sources}}，另有 {{count}} 项",
            { sources: sourcesText, count: hiddenCount },
          )
        : translateTaskRailText(
            t,
            "generalWorkbench.taskRail.context.sourcesTitle",
            "来源：{{sources}}",
            { sources: sourcesText },
          );
  const normalizedStatus = context.sourceConsistencyStatus?.trim();
  const status =
    normalizedStatus === "linked" ||
    normalizedStatus === "needs-evidence" ||
    normalizedStatus === "missing-source"
      ? normalizedStatus
      : null;
  const detailStatus =
    status === "linked"
      ? {
          label: translateTaskRailText(
            t,
            "generalWorkbench.taskRail.context.sourcesStatus.linked",
            "已关联",
          ),
          tone: "success" as const,
          title: translateTaskRailText(
            t,
            "generalWorkbench.taskRail.context.sourcesStatus.linkedTitle",
            "已关联 {{evidence}} 条证据",
            { evidence: evidenceCount },
          ),
        }
      : status === "needs-evidence"
        ? {
            label: translateTaskRailText(
              t,
              "generalWorkbench.taskRail.context.sourcesStatus.needsEvidence",
              "待补证据",
            ),
            tone: "warning" as const,
            title: translateTaskRailText(
              t,
              "generalWorkbench.taskRail.context.sourcesStatus.needsEvidenceTitle",
              "已有 {{sources}} 个来源，缺少证据引用",
              { sources: sourceCount },
            ),
          }
        : status === "missing-source"
          ? {
              label: translateTaskRailText(
                t,
                "generalWorkbench.taskRail.context.sourcesStatus.missingSource",
                "待补来源",
              ),
              tone: "warning" as const,
              title: translateTaskRailText(
                t,
                "generalWorkbench.taskRail.context.sourcesStatus.missingSourceTitle",
                "缺少 {{missing}} 项上下文来源",
                { missing: missingCount },
              ),
            }
          : null;

  return {
    id: "sources",
    label: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.context.sources",
      "来源",
    ),
    value: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.context.sourcesValue",
      "{{count}} 项",
      { count: sourceCount },
    ),
    title,
    detailLabels: visibleLabels,
    detailOverflowLabel:
      hiddenCount > 0
        ? translateTaskRailText(
            t,
            "generalWorkbench.taskRail.context.sourcesOverflow",
            "另有 {{count}} 项",
            { count: hiddenCount },
          )
        : null,
    detailStatus,
  };
}

function buildSubtasksContextItem(
  context: GeneralWorkbenchTaskRailContextInput,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailContextItem | null {
  const total = positiveInteger(context.subtaskTotalCount);
  if (total === 0) {
    return null;
  }

  const active = positiveInteger(context.subtaskActiveCount);
  const completed = positiveInteger(context.subtaskCompletedCount);
  const failed = positiveInteger(context.subtaskFailedCount);
  const titleKey =
    failed > 0
      ? "generalWorkbench.taskRail.context.subtasksFailedTitle"
      : active > 0
        ? "generalWorkbench.taskRail.context.subtasksActiveTitle"
        : "generalWorkbench.taskRail.context.subtasksTitle";
  const defaultTitle =
    failed > 0
      ? "子任务 {{failed}} 个需处理，{{completed}}/{{total}} 完成"
      : active > 0
        ? "子任务 {{active}} 个进行中，{{completed}}/{{total}} 完成"
        : "子任务 {{completed}}/{{total}} 完成";

  return {
    id: "subtasks",
    label: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.context.subtasks",
      "子任务",
    ),
    value: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.context.subtasksValue",
      "{{completed}}/{{total}}",
      { completed, total },
    ),
    title: translateTaskRailText(t, titleKey, defaultTitle, {
      active,
      completed,
      failed,
      total,
    }),
  };
}

function buildImportedContextItem(
  context: GeneralWorkbenchTaskRailContextInput,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailContextItem | null {
  const sourceClientLabel = compactSourceClientLabel(context.importedSourceClient);
  const fidelity = context.importedFidelityCounts ?? null;
  if (!sourceClientLabel && !fidelity && !context.importedSourceThreadId) {
    return null;
  }

  const detailLabels: string[] = [];
  const appendCount = (
    labelKey: string,
    fallback: string,
    count?: number | null,
  ) => {
    if (!count) {
      return;
    }
    detailLabels.push(
      translateTaskRailText(t, labelKey, fallback, { count }),
    );
  };

  appendCount(
    "generalWorkbench.taskRail.context.importedDetail.messages",
    "消息 {{count}}",
    fidelity?.messages,
  );
  appendCount(
    "generalWorkbench.taskRail.context.importedDetail.reasoning",
    "思考 {{count}}",
    fidelity?.reasoning,
  );
  appendCount(
    "generalWorkbench.taskRail.context.importedDetail.commands",
    "命令 {{count}}",
    fidelity?.commands,
  );
  appendCount(
    "generalWorkbench.taskRail.context.importedDetail.tools",
    "工具 {{count}}",
    fidelity?.tools,
  );
  appendCount(
    "generalWorkbench.taskRail.context.importedDetail.patches",
    "补丁 {{count}}",
    fidelity?.patches,
  );
  appendCount(
    "generalWorkbench.taskRail.context.importedDetail.approvals",
    "确认 {{count}}",
    fidelity?.approvals,
  );
  appendCount(
    "generalWorkbench.taskRail.context.importedDetail.webSearch",
    "搜索 {{count}}",
    fidelity?.webSearch,
  );

  const truncatedThreadId = context.importedSourceThreadId
    ? truncateText(context.importedSourceThreadId, 36)
    : null;
  const value = sourceClientLabel
    ? translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.importedValue",
        "{{source}} 导入",
        { source: sourceClientLabel },
      )
    : translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.importedValueFallback",
        "已导入",
      );
  const titleParts = [
    sourceClientLabel
      ? translateTaskRailText(
          t,
          "generalWorkbench.taskRail.context.importedTitle",
          "来自 {{source}}",
          { source: sourceClientLabel },
        )
      : null,
    truncatedThreadId
      ? translateTaskRailText(
          t,
          "generalWorkbench.taskRail.context.importedThreadTitle",
          "源线程 {{thread}}",
          { thread: truncatedThreadId },
        )
      : null,
    detailLabels.length > 0 ? detailLabels.slice(0, 4).join(" / ") : null,
  ].filter(Boolean);
  const budgetDropped = positiveInteger(fidelity?.budgetDropped ?? null);
  const unsupported = positiveInteger(fidelity?.unsupported ?? null);

  return {
    id: "imported-source",
    label: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.context.imported",
      "导入",
    ),
    value,
    title: titleParts.join(" · ") || null,
    detailLabels: detailLabels.slice(0, 3),
    detailOverflowLabel:
      detailLabels.length > 3
        ? translateTaskRailText(
            t,
            "generalWorkbench.taskRail.context.sourcesOverflow",
            "另有 {{count}} 项",
            { count: detailLabels.length - 3 },
          )
        : null,
    detailStatus:
      budgetDropped > 0 || unsupported > 0
        ? {
            label: translateTaskRailText(
              t,
              "generalWorkbench.taskRail.context.importedStatus.partial",
              "部分保留",
            ),
            tone: "warning",
            title: translateTaskRailText(
              t,
              "generalWorkbench.taskRail.context.importedStatus.partialTitle",
              "有 {{unsupported}} 项未完整映射，{{budgetDropped}} 项因预算裁剪",
              { unsupported, budgetDropped },
            ),
          }
        : {
            label: translateTaskRailText(
              t,
              "generalWorkbench.taskRail.context.importedStatus.restored",
              "已还原",
            ),
            tone: "success",
            title: translateTaskRailText(
              t,
              "generalWorkbench.taskRail.context.importedStatus.restoredTitle",
              "导入细节已进入当前会话轨迹",
            ),
          },
  };
}

export function buildGeneralWorkbenchTaskRailRuntimeContext({
  context,
  threadRead,
  threadItems,
  childSubagentSessions,
}: {
  context?: GeneralWorkbenchTaskRailContextInput;
  threadRead?: AgentRuntimeThreadReadModel | null;
  threadItems?: readonly AgentThreadItem[];
  childSubagentSessions?: readonly AsterSubagentSessionInfo[];
}): GeneralWorkbenchTaskRailContextInput | undefined {
  if (
    !context &&
    !threadRead &&
    (!threadItems?.length) &&
    (!childSubagentSessions?.length)
  ) {
    return context;
  }

  const nextContext: GeneralWorkbenchTaskRailContextInput = {
    ...(context ?? {}),
  };
  const objectiveText = threadRead?.managed_objective?.objective_text?.trim();
  if (objectiveText && !nextContext.objectiveText?.trim()) {
    nextContext.objectiveText = objectiveText;
  }

  const changeSummary = (threadRead as TaskRailThreadReadModel | null)
    ?.change_summary ?? null;
  if (changeSummary) {
    nextContext.changedFileCount =
      nextContext.changedFileCount ??
      positiveIntegerOrNull(changeSummary.changed_file_count);
    nextContext.changedFiles =
      nextContext.changedFiles ?? stringArray(changeSummary.changed_files);
    nextContext.patchCount =
      nextContext.patchCount ??
      positiveIntegerOrNull(changeSummary.patch_count);
    nextContext.appliedPatchCount =
      nextContext.appliedPatchCount ??
      positiveIntegerOrNull(changeSummary.applied_patch_count);
    nextContext.failedPatchCount =
      nextContext.failedPatchCount ??
      positiveIntegerOrNull(changeSummary.failed_patch_count);
    nextContext.runningPatchCount =
      nextContext.runningPatchCount ??
      positiveIntegerOrNull(changeSummary.running_patch_count);
  }

  const subtaskStats = resolveSubtaskStats(childSubagentSessions);
  if (subtaskStats.total > 0 && !nextContext.subtaskTotalCount) {
    nextContext.subtaskTotalCount = subtaskStats.total;
    nextContext.subtaskActiveCount = subtaskStats.active;
    nextContext.subtaskCompletedCount = subtaskStats.completed;
    nextContext.subtaskFailedCount = subtaskStats.failed;
  }

  const sourceLabels = mergeSourceLabels(
    stringArray(nextContext.sourceLabels),
    collectThreadReadSourceLabels(threadRead),
    collectThreadItemSourceLabels(threadItems),
  );
  if (sourceLabels.length > 0) {
    if (!positiveInteger(nextContext.sourceCount)) {
      nextContext.sourceCount = sourceLabels.length;
    }
    if (!nextContext.sourceLabels?.length) {
      nextContext.sourceLabels = sourceLabels;
    }
  }

  const inferredSourceCount =
    positiveInteger(nextContext.sourceCount) || sourceLabels.length;
  const inferredEvidenceCount =
    positiveInteger(nextContext.sourceEvidenceCount) ||
    countEvidenceRefs(threadRead);
  const inferredMissingCount =
    positiveInteger(nextContext.sourceMissingCount) ||
    countMissingContext(threadRead);
  const searchSourceCount = countSearchSourceItems(threadItems);
  const hasSourceSignal =
    inferredSourceCount > 0 || inferredMissingCount > 0 || searchSourceCount > 0;

  if (
    hasSourceSignal &&
    typeof nextContext.sourceEvidenceCount !== "number"
  ) {
    nextContext.sourceEvidenceCount = inferredEvidenceCount;
  }
  if (hasSourceSignal && typeof nextContext.sourceMissingCount !== "number") {
    nextContext.sourceMissingCount = inferredMissingCount;
  }
  if (!nextContext.sourceConsistencyStatus?.trim() && hasSourceSignal) {
    nextContext.sourceConsistencyStatus = resolveSourceConsistencyStatus({
      sourceCount: inferredSourceCount,
      sourceEvidenceCount: inferredEvidenceCount,
      sourceMissingCount: inferredMissingCount,
    });
  }

  const importedSource = collectImportedSourceContext(threadItems);
  nextContext.importedSourceClient =
    nextContext.importedSourceClient ?? importedSource.importedSourceClient;
  nextContext.importedSourceThreadId =
    nextContext.importedSourceThreadId ?? importedSource.importedSourceThreadId;
  nextContext.importedFidelityCounts =
    nextContext.importedFidelityCounts ??
    resolveImportedFidelityCounts(threadItems);

  return nextContext;
}

export function buildGeneralWorkbenchTaskRailContextItems(
  context: GeneralWorkbenchTaskRailContextInput | undefined,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailContextItem[] {
  if (!context) {
    return [];
  }

  const items: GeneralWorkbenchTaskRailContextItem[] = [];
  const trimmedProvider = context.providerType?.trim();
  const trimmedModel = context.model?.trim();
  if (trimmedProvider || trimmedModel) {
    items.push({
      id: "model",
      label: translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.model",
        "模型",
      ),
      value:
        trimmedProvider && trimmedModel
          ? `${trimmedProvider} / ${trimmedModel}`
          : trimmedModel || trimmedProvider || "",
    });
  }

  const accessModeLabel = formatAccessMode(context.accessMode, t);
  if (accessModeLabel) {
    items.push({
      id: "permission",
      label: translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.permission",
        "权限",
      ),
      value: accessModeLabel,
    });
  }

  const reasoningLabel = formatReasoningEffort(context.reasoningEffort, t);
  if (reasoningLabel) {
    items.push({
      id: "reasoning",
      label: translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.reasoning",
        "思考",
      ),
      value: reasoningLabel,
    });
  }

  const workspacePath = context.workspacePath?.trim();
  if (workspacePath) {
    items.push({
      id: "workspace",
      label: translateTaskRailText(
        t,
        "generalWorkbench.taskRail.context.workspace",
        "工作区",
      ),
      value: basename(workspacePath),
      title: workspacePath,
    });
  }

  const importedItem = buildImportedContextItem(context, t);
  if (importedItem) {
    items.push(importedItem);
  }

  const objectiveItem = buildObjectiveContextItem(context, t);
  if (objectiveItem) {
    items.push(objectiveItem);
  }

  const changesItem = buildChangesContextItem(context, t);
  if (changesItem) {
    items.push(changesItem);
  }

  const sourcesItem = buildSourcesContextItem(context, t);
  if (sourcesItem) {
    items.push(sourcesItem);
  }

  const subtasksItem = buildSubtasksContextItem(context, t);
  if (subtasksItem) {
    items.push(subtasksItem);
  }

  return items;
}
