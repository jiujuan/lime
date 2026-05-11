import type { Dispatch, SetStateAction } from "react";
import type { ActionRequired, Message } from "../types";
import {
  appendActionRequiredToParts,
  resolveActionPromptKey,
} from "./agentChatCoreUtils";

interface UpsertAssistantActionRequestOptions {
  assistantMsgId: string;
  actionData: ActionRequired;
  replaceByPrompt?: boolean;
  setPendingActions: Dispatch<SetStateAction<ActionRequired[]>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}

export const upsertAssistantActionRequest = ({
  assistantMsgId,
  actionData,
  replaceByPrompt = false,
  setPendingActions,
  setMessages,
}: UpsertAssistantActionRequestOptions) => {
  const scopedActionData: ActionRequired = {
    ...actionData,
    sourceMessageId: actionData.sourceMessageId || assistantMsgId,
    status: actionData.status || "pending",
  };
  const promptKey = replaceByPrompt
    ? resolveActionPromptKey(scopedActionData)
    : null;

  setPendingActions((prev) => {
    let next = [...prev];

    if (replaceByPrompt && promptKey) {
      next = next.filter((item) => {
        const itemKey = resolveActionPromptKey(item);
        return !(
          item.requestId !== scopedActionData.requestId &&
          itemKey &&
          itemKey === promptKey
        );
      });
    }

    next = next.filter((item) => item.requestId !== scopedActionData.requestId);
    next.push(scopedActionData);
    return next;
  });

  setMessages((prev) =>
    prev.map((msg) => {
      if (msg.id !== assistantMsgId) return msg;

      let nextRequests = [...(msg.actionRequests || [])];
      let nextParts = [...(msg.contentParts || [])];

      if (replaceByPrompt && promptKey) {
        nextRequests = nextRequests.filter((item) => {
          const itemKey = resolveActionPromptKey(item);
          return !(
            item.requestId !== scopedActionData.requestId &&
            itemKey &&
            itemKey === promptKey
          );
        });
        nextParts = nextParts.filter(
          (part) =>
            !(
              part.type === "action_required" &&
              part.actionRequired.requestId !== scopedActionData.requestId &&
              resolveActionPromptKey(part.actionRequired) === promptKey
            ),
        );
      }

      nextRequests = nextRequests.filter(
        (item) => item.requestId !== scopedActionData.requestId,
      );
      nextParts = nextParts.filter(
        (part) =>
          !(
            part.type === "action_required" &&
            part.actionRequired.requestId === scopedActionData.requestId
          ),
      );
      nextRequests.push(scopedActionData);
      nextParts = appendActionRequiredToParts(nextParts, scopedActionData);

      return {
        ...msg,
        actionRequests: nextRequests,
        contentParts: nextParts,
      };
    }),
  );
};
