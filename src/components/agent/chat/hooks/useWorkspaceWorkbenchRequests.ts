import { useCallback, useMemo, useRef, useState } from "react";

import type {
  CanvasWorkbenchBrowserOpenRequest,
  CanvasWorkbenchPreviewOpenRequest,
} from "../components/CanvasWorkbenchLayout";

export interface CanvasWorkbenchPreviewRequestInput {
  filePath?: string | null;
  selectionKey?: string | null;
}

export interface WorkspaceWorkbenchRequestsController {
  browserWorkbenchOpenRequest: CanvasWorkbenchBrowserOpenRequest | null;
  canvasWorkbenchPreviewOpenRequest: CanvasWorkbenchPreviewOpenRequest | null;
  focusedArtifactBlockId: string | null;
  artifactBlockFocusRequestKey: number;
  focusedTimelineItemId: string | null;
  timelineFocusRequestKey: number;
  requestBrowserWorkbenchOpen: (url: string | null) => void;
  requestCanvasWorkbenchPreviewOpen: (
    request: CanvasWorkbenchPreviewRequestInput,
  ) => void;
  handleBrowserWorkbenchOpenRequestHandled: (
    requestKey: string | number,
  ) => void;
  handleCanvasWorkbenchPreviewOpenRequestHandled: (
    requestKey: string | number,
  ) => void;
  clearFocusedArtifactBlock: () => void;
  focusArtifactBlock: (blockId: string | null | undefined) => void;
  jumpToTimelineItem: (itemId: string | null | undefined) => boolean;
}

export function useWorkspaceWorkbenchRequests(): WorkspaceWorkbenchRequestsController {
  const [browserWorkbenchOpenRequest, setBrowserWorkbenchOpenRequest] =
    useState<CanvasWorkbenchBrowserOpenRequest | null>(null);
  const [
    canvasWorkbenchPreviewOpenRequest,
    setCanvasWorkbenchPreviewOpenRequest,
  ] = useState<CanvasWorkbenchPreviewOpenRequest | null>(null);
  const [focusedArtifactBlockId, setFocusedArtifactBlockId] = useState<
    string | null
  >(null);
  const [artifactBlockFocusRequestKey, setArtifactBlockFocusRequestKey] =
    useState(0);
  const [focusedTimelineItemId, setFocusedTimelineItemId] = useState<
    string | null
  >(null);
  const [timelineFocusRequestKey, setTimelineFocusRequestKey] = useState(0);
  const browserWorkbenchRequestKeyRef = useRef(0);
  const canvasWorkbenchPreviewRequestKeyRef = useRef(0);

  const requestBrowserWorkbenchOpen = useCallback((url: string | null) => {
    browserWorkbenchRequestKeyRef.current += 1;
    setBrowserWorkbenchOpenRequest({
      requestKey: browserWorkbenchRequestKeyRef.current,
      url,
    });
  }, []);

  const requestCanvasWorkbenchPreviewOpen = useCallback(
    (request: CanvasWorkbenchPreviewRequestInput) => {
      canvasWorkbenchPreviewRequestKeyRef.current += 1;
      setCanvasWorkbenchPreviewOpenRequest({
        requestKey: canvasWorkbenchPreviewRequestKeyRef.current,
        filePath: request.filePath || null,
        selectionKey: request.selectionKey || null,
      });
    },
    [],
  );

  const handleBrowserWorkbenchOpenRequestHandled = useCallback(
    (requestKey: string | number) => {
      setBrowserWorkbenchOpenRequest((current) =>
        current?.requestKey === requestKey ? null : current,
      );
    },
    [],
  );

  const handleCanvasWorkbenchPreviewOpenRequestHandled = useCallback(
    (requestKey: string | number) => {
      setCanvasWorkbenchPreviewOpenRequest((current) =>
        current?.requestKey === requestKey ? null : current,
      );
    },
    [],
  );

  const clearFocusedArtifactBlock = useCallback(() => {
    setFocusedArtifactBlockId(null);
  }, []);

  const focusArtifactBlock = useCallback((blockId: string | null | undefined) => {
    const normalizedBlockId = blockId?.trim();
    if (!normalizedBlockId) {
      return;
    }

    setFocusedArtifactBlockId(normalizedBlockId);
    setArtifactBlockFocusRequestKey((current) => current + 1);
  }, []);

  const jumpToTimelineItem = useCallback((itemId: string | null | undefined) => {
    const normalizedItemId = itemId?.trim();
    if (!normalizedItemId) {
      return false;
    }

    setFocusedTimelineItemId(normalizedItemId);
    setTimelineFocusRequestKey((current) => current + 1);
    return true;
  }, []);

  return useMemo(
    () => ({
      browserWorkbenchOpenRequest,
      canvasWorkbenchPreviewOpenRequest,
      focusedArtifactBlockId,
      artifactBlockFocusRequestKey,
      focusedTimelineItemId,
      timelineFocusRequestKey,
      requestBrowserWorkbenchOpen,
      requestCanvasWorkbenchPreviewOpen,
      handleBrowserWorkbenchOpenRequestHandled,
      handleCanvasWorkbenchPreviewOpenRequestHandled,
      clearFocusedArtifactBlock,
      focusArtifactBlock,
      jumpToTimelineItem,
    }),
    [
      artifactBlockFocusRequestKey,
      browserWorkbenchOpenRequest,
      canvasWorkbenchPreviewOpenRequest,
      clearFocusedArtifactBlock,
      focusedArtifactBlockId,
      focusedTimelineItemId,
      focusArtifactBlock,
      handleBrowserWorkbenchOpenRequestHandled,
      handleCanvasWorkbenchPreviewOpenRequestHandled,
      jumpToTimelineItem,
      requestBrowserWorkbenchOpen,
      requestCanvasWorkbenchPreviewOpen,
      timelineFocusRequestKey,
    ],
  );
}
