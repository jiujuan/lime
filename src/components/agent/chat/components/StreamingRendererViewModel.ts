import type { AgentRuntimeStatus, ContentPart } from "../types";

export interface ParsedThinkingContent {
  visibleText: string;
  thinkingText: string | null;
}

const ACTIVE_RUNTIME_STATUS_PHASES = new Set<string>([
  "preparing",
  "routing",
  "context",
  "permission_review",
  "retrying",
  "continuing",
  "synthesizing",
  "final_answer",
]);

export function resolveContentPartDebugSignature(
  parts: ContentPart[] | undefined,
): string {
  if (!parts?.length) {
    return "";
  }

  return parts
    .map((part) => {
      if (part.type === "tool_use") {
        const sequence =
          typeof part.metadata?.sequence === "number"
            ? `#${part.metadata.sequence}`
            : "";
        return `tool:${part.toolCall.name}:${part.toolCall.status}${sequence}`;
      }
      if (part.type === "thinking") {
        const sequence =
          typeof part.metadata?.sequence === "number"
            ? `#${part.metadata.sequence}`
            : "";
        return `thinking${sequence}`;
      }
      if (part.type === "text") {
        const sequence =
          typeof part.metadata?.sequence === "number"
            ? `#${part.metadata.sequence}`
            : "";
        return `text${sequence}`;
      }
      if (part.type === "media_reference") {
        const sequence =
          typeof part.metadata?.sequence === "number"
            ? `#${part.metadata.sequence}`
            : "";
        const kind = part.reference.kind || "media";
        return `media:${kind}${sequence}`;
      }
      return part.type;
    })
    .join("|");
}

export function isActiveRuntimeStatus(
  status?: AgentRuntimeStatus | null,
): boolean {
  if (!status) {
    return false;
  }
  return ACTIVE_RUNTIME_STATUS_PHASES.has(status.phase);
}

export function parseThinkingContent(text: string): ParsedThinkingContent {
  const thinkRegex = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
  let thinkingText: string | null = null;
  let visibleText = text;

  const matches = text.matchAll(thinkRegex);
  const thinkingParts: string[] = [];

  for (const match of matches) {
    thinkingParts.push(match[1].trim());
    visibleText = visibleText.replace(match[0], "");
  }

  if (thinkingParts.length > 0) {
    thinkingText = thinkingParts.join("\n\n");
  }

  return {
    visibleText: visibleText.trim(),
    thinkingText,
  };
}
