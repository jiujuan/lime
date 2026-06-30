import { useEffect, useMemo, useState } from "react";
import { getProject } from "@/lib/api/project";
import { markProjectOpened, useOpenedProjectIds } from "./agentProjectStorage";

export interface OpenedProjectSummary {
  id: string;
  name: string;
  rootPath?: string | null;
  isFavorite?: boolean;
}

function normalizeProjectId(projectId?: string | null): string {
  return projectId?.trim() ?? "";
}

function isUuidLike(value?: string | null): boolean {
  const normalized = value?.trim();
  if (!normalized) {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    normalized,
  );
}

function isDisplayableProjectSummary(
  project?: OpenedProjectSummary | null,
  options: { allowPlaceholder?: boolean } = {},
): project is OpenedProjectSummary {
  if (!project) {
    return false;
  }
  const projectId = normalizeProjectId(project.id);
  const projectName = project.name.trim();
  const projectRootPath = project.rootPath?.trim();
  if (!projectId || !projectName) {
    return false;
  }
  if (projectRootPath) {
    return true;
  }
  if (options.allowPlaceholder && projectId && projectName) {
    return true;
  }
  return !(isUuidLike(projectId) && projectName === projectId);
}

function dedupeProjectIds(projectIds: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return projectIds.map(normalizeProjectId).filter((projectId) => {
    if (!projectId || seen.has(projectId)) {
      return false;
    }
    seen.add(projectId);
    return true;
  });
}

export function shouldResolveOpenedProject(
  projectId: string,
  resolvedProjectsById: Record<string, OpenedProjectSummary | null>,
): boolean {
  return !Object.prototype.hasOwnProperty.call(
    resolvedProjectsById,
    projectId,
  );
}

export function buildOpenedProjectIdOrder(
  openedProjectIds: Array<string | null | undefined>,
  currentProjectId?: string | null,
): string[] {
  const opened = dedupeProjectIds(openedProjectIds);
  const normalizedCurrentProjectId = normalizeProjectId(currentProjectId);
  if (!normalizedCurrentProjectId) {
    return opened;
  }
  return opened.includes(normalizedCurrentProjectId)
    ? opened
    : [...opened, normalizedCurrentProjectId];
}

export function compactOpenedProjectSummaries(
  projectIds: string[],
  resolvedProjectsById: Record<string, OpenedProjectSummary | null>,
  currentProjectSummary?: OpenedProjectSummary | null,
): OpenedProjectSummary[] {
  return projectIds.flatMap((projectId) => {
    if (projectId === normalizeProjectId(currentProjectSummary?.id)) {
      return isDisplayableProjectSummary(currentProjectSummary, {
        allowPlaceholder: true,
      })
        ? [currentProjectSummary]
        : [];
    }
    const resolved = resolvedProjectsById[projectId];
    return isDisplayableProjectSummary(resolved) ? [resolved] : [];
  });
}

export function useOpenedProjectSummaries(
  currentProject?: OpenedProjectSummary | null,
  options: { enabled?: boolean } = {},
): OpenedProjectSummary[] {
  const enabled = options.enabled ?? true;
  const openedProjectIds = useOpenedProjectIds();
  const normalizedCurrentProjectId = normalizeProjectId(currentProject?.id);
  const [resolvedProjectsById, setResolvedProjectsById] = useState<
    Record<string, OpenedProjectSummary | null>
  >({});

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!normalizedCurrentProjectId) {
      return;
    }
    markProjectOpened(normalizedCurrentProjectId);
  }, [enabled, normalizedCurrentProjectId]);

  const projectIds = useMemo(
    () =>
      enabled
        ? buildOpenedProjectIdOrder(openedProjectIds, normalizedCurrentProjectId)
        : normalizedCurrentProjectId
          ? [normalizedCurrentProjectId]
          : [],
    [enabled, normalizedCurrentProjectId, openedProjectIds],
  );

  const currentProjectSummary = useMemo<OpenedProjectSummary | null>(() => {
    if (!normalizedCurrentProjectId) {
      return null;
    }
    return {
      id: normalizedCurrentProjectId,
      name:
        currentProject?.name?.trim() ||
        resolvedProjectsById[normalizedCurrentProjectId]?.name ||
        "",
      rootPath:
        currentProject?.rootPath ??
        resolvedProjectsById[normalizedCurrentProjectId]?.rootPath ??
        null,
      isFavorite:
        currentProject?.isFavorite ??
        resolvedProjectsById[normalizedCurrentProjectId]?.isFavorite ??
        false,
    };
  }, [currentProject, normalizedCurrentProjectId, resolvedProjectsById]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const idsToResolve = projectIds.filter((projectId) => {
      if (projectId === normalizedCurrentProjectId && currentProject?.name) {
        return false;
      }
      return shouldResolveOpenedProject(projectId, resolvedProjectsById);
    });
    if (idsToResolve.length === 0) {
      return;
    }

    let cancelled = false;
    void Promise.all(
      idsToResolve.map(async (projectId) => {
        try {
          const project = await getProject(projectId);
          const projectSummary = project
            ? {
                id: project.id,
                name: project.name,
                rootPath: project.rootPath,
                isFavorite: project.isFavorite,
              }
            : null;
          return isDisplayableProjectSummary(projectSummary)
            ? projectSummary
            : null;
        } catch {
          return null;
        }
      }),
    ).then((projects) => {
      if (cancelled) {
        return;
      }
      setResolvedProjectsById((current) => {
        const next = { ...current };
        projects.forEach((project, index) => {
          next[idsToResolve[index]] = project;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    currentProject?.name,
    enabled,
    normalizedCurrentProjectId,
    projectIds,
    resolvedProjectsById,
  ]);

  return compactOpenedProjectSummaries(
    projectIds,
    resolvedProjectsById,
    currentProjectSummary,
  );
}
