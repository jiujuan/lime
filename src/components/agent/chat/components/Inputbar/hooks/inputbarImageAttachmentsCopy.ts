export type InputbarImageAttachmentsCopyKey =
  | "agentChat.inputbar.imageAttachments.unnamedImage"
  | "agentChat.inputbar.imageAttachments.imageReadFailed"
  | "agentChat.inputbar.imageAttachments.imageAdded"
  | "agentChat.inputbar.imageAttachments.imagePasted";

type InputbarImageAttachmentsCopyValue = number | string;

export type InputbarImageAttachmentsCopyTranslate = (
  key: InputbarImageAttachmentsCopyKey,
  values?: Record<string, InputbarImageAttachmentsCopyValue>,
) => string;

export interface InputbarImageAttachmentsCopy {
  unnamedImage: string;
  imageReadFailed: (fileName: string) => string;
  imageAdded: (fileName: string) => string;
  imagePasted: string;
}

export function buildInputbarImageAttachmentsCopy(
  translate: InputbarImageAttachmentsCopyTranslate,
): InputbarImageAttachmentsCopy {
  return {
    unnamedImage: translate("agentChat.inputbar.imageAttachments.unnamedImage"),
    imageReadFailed: (fileName) =>
      translate("agentChat.inputbar.imageAttachments.imageReadFailed", {
        fileName,
      }),
    imageAdded: (fileName) =>
      translate("agentChat.inputbar.imageAttachments.imageAdded", {
        fileName,
      }),
    imagePasted: translate("agentChat.inputbar.imageAttachments.imagePasted"),
  };
}
