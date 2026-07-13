import { useCallback, useState } from "react";
import type { AgentInitialInputCapabilityParams } from "@/types/page";
import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import { logAgentDebug } from "@/lib/agentDebug";
import type { CanvasWorkbenchLayoutMode } from "../components/CanvasWorkbenchLayout";
import type { CreationMode } from "../components/types";
import type { InterruptedInputRestoreRequest } from "../hooks/agentStreamInputRestoreTypes";

interface UseAgentChatWorkspaceLocalDisplayStateParams {
  defaultTopicSidebarVisible: boolean;
  entryBannerMessage?: string;
  initialCreationMode?: CreationMode;
  normalizedEntryTheme: string;
  shouldBootstrapCanvasOnEntry: boolean;
}

/** Workspace 私有显示状态；不承载 runtime、read model 或会话真值。 */
export function useAgentChatWorkspaceLocalDisplayState({
  defaultTopicSidebarVisible,
  entryBannerMessage,
  initialCreationMode,
  normalizedEntryTheme,
  shouldBootstrapCanvasOnEntry,
}: UseAgentChatWorkspaceLocalDisplayStateParams) {
  const [showSidebar, setShowSidebar] = useState(
    () => defaultTopicSidebarVisible,
  );
  const [input, setInput] = useState("");
  const [inputRestoreRequest, setInputRestoreRequest] =
    useState<InterruptedInputRestoreRequest | null>(null);
  const [runtimeInitialInputCapability, setRuntimeInitialInputCapability] =
    useState<AgentInitialInputCapabilityParams>();
  const [runtimeEntryBannerMessage, setRuntimeEntryBannerMessage] = useState<
    string | null
  >(null);
  const [selectedText, setSelectedText] = useState("");
  const effectiveEntryBannerMessage =
    runtimeEntryBannerMessage?.trim() || entryBannerMessage;
  const [entryBannerVisible, setEntryBannerVisible] = useState(
    Boolean(effectiveEntryBannerMessage),
  );
  const [activeTheme, setActiveTheme] = useState(normalizedEntryTheme);
  const [creationMode, setCreationMode] = useState<CreationMode>(
    initialCreationMode ?? "guided",
  );
  const [inputbarObjectiveModeEnabled, setInputbarObjectiveModeEnabled] =
    useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    shouldBootstrapCanvasOnEntry ? "canvas" : "chat",
  );
  const [expertInfoPanelCollapsed, setExpertInfoPanelCollapsed] = useState(
    () => layoutMode !== "chat",
  );
  const [artifactPreviewSize, setArtifactPreviewSize] = useState<
    "mobile" | "tablet" | "desktop"
  >("desktop");
  const [canvasWorkbenchLayoutMode, setCanvasWorkbenchLayoutMode] =
    useState<CanvasWorkbenchLayoutMode>("split");

  const handleRestoreInterruptedInput = useCallback(
    (request: InterruptedInputRestoreRequest) => {
      logAgentDebug("AgentChatWorkspace", "inputRestoreRequest.received", {
        draftImageCount: request.draft.images?.length ?? 0,
        draftPathReferenceCount: request.draft.pathReferences?.length ?? 0,
        draftTextLength: request.draft.text.trim().length,
        hasCapabilityRoute: Boolean(request.draft.inputCapabilityRoute),
        reason: request.reason,
        requestId: request.requestId,
      });
      setInputRestoreRequest(request);
    },
    [],
  );
  const handleInputRestoreRequestHandled = useCallback((requestId: string) => {
    setInputRestoreRequest((current) =>
      current?.requestId === requestId ? null : current,
    );
  }, []);
  const handleCollapseTopicSidebarForFileManager = useCallback(() => {
    setShowSidebar(false);
  }, []);

  return {
    activeTheme,
    artifactPreviewSize,
    canvasWorkbenchLayoutMode,
    creationMode,
    effectiveEntryBannerMessage,
    entryBannerVisible,
    expertInfoPanelCollapsed,
    handleCollapseTopicSidebarForFileManager,
    handleInputRestoreRequestHandled,
    handleRestoreInterruptedInput,
    input,
    inputbarObjectiveModeEnabled,
    inputRestoreRequest,
    layoutMode,
    runtimeInitialInputCapability,
    selectedText,
    setActiveTheme,
    setArtifactPreviewSize,
    setCanvasWorkbenchLayoutMode,
    setCreationMode,
    setEntryBannerVisible,
    setExpertInfoPanelCollapsed,
    setInput,
    setInputbarObjectiveModeEnabled,
    setLayoutMode,
    setRuntimeEntryBannerMessage,
    setRuntimeInitialInputCapability,
    setSelectedText,
    setShowSidebar,
    showSidebar,
  };
}
