const MIN_EXPECTED_TEXT_LENGTH = 12;

function normalizePhase(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function canonicalMessageText(item) {
  if (item?.type !== "user_message" && item?.type !== "agent_message") {
    return "";
  }
  for (const value of [item.text, item.content, item.message]) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function isExpectedText(text) {
  return text.length >= MIN_EXPECTED_TEXT_LENGTH && !text.startsWith("<image ");
}

function compareCanonicalItemOrder(left, right) {
  const leftSequence = Number.isFinite(left?.sequence)
    ? Number(left.sequence)
    : Number.MAX_SAFE_INTEGER;
  const rightSequence = Number.isFinite(right?.sequence)
    ? Number(right.sequence)
    : Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function resolveCompactAgentMessageIds(items) {
  const itemsByTurn = new Map();
  for (const item of items) {
    if (item?.type !== "agent_message" || !canonicalMessageText(item)) {
      continue;
    }
    const turnId = String(item.turn_id || "__legacy_turn__");
    const turnItems = itemsByTurn.get(turnId) || [];
    turnItems.push(item);
    itemsByTurn.set(turnId, turnItems);
  }

  const selectedIds = new Set();
  for (const turnItems of itemsByTurn.values()) {
    const explicitFinalItems = turnItems.filter((item) => {
      const phase = normalizePhase(item.phase);
      return phase === "final_answer" || phase === "final";
    });
    if (explicitFinalItems.length > 0) {
      explicitFinalItems.forEach((item) => selectedIds.add(item.id));
      continue;
    }

    const unphasedItems = turnItems
      .filter((item) => !normalizePhase(item.phase))
      .sort(compareCanonicalItemOrder);
    const fallbackFinalItem = unphasedItems.at(-1);
    if (fallbackFinalItem) {
      selectedIds.add(fallbackFinalItem.id);
    }
  }
  return selectedIds;
}

function readCanonicalItems(readResult) {
  return Array.isArray(readResult?.detail?.items)
    ? readResult.detail.items
    : [];
}

export function summarizeCanonicalMessageRoleCounts(readResult) {
  const items = readCanonicalItems(readResult);
  return {
    user: items.filter((item) => item?.type === "user_message").length,
    assistant: new Set(
      items
        .filter((item) => item?.type === "agent_message")
        .map((item) => String(item?.turn_id || ""))
        .filter(Boolean),
    ).size,
  };
}

function expectedMessage(item) {
  return {
    itemId: String(item?.id || ""),
    turnId: String(item?.turn_id || ""),
    role: item?.type === "user_message" ? "user" : "assistant",
    phase: normalizePhase(item?.phase) || null,
    text: canonicalMessageText(item),
  };
}

export function selectCompactExpectedMessages(readResult) {
  const items = readCanonicalItems(readResult);
  const compactAgentMessageIds = resolveCompactAgentMessageIds(items);
  return items
    .filter(
      (item) =>
        item?.type === "user_message" ||
        (item?.type === "agent_message" && compactAgentMessageIds.has(item.id)),
    )
    .map(expectedMessage)
    .filter((message) => isExpectedText(message.text));
}

export function selectExpandedExpectedMessages(readResult) {
  return readCanonicalItems(readResult)
    .filter(
      (item) => item?.type === "user_message" || item?.type === "agent_message",
    )
    .map(expectedMessage)
    .filter((message) => isExpectedText(message.text));
}

export function selectCompactExpectedMessageTexts(readResult) {
  return selectCompactExpectedMessages(readResult).map(
    (message) => message.text,
  );
}

export function selectExpandedExpectedMessageTexts(readResult) {
  return selectExpandedExpectedMessages(readResult).map(
    (message) => message.text,
  );
}
