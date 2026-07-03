import type { PluginProvenance, PluginProvenanceQuery } from "../types";

export function matchesPluginProvenanceQuery(
  provenance: PluginProvenance,
  query: PluginProvenanceQuery = {},
): boolean {
  if (query.appId && provenance.appId !== query.appId) {
    return false;
  }
  if (query.entryKey && provenance.entryKey !== query.entryKey) {
    return false;
  }
  if (query.workflowRunId && provenance.workflowRunId !== query.workflowRunId) {
    return false;
  }
  return true;
}
