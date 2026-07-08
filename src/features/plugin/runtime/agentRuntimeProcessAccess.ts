export function readRuntimeEvent(event: unknown): Record<string, unknown> {
  if (!isRecord(event)) {
    return {};
  }
  if (isRecord(event.runtimeEvent)) {
    return event.runtimeEvent;
  }
  const payload = recordValue(event, "payload");
  if (isRecord(payload?.runtimeEvent)) {
    return payload.runtimeEvent;
  }
  if (isRecord(payload?.profileEvent)) {
    return payload.profileEvent;
  }
  return {};
}

export function readRuntimeEventType(
  event: unknown,
  runtimeEvent: Record<string, unknown> = readRuntimeEvent(event),
): string {
  return String(
    readString(runtimeEvent, "type") ||
      readString(runtimeEvent, "event_type") ||
      readString(runtimeEvent, "eventType") ||
      (isRecord(event)
        ? readString(event, "eventType") || readString(event, "type")
        : "") ||
      "",
  ).toLowerCase();
}

export function findFirstObjectByKeys(
  value: unknown,
  keys: string[],
  depth = 6,
): Record<string, unknown> | null {
  const found = findFirstValueByKeys(value, keys, depth);
  return isRecord(found) ? found : null;
}

export function findFirstValueByKeys(
  value: unknown,
  keys: string[],
  depth = 6,
): unknown {
  if (depth < 0) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstValueByKeys(item, keys, depth - 1);
      if (found !== undefined && found !== null && found !== "") {
        return found;
      }
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  for (const key of keys) {
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return candidate;
    }
  }
  for (const child of Object.values(value)) {
    const found = findFirstValueByKeys(child, keys, depth - 1);
    if (found !== undefined && found !== null && found !== "") {
      return found;
    }
  }
  return undefined;
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const parsed = parseJsonValue(text);
  return isRecord(parsed) ? parsed : null;
}

export function parseJsonValue(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function readRecordArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }
  const item = value[key];
  return Array.isArray(item) ? item : [];
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function optionalNumberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function numberValue(value: unknown): number {
  return optionalNumberValue(value) ?? 0;
}

export function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function readString(value: unknown, key: string): string {
  if (!isRecord(value)) {
    return "";
  }
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : "";
}

export function readUnknown(value: unknown, key: string): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  return value[key];
}

export function recordValue(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return isRecord(value[key]) ? value[key] : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
