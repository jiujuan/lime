import type { InputbarPluginCapability } from "../components/Inputbar/pluginInputCapability";
import type { WorkspacePluginRuntimeContext } from "./workspacePluginRuntimeContext";

function firstActivationAlias(entry: {
  aliases?: readonly string[];
}): string | undefined {
  return entry.aliases?.find((alias) => alias.trim())?.trim();
}

export function buildWorkspacePluginInputSuggestions(
  context: WorkspacePluginRuntimeContext,
): InputbarPluginCapability[] {
  return context.registry.flatMap((item) => {
    const contract = context.contracts.find(
      (candidate) => candidate.id === item.pluginId,
    );
    const blockerCodes =
      item.activationState === "activatable" ? [] : item.blockerCodes;
    const defaultPrompts = contract?.interface?.defaultPrompt ?? [];
    const activationCapabilities = (contract?.activationEntries ?? [])
      .filter((entry) => entry.intent === "at_command")
      .map((entry) => ({
        pluginId: item.pluginId,
        displayName: entry.title.trim() || item.displayName,
        description: defaultPrompts[0] ?? item.displayName,
        trigger: firstActivationAlias(entry) ?? `@${entry.title}`,
        ...(defaultPrompts.length > 0 ? { defaultPrompts } : {}),
        disabled: item.activationState !== "activatable",
        blockerCodes,
        skills: [
          ...((contract?.skills ?? []).map((skill) => ({
            skillId: skill.id,
            title: skill.title,
            description: skill.description,
            disabled: item.activationState !== "activatable",
            blockerCodes,
          })) ?? []),
          ...((entry.aliases ?? [])
            .filter((alias) => alias.trim())
            .map((alias) => ({
              skillId: entry.key,
              title: alias.trim(),
              description: undefined,
              trigger: alias.trim(),
              ...(defaultPrompts.length > 0
                ? { defaultPrompt: defaultPrompts[0] }
                : {}),
              disabled: item.activationState !== "activatable",
              blockerCodes,
            })) ?? []),
        ],
      }));
    if (activationCapabilities.length > 0) {
      return activationCapabilities;
    }
    return [
      {
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
      },
    ];
  });
}
