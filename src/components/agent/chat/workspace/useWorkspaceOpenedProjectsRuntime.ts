import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Project } from "@/lib/api/project";
import type { ProjectMemory } from "@/lib/api/projectMemory";
import { closeProjectOpened } from "../hooks/agentProjectStorage";
import {
  useOpenedProjectSummaries,
  type OpenedProjectSummary,
} from "../hooks/useOpenedProjectSummaries";
import { normalizeProjectId } from "../utils/topicProjectResolution";

interface ResolveFallbackOpenedProjectIdParams {
  openedProjects: readonly OpenedProjectSummary[];
  remainingStoredProjectIds: readonly string[];
  closingProjectId: string;
}

interface UseWorkspaceOpenedProjectsRuntimeParams {
  project: Project | null;
  projectId?: string | null;
  applyProjectSelection: (projectId?: string | null) => void;
  setProject: Dispatch<SetStateAction<Project | null>>;
  setProjectMemory: Dispatch<SetStateAction<ProjectMemory | null>>;
}

export function resolveFallbackOpenedProjectId({
  openedProjects,
  remainingStoredProjectIds,
  closingProjectId,
}: ResolveFallbackOpenedProjectIdParams): string | null {
  const normalizedClosingProjectId = normalizeProjectId(closingProjectId);

  return (
    openedProjects
      .map((openedProject) => normalizeProjectId(openedProject.id))
      .find(
        (openedProjectId) =>
          openedProjectId && openedProjectId !== normalizedClosingProjectId,
      ) ??
    remainingStoredProjectIds
      .map((openedProjectId) => normalizeProjectId(openedProjectId))
      .find(
        (openedProjectId) =>
          openedProjectId && openedProjectId !== normalizedClosingProjectId,
      ) ??
    null
  );
}

export function useWorkspaceOpenedProjectsRuntime({
  project,
  projectId,
  applyProjectSelection,
  setProject,
  setProjectMemory,
}: UseWorkspaceOpenedProjectsRuntimeParams) {
  const currentOpenedProjectSummary =
    normalizeProjectId(project?.id) === normalizeProjectId(projectId)
      ? project
      : null;
  const openedProjects = useOpenedProjectSummaries(currentOpenedProjectSummary);

  const handleCloseOpenedProject = useCallback(
    (closingProjectId: string) => {
      const normalizedClosingProjectId = normalizeProjectId(closingProjectId);
      if (!normalizedClosingProjectId) {
        return;
      }

      const remainingStoredProjectIds = closeProjectOpened(
        normalizedClosingProjectId,
      );
      if (normalizeProjectId(projectId) !== normalizedClosingProjectId) {
        return;
      }

      const fallbackProjectId = resolveFallbackOpenedProjectId({
        openedProjects,
        remainingStoredProjectIds,
        closingProjectId: normalizedClosingProjectId,
      });

      if (fallbackProjectId) {
        setProject(null);
        setProjectMemory(null);
        applyProjectSelection(fallbackProjectId);
        return;
      }

      applyProjectSelection(null);
      setProject(null);
      setProjectMemory(null);
    },
    [
      applyProjectSelection,
      openedProjects,
      projectId,
      setProject,
      setProjectMemory,
    ],
  );

  return {
    openedProjects,
    handleCloseOpenedProject,
  };
}
