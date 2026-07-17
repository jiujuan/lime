function normalizeComparableMessageText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isExpectedMessageMissing(message, snapshot) {
  const item = snapshot.visibleAgentMessageTextById?.[message.itemId];
  if (message.role === "assistant" && (!item || !item.visible)) {
    return true;
  }
  const actualText = item?.text || snapshot.messageComparableText || "";
  return !normalizeComparableMessageText(actualText).includes(
    normalizeComparableMessageText(message.excerpt),
  );
}

export function assessExpectedMessageVisibility(snapshot) {
  if (!snapshot) {
    return null;
  }
  const expectedMessages = Array.isArray(snapshot.expectedVisibleMessages)
    ? snapshot.expectedVisibleMessages
    : [];
  const missingExpectedMessages = expectedMessages.filter((message) =>
    isExpectedMessageMissing(message, snapshot),
  );
  const missingExpectedMessageDiagnostics = missingExpectedMessages.map(
    (message) => {
      const item = snapshot.visibleAgentMessageTextById?.[message.itemId];
      return {
        itemId: message.itemId,
        role: message.role,
        visible: item?.visible === true,
        actualComparableLength: normalizeComparableMessageText(item?.text)
          .length,
        expectedComparableLength: normalizeComparableMessageText(
          message.excerpt,
        ).length,
      };
    },
  );
  const {
    expectedVisibleMessages: _expectedVisibleMessages,
    messageComparableText: _messageComparableText,
    visibleAgentMessageTextById,
    ...audit
  } = snapshot;
  return {
    ...audit,
    visibleAgentMessageIdentityCount: Object.keys(
      visibleAgentMessageTextById || {},
    ).length,
    missingExpectedMessages,
    missingExpectedMessageIds: missingExpectedMessages
      .filter((message) => message.role === "assistant")
      .map((message) => message.itemId),
    missingExpectedExcerpts: missingExpectedMessages.map(
      (message) => message.excerpt,
    ),
    missingExpectedDomExcerpts: missingExpectedMessages.map(
      (message) => message.excerpt,
    ),
    missingExpectedMessageDiagnostics,
  };
}
