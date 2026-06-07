#!/usr/bin/env node

import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { localAppServerBinaryPath } from "../lib/electron-dev-sidecar.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const clientDistPath = path.join(
  rootDir,
  "packages",
  "app-server-client",
  "dist",
  "index.js",
);
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
      backendMode: "unavailable",
    },
    {
      clientInfo: {
        name: "lime_stdio_smoke",
        version: "1.60.0",
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
    const sessionResult = expectResponseResult(
      sessionResponse,
      sessionRequest.id,
      "agentSession/start",
    );
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
    expectResponseError(
      turnResponse,
      turnRequest.id,
      "agentSession/turn/start",
      "standalone app-server backend is not configured",
    );

    console.log(
      `[smoke:app-server-stdio] ok binary=${binaryPath} source=${binaryResolution.source} protocol=${connected.initializeResponse.serverInfo.protocolVersion} session=${sessionId} backend=unavailable turn=fail-closed`,
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
        '先构建：cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server',
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

function expectResponseError(message, id, label, expectedMessage) {
  if (!message || message.id !== id || !("error" in message)) {
    throw new Error(
      `expected ${label} error response for request ${String(id)}`,
    );
  }
  const actualMessage = String(message.error?.message ?? "");
  if (!actualMessage.includes(expectedMessage)) {
    throw new Error(
      `unexpected ${label} error: expected "${expectedMessage}", got "${actualMessage}"`,
    );
  }
  return message.error;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`unexpected ${label}: expected ${expected}, got ${actual}`);
  }
}

main().catch((error) => {
  console.error(
    `[smoke:app-server-stdio] failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
