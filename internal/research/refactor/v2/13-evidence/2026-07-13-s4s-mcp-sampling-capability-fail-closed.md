# S4s MCP Sampling Capability Fail Closed

## Fact source

`LimeMcpClient::get_info()` is the shared initialize capability producer for stdio and HTTP MCP
connections. Lime has no typed `sampling/createMessage` handler: rmcp would route a server request
to its default `method not found` implementation. Codex also has no sampling handler and leaves the
capability absent.

## Changes

- Replaced the unconditional sampling capability advertisement with `ClientCapabilities::default()`.
- Added a focused regression that asserts `info.capabilities.sampling.is_none()` while preserving
  client identity and protocol version assertions.
- Added a repository guard that forbids `enable_sampling()` from returning to the production MCP
  client before a complete typed owner chain exists.

## Validation

- Focused exact client capability test: 1 passed.
- `cargo test -p lime-mcp --lib`: 116 passed.
- `cargo check -p lime-mcp -p app-server`: passed; one unrelated existing dead-code warning remains
  in `runtime_backend/model_routing.rs`.
- `cargo fmt -p lime-mcp --check` and scoped `git diff --check`: passed.
- `npm run test:contracts`: passed, including 290 App Server client checks.
- `npm run governance:legacy-report`: zero-reference candidates `0`, classification drift `0`,
  boundary violations `0`.

The change does not alter App Server JSON-RPC, Electron, provider, or Renderer wire behavior, so a
GUI Gate B rerun is not applicable.

## Classification

- `current`: `lime-mcp` initialized client capability owner.
- `compat`: none.
- `deprecated`: none retained.
- `dead`: positive sampling advertisement without a handler; deleted and forbidden to return.

## Next cut

Implement server-originated elicitation as a separate typed reverse JSON-RPC chain. Do not implement
MCP sampling merely to satisfy the deleted boolean: it would require its own provider routing,
permission, cancellation, usage, evidence, and GUI product design.
