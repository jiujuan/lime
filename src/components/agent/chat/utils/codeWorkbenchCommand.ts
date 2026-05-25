import { resolveMentionCommandPrefixMatch } from "./mentionCommandPrefixMatch";

export interface ParsedCodeWorkbenchCommand {
  rawText: string;
  commandKey: string;
  trigger: string;
  body: string;
  prompt: string;
}

export interface ParseCodeWorkbenchCommandOptions {
  commandKey: string;
  mentionCommandPrefixKeyMap: ReadonlyMap<string, string>;
}

export function parseCodeWorkbenchCommand(
  text: string,
  options: ParseCodeWorkbenchCommandOptions,
): ParsedCodeWorkbenchCommand | null {
  const matched = resolveMentionCommandPrefixMatch(
    text,
    options.mentionCommandPrefixKeyMap,
    {
      commandKey: options.commandKey,
    },
  );
  if (!matched) {
    return null;
  }

  return {
    rawText: text,
    commandKey: matched.commandKey,
    trigger: matched.commandPrefix,
    body: matched.body,
    prompt: matched.body,
  };
}
