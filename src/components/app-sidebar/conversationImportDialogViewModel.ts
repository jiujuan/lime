import type {
  ConversationImportSourceClient,
  ConversationImportJob,
  ConversationImportJobPhase,
  ConversationImportSourceProvenance,
  ImportedThreadSummary,
} from "@/lib/api/conversationImport";
import { formatDate } from "@/i18n/format";

export const DEFAULT_CONVERSATION_IMPORT_SOURCE_CLIENT: ConversationImportSourceClient =
  "codex";

const IMPORT_SOURCE_CLIENT_LABEL = {
  key: "navigation.sidebar.importDialog.source.localHistory",
  defaultValue: "Local history",
};

export interface ConversationImportDialogTranslate {
  (key: string, defaultValue: string): string;
  (key: string, options: Record<string, unknown>): string;
  (key: string, defaultValue: string, options: Record<string, unknown>): string;
}

export function normalizeOptional(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function resolveImportThreadTitle(
  thread?: ImportedThreadSummary | null,
  t?: ConversationImportDialogTranslate,
): string {
  return (
    normalizeOptional(thread?.title) ||
    t?.(
      "navigation.sidebar.importDialog.threadList.defaultTitle",
      "Local history conversation",
    ) ||
    "Local history conversation"
  );
}

export function firstImportableThread(
  threads: ImportedThreadSummary[],
): ImportedThreadSummary | null {
  return (
    threads.find((thread) => thread.importStatus === "importing") ??
    threads.find((thread) => thread.importStatus === "not_imported") ??
    threads[0] ??
    null
  );
}

export type ImportThreadGroupMode = "day" | "month";
export type ImportThreadArchiveFilter = "all" | "active" | "archived";

export interface ImportThreadGroup {
  id: string;
  label: string;
  threads: ImportedThreadSummary[];
}

export function isSelectableImportThread(
  thread?: ImportedThreadSummary | null,
): boolean {
  return (
    thread?.importStatus === "not_imported" ||
    thread?.importStatus === "importing" ||
    thread?.importStatus === "imported"
  );
}

export function initialImportSelection(
  threads: ImportedThreadSummary[],
): Set<string> {
  const first = firstImportableThread(threads);
  return first && isSelectableImportThread(first)
    ? new Set([first.sourceThreadId])
    : new Set();
}

export function selectedImportThreads(
  threads: ImportedThreadSummary[],
  selectedThreadIds: ReadonlySet<string>,
): ImportedThreadSummary[] {
  return threads.filter(
    (thread) =>
      selectedThreadIds.has(thread.sourceThreadId) &&
      isSelectableImportThread(thread),
  );
}

export function filterImportThreadsByArchiveStatus(
  threads: ImportedThreadSummary[],
  filter: ImportThreadArchiveFilter,
): ImportedThreadSummary[] {
  if (filter === "archived") {
    return threads.filter((thread) => thread.archived);
  }
  if (filter === "active") {
    return threads.filter((thread) => !thread.archived);
  }
  return threads;
}

export function buildImportThreadGroups(
  threads: ImportedThreadSummary[],
  mode: ImportThreadGroupMode,
  locale: string,
  t: ConversationImportDialogTranslate,
): ImportThreadGroup[] {
  const groups = new Map<string, ImportThreadGroup>();
  for (const thread of threads) {
    const group = resolveThreadGroup(thread, mode, locale, t);
    const current = groups.get(group.id);
    if (current) {
      current.threads.push(thread);
    } else {
      groups.set(group.id, { ...group, threads: [thread] });
    }
  }
  return [...groups.values()];
}

function resolveThreadGroup(
  thread: ImportedThreadSummary,
  mode: ImportThreadGroupMode,
  locale: string,
  t: ConversationImportDialogTranslate,
): ImportThreadGroup {
  const value = thread.updatedAt ?? thread.createdAt;
  if (!value) {
    return {
      id: "unknown",
      label: t("navigation.sidebar.importDialog.group.unknown", "Unknown time"),
      threads: [],
    };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      id: "unknown",
      label: t("navigation.sidebar.importDialog.group.unknown", "Unknown time"),
      threads: [],
    };
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const id = mode === "month" ? `${year}-${month}` : `${year}-${month}-${day}`;
  const label =
    mode === "month"
      ? formatDate(value, { locale, year: "numeric", month: "short" })
      : formatDate(value, {
          locale,
          year: "numeric",
          month: "short",
          day: "numeric",
        });
  return { id, label, threads: [] };
}

export function isImportedThread(
  thread?: ImportedThreadSummary | null,
): boolean {
  return thread?.importStatus === "imported";
}

export function isImportingThread(
  thread?: ImportedThreadSummary | null,
): boolean {
  return thread?.importStatus === "importing";
}

export function resolveImportJobPercent(job: ConversationImportJob): number {
  if (job.status === "completed") {
    return 100;
  }
  const { completedItems, totalItems, phase } = job.progress;
  if (totalItems > 0) {
    return Math.min(
      99,
      Math.max(0, Math.round((completedItems / totalItems) * 100)),
    );
  }
  const fallback: Record<ConversationImportJobPhase, number> = {
    queued: 4,
    reading_source: 12,
    building_history: 24,
    persisting_history: 32,
    finalizing: 96,
    completed: 100,
    failed: 100,
  };
  return fallback[phase];
}

export function resolveImportJobPhaseLabel(
  phase: ConversationImportJobPhase,
  t: ConversationImportDialogTranslate,
): string {
  const labels: Record<ConversationImportJobPhase, [string, string]> = {
    queued: [
      "navigation.sidebar.importDialog.progress.queued",
      "Waiting to import",
    ],
    reading_source: [
      "navigation.sidebar.importDialog.progress.readingSource",
      "Reading local history",
    ],
    building_history: [
      "navigation.sidebar.importDialog.progress.buildingHistory",
      "Organizing conversation history",
    ],
    persisting_history: [
      "navigation.sidebar.importDialog.progress.persistingHistory",
      "Saving conversation history",
    ],
    finalizing: [
      "navigation.sidebar.importDialog.progress.finalizing",
      "Finishing import",
    ],
    completed: [
      "navigation.sidebar.importDialog.progress.completed",
      "Import complete",
    ],
    failed: [
      "navigation.sidebar.importDialog.progress.failed",
      "Import failed",
    ],
  };
  const [key, defaultValue] = labels[phase];
  return t(key, defaultValue);
}

export function resolveImportConfirmNoticeKey(
  thread?: ImportedThreadSummary | null,
): string {
  return isImportedThread(thread)
    ? "navigation.sidebar.importDialog.confirmNotice.replace"
    : "navigation.sidebar.importDialog.confirmNotice";
}

export function resolveImportConfirmActionKey(
  thread?: ImportedThreadSummary | null,
): string {
  return isImportedThread(thread)
    ? "navigation.sidebar.importDialog.action.replace"
    : "navigation.sidebar.importDialog.action.confirm";
}

export function resolveImportThreadSecondaryText(
  thread: ImportedThreadSummary,
  updatedAt: string | null,
  t: ConversationImportDialogTranslate,
): string {
  return (
    updatedAt ||
    normalizeOptional(thread.cwd) ||
    t(
      "navigation.sidebar.importDialog.threadList.localHistory",
      "Local history",
    )
  );
}

export function formatImportOptionalDate(
  value: string | undefined,
  locale: string,
): string | null {
  if (!value) {
    return null;
  }
  return formatDate(value, {
    locale,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function resolveImportSourceClientLabel(
  t: ConversationImportDialogTranslate,
): string {
  return t(
    IMPORT_SOURCE_CLIENT_LABEL.key,
    IMPORT_SOURCE_CLIENT_LABEL.defaultValue,
  );
}

export function buildImportPreviewMetaText(
  updatedAt: string | null,
  t: ConversationImportDialogTranslate,
): string {
  return t("navigation.sidebar.importDialog.preview.meta", {
    updatedAt:
      updatedAt ||
      t("navigation.sidebar.importDialog.preview.unknownTime", "Unknown time"),
    defaultValue: "History thread · {{updatedAt}}",
  });
}

export function truncateImportPreviewText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) {
    return normalized;
  }
  return `${normalized.slice(0, 220)}...`;
}

function normalizeSourceKind(value?: string | null): string {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_") || ""
  );
}

export function sourceEventLabel(
  value: string | undefined,
  t: ConversationImportDialogTranslate,
): string | null {
  const normalized = normalizeSourceKind(value);
  if (!normalized) {
    return null;
  }

  if (normalized === "event_msg" || normalized === "response_item") {
    return t(
      "navigation.sidebar.importDialog.provenance.event.history",
      "History record",
    );
  }
  if (normalized.includes("tool")) {
    return t(
      "navigation.sidebar.importDialog.provenance.event.tool",
      "Tool record",
    );
  }
  if (normalized.includes("approval")) {
    return t(
      "navigation.sidebar.importDialog.provenance.event.approval",
      "Confirmation record",
    );
  }
  return t(
    "navigation.sidebar.importDialog.provenance.event.item",
    "Source record",
  );
}

export function sourcePayloadLabel(
  value: string | undefined,
  t: ConversationImportDialogTranslate,
): string | null {
  const normalized = normalizeSourceKind(value);
  if (!normalized) {
    return null;
  }

  if (normalized === "user_message" || normalized === "message_user") {
    return t(
      "navigation.sidebar.importDialog.provenance.payload.user",
      "User message",
    );
  }
  if (normalized === "agent_message" || normalized === "assistant_message") {
    return t(
      "navigation.sidebar.importDialog.provenance.payload.assistant",
      "Assistant reply",
    );
  }
  if (normalized.includes("function_call") || normalized.includes("tool")) {
    return t(
      "navigation.sidebar.importDialog.provenance.payload.tool",
      "Tool call",
    );
  }
  if (normalized.includes("approval")) {
    return t(
      "navigation.sidebar.importDialog.provenance.payload.approval",
      "Confirmation request",
    );
  }
  if (normalized.includes("patch")) {
    return t(
      "navigation.sidebar.importDialog.provenance.payload.patch",
      "File change",
    );
  }
  return t(
    "navigation.sidebar.importDialog.provenance.payload.item",
    "Imported item",
  );
}

export function buildSourceProvenanceLabels(
  provenance: ConversationImportSourceProvenance | undefined,
  t: ConversationImportDialogTranslate,
): string[] {
  if (!provenance) {
    return [];
  }

  const labels: string[] = [];
  if (provenance.sourceEventSeq) {
    labels.push(
      t(
        "navigation.sidebar.importDialog.provenance.line",
        "Source line #{{line}}",
        {
          line: provenance.sourceEventSeq,
        },
      ),
    );
  }

  const eventLabel = sourceEventLabel(provenance.sourceEventType, t);
  if (eventLabel) {
    labels.push(eventLabel);
  }

  const payloadLabel = sourcePayloadLabel(provenance.sourcePayloadType, t);
  if (payloadLabel) {
    labels.push(payloadLabel);
  }

  if (provenance.sourceCallId) {
    labels.push(
      t("navigation.sidebar.importDialog.provenance.call", "Call record"),
    );
  }

  return labels;
}

export function resolveImportWarningText(
  warning: string,
  t: ConversationImportDialogTranslate,
): string {
  const normalized = warning.trim();
  if (
    normalized ===
    "Some source rollout items are counted but not shown in preview."
  ) {
    return t(
      "navigation.sidebar.importDialog.warnings.provenanceOnlyPreview",
      "Some source items are kept as provenance only and will not appear in the preview.",
    );
  }
  if (
    normalized ===
    "Imported local history messages and supported tool/patch timeline events; unsupported source items remain as provenance only."
  ) {
    return t(
      "navigation.sidebar.importDialog.warnings.provenanceOnlyCommit",
      "Messages and supported activity are imported; unsupported source items are kept as provenance only.",
    );
  }
  if (normalized.includes("high-volume local history runtime events")) {
    return t(
      "navigation.sidebar.importDialog.warnings.highVolumeRuntimeEvents",
      "This conversation has many activity records. The default view shows a compact set; full records remain available in the detail panel.",
    );
  }
  return t(
    "navigation.sidebar.importDialog.warnings.generic",
    "Some source details could only be kept as provenance.",
  );
}
