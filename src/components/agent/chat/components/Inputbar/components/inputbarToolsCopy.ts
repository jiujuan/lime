export type InputbarToolsCopyKey =
  | "agentChat.inputbar.tools.thinking.label"
  | "agentChat.inputbar.tools.thinking.title.enabled"
  | "agentChat.inputbar.tools.thinking.title.disabled"
  | "agentChat.inputbar.tools.thinking.toast.enabled"
  | "agentChat.inputbar.tools.thinking.toast.disabled"
  | "agentChat.inputbar.tools.webSearch.label"
  | "agentChat.inputbar.tools.webSearch.title.enabled"
  | "agentChat.inputbar.tools.webSearch.title.disabled"
  | "agentChat.inputbar.tools.webSearch.toast.enabled"
  | "agentChat.inputbar.tools.webSearch.toast.disabled"
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
  thinking: InputbarToolToggleCopy;
  webSearch: InputbarToolToggleCopy;
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
  const thinkingTitleEnabled = translate(
    "agentChat.inputbar.tools.thinking.title.enabled",
  );
  const thinkingTitleDisabled = translate(
    "agentChat.inputbar.tools.thinking.title.disabled",
  );
  const thinkingToastEnabled = translate(
    "agentChat.inputbar.tools.thinking.toast.enabled",
  );
  const thinkingToastDisabled = translate(
    "agentChat.inputbar.tools.thinking.toast.disabled",
  );
  const webSearchTitleEnabled = translate(
    "agentChat.inputbar.tools.webSearch.title.enabled",
  );
  const webSearchTitleDisabled = translate(
    "agentChat.inputbar.tools.webSearch.title.disabled",
  );
  const webSearchToastEnabled = translate(
    "agentChat.inputbar.tools.webSearch.toast.enabled",
  );
  const webSearchToastDisabled = translate(
    "agentChat.inputbar.tools.webSearch.toast.disabled",
  );
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
    thinking: {
      label: translate("agentChat.inputbar.tools.thinking.label"),
      title: (enabled) =>
        chooseToggleCopy(enabled, thinkingTitleEnabled, thinkingTitleDisabled),
      toast: (enabled) =>
        chooseToggleCopy(enabled, thinkingToastEnabled, thinkingToastDisabled),
    },
    webSearch: {
      label: translate("agentChat.inputbar.tools.webSearch.label"),
      title: (enabled) =>
        chooseToggleCopy(
          enabled,
          webSearchTitleEnabled,
          webSearchTitleDisabled,
        ),
      toast: (enabled) =>
        chooseToggleCopy(
          enabled,
          webSearchToastEnabled,
          webSearchToastDisabled,
        ),
    },
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
