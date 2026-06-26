import type {
  PluginContract,
  PluginHistoryRestoreProjection,
} from "@/features/plugin";

export type WorkspacePluginHistoryRestoreLandingTone =
  | "success"
  | "info"
  | "warning";

export type WorkspacePluginHistoryRestoreLandingMode =
  | "interactive"
  | "read_only"
  | "artifact_preview"
  | "chat_only";

export interface WorkspacePluginHistoryRestoreLandingModel {
  mode: WorkspacePluginHistoryRestoreLandingMode;
  tone: WorkspacePluginHistoryRestoreLandingTone;
  titleKey: string;
  descriptionKey: string;
  statusKey: string;
  pluginLabel?: string;
  objectLabel?: string;
  artifactCount: number;
  openedTabCount: number;
  blockerCodes: string[];
}

export interface BuildWorkspacePluginHistoryRestoreLandingModelParams {
  projection: PluginHistoryRestoreProjection | null | undefined;
  contracts?: readonly PluginContract[];
}

function objectLabelFromProjection(
  projection: PluginHistoryRestoreProjection,
): string | undefined {
  const ref = projection.selectedObjectRef ?? projection.primaryObjectRef;
  if (!ref?.objectKind || !ref.objectId) {
    return undefined;
  }
  return `${ref.objectKind} / ${ref.objectId}`;
}

function modeForProjection(
  projection: PluginHistoryRestoreProjection,
): WorkspacePluginHistoryRestoreLandingMode {
  if (projection.status === "artifact_preview") {
    return "artifact_preview";
  }
  if (projection.status === "chat_only") {
    return "chat_only";
  }
  return projection.actionMode === "interactive" ? "interactive" : "read_only";
}

export function buildWorkspacePluginHistoryRestoreLandingModel({
  projection,
  contracts = [],
}: BuildWorkspacePluginHistoryRestoreLandingModelParams): WorkspacePluginHistoryRestoreLandingModel | null {
  if (!projection) {
    return null;
  }

  const mode = modeForProjection(projection);
  const contract = contracts.find(
    (candidate) => candidate.id === projection.pluginId,
  );
  const base = {
    mode,
    pluginLabel: contract?.displayName || projection.pluginId,
    objectLabel: objectLabelFromProjection(projection),
    artifactCount: projection.artifactRefs.length,
    openedTabCount: projection.openedTabs.length,
    blockerCodes: projection.blockerCodes,
  };

  switch (mode) {
    case "interactive":
      return {
        ...base,
        tone: "success",
        titleKey: "pluginHistory.title.restored",
        descriptionKey: "pluginHistory.description.interactive",
        statusKey: "pluginHistory.status.interactive",
      };
    case "read_only":
      return {
        ...base,
        tone: "warning",
        titleKey: "pluginHistory.title.restored",
        descriptionKey: "pluginHistory.description.readOnly",
        statusKey: "pluginHistory.status.readOnly",
      };
    case "artifact_preview":
      return {
        ...base,
        tone: "info",
        titleKey: "pluginHistory.title.artifactPreview",
        descriptionKey: "pluginHistory.description.artifactPreview",
        statusKey: "pluginHistory.status.artifactPreview",
      };
    case "chat_only":
    default:
      return {
        ...base,
        tone: "warning",
        titleKey: "pluginHistory.title.chatOnly",
        descriptionKey: "pluginHistory.description.chatOnly",
        statusKey: "pluginHistory.status.chatOnly",
      };
  }
}
