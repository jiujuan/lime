## Lime v1.102.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Completed the real MCP server elicitation product chain: thread-scoped runtimes initiate forms through App Server reverse JSON-RPC, Electron forwards them unchanged, Renderer provides localized interaction in five languages, and response, remote resolution, and cancellation all close cleanly.
- Added durable Agent graph, identity, and mailbox storage, then exposed six per-turn control tools to the current provider: `spawn_agent`, `list_agents`, `send_message`, `followup_task`, `interrupt_agent`, and `wait_agent`. QueueOnly / TriggerTurn, canonical Items, and delivery audit now share one persistence source.
- Completed on-demand Multi-Agent recovery and terminal notifications: restarts hydrate only the exact target, child completion or failure reaches the parent through durable assistant Items and mailbox records, and `wait_agent` returns structured activity with steer-first semantics while projecting canonical Collab / SubAgent Items.
- Changed the MCP Tool surface to a sampling-step snapshot that freezes definitions, allowlists, routes, connections, and timeouts. Resource and prompt operations now use exact `(server, uri/name)` identities to prevent cross-connection matches.
- Added concurrent runtime MCP server startup and fault isolation: optional failures no longer remove healthy connections, while required failures preserve the previous generation and reject incomplete replacements.

### Fixes

- Fixed reverse JSON-RPC connection ownership, boot-scoped request IDs, abort cleanup, at-most-once responses, and resolved tombstones while keeping duplicate, late, disconnected, and unknown responses fail-closed.
- Fixed MCP elicitation active-time timeout accounting, response `_meta`, form schema/number/enum semantics, and cancellation races so user wait time no longer consumes server execution timeouts.
- Fixed Claw first-token and long tool-loop stability by moving first-turn policy ownership into App Server, removing the parallel Renderer fast-routing path, and entering real model synthesis after enough web evidence has been collected.
- Fixed navigation when reopening the same interrupted Claw conversation from the New Task home screen. Explicit user intent now restores the current read model, composer, and follow-up sending instead of being blocked by a stale draft pause.
- Fixed atomic persistence for media provider/model selection and removed legacy Agent runtime barrel dependencies from Sidebar, archived conversations, Automation, Skills, and Plugin history.
- Fixed projection drift across approval session-cache events, canonical Thread identity, active/queued Turns, terminal history, and input restoration without creating duplicate pending Items or falling back to the old read model.

### Improvements and Refactors

- Split the MCP management control plane from the provider tool bridge. Canonical Tool Items are now the sole consumption contract for history, compaction, coding, Skills, MCP, browser, and artifact evidence.
- Removed the old Agent session store, subagent sidecars, aggregate runtime, session query, execution-strategy compatibility layer, backend event stream, and default Playwright MCP seed, with guards preventing restoration.
- Migrated Agent Chat, Automation, Skills, archived conversations, Sidebar, and Plugin history to their current owners while shrinking compatibility barrels, fast-response helpers, and the parallel pending-shell path.
- Consolidated canonical Multi-Agent activity into `Started`, `Interacted`, and `Interrupted`. `list_agents` remains a regular Tool, while legacy V1 resume / close and historical activity variants no longer enter current producers.
- Split large App Server event-store, projection-materializer, Agent-runtime, and GUI modules to preserve domain ownership and single-source-of-truth boundaries.

### Tests and Quality

- Expanded App Server protocol/schema, Rust and TypeScript clients, Electron host, and Renderer contracts for server-originated requests, resolved notifications, MCP target identity, and elicitation forms.
- Added targeted regressions for Agent graph/mailbox/control, restart-on-demand, terminal Results, concurrent waits, MCP routing/timeout/fault isolation, canonical projection, first-token flow control, and atomic media preferences.
- Added real Electron Gate B, interrupted-conversation reentry and continuation, current-fixture, protocol-guard, and S1-S6 deletion evidence proving the production bridge does not fall back to mocks.
- Covered user-visible MCP elicitation strings and GUI regressions across `zh-CN`, `zh-TW`, `en-US`, `ja-JP`, and `ko-KR`.

### Documentation

- Updated architecture, command, and MCP documentation for reverse JSON-RPC, MCP runtime/control-plane ownership, Agent graph/mailbox, first-turn policy, and canonical projection boundaries.
- Updated the refactor v2 execution plan and per-slice evidence with current / compat / deprecated / dead classification, validation results, and deletion exit criteria.

### Other

- Bumped version facts to `1.102.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.101.0` -> `v1.102.0`
