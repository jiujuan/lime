import type {
  WorkspaceProductObject,
  WorkspaceProductProfile,
} from "./workspaceProductProfileModel";

const PRODUCT_PROFILE_SELECTION_STORAGE_PREFIX =
  "lime.workspace.product_profile.selection.v1";

interface StoredProductProfileSelection {
  objectKey: string;
  selectedAt: string;
}

export function buildWorkspaceProductObjectKey(
  object: WorkspaceProductObject,
): string {
  return `${object.ref.appId}:${object.ref.sessionId}:${object.ref.kind}:${object.ref.id}`;
}

export function buildWorkspaceProductProfileSelectionStorageKey(
  profile: WorkspaceProductProfile,
): string {
  return [
    PRODUCT_PROFILE_SELECTION_STORAGE_PREFIX,
    profile.workspaceId ?? "workspace",
    profile.sessionId,
    profile.appId,
  ].join(":");
}

export function readWorkspaceProductProfileSelectedObjectKey(
  profile: WorkspaceProductProfile,
  storage: Storage | null = getLocalStorage(),
): string | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(
      buildWorkspaceProductProfileSelectionStorageKey(profile),
    );
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredProductProfileSelection>;
    const objectKey =
      typeof parsed.objectKey === "string" ? parsed.objectKey.trim() : "";
    if (!objectKey) {
      return null;
    }
    return profile.objects.some(
      (object) => buildWorkspaceProductObjectKey(object) === objectKey,
    )
      ? objectKey
      : null;
  } catch {
    return null;
  }
}

export function writeWorkspaceProductProfileSelectedObjectKey(
  profile: WorkspaceProductProfile,
  objectKey: string,
  storage: Storage | null = getLocalStorage(),
): void {
  if (!storage) {
    return;
  }
  if (
    !profile.objects.some(
      (object) => buildWorkspaceProductObjectKey(object) === objectKey,
    )
  ) {
    return;
  }
  try {
    const payload: StoredProductProfileSelection = {
      objectKey,
      selectedAt: new Date().toISOString(),
    };
    storage.setItem(
      buildWorkspaceProductProfileSelectionStorageKey(profile),
      JSON.stringify(payload),
    );
  } catch {
    // 浏览器隐私模式或测试环境可能禁用 localStorage；选择状态可退化为本次挂载内状态。
  }
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage ?? null;
}
