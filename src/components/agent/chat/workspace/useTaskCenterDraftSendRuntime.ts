import {
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
import type { WorkspaceHandleSend } from "./useWorkspaceSendActions";
import { scheduleAfterNextPaint } from "./agentChatWorkspaceHelpers";
import type { HandleSendOptions } from "../hooks/handleSendTypes";

type TaskCenterDraftSendExecutionStrategy = NonNullable<
  TaskCenterDraftSendRequest["sendExecutionStrategy"]
>;

interface UseTaskCenterHomePendingPreviewRuntimeParams {
  homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
  shouldSuppressTaskCenterDraftContent: boolean;
  displayMessagesLength: number;
  executionStrategy: TaskCenterDraftSendExecutionStrategy;
  workspaceId?: string | null;
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
    options?: { preserveInput?: boolean },
  ) => void;
  onNonMaterializedSessionReady?: (sessionId: string) => void;
  sendRef: MutableRefObject<WorkspaceHandleSend>;
  workspaceId?: string | null;
}

export function useTaskCenterHomePendingPreviewRuntime({
  homePendingPreviewRequest,
  shouldSuppressTaskCenterDraftContent,
  displayMessagesLength,
  executionStrategy,
  workspaceId,
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
          )
        : [],
    [
      displayMessagesLength,
      executionStrategy,
      homePendingPreviewRequest,
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
  sendRef,
  workspaceId,
}: UseTaskCenterDraftSendDispatchRuntimeParams): void {
  useEffect(() => {
    if (messagesLength === 0 && displayMessagesLength === 0) {
      return;
    }

    setTaskCenterDraftSendRequest((current) => {
      if (!current || current.materializeDraft) {
        return current;
      }
      const readySessionId =
        currentSessionId?.trim() ||
        (current.draftTabId.startsWith("draft-send-")
          ? ""
          : current.draftTabId.trim());
      if (!readySessionId && current.draftTabId.startsWith("draft-send-")) {
        return current;
      }
      if (readySessionId) {
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
    let cancelled = false;
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
    const cancel = scheduleAfterNextPaint(() => {
      void (async () => {
        if (cancelled) {
          return;
        }

        const materializedSessionId = request.materializeDraft
          ? await materializeDraftTab(request.draftTabId, {
              reason: "send",
              commit: false,
            })
          : null;
        if (cancelled) {
          return;
        }
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
        recordAgentUiPerformanceMetric("homeInput.sendDispatch.start", {
          elapsedMs: Date.now() - request.submittedAt,
          requestId: request.id,
          sessionId: dispatchSessionId,
          source: request.source,
          workspaceId: workspaceId ?? null,
        });
        const tracedSendOptions: HandleSendOptions = {
          ...(request.sendOptions || {}),
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
            if (request.materializeDraft && materializedSessionId) {
              commitMaterializedDraftTab(
                request.draftTabId,
                materializedSessionId,
                { preserveInput: result !== true },
              );
            }
            recordAgentUiPerformanceMetric("homeInput.sendDispatch.done", {
              durationMs: Date.now() - request.submittedAt,
              requestId: request.id,
              result,
              sessionId: dispatchSessionId,
              source: request.source,
              workspaceId: workspaceId ?? null,
            });
            clearRequest({ keepHomePreview: !request.materializeDraft });
          },
          (error) => {
            if (request.materializeDraft && materializedSessionId) {
              commitMaterializedDraftTab(
                request.draftTabId,
                materializedSessionId,
                { preserveInput: true },
              );
            }
            recordAgentUiPerformanceMetric("homeInput.sendDispatch.error", {
              durationMs: Date.now() - request.submittedAt,
              error: error instanceof Error ? error.message : String(error),
              requestId: request.id,
              sessionId: dispatchSessionId,
              source: request.source,
              workspaceId: workspaceId ?? null,
            });
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
        if (!cancelled) {
          clearRequest();
        }
      });
    });

    return () => {
      cancelled = true;
      cancel();
    };
  }, [
    commitMaterializedDraftTab,
    materializeDraftTab,
    materializedSessionIdsRef,
    sendRef,
    setHomePendingPreviewRequest,
    setTaskCenterDraftSendRequest,
    taskCenterDraftSendRequest,
    workspaceId,
  ]);
}
