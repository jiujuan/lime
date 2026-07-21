import {
  APP_SERVER_METHOD_SESSION_READ,
  INPUTBAR_PENDING_STEER_SECOND_PROMPT,
  INPUTBAR_RICH_RESTORE_PATH,
  INPUTBAR_RICH_RESTORE_PATH_NAME,
  INPUTBAR_RICH_RESTORE_PROMPT,
  INPUTBAR_RICH_RESTORE_SKILL_NAME,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  findReadModelQueuedTurnForPrompt,
  readModelQueuedTurns,
  readModelQueuedTurnId,
  readModelQueuedTurnText,
} from "./claw-chat-current-fixture-read-model-core.mjs";
import { invokeAppServerFromPage } from "./claw-chat-current-fixture-rpc.mjs";
import {
  readArray,
  readRecord,
  sanitizeJson,
  sleep,
} from "./claw-chat-current-fixture-utils.mjs";

function firstNonEmptyArray(record, ...keys) {
  for (const key of keys) {
    const values = readArray(record, key);
    if (values.length > 0) {
      return values;
    }
  }
  return [];
}

function summarizeQueuedRichRestoreTurn(queuedTurn) {
  const record = readRecord(queuedTurn) ?? {};
  const attachments = firstNonEmptyArray(
    record,
    "input_attachments",
    "inputAttachments",
    "attachments",
  );
  const pathReferences = firstNonEmptyArray(
    record,
    "path_references",
    "pathReferences",
  );
  const textElements = firstNonEmptyArray(
    record,
    "text_elements",
    "textElements",
  );
  const capabilityRoute =
    readRecord(record.input_capability_route) ??
    readRecord(record.inputCapabilityRoute) ??
    null;
  const serialized = JSON.stringify(record);
  const imageAttachmentCount = attachments.filter((attachment) => {
    const attachmentRecord = readRecord(attachment) ?? {};
    const metadata = readRecord(attachmentRecord.metadata) ?? {};
    return (
      attachmentRecord.kind === "image" ||
      String(attachmentRecord.mediaType ?? attachmentRecord.media_type ?? "")
        .toLowerCase()
        .startsWith("image/") ||
      String(metadata.mediaType ?? metadata.media_type ?? "")
        .toLowerCase()
        .startsWith("image/")
    );
  }).length;
  const pathReferenceNames = pathReferences
    .map((reference) => readRecord(reference)?.name)
    .filter((value) => typeof value === "string");
  const pathReferencePaths = pathReferences
    .map((reference) => readRecord(reference)?.path)
    .filter((value) => typeof value === "string");
  const textElementTexts = textElements
    .map((element) => readRecord(element)?.text)
    .filter((value) => typeof value === "string");
  return sanitizeJson({
    turnId: readModelQueuedTurnId(record),
    status: record.status ?? null,
    text: readModelQueuedTurnText(record),
    imageCount: record.image_count ?? record.imageCount ?? null,
    attachmentCount: attachments.length,
    imageAttachmentCount,
    pathReferenceCount: pathReferences.length,
    pathReferenceNames,
    pathReferencePaths,
    textElementCount: textElements.length,
    textElementTexts,
    capabilityRoute,
    skillName:
      capabilityRoute?.skillName ??
      capabilityRoute?.skill_name ??
      capabilityRoute?.name ??
      null,
    includesPrompt: serialized.includes(INPUTBAR_RICH_RESTORE_PROMPT),
    imagePreserved:
      imageAttachmentCount >= 1 ||
      Number(record.image_count ?? record.imageCount ?? 0) >= 1,
    pathPreserved:
      pathReferenceNames.includes(INPUTBAR_RICH_RESTORE_PATH_NAME) ||
      pathReferencePaths.includes(INPUTBAR_RICH_RESTORE_PATH) ||
      serialized.includes(INPUTBAR_RICH_RESTORE_PATH_NAME),
    textElementsPreserved:
      textElements.length > 0 &&
      JSON.stringify(textElements).includes(INPUTBAR_RICH_RESTORE_PROMPT),
    skillPreserved:
      String(
        capabilityRoute?.skillName ??
          capabilityRoute?.skill_name ??
          capabilityRoute?.name ??
          "",
      ).includes(INPUTBAR_RICH_RESTORE_SKILL_NAME) ||
      serialized.includes(INPUTBAR_RICH_RESTORE_SKILL_NAME),
  });
}

function readQueuedTurnPosition(value) {
  const record = readRecord(value) ?? {};
  const raw = record.position ?? record.queue_position ?? record.queuePosition;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function collectUniqueQueuedTurns(readModel) {
  const seen = new Set();
  return readModelQueuedTurns(readModel).filter((turn, index) => {
    const id = readModelQueuedTurnId(turn);
    const text = readModelQueuedTurnText(turn);
    const key = id || `${text ?? ""}:${index}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function summarizeQueuedPlainTurn(queuedTurn, prompt) {
  const record = readRecord(queuedTurn) ?? {};
  const text = readModelQueuedTurnText(record);
  return sanitizeJson({
    turnId: readModelQueuedTurnId(record),
    status: record.status ?? null,
    position: readQueuedTurnPosition(record),
    text,
    includesPrompt:
      typeof text === "string"
        ? text.includes(prompt)
        : JSON.stringify(record).includes(prompt),
  });
}

function summarizePendingSteerQueue(readModel) {
  const queuedTurns = collectUniqueQueuedTurns(readModel);
  const queuedSummaries = queuedTurns.map((turn) =>
    summarizeQueuedPlainTurn(turn, ""),
  );
  const richIndex = queuedTurns.findIndex((turn) =>
    JSON.stringify(turn || {}).includes(INPUTBAR_RICH_RESTORE_PROMPT),
  );
  const secondIndex = queuedTurns.findIndex((turn) =>
    JSON.stringify(turn || {}).includes(INPUTBAR_PENDING_STEER_SECOND_PROMPT),
  );
  const richTurn = richIndex >= 0 ? queuedTurns[richIndex] : null;
  const secondTurn = secondIndex >= 0 ? queuedTurns[secondIndex] : null;
  const richPosition = richTurn ? readQueuedTurnPosition(richTurn) : null;
  const secondPosition = secondTurn ? readQueuedTurnPosition(secondTurn) : null;

  return sanitizeJson({
    queuedTurnCount: queuedTurns.length,
    queuedTurns: queuedSummaries,
    promptOrder: queuedTurns.map((turn) => {
      const serialized = JSON.stringify(turn || {});
      if (serialized.includes(INPUTBAR_RICH_RESTORE_PROMPT)) {
        return "rich";
      }
      if (serialized.includes(INPUTBAR_PENDING_STEER_SECOND_PROMPT)) {
        return "second";
      }
      return "other";
    }),
    richIndex,
    secondIndex,
    richPosition,
    secondPosition,
    multipleQueued: queuedTurns.length >= 2,
    orderPreserved:
      richIndex >= 0 &&
      secondIndex >= 0 &&
      richIndex < secondIndex &&
      richPosition === 0 &&
      secondPosition === 1,
    secondTextQueued: secondIndex >= 0,
    secondTurn: secondTurn
      ? summarizeQueuedPlainTurn(
          secondTurn,
          INPUTBAR_PENDING_STEER_SECOND_PROMPT,
        )
      : null,
  });
}

export async function waitForInputbarPendingSteerQueuedReadModel(
  page,
  options,
  requestLog,
  threadId,
  { requireSecondQueued = false } = {},
) {
  const startedAt = Date.now();
  let lastRead = null;
  let lastSummary = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        threadId,
        includeTurns: true,
      },
      requestLog,
    );
    lastRead = read.result;
    const queuedTurn = findReadModelQueuedTurnForPrompt(
      read.result,
      INPUTBAR_RICH_RESTORE_PROMPT,
    );
    lastSummary = queuedTurn
      ? {
          ...summarizeQueuedRichRestoreTurn(queuedTurn),
          queue: summarizePendingSteerQueue(read.result),
        }
      : sanitizeJson({
          queuedTurnFound: false,
          serializedIncludesPrompt: JSON.stringify(read.result || {}).includes(
            INPUTBAR_RICH_RESTORE_PROMPT,
          ),
          queue: summarizePendingSteerQueue(read.result),
        });
    if (
      queuedTurn &&
      lastSummary.includesPrompt === true &&
      lastSummary.imagePreserved === true &&
      lastSummary.pathPreserved === true &&
      lastSummary.textElementsPreserved === true &&
      lastSummary.skillPreserved === true &&
      (!requireSecondQueued ||
        (lastSummary.queue?.multipleQueued === true &&
          lastSummary.queue?.orderPreserved === true &&
          lastSummary.queue?.secondTextQueued === true))
    ) {
      return {
        ...lastSummary,
        queuedTurnFound: true,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未保留 pending steer rich queued turn: ${JSON.stringify(
      sanitizeJson({
        summary: lastSummary,
        readModel: lastRead,
      }),
    )}`,
  );
}

export function summarizeRichPromptBackendDeferral(ledger) {
  const richTurnStarts = ledger.filter(
    (entry) =>
      entry.kind === "turnStart" &&
      String(entry.inputText || "").includes(INPUTBAR_RICH_RESTORE_PROMPT),
  );
  return sanitizeJson({
    richPromptStarted: richTurnStarts.length > 0,
    secondPromptStarted: ledger.some(
      (entry) =>
        entry.kind === "turnStart" &&
        String(entry.inputText || "").includes(
          INPUTBAR_PENDING_STEER_SECOND_PROMPT,
        ),
    ),
    richPromptTurnStartCount: richTurnStarts.length,
    turnStartTexts: ledger
      .filter((entry) => entry.kind === "turnStart")
      .map((entry) => String(entry.inputText || "").slice(0, 120)),
  });
}

export async function waitForInputbarPendingSteerPopFrontReadModel(
  page,
  options,
  requestLog,
  threadId,
) {
  const startedAt = Date.now();
  let lastRead = null;
  let lastSummary = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        threadId,
        includeTurns: true,
      },
      requestLog,
    );
    lastRead = read.result;
    const serialized = JSON.stringify(read.result || {});
    const queue = summarizePendingSteerQueue(read.result);
    lastSummary = sanitizeJson({
      queue,
      richPromptStillQueued: queue.richIndex >= 0,
      richPromptInReadModel: serialized.includes(INPUTBAR_RICH_RESTORE_PROMPT),
      secondPromptQueued: queue.secondIndex === 0,
      secondPositionZero: queue.secondPosition === 0,
    });
    if (
      lastSummary.richPromptStillQueued === false &&
      lastSummary.richPromptInReadModel === true &&
      lastSummary.secondPromptQueued === true &&
      lastSummary.secondPositionZero === true
    ) {
      return lastSummary;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Inputbar pending steer pop-front 后 read model 未完成队列重排: ${JSON.stringify(
      sanitizeJson({
        summary: lastSummary,
        readModel: lastRead,
      }),
    )}`,
  );
}
