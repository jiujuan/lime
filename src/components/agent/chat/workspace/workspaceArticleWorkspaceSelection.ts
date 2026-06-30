import type {
  WorkspaceArticleObject,
  WorkspaceArticleWorkspace,
} from "./workspaceArticleWorkspaceModel";

const ARTICLE_WORKSPACE_SELECTION_STORAGE_PREFIX =
  "lime.workspace.article_workspace.selection.v1";

interface StoredArticleWorkspaceSelection {
  objectKey: string;
  selectedAt: string;
}

export function buildWorkspaceArticleObjectKey(
  object: WorkspaceArticleObject,
): string {
  return `${object.ref.appId}:${object.ref.sessionId}:${object.ref.kind}:${object.ref.id}`;
}

export function buildWorkspaceArticleWorkspaceSelectionStorageKey(
  profile: WorkspaceArticleWorkspace,
): string {
  return [
    ARTICLE_WORKSPACE_SELECTION_STORAGE_PREFIX,
    profile.workspaceId ?? "workspace",
    profile.sessionId,
    profile.appId,
  ].join(":");
}

export function readWorkspaceArticleWorkspaceSelectedObjectKey(
  profile: WorkspaceArticleWorkspace,
  storage: Storage | null = getLocalStorage(),
): string | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(
      buildWorkspaceArticleWorkspaceSelectionStorageKey(profile),
    );
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredArticleWorkspaceSelection>;
    const objectKey =
      typeof parsed.objectKey === "string" ? parsed.objectKey.trim() : "";
    if (!objectKey) {
      return null;
    }
    return profile.objects.some(
      (object) => buildWorkspaceArticleObjectKey(object) === objectKey,
    )
      ? objectKey
      : null;
  } catch {
    return null;
  }
}

export function writeWorkspaceArticleWorkspaceSelectedObjectKey(
  profile: WorkspaceArticleWorkspace,
  objectKey: string,
  storage: Storage | null = getLocalStorage(),
): void {
  if (!storage) {
    return;
  }
  if (
    !profile.objects.some(
      (object) => buildWorkspaceArticleObjectKey(object) === objectKey,
    )
  ) {
    return;
  }
  try {
    const payload: StoredArticleWorkspaceSelection = {
      objectKey,
      selectedAt: new Date().toISOString(),
    };
    storage.setItem(
      buildWorkspaceArticleWorkspaceSelectionStorageKey(profile),
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
