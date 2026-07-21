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
import { copyElectronAppServerRuntimeLibraries } from "../lib/electron-app-server-assets.mjs";
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
  defaultReleaseManifestPath,
  platformKey,
  sha256File,
  sidecarBinaryName,
  startPackagedAppServerSidecar,
} = await import(pathToFileURL(clientDistPath).href);

async function main() {
  const sourceBinaryPath = await resolveSourceBinaryPath();
  const tempDir = await mkdtemp(
    path.join(tmpdir(), "app-server-sidecar-lifecycle-"),
  );
  let lifecycle;

  try {
    const platform = platformKey();
    const resourcesPath = path.join(tempDir, "resources");
    const packagedDir = path.join(resourcesPath, "app-server", platform);
    const packagedBinaryPath = path.join(packagedDir, sidecarBinaryName());
    const manifestPath = defaultReleaseManifestPath(resourcesPath);

    await mkdir(packagedDir, { recursive: true });
    await copyFile(sourceBinaryPath, packagedBinaryPath);
    await chmod(packagedBinaryPath, 0o755).catch(() => undefined);
    const runtimeLibraries = await copyElectronAppServerRuntimeLibraries({
      repoRoot: rootDir,
      sourceBinary: sourceBinaryPath,
      destinationDirectory: packagedDir,
    });

    const manifest = {
      version: await readPackageVersion(),
      protocolVersion: PROTOCOL_VERSION,
      artifacts: [
        {
          platform,
          url: `file://${packagedBinaryPath}`,
          sha256: await sha256File(packagedBinaryPath),
        },
      ],
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const scheduledRestarts = [];
    const started = await startPackagedAppServerSidecar(
      {
        clientInfo: {
          name: "content_studio",
          version: manifest.version,
        },
        capabilities: {
          eventMethods: [METHOD_AGENT_SESSION_EVENT],
        },
      },
      {
        resourcesPath,
        dataDir: path.join(tempDir, "data"),
        backendMode: "unavailable",
        initializeTimeoutMs: 5_000,
        expectedProtocolVersion: PROTOCOL_VERSION,
        restartPolicy: {
          maxAttempts: 1,
          initialDelayMs: 0,
        },
        onRestartScheduled(event) {
          scheduledRestarts.push(event);
        },
      },
    );
    lifecycle = started.lifecycle;

    assertEqual(
      started.resolved.config.binaryPath,
      packagedBinaryPath,
      "started binary path",
    );
    assertEqual(
      started.resolved.config.expectedSha256,
      manifest.artifacts[0].sha256,
      "manifest sha256",
    );
    const connected = started.connected;
    const connection = connected.connection;
    const sessionId = "appserver_lifecycle_smoke_session";
    const threadId = "appserver_lifecycle_smoke_thread";

    const capabilityResult = await connection.listCapabilities(
      {
        appId: "content-studio",
        workspaceId: "smoke",
      },
      { timeoutMs: 5_000 },
    );
    const capabilityIds = capabilityResult.result.capabilities.map(
      (capability) => capability.id,
    );
    if (!capabilityIds.includes("agent.session")) {
      throw new Error(
        `agent.session capability missing: ${capabilityIds.join(", ")}`,
      );
    }

    const sessionResult = await connection.startSession(
      {
        sessionId,
        threadId,
        appId: "content-studio",
        workspaceId: "smoke",
      },
      { timeoutMs: 5_000 },
    );
    assertEqual(
      sessionResult.result.session.sessionId,
      sessionId,
      "session id",
    );
    assertEqual(sessionResult.result.session.threadId, threadId, "thread id");

    await expectStartTurnFailClosed(connection, sessionId);

    await lifecycle.stop();

    console.log(
      [
        "[smoke:app-server-sidecar-lifecycle] ok",
        `source=${sourceBinaryPath}`,
        `packaged=${packagedBinaryPath}`,
        `protocol=${connected.initializeResponse.serverInfo.protocolVersion}`,
        `capabilities=${capabilityIds.join(",")}`,
        "backend=unavailable",
        "turn=fail-closed",
        `runtimeLibraries=${runtimeLibraries.length}`,
        `scheduledRestarts=${scheduledRestarts.length}`,
      ].join(" "),
    );
  } finally {
    await lifecycle?.stop().catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function expectStartTurnFailClosed(connection, sessionId) {
  try {
    await connection.startTurn(
      {
        sessionId,
        input: {
          text: "sidecar lifecycle smoke",
        },
        runtimeOptions: {
          stream: true,
        },
      },
      { timeoutMs: 5_000 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("standalone app-server backend is not configured")) {
      return;
    }
    throw new Error(`unexpected fail-closed turn error: ${message}`);
  }

  throw new Error(
    "expected turn/start to fail when backend is unavailable",
  );
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

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`unexpected ${label}: expected ${expected}, got ${actual}`);
  }
}

main().catch((error) => {
  console.error(
    `[smoke:app-server-sidecar-lifecycle] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
