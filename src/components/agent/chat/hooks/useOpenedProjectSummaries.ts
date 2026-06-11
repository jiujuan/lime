import { useEffect, useMemo, useState } from "react";
import { getProject } from "@/lib/api/project";
import {
  markProjectOpened,
  useOpenedProjectIds,
} from "./agentProjectStorage";

export interface OpenedProjectSummary {
  id: string;
  name: string;
  rootPath?: string | null;
}

function normalizeProjectId(projectId?: string | null): string {
  return projectId?.trim() ?? "";
}

function resolveProjectNameFromId(projectId: string): string {
  return (
    projectId
      .split(/[\\/]/)
      .filter(Boolean)
      .pop()
      ?.trim() || projectId
  );
}

function dedupeProjectIds(projectIds: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return projectIds
    .map(normalizeProjectId)
    .filter((projectId) => {
      if (!projectId || seen.has(projectId)) {
        return false;
      }
      seen.add(projectId);
      return true;
    });
}

export function useOpenedProjectSummaries(
  currentProject?: OpenedProjectSummary | null,
): OpenedProjectSummary[] {
  const openedProjectIds = useOpenedProjectIds();
  const normalizedCurrentProjectId = normalizeProjectId(currentProject?.id);
  const [resolvedProjectsById, setResolvedProjectsById] = useState<
    Record<string, OpenedProjectSummary>
  >({});

  useEffect(() => {
    if (!normalizedCurrentProjectId) {
      return;
    }
    markProjectOpened(normalizedCurrentProjectId);
  }, [normalizedCurrentProjectId]);

  const projectIds = useMemo(
    () => dedupeProjectIds([normalizedCurrentProjectId, ...openedProjectIds]),
    [normalizedCurrentProjectId, openedProjectIds],
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
        resolveProjectNameFromId(normalizedCurrentProjectId),
      rootPath:
        currentProject?.rootPath ??
        resolvedProjectsById[normalizedCurrentProjectId]?.rootPath ??
        null,
    };
  }, [currentProject, normalizedCurrentProjectId, resolvedProjectsById]);

  useEffect(() => {
    const idsToResolve = projectIds.filter((projectId) => {
      if (projectId === normalizedCurrentProjectId && currentProject?.name) {
        return false;
      }
      return !resolvedProjectsById[projectId];
    });
    if (idsToResolve.length === 0) {
      return;
    }

    let cancelled = false;
    void Promise.all(
      idsToResolve.map(async (projectId) => {
        try {
          const project = await getProject(projectId);
          return project
            ? {
                id: project.id,
                name: project.name,
                rootPath: project.rootPath,
              }
            : {
                id: projectId,
                name: resolveProjectNameFromId(projectId),
                rootPath: null,
              };
        } catch {
          return {
            id: projectId,
            name: resolveProjectNameFromId(projectId),
            rootPath: null,
          };
        }
      }),
    ).then((projects) => {
      if (cancelled) {
        return;
      }
      setResolvedProjectsById((current) => {
        const next = { ...current };
        projects.forEach((project) => {
          next[project.id] = project;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    currentProject?.name,
    normalizedCurrentProjectId,
    projectIds,
    resolvedProjectsById,
  ]);

  return projectIds.map((projectId) => {
    if (projectId === normalizedCurrentProjectId && currentProjectSummary) {
      return currentProjectSummary;
    }
    return (
      resolvedProjectsById[projectId] ?? {
        id: projectId,
        name: resolveProjectNameFromId(projectId),
        rootPath: null,
      }
    );
  });
}
