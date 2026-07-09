import fs from "node:fs";
import path from "node:path";

export const THREAD_READ_PAGE_ISOMORPHIC = {
  sessionId: "agent-session-thread-read-isomorphic",
  threadId: "agent-session-thread-read-isomorphic",
  workspaceId: null,
  workspaceRecordId: "agent-session-thread-read-isomorphic-workspace",
  title: "Electron thread read page isomorphic fixture",
  turns: [
    {
      turnId: "thread-read-isomorphic-turn-1",
      userEventId: "thread-read-isomorphic-user-1",
      reasoningItemId: "thread-read-isomorphic-reasoning-1",
      assistantItemId: "thread-read-isomorphic-assistant-1",
      userText: "第一轮：建立 thread read 同构基线。",
      reasoningText: "第一轮 reasoning：先确认 read page 的 thread id。",
      assistantText: "第一轮结果：read/list/resume 使用同一 thread。",
    },
    {
      turnId: "thread-read-isomorphic-turn-2",
      userEventId: "thread-read-isomorphic-user-2",
      reasoningItemId: "thread-read-isomorphic-reasoning-2",
      assistantItemId: "thread-read-isomorphic-assistant-2",
      userText: "第二轮：验证分页不会重排。",
      reasoningText: "第二轮 reasoning：分页窗口只能移动 cursor。",
      assistantText: "第二轮结果：分页窗口保持稳定顺序。",
    },
    {
      turnId: "thread-read-isomorphic-turn-3",
      userEventId: "thread-read-isomorphic-user-3",
      reasoningItemId: "thread-read-isomorphic-reasoning-3",
      assistantItemId: "thread-read-isomorphic-assistant-3",
      userText: "第三轮：恢复后 DOM 要和 read model 同源。",
      reasoningText: "第三轮 reasoning：hydrate 必须使用 read model。",
      assistantText: "第三轮结果：hydrate 不再二次拼装 timeline。",
    },
  ],
};

function isoTimestamp(baseMs, offsetMs) {
  return new Date(baseMs + offsetMs).toISOString();
}

function fixtureDatabasePath(runtimeEnv) {
  return path.join(runtimeEnv.electronUserDataDir, "app-server", "lime.db");
}

function projectionDatabasePath(runtimeEnv) {
  return path.join(
    runtimeEnv.electronUserDataDir,
    "app-server",
    "runtime",
    "projection_1.sqlite",
  );
}

function eventLogPath(runtimeEnv) {
  return path.join(
    runtimeEnv.electronUserDataDir,
    "app-server",
    "runtime",
    "events",
    "sessions",
    `session_${THREAD_READ_PAGE_ISOMORPHIC.sessionId}.jsonl`,
  );
}

function jsonSql(sqlLiteral, value) {
  return sqlLiteral(JSON.stringify(value));
}

function nullableSql(sqlLiteral, value) {
  return value == null ? "NULL" : sqlLiteral(value);
}

function threadReadEvents({ workspaceRoot, baseTimestampMs }) {
  const events = [];
  let sequence = 1;
  for (const [index, turn] of THREAD_READ_PAGE_ISOMORPHIC.turns.entries()) {
    const turnStartedAt = isoTimestamp(baseTimestampMs, index * 4_000 + 1_000);
    const userAt = isoTimestamp(baseTimestampMs, index * 4_000 + 1_500);
    const reasoningAt = isoTimestamp(baseTimestampMs, index * 4_000 + 2_000);
    const assistantAt = isoTimestamp(baseTimestampMs, index * 4_000 + 2_500);
    const completedAt = isoTimestamp(baseTimestampMs, index * 4_000 + 3_000);
    events.push(
      {
        eventId: `${turn.turnId}-accepted`,
        sequence: sequence++,
        sessionId: THREAD_READ_PAGE_ISOMORPHIC.sessionId,
        threadId: THREAD_READ_PAGE_ISOMORPHIC.threadId,
        turnId: turn.turnId,
        type: "turn.accepted",
        timestamp: turnStartedAt,
        payload: {
          session: {
            title: THREAD_READ_PAGE_ISOMORPHIC.title,
            workspaceId: THREAD_READ_PAGE_ISOMORPHIC.workspaceId,
            workingDir: workspaceRoot,
            executionStrategy: "react",
          },
        },
      },
      {
        eventId: turn.userEventId,
        sequence: sequence++,
        sessionId: THREAD_READ_PAGE_ISOMORPHIC.sessionId,
        threadId: THREAD_READ_PAGE_ISOMORPHIC.threadId,
        turnId: turn.turnId,
        type: "message.created",
        timestamp: userAt,
        payload: {
          role: "user",
          visibility: "user_visible",
          input: {
            text: turn.userText,
            attachments: [],
          },
          content: {
            kind: "inline_text",
            text: turn.userText,
          },
          textElements: [
            {
              type: "text",
              text: turn.userText,
            },
          ],
          text_elements: [
            {
              type: "text",
              text: turn.userText,
            },
          ],
        },
      },
      {
        eventId: turn.reasoningItemId,
        sequence: sequence++,
        sessionId: THREAD_READ_PAGE_ISOMORPHIC.sessionId,
        threadId: THREAD_READ_PAGE_ISOMORPHIC.threadId,
        turnId: turn.turnId,
        type: "item.completed",
        timestamp: reasoningAt,
        payload: {
          item: {
            id: turn.reasoningItemId,
            type: "reasoning",
            status: "completed",
            sequence: sequence - 1,
            started_at: reasoningAt,
            updated_at: reasoningAt,
            completed_at: reasoningAt,
            payload: {
              type: "reasoning",
              text: turn.reasoningText,
              summary: [turn.reasoningText],
              metadata: {
                source: "thread_read_page_isomorphic",
              },
            },
          },
        },
      },
      {
        eventId: turn.assistantItemId,
        sequence: sequence++,
        sessionId: THREAD_READ_PAGE_ISOMORPHIC.sessionId,
        threadId: THREAD_READ_PAGE_ISOMORPHIC.threadId,
        turnId: turn.turnId,
        type: "message.delta",
        timestamp: assistantAt,
        payload: {
          id: turn.assistantItemId,
          phase: "final",
          text: turn.assistantText,
          content: {
            text: turn.assistantText,
          },
        },
      },
      {
        eventId: `${turn.turnId}-completed`,
        sequence: sequence++,
        sessionId: THREAD_READ_PAGE_ISOMORPHIC.sessionId,
        threadId: THREAD_READ_PAGE_ISOMORPHIC.threadId,
        turnId: turn.turnId,
        type: "turn.completed",
        timestamp: completedAt,
        payload: {},
      },
    );
  }
  return events;
}

export function seedThreadReadPageIsomorphicProjectionSession({
  runtimeEnv,
  runSqlite,
  sqlLiteral,
}) {
  const dbPath = fixtureDatabasePath(runtimeEnv);
  const projectionPath = projectionDatabasePath(runtimeEnv);
  const workspaceRoot = path.join(
    runtimeEnv.persistedWorkspaceRoot,
    "thread-read-page-isomorphic",
  );
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const baseTimestampMs = Date.now();
  const events = threadReadEvents({
    workspaceRoot,
    baseTimestampMs,
  });
  const createdAt = isoTimestamp(baseTimestampMs, 0);
  const updatedAt = events[events.length - 1]?.timestamp ?? createdAt;
  const createdAtMs = baseTimestampMs;
  const updatedAtMs = baseTimestampMs + 12_000;
  const sessionMetadata = {
    title: THREAD_READ_PAGE_ISOMORPHIC.title,
    model: "fixture-model",
    modelName: "fixture-model",
    providerName: "fixture-provider",
    workingDir: workspaceRoot,
    executionStrategy: "react",
  };

  runSqlite(
    dbPath,
    `
PRAGMA busy_timeout = 5000;
DELETE FROM agent_sessions WHERE id = ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.sessionId)};
INSERT OR REPLACE INTO workspaces (
  id, name, workspace_type, root_path, is_default, settings_json,
  created_at, updated_at, icon, color, is_favorite, is_archived,
  tags_json, default_persona_id
) VALUES (
  ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.workspaceRecordId)},
  'Electron thread read page isomorphic workspace',
  'persistent',
  ${sqlLiteral(workspaceRoot)},
  0,
  '{}',
  ${createdAtMs},
  ${updatedAtMs},
  NULL,
  NULL,
  0,
  0,
  '[]',
  NULL
);
INSERT INTO agent_sessions (
  id, model, system_prompt, title, created_at, updated_at,
  working_dir, execution_strategy, session_type, extension_data_json,
  provider_name, model_config_json, archived_at
) VALUES (
  ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.sessionId)},
  'fixture-model',
  NULL,
  ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.title)},
  ${sqlLiteral(createdAt)},
  ${sqlLiteral(updatedAt)},
  ${sqlLiteral(workspaceRoot)},
  'react',
  'user',
  '{}',
  'fixture-provider',
  '{"model_name":"fixture-model"}',
  NULL
);
`,
  );

  const turnRows = THREAD_READ_PAGE_ISOMORPHIC.turns
    .map((turn, index) => {
      const turnStartedAt = isoTimestamp(baseTimestampMs, index * 4_000 + 1_000);
      const turnCompletedAt = isoTimestamp(
        baseTimestampMs,
        index * 4_000 + 3_000,
      );
      return `(
    ${sqlLiteral(turn.turnId)},
    ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.sessionId)},
    ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.threadId)},
    'completed',
        ${sqlLiteral(turnStartedAt)},
        ${sqlLiteral(turnCompletedAt)},
    ${(index + 1) * 5}
  )`;
    })
    .join(",\n  ");
  const projectedRows = events
    .filter((event) => event.type !== "turn.accepted")
    .map(
      (event) => `(
    ${sqlLiteral(event.eventId)},
    ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.sessionId)},
    ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.threadId)},
    ${sqlLiteral(event.turnId)},
    ${event.sequence},
    ${sqlLiteral(event.type)},
    ${jsonSql(sqlLiteral, event.payload)},
    ${sqlLiteral(event.timestamp)}
  )`,
    )
    .join(",\n  ");

  runSqlite(
    projectionPath,
    `
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS projected_sessions (
  session_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  title TEXT,
  model TEXT,
  workspace_id TEXT,
  working_dir TEXT,
  execution_strategy TEXT,
  metadata_json TEXT,
  last_event_sequence INTEGER NOT NULL DEFAULT 0,
  last_event_id TEXT
);
CREATE TABLE IF NOT EXISTS projected_turns (
  turn_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  last_event_sequence INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES projected_sessions(session_id)
);
CREATE TABLE IF NOT EXISTS projected_items (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  turn_id TEXT,
  sequence INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  payload_summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES projected_sessions(session_id)
);
CREATE TABLE IF NOT EXISTS projection_watermarks (
  session_id TEXT PRIMARY KEY,
  last_sequence INTEGER NOT NULL,
  last_event_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projected_sessions_updated
  ON projected_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projected_turns_session_sequence
  ON projected_turns(session_id, last_event_sequence);
CREATE INDEX IF NOT EXISTS idx_projected_items_session_sequence
  ON projected_items(session_id, sequence);
DELETE FROM projected_items WHERE session_id = ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.sessionId)};
DELETE FROM projected_turns WHERE session_id = ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.sessionId)};
DELETE FROM projection_watermarks WHERE session_id = ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.sessionId)};
DELETE FROM projected_sessions WHERE session_id = ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.sessionId)};
INSERT INTO projected_sessions (
  session_id, thread_id, status, created_at, updated_at, archived_at,
  title, model, workspace_id, working_dir, execution_strategy,
  metadata_json, last_event_sequence, last_event_id
) VALUES (
  ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.sessionId)},
  ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.threadId)},
  'completed',
  ${sqlLiteral(createdAt)},
  ${sqlLiteral(updatedAt)},
  NULL,
  ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.title)},
  'fixture-model',
  ${nullableSql(sqlLiteral, THREAD_READ_PAGE_ISOMORPHIC.workspaceId)},
  ${sqlLiteral(workspaceRoot)},
  'react',
  ${jsonSql(sqlLiteral, sessionMetadata)},
  ${events.length},
  ${sqlLiteral(events[events.length - 1]?.eventId ?? "")}
);
INSERT INTO projected_turns (
  turn_id, session_id, thread_id, status, started_at, completed_at,
  last_event_sequence
) VALUES
  ${turnRows};
INSERT INTO projected_items (
  event_id, session_id, thread_id, turn_id, sequence, item_type,
  payload_summary_json, created_at
) VALUES
  ${projectedRows};
INSERT INTO projection_watermarks (
  session_id, last_sequence, last_event_id, updated_at
) VALUES (
  ${sqlLiteral(THREAD_READ_PAGE_ISOMORPHIC.sessionId)},
  ${events.length},
  ${sqlLiteral(events[events.length - 1]?.eventId ?? "")},
  ${sqlLiteral(updatedAt)}
);
`,
  );

  const logPath = eventLogPath(runtimeEnv);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    logPath,
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );

  return {
    dbPath,
    projectionPath,
    eventLogPath: logPath,
    sessionId: THREAD_READ_PAGE_ISOMORPHIC.sessionId,
    workspaceId: THREAD_READ_PAGE_ISOMORPHIC.workspaceId,
    workspaceRecordId: THREAD_READ_PAGE_ISOMORPHIC.workspaceRecordId,
    threadId: THREAD_READ_PAGE_ISOMORPHIC.threadId,
    turnIds: THREAD_READ_PAGE_ISOMORPHIC.turns.map((turn) => turn.turnId),
    assistantItemIds: THREAD_READ_PAGE_ISOMORPHIC.turns.map(
      (turn) => turn.assistantItemId,
    ),
    reasoningItemIds: THREAD_READ_PAGE_ISOMORPHIC.turns.map(
      (turn) => turn.reasoningItemId,
    ),
    eventCount: events.length,
  };
}
