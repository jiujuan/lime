#!/usr/bin/env node

import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { localAppServerBinaryPath } from "./lib/electron-dev-sidecar.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const clientDistPath = path.join(rootDir, "packages", "app-server-client", "dist", "index.js");
const {
  METHOD_AGENT_SESSION_EVENT,
  PROTOCOL_VERSION,
  connectAppServerSidecar,
  resolveSidecarBinaryPath,
  stdioSidecar,
} = await import(pathToFileURL(clientDistPath).href);
const devBinaryPath = localAppServerBinaryPath({ repoRoot: rootDir });
const binaryResolution = resolveSidecarBinaryPath({
  devBinaryPath,
});
const binaryPath = binaryResolution?.binaryPath;

async function main() {
  if (!binaryPath) {
    throw new Error("app-server binary path could not be resolved");
  }
  await assertBinaryExists(binaryPath);

  const connected = await connectAppServerSidecar(
    {
      ...stdioSidecar(binaryPath),
      backendMode: "mock",
    },
    {
      clientInfo: {
        name: "lime_stdio_smoke",
        version: "1.59.0",
      },
      capabilities: {
        eventMethods: [METHOD_AGENT_SESSION_EVENT],
      },
    },
    {
      initializeTimeoutMs: 5_000,
      expectedProtocolVersion: PROTOCOL_VERSION,
    },
  );

  try {
    const sessionId = "appserver_stdio_smoke_session";
    const threadId = "appserver_stdio_smoke_thread";
    const sessionRequest = connected.client.startSession({
      sessionId,
      threadId,
      appId: "content-studio",
      workspaceId: "smoke",
    });
    connected.sidecar.send(sessionRequest);
    const sessionResponse = await connected.sidecar.nextMessage(5_000);
    const sessionResult = expectResponseResult(sessionResponse, sessionRequest.id, "agentSession/start");
    assertEqual(sessionResult.session.sessionId, sessionId, "session id");
    assertEqual(sessionResult.session.threadId, threadId, "thread id");

    const turnRequest = connected.client.startTurn({
      sessionId,
      input: {
        text: "stdio smoke",
      },
      runtimeOptions: {
        stream: true,
      },
    });
    connected.sidecar.send(turnRequest);
    const turnResponse = await connected.sidecar.nextMessage(5_000);
    const turnResult = expectResponseResult(turnResponse, turnRequest.id, "agentSession/turn/start");
    assertEqual(turnResult.turn.sessionId, sessionId, "turn session id");
    assertEqual(turnResult.turn.status, "accepted", "turn status");

    const eventNotification = await connected.sidecar.nextMessage(5_000);
    if (eventNotification.method !== METHOD_AGENT_SESSION_EVENT) {
      throw new Error(`expected ${METHOD_AGENT_SESSION_EVENT}, got ${eventNotification.method ?? "unknown"}`);
    }
    assertEqual(eventNotification.params.event.sessionId, sessionId, "event session id");
    assertEqual(eventNotification.params.event.threadId, threadId, "event thread id");
    assertEqual(eventNotification.params.event.type, "turn.accepted", "event type");

    console.log(
      `[smoke:app-server-stdio] ok binary=${binaryPath} source=${binaryResolution.source} protocol=${connected.initializeResponse.serverInfo.protocolVersion} session=${sessionId} event=turn.accepted`,
    );
  } finally {
    await connected.sidecar.close();
  }
}

async function assertBinaryExists(targetPath) {
  try {
    await access(targetPath);
  } catch {
    throw new Error(
      [
        `app-server binary not found: ${targetPath}`,
        "先构建：cargo build --manifest-path \"lime-rs/Cargo.toml\" -p app-server",
        "或设置：APP_SERVER_BIN=/path/to/app-server",
      ].join("\n"),
    );
  }
}

function expectResponseResult(message, id, label) {
  if (message?.error) {
    throw new Error(`${label} failed: ${message.error.message}`);
  }
  if (!message || message.id !== id || !("result" in message)) {
    throw new Error(`expected ${label} response for request ${String(id)}`);
  }
  return message.result;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`unexpected ${label}: expected ${expected}, got ${actual}`);
  }
}

main().catch((error) => {
  console.error(`[smoke:app-server-stdio] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
