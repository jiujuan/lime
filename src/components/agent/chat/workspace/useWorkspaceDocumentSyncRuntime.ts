import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { CanvasStateUnion } from "@/components/workspace/canvas/canvasUtils";
import type { GeneralWorkbenchRunTerminalItem } from "@/lib/api/executionRun";
import type { TopicBranchStatus } from "../hooks/useTopicBranchBoard";
import {
  isSyncContentEmpty,
  serializeCanvasStateForSync,
} from "./generalWorkbenchHelpers";

interface LastCanvasSyncRequest {
  contentId: string;
  body: string;
}

interface DocumentVersionStatusMapInput {
  canvasState: CanvasStateUnion | null;
  latestTerminal?: GeneralWorkbenchRunTerminalItem | null;
  previousStatusMap: Record<string, TopicBranchStatus>;
}

interface CanvasContentSyncRequestInput {
  canvasState: CanvasStateUnion | null;
  contentId?: string | null;
  previousRequest?: LastCanvasSyncRequest | null;
}

interface UseWorkspaceDocumentVersionStatusSyncRuntimeParams {
  canvasState: CanvasStateUnion | null;
  isThemeWorkbench: boolean;
  setDocumentVersionStatusMap: Dispatch<
    SetStateAction<Record<string, TopicBranchStatus>>
  >;
  themeWorkbenchLatestTerminal?: GeneralWorkbenchRunTerminalItem | null;
  themeWorkbenchRunState: string;
}

interface UseWorkspaceCanvasContentSyncRuntimeParams {
  canvasState: CanvasStateUnion | null;
  contentId?: string | null;
  lastCanvasSyncRequestRef: MutableRefObject<LastCanvasSyncRequest | null>;
  syncContent: (contentId: string, body: string) => void;
}

export function resolveDocumentVersionStatusMapAfterWorkbenchIdle({
  canvasState,
  latestTerminal,
  previousStatusMap,
}: DocumentVersionStatusMapInput): Record<string, TopicBranchStatus> {
  if (!canvasState || canvasState.type !== "document") {
    return previousStatusMap;
  }

  if (latestTerminal) {
    const terminalVersionId = latestTerminal.run_id;
    const terminalVersionExists = canvasState.versions.some(
      (version) => version.id === terminalVersionId,
    );
    if (terminalVersionExists) {
      const terminalStatus: TopicBranchStatus =
        latestTerminal.status === "success" ? "merged" : "candidate";
      if (previousStatusMap[terminalVersionId] !== terminalStatus) {
        return {
          ...previousStatusMap,
          [terminalVersionId]: terminalStatus,
        };
      }
    }
  }

  const currentVersionId = canvasState.currentVersionId;
  if (
    !currentVersionId ||
    previousStatusMap[currentVersionId] !== "in_progress"
  ) {
    return previousStatusMap;
  }

  return {
    ...previousStatusMap,
    [currentVersionId]: "pending",
  };
}

export function resolveCanvasContentSyncRequest({
  canvasState,
  contentId,
  previousRequest,
}: CanvasContentSyncRequestInput): LastCanvasSyncRequest | null {
  if (!canvasState || !contentId) {
    return null;
  }

  const content = serializeCanvasStateForSync(canvasState);
  if (isSyncContentEmpty(content)) {
    return null;
  }

  if (
    previousRequest?.contentId === contentId &&
    previousRequest.body === content
  ) {
    return null;
  }

  return {
    contentId,
    body: content,
  };
}

export function useWorkspaceDocumentVersionStatusSyncRuntime({
  canvasState,
  isThemeWorkbench,
  setDocumentVersionStatusMap,
  themeWorkbenchLatestTerminal,
  themeWorkbenchRunState,
}: UseWorkspaceDocumentVersionStatusSyncRuntimeParams): void {
  useEffect(() => {
    if (!isThemeWorkbench || themeWorkbenchRunState !== "idle") {
      return;
    }
    if (!canvasState || canvasState.type !== "document") {
      return;
    }

    setDocumentVersionStatusMap((previousStatusMap) =>
      resolveDocumentVersionStatusMapAfterWorkbenchIdle({
        canvasState,
        latestTerminal: themeWorkbenchLatestTerminal ?? null,
        previousStatusMap,
      }),
    );
  }, [
    canvasState,
    isThemeWorkbench,
    setDocumentVersionStatusMap,
    themeWorkbenchLatestTerminal,
    themeWorkbenchRunState,
  ]);
}

export function useWorkspaceCanvasContentSyncRuntime({
  canvasState,
  contentId,
  lastCanvasSyncRequestRef,
  syncContent,
}: UseWorkspaceCanvasContentSyncRuntimeParams): void {
  useEffect(() => {
    try {
      const nextRequest = resolveCanvasContentSyncRequest({
        canvasState,
        contentId,
        previousRequest: lastCanvasSyncRequestRef.current,
      });
      if (!nextRequest) {
        return;
      }

      lastCanvasSyncRequestRef.current = nextRequest;
      syncContent(nextRequest.contentId, nextRequest.body);
    } catch (error) {
      console.error("提取画布内容失败:", error);
    }
  }, [canvasState, contentId, lastCanvasSyncRequestRef, syncContent]);
}
