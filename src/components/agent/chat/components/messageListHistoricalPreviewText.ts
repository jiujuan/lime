import { formatNumber } from "@/i18n/format";
import type { AgentThreadItem } from "../types";
import { isHiddenConversationArtifactPath } from "../utils/internalArtifactVisibility";

export function formatHistoricalContentLength(value: number): string {
  return formatNumber(value);
}

export function buildHistoricalMessagePreview(
  content: string,
  previewChars: number,
): string {
  const normalized = content.trim();
  if (normalized.length <= previewChars) {
    return normalized;
  }

  return `${normalized.slice(0, previewChars)}\n\n...`;
}

export function summarizeHistoricalTimelineItems(items: AgentThreadItem[]): {
  stepsCount: number;
  toolStepsCount: number;
  thinkingStepsCount: number;
  artifactStepsCount: number;
} {
  const visibleItems = items.filter((item) => {
    if (item.type === "user_message" || item.type === "agent_message") {
      return false;
    }

    return !(
      item.type === "file_artifact" &&
      isHiddenConversationArtifactPath(item.path)
    );
  });
  const toolStepsCount = visibleItems.filter(
    (item) =>
      item.type === "tool_call" ||
      item.type === "command_execution" ||
      item.type === "web_search",
  ).length;
  const thinkingStepsCount = visibleItems.filter(
    (item) =>
      item.type === "reasoning" ||
      item.type === "plan" ||
      item.type === "turn_summary" ||
      item.type === "context_compaction",
  ).length;
  const artifactStepsCount = visibleItems.filter(
    (item) => item.type === "file_artifact",
  ).length;
  return {
    stepsCount: visibleItems.length,
    toolStepsCount,
    thinkingStepsCount,
    artifactStepsCount,
  };
}
