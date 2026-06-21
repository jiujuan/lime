export interface StreamingMarkdownDisplaySource {
  markdown: string;
  pendingTail: string;
}

const STRUCTURED_CONTENT_HINT_RE =
  /<a2ui|```\s*a2ui|<write_file|<document/i;

function hasStructuredContentHint(text: string): boolean {
  return STRUCTURED_CONTENT_HINT_RE.test(text);
}

export function resolveStreamingMarkdownDisplaySource(
  text: string,
  isStreaming: boolean,
): StreamingMarkdownDisplaySource {
  if (!isStreaming || hasStructuredContentHint(text)) {
    return { markdown: text, pendingTail: "" };
  }

  const lastNewlineIndex = text.lastIndexOf("\n");
  if (lastNewlineIndex < 0) {
    return { markdown: "", pendingTail: text };
  }

  return {
    markdown: text.slice(0, lastNewlineIndex + 1),
    pendingTail: text.slice(lastNewlineIndex + 1),
  };
}
