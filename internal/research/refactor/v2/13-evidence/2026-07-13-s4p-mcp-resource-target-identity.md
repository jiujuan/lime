# S4p MCP Resource Target Identity

## Fact source

Every single-resource read, subscribe, and unsubscribe operation targets the exact pair
`(server, uri)`. The MCP manager, native helper, typed clients, and GUI must not rediscover a
server by scanning resource URI values across live connections.

## Changes

- Added required `server` to read/subscribe/unsubscribe protocol DTOs, JSON Schema fixtures,
  generated TypeScript, handwritten TypeScript protocol types, and Rust typed client helpers.
- Added non-empty target validation at the Rust client, `lime-mcp` manager, native helper, and
  Renderer gateway boundaries. JSON Schema carries `minLength: 1`; runtime trim checks reject
  whitespace-only values.
- Replaced the manager's cross-connection URI scan with `clients.get(server)` exact lookup.
- Propagated `server` through App Server local data source, native resource Tool execution, Hook,
  Renderer gateway, and GUI resource preview/subscription lifecycle.
- Keyed GUI active/subscribed resource state by `server + URI`; identical URIs from different
  servers no longer collide.
- Updated current/live smoke list oracles to match both server and URI, and added contract guards
  for the exact manager calls and the three Rust typed client helpers.

## Regression evidence

- `lime-mcp` uses two real in-memory MCP connections that expose the same `docs://shared` URI.
  Read, subscribe, and unsubscribe against `server-b` return/record only `server-b`; `server-a`
  records no calls.
- The GUI regression expands `server-a` and `server-b`, previews their shared URI in sequence,
  unsubscribes `(server-a, docs://shared)`, then subscribes/reads
  `(server-b, docs://shared)` and displays the server-b content.
- Native `read_mcp_resource` requires `server`, forwards it in the App Server request, and retains
  the same server in canonical Tool metadata.

## Validation

- `cargo test -p lime-mcp manager::tests::resources --lib`: `13/13`.
- `cargo test -p app-server-client mcp --lib`: `2/2`.
- `cargo test -p tool-runtime mcp_resource --lib`: `2/2`.
- `cargo test -p app-server-protocol schema_fixtures_match_generated_output --test schema_fixtures`:
  `1/1`.
- `cargo check -p app-server-protocol -p lime-mcp -p tool-runtime -p app-server-client -p app-server`:
  pass.
- MCP API/Hook/Panel focused Vitest: `38/38`.
- `npm run check:protocol-types`: pass, no drift.
- `npm run test:contracts`: pass; App Server client guard reports `290 checks`.
- `npm run governance:legacy-report`: pass; zero-reference candidates `0`, classification drift
  `0`, boundary violations `0`.
- `npm run smoke:mcp-current -- --allow-write-fixture --prefix s4p-resource-target-identity`:
  pass. Evidence reports Electron Host healthy, `app_server_handle_json_lines` seen, App Server
  resource list/read seen, legacy MCP commands empty, and fixture cleanup complete.
- `npm run verify:gui-smoke`: pass; Renderer, Electron Host, App Server initialize, Claw workbench,
  and settings smoke all reached ready state.
- Repository `git diff --check`: pass.

The live-provider smoke was not run because S4p does not require external provider credentials or
network access; the deterministic current stdio fixture covers the changed JSON-RPC path.

## Classification

- `current`: App Server MCP management surface, native resource helpers, and exact `(server, uri)`
  resource identity.
- `compat`: none.
- `deprecated`: none retained.
- `dead`: URI-only single-resource routing and manager cross-connection URI scanning, deleted and
  guarded.

## Next cut

Implement `S4q-mcp-prompt-target-identity`: prompt get must use exact `(server, name)` from protocol
through manager and GUI. Server-originated elicitation and the false sampling capability
advertisement remain separate later slices.
