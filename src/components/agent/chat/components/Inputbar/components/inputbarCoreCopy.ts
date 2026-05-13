export type InputbarCoreCopyKey =
  | "agentChat.inputbar.core.dictation.recording"
  | "agentChat.inputbar.core.dictation.recordingLabel"
  | "agentChat.inputbar.core.dictation.transcribing"
  | "agentChat.inputbar.core.dictation.polishing"
  | "agentChat.inputbar.core.dictation.liveTranscript"
  | "agentChat.inputbar.core.dictation.polishingTitle"
  | "agentChat.inputbar.core.dictation.transcribingTitle"
  | "agentChat.inputbar.core.dictation.stopRecording"
  | "agentChat.inputbar.core.dictation.start"
  | "agentChat.inputbar.core.dictation.disabled"
  | "agentChat.inputbar.core.placeholder.fullscreen"
  | "agentChat.inputbar.core.placeholder.default"
  | "agentChat.inputbar.core.image.previewAlt"
  | "agentChat.inputbar.core.image.remove"
  | "agentChat.inputbar.core.image.add"
  | "agentChat.inputbar.core.path.containerLabel"
  | "agentChat.inputbar.core.path.localFolder"
  | "agentChat.inputbar.core.path.localFile"
  | "agentChat.inputbar.core.path.importAsKnowledge"
  | "agentChat.inputbar.core.path.importAction"
  | "agentChat.inputbar.core.path.remove"
  | "agentChat.inputbar.core.suggestion.acceptTitle"
  | "agentChat.inputbar.core.textarea.expand"
  | "agentChat.inputbar.core.textarea.collapse"
  | "agentChat.inputbar.core.action.defer"
  | "agentChat.inputbar.core.action.stop"
  | "agentChat.inputbar.core.action.send";

type InputbarCoreCopyValue = number | string;

export type InputbarCoreCopyTranslate = (
  key: InputbarCoreCopyKey,
  values?: Record<string, InputbarCoreCopyValue>,
) => string;

export interface InputbarCoreCopy {
  dictation: {
    recording: (duration: string) => string;
    recordingLabel: string;
    transcribing: string;
    polishing: string;
    liveTranscript: string;
    polishingTitle: string;
    transcribingTitle: string;
    stopRecording: (label: string) => string;
    start: string;
    disabled: string;
  };
  placeholder: {
    fullscreen: string;
    default: string;
  };
  image: {
    previewAlt: (index: number) => string;
    remove: (index: number) => string;
    add: string;
  };
  path: {
    containerLabel: string;
    localFolder: string;
    localFile: string;
    importAsKnowledge: (name: string) => string;
    importAction: string;
    remove: (name: string) => string;
  };
  suggestion: {
    acceptTitle: string;
  };
  textarea: {
    expand: string;
    collapse: string;
  };
  action: {
    defer: string;
    stop: string;
    send: string;
  };
}

export function buildInputbarCoreCopy(
  translate: InputbarCoreCopyTranslate,
): InputbarCoreCopy {
  return {
    dictation: {
      recording: (duration) =>
        translate("agentChat.inputbar.core.dictation.recording", {
          duration,
        }),
      recordingLabel: translate(
        "agentChat.inputbar.core.dictation.recordingLabel",
      ),
      transcribing: translate(
        "agentChat.inputbar.core.dictation.transcribing",
      ),
      polishing: translate("agentChat.inputbar.core.dictation.polishing"),
      liveTranscript: translate(
        "agentChat.inputbar.core.dictation.liveTranscript",
      ),
      polishingTitle: translate(
        "agentChat.inputbar.core.dictation.polishingTitle",
      ),
      transcribingTitle: translate(
        "agentChat.inputbar.core.dictation.transcribingTitle",
      ),
      stopRecording: (label) =>
        translate("agentChat.inputbar.core.dictation.stopRecording", {
          label,
        }),
      start: translate("agentChat.inputbar.core.dictation.start"),
      disabled: translate("agentChat.inputbar.core.dictation.disabled"),
    },
    placeholder: {
      fullscreen: translate("agentChat.inputbar.core.placeholder.fullscreen"),
      default: translate("agentChat.inputbar.core.placeholder.default"),
    },
    image: {
      previewAlt: (index) =>
        translate("agentChat.inputbar.core.image.previewAlt", { index }),
      remove: (index) =>
        translate("agentChat.inputbar.core.image.remove", { index }),
      add: translate("agentChat.inputbar.core.image.add"),
    },
    path: {
      containerLabel: translate(
        "agentChat.inputbar.core.path.containerLabel",
      ),
      localFolder: translate("agentChat.inputbar.core.path.localFolder"),
      localFile: translate("agentChat.inputbar.core.path.localFile"),
      importAsKnowledge: (name) =>
        translate("agentChat.inputbar.core.path.importAsKnowledge", { name }),
      importAction: translate("agentChat.inputbar.core.path.importAction"),
      remove: (name) =>
        translate("agentChat.inputbar.core.path.remove", { name }),
    },
    suggestion: {
      acceptTitle: translate("agentChat.inputbar.core.suggestion.acceptTitle"),
    },
    textarea: {
      expand: translate("agentChat.inputbar.core.textarea.expand"),
      collapse: translate("agentChat.inputbar.core.textarea.collapse"),
    },
    action: {
      defer: translate("agentChat.inputbar.core.action.defer"),
      stop: translate("agentChat.inputbar.core.action.stop"),
      send: translate("agentChat.inputbar.core.action.send"),
    },
  };
}
