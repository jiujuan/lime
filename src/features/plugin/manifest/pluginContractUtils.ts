import { PluginManifestError } from "./pluginContractErrors";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function requireString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = readString(record[key]);
  if (!value) {
    throw new PluginManifestError(
      `Plugin manifest missing string field: ${key}`,
    );
  }
  return value;
}

export function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(value.map(readString));
}

export function readRecords(
  value: unknown,
  field: string,
): Record<string, unknown>[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new PluginManifestError(
      `Plugin manifest field must be an array: ${field}`,
    );
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new PluginManifestError(
        `Plugin manifest ${field}[${index}] must be an object`,
      );
    }
    return item;
  });
}

export function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
