import { useEffect, useState } from "react";
import { getOrCreateDefaultProject } from "@/lib/api/project";
import type { SkillsWorkspaceView } from "./SkillsWorkspacePageViewModel";
import type { SkillsWorkspaceDefaultProjectState } from "./SkillsWorkspacePageTypes";

export function useSkillsWorkspaceDefaultProject({
  activeView,
  localSkillsLoading,
}: {
  activeView: SkillsWorkspaceView;
  localSkillsLoading: boolean;
}) {
  const [registeredSkillsPanelReady, setRegisteredSkillsPanelReady] =
    useState(false);
  const [defaultProjectState, setDefaultProjectState] =
    useState<SkillsWorkspaceDefaultProjectState>({
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

    const loadDefaultProject = async () => {
      if (activeView !== "installed" || !registeredSkillsPanelReady) {
        setDefaultProjectState({
          id: null,
          rootPath: null,
          pending: false,
          error: null,
        });
        return;
      }

      setDefaultProjectState((previous) => ({
        ...previous,
        pending: true,
        error: null,
      }));
      try {
        const project = await getOrCreateDefaultProject();
        if (cancelled) {
          return;
        }
        setDefaultProjectState({
          id: project.id,
          rootPath: project.rootPath,
          pending: false,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setDefaultProjectState({
          id: null,
          rootPath: null,
          pending: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void loadDefaultProject();

    return () => {
      cancelled = true;
    };
  }, [activeView, registeredSkillsPanelReady]);

  return { defaultProjectState };
}
