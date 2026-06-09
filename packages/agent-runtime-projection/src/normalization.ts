const DEFAULT_TEXT_PREVIEW_LIMIT = 240;

export function definedString(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function truncateText(
  value: string | null | undefined,
  limit = DEFAULT_TEXT_PREVIEW_LIMIT,
): string | undefined {
  const trimmed = definedString(value);
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit).trim()}...`;
}

export function truncateStringList(
  values: string[] | undefined,
  limit = DEFAULT_TEXT_PREVIEW_LIMIT,
): string[] | undefined {
  const normalized = Array.from(
    new Set(
      (values ?? [])
        .map((value) => truncateText(value, limit))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  return normalized.length > 0 ? normalized : undefined;
}

export function metadataKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>).sort();
}

export function readStringArray(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readStringField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const normalized = definedString(value);
      if (normalized) {
        return normalized;
      }
    }
  }
  return undefined;
}

export function readStringArrayField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string[] {
  if (!record) {
    return [];
  }
  for (const key of keys) {
    const values = readStringArray(record[key]);
    if (values.length > 0) {
      return values;
    }
  }
  return [];
}

export function readBooleanField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): boolean | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

export function readNumberField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

export function normalizeProjectionIdList(
  values: Array<string | null | undefined> | undefined,
): string[] {
  return Array.from(
    new Set((values ?? []).map((value) => value?.trim() ?? "").filter(Boolean)),
  );
}

export function compactProjectionFields<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
