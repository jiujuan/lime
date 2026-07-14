# S4r2 App Server Reverse JSON-RPC

## Fact source

MCP server-originated elicitation crosses the product boundary as an App Server server request:

```text
lime-mcp opaque elicitation token (future adapter)
  -> AppServer::send_server_request
  -> outer JSON-RPC Request id owned by App Server
  -> Electron JSONL forwarding
  -> Renderer typed dispatcher
  -> JSON-RPC Response/Error with the same outer id
  -> exact remove-once App Server waiter
  -> lime-mcp opaque token (future adapter)
```

The MCP token and App Server request id are separate identities. Renderer never receives the MCP
token, and nullable turn/tool correlation is not used for routing.

## Changes

- Added the `serverRequest` catalog kind and `mcpServer/elicitation/request` typed protocol DTOs,
  schema fixtures, manifest entries, and generated TypeScript. Form request `_meta` is preserved;
  `turnId` and `parentToolCallId` remain optional best-effort correlation.
- Added an App Server request router with generated `app-server-request:<boot UUID>:<counter>` ids,
  exact `HashMap::remove` resolution, abort/drop cleanup, transport-disconnect cancellation,
  ambiguous-client rejection, and fail-closed handling for unknown, duplicate, stale, or late
  Response/Error messages.
- Added `AppServerConnection.nextServerMessage()` so notification/server-request draining does not
  consume client responses. Electron forwards requests upward and sends Renderer Response/Error
  envelopes back through the same JSONL channel without interpreting MCP semantics.
- Added typed Renderer response/rejection APIs, event-bus server-request delivery, and a method
  dispatcher. Unknown methods return `METHOD_NOT_FOUND`; handler errors return the runtime error
  code; connection-scoped in-flight and settled tombstones make concurrent and sequential duplicate
  outer ids execute at most once, and reset clears both scopes.
- EventBus retains reverse requests drained before the single server-request handler subscribes,
  deduplicates them by connection-scoped outer id, delivers them exactly once when the handler
  attaches, and clears retained/seen state only on connection reset. A second server-request handler
  fails closed instead of creating ambiguous user-side effects.
- Closed the post-implementation correctness review before adapter work: independent router boots
  cannot reuse their first id, aborting a polled wait removes its sender, and a late response cannot
  resolve an abandoned or new-boot waiter.
- Updated the command/architecture fact sources and the contract guard from a two-kind to a
  three-kind method catalog.

## Validation

- `CARGO_TARGET_DIR=/tmp/lime-s4r2b-root-1110 cargo test -p app-server server_request --lib`: 7
  passed, including boot-scope uniqueness, aborted-wait cleanup, ambiguous-client rejection, and a
  real duplex `run_json_lines` request/response round trip.
- `CARGO_TARGET_DIR=/tmp/lime-s4r2-protocol-target cargo test -p app-server-protocol`: 45 library
  tests and 1 schema fixture test passed.
- `npm --prefix packages/app-server-client test`: 63 passed.
- `electron/appServerHost.test.ts`: 22 passed.
- `src/lib/api/appServerServerRequest.unit.test.ts`: 6 passed, including settled replay suppression
  and connection reset.
- `src/lib/api/appServerEventBus.unit.test.ts`: 4 passed, including late handler registration,
  exactly-once retained delivery, and single-handler enforcement.
- Root `npm run typecheck`, focused ESLint, Prettier, scoped `cargo fmt --check`, generated protocol
  drift check, and `git diff --check`: passed.
- `npm run test:contracts`: passed, including 290 App Server client checks and all command,
  harness, modality, scripts, Electron release, cleanup, and docs guards.
- `npm run governance:legacy-report`: zero-reference candidates `0`, classification drift `0`,
  boundary violations `0`.
- `npm run docs:boundary`: passed.
- `npm run verify:gui-smoke`: passed through the real Electron host, preload, App Server sidecar
  initialization, renderer load, and visible workbench readiness.
- `npm run governance:architecture-confirmation` cannot run locally without a PR event/base SHA.
  The required major-change declaration is recorded in section 9.20 of the execution plan and the
  architecture document changed in the same working set.

The GUI smoke proves the current Desktop transport remains healthy. The later S4r2b review reused
focused Rust/Renderer tests and did not rerun the unchanged Desktop transport. Neither slice proves an MCP
elicitation round trip because the S4r1 producer adapter and GUI form do not exist yet.

## Classification

- `current`: App Server reverse JSON-RPC router, typed protocol/client, Electron JSONL forwarding,
  and Renderer server-request dispatcher.
- `compat`: none.
- `deprecated`: none retained.
- `dead`: response scanning, raw MCP id exposure, generic action/Approval/request-user-input reuse,
  and production mock fallback; all remain absent.

## Coordination

The S4r1 owner retains `lime-rs/crates/mcp/**`, and S4t/canonical store files were not modified by
this slice. Shared tests validate the current working tree and do not transfer ownership of other
parallel changes.

## Next cut

After S4r1 releases its router write set, open a separate adapter slice that subscribes to
`ElicitationRequestRouter`, sends the typed App Server request, validates the typed response, and
resolves only the captured opaque MCP token. Cancellation/connection close must map to cancel.
Canonical Item projection, GUI form, five locales, and an elicitation-specific Electron Gate B stay
in the following product slice. Capability advertisement remains absent until that full chain passes.
