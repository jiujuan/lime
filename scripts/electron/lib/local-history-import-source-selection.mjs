export const DEFAULT_REAL_SAMPLE_STABILITY_MS = 10 * 60 * 1_000;

export function selectStableImportSourceThreads(
  threads,
  indexedAt,
  stabilityMs = DEFAULT_REAL_SAMPLE_STABILITY_MS,
) {
  const indexedAtMs = Date.parse(String(indexedAt || ""));
  if (!Number.isFinite(indexedAtMs)) {
    return [];
  }
  return (Array.isArray(threads) ? threads : []).filter((thread) => {
    const updatedAtMs = Date.parse(String(thread?.updatedAt || ""));
    return (
      Number.isFinite(updatedAtMs) && indexedAtMs - updatedAtMs >= stabilityMs
    );
  });
}

export function importSourceAgeMs(thread, indexedAt) {
  const indexedAtMs = Date.parse(String(indexedAt || ""));
  const updatedAtMs = Date.parse(String(thread?.updatedAt || ""));
  return Number.isFinite(indexedAtMs) && Number.isFinite(updatedAtMs)
    ? Math.max(indexedAtMs - updatedAtMs, 0)
    : null;
}
