import type { AgentThreadItem } from "../types";

type MetadataSource = unknown;

const RUNTIME_STATUS_ITEM_ID_PREFIX = "turn_summary:";
const RUNTIME_STATUS_MARKERS = new Set([
  "runtime_status",
  "run.status",
  "agentui.runtime_status",
]);
const DIAGNOSTIC_VISIBILITIES = new Set([
  "transient",
  "diagnostics",
  "diagnostic",
  "runtime_status",
  "hidden",
]);
const USER_VISIBLE_VISIBILITIES = new Set([
  "conversation",
  "timeline",
  "process",
  "task",
]);

function isRecord(value: MetadataSource): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMetadataToken(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function readMetadataToken(
  metadata: MetadataSource,
  keys: readonly string[],
): string | null {
  if (!isRecord(metadata)) {
    return null;
  }

  for (const key of keys) {
    const value = normalizeMetadataToken(metadata[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function readNestedMetadataToken(
  metadata: MetadataSource,
  containers: readonly string[],
  keys: readonly string[],
): string | null {
  if (!isRecord(metadata)) {
    return null;
  }

  for (const containerKey of containers) {
    const container = metadata[containerKey];
    const value = readMetadataToken(container, keys);
    if (value) {
      return value;
    }
  }

  return null;
}

function readPresentationToken(
  metadata: MetadataSource,
  keys: readonly string[],
): string | null {
  return (
    readMetadataToken(metadata, keys) ||
    readNestedMetadataToken(metadata, ["agentui", "agentUi"], keys)
  );
}

function metadataMarksRuntimeStatus(metadata: MetadataSource): boolean {
  const source = readPresentationToken(metadata, [
    "sourceType",
    "source_type",
    "source",
    "kind",
    "eventClass",
    "event_class",
  ]);
  if (source && RUNTIME_STATUS_MARKERS.has(source)) {
    return true;
  }

  const surface = readPresentationToken(metadata, ["surface"]);
  return Boolean(surface && RUNTIME_STATUS_MARKERS.has(surface));
}

function metadataMarksDiagnosticsOnly(metadata: MetadataSource): boolean {
  const visibility = readPresentationToken(metadata, [
    "visibility",
    "persistence",
    "presentation",
  ]);
  if (visibility) {
    if (USER_VISIBLE_VISIBILITIES.has(visibility)) {
      return false;
    }
    if (DIAGNOSTIC_VISIBILITIES.has(visibility)) {
      return true;
    }
  }

  const surface = readPresentationToken(metadata, ["surface"]);
  return Boolean(surface && RUNTIME_STATUS_MARKERS.has(surface));
}

function metadataMarksUserVisible(metadata: MetadataSource): boolean {
  const visibility = readPresentationToken(metadata, [
    "visibility",
    "persistence",
    "presentation",
  ]);
  if (visibility && USER_VISIBLE_VISIBILITIES.has(visibility)) {
    return true;
  }

  const surface = readPresentationToken(metadata, ["surface"]);
  return Boolean(surface && USER_VISIBLE_VISIBILITIES.has(surface));
}

export function normalizeTurnSummaryDisplayText(text?: string | null): string {
  return (text || "").trim();
}

export function extractTurnSummaryLines(text?: string | null): string[] {
  return normalizeTurnSummaryDisplayText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isRuntimeStatusTurnSummaryItem(item: AgentThreadItem): boolean {
  if (item.type !== "turn_summary") {
    return false;
  }

  if (item.id.trim().startsWith(RUNTIME_STATUS_ITEM_ID_PREFIX)) {
    return true;
  }

  return metadataMarksRuntimeStatus(item.metadata);
}

export function shouldHideTurnSummaryFromConversation(
  item: AgentThreadItem,
): boolean {
  if (item.type !== "turn_summary") {
    return false;
  }

  if (metadataMarksDiagnosticsOnly(item.metadata)) {
    return true;
  }

  if (metadataMarksUserVisible(item.metadata)) {
    return false;
  }

  return isRuntimeStatusTurnSummaryItem(item);
}

interface RuntimeStatusLike {
  phase?: string | null;
  title?: string | null;
  detail?: string | null;
  checkpoints?: Array<string | null | undefined> | null;
  metadata?: MetadataSource;
}

export function buildRuntimeStatusPresentationText(
  status?: RuntimeStatusLike | null,
): string {
  if (!status) {
    return "";
  }

  return [status.title, status.detail, ...(status.checkpoints ?? [])]
    .map((line) => normalizeTurnSummaryDisplayText(line))
    .filter(Boolean)
    .join("\n");
}

export function isRuntimeStatusDiagnosticsOnly(
  status?: RuntimeStatusLike | null,
): boolean {
  if (!status) {
    return false;
  }

  return metadataMarksDiagnosticsOnly(status.metadata);
}
