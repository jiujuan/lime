import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { SkillScaffoldDraft } from "@/types/page";
import type { AgentChatWorkspaceProps } from "../agentChatWorkspaceContract";
import type { ExpertSkillsManageOptions } from "../experts/ExpertSkillsSection";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";

interface UseWorkspaceEntryNavigationRuntimeParams {
  onNavigate?: AgentChatWorkspaceProps["onNavigate"];
  setChatToolPreferences: Dispatch<SetStateAction<ChatToolPreferences>>;
}

export function useWorkspaceEntryNavigationRuntime({
  onNavigate,
  setChatToolPreferences,
}: UseWorkspaceEntryNavigationRuntimeParams) {
  const handleInstallSkillPackageFromFileManager = useCallback(
    (entry: { path: string; name: string }) => {
      onNavigate?.("skills", {
        initialView: "installed",
        initialSkillPackagePath: entry.path,
        initialSkillPackageName: entry.name,
        initialSkillPackageRequestKey: Date.now(),
      });
    },
    [onNavigate],
  );

  const handleOpenSkillsManageFromExpertPanel = useCallback(
    (options?: ExpertSkillsManageOptions) => {
      const searchQuery = options?.searchQuery?.trim();
      const scaffoldDraft: SkillScaffoldDraft | undefined =
        options?.scaffoldDraft;
      const requestKey = Date.now();
      onNavigate?.("skills", {
        initialView: "installed",
        ...(searchQuery
          ? {
              initialSearchQuery: searchQuery,
              initialSearchRequestKey: requestKey,
            }
          : null),
        ...(scaffoldDraft
          ? {
              initialScaffoldDraft: scaffoldDraft,
              initialScaffoldRequestKey: requestKey,
            }
          : null),
      });
    },
    [onNavigate],
  );

  const handleOpenSubagents = useCallback(() => {
    setChatToolPreferences((previous) =>
      previous.subagent ? previous : { ...previous, subagent: true },
    );
  }, [setChatToolPreferences]);

  return {
    handleInstallSkillPackageFromFileManager,
    handleOpenSkillsManageFromExpertPanel,
    handleOpenSubagents,
  };
}
