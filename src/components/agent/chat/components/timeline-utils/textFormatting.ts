export function shortenInlineText(
  value: string | undefined | null,
  maxLength = 72,
): string | null {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function normalizeComparableThinkingText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hasMostlyAsciiLetters(value: string): boolean {
  const letters = value.match(/[A-Za-z]/g)?.length || 0;
  const cjk = value.match(/[\u4e00-\u9fff]/g)?.length || 0;
  return letters > 0 && letters >= cjk * 2;
}

export function formatTimestamp(value?: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function stringifyResponse(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function stringifyItemForDebug(item: unknown): string {
  try {
    return JSON.stringify(item, null, 2);
  } catch {
    return String(item);
  }
}

export function hasAnyPrefix(value: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

export function isInternalThinkingPreviewLine(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) {
    return false;
  }

  return (
    /^(我们被要求|我被要求|我需要|我们需要|我们先|我们要|需要理解用户|首先，?用户|We need to|The user asks?|The user wants|The prompt asks|I need to)/i.test(
      normalized,
    ) ||
    /(用户的问题|用户问的是|用户要求|这似乎是一个关于|这个问题其实是在询问|我需要用|避免展开复杂流程|the user'?s question|the user requested)/i.test(
      normalized,
    ) ||
    (hasMostlyAsciiLetters(normalized) &&
      (/^(?:finding|looking for|searching for|gathering|checking|investigating)\s+(?:the\s+)?(?:latest|recent|current|today'?s|available|tool|tools|tool calls?|websearch|webfetch|news|sources?|headlines?|results?)\b/i.test(
        normalized,
      ) ||
        /^(?:i'?m|i am|we'?re|we are)\s+(?:thinking|checking|investigating|looking|searching|trying|figuring)\b/i.test(
          normalized,
        ) ||
        /^(?:i|we)\s+(?:need|should|will|can|must|want)\s+(?:to\s+)?(?:use|search|find|check|look|inspect|investigate|call|verify)\b/i.test(
          normalized,
        ) ||
        /^let'?s\s+(?:search|find|check|look|inspect|use|try|verify)\b/i.test(
          normalized,
        ) ||
        /^(?:tool|tools|toolsearch|websearch|webfetch)\b.*\b(?:available|namespace|callable|registry|not available|not found|tool call|tool calls)\b/i.test(
          normalized,
        ) ||
        /\b(?:namespace|registry|callable)\b.*\b(?:tool|tools|websearch|webfetch)\b/i.test(
          normalized,
        )))
  );
}

export function sanitizeThinkingDisplayText(value: string): string {
  const lines = value.split(/\r?\n/);
  const visibleLines = lines.filter(
    (line) => !isInternalThinkingPreviewLine(line),
  );
  return visibleLines.join("\n").trim();
}
