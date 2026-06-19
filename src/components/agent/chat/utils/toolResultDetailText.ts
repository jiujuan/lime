const STRUCTURED_DETAIL_TEXT_KEYS = [
  "markdown",
  "markdownContent",
  "markdown_content",
  "contentMarkdown",
  "content_markdown",
  "bodyMarkdown",
  "body_markdown",
  "content",
  "text",
  "body",
  "summary",
  "description",
  "output",
] as const;

const STRUCTURED_DETAIL_OBJECT_KEYS = [
  "result",
  "data",
  "page",
  "article",
  "document",
  "content",
] as const;

export function sanitizeToolResultDetailMarkdown(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function parseStructuredToolResult(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function extractStructuredToolDetailText(
  value: unknown,
  visited = new Set<unknown>(),
): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  if (visited.has(value)) {
    return null;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractStructuredToolDetailText(item, visited))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.slice(0, 3).join("\n\n") : null;
  }

  const record = value as Record<string, unknown>;
  for (const key of STRUCTURED_DETAIL_TEXT_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const key of STRUCTURED_DETAIL_OBJECT_KEYS) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      const candidate = extractStructuredToolDetailText(nested, visited);
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

export function normalizeToolResultDetailText(value: string): string {
  const parsed = parseStructuredToolResult(value);
  if (!parsed) {
    return value;
  }

  return extractStructuredToolDetailText(parsed) || value;
}
