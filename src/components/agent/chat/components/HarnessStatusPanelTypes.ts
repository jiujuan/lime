import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type {
  AgentRuntimeThreadReadModel,
  AgentRuntimeToolInventory,
  AgentSubagentSessionInfo,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import type { TeamMemorySnapshot } from "@/lib/teamMemorySync";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
  ConfirmResponse,
  Message,
} from "../types";
import type { TeamRoleDefinition } from "../utils/teamDefinitions";
import type { HarnessSessionState } from "../utils/harnessState";
import type { HarnessEnvironmentSummary } from "./HarnessActivityTypes";
import type { HarnessFilePreviewResult } from "./useHarnessPreviewDialog";
import type { HarnessFileChangeReviewSummary } from "./useHarnessFileReviewState";
import type { HarnessSectionKey } from "./HarnessStatusSectionFrame";
import type {
  ExecutionPolicyFocusContext,
  ProviderSettingsFocusContext,
} from "@/types/page";

export type HarnessStatusPanelLayout = "default" | "sidebar" | "dialog";

export interface HarnessSummaryCard {
  sectionKey: HarnessSectionKey;
  title: string;
  value: string;
  hint: string;
  icon: LucideIcon;
}

export interface HarnessLeadContentContext {
  fileChangeReviewSummary: HarnessFileChangeReviewSummary;
}

export type HarnessLeadContent =
  | ReactNode
  | ((context: HarnessLeadContentContext) => ReactNode);

export interface HarnessStatusPanelProps {
  harnessState: HarnessSessionState;
  environment: HarnessEnvironmentSummary;
  layout?: HarnessStatusPanelLayout;
  onLoadFilePreview?: (path: string) => Promise<HarnessFilePreviewResult>;
  onOpenFile?: (fileName: string, content: string) => void;
  onRevealPath?: (path: string) => Promise<void>;
  onOpenPath?: (path: string) => Promise<void>;
  onOpenFileCheckpoints?: () => void;
  childSubagentSessions?: AgentSubagentSessionInfo[];
  onOpenSubagentSession?: (sessionId: string) => void;
  toolInventory?: AgentRuntimeToolInventory | null;
  toolInventoryLoading?: boolean;
  toolInventoryError?: string | null;
  onRefreshToolInventory?: () => void;
  mcpPrepareCandidateCount?: number;
  mcpPrepareLoading?: boolean;
  mcpPrepareError?: string | null;
  onPrepareMcpTargets?: () => void | Promise<void>;
  title?: string;
  description?: string;
  toggleLabel?: string;
  leadContent?: HarnessLeadContent;
  selectedTeamLabel?: string | null;
  selectedTeamSummary?: string | null;
  selectedTeamRoles?: TeamRoleDefinition[] | null;
  threadRead?: AgentRuntimeThreadReadModel | null;
  turns?: AgentThreadTurn[];
  threadItems?: AgentThreadItem[];
  currentTurnId?: string | null;
  pendingActions?: ActionRequired[];
  submittedActionsInFlight?: ActionRequired[];
  onRespondToAction?: (response: ConfirmResponse) => void | Promise<void>;
  queuedTurns?: QueuedTurnSnapshot[];
  canInterrupt?: boolean;
  onInterruptCurrentTurn?: () => void | Promise<void>;
  onResumeThread?: () => boolean | Promise<boolean>;
  onReplayPendingRequest?: (requestId: string) => boolean | Promise<boolean>;
  onPromoteQueuedTurn?: (queuedTurnId: string) => boolean | Promise<boolean>;
  onObjectiveChanged?: () => void | Promise<void>;
  onOpenMemoryWorkbench?: () => void;
  onManageProviders?: (context?: ProviderSettingsFocusContext) => void;
  onOpenExecutionPolicySettings?: (
    context?: ExecutionPolicyFocusContext,
  ) => void;
  messages?: Message[];
  teamMemorySnapshot?: TeamMemorySnapshot | null;
  diagnosticRuntimeContext?: {
    sessionId?: string | null;
    workspaceId?: string | null;
    workingDir?: string | null;
    providerType?: string | null;
    model?: string | null;
    executionStrategy?: string | null;
    activeTheme?: string | null;
    selectedTeamLabel?: string | null;
  } | null;
}
