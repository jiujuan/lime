export type InputbarToolsCopyKey =
  | "agentChat.inputbar.tools.subagent.label"
  | "agentChat.inputbar.tools.subagent.title.enabled"
  | "agentChat.inputbar.tools.subagent.title.disabled"
  | "agentChat.inputbar.tools.subagent.toast.enabled"
  | "agentChat.inputbar.tools.subagent.toast.disabled"
  | "agentChat.inputbar.tools.fullscreen.toast.entered"
  | "agentChat.inputbar.tools.fullscreen.toast.exited";

export type InputbarToolsCopyTranslate = (
  key: InputbarToolsCopyKey,
) => string;

interface InputbarToolToggleCopy {
  label: string;
  title: (enabled: boolean) => string;
  toast: (enabled: boolean) => string;
}

export interface InputbarToolsCopy {
  subagent: InputbarToolToggleCopy;
  fullscreen: {
    entered: string;
    exited: string;
  };
}

function chooseToggleCopy(
  enabled: boolean,
  enabledText: string,
  disabledText: string,
): string {
  return enabled ? enabledText : disabledText;
}

export function buildInputbarToolsCopy(
  translate: InputbarToolsCopyTranslate,
): InputbarToolsCopy {
  const subagentTitleEnabled = translate(
    "agentChat.inputbar.tools.subagent.title.enabled",
  );
  const subagentTitleDisabled = translate(
    "agentChat.inputbar.tools.subagent.title.disabled",
  );
  const subagentToastEnabled = translate(
    "agentChat.inputbar.tools.subagent.toast.enabled",
  );
  const subagentToastDisabled = translate(
    "agentChat.inputbar.tools.subagent.toast.disabled",
  );

  return {
    subagent: {
      label: translate("agentChat.inputbar.tools.subagent.label"),
      title: (enabled) =>
        chooseToggleCopy(enabled, subagentTitleEnabled, subagentTitleDisabled),
      toast: (enabled) =>
        chooseToggleCopy(enabled, subagentToastEnabled, subagentToastDisabled),
    },
    fullscreen: {
      entered: translate("agentChat.inputbar.tools.fullscreen.toast.entered"),
      exited: translate("agentChat.inputbar.tools.fullscreen.toast.exited"),
    },
  };
}
