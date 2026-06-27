import type {
  AgentUiPerformanceSessionSummary,
  AgentUiPerformanceSnapshot,
} from "@/lib/agentUiPerformanceMetrics";

const MAX_DIAGNOSTIC_SESSIONS = 20;
const MAX_DIAGNOSTIC_PHASES_PER_SESSION = 80;

export interface AgentUiPerformanceDiagnosticSessionSummary {
  sessionId: string;
  workspaceId?: string | null;
  phase_count: number;
  phases: string[];
  metrics: Record<string, number>;
}

export interface AgentUiPerformanceDiagnosticSummary {
  entry_count: number;
  session_count: number;
  truncated_session_count: number;
  sessions: AgentUiPerformanceDiagnosticSessionSummary[];
}

function buildSessionDiagnosticSummary(
  session: AgentUiPerformanceSessionSummary,
): AgentUiPerformanceDiagnosticSessionSummary {
  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(session)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      metrics[key] = Math.round(value);
    }
  }

  return {
    sessionId: session.sessionId,
    workspaceId: session.workspaceId ?? null,
    phase_count: session.phases.length,
    phases: session.phases.slice(-MAX_DIAGNOSTIC_PHASES_PER_SESSION),
    metrics,
  };
}

export function buildAgentUiPerformanceDiagnosticSummary(
  snapshot: AgentUiPerformanceSnapshot | null | undefined,
): AgentUiPerformanceDiagnosticSummary | null {
  if (!snapshot) {
    return null;
  }

  const selectedSessions = snapshot.sessions.slice(-MAX_DIAGNOSTIC_SESSIONS);
  return {
    entry_count: snapshot.entries.length,
    session_count: snapshot.sessions.length,
    truncated_session_count: Math.max(
      0,
      snapshot.sessions.length - selectedSessions.length,
    ),
    sessions: selectedSessions.map(buildSessionDiagnosticSummary),
  };
}
