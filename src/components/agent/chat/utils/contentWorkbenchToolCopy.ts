import { resolveAgentChatCopy } from "./agentChatCopy";

export function resolveContentWorkbenchToolCopy(
  key: string,
  defaultValue: string,
  values: Record<string, unknown> = {},
): string {
  return resolveAgentChatCopy(
    `contentWorkbenchTools.${key}`,
    defaultValue,
    values,
  );
}
