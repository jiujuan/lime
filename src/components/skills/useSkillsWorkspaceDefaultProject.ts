import { useEffect, useState } from "react";
import { getProject } from "@/lib/api/project";
import type { SkillsWorkspaceView } from "./SkillsWorkspacePageViewModel";
import type { SkillsWorkspaceProjectState } from "./SkillsWorkspacePageTypes";

export function useSkillsWorkspaceProject({
  activeView,
  creationProjectId,
  localSkillsLoading,
}: {
  activeView: SkillsWorkspaceView;
  creationProjectId?: string | null;
  localSkillsLoading: boolean;
}) {
  const [registeredSkillsPanelReady, setRegisteredSkillsPanelReady] =
    useState(false);
  const [currentProjectState, setCurrentProjectState] =
    useState<SkillsWorkspaceProjectState>({
      id: null,
      rootPath: null,
      pending: false,
      error: null,
    });

  useEffect(() => {
    if (activeView !== "installed" || localSkillsLoading) {
      setRegisteredSkillsPanelReady(false);
      return;
    }

    setRegisteredSkillsPanelReady(false);
    const timer = window.setTimeout(() => {
      setRegisteredSkillsPanelReady(true);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [activeView, localSkillsLoading]);

  useEffect(() => {
    let cancelled = false;
    const normalizedProjectId = creationProjectId?.trim() || null;

    const loadCurrentProject = async () => {
      if (
        activeView !== "installed" ||
        !registeredSkillsPanelReady ||
        !normalizedProjectId
      ) {
        setCurrentProjectState({
          id: null,
          rootPath: null,
          pending: false,
          error: null,
        });
        return;
      }

      setCurrentProjectState((previous) => ({
        ...previous,
        pending: true,
        error: null,
      }));
      try {
        const project = await getProject(normalizedProjectId);
        if (cancelled) {
          return;
        }
        if (!project) {
          setCurrentProjectState({
            id: normalizedProjectId,
            rootPath: null,
            pending: false,
            error: "未找到当前项目",
          });
          return;
        }
        setCurrentProjectState({
          id: project.id,
          rootPath: project.rootPath,
          pending: false,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setCurrentProjectState({
          id: null,
          rootPath: null,
          pending: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void loadCurrentProject();

    return () => {
      cancelled = true;
    };
  }, [activeView, creationProjectId, registeredSkillsPanelReady]);

  return { currentProjectState };
}
