import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime/sessionTypes";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
} from "../types";

export type ThreadReliabilityTone =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "paused"
  | "neutral";

export interface ThreadReliabilityRequestDisplay {
  id: string;
  title: string;
  typeLabel: string;
  statusLabel: string;
  statusTone: ThreadReliabilityTone;
  createdAtLabel?: string | null;
  waitingLabel?: string | null;
}

export interface ThreadReliabilityIncidentDisplay {
  id: string;
  incidentType: string;
  title: string;
  detail?: string | null;
  statusLabel: string;
  severityLabel: string;
  tone: ThreadReliabilityTone;
}

export interface ThreadReliabilityOutcomeDisplay {
  label: string;
  summary: string;
  primaryCause?: string | null;
  retryable: boolean;
  endedAtLabel?: string | null;
  tone: ThreadReliabilityTone;
  outcomeType?: string | null;
}

export interface ThreadReliabilityViewModel {
  shouldRender: boolean;
  statusLabel: string;
  statusTone: ThreadReliabilityTone;
  summary: string;
  activeTurnLabel?: string | null;
  updatedAtLabel?: string | null;
  interruptStateLabel?: string | null;
  pendingRequestCount: number;
  activeIncidentCount: number;
  pendingRequests: ThreadReliabilityRequestDisplay[];
  submittedRequests: ThreadReliabilityRequestDisplay[];
  incidents: ThreadReliabilityIncidentDisplay[];
  outcome: ThreadReliabilityOutcomeDisplay | null;
  recommendations: string[];
}

export type ThreadReliabilitySummaryModel = Pick<
  ThreadReliabilityViewModel,
  "shouldRender" | "statusLabel" | "statusTone" | "summary"
>;

export interface BuildThreadReliabilityViewParams {
  threadRead?: AgentRuntimeThreadReadModel | null;
  turns?: AgentThreadTurn[];
  threadItems?: AgentThreadItem[];
  currentTurnId?: string | null;
  pendingActions?: ActionRequired[];
  submittedActionsInFlight?: ActionRequired[];
  t?: ThreadReliabilityViewTranslation;
  locale?: string | null;
}
export type ThreadReliabilityViewTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export interface ThreadReliabilityViewTextContext {
  t?: ThreadReliabilityViewTranslation;
  locale: string;
}

export type RuntimeIssueThreadItem = Extract<
  AgentThreadItem,
  { type: "error" | "warning" }
>;
