import {
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import type { ExpertInfoPanel } from "../experts/ExpertInfoPanel";
import { resolveExpertInfoPanelCollapsedAfterLayoutChange } from "./right-surface";

type ExpertInfoPanelProps = ComponentProps<typeof ExpertInfoPanel>;

interface UseWorkspaceRightSurfaceExpertPanelRuntimeParams {
  canOpenSkillsManage: boolean;
  combinedSkillsLoading: boolean;
  effectiveThreadItems: ExpertInfoPanelProps["threadItems"];
  expertInfoPanelCollapsed: boolean;
  expertPanelRequestMetadata: ExpertInfoPanelProps["requestMetadata"];
  expertPanelRuntimeKey: string | null;
  expertSkillRefsOverride: string[] | null;
  expertWorkspaceSkillRuntimeEnableBindings: NonNullable<
    ExpertInfoPanelProps["workspaceSkillBindings"]
  >;
  expertWorkspaceSkillRuntimeEnableRefs: string[];
  handleEnableExpertWorkspaceSkillRuntime: NonNullable<
    ExpertInfoPanelProps["onEnableWorkspaceSkillRuntime"]
  >;
  handleExpertSkillRefsChange: NonNullable<
    ExpertInfoPanelProps["onSkillRefsChange"]
  >;
  handleOpenSkillsManageFromExpertPanel: NonNullable<
    ExpertInfoPanelProps["onOpenSkillsManage"]
  >;
  handleThreadExpertProfileSwitch: NonNullable<
    ExpertInfoPanelProps["onExpertProfileSwitch"]
  >;
  localSkills: ExpertInfoPanelProps["localSkills"];
  sceneLayoutMode: LayoutMode;
  serviceSkills: ExpertInfoPanelProps["serviceSkills"];
  setExpertInfoPanelCollapsed: Dispatch<SetStateAction<boolean>>;
  workspaceSkillBindings: ExpertInfoPanelProps["workspaceSkillBindings"];
}

export function useWorkspaceRightSurfaceExpertPanelRuntime({
  canOpenSkillsManage,
  combinedSkillsLoading,
  effectiveThreadItems,
  expertInfoPanelCollapsed,
  expertPanelRequestMetadata,
  expertPanelRuntimeKey,
  expertSkillRefsOverride,
  expertWorkspaceSkillRuntimeEnableBindings,
  expertWorkspaceSkillRuntimeEnableRefs,
  handleEnableExpertWorkspaceSkillRuntime,
  handleExpertSkillRefsChange,
  handleOpenSkillsManageFromExpertPanel,
  handleThreadExpertProfileSwitch,
  localSkills,
  sceneLayoutMode,
  serviceSkills,
  setExpertInfoPanelCollapsed,
  workspaceSkillBindings,
}: UseWorkspaceRightSurfaceExpertPanelRuntimeParams) {
  const hasExpertInfoPanel = Boolean(expertPanelRuntimeKey);
  const previousExpertInfoPanelLayoutModeRef =
    useRef<LayoutMode>(sceneLayoutMode);

  useEffect(() => {
    const previousLayoutMode = previousExpertInfoPanelLayoutModeRef.current;
    if (previousLayoutMode !== sceneLayoutMode) {
      setExpertInfoPanelCollapsed((currentCollapsed) =>
        resolveExpertInfoPanelCollapsedAfterLayoutChange({
          previousLayoutMode,
          nextLayoutMode: sceneLayoutMode,
          currentCollapsed,
        }),
      );
    }
    previousExpertInfoPanelLayoutModeRef.current = sceneLayoutMode;
  }, [sceneLayoutMode, setExpertInfoPanelCollapsed]);

  const expertInfoPanelVisible =
    hasExpertInfoPanel &&
    !expertInfoPanelCollapsed &&
    sceneLayoutMode === "chat";
  const expertInfoPanelProps = useMemo<ExpertInfoPanelProps>(
    () => ({
      requestMetadata: expertPanelRequestMetadata,
      localSkills,
      serviceSkills,
      workspaceSkillBindings,
      skillsLoading: combinedSkillsLoading,
      threadItems: effectiveThreadItems,
      skillRefsEdited:
        expertSkillRefsOverride !== null ||
        expertWorkspaceSkillRuntimeEnableRefs.length > 0,
      enabledWorkspaceSkillRuntimeCount:
        expertWorkspaceSkillRuntimeEnableBindings.length,
      onSkillRefsChange: handleExpertSkillRefsChange,
      onEnableWorkspaceSkillRuntime: handleEnableExpertWorkspaceSkillRuntime,
      onExpertProfileSwitch: handleThreadExpertProfileSwitch,
      onOpenSkillsManage: canOpenSkillsManage
        ? handleOpenSkillsManageFromExpertPanel
        : undefined,
    }),
    [
      canOpenSkillsManage,
      combinedSkillsLoading,
      effectiveThreadItems,
      expertPanelRequestMetadata,
      expertSkillRefsOverride,
      expertWorkspaceSkillRuntimeEnableBindings.length,
      expertWorkspaceSkillRuntimeEnableRefs.length,
      handleEnableExpertWorkspaceSkillRuntime,
      handleExpertSkillRefsChange,
      handleOpenSkillsManageFromExpertPanel,
      handleThreadExpertProfileSwitch,
      localSkills,
      serviceSkills,
      workspaceSkillBindings,
    ],
  );

  return {
    expertInfoPanelProps,
    expertInfoPanelVisible,
    hasExpertInfoPanel,
  };
}
