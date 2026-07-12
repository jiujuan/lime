import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AgentSubagentSessionInfo } from "@/lib/api/agentRuntime";
import {
  isTeamWorkspaceActiveStatus,
  type TeamWorkspaceControlSummary,
  type TeamWorkspaceLiveRuntimeState,
  type TeamWorkspaceWaitSummary,
} from "../teamWorkspaceRuntime";

function normalizeUniqueSessionIds(ids: string[]): string[] {
  return Array.from(
    new Set(ids.map((sessionId) => sessionId.trim()).filter(Boolean)),
  );
}

function throwTeamSubagentControlUnavailable(message: string): never {
  const error = new Error(message);
  toast.error(error.message);
  throw error;
}

interface UseWorkspaceTeamSessionControlRuntimeParams {
  sessionId?: string | null;
  childSubagentSessions: AgentSubagentSessionInfo[];
  liveRuntimeBySessionId: Record<string, TeamWorkspaceLiveRuntimeState>;
  stopSending: () => Promise<void>;
}

export function useWorkspaceTeamSessionControlRuntime({
  childSubagentSessions,
  liveRuntimeBySessionId,
  stopSending,
}: UseWorkspaceTeamSessionControlRuntimeParams) {
  const { t } = useTranslation("agent");
  const teamWaitSummary: TeamWorkspaceWaitSummary | null = null;
  const teamControlSummary: TeamWorkspaceControlSummary | null = null;
  const controlUnavailableMessage = t(
    "agentChat.teamWorkspace.control.unavailable",
  );

  const handleCloseSubagentSession = useCallback(
    async (_subagentSessionId: string) => {
      throwTeamSubagentControlUnavailable(controlUnavailableMessage);
    },
    [controlUnavailableMessage],
  );

  const handleResumeSubagentSession = useCallback(
    async (_subagentSessionId: string) => {
      throwTeamSubagentControlUnavailable(controlUnavailableMessage);
    },
    [controlUnavailableMessage],
  );

  const handleWaitSubagentSession = useCallback(
    async (_subagentSessionId: string, _timeoutMs = 30_000) => {
      throwTeamSubagentControlUnavailable(controlUnavailableMessage);
    },
    [controlUnavailableMessage],
  );

  const handleWaitActiveTeamSessions = useCallback(
    async (subagentSessionIds: string[], _timeoutMs = 30_000) => {
      const normalizedSessionIds =
        normalizeUniqueSessionIds(subagentSessionIds);

      if (normalizedSessionIds.length === 0) {
        const error = new Error(
          t("agentChat.teamWorkspace.control.wait.noActiveError"),
        );
        toast.error(error.message);
        throw error;
      }

      throwTeamSubagentControlUnavailable(controlUnavailableMessage);
    },
    [controlUnavailableMessage, t],
  );

  const handleCloseCompletedTeamSessions = useCallback(
    async (subagentSessionIds: string[]) => {
      const normalizedSessionIds =
        normalizeUniqueSessionIds(subagentSessionIds);

      if (normalizedSessionIds.length === 0) {
        const error = new Error(
          t("agentChat.teamWorkspace.control.closeCompleted.noCompletedError"),
        );
        toast.error(error.message);
        throw error;
      }

      throwTeamSubagentControlUnavailable(controlUnavailableMessage);
    },
    [controlUnavailableMessage, t],
  );

  const handleSendSubagentInput = useCallback(
    async (
      _subagentSessionId: string,
      message: string,
      _options?: { interrupt?: boolean },
    ) => {
      const normalizedMessage = message.trim();
      if (!normalizedMessage) {
        const error = new Error(
          t("agentChat.teamWorkspace.control.sendInput.emptyError"),
        );
        toast.error(error.message);
        throw error;
      }

      throwTeamSubagentControlUnavailable(controlUnavailableMessage);
    },
    [controlUnavailableMessage, t],
  );

  const handleStopSending = useCallback(async () => {
    await stopSending();

    const activeTeamSessionIds = normalizeUniqueSessionIds(
      childSubagentSessions
        .filter((session) => {
          const liveRuntime = liveRuntimeBySessionId[session.id];
          const effectiveRuntimeStatus =
            liveRuntime?.runtimeStatus ?? session.runtime_status;
          const effectiveLatestTurnStatus =
            liveRuntime?.latestTurnStatus ?? session.latest_turn_status;
          return isTeamWorkspaceActiveStatus(
            effectiveRuntimeStatus ?? effectiveLatestTurnStatus,
          );
        })
        .map((session) => session.id),
    );

    if (activeTeamSessionIds.length === 0) {
      return;
    }

    toast.info(controlUnavailableMessage);
  }, [
    childSubagentSessions,
    controlUnavailableMessage,
    liveRuntimeBySessionId,
    stopSending,
  ]);

  return {
    teamWaitSummary,
    teamControlSummary,
    handleCloseSubagentSession,
    handleResumeSubagentSession,
    handleWaitSubagentSession,
    handleWaitActiveTeamSessions,
    handleCloseCompletedTeamSessions,
    handleSendSubagentInput,
    handleStopSending,
  };
}
