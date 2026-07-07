import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAgentRuntimeToolInventory,
  type AgentRuntimeToolInventory,
} from "@/lib/api/agentRuntime";
import { mcpApi, type McpPrepareRequest } from "@/lib/api/mcp";
import { extractArtifactProtocolPathsFromRecord } from "@/lib/artifact-protocol";
import type {
  GeneralWorkbenchRunState as BackendGeneralWorkbenchRunState,
  GeneralWorkbenchRunTerminalItem,
  GeneralWorkbenchRunTodoItem,
} from "@/lib/api/executionRun";

interface UseWorkspaceHarnessInventoryRuntimeParams {
  enabled: boolean;
  chatMode: "agent" | "general" | "workbench";
  mappedTheme: string;
  harnessPanelVisible: boolean;
  harnessRequestMetadata: Record<string, unknown>;
  isThemeWorkbench: boolean;
  themeWorkbenchRunState: "idle" | "auto_running" | "await_user_decision";
  currentGate: {
    title: string;
    description: string;
  };
  themeWorkbenchBackendRunState: BackendGeneralWorkbenchRunState | null;
  themeWorkbenchActiveQueueItem: GeneralWorkbenchRunTodoItem | null | undefined;
  harnessPendingCount: number;
}

interface PluginMcpTargetProjection {
  prepareRequests?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPluginMcpTargets(
  inventory: AgentRuntimeToolInventory | null,
): PluginMcpTargetProjection[] {
  if (!inventory || !isRecord(inventory)) {
    return [];
  }

  const targets = inventory.plugin_mcp_targets;
  return Array.isArray(targets)
    ? targets.filter(isRecord).map((target) => ({
        prepareRequests: target.prepareRequests,
      }))
    : [];
}

function getCandidateMcpPrepareRequests(
  inventory: AgentRuntimeToolInventory | null,
): McpPrepareRequest[] {
  return getPluginMcpTargets(inventory).flatMap((target) => {
    if (!Array.isArray(target.prepareRequests)) {
      return [];
    }

    return target.prepareRequests.filter(
      (request): request is McpPrepareRequest =>
        isRecord(request) && request.status === "candidate",
    );
  });
}

export function useWorkspaceHarnessInventoryRuntime({
  enabled,
  chatMode,
  mappedTheme,
  harnessPanelVisible,
  harnessRequestMetadata,
  isThemeWorkbench,
  themeWorkbenchRunState,
  currentGate,
  themeWorkbenchBackendRunState,
  themeWorkbenchActiveQueueItem,
  harnessPendingCount,
}: UseWorkspaceHarnessInventoryRuntimeParams) {
  const [toolInventory, setToolInventory] =
    useState<AgentRuntimeToolInventory | null>(null);
  const [toolInventoryLoading, setToolInventoryLoading] = useState(false);
  const [toolInventoryError, setToolInventoryError] = useState<string | null>(
    null,
  );
  const toolInventoryRequestIdRef = useRef(0);
  const [mcpPrepareLoading, setMcpPrepareLoading] = useState(false);
  const [mcpPrepareError, setMcpPrepareError] = useState<string | null>(null);
  const mcpPrepareRequestIdRef = useRef(0);

  const refreshToolInventory = useCallback(async () => {
    if (!enabled || !harnessPanelVisible) {
      setToolInventory(null);
      setToolInventoryLoading(false);
      setToolInventoryError(null);
      setMcpPrepareLoading(false);
      setMcpPrepareError(null);
      return;
    }

    const requestId = toolInventoryRequestIdRef.current + 1;
    toolInventoryRequestIdRef.current = requestId;
    setToolInventoryLoading(true);
    setToolInventoryError(null);

    try {
      const nextInventory = await getAgentRuntimeToolInventory({
        caller: "assistant",
        workbench: chatMode === "workbench",
        browserAssist: mappedTheme === "general",
        metadata: {
          harness: harnessRequestMetadata,
        },
      });

      if (toolInventoryRequestIdRef.current !== requestId) {
        return;
      }

      setToolInventory(nextInventory);
    } catch (error) {
      if (toolInventoryRequestIdRef.current !== requestId) {
        return;
      }

      setToolInventoryError(
        error instanceof Error ? error.message : "读取工具库存失败",
      );
    } finally {
      if (toolInventoryRequestIdRef.current === requestId) {
        setToolInventoryLoading(false);
      }
    }
  }, [
    chatMode,
    enabled,
    harnessPanelVisible,
    harnessRequestMetadata,
    mappedTheme,
  ]);

  useEffect(() => {
    if (enabled && harnessPanelVisible) {
      return;
    }

    toolInventoryRequestIdRef.current += 1;
    mcpPrepareRequestIdRef.current += 1;
    setToolInventory(null);
    setToolInventoryLoading(false);
    setToolInventoryError(null);
    setMcpPrepareLoading(false);
    setMcpPrepareError(null);
  }, [enabled, harnessPanelVisible]);

  useEffect(() => {
    if (!enabled || !harnessPanelVisible) {
      return;
    }

    void refreshToolInventory();
  }, [enabled, harnessPanelVisible, refreshToolInventory]);

  const mcpPrepareCandidateRequests = useMemo(
    () => getCandidateMcpPrepareRequests(toolInventory),
    [toolInventory],
  );

  const prepareMcpTargets = useCallback(async () => {
    if (!enabled || !harnessPanelVisible) {
      return;
    }

    if (mcpPrepareCandidateRequests.length === 0) {
      setMcpPrepareError(null);
      return;
    }

    const requestId = mcpPrepareRequestIdRef.current + 1;
    mcpPrepareRequestIdRef.current = requestId;
    setMcpPrepareLoading(true);
    setMcpPrepareError(null);

    try {
      await mcpApi.executePrepareRequests(mcpPrepareCandidateRequests);
      if (mcpPrepareRequestIdRef.current !== requestId) {
        return;
      }
      await refreshToolInventory();
    } catch (error) {
      if (mcpPrepareRequestIdRef.current !== requestId) {
        return;
      }
      setMcpPrepareError(
        error instanceof Error ? error.message : "准备 MCP 工具失败",
      );
    } finally {
      if (mcpPrepareRequestIdRef.current === requestId) {
        setMcpPrepareLoading(false);
      }
    }
  }, [
    enabled,
    harnessPanelVisible,
    mcpPrepareCandidateRequests,
    refreshToolInventory,
  ]);

  const generalWorkbenchHarnessSummary = useMemo(() => {
    if (!enabled || !isThemeWorkbench) {
      return null;
    }

    const latestTerminal: GeneralWorkbenchRunTerminalItem | null =
      themeWorkbenchBackendRunState?.latest_terminal ?? null;
    const activeRun = themeWorkbenchActiveQueueItem ?? latestTerminal;
    const activeArtifactPaths = extractArtifactProtocolPathsFromRecord(
      themeWorkbenchActiveQueueItem,
    );
    const latestTerminalArtifactPaths =
      extractArtifactProtocolPathsFromRecord(latestTerminal);
    const artifactPaths =
      activeArtifactPaths.length > 0
        ? activeArtifactPaths
        : latestTerminalArtifactPaths;

    return {
      runState: themeWorkbenchRunState,
      stageTitle: currentGate.title,
      stageDescription: currentGate.description,
      runTitle: activeRun?.title || null,
      artifactCount: artifactPaths.length,
      updatedAt:
        themeWorkbenchBackendRunState?.updated_at ||
        latestTerminal?.finished_at ||
        latestTerminal?.started_at ||
        themeWorkbenchActiveQueueItem?.started_at ||
        null,
      pendingCount: harnessPendingCount,
    };
  }, [
    currentGate.description,
    currentGate.title,
    enabled,
    harnessPendingCount,
    isThemeWorkbench,
    themeWorkbenchActiveQueueItem,
    themeWorkbenchBackendRunState?.latest_terminal,
    themeWorkbenchBackendRunState?.updated_at,
    themeWorkbenchRunState,
  ]);

  return {
    toolInventory,
    toolInventoryLoading,
    toolInventoryError,
    refreshToolInventory,
    mcpPrepareCandidateCount: mcpPrepareCandidateRequests.length,
    mcpPrepareLoading,
    mcpPrepareError,
    prepareMcpTargets,
    generalWorkbenchHarnessSummary,
  };
}
