import { normalizeLegacyToolSurfaceName } from "../agentTextNormalization";
import { normalizeQueuedTurnSnapshots } from "../queuedTurn";
import type {
  AgentRuntimeThreadReadModel,
  AgentSubagentParentContext,
  AgentSubagentSessionInfo,
} from "./types";

export function normalizeSubagentSessionInfo(
  session: AgentSubagentSessionInfo,
): AgentSubagentSessionInfo {
  return {
    ...session,
    origin_tool: normalizeLegacyToolSurfaceName(session.origin_tool),
  };
}

export function normalizeSubagentParentContext(
  context?: AgentSubagentParentContext | null,
): AgentSubagentParentContext | undefined {
  if (!context) {
    return undefined;
  }

  return {
    ...context,
    origin_tool: normalizeLegacyToolSurfaceName(context.origin_tool),
    sibling_subagent_sessions: Array.isArray(context.sibling_subagent_sessions)
      ? context.sibling_subagent_sessions.map(normalizeSubagentSessionInfo)
      : context.sibling_subagent_sessions,
  };
}

export function normalizeThreadReadModel(
  threadRead?: AgentRuntimeThreadReadModel | null,
): AgentRuntimeThreadReadModel | null | undefined {
  if (!threadRead) {
    return threadRead;
  }

  return {
    ...threadRead,
    queued_turns: normalizeQueuedTurnSnapshots(threadRead.queued_turns),
  };
}
