import type { MutableRefObject } from "react";
import { parseAIResponse } from "@/components/workspace/a2ui/parser";
import type {
  ParseResult,
  ParsedMessageContent,
} from "@/components/workspace/a2ui/types";

const STRUCTURED_CONTENT_HINT_RE = /<a2ui|```\s*a2ui|<write_file|<document/i;
const STRUCTURED_PARSE_CACHE_LIMIT = 64;

export const STREAMING_STRUCTURED_PARSE_DEBOUNCE_MS = 48;

export const EMPTY_PARSE_RESULT: ParseResult = {
  parts: [],
  hasA2UI: false,
  hasWriteFile: false,
  hasPending: false,
};

export type WriteFileMessagePart = ParsedMessageContent & {
  type: "write_file" | "pending_write_file";
};

export function hasStructuredContentHint(text: string): boolean {
  return STRUCTURED_CONTENT_HINT_RE.test(text);
}

function createPlainTextParts(text: string): ParsedMessageContent[] {
  const trimmed = text.trim();
  return trimmed ? [{ type: "text", content: trimmed }] : [];
}

export function isWriteFileMessagePart(
  part: ParsedMessageContent,
): part is WriteFileMessagePart {
  return part.type === "write_file" || part.type === "pending_write_file";
}

function parseStructuredContent(
  text: string,
  isStreaming: boolean,
): ParseResult {
  if (!text.trim()) {
    return EMPTY_PARSE_RESULT;
  }

  if (!hasStructuredContentHint(text)) {
    return {
      parts: createPlainTextParts(text),
      hasA2UI: false,
      hasWriteFile: false,
      hasPending: false,
    };
  }

  return parseAIResponse(text, isStreaming);
}

export function getCachedStructuredParse(
  cacheRef: MutableRefObject<Map<string, ParseResult>>,
  text: string,
  isStreaming: boolean,
): ParseResult {
  const key = `${isStreaming ? "stream" : "static"}:${text}`;
  const cached = cacheRef.current.get(key);
  if (cached) {
    return cached;
  }

  const parsed = parseStructuredContent(text, isStreaming);
  if (cacheRef.current.size >= STRUCTURED_PARSE_CACHE_LIMIT) {
    const oldestKey = cacheRef.current.keys().next().value;
    if (oldestKey) {
      cacheRef.current.delete(oldestKey);
    }
  }
  cacheRef.current.set(key, parsed);
  return parsed;
}
