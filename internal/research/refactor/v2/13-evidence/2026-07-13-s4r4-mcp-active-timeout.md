# S4r4 MCP Active-Time Timeout

## Fact source

Each real RMCP connection owns one counted elicitation pause state. MCP operation timeouts consume
only connection active time; time spent awaiting one or more server-originated user elicitations is
paused. Cancellation remains independent from that timer and is delivered immediately.

## Codex provenance

The counted `ElicitationPauseState`, RAII guard, and `active_time_timeout` were copied and adapted
from Codex commit `68a1d82a413630892b64258fd3e79786fc419312` (`fix(mcp) pause timer for
elicitations (#17566)`). The supplied short anchor `5c19155` resolves in the local Codex repository
to the unrelated `Add ordinals to paginated rollout records (#32332)` commit, so it was not used as
false provenance.

## Changes

- Added connection-local counted pause state, RAII release, and remaining-budget active-time timeout.
- Made the real `LimeMcpClient` handler hold the pause guard for the full router request future.
  Concurrent elicitations keep the connection paused until the last guard drops.
- Replaced `McpBridgeClient` wall-clock sleep with the active-time timeout while preserving exact
  `notifications/cancelled` delivery for both timeout and external cancellation.
- Routed direct `McpClientManager::call_tool` through the same bridge timeout owner and removed its
  second `tokio::time::timeout` implementation.
- Removed the duplicate wrapper/snapshot/Agent bridge handler state. Notification subscription and
  elicitation pause state now come from `RunningService::service()`, the real connected handler.
- Kept startup connection timeouts unchanged; they are lifecycle timeouts, not MCP operation time.

## Validation

- `cargo test -p lime-mcp active_time --lib`: 4 passed, including the real handler/router waiter.
- `cargo test -p lime-mcp --lib`: 132 passed.
- `cargo check -p lime-mcp -p lime-agent -p app-server`: passed. App Server reported two unrelated
  existing dead-code warnings in `server_request.rs` (`register` and `id`).
- Scoped `rustfmt --check` and `git diff --check`: passed.
- Residual audit found no tool-operation `tokio::time::timeout`, `sleep(timeout)`, wrapper
  `client_handler`, snapshot handler, or Agent bridge handler field.

This slice does not modify protocol, Electron, Renderer, GUI, locales, or capability advertisement,
so elicitation-specific GUI Gate B remains owned by the adapter/product slices.

## Classification

- `current`: connection-local active-time MCP operation timeout and real RMCP handler pause state.
- `compat`: none.
- `deprecated`: none retained.
- `dead`: wall-clock tool timeout, manager duplicate timeout, and fake wrapper handler state; deleted
  and forbidden to return.

## Remaining blocker

RMCP 0.12 typed elicitation results still cannot preserve response `_meta`; S4r5 must resolve that
with the custom service boundary before capability advertisement. The R3 adapter, GUI form,
five-language copy, canonical projection, and elicitation Gate B also remain required.
