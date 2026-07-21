import { parseAgentEvent } from "@/lib/api/agentProtocol";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import type { AgentSessionDetailRefreshRequest } from "./agentSessionRefresh";

type ShellCommandRuntime = Pick<
  AgentRuntimeAdapter,
  "listenToTurnEvents" | "runUserShellCommand"
>;

interface RunAgentChatShellCommandOptions {
  command: string;
  ensureSession: () => Promise<string | null>;
  getThreadId: () => string | undefined;
  refreshSessionDetail: (
    sessionId: string,
    request: AgentSessionDetailRefreshRequest,
  ) => Promise<unknown>;
  refreshSessionReadModel: (sessionId: string) => Promise<unknown>;
  runtime: ShellCommandRuntime;
}

const SHELL_EVENT_REFRESH_REQUEST: AgentSessionDetailRefreshRequest = {
  source: "userShell.event",
  detailMergeMode: "runtime_sync",
};

export async function runAgentChatShellCommand({
  command,
  ensureSession,
  getThreadId,
  refreshSessionDetail,
  refreshSessionReadModel,
  runtime,
}: RunAgentChatShellCommandOptions): Promise<boolean> {
  const normalizedCommand = command.trim();
  if (!normalizedCommand) {
    return false;
  }

  const sessionId = (await ensureSession())?.trim();
  if (!sessionId) {
    throw new Error("active session is required to run a shell command");
  }

  let threadId = getThreadId()?.trim();
  if (!threadId) {
    await refreshSessionReadModel(sessionId);
    threadId = getThreadId()?.trim();
  }
  if (!threadId) {
    throw new Error("canonical threadId is required to run a shell command");
  }

  const eventName = `agentSession/event/${sessionId}`;
  let unlisten: (() => void) | null = null;
  const releaseListener = () => {
    unlisten?.();
    unlisten = null;
  };
  unlisten = await runtime.listenToTurnEvents(eventName, (event) => {
    const parsed = parseAgentEvent(event.payload);
    if (!parsed) {
      return;
    }

    const isShellItem =
      (parsed.type === "item_started" || parsed.type === "item_completed") &&
      parsed.item.type === "command_execution" &&
      parsed.item.source === "userShell";
    const isTerminalTurn =
      parsed.type === "turn_completed" ||
      parsed.type === "turn_failed" ||
      parsed.type === "turn_canceled";
    if (!isShellItem && !isTerminalTurn) {
      return;
    }

    void refreshSessionDetail(sessionId, SHELL_EVENT_REFRESH_REQUEST).finally(
      () => {
        if (
          (parsed.type === "item_completed" && isShellItem) ||
          isTerminalTurn
        ) {
          releaseListener();
        }
      },
    );
  });

  try {
    await runtime.runUserShellCommand(threadId, normalizedCommand, eventName);
    await refreshSessionDetail(sessionId, SHELL_EVENT_REFRESH_REQUEST);
    return true;
  } catch (error) {
    releaseListener();
    throw error;
  }
}
