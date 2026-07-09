import type { PreparedAgentStreamUserInputSend } from "./agentStreamUserInputSendPreparation";
import type { AgentStreamPreparedSendEnv } from "./agentStreamPreparedSendEnv";

type SlashSkillPreflightEnv = Pick<
  AgentStreamPreparedSendEnv,
  | "ensureSession"
  | "sessionIdRef"
  | "activeStreamRef"
  | "listenerMapRef"
  | "setMessages"
  | "setIsSending"
  | "setActiveStream"
  | "clearActiveStreamIfMatch"
  | "onWriteFile"
  | "getWorkspaceIdForSubmit"
>;

interface MaybeHandleSlashSkillBeforeSendOptions {
  preparedSend: PreparedAgentStreamUserInputSend;
  env: SlashSkillPreflightEnv;
}

export async function maybeHandleSlashSkillBeforeSend(
  options: MaybeHandleSlashSkillBeforeSendOptions,
): Promise<boolean> {
  const { preparedSend } = options;
  const { skipUserMessage, expectingQueue } = preparedSend;

  if (skipUserMessage || expectingQueue) {
    return false;
  }

  return false;
}
