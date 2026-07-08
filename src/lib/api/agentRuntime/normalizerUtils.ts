export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readStringField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): string {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return typeof value === "string" ? value : "";
}

export function readOptionalStringField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): string | undefined {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return typeof value === "string" && value ? value : undefined;
}

export function readNumberField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): number {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return typeof value === "number" ? value : 0;
}

export function readOptionalNumberField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): number | undefined {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return typeof value === "number" ? value : undefined;
}

export function readOptionalBooleanField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): boolean | undefined {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return typeof value === "boolean" ? value : undefined;
}

export function readStringListField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): string[] {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function readRecordField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): Record<string, unknown> | undefined {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return isRecord(value) ? value : undefined;
}

export function readNumberMapField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): Record<string, number> {
  const value = readRecordField(record, camelKey, snakeKey);
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

export function readArrayField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): unknown[] {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return Array.isArray(value) ? value : [];
}
