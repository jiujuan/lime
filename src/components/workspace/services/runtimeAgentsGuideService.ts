import { toast } from "sonner";
import type { Project } from "@/lib/api/project";

const RUNTIME_AGENTS_GUIDE_STORAGE_KEY =
  "lime.runtime_agents_workspace_guide_seen.v1";

type RuntimeAgentsGuideProject = Pick<Project, "id" | "rootPath"> &
  Partial<Pick<Project, "name">>;

interface NotifyRuntimeAgentsGuideOptions {
  successMessage: string;
  showSuccessWhenGuideAlreadySeen?: boolean;
}

function buildGuideStorageKey(project: RuntimeAgentsGuideProject): string {
  const projectId = project.id.trim();
  if (projectId) {
    return projectId;
  }
  return project.rootPath.trim();
}

function loadGuideSeenKeys(): Set<string> {
  if (typeof window === "undefined" || !window.localStorage) {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(RUNTIME_AGENTS_GUIDE_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(
      parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );
  } catch {
    return new Set();
  }
}

function saveGuideSeenKeys(keys: Set<string>) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(
    RUNTIME_AGENTS_GUIDE_STORAGE_KEY,
    JSON.stringify(Array.from(keys)),
  );
}

function markGuideAsShown(project: RuntimeAgentsGuideProject): boolean {
  const key = buildGuideStorageKey(project);
  if (!key) {
    return false;
  }

  const keys = loadGuideSeenKeys();
  if (keys.has(key)) {
    return false;
  }

  keys.add(key);
  saveGuideSeenKeys(keys);
  return true;
}

export function notifyProjectRuntimeAgentsGuide(
  project: RuntimeAgentsGuideProject,
  options: NotifyRuntimeAgentsGuideOptions,
) {
  const { successMessage, showSuccessWhenGuideAlreadySeen = true } = options;
  const rootPath = project.rootPath.trim();
  if (!rootPath || !markGuideAsShown(project)) {
    if (showSuccessWhenGuideAlreadySeen) {
      toast.success(successMessage);
    }
    return;
  }

  toast.success(successMessage);
}

export function notifyProjectCreatedWithRuntimeAgentsGuide(
  project: RuntimeAgentsGuideProject,
  successMessage: string,
) {
  notifyProjectRuntimeAgentsGuide(project, {
    successMessage,
    showSuccessWhenGuideAlreadySeen: true,
  });
}
