import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
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
import {
  markTaskCenterDraftTabRunning,
} from "./taskCenterDraftTabs";
import type { SoulInteractionCopy } from "@/lib/soul/interactionCopy";
import { logAgentDebug } from "@/lib/agentDebug";

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

interface UseTaskCenterHomePendingPreviewRuntimeParams {
  homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
  shouldSuppressTaskCenterDraftContent: boolean;
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
  materializeDraftTab: (
    draftTabId: string,
    options: { reason: "send"; commit: false },
  ) => Promise<string | null>;
  commitMaterializedDraftTab: (
    draftTabId: string,
    newSessionId: string,
    options?: { preserveInput?: boolean; syncRoute?: boolean },
  ) => void;
  onNonMaterializedSessionReady?: (sessionId: string) => void;
  restoreInput?: (value: string) => void;
  sendRef: MutableRefObject<WorkspaceHandleSend>;
  workspaceId?: string | null;
}

interface UseTaskCenterEmptyStateSendRuntimeParams {
  agentEntry: string;
  input: string;
  setInput: (value: string) => void;
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
}

export function useTaskCenterHomePendingPreviewRuntime({
  homePendingPreviewRequest,
  shouldSuppressTaskCenterDraftContent,
  displayMessagesLength,
  executionStrategy,
  workspaceId,
  soulCopy,
}: UseTaskCenterHomePendingPreviewRuntimeParams): {
  homePendingPreviewMessages: Message[];
  isHomePendingPreviewActive: boolean;
} {
  const paintedRequestIdsRef = useRef<Set<string>>(new Set());
  const homePendingPreviewMessages = useMemo(
    () =>
      homePendingPreviewRequest &&
      !shouldSuppressTaskCenterDraftContent &&
      displayMessagesLength === 0
        ? buildHomePendingPreviewMessages(
            homePendingPreviewRequest,
            executionStrategy,
            soulCopy,
          )
        : [],
    [
      displayMessagesLength,
      executionStrategy,
      homePendingPreviewRequest,
      soulCopy,
      shouldSuppressTaskCenterDraftContent,
    ],
  );

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
}: UseTaskCenterEmptyStateSendRuntimeParams): InputbarSendHandler {
  const homeSendInFlightRef = useRef(false);

  useEffect(() => {
    if (!taskCenterDraftSendRequest) {
      homeSendInFlightRef.current = false;
    }
  }, [taskCenterDraftSendRequest]);

  return useCallback<InputbarSendHandler>(
    (payload = {}) => {
      if (homeSendInFlightRef.current || taskCenterDraftSendRequest) {
        logAgentDebug("AgentChatPage", "homeInput.submit.blocked", {
          hasPendingRequest: Boolean(taskCenterDraftSendRequest),
          homeSendInFlight: homeSendInFlightRef.current,
          source: "empty-state",
          workspaceId: taskCenterWorkspaceId,
        });
        return false;
      }

      const text = payload.textOverride ?? input;
      const images = payload.images ?? [];
      const sendOptions = payload.sendOptions;
      const normalizedText = text.trim();
      setInput("");
      const activeDraftTabId = activeDraftTabIdRef.current;
      if (
        (agentEntry === "claw" || agentEntry === "new-task") &&
        activeDraftTabId
      ) {
        homeSendInFlightRef.current = true;
        const submittedAt = Date.now();
        const requestId = createTaskCenterDraftSendRequestId();
        recordAgentUiPerformanceMetric("homeInput.submit", {
          hasDraftTab: true,
          inputLength: normalizedText.length,
          requestId,
          sessionId: activeDraftTabId,
          source: "task-center-empty-state",
          workspaceId: taskCenterWorkspaceId,
        });
        if (
          displayMessagesLength > 0 ||
          turnsLength > 0 ||
          threadItemsLength > 0
        ) {
          clearMessages({ showToast: false });
        }
        setTaskCenterDraftTabs((current) =>
          markTaskCenterDraftTabRunning({
            current,
            draftTabId: activeDraftTabId,
            title: resolveTaskCenterDraftSendTitle(text),
          }),
        );
        const request: TaskCenterDraftSendRequest = {
          id: requestId,
          draftTabId: activeDraftTabId,
          text,
          images,
          sendOptions,
          submittedAt,
          materializeDraft: true,
          source: "task-center-empty-state",
        };
        setTaskCenterDraftSendRequest(request);
        setHomePendingPreviewRequest(request);
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
        const submittedAt = Date.now();
        const requestId = createTaskCenterDraftSendRequestId();
        const existingSessionId = sessionId?.trim() || null;
        recordAgentUiPerformanceMetric("homeInput.submit", {
          hasDraftTab: false,
          inputLength: normalizedText.length,
          requestId,
          sessionId: existingSessionId,
          source: "empty-state",
          workspaceId: taskCenterWorkspaceId,
        });
        if (!existingSessionId) {
          const tracedSendOptions: HandleSendOptions = {
            ...(sendOptions || {}),
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
          };
          setTaskCenterDraftSendRequest(previewRequest);
          setHomePendingPreviewRequest(previewRequest);
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
              logAgentDebug("AgentChatPage", "homeInput.directDispatch.done", {
                requestId,
                result,
                source: "empty-state",
                workspaceId: taskCenterWorkspaceId,
              });
              if (result !== true) {
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
          return;
        }
        const tracedSendOptions: HandleSendOptions = {
          ...(sendOptions || {}),
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
        };
        setTaskCenterDraftSendRequest(previewRequest);
        setHomePendingPreviewRequest(previewRequest);
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
        return;
      }

      recordAgentUiPerformanceMetric("homeInput.submit", {
        hasDraftTab: false,
        inputLength: normalizedText.length,
        sessionId: sessionId ?? null,
        source: "empty-state",
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
      agentEntry,
      clearMessages,
      displayMessagesLength,
      handleSend,
      hasDisplayMessages,
      input,
      sessionId,
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
  materializeDraftTab,
  commitMaterializedDraftTab,
  onNonMaterializedSessionReady,
  restoreInput,
  sendRef,
  workspaceId,
}: UseTaskCenterDraftSendDispatchRuntimeParams): void {
  const messageCountsRef = useRef({ displayMessagesLength, messagesLength });
  const dispatchedRequestIdsRef = useRef<Set<string>>(new Set());
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
    if (messagesLength === 0 && displayMessagesLength === 0) {
      return;
    }

    setTaskCenterDraftSendRequest((current) => {
      if (!current || current.materializeDraft) {
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
    if (dispatchedRequestIdsRef.current.has(request.id)) {
      return;
    }
    dispatchedRequestIdsRef.current.add(request.id);

    const clearRequest = (options?: { keepHomePreview?: boolean }) => {
      setTaskCenterDraftSendRequest((current) =>
        current?.id === request.id ? null : current,
      );
      if (!options?.keepHomePreview) {
        setHomePendingPreviewRequest((current) =>
          current?.id === request.id ? null : current,
        );
      }
      if (request.materializeDraft) {
        materializedSessionIdsRef.current.delete(request.draftTabId);
      }
    };
    void (async () => {
      const materializedSessionId = request.materializeDraft
        ? await materializeDraftTab(request.draftTabId, {
            reason: "send",
            commit: false,
          })
        : null;
      if (request.materializeDraft && !materializedSessionId) {
        recordAgentUiPerformanceMetric("homeInput.sendDispatch.error", {
          durationMs: Date.now() - request.submittedAt,
          error: "draft_materialize_failed",
          requestId: request.id,
          sessionId: request.draftTabId,
          source: request.source,
          workspaceId: workspaceId ?? null,
        });
        clearRequest();
        return;
      }

      const dispatchSessionId = materializedSessionId ?? request.draftTabId;
      if (request.materializeDraft && materializedSessionId) {
        commitMaterializedDraftTab(request.draftTabId, materializedSessionId, {
          preserveInput: false,
        });
      }
      recordAgentUiPerformanceMetric("homeInput.sendDispatch.start", {
        elapsedMs: Date.now() - request.submittedAt,
        requestId: request.id,
        sessionId: dispatchSessionId,
        source: request.source,
        workspaceId: workspaceId ?? null,
      });
      const tracedSendOptions: HandleSendOptions = {
        ...(request.sendOptions || {}),
        targetSessionId: dispatchSessionId,
        // 首页首发代表“创建新对话”，不要先恢复上次会话，否则会把首字链路拖进旧会话 hydration。
        skipSessionRestore: true,
        // 同一条快路径也不应同步跑项目启动 hooks 或 submit 前队列恢复扫描。
        skipSessionStartHooks: true,
        skipPreSubmitResume: true,
        requestMetadata: bindInputbarThreadGoalMetadata(
          mergeAgentUiPerformanceTraceMetadata(
            request.sendOptions?.requestMetadata,
            {
              requestId: request.id,
              sessionId: dispatchSessionId,
              source: request.source,
              submittedAt: request.submittedAt,
              workspaceId: workspaceId ?? null,
            },
          ),
          dispatchSessionId,
        ),
      };
      const sendPromise = sendRef.current(
        request.images,
        undefined,
        undefined,
        request.text,
        request.sendExecutionStrategy,
        undefined,
        tracedSendOptions,
      );
      void sendPromise.then(
        (result) => {
          recordAgentUiPerformanceMetric("homeInput.sendDispatch.done", {
            durationMs: Date.now() - request.submittedAt,
            requestId: request.id,
            result,
            sessionId: dispatchSessionId,
            source: request.source,
            workspaceId: workspaceId ?? null,
          });
          if (result !== true) {
            restoreInput?.(request.text);
          }
          const latestCounts = messageCountsRef.current;
          clearRequest({
            keepHomePreview:
              result === true &&
              latestCounts.messagesLength === 0 &&
              latestCounts.displayMessagesLength === 0,
          });
        },
        (error) => {
          recordAgentUiPerformanceMetric("homeInput.sendDispatch.error", {
            durationMs: Date.now() - request.submittedAt,
            error: error instanceof Error ? error.message : String(error),
            requestId: request.id,
            sessionId: dispatchSessionId,
            source: request.source,
            workspaceId: workspaceId ?? null,
          });
          restoreInput?.(request.text);
          clearRequest();
        },
      );
    })().catch((error) => {
      recordAgentUiPerformanceMetric("homeInput.sendDispatch.error", {
        durationMs: Date.now() - request.submittedAt,
        error: error instanceof Error ? error.message : String(error),
        requestId: request.id,
        sessionId: request.draftTabId,
        source: request.source,
        workspaceId: workspaceId ?? null,
      });
      if (!request.materializeDraft) {
        restoreInput?.(request.text);
      }
      clearRequest();
    });
  }, [
    commitMaterializedDraftTab,
    currentSessionId,
    materializeDraftTab,
    materializedSessionIdsRef,
    messageCountsRef,
    restoreInput,
    sendRef,
    setHomePendingPreviewRequest,
    setTaskCenterDraftSendRequest,
    taskCenterDraftSendRequest,
    workspaceId,
  ]);
}
