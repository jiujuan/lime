import { extractArtifactProtocolPathsFromValue } from "@/lib/artifact-protocol";

export interface TextSegment {
  type: "text" | "url";
  value: string;
}

export interface NormalizedUrlCandidate {
  url: string;
  trailing: string;
}

const URL_PATTERN_SOURCE = String.raw`\bhttps?:\/\/[^\s<>"'\`]+`;
const URL_TRAILING_PUNCTUATION = /[),.;!?]+$/;

export function createUrlPattern(): RegExp {
  return new RegExp(URL_PATTERN_SOURCE, "gi");
}

export function normalizeUrlCandidate(
  rawUrl: string,
): NormalizedUrlCandidate {
  const normalized = rawUrl.replace(URL_TRAILING_PUNCTUATION, "");
  return {
    url: normalized || rawUrl,
    trailing: rawUrl.slice((normalized || rawUrl).length),
  };
}

export function splitTextIntoSegments(text: string): TextSegment[] {
  if (!text.trim()) {
    return [{ type: "text", value: text }];
  }

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  const urlPattern = createUrlPattern();

  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      segments.push({
        type: "text",
        value: text.slice(lastIndex, matchIndex),
      });
    }

    const { url, trailing } = normalizeUrlCandidate(rawUrl);
    segments.push({ type: "url", value: url });
    if (trailing) {
      segments.push({ type: "text", value: trailing });
    }
    lastIndex = matchIndex + rawUrl.length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }];
}

export function findFirstUrl(
  ...values: Array<string | undefined>
): string | undefined {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const match = value.match(createUrlPattern());
    if (!match || match.length === 0) {
      continue;
    }
    return normalizeUrlCandidate(match[0]).url;
  }
  return undefined;
}

export function isLikelyFilePath(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || /^https?:\/\//i.test(normalized)) {
    return false;
  }

  if (/^(~\/|\/|[A-Za-z]:[\\/]|\.{1,2}[\\/])/.test(normalized)) {
    return true;
  }

  return (
    /[\\/]/.test(normalized) &&
    /\.[A-Za-z0-9_-]{1,12}(?:[#?].*)?$/.test(normalized)
  );
}

export function pickPathFromArguments(
  argumentsValue?: Record<string, unknown>,
): string | undefined {
  return extractArtifactProtocolPathsFromValue(argumentsValue)[0];
}

export function pickCommandFromArguments(
  argumentsValue?: Record<string, unknown>,
): string | undefined {
  const command = argumentsValue?.cmd ?? argumentsValue?.command;
  return typeof command === "string" && command.trim()
    ? command.trim()
    : undefined;
}
