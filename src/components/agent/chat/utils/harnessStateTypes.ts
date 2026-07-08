import type {
  AgentContextTraceStep as ContextTraceStep,
  AgentToolCallState as ToolCallState,
} from "@/lib/api/agentProtocol";
import type { ArtifactStatus } from "@/lib/artifact/types";
import type { ActionRequired, AgentRuntimeStatus } from "../types";
import type { resolveArtifactWritePhase } from "./messageArtifacts";
import type { AgentPlanState } from "./planState";
import type { AgentModelReasoningState } from "./modelReasoningState";

export type HarnessTodoStatus = "pending" | "in_progress" | "completed";
export type HarnessPlanPhase = "idle" | "planning" | "ready";

export interface HarnessTodoItem {
  id: string;
  content: string;
  status: HarnessTodoStatus;
}

export type PersistedHarnessTodoLike = {
  id?: string;
  content?: string;
  status?: string;
};

export interface HarnessPlanState {
  phase: HarnessPlanPhase;
  items: HarnessTodoItem[];
  sourceToolCallId?: string;
  summaryText?: string;
  revisionId?: string;
  turnId?: string;
  source?: AgentPlanState["source"];
}

export interface HarnessToolActivity {
  planning: number;
  filesystem: number;
  execution: number;
  web: number;
  skills: number;
  delegation: number;
}

export interface HarnessDelegatedTask {
  id: string;
  title: string;
  status: ToolCallState["status"];
  taskType?: string;
  role?: string;
  model?: string;
  summary?: string;
  startedAt?: Date;
}

export interface HarnessOutputSignal {
  id: string;
  toolCallId: string;
  toolName: string;
  title: string;
  summary: string;
  preview?: string;
  content?: string;
  outputFile?: string;
  offloadFile?: string;
  artifactPath?: string;
  exitCode?: number;
  stdoutLength?: number;
  stderrLength?: number;
  sandboxed?: boolean;
  truncated?: boolean;
  offloaded?: boolean;
  offloadOriginalChars?: number;
  offloadOriginalTokens?: number;
  offloadTrigger?: string;
}

export type HarnessFileKind =
  | "document"
  | "code"
  | "log"
  | "artifact"
  | "offload"
  | "other";

export type HarnessFileAction =
  | "read"
  | "write"
  | "edit"
  | "offload"
  | "persist";

export interface HarnessFileEvent {
  id: string;
  toolCallId: string;
  path: string;
  displayName: string;
  kind: HarnessFileKind;
  action: HarnessFileAction;
  sourceToolName: string;
  timestamp?: Date;
  preview?: string;
  content?: string;
  clickable: boolean;
}

export interface HarnessActiveFileWrite {
  id: string;
  path: string;
  displayName: string;
  phase: NonNullable<ReturnType<typeof resolveArtifactWritePhase>>;
  status: ArtifactStatus;
  source?: string;
  updatedAt?: Date;
  preview?: string;
  latestChunk?: string;
  content?: string;
}

export interface HarnessSessionState {
  runtimeStatus: AgentRuntimeStatus | null;
  pendingApprovals: ActionRequired[];
  latestContextTrace: ContextTraceStep[];
  plan: HarnessPlanState;
  reasoning?: AgentModelReasoningState;
  activity: HarnessToolActivity;
  delegatedTasks: HarnessDelegatedTask[];
  outputSignals: HarnessOutputSignal[];
  activeFileWrites: HarnessActiveFileWrite[];
  recentFileEvents: HarnessFileEvent[];
  hasSignals: boolean;
}

export type HarnessSessionShellState = Pick<
  HarnessSessionState,
  | "runtimeStatus"
  | "pendingApprovals"
  | "latestContextTrace"
  | "plan"
  | "hasSignals"
>;

export interface ToolCallEntry {
  toolCall: ToolCallState;
  messageTimestamp: Date;
}
