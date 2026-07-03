import type { PluginProvenance, InstalledAppPreview } from "../types";

export function buildPluginProvenance(params: {
  preview: InstalledAppPreview;
  entryKey?: string;
  runId?: string;
}): PluginProvenance {
  const { preview } = params;
  return {
    sourceKind: "plugin",
    appId: preview.identity.appId,
    appVersion: preview.identity.appVersion,
    packageHash: preview.identity.packageHash,
    manifestHash: preview.identity.manifestHash,
    entryKey: params.entryKey,
    workflowRunId: params.runId,
  };
}
