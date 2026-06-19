function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function readImportedSourceClient(metadata: unknown): string | null {
  const record = asRecord(metadata);
  if (!record) {
    return null;
  }

  const value =
    typeof record.source_client === "string"
      ? record.source_client
      : typeof record.sourceClient === "string"
        ? record.sourceClient
        : "";
  const normalized = value.trim();
  return normalized || null;
}

export function isImportedSourceMetadata(metadata: unknown): boolean {
  const record = asRecord(metadata);
  if (!record) {
    return false;
  }

  return (
    record.imported === true ||
    record.imported_synthetic === true ||
    record.importedSynthetic === true ||
    Boolean(readImportedSourceClient(record))
  );
}
