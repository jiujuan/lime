import { useCallback, useEffect, useState } from "react";
import {
  syncExpertAgentInstanceToCloud,
  updateExpertAgentInstanceSession,
  updateExpertAgentInstanceSkillRefs,
} from "@/features/experts";
import type { ExpertAgentLaunchParams } from "@/types/page";
import { areStringArraysEqual } from "./agentChatWorkspaceHelpers";

interface UseWorkspaceExpertAgentLaunchSyncRuntimeParams {
  expertAgentLaunch?: ExpertAgentLaunchParams | null;
  expertPanelRequestMetadata: unknown;
  pruneWorkspaceSkillRuntimeEnableRefs: (skillRefs: string[]) => void;
  sessionId?: string | null;
}

export function resolveNextExpertSkillRefsOverride(
  current: string[] | null,
  skillRefs: string[],
): string[] | null {
  return areStringArraysEqual(current, skillRefs) ? current : [...skillRefs];
}

export function useWorkspaceExpertAgentLaunchSyncRuntime({
  expertAgentLaunch,
  expertPanelRequestMetadata,
  pruneWorkspaceSkillRuntimeEnableRefs,
  sessionId,
}: UseWorkspaceExpertAgentLaunchSyncRuntimeParams) {
  const [expertSkillRefsOverride, setExpertSkillRefsOverride] = useState<
    string[] | null
  >(null);

  useEffect(() => {
    setExpertSkillRefsOverride(null);
  }, [expertPanelRequestMetadata]);

  const handleExpertSkillRefsChange = useCallback(
    (skillRefs: string[]) => {
      setExpertSkillRefsOverride((current) =>
        resolveNextExpertSkillRefsOverride(current, skillRefs),
      );
      pruneWorkspaceSkillRuntimeEnableRefs(skillRefs);
      if (!expertAgentLaunch) {
        return;
      }
      const record = updateExpertAgentInstanceSkillRefs({
        tenantId: expertAgentLaunch.tenantId,
        expertId: expertAgentLaunch.expertId,
        releaseId: expertAgentLaunch.releaseId,
        catalogVersion: expertAgentLaunch.catalogVersion,
        skillRefsOverride: skillRefs,
      });
      void syncExpertAgentInstanceToCloud(record).catch(() => undefined);
    },
    [expertAgentLaunch, pruneWorkspaceSkillRuntimeEnableRefs],
  );

  useEffect(() => {
    const normalizedSessionId = sessionId?.trim();
    if (!expertAgentLaunch || !normalizedSessionId) {
      return;
    }
    const record = updateExpertAgentInstanceSession({
      tenantId: expertAgentLaunch.tenantId,
      expertId: expertAgentLaunch.expertId,
      releaseId: expertAgentLaunch.releaseId,
      catalogVersion: expertAgentLaunch.catalogVersion,
      latestSessionId: normalizedSessionId,
      skillRefsOverride:
        expertSkillRefsOverride ?? expertAgentLaunch.skillRefsOverride,
    });
    if (record) {
      void syncExpertAgentInstanceToCloud(record).catch(() => undefined);
    }
  }, [expertAgentLaunch, expertSkillRefsOverride, sessionId]);

  return {
    expertSkillRefsOverride,
    handleExpertSkillRefsChange,
  };
}
