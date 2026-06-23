export function normalizeComparableThinkingText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hasMostlyAsciiLetters(value: string): boolean {
  const letters = value.match(/[A-Za-z]/g)?.length || 0;
  const cjk = value.match(/[\u4e00-\u9fff]/g)?.length || 0;
  return letters > 0 && letters >= cjk * 2;
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
      (/^(?:finding|looking for|searching for|gathering|checking|investigating)\s+(?:the\s+)?(?:latest|recent|current|today'?s|available)\b/i.test(
        normalized,
      ) ||
        /^(?:finding|looking for|searching for|gathering|checking|fetching|reading|opening|browsing)\b.{0,96}$/i.test(
          normalized,
        ) ||
        /^(?:finding|looking for|searching for|gathering|checking|investigating)\s+(?:the\s+)?(?:[\w'-]+\s+){0,4}(?:tool|tools|tool calls?|websearch|webfetch|sources?|results?)\b/i.test(
          normalized,
        ) ||
        /^(?:i'?m|i am|we'?re|we are)\s+(?:thinking|checking|investigating|looking|searching|trying|figuring)\b/i.test(
          normalized,
        ) ||
        /^(?:i|we)\s+(?:need|should|will|can|must|want)\s+(?:to\s+)?(?:use|search|find|check|look|inspect|investigate|call|verify)\b/i.test(
          normalized,
        ) ||
        /^(?:it\s+seems|seems)\s+like\s+(?:the\s+)?(?:search|web\s*search|results?|sources?)\b/i.test(
          normalized,
        ) ||
        /^(?:the\s+)?(?:search|web\s*search)\s+results?\s+(?:show|seem|suggest|returned|include)\b/i.test(
          normalized,
        ) ||
        /^let'?s\s+(?:search|find|check|look|inspect|use|try|verify)\b/i.test(
          normalized,
        ) ||
        /^let'?s\s+get\s+started\b/i.test(normalized) ||
        /^i'?m\s+on\s+a\s+task\s+to\b/i.test(normalized) ||
        /^(?:tool|tools|toolsearch|websearch|webfetch)\b.*\b(?:available|namespace|callable|registry|not available|not found|tool call|tool calls)\b/i.test(
          normalized,
        ) ||
        /\b(?:namespace|registry|callable)\b.*\b(?:tool|tools|websearch|webfetch)\b/i.test(
          normalized,
        )))
  );
}
