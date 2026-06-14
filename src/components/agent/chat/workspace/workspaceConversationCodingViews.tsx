import type { TFunction } from "i18next";
import { formatNumber } from "@/i18n/format";
import type {
  AgentRuntimeFileCheckpointThreadSummary,
  AgentRuntimeThreadReadModel,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import { CanvasSessionOverviewPanel } from "../components/CanvasSessionOverviewPanel";
import type {
  CanvasWorkbenchSessionView,
  CanvasWorkbenchUtilityView,
} from "../components/CanvasWorkbenchLayout";
import type { CanvasWorkbenchChangeView } from "../components/canvas-workbench";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
  ConfirmResponse,
} from "../types";
import { CodingWorkbenchLogPanel } from "./CodingWorkbenchLogPanel";
import { CodingWorkbenchOutputPanel } from "./CodingWorkbenchOutputPanel";
import {
  buildCanvasWorkbenchChangeViewFromCodingProjection,
  buildCodingWorkbenchProjectionFromThreadItems,
  buildOutputHeaderViewModel,
  buildSessionHeaderViewModel,
  buildSessionRuntimeCountersFromCodingProjection,
  resolveSessionStatusBadge,
  type SessionRuntimeCounters,
} from "./workspaceConversationSceneViewModel";

type AgentTranslate = TFunction<"agent", undefined>;

interface WorkspaceConversationCodingViewsParams {
  t: AgentTranslate;
  locale: string;
  turns: readonly AgentThreadTurn[];
  threadItems: readonly AgentThreadItem[];
  currentTurnId?: string | null;
  threadRead?: AgentRuntimeThreadReadModel | null;
  pendingActions: readonly ActionRequired[];
  submittedActionsInFlight: readonly ActionRequired[];
  queuedTurns: readonly QueuedTurnSnapshot[];
  isSending?: boolean;
  focusedTimelineItemId?: string | null;
  onOpenFile?: (path: string) => void | Promise<void>;
  onRespondToAction?: (response: ConfirmResponse) => void | Promise<void>;
  onSubmitRecoveryPrompt?: (
    prompt: string,
  ) => void | Promise<boolean> | boolean;
}

interface WorkspaceConversationCodingViews {
  currentSessionTurn: AgentThreadTurn | null;
  counters: SessionRuntimeCounters;
  fileCheckpointSummary: AgentRuntimeFileCheckpointThreadSummary | null;
  sessionView: CanvasWorkbenchSessionView | null;
  outputView: CanvasWorkbenchUtilityView | null;
  logView: CanvasWorkbenchUtilityView | null;
  changeView: CanvasWorkbenchChangeView | null;
}

export function buildWorkspaceConversationCodingViews({
  t,
  locale,
  turns,
  threadItems,
  currentTurnId,
  threadRead,
  pendingActions,
  submittedActionsInFlight,
  queuedTurns,
  isSending,
  focusedTimelineItemId,
  onOpenFile,
  onRespondToAction,
  onSubmitRecoveryPrompt,
}: WorkspaceConversationCodingViewsParams): WorkspaceConversationCodingViews {
  const currentSessionTurn =
    turns.find((turn) => turn.id === currentTurnId) || turns.at(-1) || null;
  const currentSessionStatus = resolveSessionStatusBadge(
    isSending ? "running" : currentSessionTurn?.status,
    t,
  );
  const fileCheckpointSummary = threadRead?.file_checkpoint_summary || null;
  const codingView = buildCodingWorkbenchProjectionFromThreadItems({
    threadItems,
    fileCheckpointSummary,
    threadRead,
  });
  const counters = buildSessionRuntimeCountersFromCodingProjection({
    codingView,
    fileCheckpointSummary,
    queuedTurns,
  });
  const labels = {
    inProgressItemCountLabel: formatNumber(counters.inProgressItemCount, {
      locale,
    }),
    generatedFileCountLabel: formatNumber(counters.generatedFileCount, {
      locale,
    }),
    pendingActionCountLabel: formatNumber(codingView.actions.length, {
      locale,
    }),
    queuedTurnCountLabel: formatNumber(queuedTurns.length, { locale }),
  };
  const sessionHeaderView = buildSessionHeaderViewModel({
    t,
    currentSessionTurn,
    currentSessionStatus,
    counters,
    labels,
    pendingActionCount: codingView.actions.length,
    queuedTurnCount: queuedTurns.length,
  });
  const sessionView: CanvasWorkbenchSessionView | null = sessionHeaderView
    ? {
        ...sessionHeaderView,
        renderPanel: () => (
          <CanvasSessionOverviewPanel
            turns={turns}
            threadItems={threadItems}
            currentTurnId={currentTurnId}
            pendingActions={pendingActions}
            queuedTurns={queuedTurns}
            isSending={isSending}
            focusedItemId={focusedTimelineItemId}
          />
        ),
      }
    : null;
  const outputHeaderView = buildOutputHeaderViewModel({
    t,
    counters,
  });
  const outputView: CanvasWorkbenchUtilityView | null =
    counters.shouldUseRuntimeWorkbench
      ? {
          ...outputHeaderView,
          renderPanel: () => (
            <CodingWorkbenchOutputPanel
              codingView={codingView}
              fileCheckpointSummary={fileCheckpointSummary}
              submittedActionsInFlight={submittedActionsInFlight}
              onRespondToAction={onRespondToAction}
              onSubmitRecoveryPrompt={onSubmitRecoveryPrompt}
            />
          ),
        }
      : null;
  const logView: CanvasWorkbenchUtilityView | null =
    counters.shouldUseRuntimeWorkbench
      ? {
          ...outputHeaderView,
          tabLabel: t("agentChat.workspaceSession.logView.tabLabel"),
          title: t("agentChat.workspaceSession.logView.title"),
          subtitle: t("agentChat.workspaceSession.logView.subtitle"),
          renderPanel: () => (
            <CodingWorkbenchLogPanel codingView={codingView} />
          ),
        }
      : null;
  const changeView = counters.shouldUseRuntimeWorkbench
    ? buildCanvasWorkbenchChangeViewFromCodingProjection({
        codingView,
        fileCheckpointSummary,
        onOpenFile,
      })
    : null;

  return {
    currentSessionTurn,
    counters,
    fileCheckpointSummary,
    sessionView,
    outputView,
    logView,
    changeView,
  };
}
