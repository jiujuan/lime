# S4r3 MCP Elicitation Adapter

## Fact source

The App Server transport lifecycle is the only adapter between the manager-shared MCP router and
reverse JSON-RPC. It captures one private R1 token per task, emits one typed R2 outer request, and
never locks `McpManagerState` while awaiting the GUI.

```text
RMCP form request
  -> lime-mcp opaque R1 token
  -> App Server concurrent adapter task
  -> mcpServer/elicitation/request with R2 outer id
  -> exact Response/Error
  -> validate typed response against the original R1 schema
  -> exact R1 resolve / decline / cancel
```

## Changes

- `LocalAppDataSource` clones the unique manager router before trait-object erasure.
- `AppServer::with_mcp_elicitation_router` subscribes once. `run_json_lines` runs a concurrent
  request pump so the same read loop can continue accepting Renderer Response/Error envelopes.
- Each adapter task captures the R1 token in Rust only; protocol params contain server, message,
  schema, request `_meta`, and nullable correlation, never the private token or raw RMCP id.
- Outer response content is deserialized and validated before R1 resolution. Invalid payload or
  non-cancellation client rejection declines safely; transport cancellation/disconnect cancels.
  An original-schema validation failure cannot consume another waiter and falls back to decline.
- Shutdown cancels App Server outer waiters, cancels remaining exact R1 waiters through the shared
  router, and waits for adapter tasks instead of aborting them with leaked registrations.
- The adapter composes with the S4r2 safety closeout: boot-scoped outer ids, connection-owner
  response binding, owner-scoped disconnect cleanup, retained EventBus requests, and Renderer
  at-most-once dispatch.

## Validation

- App Server `mcp_elicitation` filter: 4/4, including a real in-memory RMCP duplex request through
  the App Server outer-id broker and an invalid GUI response that settles only the captured waiter.
- App Server `server_request` filter: 8/8.
- Renderer dispatcher plus EventBus: 10/10.
- `cargo check -p app-server`: passed.
- `npm run test:contracts`: passed, including 290 App Server client checks.
- `npm run governance:legacy-report`: zero-reference/classification/boundary `0/0/0`.
- Scoped Rustfmt and `git diff --check`: passed.

This is a backend/transport foundation. The GUI form, remote resolved/abort notification, five
locales, canonical pending/terminal projection, response `_meta` custom service, capability
advertisement, and elicitation-specific Electron Gate B remain intentionally incomplete.

## Classification

- `current`: manager-shared router to App Server reverse-request adapter.
- `compat`: none.
- `deprecated`: none retained.
- `dead`: manager relock during an in-flight tool, private token wire exposure, waiter scanning,
  synchronous JSONL wait, and abort-on-shutdown waiter leaks; absent and guarded by structure/tests.
