import fs from "node:fs";
import path from "node:path";

export const HISTORY_REPLAY_VISUAL = {
  sessionId: "agent-session-history-replay-visual",
  threadId: "agent-session-history-replay-visual",
  workspaceId: "agent-session-history-replay-visual-workspace",
  turnId: "agent-session-history-replay-visual-turn",
  title: "Electron history replay visual fixture",
  userText: "请结合本地截图和远程参考图，先说明思路再调用 MCP。",
  userTextElement: "本地截图重点：保留图像引用，不要退化成 Image 占位文本。",
  assistantText: "我会先保留 reasoning，再等待 MCP 返回后继续。",
  reasoningItemId: "history-replay-visual-reasoning",
  reasoningSummary: "先确认本地图片和远程参考图都应作为结构化输入恢复。",
  mcpItemId: "history-replay-visual-mcp-read-file",
  mcpToolName: "mcp__filesystem__read_file",
  remoteImageUrl: "https://example.invalid/history-replay-visual.png",
};

const LOCAL_IMAGE_FILE = "history-replay-visual-local.png";
const LOCAL_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function isoTimestamp(baseMs, offsetMs) {
  return new Date(baseMs + offsetMs).toISOString();
}

export function isHistoryReplayVisualLocalImagePath(value) {
  return String(value || "").endsWith(LOCAL_IMAGE_FILE);
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
    `session_${HISTORY_REPLAY_VISUAL.sessionId}.jsonl`,
  );
}

function writeLocalImage(runtimeEnv) {
  const imagePath = path.join(
    runtimeEnv.persistedWorkspaceRoot,
    LOCAL_IMAGE_FILE,
  );
  fs.mkdirSync(path.dirname(imagePath), { recursive: true });
  fs.writeFileSync(imagePath, Buffer.from(LOCAL_IMAGE_BASE64, "base64"));
  return imagePath;
}

function jsonSql(sqlLiteral, value) {
  return sqlLiteral(JSON.stringify(value));
}

function historyReplayAttachments(localImagePath) {
  return [
    {
      kind: "image",
      uri: localImagePath,
      metadata: {
        index: 0,
        mediaType: "image/png",
        localPath: localImagePath,
        source: "history_replay_visual_local",
      },
    },
    {
      kind: "image",
      uri: HISTORY_REPLAY_VISUAL.remoteImageUrl,
      metadata: {
        index: 1,
        mediaType: "image/png",
        source: "history_replay_visual_remote",
      },
    },
  ];
}

function historyReplayEvents({ localImagePath, workspaceRoot, baseTimestampMs }) {
  const startedAt = isoTimestamp(baseTimestampMs, 1_000);
  const reasoningAt = isoTimestamp(baseTimestampMs, 2_000);
  const mcpStartedAt = isoTimestamp(baseTimestampMs, 3_000);
  const assistantAt = isoTimestamp(baseTimestampMs, 4_000);
  const attachments = historyReplayAttachments(localImagePath);
  const userPayload = {
    role: "user",
    visibility: "user_visible",
    input: {
      text: HISTORY_REPLAY_VISUAL.userText,
      attachments,
    },
    content: {
      kind: "inline_text",
      text: HISTORY_REPLAY_VISUAL.userText,
    },
    attachments,
    textElements: [
      {
        type: "text",
        text: HISTORY_REPLAY_VISUAL.userTextElement,
      },
    ],
    text_elements: [
      {
        type: "text",
        text: HISTORY_REPLAY_VISUAL.userTextElement,
      },
    ],
  };
  const reasoningPayload = {
    item: {
      id: HISTORY_REPLAY_VISUAL.reasoningItemId,
      type: "reasoning",
      status: "completed",
      sequence: 3,
      started_at: reasoningAt,
      updated_at: reasoningAt,
      completed_at: reasoningAt,
      payload: {
        type: "reasoning",
        text: HISTORY_REPLAY_VISUAL.reasoningSummary,
        summary: [HISTORY_REPLAY_VISUAL.reasoningSummary],
        metadata: {
          source: "codex_history_replay_visual",
          provider_metadata: {
            backend: "codex",
            signature: "history-replay-visual-reasoning",
          },
        },
      },
    },
  };
  const mcpPayload = {
    item: {
      id: HISTORY_REPLAY_VISUAL.mcpItemId,
      type: "tool_call",
      status: "in_progress",
      sequence: 4,
      started_at: mcpStartedAt,
      updated_at: mcpStartedAt,
      payload: {
        type: "tool_call",
        tool_name: HISTORY_REPLAY_VISUAL.mcpToolName,
        name: HISTORY_REPLAY_VISUAL.mcpToolName,
        arguments: {
          path: path.join(workspaceRoot, "README.md"),
        },
        metadata: {
          owner: "history_replay_visual",
          mcp: {
            server: "filesystem",
            tool: "read_file",
          },
        },
      },
    },
  };
  const assistantPayload = {
    phase: "final",
    text: HISTORY_REPLAY_VISUAL.assistantText,
    content: {
      text: HISTORY_REPLAY_VISUAL.assistantText,
    },
  };

  return [
    {
      eventId: "history-replay-visual-turn-accepted",
      sequence: 1,
      sessionId: HISTORY_REPLAY_VISUAL.sessionId,
      threadId: HISTORY_REPLAY_VISUAL.threadId,
      turnId: HISTORY_REPLAY_VISUAL.turnId,
      type: "turn.accepted",
      timestamp: startedAt,
      payload: {
        session: {
          title: HISTORY_REPLAY_VISUAL.title,
          workspaceId: HISTORY_REPLAY_VISUAL.workspaceId,
          workingDir: workspaceRoot,
          executionStrategy: "react",
        },
      },
    },
    {
      eventId: "history-replay-visual-user",
      sequence: 2,
      sessionId: HISTORY_REPLAY_VISUAL.sessionId,
      threadId: HISTORY_REPLAY_VISUAL.threadId,
      turnId: HISTORY_REPLAY_VISUAL.turnId,
      type: "message.created",
      timestamp: startedAt,
      payload: userPayload,
    },
    {
      eventId: HISTORY_REPLAY_VISUAL.reasoningItemId,
      sequence: 3,
      sessionId: HISTORY_REPLAY_VISUAL.sessionId,
      threadId: HISTORY_REPLAY_VISUAL.threadId,
      turnId: HISTORY_REPLAY_VISUAL.turnId,
      type: "item.completed",
      timestamp: reasoningAt,
      payload: reasoningPayload,
    },
    {
      eventId: HISTORY_REPLAY_VISUAL.mcpItemId,
      sequence: 4,
      sessionId: HISTORY_REPLAY_VISUAL.sessionId,
      threadId: HISTORY_REPLAY_VISUAL.threadId,
      turnId: HISTORY_REPLAY_VISUAL.turnId,
      type: "item.started",
      timestamp: mcpStartedAt,
      payload: mcpPayload,
    },
    {
      eventId: "history-replay-visual-assistant",
      sequence: 5,
      sessionId: HISTORY_REPLAY_VISUAL.sessionId,
      threadId: HISTORY_REPLAY_VISUAL.threadId,
      turnId: HISTORY_REPLAY_VISUAL.turnId,
      type: "message.delta",
      timestamp: assistantAt,
      payload: assistantPayload,
    },
  ];
}

export function seedHistoryReplayVisualProjectionSession({
  runtimeEnv,
  runSqlite,
  sqlLiteral,
}) {
  const dbPath = fixtureDatabasePath(runtimeEnv);
  const projectionPath = projectionDatabasePath(runtimeEnv);
  const workspaceRoot = path.join(
    runtimeEnv.persistedWorkspaceRoot,
    "history-replay-visual",
  );
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const localImagePath = writeLocalImage(runtimeEnv);
  const baseTimestampMs = Date.now();
  const events = historyReplayEvents({
    localImagePath,
    workspaceRoot,
    baseTimestampMs,
  });
  const createdAt = isoTimestamp(baseTimestampMs, 0);
  const updatedAt = isoTimestamp(baseTimestampMs, 4_000);
  const createdAtMs = baseTimestampMs;
  const updatedAtMs = baseTimestampMs + 4_000;
  const sessionMetadata = {
    title: HISTORY_REPLAY_VISUAL.title,
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
DELETE FROM agent_sessions WHERE id = ${sqlLiteral(HISTORY_REPLAY_VISUAL.sessionId)};
INSERT OR REPLACE INTO workspaces (
  id, name, workspace_type, root_path, is_default, settings_json,
  created_at, updated_at, icon, color, is_favorite, is_archived,
  tags_json, default_persona_id
) VALUES (
  ${sqlLiteral(HISTORY_REPLAY_VISUAL.workspaceId)},
  'Electron history replay visual workspace',
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
  ${sqlLiteral(HISTORY_REPLAY_VISUAL.sessionId)},
  'fixture-model',
  NULL,
  ${sqlLiteral(HISTORY_REPLAY_VISUAL.title)},
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

  const projectedRows = events
    .filter((event) => event.type !== "turn.accepted")
    .map(
      (event) => `(
    ${sqlLiteral(event.eventId)},
    ${sqlLiteral(HISTORY_REPLAY_VISUAL.sessionId)},
    ${sqlLiteral(HISTORY_REPLAY_VISUAL.threadId)},
    ${sqlLiteral(HISTORY_REPLAY_VISUAL.turnId)},
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
DELETE FROM projected_items WHERE session_id = ${sqlLiteral(HISTORY_REPLAY_VISUAL.sessionId)};
DELETE FROM projected_turns WHERE session_id = ${sqlLiteral(HISTORY_REPLAY_VISUAL.sessionId)};
DELETE FROM projection_watermarks WHERE session_id = ${sqlLiteral(HISTORY_REPLAY_VISUAL.sessionId)};
DELETE FROM projected_sessions WHERE session_id = ${sqlLiteral(HISTORY_REPLAY_VISUAL.sessionId)};
INSERT INTO projected_sessions (
  session_id, thread_id, status, created_at, updated_at, archived_at,
  title, model, workspace_id, working_dir, execution_strategy,
  metadata_json, last_event_sequence, last_event_id
) VALUES (
  ${sqlLiteral(HISTORY_REPLAY_VISUAL.sessionId)},
  ${sqlLiteral(HISTORY_REPLAY_VISUAL.threadId)},
  'running',
  ${sqlLiteral(createdAt)},
  ${sqlLiteral(updatedAt)},
  NULL,
  ${sqlLiteral(HISTORY_REPLAY_VISUAL.title)},
  'fixture-model',
  ${sqlLiteral(HISTORY_REPLAY_VISUAL.workspaceId)},
  ${sqlLiteral(workspaceRoot)},
  'react',
  ${jsonSql(sqlLiteral, sessionMetadata)},
  5,
  'history-replay-visual-assistant'
);
INSERT INTO projected_turns (
  turn_id, session_id, thread_id, status, started_at, completed_at,
  last_event_sequence
) VALUES (
  ${sqlLiteral(HISTORY_REPLAY_VISUAL.turnId)},
  ${sqlLiteral(HISTORY_REPLAY_VISUAL.sessionId)},
  ${sqlLiteral(HISTORY_REPLAY_VISUAL.threadId)},
  'running',
  ${sqlLiteral(events[0]?.timestamp ?? createdAt)},
  NULL,
  5
);
INSERT INTO projected_items (
  event_id, session_id, thread_id, turn_id, sequence, item_type,
  payload_summary_json, created_at
) VALUES
  ${projectedRows};
INSERT INTO projection_watermarks (
  session_id, last_sequence, last_event_id, updated_at
) VALUES (
  ${sqlLiteral(HISTORY_REPLAY_VISUAL.sessionId)},
  5,
  'history-replay-visual-assistant',
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
    sessionId: HISTORY_REPLAY_VISUAL.sessionId,
    workspaceId: HISTORY_REPLAY_VISUAL.workspaceId,
    turnId: HISTORY_REPLAY_VISUAL.turnId,
    localImagePath,
    remoteImageUrl: HISTORY_REPLAY_VISUAL.remoteImageUrl,
    eventCount: events.length,
  };
}
