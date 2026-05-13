export type InputbarComposerSectionCopyKey =
  | "agentChat.inputbar.composer.advancedSettings.label"
  | "agentChat.inputbar.composer.advancedSettings.expand"
  | "agentChat.inputbar.composer.advancedSettings.collapse"
  | "agentChat.inputbar.composer.currentModel.label"
  | "agentChat.inputbar.composer.currentModel.title"
  | "agentChat.inputbar.composer.fileManager.open"
  | "agentChat.inputbar.composer.fileManager.close"
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
