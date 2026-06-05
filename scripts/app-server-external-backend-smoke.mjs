#!/usr/bin/env node

import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

async function main() {
  const binaryResolution = resolveSidecarBinaryPath({
    devBinaryPath,
  });
  const binaryPath = binaryResolution?.binaryPath;
  if (!binaryPath) {
    throw new Error("app-server binary path could not be resolved");
  }
  await assertBinaryExists(binaryPath);

  const tempDir = await mkdtemp(path.join(tmpdir(), "app-server-external-backend-"));
  let connected;
  try {
    const backendPath = path.join(tempDir, "query-loop-backend.mjs");
    const policyPath = path.join(tempDir, "content-studio.policy.json");
    await writeExternalBackend(backendPath);
    await writeFile(
      policyPath,
      `${JSON.stringify(
        {
          capabilities: [
            {
              id: "content.draft.generate",
              title: "Generate Draft",
              methods: ["agentSession/turn/start"],
              appIds: ["content-studio"],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    connected = await connectAppServerSidecar(
      {
        ...stdioSidecar(binaryPath, policyPath),
        backendMode: "external",
        backendCommand: process.execPath,
        backendArgs: [backendPath],
        backendTimeoutMs: 5_000,
      },
      {
        clientInfo: {
          name: "content_studio",
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

    const connection = connected.connection;
    const sessionId = "appserver_external_backend_smoke_session";
    const threadId = "appserver_external_backend_smoke_thread";

    const capabilityResult = await connection.listCapabilities(
      {
        appId: "content-studio",
        workspaceId: "content-workspace",
      },
      { timeoutMs: 5_000 },
    );
    const capabilityIds = capabilityResult.result.capabilities.map((capability) => capability.id);
    if (!capabilityIds.includes("content.draft.generate")) {
      throw new Error(`content.draft.generate capability missing: ${capabilityIds.join(", ")}`);
    }

    const sessionResult = await connection.startSession(
      {
        sessionId,
        threadId,
        appId: "content-studio",
        workspaceId: "content-workspace",
      },
      { timeoutMs: 5_000 },
    );
    assertEqual(sessionResult.result.session.sessionId, sessionId, "session id");
    assertEqual(sessionResult.result.session.threadId, threadId, "thread id");

    const turnResult = await connection.startTurn(
      {
        sessionId,
        turnId: "turn_external_backend_smoke",
        input: {
          text: "生成一段 content-studio 草稿",
        },
        runtimeOptions: {
          stream: true,
          capabilityId: "content.draft.generate",
          metadata: {
            smoke: true,
          },
        },
      },
      { timeoutMs: 5_000 },
    );
    assertEqual(turnResult.result.turn.sessionId, sessionId, "turn session id");
    assertEqual(turnResult.result.turn.status, "accepted", "turn status");

    const notificationTypes = [];
    for (const notification of turnResult.notifications) {
      if (notification.method === METHOD_AGENT_SESSION_EVENT) {
        notificationTypes.push(notification.params.event.type);
      }
    }
    while (
      !notificationTypes.includes("message.delta") ||
      !notificationTypes.includes("artifact.snapshot")
    ) {
      const notification = await connection.nextNotification(5_000);
      assertEqual(notification.method, METHOD_AGENT_SESSION_EVENT, "event method");
      assertEqual(notification.params.event.sessionId, sessionId, "event session id");
      notificationTypes.push(notification.params.event.type);
    }

    const artifactResult = await connection.readArtifacts(
      {
        sessionId,
        turnId: "turn_external_backend_smoke",
      },
      { timeoutMs: 5_000 },
    );
    assertEqual(artifactResult.result.artifacts.length, 1, "artifact count");
    assertEqual(
      artifactResult.result.artifacts[0].artifactRef,
      "content-draft-smoke",
      "artifact ref",
    );

    const evidenceResult = await connection.exportEvidence(
      {
        sessionId,
        turnId: "turn_external_backend_smoke",
        includeEvents: true,
        includeArtifacts: true,
      },
      { timeoutMs: 5_000 },
    );
    assertEqual(evidenceResult.result.session.sessionId, sessionId, "evidence session id");
    if (!evidenceResult.result.events.some((event) => event.type === "message.delta")) {
      throw new Error("evidence export is missing external message.delta event");
    }
    if (
      !evidenceResult.result.artifacts.some(
        (artifact) => artifact.artifactRef === "content-draft-smoke",
      )
    ) {
      throw new Error("evidence export is missing external artifact summary");
    }

    console.log(
      [
        "[smoke:app-server-external-backend] ok",
        `binary=${binaryPath}`,
        `source=${binaryResolution.source}`,
        `protocol=${connected.initializeResponse.serverInfo.protocolVersion}`,
        `capabilities=${capabilityIds.join(",")}`,
        `events=${notificationTypes.join(",")}`,
        `artifacts=${artifactResult.result.artifacts.length}`,
      ].join(" "),
    );
  } finally {
    await connected?.sidecar.close().catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
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

async function writeExternalBackend(backendPath) {
  await writeFile(
    backendPath,
    `#!/usr/bin/env node
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));

if (input.kind === "turnStart") {
  const text = input.request.input?.text ?? "";
  console.log(JSON.stringify({
    events: [
      {
        type: "message.delta",
        payload: {
          backend: "external",
          appId: input.request.session?.appId,
          text: \`草稿已生成：\${text}\`,
        },
      },
      {
        type: "artifact.snapshot",
        payload: {
          artifactId: "content-draft-smoke",
          title: "Content Draft Smoke",
          kind: "markdown",
          status: "ready",
          path: ".app-server/artifacts/content-draft-smoke.md",
          content: \`# Content Draft Smoke\\n\\n\${text}\`,
          metadata: {
            backend: "external",
            smoke: true,
          },
        },
      },
    ],
  }));
  process.exit(0);
}

console.log(JSON.stringify({ events: [] }));
`,
  );
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`unexpected ${label}: expected ${expected}, got ${actual}`);
  }
}

main().catch((error) => {
  console.error(
    `[smoke:app-server-external-backend] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
