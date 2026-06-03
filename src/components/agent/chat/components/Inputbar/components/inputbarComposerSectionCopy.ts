export type InputbarComposerSectionCopyKey =
  | "agentChat.inputbar.composer.advancedSettings.label"
  | "agentChat.inputbar.composer.advancedSettings.expand"
  | "agentChat.inputbar.composer.advancedSettings.collapse"
  | "agentChat.inputbar.composer.currentModel.label"
  | "agentChat.inputbar.composer.currentModel.title"
  | "agentChat.inputbar.composer.fileManager.open"
  | "agentChat.inputbar.composer.fileManager.close"
  | "agentChat.inputbar.plusMenu.open"
  | "agentChat.inputbar.plusMenu.addFiles"
  | "agentChat.inputbar.plusMenu.attachKnowledge"
  | "agentChat.inputbar.plusMenu.planMode"
  | "agentChat.inputbar.tools.subagent.label"
  | "agentChat.inputbar.plusMenu.objective"
  | "agentChat.inputbar.plusMenu.skills"
  | "agentChat.inputbar.plusMenu.unavailable"
  | "agentChat.inputbar.composer.workspacePlaceholder.waiting"
  | "agentChat.inputbar.composer.workspacePlaceholder.taskCenter"
  | "agentChat.inputbar.composer.workspacePlaceholder.default";

type InputbarComposerSectionCopyValue = number | string;

export type InputbarComposerSectionCopyTranslate = (
  key: InputbarComposerSectionCopyKey,
  values?: Record<string, InputbarComposerSectionCopyValue>,
) => string;

export interface InputbarComposerSectionCopy {
  advancedSettings: {
    label: string;
    expand: string;
    collapse: string;
  };
  currentModel: {
    label: string;
    title: (model: string) => string;
  };
  fileManager: {
    open: string;
    close: string;
  };
  plusMenu: {
    open: string;
    addFiles: string;
    attachKnowledge: string;
    planMode: string;
    subagent: string;
    objective: string;
    skills: string;
    unavailable: string;
  };
  workspacePlaceholder: {
    waiting: string;
    taskCenter: string;
    default: string;
  };
}

export function buildInputbarComposerSectionCopy(
  translate: InputbarComposerSectionCopyTranslate,
): InputbarComposerSectionCopy {
  return {
    advancedSettings: {
      label: translate("agentChat.inputbar.composer.advancedSettings.label"),
      expand: translate("agentChat.inputbar.composer.advancedSettings.expand"),
      collapse: translate(
        "agentChat.inputbar.composer.advancedSettings.collapse",
      ),
    },
    currentModel: {
      label: translate("agentChat.inputbar.composer.currentModel.label"),
      title: (model) =>
        translate("agentChat.inputbar.composer.currentModel.title", { model }),
    },
    fileManager: {
      open: translate("agentChat.inputbar.composer.fileManager.open"),
      close: translate("agentChat.inputbar.composer.fileManager.close"),
    },
    plusMenu: {
      open: translate("agentChat.inputbar.plusMenu.open"),
      addFiles: translate("agentChat.inputbar.plusMenu.addFiles"),
      attachKnowledge: translate("agentChat.inputbar.plusMenu.attachKnowledge"),
      planMode: translate("agentChat.inputbar.plusMenu.planMode"),
      subagent: translate("agentChat.inputbar.tools.subagent.label"),
      objective: translate("agentChat.inputbar.plusMenu.objective"),
      skills: translate("agentChat.inputbar.plusMenu.skills"),
      unavailable: translate("agentChat.inputbar.plusMenu.unavailable"),
    },
    workspacePlaceholder: {
      waiting: translate(
        "agentChat.inputbar.composer.workspacePlaceholder.waiting",
      ),
      taskCenter: translate(
        "agentChat.inputbar.composer.workspacePlaceholder.taskCenter",
      ),
      default: translate(
        "agentChat.inputbar.composer.workspacePlaceholder.default",
      ),
    },
  };
}
