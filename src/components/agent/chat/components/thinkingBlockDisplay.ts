import { parseAIResponse } from "@/components/workspace/a2ui/parser";
import { normalizeProcessDisplayText } from "../utils/processDisplayText";
import { sanitizeThinkingDisplayText } from "./timeline-utils/textFormatting";

export interface ThinkingDisplayParts {
  statusLabel: string;
  body: string;
  preview: string;
}

export function resolveThinkingDisplayParts(
  content: string,
  isStreaming: boolean,
): ThinkingDisplayParts {
  const trimmed = sanitizeThinkingDisplayText(
    normalizeProcessDisplayText(content),
  ).trim();
  const statusLabel = isStreaming ? "思考中" : "已完成思考";

  if (!trimmed) {
    return {
      statusLabel,
      body: "",
      preview: "",
    };
  }

  const parsed = parseAIResponse(trimmed, false);
  if (!parsed.hasA2UI && !parsed.hasPending) {
    const preview = isStreaming
      ? ""
      : trimmed
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find(Boolean) || "";
    return {
      statusLabel,
      body: trimmed,
      preview,
    };
  }

  const fallbackPreview =
    trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || "在整理结构化内容";
  return {
    statusLabel,
    body: fallbackPreview,
    preview: fallbackPreview,
  };
}
