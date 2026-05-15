import type { AgentAppProvenance, AgentAppProvenanceQuery } from "../types";

export function matchesAgentAppProvenanceQuery(
  provenance: AgentAppProvenance,
  query: AgentAppProvenanceQuery = {},
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
