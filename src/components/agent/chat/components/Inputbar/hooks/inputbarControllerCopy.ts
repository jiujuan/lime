export type InputbarControllerCopyKey =
  | "agentChat.inputbar.controller.toast.systemPathDropUnsupported"
  | "agentChat.inputbar.controller.curatedTask.reviewSuggestionPrefillHint";

export type InputbarControllerCopyTranslate = (
  key: InputbarControllerCopyKey,
) => string;

export interface InputbarControllerCopy {
  systemPathDropUnsupported: string;
  curatedTaskReviewSuggestionPrefillHint: string;
}

export function buildInputbarControllerCopy(
  translate: InputbarControllerCopyTranslate,
): InputbarControllerCopy {
  return {
    systemPathDropUnsupported: translate(
      "agentChat.inputbar.controller.toast.systemPathDropUnsupported",
    ),
    curatedTaskReviewSuggestionPrefillHint: translate(
      "agentChat.inputbar.controller.curatedTask.reviewSuggestionPrefillHint",
    ),
  };
}
