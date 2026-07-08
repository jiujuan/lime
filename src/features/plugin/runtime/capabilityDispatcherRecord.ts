export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function integerValue(value: unknown): number {
  const number = numberValue(value);
  return number === undefined ? 0 : Math.max(0, Math.floor(number));
}

export function recordString(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  return record ? readString(record[key]) : undefined;
}

export function recordArray(
  record: Record<string, unknown> | null | undefined,
  key: string,
): unknown[] {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

export function recordValueByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): unknown {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }
  return undefined;
}

export function recordObjectByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): Record<string, unknown> | null {
  const value = recordValueByKeys(record, keys);
  return isRecord(value) ? value : null;
}

export function recordStringByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string | undefined {
  return readString(recordValueByKeys(record, keys));
}

export function recordNumberByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): number | undefined {
  return numberValue(recordValueByKeys(record, keys));
}

export function recordBooleanByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): boolean | undefined {
  const value = recordValueByKeys(record, keys);
  return typeof value === "boolean" ? value : undefined;
}

export function recordStringArrayByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string[] {
  const value = recordValueByKeys(record, keys);
  return Array.isArray(value)
    ? value.map(readString).filter((item): item is string => Boolean(item))
    : [];
}

export function recordArrayByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): unknown[] {
  const value = recordValueByKeys(record, keys);
  return Array.isArray(value) ? value : [];
}
