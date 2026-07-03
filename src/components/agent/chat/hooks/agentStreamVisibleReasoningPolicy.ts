import type { AgentEvent } from "@/lib/api/agentProtocol";

type ReasoningEvent = Extract<AgentEvent, { type: "reasoning_delta" }>;

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
): string {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function shouldSurfaceReasoningEventAsVisibleProcess(
  event: ReasoningEvent,
): boolean {
  const metadata = event.providerMetadata;
  const presentation = readMetadataString(metadata, ["presentation"]);
  if (presentation === "visible_process_summary") {
    return true;
  }

  const source = readMetadataString(metadata, ["source"]);
  if (source === "image_command_workflow") {
    return true;
  }

  return Boolean(event.reasoningId?.includes("image-presentation"));
}
