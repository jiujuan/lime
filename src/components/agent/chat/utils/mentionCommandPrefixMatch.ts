export interface MentionCommandPrefixMatch {
  commandPrefix: string;
  commandKey: string;
  hasBody: boolean;
  body: string;
}

function normalizeMentionCommandPrefix(value?: string | null): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function isPrefixBoundary(value: string, prefixLength: number): boolean {
  if (value.length === prefixLength) {
    return true;
  }

  return /\s/.test(value.slice(prefixLength, prefixLength + 1));
}

export function resolveMentionCommandPrefixMatch(
  rawText: string,
  mentionCommandPrefixKeyMap: ReadonlyMap<string, string>,
  options?: {
    commandKey?: string;
  },
): MentionCommandPrefixMatch | null {
  const trimmedStart = rawText.trimStart();
  if (!trimmedStart.startsWith("@")) {
    return null;
  }

  const expectedCommandKey = options?.commandKey?.trim();
  const normalized = trimmedStart.toLowerCase();
  let matchedPrefix: string | null = null;
  let matchedCommandKey: string | null = null;

  for (const [rawPrefix, rawCommandKey] of mentionCommandPrefixKeyMap.entries()) {
    const prefix = normalizeMentionCommandPrefix(rawPrefix);
    const commandKey = rawCommandKey.trim();
    if (
      !prefix ||
      !commandKey ||
      !prefix.startsWith("@") ||
      (expectedCommandKey && commandKey !== expectedCommandKey)
    ) {
      continue;
    }

    if (
      normalized.startsWith(prefix) &&
      isPrefixBoundary(normalized, prefix.length) &&
      (!matchedPrefix || prefix.length > matchedPrefix.length)
    ) {
      matchedPrefix = prefix;
      matchedCommandKey = commandKey;
    }
  }

  if (!matchedPrefix || !matchedCommandKey) {
    return null;
  }

  const commandPrefix = trimmedStart.slice(0, matchedPrefix.length);
  const body = trimmedStart.slice(matchedPrefix.length).trim();

  return {
    commandPrefix,
    commandKey: matchedCommandKey,
    hasBody: body.length > 0,
    body,
  };
}
