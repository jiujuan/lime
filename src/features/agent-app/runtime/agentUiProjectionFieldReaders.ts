const TEXT_PREVIEW_LIMIT = 160;

export function readStreamKind(event: Record<string, unknown>): string | null {
  const payload = recordValue(event, "payload");
  const runtimeEvent = recordValue(payload, "runtimeEvent");
  return (
    readString(payload, "streamKind") ??
    readString(event, "streamKind") ??
    readString(runtimeEvent, "type")
  );
}

export function readStreamText(event: Record<string, unknown>): string {
  const payload = recordValue(event, "payload");
  const runtimeEvent = recordValue(payload, "runtimeEvent");
  return (
    readString(payload, "delta") ??
    readString(payload, "text") ??
    readString(runtimeEvent, "text") ??
    readString(runtimeEvent, "delta") ??
    readString(event, "message") ??
    ""
  );
}

export function readToolName(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const runtimeEvent = recordValue(payload, "runtimeEvent");
  const result = recordValue(runtimeEvent, "result");
  const metadata = recordValue(result, "metadata");
  const skillName = readString(metadata, "skill_name") ?? readString(metadata, "skillName");
  if (skillName) {
    return `Skill(${skillName})`;
  }
  return (
    readString(event, "toolName") ??
    readString(event, "tool_name") ??
    readString(payload, "tool_name") ??
    readString(payload, "toolName") ??
    readString(runtimeEvent, "tool_name") ??
    readString(runtimeEvent, "toolName") ??
    readString(runtimeEvent, "tool_id") ??
    undefined
  );
}

export function readToolCallId(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const runtimeEvent = recordValue(payload, "runtimeEvent");
  return (
    readString(event, "toolId") ??
    readString(event, "toolCallId") ??
    readString(payload, "tool_call_id") ??
    readString(payload, "toolCallId") ??
    readString(payload, "tool_id") ??
    readString(runtimeEvent, "tool_id") ??
    readString(runtimeEvent, "toolId") ??
    readEventId(event) ??
    undefined
  );
}

export function readActionId(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  return (
    readString(event, "requestId") ??
    readString(event, "actionId") ??
    readString(payload, "request_id") ??
    readString(payload, "requestId") ??
    readEventId(event) ??
    undefined
  );
}

export function readArtifactId(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const artifact = recordValue(payload, "artifact");
  return (
    readString(event, "artifactId") ??
    readString(artifact, "artifact_id") ??
    readString(artifact, "artifactId") ??
    readString(artifact, "item_id") ??
    readString(artifact, "itemId") ??
    undefined
  );
}

export function readArtifactRef(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const artifact = recordValue(payload, "artifact");
  return (
    readString(event, "artifactRef") ??
    readString(payload, "artifactRef") ??
    readString(artifact, "path") ??
    readString(artifact, "file_path") ??
    readString(artifact, "filePath") ??
    undefined
  );
}

export function readArtifactPreview(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const artifact = recordValue(payload, "artifact");
  return (
    readString(event, "message") ??
    readString(payload, "message") ??
    readString(payload, "title") ??
    readString(artifact, "title") ??
    readString(artifact, "name") ??
    undefined
  );
}

export function readEvidenceRef(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const directRef =
    readString(event, "evidenceRef") ??
    readString(payload, "evidenceRef") ??
    readString(payload, "evidence_id") ??
    readString(payload, "evidenceId");
  if (directRef) {
    return directRef;
  }
  const refs = [
    ...readStringArray(event, "refs"),
    ...readStringArray(payload, "refs"),
  ];
  const evidenceRef = refs.find((ref) => ref.startsWith("evidence:"));
  if (evidenceRef) {
    return evidenceRef;
  }
  const artifactRef =
    readString(payload, "artifactRef") ??
    readString(payload, "artifact_ref") ??
    readString(event, "artifactRef");
  return artifactRef ? `evidence:${artifactRef}` : undefined;
}

export function readEventId(event: Record<string, unknown>): string | undefined {
  return readString(event, "id") ?? readString(event, "eventId") ?? undefined;
}

export function payloadKeys(event: Record<string, unknown>): string[] | undefined {
  const payload = recordValue(event, "payload");
  if (!payload) {
    return undefined;
  }
  const keys = Object.keys(payload).sort();
  return keys.length ? keys : undefined;
}

export function buildMetricPreview(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const usage = recordValue(event, "usage") ?? recordValue(payload, "usage");
  const cost = recordValue(event, "cost") ?? recordValue(payload, "cost");
  const modelName =
    readString(event, "modelName") ??
    readString(payload, "modelName") ??
    readString(payload, "model");
  const totalTokens = readNumber(usage, "totalTokens") ?? readNumber(usage, "total_tokens");
  const totalCost =
    readNumber(cost, "total") ??
    readNumber(cost, "estimatedTotalCost") ??
    readNumber(cost, "estimated_total_cost");
  const parts = [
    modelName,
    typeof totalTokens === "number" ? `${totalTokens} tokens` : undefined,
    typeof totalCost === "number" ? `${totalCost}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : undefined;
}

export function normalizeStatus(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "succeeded":
    case "success":
    case "created":
    case "ready":
    case "verified":
    case "recorded":
    case "resolved":
      return "completed";
    case "error":
    case "warning":
      return "failed";
    default:
      return normalized || "updated";
  }
}

export function truncateText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= TEXT_PREVIEW_LIMIT) {
    return trimmed;
  }
  return `${trimmed.slice(0, TEXT_PREVIEW_LIMIT).trim()}...`;
}

export function definedString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function readString(
  value: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const item = value?.[key];
  return typeof item === "string" && item.trim() ? item.trim() : null;
}

export function readStringArray(
  value: Record<string, unknown> | null | undefined,
  key: string,
): string[] {
  const item = value?.[key];
  return Array.isArray(item)
    ? item.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function readNumber(
  value: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const item = value?.[key];
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}

export function recordValue(
  value: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  const item = value?.[key];
  return isRecord(item) ? item : null;
}

export function readRecordArray(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const item = value[key];
  return Array.isArray(item) ? item.filter(isRecord) : [];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
