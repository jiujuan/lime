# app-server-client

`app-server-client` is the TypeScript client surface for independent apps
that talk to `app-server` over JSON-RPC.

Current scope:

- build initialize / initialized requests;
- build `agentSession/*` requests;
- encode and decode newline-delimited JSON-RPC messages;
- resolve sidecar binary names, packaged paths, and stdio launch args;
- read release manifest metadata and select the current platform artifact;
- build sidecar launch config from manifest + resources path;
- verify the sidecar binary sha256 before launch;
- spawn / connect a stdio sidecar with the initialize handshake;
- supervise sidecar crash, startup failure, and restart with deterministic backoff;
- route `agentSession/event` notifications into app-owned renderer state;
- use `AppServerConnection` for typed `agentSession/*` request / response flows.

Session archive semantics:

- list archived sessions with `agentSession/list` and `archivedOnly: true`;
- archive or unarchive sessions with `agentSession/update` and `archived: true`
  or `archived: false`;
- preserve App Server JSON-RPC errors as `AppServerRequestError`; callers must
  fail closed instead of falling back to legacy `agent_runtime_*` commands or
  mock responses.

Electron main integration shape:

```ts
import {
  AppServerAgentEventRouter,
  startPackagedAppServerSidecar,
} from "app-server-client";

const { connected, lifecycle } = await startPackagedAppServerSidecar(
  {
    clientInfo: { name: "content_studio", version: app.getVersion() },
  },
  {
    resourcesPath: process.resourcesPath,
    restartPolicy: { maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 30_000 },
  },
);

const { connection } = connected;
app.on("before-quit", () => void lifecycle.stop());

const eventRouter = new AppServerAgentEventRouter();
eventRouter.subscribe((event) => {
  mainWindow.webContents.send("agent:event", event);
});

const session = await connection.startSession({
  appId: "content-studio",
  workspaceId: workspace.id,
  businessObjectRef: {
    kind: "document",
    id: document.id,
    title: document.title,
  },
});

const turn = await connection.startTurn({
  sessionId: session.result.session.sessionId,
  input: { text: "生成草稿" },
  runtimeOptions: { capabilityId: "draft.write", stream: true },
  queueIfBusy: true,
});

for (const result of [session, turn]) {
  for (const notification of result.notifications) {
    await eventRouter.dispatch(notification);
  }
}

void (async () => {
  while (!mainWindow.isDestroyed()) {
    await eventRouter.dispatch(await connection.nextNotification());
  }
})();
```

This package does not import Lime Rust crates, Tauri commands, Aster DTOs, or
renderer UI code. Electron apps should use it from main / preload boundaries and
project events into their own renderer state.
