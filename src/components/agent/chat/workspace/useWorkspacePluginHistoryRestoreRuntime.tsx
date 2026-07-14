import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime/sessionTypes";
import type { Artifact } from "@/lib/artifact/types";
import { WorkspacePluginHistoryRestoreLandingCard } from "./WorkspacePluginHistoryRestoreLandingCard";
import {
  buildWorkspacePluginHistoryRestoreArtifactPreviewArtifact,
  buildWorkspacePluginHistoryRestoreArtifactPreviewItems,
  type WorkspacePluginHistoryRestoreArtifactPreviewItem,
} from "./workspacePluginHistoryRestoreArtifacts";
import { buildWorkspacePluginHistoryRestoreLandingModel } from "./workspacePluginHistoryRestoreLanding";
import {
  buildWorkspacePluginHistoryRestoreProjection,
  hasWorkspacePluginHistoryRestoreMetadata,
} from "./workspacePluginHistoryRestoreRuntime";
import type { WorkspacePluginRuntimeContext } from "./workspacePluginRuntimeContext";

interface UseWorkspacePluginHistoryRestoreRuntimeParams {
  handleWorkspaceArtifactClick: (artifact: Artifact) => void;
  pluginRuntimeContext: Pick<
    WorkspacePluginRuntimeContext,
    "contracts" | "registry"
  >;
  threadRead: AgentRuntimeThreadReadModel | null | undefined;
  upsertGeneralArtifact: (artifact: Artifact) => void;
}

export function useWorkspacePluginHistoryRestoreRuntime({
  handleWorkspaceArtifactClick,
  pluginRuntimeContext,
  threadRead,
  upsertGeneralArtifact,
}: UseWorkspacePluginHistoryRestoreRuntimeParams) {
  const { t } = useTranslation("agent");
  const historyRestoreAvailable = useMemo(
    () => hasWorkspacePluginHistoryRestoreMetadata(threadRead),
    [threadRead],
  );
  const historyRestoreProjection = useMemo(
    () =>
      historyRestoreAvailable
        ? buildWorkspacePluginHistoryRestoreProjection({
            threadRead,
            contracts: pluginRuntimeContext.contracts,
            registryItems: pluginRuntimeContext.registry,
          })
        : null,
    [
      historyRestoreAvailable,
      pluginRuntimeContext.contracts,
      pluginRuntimeContext.registry,
      threadRead,
    ],
  );
  const landingModel = useMemo(
    () =>
      historyRestoreAvailable
        ? buildWorkspacePluginHistoryRestoreLandingModel({
            projection: historyRestoreProjection,
            contracts: pluginRuntimeContext.contracts,
          })
        : null,
    [
      historyRestoreAvailable,
      historyRestoreProjection,
      pluginRuntimeContext.contracts,
    ],
  );
  const artifactPreviewItems = useMemo(
    () =>
      historyRestoreAvailable
        ? buildWorkspacePluginHistoryRestoreArtifactPreviewItems({
            projection: historyRestoreProjection,
            maxItems: 3,
          })
        : [],
    [historyRestoreAvailable, historyRestoreProjection],
  );
  const handleOpenArtifactPreview = useCallback(
    (item: WorkspacePluginHistoryRestoreArtifactPreviewItem) => {
      const artifact =
        buildWorkspacePluginHistoryRestoreArtifactPreviewArtifact({
          projection: historyRestoreProjection,
          item,
          title: String(
            t(
              "agentChat.workspaceConversation.pluginHistory.previewArtifactTitle",
              {
                index: item.displayIndex,
              },
            ),
          ),
        });
      if (!artifact) {
        toast.error(
          String(
            t(
              "agentChat.workspaceConversation.pluginHistory.previewUnavailable",
            ),
          ),
        );
        return;
      }

      upsertGeneralArtifact(artifact);
      handleWorkspaceArtifactClick(artifact);
    },
    [
      handleWorkspaceArtifactClick,
      historyRestoreProjection,
      t,
      upsertGeneralArtifact,
    ],
  );

  const landingCard = landingModel ? (
    <WorkspacePluginHistoryRestoreLandingCard
      artifactPreviewItems={artifactPreviewItems}
      model={landingModel}
      onOpenArtifactPreview={handleOpenArtifactPreview}
    />
  ) : null;

  return {
    landingCard,
  };
}
