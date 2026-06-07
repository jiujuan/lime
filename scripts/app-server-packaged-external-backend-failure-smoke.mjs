#!/usr/bin/env node

import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { localAppServerBinaryPath } from "./lib/electron-dev-sidecar.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const clientDistPath = path.join(
  rootDir,
  "packages",
  "app-server-client",
  "dist",
  "index.js",
);

const {
  AppServerRequestError,
  METHOD_AGENT_SESSION_EVENT,
  PROTOCOL_VERSION,
  defaultReleaseManifestPath,
  platformKey,
  sha256File,
  sidecarBinaryName,
  startPackagedAppServerSidecar,
} = await import(pathToFileURL(clientDistPath).href);

async function main() {
  if (typeof AppServerRequestError !== "function") {
    throw new Error(
      'packages/app-server-client/dist is stale; run npm --prefix "packages/app-server-client" run build',
    );
  }

  const sourceBinaryPath = await resolveSourceBinaryPath();
  const tempDir = await mkdtemp(
    path.join(tmpdir(), "app-server-packaged-failure-smoke-"),
  );
  let lifecycle;

  try {
    const manifestVersion = await readPackageVersion();
    const platform = platformKey();
    const resourcesPath = path.join(tempDir, "resources");
    const packagedDir = path.join(resourcesPath, "app-server", platform);
    const packagedBinaryPath = path.join(packagedDir, sidecarBinaryName());
    const manifestPath = defaultReleaseManifestPath(resourcesPath);
    const backendPath = path.join(tempDir, "external-backend-fails.mjs");

    await mkdir(packagedDir, { recursive: true });
    await copyFile(sourceBinaryPath, packagedBinaryPath);
    await chmod(packagedBinaryPath, 0o755).catch(() => undefined);
    await writeFailingExternalBackend(backendPath);

    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          version: manifestVersion,
          protocolVersion: PROTOCOL_VERSION,
          artifacts: [
            {
              platform,
              url: `file://${packagedBinaryPath}`,
              sha256: await sha256File(packagedBinaryPath),
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const started = await startPackagedAppServerSidecar(
      {
        clientInfo: {
          name: "content_studio_failure_smoke",
          version: manifestVersion,
        },
        capabilities: {
          eventMethods: [METHOD_AGENT_SESSION_EVENT],
        },
      },
      {
        resourcesPath,
        backendMode: "external",
        backendCommand: process.execPath,
        backendArgs: [backendPath],
        backendTimeoutMs: 5_000,
        initializeTimeoutMs: 5_000,
        expectedProtocolVersion: PROTOCOL_VERSION,
        restartPolicy: {
          maxAttempts: 1,
          initialDelayMs: 0,
        },
      },
    );
    lifecycle = started.lifecycle;

    assertEqual(
      started.resolved.config.binaryPath,
      packagedBinaryPath,
      "packaged binary path",
    );
    const connection = started.connected.connection;
    const sessionId = "appserver_packaged_failure_smoke_session";
    const threadId = "appserver_packaged_failure_smoke_thread";
    const turnId = "appserver_packaged_failure_smoke_turn";

    await connection.startSession(
      {
        sessionId,
        threadId,
        appId: "content-studio",
        workspaceId: "smoke",
      },
      { timeoutMs: 5_000 },
    );

    const turnResult = await connection
      .startTurn(
        {
          sessionId,
          turnId,
          input: {
            text: "packaged external backend failure smoke",
          },
          runtimeOptions: {
            stream: true,
          },
        },
        { timeoutMs: 5_000 },
      )
      .then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      );

    if (turnResult.ok) {
      throw new Error(
        "expected failed turn response from packaged external backend",
      );
    }
    if (!(turnResult.error instanceof AppServerRequestError)) {
      throw new Error(
        `expected AppServerRequestError, got ${turnResult.error?.constructor?.name ?? typeof turnResult.error}`,
      );
    }

    const clientEvents = agentEventsFromNotifications(
      turnResult.error.notifications,
    );
    const clientFailure = assertFailureEvents(
      clientEvents,
      "client streamed events",
    );

    const readResult = await connection.readSession(
      { sessionId },
      { timeoutMs: 5_000 },
    );
    assertEqual(
      readResult.result.session.sessionId,
      sessionId,
      "read session id",
    );
    assertEqual(readResult.result.session.threadId, threadId, "read thread id");
    const readTurns = Array.isArray(readResult.result.turns)
      ? readResult.result.turns
      : [];
    assertEqual(readTurns.length, 1, "read failed turn count");
    const readTurn = readTurns.find((turn) => turn?.turnId === turnId);
    if (!readTurn) {
      throw new Error(`read session is missing failed turn ${turnId}`);
    }
    assertEqual(readTurn.sessionId, sessionId, "read failed turn session id");
    assertEqual(readTurn.threadId, threadId, "read failed turn thread id");
    assertEqual(readTurn.status, "failed", "read failed turn status");
    if (!readTurn.completedAt) {
      throw new Error(`read failed turn ${turnId} is missing completedAt`);
    }

    const evidenceResult = await connection.exportEvidence(
      {
        sessionId,
        turnId,
        includeEvents: true,
        includeArtifacts: true,
      },
      { timeoutMs: 5_000 },
    );
    const evidenceEvents = evidenceResult.result.events;
    const evidenceFailure = assertFailureEvents(
      evidenceEvents,
      "evidence events",
    );
    assertEqual(
      evidenceResult.result.artifacts.length,
      0,
      "failed turn artifact count",
    );

    await lifecycle.stop();

    console.log(
      [
        "[smoke:app-server-packaged-external-backend-failure] ok",
        `source=${sourceBinaryPath}`,
        `packaged=${packagedBinaryPath}`,
        `protocol=${started.connected.initializeResponse.serverInfo.protocolVersion}`,
        `clientEvents=${clientEvents.map((event) => event.type).join(",")}`,
        `evidenceEvents=${evidenceEvents.map((event) => event.type).join(",")}`,
        `readTurns=${readTurns.length}`,
        `readTurnStatus=${readTurn.status}`,
        `clientFailure=${JSON.stringify(clientFailure.payload.message)}`,
        `evidenceFailure=${JSON.stringify(evidenceFailure.payload.message)}`,
      ].join(" "),
    );
  } finally {
    await lifecycle?.stop().catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function resolveSourceBinaryPath() {
  const binaryPath =
    process.env.APP_SERVER_BIN ||
    localAppServerBinaryPath({ repoRoot: rootDir });
  try {
    await access(binaryPath);
    return binaryPath;
  } catch {
    throw new Error(
      [
        `app-server binary not found: ${binaryPath}`,
        '先构建：cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server',
        "或设置：APP_SERVER_BIN=/path/to/app-server",
      ].join("\n"),
    );
  }
}

async function readPackageVersion() {
  const packageJson = JSON.parse(
    await readFile(path.join(rootDir, "package.json"), "utf8"),
  );
  return String(packageJson.version || "").trim();
}

async function writeFailingExternalBackend(backendPath) {
  await writeFile(
    backendPath,
    `#!/usr/bin/env node
console.log(JSON.stringify({
  type: "message.delta",
  payload: {
    text: "partial packaged failure"
  }
}));
console.error("packaged external backend crashed after partial output");
process.exit(7);
`,
  );
}

function agentEventsFromNotifications(notifications) {
  return notifications
    .filter(
      (notification) => notification.method === METHOD_AGENT_SESSION_EVENT,
    )
    .map((notification) => notification.params.event);
}

function assertFailureEvents(events, label) {
  if (!events.some((event) => event.type === "message.delta")) {
    throw new Error(
      `${label} missing message.delta: ${JSON.stringify(events)}`,
    );
  }
  const failed = events.find((event) => event.type === "turn.failed");
  if (!failed) {
    throw new Error(`${label} missing turn.failed: ${JSON.stringify(events)}`);
  }
  const message = String(failed.payload?.message ?? "");
  if (
    !message.includes("packaged external backend crashed after partial output")
  ) {
    throw new Error(
      `${label} turn.failed missing stderr summary: ${JSON.stringify(failed)}`,
    );
  }
  return failed;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`unexpected ${label}: expected ${expected}, got ${actual}`);
  }
}

main().catch((error) => {
  console.error(
    `[smoke:app-server-packaged-external-backend-failure] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
