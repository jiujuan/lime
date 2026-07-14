# S4r5 MCP Elicitation Response `_meta`

## Fact source

Every production MCP connection is served by one `LimeMcpClientService`. It intercepts only
`elicitation/create`, preserves the validated response `action`, `content`, and optional object
`_meta` as `ClientResult::CustomResult`, and delegates all other requests, notifications, and
client info to `LimeMcpClient`.

## Codex provenance

The `Service<RoleClient>` interception pattern and `CreateElicitationResultWithMeta` wire result
were copied and adapted from Codex
`codex-rs/rmcp-client/src/elicitation_client_service.rs`. The custom service boundary was introduced
at Codex commit `7b6486a145e`; the implementation was inspected at local Codex HEAD
`5c19155cbd93bfa099016e7487259f61669823ff` (Apache-2.0). Lime deliberately omitted Codex
`openai/form` support because this slice owns MCP form elicitation only.

## Changes

- Added `LimeMcpClientService`, which handles only `ServerRequest::CreateElicitationRequest` and
  delegates every other request/notification/get-info path to the existing handler.
- Replaced RMCP's metadata-losing typed `CreateElicitationResult` waiter with Lime's validated
  `ElicitationResponse`. The response accepts optional object `_meta`; non-object metadata fails
  closed without weakening accept/content or schema validation.
- Serialized the intercepted result through `CreateElicitationResultWithMeta` into
  `ClientResult::CustomResult` so `_meta` survives the actual JSON-RPC wire.
- Migrated stdio, streamable HTTP, manager wrappers, runtime bridge snapshots, and Agent bridge
  consumers to `RunningService<RoleClient, LimeMcpClientService>`. No parallel typed-service
  lifecycle remains.
- Made the handler and wrapper modules crate-private; external consumers can only construct the
  custom service, so the old typed handler cannot be restored as a second production lifecycle.
- Preserved S4r4 connection-local active-time pause: bridge timeouts still subscribe to the same
  wrapped `LimeMcpClient` pause state.
- Added raw duplex wire coverage that performs initialization, sends `elicitation/create`, resolves
  an accepted response with metadata, and asserts `result._meta` in the serialized response line.

## Validation

- `cargo test -p lime-mcp elicitation --lib`: 16 passed, including raw-wire `_meta`, typed RMCP
  peer routing, action/content/meta rejection, schema validation, cancellation, backpressure, and
  active-time pause.
- `cargo test -p lime-mcp --lib`: 133 passed.
- `cargo check -p lime-mcp -p lime-agent -p app-server`: passed. The only warning is an unrelated
  active App Server `server_request.rs::register` dead-code warning outside this write set.
- Scoped `rustfmt` and `git diff --check`: passed.
- Residual audit found no production `RunningService<RoleClient, LimeMcpClient>`, typed
  `CreateElicitationResult`, or `ClientResult::CreateElicitationResult` path in MCP/Agent source.

## Classification

- `current`: one custom MCP client service, validated response metadata, and shared stdio/HTTP
  lifecycle.
- `compat`: none.
- `deprecated`: typed `CreateElicitationResult` service path; removed.
- `dead`: result metadata loss and parallel typed-service lifecycle; deleted and forbidden to
  return.

## Boundary

This slice did not modify App Server protocol/adapter, Electron, Renderer, GUI, locales, capability
advertisement, central architecture, or the implementation plan. S4r6 owns the GUI/product closure;
capability advertisement and Gate B remain blocked until that owner completes its exit conditions.
Pre-existing S4p/S4q prompt/resource exact-target behavior was retained; S4r5 only migrated the
associated test connections to the custom service type.
