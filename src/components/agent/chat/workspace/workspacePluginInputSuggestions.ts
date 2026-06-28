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
    const defaultPrompts = contract?.interface?.defaultPrompt ?? [];
    return {
      pluginId: item.pluginId,
      displayName: item.displayName,
      description: defaultPrompts[0] ?? item.pluginId,
      ...(defaultPrompts.length > 0 ? { defaultPrompts } : {}),
      disabled: item.activationState !== "activatable",
      blockerCodes,
      skills: (contract?.skills ?? [])
        .map((skill) => ({
          skillId: skill.id,
          title: skill.title,
          description: skill.description,
          disabled: item.activationState !== "activatable",
          blockerCodes,
        }))
        .concat(
          (contract?.activationEntries ?? [])
            .filter((entry) => entry.intent === "at_command")
            .flatMap((entry) => {
              const aliases = entry.aliases?.length
                ? entry.aliases
                : [undefined];
              return aliases.map((alias) => ({
                skillId: entry.key,
                title: entry.title,
                description: undefined,
                ...(alias ? { trigger: alias } : {}),
                ...(defaultPrompts.length > 0
                  ? { defaultPrompt: defaultPrompts[0] }
                  : {}),
                disabled: item.activationState !== "activatable",
                blockerCodes,
              }));
            }),
        ),
    };
  });
}
