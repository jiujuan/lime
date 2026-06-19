import type { Message } from "../types";

interface OrderedMessage {
  message: Message;
  originalIndex: number;
}

interface RuntimeTurnBucket {
  id: string;
  anchorIndex: number;
  entries: OrderedMessage[];
}

function normalizeRuntimeTurnId(message: Message): string | null {
  const normalized = message.runtimeTurnId?.trim();
  return normalized || null;
}

function messageTimestampMs(message: Message): number | null {
  const timestampMs = message.timestamp.getTime();
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function createRuntimeTurnBucket(
  id: string,
  orderedMessage: OrderedMessage,
): RuntimeTurnBucket {
  return {
    id,
    anchorIndex: orderedMessage.originalIndex,
    entries: [orderedMessage],
  };
}

function appendToRuntimeTurnBucket(
  bucket: RuntimeTurnBucket,
  orderedMessage: OrderedMessage,
) {
  bucket.entries.push(orderedMessage);
  bucket.anchorIndex = Math.min(
    bucket.anchorIndex,
    orderedMessage.originalIndex,
  );
}

function compareRuntimeTurnEntries(
  left: OrderedMessage,
  right: OrderedMessage,
) {
  const roleOrder = (message: Message): number => {
    if (message.role === "user") return 0;
    if (message.role === "assistant") return 1;
    return 2;
  };

  const leftRoleOrder = roleOrder(left.message);
  const rightRoleOrder = roleOrder(right.message);
  if (leftRoleOrder !== rightRoleOrder) {
    return leftRoleOrder - rightRoleOrder;
  }

  const leftTimestamp = messageTimestampMs(left.message);
  const rightTimestamp = messageTimestampMs(right.message);
  if (leftTimestamp !== null && rightTimestamp !== null) {
    if (leftTimestamp !== rightTimestamp) {
      return leftTimestamp - rightTimestamp;
    }
  } else if (leftTimestamp !== null) {
    return -1;
  } else if (rightTimestamp !== null) {
    return 1;
  }

  return left.originalIndex - right.originalIndex;
}

function compareRuntimeTurnBuckets(
  left: RuntimeTurnBucket,
  right: RuntimeTurnBucket,
) {
  return left.anchorIndex - right.anchorIndex;
}

function normalizeSignatureText(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function stableJsonSignature(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function messageDuplicateSignature(message: Message): string {
  return [
    normalizeRuntimeTurnId(message) || "",
    message.role,
    normalizeSignatureText(message.content),
    stableJsonSignature(message.images || []),
    stableJsonSignature(message.contentParts || []),
    stableJsonSignature(message.toolCalls || []),
    stableJsonSignature(message.artifacts || []),
    stableJsonSignature(message.usage || null),
  ].join("::");
}

function messageRichnessScore(message: Message): number {
  return (
    normalizeSignatureText(message.content).length +
    (message.images?.length || 0) * 40 +
    (message.contentParts?.length || 0) * 30 +
    (message.toolCalls?.length || 0) * 30 +
    (message.artifacts?.length || 0) * 20 +
    (message.usage ? 10 : 0)
  );
}

function areDuplicateRuntimeTurnMessages(
  left: OrderedMessage,
  right: OrderedMessage,
): boolean {
  const leftRuntimeTurnId = normalizeRuntimeTurnId(left.message);
  const rightRuntimeTurnId = normalizeRuntimeTurnId(right.message);
  if (!leftRuntimeTurnId || leftRuntimeTurnId !== rightRuntimeTurnId) {
    return false;
  }
  if (left.message.role !== right.message.role) {
    return false;
  }

  const leftTimestamp = messageTimestampMs(left.message);
  const rightTimestamp = messageTimestampMs(right.message);
  if (
    leftTimestamp !== null &&
    rightTimestamp !== null &&
    Math.abs(leftTimestamp - rightTimestamp) > 5000
  ) {
    return false;
  }

  return (
    messageDuplicateSignature(left.message) ===
    messageDuplicateSignature(right.message)
  );
}

function dedupeRuntimeTurnEntries(entries: OrderedMessage[]): OrderedMessage[] {
  const deduped: OrderedMessage[] = [];

  for (const entry of entries) {
    const previous = deduped[deduped.length - 1];
    if (!previous || !areDuplicateRuntimeTurnMessages(previous, entry)) {
      deduped.push(entry);
      continue;
    }

    if (
      messageRichnessScore(entry.message) >
      messageRichnessScore(previous.message)
    ) {
      deduped[deduped.length - 1] = entry;
    }
  }

  return deduped;
}

function sortedRuntimeTurnEntries(bucket: RuntimeTurnBucket): OrderedMessage[] {
  return dedupeRuntimeTurnEntries(
    [...bucket.entries].sort(compareRuntimeTurnEntries),
  );
}

export function projectConversationMessagesByRuntimeTurn(
  messages: Message[],
): Message[] {
  const orderedEntries = messages.map((message, originalIndex) => ({
    message,
    originalIndex,
  }));
  const buckets = new Map<string, RuntimeTurnBucket>();

  for (const entry of orderedEntries) {
    const runtimeTurnId = normalizeRuntimeTurnId(entry.message);
    if (!runtimeTurnId) {
      continue;
    }

    const bucket =
      buckets.get(runtimeTurnId) ??
      createRuntimeTurnBucket(runtimeTurnId, entry);
    if (bucket.entries[0] !== entry) {
      appendToRuntimeTurnBucket(bucket, entry);
    }
    buckets.set(runtimeTurnId, bucket);
  }

  if (buckets.size === 0) {
    return messages;
  }

  const emittedIndexes = new Set<number>();
  const output: Message[] = [];
  const sortedBuckets = [...buckets.values()].sort(compareRuntimeTurnBuckets);

  for (const entry of orderedEntries) {
    if (emittedIndexes.has(entry.originalIndex)) {
      continue;
    }

    const runtimeTurnId = normalizeRuntimeTurnId(entry.message);
    if (!runtimeTurnId) {
      output.push(entry.message);
      emittedIndexes.add(entry.originalIndex);
      continue;
    }

    const bucket = buckets.get(runtimeTurnId);
    if (!bucket || bucket.anchorIndex !== entry.originalIndex) {
      continue;
    }

    const bucketEntries = sortedRuntimeTurnEntries(bucket);
    output.push(...bucketEntries.map((bucketEntry) => bucketEntry.message));
    for (const bucketEntry of bucket.entries) {
      emittedIndexes.add(bucketEntry.originalIndex);
    }
  }

  if (emittedIndexes.size === orderedEntries.length) {
    return output;
  }

  const missingBuckets = sortedBuckets.filter((bucket) =>
    bucket.entries.some((entry) => !emittedIndexes.has(entry.originalIndex)),
  );
  for (const bucket of missingBuckets) {
    const bucketEntries = sortedRuntimeTurnEntries(bucket);
    output.push(...bucketEntries.map((entry) => entry.message));
    for (const bucketEntry of bucket.entries) {
      emittedIndexes.add(bucketEntry.originalIndex);
    }
  }

  for (const entry of orderedEntries) {
    if (!emittedIndexes.has(entry.originalIndex)) {
      output.push(entry.message);
      emittedIndexes.add(entry.originalIndex);
    }
  }

  return output;
}
