# S4r1 MCP Elicitation Router

## Fact source

Server-originated MCP form elicitation enters Lime through the RMCP client handler and waits in one
manager-shared router. The router owns an opaque internal request identity; raw RMCP request ids do
not leave the connection, and App Server outer JSON-RPC ids remain a separate transport identity.

## Changes

- Adapted the Codex connection-shared elicitation router with manager lifetime across stdio/HTTP
  connection replacement.
- Replaced broadcast delivery with a bounded single-consumer queue so lag cannot silently discard a
  request. Consumer disconnect, backpressure cancellation, request cancellation, and `cancel_all`
  remove exact waiters and trigger a per-request `closed()` token for the future App Server adapter.
- Added typed accept/decline/cancel contracts and validation for required/unknown properties,
  primitive types, min/max, enum, email, URI, date, and date-time formats.
- Preserved request `_meta` except `progressToken`, connected `RequestContext.ct`, and exercised a
  real in-memory RMCP client/server request.
- Kept both sampling and elicitation capabilities absent. The router is current foundation, not a
  claim that the GUI product chain is complete.
- Split the 1,018-line mixed module into a 444-line production module and a 575-line adjacent test
  module.

## Validation

- `cargo test -p lime-mcp elicitation`: 13 passed.
- `cargo test -p lime-mcp --lib`: 128 passed.
- `cargo check -p lime-mcp -p app-server`: passed.
- Scoped `rustfmt --check` and `git diff --check`: passed.

This slice does not advertise the capability or alter App Server/Electron/Renderer behavior, so GUI
Gate B is not applicable yet.

## Classification

- `current`: `lime-mcp` manager-shared form elicitation router and RMCP handler foundation.
- `compat`: none.
- `deprecated`: none retained.
- `dead`: public raw MCP request identity, cross-connection request scanning, generic action reuse,
  and lossy broadcast delivery; absent and forbidden to return.

## Remaining blockers

Capability advertisement remains blocked on the App Server adapter, active-time timeout pause,
response `_meta` preservation through a custom RMCP service, cancellable GUI form with five locales,
canonical pending/terminal projection, and elicitation-specific Electron Gate B.
