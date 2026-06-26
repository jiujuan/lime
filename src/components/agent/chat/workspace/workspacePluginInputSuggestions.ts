import type { InputbarPluginCapability } from "../components/Inputbar/pluginInputCapability";
import type { WorkspacePluginRuntimeContext } from "./workspacePluginRuntimeContext";

export function buildWorkspacePluginInputSuggestions(
  context: WorkspacePluginRuntimeContext,
): InputbarPluginCapability[] {
  return context.registry.map((item) => {
    const contract = context.contracts.find(
      (candidate) => candidate.id === item.pluginId,
    );
    const blockerCodes =
      item.activationState === "activatable" ? [] : item.blockerCodes;
    return {
      pluginId: item.pluginId,
      displayName: item.displayName,
      description: item.pluginId,
      disabled: item.activationState !== "activatable",
      blockerCodes,
      skills: (contract?.skills ?? []).map((skill) => ({
        skillId: skill.id,
        title: skill.title,
        description: skill.description,
        disabled: item.activationState !== "activatable",
        blockerCodes,
      })),
    };
  });
}
