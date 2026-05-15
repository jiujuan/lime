import type { AgentAppProvenance, InstalledAppPreview } from "../types";

export function buildAgentAppProvenance(params: {
  preview: InstalledAppPreview;
  entryKey?: string;
  runId?: string;
}): AgentAppProvenance {
  const { preview } = params;
  return {
    sourceKind: "agent_app",
    appId: preview.identity.appId,
    appVersion: preview.identity.appVersion,
    packageHash: preview.identity.packageHash,
    manifestHash: preview.identity.manifestHash,
    entryKey: params.entryKey,
    workflowRunId: params.runId,
  };
}
