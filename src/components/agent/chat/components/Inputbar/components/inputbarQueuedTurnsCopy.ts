export type InputbarQueuedTurnsCopyKey =
  | "agentChat.inputbar.queuedTurns.header.count"
  | "agentChat.inputbar.queuedTurns.header.sequenceHint"
  | "agentChat.inputbar.queuedTurns.emptyInput"
  | "agentChat.inputbar.queuedTurns.action.expand"
  | "agentChat.inputbar.queuedTurns.action.collapse"
  | "agentChat.inputbar.queuedTurns.meta.imageCount"
  | "agentChat.inputbar.queuedTurns.meta.textOnly"
  | "agentChat.inputbar.queuedTurns.action.promoteAria"
  | "agentChat.inputbar.queuedTurns.action.promoting"
  | "agentChat.inputbar.queuedTurns.action.promote"
  | "agentChat.inputbar.queuedTurns.action.remove"
  | "agentChat.inputbar.queuedTurns.action.removing";

type InputbarQueuedTurnsCopyValue = number | string;

export type InputbarQueuedTurnsCopyTranslate = (
  key: InputbarQueuedTurnsCopyKey,
  values?: Record<string, InputbarQueuedTurnsCopyValue>,
) => string;

export interface InputbarQueuedTurnsCopy {
  queuedCount: (count: number) => string;
  sequenceHint: string;
  emptyInput: string;
  expand: string;
  collapse: string;
  imageCount: (count: number) => string;
  textOnly: string;
  promoteAria: string;
  promoting: string;
  promote: string;
  remove: string;
  removing: string;
}

export function buildInputbarQueuedTurnsCopy(
  translate: InputbarQueuedTurnsCopyTranslate,
): InputbarQueuedTurnsCopy {
  return {
    queuedCount: (count) =>
      translate("agentChat.inputbar.queuedTurns.header.count", { count }),
    sequenceHint: translate(
      "agentChat.inputbar.queuedTurns.header.sequenceHint",
    ),
    emptyInput: translate("agentChat.inputbar.queuedTurns.emptyInput"),
    expand: translate("agentChat.inputbar.queuedTurns.action.expand"),
    collapse: translate("agentChat.inputbar.queuedTurns.action.collapse"),
    imageCount: (count) =>
      translate("agentChat.inputbar.queuedTurns.meta.imageCount", { count }),
    textOnly: translate("agentChat.inputbar.queuedTurns.meta.textOnly"),
    promoteAria: translate(
      "agentChat.inputbar.queuedTurns.action.promoteAria",
    ),
    promoting: translate("agentChat.inputbar.queuedTurns.action.promoting"),
    promote: translate("agentChat.inputbar.queuedTurns.action.promote"),
    remove: translate("agentChat.inputbar.queuedTurns.action.remove"),
    removing: translate("agentChat.inputbar.queuedTurns.action.removing"),
  };
}
