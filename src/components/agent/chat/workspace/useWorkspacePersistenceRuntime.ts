import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { CanvasStateUnion } from "@/components/workspace/canvas/canvasUtils";
import type { ThemeType } from "@/lib/workspace/workbenchContract";
import { useSessionFiles } from "../hooks/useSessionFiles";
import type { TopicBranchStatus } from "../hooks/useTopicBranchBoard";
import { shouldAutoInitWorkspaceSessionFiles } from "./agentChatWorkspaceHelpers";
import { useWorkspaceGeneralResourceSync } from "./useWorkspaceGeneralResourceSync";
import {
  useWorkspaceCanvasContentSyncRuntime,
  useWorkspaceDocumentVersionStatusSyncRuntime,
} from "./useWorkspaceDocumentSyncRuntime";

interface UseWorkspacePersistenceRuntimeParams {
  activeTheme: string;
  canvasState: CanvasStateUnion | null;
  contentId?: string | null;
  creationMode?: string;
  currentTurnId?: string | null;
  draftSendInFlight: boolean;
  isSending: boolean;
  isThemeWorkbench: boolean;
  lastCanvasSyncRequestRef: MutableRefObject<{
    contentId: string;
    body: string;
  } | null>;
  mappedTheme: ThemeType;
  projectId?: string | null;
  projectRootPath?: string | null;
  queuedTurnCount: number;
  sessionId?: string | null;
  setDocumentVersionStatusMap: Dispatch<
    SetStateAction<Record<string, TopicBranchStatus>>
  >;
  syncContent: (contentId: string, body: string) => void;
  themeWorkbenchLatestTerminal?: Parameters<
    typeof useWorkspaceDocumentVersionStatusSyncRuntime
  >[0]["themeWorkbenchLatestTerminal"];
  themeWorkbenchRunState: string;
}

export function useWorkspacePersistenceRuntime({
  activeTheme,
  canvasState,
  contentId,
  creationMode,
  currentTurnId,
  draftSendInFlight,
  isSending,
  isThemeWorkbench,
  lastCanvasSyncRequestRef,
  mappedTheme,
  projectId,
  projectRootPath,
  queuedTurnCount,
  sessionId,
  setDocumentVersionStatusMap,
  syncContent,
  themeWorkbenchLatestTerminal,
  themeWorkbenchRunState,
}: UseWorkspacePersistenceRuntimeParams) {
  useWorkspaceDocumentVersionStatusSyncRuntime({
    canvasState,
    isThemeWorkbench,
    setDocumentVersionStatusMap,
    themeWorkbenchLatestTerminal,
    themeWorkbenchRunState,
  });

  const sessionFilesRuntime = useSessionFiles({
    sessionId: sessionId ?? null,
    theme: mappedTheme,
    creationMode,
    autoInit: shouldAutoInitWorkspaceSessionFiles({
      sessionId,
      isSending,
      currentTurnId,
      queuedTurnCount,
      draftSendInFlight,
    }),
  });

  const generalResourceSyncRuntime = useWorkspaceGeneralResourceSync({
    activeTheme,
    projectId,
    sessionId,
    projectRootPath,
  });

  useWorkspaceCanvasContentSyncRuntime({
    canvasState,
    contentId,
    lastCanvasSyncRequestRef,
    syncContent,
  });

  return {
    readSessionFile: sessionFilesRuntime.readFile,
    saveSessionFile: sessionFilesRuntime.saveFile,
    sessionFiles: sessionFilesRuntime.files,
    sessionMeta: sessionFilesRuntime.meta,
    syncGeneralArtifactToResource:
      generalResourceSyncRuntime.syncGeneralArtifactToResource,
  };
}

export type WorkspacePersistenceRuntime = ReturnType<
  typeof useWorkspacePersistenceRuntime
>;
