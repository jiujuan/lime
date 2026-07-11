import { useRuntimeTeamFormation } from "../hooks/useRuntimeTeamFormation";
import { useWorkspaceTeamSessionControlRuntime } from "./useWorkspaceTeamSessionControlRuntime";
import { useWorkspaceTeamSessionRuntime } from "./useWorkspaceTeamSessionRuntime";

type FormationParams = Parameters<typeof useRuntimeTeamFormation>[0];
type SessionParams = Parameters<typeof useWorkspaceTeamSessionRuntime>[0];
type ControlParams = Parameters<
  typeof useWorkspaceTeamSessionControlRuntime
>[0];

interface UseWorkspaceTeamRuntimeParams {
  formation: FormationParams;
  session: SessionParams;
  stopSending: ControlParams["stopSending"];
}

/** Team 发送编队、会话投影和主输出停止控制共用同一运行时边界。 */
export function useWorkspaceTeamRuntime({
  formation,
  session,
  stopSending,
}: UseWorkspaceTeamRuntimeParams) {
  const { clearRuntimeTeamState, prepareRuntimeTeamBeforeSend } =
    useRuntimeTeamFormation(formation);
  const teamSessionRuntime = useWorkspaceTeamSessionRuntime(session);
  const { handleStopSending } = useWorkspaceTeamSessionControlRuntime({
    sessionId: session.sessionId,
    childSubagentSessions: session.childSubagentSessions,
    liveRuntimeBySessionId: teamSessionRuntime.liveRuntimeBySessionId,
    stopSending,
  });

  return {
    clearRuntimeTeamState,
    currentSessionTitle: teamSessionRuntime.currentSessionTitle,
    handleStopSending,
    hasRuntimeSessions: teamSessionRuntime.hasRuntimeSessions,
    prepareRuntimeTeamBeforeSend,
    subagentsRuntimeVisible: teamSessionRuntime.subagentsRuntimeVisible,
  };
}
