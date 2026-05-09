import type { AutomationJobRecord } from "@/lib/api/automation";

import {
  buildAgentUiAutomationJobProjectionEvents,
  type AgentUiAutomationJobProjectionEvent,
  type AgentUiProjectionContext,
  type AgentUiProjectionEvent,
} from "./agentUiEventProjection";
import { recordAgentUiProjectionEvents } from "./conversationProjectionStore";

type AutomationJobProjectionRecord = Partial<AutomationJobRecord> &
  Pick<AutomationJobRecord, "id" | "name">;

export function recordAutomationJobAgentUiProjection(
  job: AutomationJobProjectionRecord,
  event: AgentUiAutomationJobProjectionEvent,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  return recordAgentUiProjectionEvents(
    buildAgentUiAutomationJobProjectionEvents({ job, event }, context),
  );
}

export function recordAutomationJobsAgentUiProjection(
  jobs: AutomationJobProjectionRecord[],
  event: AgentUiAutomationJobProjectionEvent = "loaded",
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  if (jobs.length === 0) {
    return [];
  }

  return recordAgentUiProjectionEvents(
    jobs.flatMap((job, index) =>
      buildAgentUiAutomationJobProjectionEvents(
        { job, event },
        typeof context.sequence === "number"
          ? { ...context, sequence: context.sequence + index * 2 }
          : context,
      ),
    ),
  );
}
