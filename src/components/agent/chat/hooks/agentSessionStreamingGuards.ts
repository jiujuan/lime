export function hasActiveStreamingTimeline(options: {
  currentAssistantMsgId?: string | null;
  currentStreamingEventName?: string | null;
  currentStreamingSessionId?: string | null;
}): boolean {
  return Boolean(
    options.currentStreamingSessionId?.trim() ||
      options.currentStreamingEventName?.trim() ||
      options.currentAssistantMsgId?.trim(),
  );
}
