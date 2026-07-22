import type { AgentUserInputOp } from "@/lib/api/agentProtocol";
import type { BuildUserInputSubmitOpOptions } from "../utils/buildUserInputSubmitOp";
import { buildUserInputSubmitOp } from "../utils/buildUserInputSubmitOp";

type AgentStreamSubmitOpBaseOptions = Omit<
  BuildUserInputSubmitOpOptions,
  "threadId"
>;

export interface BuildAgentStreamSubmitOpOptions extends AgentStreamSubmitOpBaseOptions {
  activeThreadId: string;
}

export function buildAgentStreamSubmitOp(
  options: BuildAgentStreamSubmitOpOptions,
): AgentUserInputOp {
  const { activeThreadId, ...submitOpOptions } = options;

  return buildUserInputSubmitOp({
    ...submitOpOptions,
    threadId: activeThreadId,
  });
}
