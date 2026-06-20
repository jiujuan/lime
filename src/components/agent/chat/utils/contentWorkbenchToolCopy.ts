import { resolveRequiredAgentChatCopy } from "./agentChatCopy";

export function resolveContentWorkbenchToolCopy(
  key: string,
  defaultValueOrValues: string | Record<string, unknown> = {},
  maybeValues: Record<string, unknown> = {},
): string {
  const values =
    typeof defaultValueOrValues === "string"
      ? maybeValues
      : defaultValueOrValues;
  return resolveRequiredAgentChatCopy(`contentWorkbenchTools.${key}`, values);
}
