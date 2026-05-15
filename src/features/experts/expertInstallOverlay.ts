import type { ExpertInstallOverlayRecord, ExpertProfile } from "./types";

const EXPERT_INSTALL_OVERLAY_STORAGE_KEY = "lime:expert-install-overlay:v1";

function cloneOverlay(
  records: ExpertInstallOverlayRecord[],
): ExpertInstallOverlayRecord[] {
  return records.map((record) => ({ ...record }));
}

function isOverlayRecord(value: unknown): value is ExpertInstallOverlayRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<ExpertInstallOverlayRecord>;
  return (
    typeof record.expertId === "string" &&
    typeof record.releaseId === "string" &&
    typeof record.installedAt === "number" &&
    (record.lastUsedAt === null || typeof record.lastUsedAt === "number") &&
    (record.pinned === undefined || typeof record.pinned === "boolean") &&
    (record.hidden === undefined || typeof record.hidden === "boolean") &&
    (record.memoryEnabled === undefined ||
      typeof record.memoryEnabled === "boolean") &&
    (record.workflowEnabled === undefined ||
      typeof record.workflowEnabled === "boolean")
  );
}

export function readExpertInstallOverlay(): ExpertInstallOverlayRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(EXPERT_INSTALL_OVERLAY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return cloneOverlay(parsed.filter(isOverlayRecord));
  } catch {
    return [];
  }
}

export function saveExpertInstallOverlay(
  records: ExpertInstallOverlayRecord[],
): ExpertInstallOverlayRecord[] {
  const cloned = cloneOverlay(records);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      EXPERT_INSTALL_OVERLAY_STORAGE_KEY,
      JSON.stringify(cloned),
    );
  }
  return cloned;
}

export function upsertInstalledExpert(
  records: ExpertInstallOverlayRecord[],
  expert: ExpertProfile,
  now: number = Date.now(),
): ExpertInstallOverlayRecord[] {
  const existing = records.find((record) => record.expertId === expert.id);
  const next = records.filter((record) => record.expertId !== expert.id);
  next.push({
    expertId: expert.id,
    releaseId: expert.release.releaseId,
    installedAt: existing?.installedAt ?? now,
    lastUsedAt: existing?.lastUsedAt ?? now,
    pinned: existing?.pinned ?? false,
    hidden: existing?.hidden ?? false,
    memoryEnabled: existing?.memoryEnabled ?? true,
    workflowEnabled: existing?.workflowEnabled ?? true,
  });
  return saveExpertInstallOverlay(next);
}

export function recordExpertLaunch(
  records: ExpertInstallOverlayRecord[],
  expert: ExpertProfile,
  now: number = Date.now(),
): ExpertInstallOverlayRecord[] {
  const existing = records.find((record) => record.expertId === expert.id);
  const next = records.filter((record) => record.expertId !== expert.id);
  next.push({
    expertId: expert.id,
    releaseId: expert.release.releaseId,
    installedAt: existing?.installedAt ?? now,
    lastUsedAt: now,
    pinned: existing?.pinned ?? false,
    hidden: existing?.hidden ?? false,
    memoryEnabled: existing?.memoryEnabled ?? true,
    workflowEnabled: existing?.workflowEnabled ?? true,
  });
  return saveExpertInstallOverlay(next);
}
