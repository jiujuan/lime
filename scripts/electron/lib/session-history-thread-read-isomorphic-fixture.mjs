import path from "node:path";

export const THREAD_READ_PAGE_ISOMORPHIC = {
  sessionId: "",
  threadId: "",
  workspaceId: null,
  title: "Electron thread read page isomorphic fixture",
  turns: [
    {
      turnId: "thread-read-isomorphic-turn-1",
      reasoningItemId: "item_thread-read-isomorphic-reasoning-1",
      assistantItemId: "item_thread-read-isomorphic-assistant-1",
      userText: "第一轮：建立 thread read 同构基线。",
      reasoningText: "第一轮 reasoning：先确认 read page 的 thread id。",
      assistantText: "第一轮结果：read/list/resume 使用同一 thread。",
    },
    {
      turnId: "thread-read-isomorphic-turn-2",
      reasoningItemId: "item_thread-read-isomorphic-reasoning-2",
      assistantItemId: "item_thread-read-isomorphic-assistant-2",
      userText: "第二轮：验证分页不会重排。",
      reasoningText: "第二轮 reasoning：分页窗口只能移动 cursor。",
      assistantText: "第二轮结果：分页窗口保持稳定顺序。",
    },
    {
      turnId: "thread-read-isomorphic-turn-3",
      reasoningItemId: "item_thread-read-isomorphic-reasoning-3",
      assistantItemId: "item_thread-read-isomorphic-assistant-3",
      userText: "第三轮：恢复后 DOM 要和 read model 同源。",
      reasoningText: "第三轮 reasoning：hydrate 必须使用 read model。",
      assistantText: "第三轮结果：hydrate 不再二次拼装 timeline。",
    },
  ],
};

function canonicalTurn({ sessionId, threadId, turn, timestampMs }) {
  return {
    sessionId,
    threadId,
    turnId: turn.turnId,
    status: "completed",
    admission: "accepted",
    queue: { state: "running" },
    approval: "notRequired",
    items: [],
    itemsView: "notLoaded",
    createdAtMs: timestampMs,
    updatedAtMs: timestampMs + 3_000,
    startedAtMs: timestampMs,
    completedAtMs: timestampMs + 3_000,
    durationMs: 3_000,
  };
}

function canonicalItem({
  sessionId,
  threadId,
  turnId,
  itemId,
  sequence,
  timestampMs,
  kind,
  payload,
}) {
  return {
    sessionId,
    threadId,
    turnId,
    itemId,
    sequence,
    ordinal: sequence,
    createdAtMs: timestampMs,
    updatedAtMs: timestampMs,
    completedAtMs: timestampMs,
    kind,
    status: "completed",
    payload,
    metadata: { source: "thread_read_page_isomorphic" },
  };
}

function sqlRow(values) {
  return `(${values.join(", ")})`;
}

export function seedThreadReadPageIsomorphicCanonicalThread({
  runtimeEnv,
  runSqlite,
  sqlLiteral,
  thread,
}) {
  const sessionId = String(thread?.sessionId || "").trim();
  const threadId = String(thread?.id || "").trim();
  if (!sessionId || !threadId) {
    throw new Error("thread/start 未返回 canonical session/thread identity");
  }
  THREAD_READ_PAGE_ISOMORPHIC.sessionId = sessionId;
  THREAD_READ_PAGE_ISOMORPHIC.threadId = threadId;

  const sqliteRoot = path.join(
    runtimeEnv.electronUserDataDir,
    "app-server",
    "sqlite",
  );
  const statePath = path.join(sqliteRoot, "state.sqlite");
  const threadHistoryPath = path.join(sqliteRoot, "thread_history.sqlite");
  const baseTimestampMs = Date.now() - 20_000;
  let sequence = 0;
  const turns = [];
  const items = [];

  for (const [index, turn] of THREAD_READ_PAGE_ISOMORPHIC.turns.entries()) {
    const turnTimestampMs = baseTimestampMs + index * 5_000;
    const canonical = canonicalTurn({
      sessionId,
      threadId,
      turn,
      timestampMs: turnTimestampMs,
    });
    turns.push({ ordinal: index + 1, lastSequence: sequence + 3, canonical });
    items.push(
      canonicalItem({
        sessionId,
        threadId,
        turnId: turn.turnId,
        itemId: `item_user-${turn.turnId}`,
        sequence: ++sequence,
        timestampMs: turnTimestampMs + 500,
        kind: "userMessage",
        payload: { type: "userMessage", content: turn.userText },
      }),
      canonicalItem({
        sessionId,
        threadId,
        turnId: turn.turnId,
        itemId: turn.reasoningItemId,
        sequence: ++sequence,
        timestampMs: turnTimestampMs + 1_500,
        kind: "reasoning",
        payload: {
          type: "reasoning",
          summary: [turn.reasoningText],
          content: [turn.reasoningText],
        },
      }),
      canonicalItem({
        sessionId,
        threadId,
        turnId: turn.turnId,
        itemId: turn.assistantItemId,
        sequence: ++sequence,
        timestampMs: turnTimestampMs + 2_500,
        kind: "agentMessage",
        payload: {
          type: "agentMessage",
          text: turn.assistantText,
          phase: "final",
        },
      }),
    );
  }

  const turnRows = turns
    .map(({ ordinal, lastSequence, canonical }) =>
      sqlRow([
        sqlLiteral(threadId),
        sqlLiteral(canonical.turnId),
        ordinal,
        lastSequence,
        sqlLiteral(JSON.stringify(canonical)),
      ]),
    )
    .join(",\n  ");
  const itemRows = items
    .map((item) =>
      sqlRow([
        sqlLiteral(threadId),
        sqlLiteral(item.turnId),
        sqlLiteral(item.itemId),
        item.ordinal,
        item.sequence,
        sqlLiteral(JSON.stringify(item)),
      ]),
    )
    .join(",\n  ");
  const updatedAtMs = baseTimestampMs + 13_000;

  runSqlite(
    statePath,
    `
PRAGMA busy_timeout = 5000;
ATTACH DATABASE ${sqlLiteral(threadHistoryPath)} AS thread_history;
BEGIN IMMEDIATE;
DELETE FROM thread_history.canonical_items WHERE thread_id = ${sqlLiteral(threadId)};
DELETE FROM thread_history.canonical_turns WHERE thread_id = ${sqlLiteral(threadId)};
INSERT INTO thread_history.canonical_turns (
  thread_id, turn_id, ordinal, last_sequence, turn_json
) VALUES
  ${turnRows};
INSERT INTO thread_history.canonical_items (
  thread_id, turn_id, item_id, ordinal, sequence, item_json
) VALUES
  ${itemRows};
UPDATE canonical_threads
SET thread_json = json_set(
      thread_json,
      '$.status', json('{"type":"idle"}'),
      '$.updatedAtMs', ${updatedAtMs},
      '$.recencyAtMs', ${updatedAtMs},
      '$.preview', ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.turns[2].assistantText)},
      '$.name', ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.title)}
    ),
    updated_at_ms = ${updatedAtMs},
    recency_at_ms = ${updatedAtMs},
    last_sequence = ${sequence}
WHERE thread_id = ${sqlLiteral(threadId)};
COMMIT;
DETACH DATABASE thread_history;
`,
  );

  return {
    statePath,
    threadHistoryPath,
    sessionId,
    threadId,
    rolloutPath: thread.path ?? null,
    turnIds: THREAD_READ_PAGE_ISOMORPHIC.turns.map((turn) => turn.turnId),
    itemIds: items.map((item) => item.itemId),
  };
}
