import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type {
  ActionRequired,
  AgentThreadItem,
  ConfirmResponse,
  Message,
} from "../types";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";
import {
  filterPlanComposerDecisionFromPendingActions,
  selectLatestPlanComposerDecision,
} from "./planComposerDecision";
import {
  buildPlanImplementationSubmitPlan,
  hasProposedPlanImplementationSignals,
  readPlanImplementationConfirmationKeys,
  selectProposedPlanImplementationDecision,
  type PlanImplementationState,
} from "./planImplementationDecision";
import { PlanComposerDecisionPanel } from "./PlanComposerDecisionPanel";
import type { WorkspaceHandleSend } from "./useWorkspaceSendActions";

interface UseWorkspacePlanDecisionRuntimeParams {
  acceptedLabel: string;
  displayMessages: readonly Message[];
  effectiveChatToolPreferences: ChatToolPreferences;
  effectiveThreadItems: readonly AgentThreadItem[];
  handlePermissionResponse: (response: ConfirmResponse) => void | Promise<void>;
  handleSendRef: MutableRefObject<WorkspaceHandleSend>;
  isSending: boolean;
  pendingActions: readonly ActionRequired[] | undefined;
  planState: PlanImplementationState | null | undefined;
  sessionId?: string | null;
  submittedActionsInFlight: readonly ActionRequired[];
}

interface WorkspacePlanDecisionRuntime {
  planComposerPendingActions: ActionRequired[];
  planDecisionAccessory: ReactNode | undefined;
}

export function useWorkspacePlanDecisionRuntime({
  acceptedLabel,
  displayMessages,
  effectiveChatToolPreferences,
  effectiveThreadItems,
  handlePermissionResponse,
  handleSendRef,
  isSending,
  pendingActions,
  planState,
  sessionId,
  submittedActionsInFlight,
}: UseWorkspacePlanDecisionRuntimeParams): WorkspacePlanDecisionRuntime {
  const planComposerDecision = useMemo(
    () =>
      selectLatestPlanComposerDecision(
        pendingActions,
        submittedActionsInFlight,
      ),
    [pendingActions, submittedActionsInFlight],
  );
  const planComposerPendingActions = useMemo(
    () =>
      filterPlanComposerDecisionFromPendingActions(
        pendingActions,
        planComposerDecision,
      ) ?? [],
    [pendingActions, planComposerDecision],
  );
  const [dismissedLocalPlanRequestIds, setDismissedLocalPlanRequestIds] =
    useState<Set<string>>(() => new Set());
  const [submittedLocalPlanRequestIds, setSubmittedLocalPlanRequestIds] =
    useState<Set<string>>(() => new Set());
  const [
    dismissedLocalPlanConfirmationKeys,
    setDismissedLocalPlanConfirmationKeys,
  ] = useState<Set<string>>(() => new Set());
  const [
    submittedLocalPlanConfirmationKeys,
    setSubmittedLocalPlanConfirmationKeys,
  ] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDismissedLocalPlanRequestIds(new Set());
    setSubmittedLocalPlanRequestIds(new Set());
    setDismissedLocalPlanConfirmationKeys(new Set());
    setSubmittedLocalPlanConfirmationKeys(new Set());
  }, [sessionId]);

  const localPlanImplementationDecision = useMemo(
    () =>
      !planComposerDecision &&
      !isSending &&
      hasProposedPlanImplementationSignals({
        messages: displayMessages,
        planState,
        threadItems: effectiveThreadItems,
      })
        ? selectProposedPlanImplementationDecision({
            dismissedConfirmationKeys: dismissedLocalPlanConfirmationKeys,
            dismissedRequestIds: dismissedLocalPlanRequestIds,
            messages: displayMessages,
            planState,
            submittedConfirmationKeys: submittedLocalPlanConfirmationKeys,
            submittedRequestIds: submittedLocalPlanRequestIds,
            threadItems: effectiveThreadItems,
          })
        : null,
    [
      dismissedLocalPlanConfirmationKeys,
      dismissedLocalPlanRequestIds,
      displayMessages,
      effectiveThreadItems,
      isSending,
      planComposerDecision,
      planState,
      submittedLocalPlanConfirmationKeys,
      submittedLocalPlanRequestIds,
    ],
  );

  const handleDismissLocalPlanImplementationDecision = useCallback(
    (requestId: string, requestArguments?: unknown) => {
      setDismissedLocalPlanRequestIds((previous) => {
        if (previous.has(requestId)) {
          return previous;
        }
        const next = new Set(previous);
        next.add(requestId);
        return next;
      });
      const confirmationKeys =
        readPlanImplementationConfirmationKeys(requestArguments);
      if (confirmationKeys.length > 0) {
        setDismissedLocalPlanConfirmationKeys((previous) => {
          const next = new Set(previous);
          confirmationKeys.forEach((key) => next.add(key));
          return next;
        });
      }
    },
    [],
  );

  const handleLocalPlanImplementationSubmit = useCallback(
    async (response: ConfirmResponse) => {
      const submitPlan = buildPlanImplementationSubmitPlan({
        acceptedLabel,
        effectiveChatToolPreferences,
        requestArguments: localPlanImplementationDecision?.action.arguments,
        response,
      });
      if (submitPlan.kind === "invalid") {
        return;
      }
      if (submitPlan.kind === "dismiss") {
        handleDismissLocalPlanImplementationDecision(
          submitPlan.requestId,
          localPlanImplementationDecision?.action.arguments,
        );
        return;
      }

      const sendResult = await handleSendRef.current(
        [],
        undefined,
        undefined,
        submitPlan.textOverride,
        "react",
        undefined,
        submitPlan.sendOptions,
      );

      if (!sendResult) {
        return;
      }

      setSubmittedLocalPlanRequestIds((previous) => {
        if (previous.has(submitPlan.requestId)) {
          return previous;
        }
        const next = new Set(previous);
        next.add(submitPlan.requestId);
        return next;
      });
      if (submitPlan.confirmationKeys.length > 0) {
        setSubmittedLocalPlanConfirmationKeys((previous) => {
          const next = new Set(previous);
          submitPlan.confirmationKeys.forEach((key) => next.add(key));
          return next;
        });
      }
    },
    [
      acceptedLabel,
      effectiveChatToolPreferences,
      handleDismissLocalPlanImplementationDecision,
      handleSendRef,
      localPlanImplementationDecision?.action.arguments,
    ],
  );

  const planDecisionAccessory = planComposerDecision ? (
    <PlanComposerDecisionPanel
      request={planComposerDecision}
      onSubmit={handlePermissionResponse}
    />
  ) : localPlanImplementationDecision ? (
    <PlanComposerDecisionPanel
      request={localPlanImplementationDecision.action}
      onSubmit={handleLocalPlanImplementationSubmit}
      onDismiss={(requestId) =>
        handleDismissLocalPlanImplementationDecision(
          requestId,
          localPlanImplementationDecision.action.arguments,
        )
      }
    />
  ) : undefined;

  return {
    planComposerPendingActions,
    planDecisionAccessory,
  };
}
