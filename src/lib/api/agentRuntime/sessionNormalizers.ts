import { normalizeQueuedTurnSnapshots } from "../queuedTurn";
import type { AgentRuntimeThreadReadModel } from "./sessionTypes";

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
