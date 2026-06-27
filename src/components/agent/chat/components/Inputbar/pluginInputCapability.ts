export interface InputbarPluginCapability {
  pluginId: string;
  displayName: string;
  description?: string;
  disabled?: boolean;
  blockerCodes?: string[];
  skills?: InputbarPluginSkillCapability[];
}

export interface InputbarPluginSkillCapability {
  skillId: string;
  title: string;
  description?: string;
  disabled?: boolean;
  blockerCodes?: string[];
}

export interface InputbarPluginSelection {
  plugin: InputbarPluginCapability;
  skill?: InputbarPluginSkillCapability;
  trigger: string;
  text: string;
}

export function resolveInputbarPluginDisplayName(
  plugin: Pick<InputbarPluginCapability, "displayName" | "pluginId">,
): string {
  return plugin.displayName.trim() || plugin.pluginId.trim();
}

export function normalizeInputbarPluginTrigger(
  plugin: Pick<InputbarPluginCapability, "displayName" | "pluginId">,
  skill?: Pick<InputbarPluginSkillCapability, "skillId" | "title">,
): string {
  const displayName = resolveInputbarPluginDisplayName(plugin);
  const pluginTrigger = displayName ? `@${displayName}` : "@";
  const skillName = skill?.title.trim() || skill?.skillId.trim();

  return skillName ? `${pluginTrigger}:${skillName}` : pluginTrigger;
}

export function applyInputbarPluginSelection(params: {
  input: string;
  plugin: InputbarPluginCapability;
  skill?: InputbarPluginSkillCapability;
}): InputbarPluginSelection {
  const trigger = normalizeInputbarPluginTrigger(params.plugin, params.skill);
  const trimmedInput = params.input.trim();
  const inputWithoutLeadingSpace = params.input.trimStart();
  if (!trimmedInput) {
    return {
      plugin: params.plugin,
      skill: params.skill,
      trigger,
      text: trigger,
    };
  }

  if (trimmedInput === trigger || trimmedInput.startsWith(`${trigger} `)) {
    return {
      plugin: params.plugin,
      skill: params.skill,
      trigger,
      text:
        trimmedInput === trigger && /\s$/.test(inputWithoutLeadingSpace)
          ? `${trigger} `
          : trimmedInput,
    };
  }

  return {
    plugin: params.plugin,
    skill: params.skill,
    trigger,
    text: `${trigger} ${trimmedInput}`,
  };
}

export function removeInputbarPluginSelection(params: {
  input: string;
  selection: InputbarPluginSelection;
}): string {
  const trimmedInput = params.input.trim();
  const trigger = params.selection.trigger.trim();
  if (trimmedInput === trigger) {
    return "";
  }

  if (trimmedInput.startsWith(`${trigger} `)) {
    return trimmedInput.slice(trigger.length).trimStart();
  }

  return params.input;
}
