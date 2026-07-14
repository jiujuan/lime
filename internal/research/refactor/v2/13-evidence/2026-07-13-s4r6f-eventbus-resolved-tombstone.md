# S4r6f EventBus resolved tombstone evidence

Date: 2026-07-13

## Scope

This slice closes the Renderer race where App Server requests may be drained before the single server-request handler attaches. The EventBus, rather than the page or MCP form controller, owns terminal suppression for queued and later-drained requests.

## Contract

- `request -> resolved -> late handler attach`: resolved removes the queued pending request.
- `resolved -> request -> late handler attach`: EventBus records the exact stable request-id tombstone, consumes it when the request arrives, and never queues the request.
- An active dispatcher still receives the resolved notification and owns `AbortSignal` cancellation for an in-flight handler.
- `reset()` starts a new connection generation, clears pending/seen/resolved state, and prevents an older in-flight drain from mutating the new generation.
- Resolved-first tombstones use insertion order, are consumed on match, and are capped at 2048 entries.

## Provenance

The terminal semantics follow Codex `serverRequest/resolved`: a client must clear a pending request whether it was answered or removed by lifecycle cleanup. The implementation is adapted to Lime's GUI event-drain bus and global modal lifecycle; no TUI presentation code was copied.

## Verification

```text
npx vitest run src/lib/api/appServerEventBus.unit.test.ts
  1 file, 8 tests passed

npx vitest run src/lib/api/appServerEventBus.unit.test.ts src/lib/api/appServerServerRequest.unit.test.ts
  2 files, 17 tests passed

npm run typecheck
  renderer and node tsconfigs passed

npx prettier --check src/lib/api/appServerEventBus.ts src/lib/api/appServerEventBus.unit.test.ts
  passed

git diff --check -- src/lib/api/appServerEventBus.ts src/lib/api/appServerEventBus.unit.test.ts
  passed
```

## Classification

- current: connection-generation-scoped EventBus request/terminal state.
- compat: none.
- deprecated: none added.
- dead: delivery of a server request after its resolved notification.

S4r6f completion: 100%. Generated protocol convergence, canonical MCP scope transport, form validation/metadata, projection, and Electron Gate B remain owned by their separate slices.
