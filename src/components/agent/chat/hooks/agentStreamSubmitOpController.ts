import type { AgentUserInputOp } from "@/lib/api/agentProtocol";
import type { BuildUserInputSubmitOpOptions } from "../utils/buildUserInputSubmitOp";
import { buildUserInputSubmitOp } from "../utils/buildUserInputSubmitOp";
import { bindThreadGoalMetadataToSession } from "../utils/harnessRequestMetadata";

type AgentStreamSubmitOpBaseOptions = Omit<
  BuildUserInputSubmitOpOptions,
  "threadId"
>;

export interface BuildAgentStreamSubmitOpOptions extends AgentStreamSubmitOpBaseOptions {
  activeSessionId: string;
  activeThreadId: string;
}

export function buildAgentStreamSubmitOp(
  options: BuildAgentStreamSubmitOpOptions,
): AgentUserInputOp {
  const { activeSessionId, activeThreadId, ...submitOpOptions } = options;

  return buildUserInputSubmitOp({
    ...submitOpOptions,
    requestMetadata: bindThreadGoalMetadataToSession(
      submitOpOptions.requestMetadata,
      activeSessionId,
    ),
    threadId: activeThreadId,
  });
}
