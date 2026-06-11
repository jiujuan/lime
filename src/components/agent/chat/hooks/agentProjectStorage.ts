import { useCallback, useEffect, useState } from "react";
import { normalizeProjectId } from "../utils/topicProjectResolution";

export const LAST_PROJECT_ID_KEY = "agent_last_project_id";
export const SESSION_WORKSPACE_STORAGE_KEY_PREFIX = "agent_session_workspace_";
export const OPENED_PROJECT_IDS_KEY = "agent_opened_project_ids";
export const PERSISTED_PROJECT_ID_CHANGED_EVENT =
  "agent-persisted-project-id-changed";
export const OPENED_PROJECT_IDS_CHANGED_EVENT =
  "agent-opened-project-ids-changed";

export function getSessionWorkspaceStorageKey(
  sessionId: string,
): string | null {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return null;
  }

  return `${SESSION_WORKSPACE_STORAGE_KEY_PREFIX}${normalizedSessionId}`;
}

export function loadPersistedProjectId(key: string): string | null {
  try {
    return normalizeProjectId(loadStoredProjectIdRaw(key));
  } catch {
    return null;
  }
}

export function loadStoredProjectIdRaw(key: string): string | null {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) {
      return null;
    }

    try {
      const parsed = JSON.parse(stored);
      const normalized =
        typeof parsed === "string" ? parsed.trim() : String(stored).trim();
      return normalized || null;
    } catch {
      const normalized = stored.trim();
      return normalized || null;
    }
  } catch {
    return null;
  }
}

export function savePersistedProjectId(key: string, projectId: string): void {
  const normalized = normalizeProjectId(projectId);
  if (!normalized) {
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify(normalized));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(PERSISTED_PROJECT_ID_CHANGED_EVENT, {
          detail: {
            key,
            projectId: normalized,
          },
        }),
      );
    }
  } catch {
    // ignore write errors
  }
}

export function clearPersistedProjectId(key: string): void {
  try {
    localStorage.removeItem(key);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(PERSISTED_PROJECT_ID_CHANGED_EVENT, {
          detail: {
            key,
            projectId: null,
          },
        }),
      );
    }
  } catch {
    // ignore write errors
  }
}

export function loadOpenedProjectIds(): string[] {
  try {
    const stored = localStorage.getItem(OPENED_PROJECT_IDS_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const seen = new Set<string>();
    return parsed
      .map((value) =>
        typeof value === "string" ? normalizeProjectId(value) : null,
      )
      .filter((value): value is string => {
        if (!value || seen.has(value)) {
          return false;
        }
        seen.add(value);
        return true;
      });
  } catch {
    return [];
  }
}

export function saveOpenedProjectIds(projectIds: string[]): void {
  const seen = new Set<string>();
  const normalizedProjectIds = projectIds
    .map((projectId) => normalizeProjectId(projectId))
    .filter((projectId): projectId is string => {
      if (!projectId || seen.has(projectId)) {
        return false;
      }
      seen.add(projectId);
      return true;
    });

  try {
    localStorage.setItem(
      OPENED_PROJECT_IDS_KEY,
      JSON.stringify(normalizedProjectIds),
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(OPENED_PROJECT_IDS_CHANGED_EVENT, {
          detail: {
            projectIds: normalizedProjectIds,
          },
        }),
      );
    }
  } catch {
    // ignore write errors
  }
}

export function markProjectOpened(projectId?: string | null): string[] {
  const normalized = normalizeProjectId(projectId);
  if (!normalized) {
    return loadOpenedProjectIds();
  }

  const currentProjectIds = loadOpenedProjectIds();
  const nextProjectIds = currentProjectIds.includes(normalized)
    ? currentProjectIds
    : [...currentProjectIds, normalized];
  saveOpenedProjectIds(nextProjectIds);
  return nextProjectIds;
}

export function closeProjectOpened(projectId?: string | null): string[] {
  const normalized = normalizeProjectId(projectId);
  if (!normalized) {
    return loadOpenedProjectIds();
  }

  const nextProjectIds = loadOpenedProjectIds().filter(
    (candidate) => candidate !== normalized,
  );
  saveOpenedProjectIds(nextProjectIds);
  return nextProjectIds;
}

export function useOpenedProjectIds() {
  const [projectIds, setProjectIds] = useState<string[]>(() =>
    loadOpenedProjectIds(),
  );

  useEffect(() => {
    const refreshProjectIds = () => {
      setProjectIds(loadOpenedProjectIds());
    };

    window.addEventListener(
      OPENED_PROJECT_IDS_CHANGED_EVENT,
      refreshProjectIds,
    );
    window.addEventListener("storage", refreshProjectIds);
    return () => {
      window.removeEventListener(
        OPENED_PROJECT_IDS_CHANGED_EVENT,
        refreshProjectIds,
      );
      window.removeEventListener("storage", refreshProjectIds);
    };
  }, []);

  return projectIds;
}

export function loadPersistedSessionWorkspaceId(
  sessionId: string,
): string | null {
  const key = getSessionWorkspaceStorageKey(sessionId);
  if (!key) {
    return null;
  }

  return loadPersistedProjectId(key);
}

export function loadStoredSessionWorkspaceIdRaw(
  sessionId: string,
): string | null {
  const key = getSessionWorkspaceStorageKey(sessionId);
  if (!key) {
    return null;
  }

  return loadStoredProjectIdRaw(key);
}

export function savePersistedSessionWorkspaceId(
  sessionId: string,
  projectId: string,
): void {
  const key = getSessionWorkspaceStorageKey(sessionId);
  if (!key) {
    return;
  }

  savePersistedProjectId(key, projectId);
}

export function usePersistedProjectId(
  externalProjectId?: string | null,
  storageKey = LAST_PROJECT_ID_KEY,
) {
  const resolveProjectId = useCallback(
    () =>
      normalizeProjectId(externalProjectId) ??
      loadPersistedProjectId(storageKey),
    [externalProjectId, storageKey],
  );
  const [projectId, setProjectIdState] = useState<string | null>(() =>
    resolveProjectId(),
  );

  useEffect(() => {
    setProjectIdState(resolveProjectId());
  }, [resolveProjectId]);

  const setProjectId = useCallback((nextProjectId?: string | null) => {
    setProjectIdState(normalizeProjectId(nextProjectId));
  }, []);

  const rememberProjectId = useCallback(
    (nextProjectId?: string | null) => {
      const normalized = normalizeProjectId(nextProjectId);
      if (!normalized) {
        clearPersistedProjectId(storageKey);
        return;
      }
      savePersistedProjectId(storageKey, normalized);
    },
    [storageKey],
  );

  return {
    projectId,
    setProjectId,
    rememberProjectId,
  };
}
