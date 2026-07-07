export interface QueuedTurnSnapshot {
  queued_turn_id: string;
  message_preview: string;
  message_text: string;
  created_at: number;
  image_count: number;
  position: number;
  attachments?: unknown[];
  input_attachments?: unknown[];
  inputAttachments?: unknown[];
  path_references?: unknown[];
  pathReferences?: unknown[];
  text_elements?: unknown[];
  textElements?: unknown[];
  input_capability_route?: unknown;
  inputCapabilityRoute?: unknown;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? [...value] : null;
}

function readRestoreRoute(value: unknown): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : undefined;
}

function hasQueuedTurnPosition(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  return readNumber((snapshot as Record<string, unknown>).position) !== null;
}

function buildQueuedTurnPreview(messageText: string): string {
  const compact = messageText.split(/\s+/).filter(Boolean).join(" ");
  if (!compact) {
    return "空白输入";
  }

  const preview = Array.from(compact).slice(0, 80).join("");
  return compact.length > preview.length ? `${preview}...` : preview;
}

export function normalizeQueuedTurnSnapshot(
  snapshot: unknown,
): QueuedTurnSnapshot | null {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const raw = snapshot as Record<string, unknown>;
  const queuedTurnId =
    readString(raw.queued_turn_id) ?? readString(raw.queuedTurnId);
  if (!queuedTurnId?.trim()) {
    return null;
  }

  const messagePreview =
    readString(raw.message_preview) ?? readString(raw.messagePreview) ?? "";
  const messageText =
    readString(raw.message_text) ??
    readString(raw.messageText) ??
    messagePreview;
  const normalizedMessageText = messageText.trim() ? messageText : "空白输入";
  const normalizedMessagePreview = messagePreview.trim()
    ? messagePreview
    : buildQueuedTurnPreview(normalizedMessageText);
  const attachments =
    readArray(raw.attachments) ??
    readArray(raw.input_attachments) ??
    readArray(raw.inputAttachments);
  const pathReferences =
    readArray(raw.path_references) ?? readArray(raw.pathReferences);
  const textElements =
    readArray(raw.text_elements) ?? readArray(raw.textElements);
  const inputCapabilityRoute =
    readRestoreRoute(raw.input_capability_route) ??
    readRestoreRoute(raw.inputCapabilityRoute);

  const normalized: QueuedTurnSnapshot = {
    queued_turn_id: queuedTurnId,
    message_preview: normalizedMessagePreview,
    message_text: normalizedMessageText,
    created_at: readNumber(raw.created_at) ?? readNumber(raw.createdAt) ?? 0,
    image_count: readNumber(raw.image_count) ?? readNumber(raw.imageCount) ?? 0,
    position: readNumber(raw.position) ?? 0,
  };
  if (attachments) {
    normalized.attachments = attachments;
    normalized.input_attachments = attachments;
    normalized.inputAttachments = attachments;
  }
  if (pathReferences) {
    normalized.path_references = pathReferences;
    normalized.pathReferences = pathReferences;
  }
  if (textElements) {
    normalized.text_elements = textElements;
    normalized.textElements = textElements;
  }
  if (inputCapabilityRoute) {
    normalized.input_capability_route = inputCapabilityRoute;
    normalized.inputCapabilityRoute = inputCapabilityRoute;
  }

  return normalized;
}

export function normalizeQueuedTurnSnapshots(
  snapshots: unknown,
): QueuedTurnSnapshot[] {
  if (!Array.isArray(snapshots)) {
    return [];
  }

  const normalized = snapshots
    .map((snapshot, index) => ({
      index,
      hasPosition: hasQueuedTurnPosition(snapshot),
      snapshot: normalizeQueuedTurnSnapshot(snapshot),
    }))
    .filter(
      (
        entry,
      ): entry is {
        index: number;
        hasPosition: boolean;
        snapshot: QueuedTurnSnapshot;
      } => Boolean(entry.snapshot),
    );

  if (!normalized.every((entry) => entry.hasPosition)) {
    return normalized.map((entry) => entry.snapshot);
  }

  return [...normalized]
    .sort((left, right) => {
      const positionDelta = left.snapshot.position - right.snapshot.position;
      return positionDelta === 0 ? left.index - right.index : positionDelta;
    })
    .map((entry) => entry.snapshot);
}
