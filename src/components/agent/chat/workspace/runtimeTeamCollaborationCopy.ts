import { resolveRequiredAgentChatCopy } from "../utils/agentChatCopy";

export function resolveRuntimeTeamCollaborationCopy(
  key: string,
  values: Record<string, string | number> = {},
): string {
  return resolveRequiredAgentChatCopy(`collaboration.runtime.${key}`, values);
}

export function resolveRuntimeTeamDefaultLabel(): string {
  return resolveRuntimeTeamCollaborationCopy("defaultTeamLabel");
}

export function resolveRuntimeTeamMemberFallbackLabel(index: number): string {
  return resolveRuntimeTeamCollaborationCopy("memberFallbackLabel", {
    index: index + 1,
  });
}

export function resolveRuntimeTeamMemberFallbackSummary(): string {
  return resolveRuntimeTeamCollaborationCopy("memberFallbackSummary");
}

export function resolveRuntimeTeamMemberOverflowLine(count: number): string {
  return resolveRuntimeTeamCollaborationCopy("memberOverflow", { count });
}

export function resolveRuntimeTeamMemberPlanLine(params: {
  index: number;
  label: string;
  summary: string;
}): string {
  return resolveRuntimeTeamCollaborationCopy("memberPlanLine", {
    index: params.index + 1,
    label: params.label,
    summary: params.summary,
  });
}

export function resolveRuntimeTeamSummaryLine(summary: string): string {
  return resolveRuntimeTeamCollaborationCopy("summaryLine", { summary });
}

export function resolveRuntimeTeamPlanSection(planLines: string[]): string {
  return `${resolveRuntimeTeamCollaborationCopy("planIntro")}\n${planLines.join(
    "\n",
  )}`;
}

export function resolveRuntimeTeamReadyLeadFallback(teamLabel: string): string {
  return resolveRuntimeTeamCollaborationCopy("readyLeadFallback", {
    teamLabel,
  });
}

export function resolveRuntimeTeamReadyTailFallback(): string {
  return resolveRuntimeTeamCollaborationCopy("readyTailFallback");
}

export function resolveRuntimeTeamReadyDetailFallback(): string {
  return resolveRuntimeTeamCollaborationCopy("readyDetailFallback");
}

export function resolveRuntimeTeamCurrentConfigCheckpoint(
  teamLabel: string,
): string {
  return resolveRuntimeTeamCollaborationCopy("readyCheckpoint.currentConfig", {
    teamLabel,
  });
}

export function resolveRuntimeTeamAssignedCountCheckpoint(
  count: number,
): string {
  return resolveRuntimeTeamCollaborationCopy("readyCheckpoint.assignedCount", {
    count,
  });
}

export function resolveRuntimeTeamSyncProgressCheckpoint(): string {
  return resolveRuntimeTeamCollaborationCopy("readyCheckpoint.syncProgress");
}

export function resolveRuntimeTeamWaitingTitle(): string {
  return resolveRuntimeTeamCollaborationCopy("waitingTitle");
}

export function resolveRuntimeTeamWaitingDetailFallback(): string {
  return resolveRuntimeTeamCollaborationCopy("waitingDetailFallback");
}

export function resolveRuntimeTeamFirstPlanFallback(): string {
  return resolveRuntimeTeamCollaborationCopy(
    "waitingCheckpoint.firstPlanFallback",
  );
}

export function resolveRuntimeTeamStartingCheckpoint(): string {
  return resolveRuntimeTeamCollaborationCopy("waitingCheckpoint.starting");
}

export function resolveRuntimeTeamFailedTitle(): string {
  return resolveRuntimeTeamCollaborationCopy("failedTitle");
}

export function resolveRuntimeTeamFailedDetailFallback(): string {
  return resolveRuntimeTeamCollaborationCopy("failedDetailFallback");
}

export function resolveRuntimeTeamFailedContent(): string {
  return resolveRuntimeTeamCollaborationCopy("failedContent");
}

export function resolveRuntimeTeamFormingTitle(): string {
  return resolveRuntimeTeamCollaborationCopy("formingTitle");
}

export function resolveRuntimeTeamFormingDetail(): string {
  return resolveRuntimeTeamCollaborationCopy("formingDetail");
}

export function resolveRuntimeTeamFormingCheckpoints(): string[] {
  return [
    resolveRuntimeTeamCollaborationCopy("formingCheckpoint.intent"),
    resolveRuntimeTeamCollaborationCopy("formingCheckpoint.prepare"),
    resolveRuntimeTeamCollaborationCopy("formingCheckpoint.waiting"),
  ];
}
