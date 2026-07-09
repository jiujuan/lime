export type InputbarDictationCopyKey =
  | "agentChat.inputbar.dictation.feedback.unavailable"
  | "agentChat.inputbar.dictation.feedback.enableInSettings"
  | "agentChat.inputbar.dictation.feedback.downloadVoiceModel"
  | "agentChat.inputbar.dictation.feedback.startFailed"
  | "agentChat.inputbar.dictation.feedback.permissionDeniedMac"
  | "agentChat.inputbar.dictation.feedback.permissionDeniedWindows"
  | "agentChat.inputbar.dictation.feedback.permissionDeniedDefault"
  | "agentChat.inputbar.dictation.feedback.tooShort"
  | "agentChat.inputbar.dictation.feedback.emptyTranscript"
  | "agentChat.inputbar.dictation.feedback.recognitionFailed";

export type InputbarDictationCopyTranslate = (
  key: InputbarDictationCopyKey,
) => string;

export interface InputbarDictationCopy {
  unavailable: string;
  enableInSettings: string;
  downloadVoiceModel: string;
  startFailed: string;
  permissionDeniedMac: string;
  permissionDeniedWindows: string;
  permissionDeniedDefault: string;
  tooShort: string;
  emptyTranscript: string;
  recognitionFailed: string;
}

export function buildInputbarDictationCopy(
  translate: InputbarDictationCopyTranslate,
): InputbarDictationCopy {
  return {
    unavailable: translate("agentChat.inputbar.dictation.feedback.unavailable"),
    enableInSettings: translate(
      "agentChat.inputbar.dictation.feedback.enableInSettings",
    ),
    downloadVoiceModel: translate(
      "agentChat.inputbar.dictation.feedback.downloadVoiceModel",
    ),
    startFailed: translate("agentChat.inputbar.dictation.feedback.startFailed"),
    permissionDeniedMac: translate(
      "agentChat.inputbar.dictation.feedback.permissionDeniedMac",
    ),
    permissionDeniedWindows: translate(
      "agentChat.inputbar.dictation.feedback.permissionDeniedWindows",
    ),
    permissionDeniedDefault: translate(
      "agentChat.inputbar.dictation.feedback.permissionDeniedDefault",
    ),
    tooShort: translate("agentChat.inputbar.dictation.feedback.tooShort"),
    emptyTranscript: translate(
      "agentChat.inputbar.dictation.feedback.emptyTranscript",
    ),
    recognitionFailed: translate(
      "agentChat.inputbar.dictation.feedback.recognitionFailed",
    ),
  };
}
