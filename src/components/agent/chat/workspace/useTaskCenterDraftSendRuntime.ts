import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import { recordAgentUiPerformanceMetric } from "@/lib/agentUiPerformanceMetrics";
import { mergeAgentUiPerformanceTraceMetadata } from "../hooks/agentStreamPerformanceMetrics";
import { bindInputbarThreadGoalMetadata } from "../components/Inputbar/utils/inputbarModeRequestMetadata";
import {
  buildHomePendingPreviewMessages,
  type TaskCenterDraftSendRequest,
} from "../homePendingPreview";
import type { Message } from "../types";
import type { InputbarSendHandler } from "../components/Inputbar/inputbarSendPayload";
import type { WorkspaceHandleSend } from "./useWorkspaceSendActions";
import {
  createTaskCenterDraftSendRequestId,
  resolveTaskCenterDraftSendTitle,
  scheduleAfterNextPaint,
  type TaskCenterDraftTab,
} from "./agentChatWorkspaceHelpers";
import type { HandleSendOptions } from "../hooks/handleSendTypes";
import { markTaskCenterDraftTabRunning } from "./taskCenterDraftTabs";
import type { SoulInteractionCopy } from "@/lib/soul/interactionCopy";
import { logAgentDebug } from "@/lib/agentDebug";
import { applyHomeHotpathPendingShell } from "./homeHotpathPendingShell";

type TaskCenterDraftSendExecutionStrategy = NonNullable<
  TaskCenterDraftSendRequest["sendExecutionStrategy"]
>;

function isTemporaryDraftSendRequestId(value: string): boolean {
  return value.startsWith("draft-send-");
}

function resolveNonMaterializedReadySessionId(
  request: TaskCenterDraftSendRequest,
  currentSessionId?: string | null,
): string | null {
  const activeSessionId = currentSessionId?.trim();
  if (activeSessionId) {
    return activeSessionId;
  }

  const requestSessionId = request.draftTabId.trim();
  return requestSessionId && !isTemporaryDraftSendRequestId(requestSessionId)
    ? requestSessionId
    : null;
}

function flushHomePendingPreviewShell(apply: () => void): void {
  flushSync(apply);
}

interface UseTaskCenterHomePendingPreviewRuntimeParams {
  homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
  displayMessagesLength: number;
  executionStrategy: TaskCenterDraftSendExecutionStrategy;
  workspaceId?: string | null;
  soulCopy?: SoulInteractionCopy;
}

interface UseTaskCenterDraftSendDispatchRuntimeParams {
  taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
  setTaskCenterDraftSendRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  setHomePendingPreviewRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  messagesLength: number;
  displayMessagesLength?: number;
  currentSessionId?: string | null;
  materializedSessionIdsRef: MutableRefObject<Map<string, string>>;
  prewarmedDraftSessionIdsRef?: MutableRefObject<Set<string>>;
  materializeDraftTab: (
    draftTabId: string,
    options: { reason: "send"; commit: false },
  ) => Promise<string | null>;
  commitMaterializedDraftTab: (
    draftTabId: string,
    newSessionId: string,
    options?: {
      embedHomeSession?: boolean;
      hydrateSession?: boolean;
      preserveInput?: boolean;
      syncRoute?: boolean;
    },
  ) => void;
  onNonMaterializedSessionReady?: (
    sessionId: string,
    options?: { sourceDraftTabId?: string | null },
  ) => void;
  restoreInput?: (value: string) => void;
  sendRef: MutableRefObject<WorkspaceHandleSend>;
  workspaceId?: string | null;
}

interface UseTaskCenterEmptyStateSendRuntimeParams {
  agentEntry: string;
  input: string;
  setInput: (value: string) => void;
  activeSessionIdRef?: MutableRefObject<string | null>;
  activeDraftTabIdRef: MutableRefObject<string | null>;
  clearMessages: (options?: { showToast?: boolean }) => void;
  displayMessagesLength: number;
  turnsLength: number;
  threadItemsLength: number;
  hasDisplayMessages: boolean;
  handleSend: WorkspaceHandleSend;
  sessionId?: string | null;
  taskCenterWorkspaceId?: string | null;
  setTaskCenterDraftTabs: Dispatch<SetStateAction<TaskCenterDraftTab[]>>;
  setTaskCenterDraftSendRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
  setHomePendingPreviewRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  materializedSessionIdsRef?: MutableRefObject<Map<string, string>>;
  prewarmedDraftSessionIdsRef?: MutableRefObject<Set<string>>;
  onNonMaterializedSessionReady?: (
    sessionId: string,
    options?: { sourceDraftTabId?: string | null },
  ) => void;
}

export function useTaskCenterHomePendingPreviewRuntime({
  homePendingPreviewRequest,
  displayMessagesLength,
  executionStrategy,
  workspaceId,
  soulCopy,
}: UseTaskCenterHomePendingPreviewRuntimeParams): {
  homePendingPreviewMessages: Message[];
  isHomePendingPreviewActive: boolean;
} {
  const committedRequestIdsRef = useRef<Set<string>>(new Set());
  const paintedRequestIdsRef = useRef<Set<string>>(new Set());
  const shouldRenderPendingPreview =
    Boolean(homePendingPreviewRequest) &&
    (!homePendingPreviewRequest?.sessionReady || displayMessagesLength === 0);
  const homePendingPreviewMessages = useMemo(
    () =>
      homePendingPreviewRequest && shouldRenderPendingPreview
        ? buildHomePendingPreviewMessages(
            homePendingPreviewRequest,
            executionStrategy,
            soulCopy,
          )
        : [],
    [
      executionStrategy,
      homePendingPreviewRequest,
      shouldRenderPendingPreview,
      soulCopy,
    ],
  );

  useLayoutEffect(() => {
    if (
      !homePendingPreviewRequest ||
      homePendingPreviewMessages.length === 0 ||
      committedRequestIdsRef.current.has(homePendingPreviewRequest.id)
    ) {
      return;
    }

    const request = homePendingPreviewRequest;
    committedRequestIdsRef.current.add(request.id);
    recordAgentUiPerformanceMetric("homeInput.pendingPreviewCommitted", {
      durationMs: Date.now() - request.submittedAt,
      requestId: request.id,
      sessionId: request.draftTabId,
      source: request.source,
      workspaceId: workspaceId ?? null,
    });
  }, [
    homePendingPreviewMessages.length,
    homePendingPreviewRequest,
    workspaceId,
  ]);

  useEffect(() => {
    if (
      !homePendingPreviewRequest ||
      homePendingPreviewMessages.length === 0 ||
      paintedRequestIdsRef.current.has(homePendingPreviewRequest.id)
    ) {
      return;
    }

    const request = homePendingPreviewRequest;
    paintedRequestIdsRef.current.add(request.id);
    return scheduleAfterNextPaint(() => {
      recordAgentUiPerformanceMetric("homeInput.pendingPreviewPaint", {
        durationMs: Date.now() - request.submittedAt,
        requestId: request.id,
        sessionId: request.draftTabId,
        source: request.source,
        workspaceId: workspaceId ?? null,
      });
    });
  }, [
    homePendingPreviewMessages.length,
    homePendingPreviewRequest,
    workspaceId,
  ]);

  return {
    homePendingPreviewMessages,
    isHomePendingPreviewActive: homePendingPreviewMessages.length > 0,
  };
}

export function useTaskCenterEmptyStateSendRuntime({
  agentEntry,
  input,
  setInput,
  activeSessionIdRef,
  activeDraftTabIdRef,
  clearMessages,
  displayMessagesLength,
  turnsLength,
  threadItemsLength,
  hasDisplayMessages,
  handleSend,
  sessionId,
  taskCenterWorkspaceId,
  setTaskCenterDraftTabs,
  setTaskCenterDraftSendRequest,
  taskCenterDraftSendRequest,
  setHomePendingPreviewRequest,
  materializedSessionIdsRef,
  prewarmedDraftSessionIdsRef,
  onNonMaterializedSessionReady,
}: UseTaskCenterEmptyStateSendRuntimeParams): InputbarSendHandler {
  const homeSendInFlightRef = useRef(false);

  useEffect(() => {
    if (!taskCenterDraftSendRequest) {
      homeSendInFlightRef.current = false;
    }
  }, [taskCenterDraftSendRequest]);

  return useCallback<InputbarSendHandler>(
    (payload = {}) => {
      const handlerEnteredAt = Date.now();
      const triggeredAt =
        typeof payload.triggeredAt === "number" &&
        Number.isFinite(payload.triggeredAt)
          ? payload.triggeredAt
          : handlerEnteredAt;
      const triggerSource = payload.triggerSource ?? "adapter";
      if (homeSendInFlightRef.current || taskCenterDraftSendRequest) {
        logAgentDebug("AgentChatPage", "homeInput.submit.blocked", {
          hasPendingRequest: Boolean(taskCenterDraftSendRequest),
          homeSendInFlight: homeSendInFlightRef.current,
          source: "empty-state",
          triggerSource,
          workspaceId: taskCenterWorkspaceId,
        });
        return false;
      }

      const text = payload.textOverride ?? input;
      const images = payload.images ?? [];
      const sendOptions = payload.sendOptions;
      const normalizedText = text.trim();
      const activeDraftTabId = activeDraftTabIdRef.current;
      if (
        (agentEntry === "claw" || agentEntry === "new-task") &&
        activeDraftTabId
      ) {
        homeSendInFlightRef.current = true;
        const submittedAt = triggeredAt;
        const requestId = createTaskCenterDraftSendRequestId();
        const tracedSendOptions: HandleSendOptions = {
          ...(sendOptions || {}),
          skipWorkspaceCommandRouting: true,
          skipSessionRestore: true,
          skipSessionStartHooks: true,
          skipPreSubmitResume: true,
          requestMetadata: mergeAgentUiPerformanceTraceMetadata(
            sendOptions?.requestMetadata,
            {
              requestId,
              sessionId: null,
              source: "task-center-empty-state",
              submittedAt,
              workspaceId: taskCenterWorkspaceId ?? null,
            },
          ),
        };
        const shouldUseMaterializedDraftDispatch =
          materializedSessionIdsRef?.current.has(activeDraftTabId) ||
          prewarmedDraftSessionIdsRef?.current.has(activeDraftTabId) ||
          false;
        recordAgentUiPerformanceMetric("homeInput.submit", {
          hasDraftTab: true,
          inputbarHandlerToHomeSubmitMs: Math.max(
            0,
            Date.now() - handlerEnteredAt,
          ),
          inputLength: normalizedText.length,
          requestId,
          sessionId: activeDraftTabId,
          source: "task-center-empty-state",
          triggerToHomeSubmitMs: Math.max(0, Date.now() - triggeredAt),
          triggerSource,
          workspaceId: taskCenterWorkspaceId,
        });
        const request: TaskCenterDraftSendRequest = {
          id: requestId,
          draftTabId: shouldUseMaterializedDraftDispatch
            ? activeDraftTabId
            : requestId,
          text,
          images,
          sendOptions: tracedSendOptions,
          submittedAt,
          materializeDraft: shouldUseMaterializedDraftDispatch,
          dispatchState: shouldUseMaterializedDraftDispatch
            ? undefined
            : "dispatched",
          source: "task-center-empty-state",
          triggerSource,
        };
        const pendingShell = applyHomeHotpathPendingShell({
          requestId,
          text,
        });
        flushHomePendingPreviewShell(() => {
          setInput("");
          if (
            displayMessagesLength > 0 ||
            turnsLength > 0 ||
            threadItemsLength > 0
          ) {
            clearMessages({ showToast: false });
          }
          setTaskCenterDraftSendRequest(request);
          setHomePendingPreviewRequest(request);
        });
        pendingShell.refresh();
        if (request.materializeDraft) {
          recordAgentUiPerformanceMetric("homeInput.pendingShellApplied", {
            durationMs: Date.now() - submittedAt,
            requestId,
            sessionId: activeDraftTabId,
            source: "task-center-empty-state",
            workspaceId: taskCenterWorkspaceId,
          });
          return;
        }

        scheduleAfterNextPaint(() => {
          setTaskCenterDraftTabs((current) =>
            markTaskCenterDraftTabRunning({
              current,
              draftTabId: activeDraftTabId,
              title: resolveTaskCenterDraftSendTitle(text),
            }),
          );
          recordAgentUiPerformanceMetric("homeInput.sendDispatch.start", {
            elapsedMs: Date.now() - submittedAt,
            requestId,
            sessionId: null,
            source: "task-center-empty-state",
            workspaceId: taskCenterWorkspaceId ?? null,
          });
          void handleSend(
            images,
            undefined,
            undefined,
            text,
            undefined,
            undefined,
            tracedSendOptions,
          ).then(
            (result) => {
              recordAgentUiPerformanceMetric("homeInput.sendDispatch.done", {
                durationMs: Date.now() - submittedAt,
                requestId,
                result,
                sessionId: null,
                source: "task-center-empty-state",
                workspaceId: taskCenterWorkspaceId ?? null,
              });
              if (result !== true) {
                pendingShell.clear(true);
                setInput(text);
                setHomePendingPreviewRequest((current) =>
                  current?.id === requestId ? null : current,
                );
              } else {
                const readySessionId =
                  activeSessionIdRef?.current?.trim() || null;
                if (readySessionId) {
                  onNonMaterializedSessionReady?.(readySessionId, {
                    sourceDraftTabId: activeDraftTabId,
                  });
                  setHomePendingPreviewRequest((current) =>
                    current?.id === requestId
                      ? {
                          ...current,
                          draftTabId: readySessionId,
                          sessionReady: true,
                        }
                      : current,
                  );
                }
              }
              setTaskCenterDraftSendRequest((current) =>
                current?.id === requestId ? null : current,
              );
              homeSendInFlightRef.current = false;
            },
            (error) => {
              recordAgentUiPerformanceMetric("homeInput.sendDispatch.error", {
                durationMs: Date.now() - submittedAt,
                error: error instanceof Error ? error.message : String(error),
                requestId,
                sessionId: null,
                source: "task-center-empty-state",
                workspaceId: taskCenterWorkspaceId ?? null,
              });
              pendingShell.clear(true);
              setInput(text);
              setTaskCenterDraftSendRequest((current) =>
                current?.id === requestId ? null : current,
              );
              setHomePendingPreviewRequest((current) =>
                current?.id === requestId ? null : current,
              );
              homeSendInFlightRef.current = false;
            },
          );
        });
        recordAgentUiPerformanceMetric("homeInput.pendingShellApplied", {
          durationMs: Date.now() - submittedAt,
          requestId,
          sessionId: activeDraftTabId,
          source: "task-center-empty-state",
          workspaceId: taskCenterWorkspaceId,
        });
        return;
      }

      const shouldQueueHomeSend =
        !hasDisplayMessages &&
        (agentEntry === "claw" || agentEntry === "new-task");
      if (shouldQueueHomeSend) {
        homeSendInFlightRef.current = true;
        const submittedAt = triggeredAt;
        const requestId = createTaskCenterDraftSendRequestId();
        const existingSessionId = sessionId?.trim() || null;
        recordAgentUiPerformanceMetric("homeInput.submit", {
          hasDraftTab: false,
          inputbarHandlerToHomeSubmitMs: Math.max(
            0,
            Date.now() - handlerEnteredAt,
          ),
          inputLength: normalizedText.length,
          requestId,
          sessionId: existingSessionId,
          source: "empty-state",
          triggerToHomeSubmitMs: Math.max(0, Date.now() - triggeredAt),
          triggerSource,
          workspaceId: taskCenterWorkspaceId,
        });
        if (!existingSessionId) {
          const tracedSendOptions: HandleSendOptions = {
            ...(sendOptions || {}),
            skipWorkspaceCommandRouting: true,
            skipSessionRestore: true,
            skipSessionStartHooks: true,
            skipPreSubmitResume: true,
            requestMetadata: mergeAgentUiPerformanceTraceMetadata(
              sendOptions?.requestMetadata,
              {
                requestId,
                sessionId: null,
                source: "empty-state",
                submittedAt,
                workspaceId: taskCenterWorkspaceId ?? null,
              },
            ),
          };
          const previewRequest: TaskCenterDraftSendRequest = {
            id: requestId,
            draftTabId: requestId,
            text,
            images,
            sendOptions: tracedSendOptions,
            submittedAt,
            materializeDraft: false,
            dispatchState: "dispatched",
            source: "empty-state",
            triggerSource,
          };
          const pendingShell = applyHomeHotpathPendingShell({
            requestId,
            text,
          });
          flushHomePendingPreviewShell(() => {
            setInput("");
            setTaskCenterDraftSendRequest(previewRequest);
            setHomePendingPreviewRequest(previewRequest);
          });
          pendingShell.refresh();
          recordAgentUiPerformanceMetric("homeInput.pendingShellApplied", {
            durationMs: Date.now() - submittedAt,
            requestId,
            sessionId: null,
            source: "empty-state",
            workspaceId: taskCenterWorkspaceId,
          });
          logAgentDebug("AgentChatPage", "homeInput.directDispatch.start", {
            requestId,
            source: "empty-state",
            workspaceId: taskCenterWorkspaceId,
          });
          scheduleAfterNextPaint(() => {
            recordAgentUiPerformanceMetric("homeInput.sendDispatch.start", {
              elapsedMs: Date.now() - submittedAt,
              requestId,
              sessionId: null,
              source: "empty-state",
              workspaceId: taskCenterWorkspaceId ?? null,
            });
            void handleSend(
              images,
              undefined,
              undefined,
              text,
              undefined,
              undefined,
              tracedSendOptions,
            ).then(
              (result) => {
                recordAgentUiPerformanceMetric("homeInput.sendDispatch.done", {
                  durationMs: Date.now() - submittedAt,
                  requestId,
                  result,
                  sessionId: null,
                  source: "empty-state",
                  workspaceId: taskCenterWorkspaceId ?? null,
                });
                logAgentDebug(
                  "AgentChatPage",
                  "homeInput.directDispatch.done",
                  {
                    requestId,
                    result,
                    source: "empty-state",
                    workspaceId: taskCenterWorkspaceId,
                  },
                );
                if (result !== true) {
                  pendingShell.clear(true);
                  setInput(text);
                  setHomePendingPreviewRequest((current) =>
                    current?.id === requestId ? null : current,
                  );
                } else {
                  const readySessionId =
                    activeSessionIdRef?.current?.trim() || null;
                  if (readySessionId) {
                    onNonMaterializedSessionReady?.(readySessionId);
                    setHomePendingPreviewRequest((current) =>
                      current?.id === requestId
                        ? {
                            ...current,
                            draftTabId: readySessionId,
                            sessionReady: true,
                          }
                        : current,
                    );
                  }
                }
                setTaskCenterDraftSendRequest((current) =>
                  current?.id === requestId ? null : current,
                );
                homeSendInFlightRef.current = false;
              },
              (error) => {
                recordAgentUiPerformanceMetric("homeInput.sendDispatch.error", {
                  durationMs: Date.now() - submittedAt,
                  error: error instanceof Error ? error.message : String(error),
                  requestId,
                  sessionId: null,
                  source: "empty-state",
                  workspaceId: taskCenterWorkspaceId ?? null,
                });
                logAgentDebug(
                  "AgentChatPage",
                  "homeInput.directDispatch.error",
                  {
                    error,
                    requestId,
                    source: "empty-state",
                    workspaceId: taskCenterWorkspaceId,
                  },
                  { level: "error" },
                );
                pendingShell.clear(true);
                setInput(text);
                setTaskCenterDraftSendRequest((current) =>
                  current?.id === requestId ? null : current,
                );
                setHomePendingPreviewRequest((current) =>
                  current?.id === requestId ? null : current,
                );
                homeSendInFlightRef.current = false;
              },
            );
          });
          return;
        }
        const tracedSendOptions: HandleSendOptions = {
          ...(sendOptions || {}),
          skipWorkspaceCommandRouting: true,
          skipSessionRestore: true,
          skipSessionStartHooks: true,
          skipPreSubmitResume: true,
          requestMetadata: mergeAgentUiPerformanceTraceMetadata(
            sendOptions?.requestMetadata,
            {
              requestId,
              sessionId: existingSessionId,
              source: "empty-state",
              submittedAt,
              workspaceId: taskCenterWorkspaceId ?? null,
            },
          ),
        };
        const previewRequest: TaskCenterDraftSendRequest = {
          id: requestId,
          draftTabId: existingSessionId,
          text,
          images,
          sendOptions: tracedSendOptions,
          submittedAt,
          materializeDraft: false,
          dispatchState: "dispatched",
          source: "empty-state",
          triggerSource,
        };
        const pendingShell = applyHomeHotpathPendingShell({
          requestId,
          text,
        });
        flushHomePendingPreviewShell(() => {
          setInput("");
          setTaskCenterDraftSendRequest(previewRequest);
          setHomePendingPreviewRequest(previewRequest);
        });
        pendingShell.refresh();
        recordAgentUiPerformanceMetric("homeInput.pendingShellApplied", {
          durationMs: Date.now() - submittedAt,
          requestId,
          sessionId: existingSessionId,
          source: "empty-state",
          workspaceId: taskCenterWorkspaceId,
        });
        scheduleAfterNextPaint(() => {
          recordAgentUiPerformanceMetric("homeInput.sendDispatch.start", {
            elapsedMs: Date.now() - submittedAt,
            requestId,
            sessionId: existingSessionId,
            source: "empty-state",
            workspaceId: taskCenterWorkspaceId ?? null,
          });
          void handleSend(
            images,
            undefined,
            undefined,
            text,
            undefined,
            undefined,
            tracedSendOptions,
          ).then(
            (result) => {
              recordAgentUiPerformanceMetric("homeInput.sendDispatch.done", {
                durationMs: Date.now() - submittedAt,
                requestId,
                result,
                sessionId: existingSessionId,
                source: "empty-state",
                workspaceId: taskCenterWorkspaceId ?? null,
              });
              if (result !== true) {
                pendingShell.clear(true);
                setInput(text);
                setHomePendingPreviewRequest((current) =>
                  current?.id === requestId ? null : current,
                );
              }
              setTaskCenterDraftSendRequest((current) =>
                current?.id === requestId ? null : current,
              );
              homeSendInFlightRef.current = false;
            },
            (error) => {
              recordAgentUiPerformanceMetric("homeInput.sendDispatch.error", {
                durationMs: Date.now() - submittedAt,
                error: error instanceof Error ? error.message : String(error),
                requestId,
                sessionId: existingSessionId,
                source: "empty-state",
                workspaceId: taskCenterWorkspaceId ?? null,
              });
              pendingShell.clear(true);
              setInput(text);
              setTaskCenterDraftSendRequest((current) =>
                current?.id === requestId ? null : current,
              );
              setHomePendingPreviewRequest((current) =>
                current?.id === requestId ? null : current,
              );
              homeSendInFlightRef.current = false;
            },
          );
        });
        return;
      }

      recordAgentUiPerformanceMetric("homeInput.submit", {
        hasDraftTab: false,
        inputbarHandlerToHomeSubmitMs: Math.max(
          0,
          Date.now() - handlerEnteredAt,
        ),
        inputLength: normalizedText.length,
        sessionId: sessionId ?? null,
        source: "empty-state",
        triggerToHomeSubmitMs: Math.max(0, Date.now() - triggeredAt),
        triggerSource,
        workspaceId: taskCenterWorkspaceId,
      });
      void handleSend(
        images,
        undefined,
        undefined,
        text,
        undefined,
        undefined,
        sendOptions,
      );
    },
    [
      activeDraftTabIdRef,
      activeSessionIdRef,
      agentEntry,
      clearMessages,
      displayMessagesLength,
      handleSend,
      hasDisplayMessages,
      input,
      materializedSessionIdsRef,
      sessionId,
      onNonMaterializedSessionReady,
      prewarmedDraftSessionIdsRef,
      setHomePendingPreviewRequest,
      setInput,
      setTaskCenterDraftSendRequest,
      setTaskCenterDraftTabs,
      taskCenterDraftSendRequest,
      taskCenterWorkspaceId,
      threadItemsLength,
      turnsLength,
    ],
  );
}

export function useTaskCenterDraftSendDispatchRuntime({
  taskCenterDraftSendRequest,
  setTaskCenterDraftSendRequest,
  setHomePendingPreviewRequest,
  messagesLength,
  displayMessagesLength = messagesLength,
  currentSessionId,
  materializedSessionIdsRef,
  prewarmedDraftSessionIdsRef,
  materializeDraftTab,
  commitMaterializedDraftTab,
  onNonMaterializedSessionReady,
  restoreInput,
  sendRef,
  workspaceId,
}: UseTaskCenterDraftSendDispatchRuntimeParams): void {
  const messageCountsRef = useRef({ displayMessagesLength, messagesLength });
  const latestDispatchContextRef = useRef({
    currentSessionId,
    taskCenterDraftSendRequest,
    workspaceId,
  });
  const mountedRef = useRef(true);
  const dispatchedRequestIdsRef = useRef<Set<string>>(new Set());
  const scheduledRequestIdsRef = useRef<Set<string>>(new Set());

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    latestDispatchContextRef.current = {
      currentSessionId,
      taskCenterDraftSendRequest,
      workspaceId,
    };
  }, [currentSessionId, taskCenterDraftSendRequest, workspaceId]);

  useEffect(() => {
    messageCountsRef.current = { displayMessagesLength, messagesLength };
  }, [displayMessagesLength, messagesLength]);

  useEffect(() => {
    if (
      !taskCenterDraftSendRequest &&
      dispatchedRequestIdsRef.current.size > 20
    ) {
      dispatchedRequestIdsRef.current.clear();
    }
  }, [taskCenterDraftSendRequest]);

  useEffect(() => {
    if (
      !taskCenterDraftSendRequest ||
      taskCenterDraftSendRequest.materializeDraft
    ) {
      return;
    }

    const readySessionId = resolveNonMaterializedReadySessionId(
      taskCenterDraftSendRequest,
      currentSessionId,
    );
    if (!readySessionId) {
      return;
    }
    if (
      taskCenterDraftSendRequest.sessionReady &&
      taskCenterDraftSendRequest.draftTabId === readySessionId
    ) {
      return;
    }

    onNonMaterializedSessionReady?.(readySessionId);
    setTaskCenterDraftSendRequest((current) =>
      current?.id === taskCenterDraftSendRequest.id
        ? {
            ...current,
            draftTabId: readySessionId,
            sessionReady: true,
          }
        : current,
    );
    setHomePendingPreviewRequest((current) =>
      current?.id === taskCenterDraftSendRequest.id
        ? {
            ...current,
            draftTabId: readySessionId,
            sessionReady: true,
          }
        : current,
    );
  }, [
    currentSessionId,
    onNonMaterializedSessionReady,
    setHomePendingPreviewRequest,
    setTaskCenterDraftSendRequest,
    taskCenterDraftSendRequest,
  ]);

  useEffect(() => {
    if (
      messagesLength === 0 ||
      !taskCenterDraftSendRequest ||
      taskCenterDraftSendRequest.materializeDraft
    ) {
      return;
    }

    setTaskCenterDraftSendRequest((current) => {
      if (
        !current ||
        current.materializeDraft ||
        current.id !== taskCenterDraftSendRequest.id
      ) {
        return current;
      }
      const readySessionId = resolveNonMaterializedReadySessionId(
        current,
        currentSessionId,
      );
      if (!readySessionId) {
        return current;
      }
      if (!current.sessionReady || current.draftTabId !== readySessionId) {
        onNonMaterializedSessionReady?.(readySessionId);
      }
      return null;
    });
    setHomePendingPreviewRequest(null);
  }, [
    displayMessagesLength,
    currentSessionId,
    messagesLength,
    onNonMaterializedSessionReady,
    setHomePendingPreviewRequest,
    setTaskCenterDraftSendRequest,
    taskCenterDraftSendRequest,
  ]);

  useEffect(() => {
    if (!taskCenterDraftSendRequest) {
      return;
    }

    const request = taskCenterDraftSendRequest;
    if (request.dispatchState === "dispatched") {
      return;
    }
    if (
      !request.materializeDraft &&
      !resolveNonMaterializedReadySessionId(request, currentSessionId)
    ) {
      return;
    }
    if (
      dispatchedRequestIdsRef.current.has(request.id) ||
      scheduledRequestIdsRef.current.has(request.id)
    ) {
      return;
    }
    scheduledRequestIdsRef.current.add(request.id);

    scheduleAfterNextPaint(() => {
      scheduledRequestIdsRef.current.delete(request.id);
      if (
        !mountedRef.current ||
        dispatchedRequestIdsRef.current.has(request.id)
      ) {
        return;
      }

      const latestContext = latestDispatchContextRef.current;
      const latestRequest = latestContext.taskCenterDraftSendRequest;
      if (!latestRequest || latestRequest.id !== request.id) {
        return;
      }
      if (latestRequest.dispatchState === "dispatched") {
        return;
      }
      if (
        !latestRequest.materializeDraft &&
        !resolveNonMaterializedReadySessionId(
          latestRequest,
          latestContext.currentSessionId,
        )
      ) {
        return;
      }

      dispatchedRequestIdsRef.current.add(latestRequest.id);
      const dispatchWorkspaceId = latestContext.workspaceId;
      const clearRequest = (options?: { keepHomePreview?: boolean }) => {
        setTaskCenterDraftSendRequest((current) =>
          current?.id === latestRequest.id ? null : current,
        );
        if (!options?.keepHomePreview) {
          setHomePendingPreviewRequest((current) =>
            current?.id === latestRequest.id ? null : current,
          );
        }
        if (latestRequest.materializeDraft) {
          materializedSessionIdsRef.current.delete(latestRequest.draftTabId);
        }
      };

      void (async () => {
        const readyMaterializedSessionId = latestRequest.materializeDraft
          ? (materializedSessionIdsRef.current.get(latestRequest.draftTabId) ??
            null)
          : null;
        const materializedSessionId = latestRequest.materializeDraft
          ? (readyMaterializedSessionId ??
            (await materializeDraftTab(latestRequest.draftTabId, {
              reason: "send",
              commit: false,
            })))
          : null;
        if (latestRequest.materializeDraft && !materializedSessionId) {
          recordAgentUiPerformanceMetric("homeInput.sendDispatch.error", {
            durationMs: Date.now() - latestRequest.submittedAt,
            error: "draft_materialize_failed",
            requestId: latestRequest.id,
            sessionId: latestRequest.draftTabId,
            source: latestRequest.source,
            workspaceId: dispatchWorkspaceId ?? null,
          });
          clearRequest();
          return;
        }

        const dispatchSessionId =
          materializedSessionId ?? latestRequest.draftTabId;
        if (latestRequest.materializeDraft && materializedSessionId) {
          const markMaterializedSessionReady = (
            current: TaskCenterDraftSendRequest | null,
          ) =>
            current?.id === latestRequest.id
              ? {
                  ...current,
                  draftTabId: materializedSessionId,
                  sessionReady: true,
                }
              : current;
          setTaskCenterDraftSendRequest(markMaterializedSessionReady);
          setHomePendingPreviewRequest(markMaterializedSessionReady);
        }
        if (latestRequest.materializeDraft && materializedSessionId) {
          const commitOptions: Parameters<
            typeof commitMaterializedDraftTab
          >[2] = {
            embedHomeSession: false,
            hydrateSession: false,
            preserveInput: false,
            syncRoute: false,
          };
          commitMaterializedDraftTab(
            latestRequest.draftTabId,
            materializedSessionId,
            commitOptions,
          );
        }
        recordAgentUiPerformanceMetric("homeInput.sendDispatch.start", {
          elapsedMs: Date.now() - latestRequest.submittedAt,
          requestId: latestRequest.id,
          sessionId: dispatchSessionId,
          source: latestRequest.source,
          workspaceId: dispatchWorkspaceId ?? null,
        });
        const tracedSendOptions: HandleSendOptions = {
          ...(latestRequest.sendOptions || {}),
          targetSessionId: dispatchSessionId,
          // 首页首发代表“创建新对话”，不要先恢复上次会话，否则会把首字链路拖进旧会话 hydration。
          skipSessionRestore: true,
          // 同一条快路径也不应同步跑项目启动 hooks 或 submit 前队列恢复扫描。
          skipSessionStartHooks: true,
          skipPreSubmitResume: true,
          requestMetadata: bindInputbarThreadGoalMetadata(
            mergeAgentUiPerformanceTraceMetadata(
              latestRequest.sendOptions?.requestMetadata,
              {
                requestId: latestRequest.id,
                sessionId: dispatchSessionId,
                source: latestRequest.source,
                submittedAt: latestRequest.submittedAt,
                workspaceId: dispatchWorkspaceId ?? null,
              },
            ),
            dispatchSessionId,
          ),
        };
        const sendPromise = sendRef.current(
          latestRequest.images,
          undefined,
          undefined,
          latestRequest.text,
          latestRequest.sendExecutionStrategy,
          undefined,
          tracedSendOptions,
        );
        void sendPromise.then(
          (result) => {
            recordAgentUiPerformanceMetric("homeInput.sendDispatch.done", {
              durationMs: Date.now() - latestRequest.submittedAt,
              requestId: latestRequest.id,
              result,
              sessionId: dispatchSessionId,
              source: latestRequest.source,
              workspaceId: dispatchWorkspaceId ?? null,
            });
            if (result !== true) {
              restoreInput?.(latestRequest.text);
            }
            const latestCounts = messageCountsRef.current;
            const latestActiveSessionId =
              latestDispatchContextRef.current.currentSessionId?.trim() ||
              null;
            clearRequest({
              keepHomePreview:
                result === true &&
                (latestCounts.messagesLength === 0 ||
                  (latestRequest.materializeDraft &&
                    latestActiveSessionId !== dispatchSessionId)),
            });
          },
          (error) => {
            recordAgentUiPerformanceMetric("homeInput.sendDispatch.error", {
              durationMs: Date.now() - latestRequest.submittedAt,
              error: error instanceof Error ? error.message : String(error),
              requestId: latestRequest.id,
              sessionId: dispatchSessionId,
              source: latestRequest.source,
              workspaceId: dispatchWorkspaceId ?? null,
            });
            restoreInput?.(latestRequest.text);
            clearRequest();
          },
        );
      })().catch((error) => {
        recordAgentUiPerformanceMetric("homeInput.sendDispatch.error", {
          durationMs: Date.now() - latestRequest.submittedAt,
          error: error instanceof Error ? error.message : String(error),
          requestId: latestRequest.id,
          sessionId: latestRequest.draftTabId,
          source: latestRequest.source,
          workspaceId: dispatchWorkspaceId ?? null,
        });
        if (!latestRequest.materializeDraft) {
          restoreInput?.(latestRequest.text);
        }
        clearRequest();
      });
    });
  }, [
    commitMaterializedDraftTab,
    currentSessionId,
    materializeDraftTab,
    materializedSessionIdsRef,
    prewarmedDraftSessionIdsRef,
    messageCountsRef,
    restoreInput,
    sendRef,
    setHomePendingPreviewRequest,
    setTaskCenterDraftSendRequest,
    taskCenterDraftSendRequest,
    workspaceId,
  ]);
}
