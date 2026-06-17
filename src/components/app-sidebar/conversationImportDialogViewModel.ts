import type {
  ConversationImportSourceProvenance,
  ImportedThreadSummary,
} from "@/lib/api/conversationImport";
import { formatDate } from "@/i18n/format";

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
): string {
  return normalizeOptional(thread?.title) || "本地历史对话";
}

export function firstImportableThread(
  threads: ImportedThreadSummary[],
): ImportedThreadSummary | null {
  return (
    threads.find((thread) => thread.importStatus === "not_imported") ??
    threads[0] ??
    null
  );
}

export function isImportedThread(
  thread?: ImportedThreadSummary | null,
): boolean {
  return thread?.importStatus === "imported";
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
    t("navigation.sidebar.importDialog.threadList.localHistory", "本地历史")
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
  sourceClient: string | undefined,
): string {
  if (sourceClient === "claude_code") {
    return "Claude Code";
  }
  return "本地历史";
}

export function buildImportPreviewMetaText(
  updatedAt: string | null,
  t: ConversationImportDialogTranslate,
): string {
  return t("navigation.sidebar.importDialog.preview.meta", {
    updatedAt:
      updatedAt ||
      t("navigation.sidebar.importDialog.preview.unknownTime", "未知时间"),
    defaultValue: "历史对话 · {{updatedAt}}",
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
      "历史记录",
    );
  }
  if (normalized.includes("tool")) {
    return t(
      "navigation.sidebar.importDialog.provenance.event.tool",
      "工具记录",
    );
  }
  if (normalized.includes("approval")) {
    return t(
      "navigation.sidebar.importDialog.provenance.event.approval",
      "确认记录",
    );
  }
  return t("navigation.sidebar.importDialog.provenance.event.item", "来源记录");
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
      "用户消息",
    );
  }
  if (normalized === "agent_message" || normalized === "assistant_message") {
    return t(
      "navigation.sidebar.importDialog.provenance.payload.assistant",
      "助手回复",
    );
  }
  if (normalized.includes("function_call") || normalized.includes("tool")) {
    return t(
      "navigation.sidebar.importDialog.provenance.payload.tool",
      "工具调用",
    );
  }
  if (normalized.includes("approval")) {
    return t(
      "navigation.sidebar.importDialog.provenance.payload.approval",
      "确认请求",
    );
  }
  if (normalized.includes("patch")) {
    return t(
      "navigation.sidebar.importDialog.provenance.payload.patch",
      "文件变更",
    );
  }
  return t(
    "navigation.sidebar.importDialog.provenance.payload.item",
    "导入条目",
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
      t("navigation.sidebar.importDialog.provenance.line", "来源行 #{{line}}", {
        line: provenance.sourceEventSeq,
      }),
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
      t("navigation.sidebar.importDialog.provenance.call", "调用记录"),
    );
  }

  return labels;
}
