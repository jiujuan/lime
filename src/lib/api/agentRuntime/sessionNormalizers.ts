import { normalizeLegacyToolSurfaceName } from "../agentTextNormalization";
import { normalizeQueuedTurnSnapshots } from "../queuedTurn";
import type {
  AgentRuntimeThreadReadModel,
  AsterSubagentParentContext,
  AsterSubagentSessionInfo,
} from "./types";

export function normalizeSubagentSessionInfo(
  session: AsterSubagentSessionInfo,
): AsterSubagentSessionInfo {
  return {
    ...session,
    origin_tool: normalizeLegacyToolSurfaceName(session.origin_tool),
  };
}

export function normalizeSubagentParentContext(
  context?: AsterSubagentParentContext | null,
): AsterSubagentParentContext | undefined {
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
