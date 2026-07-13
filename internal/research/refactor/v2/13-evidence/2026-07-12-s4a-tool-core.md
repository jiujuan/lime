# S4a Tool Core Evidence

> date: 2026-07-12
> slice: S4a-tool-core
> owner: tool-core-a
> codex_commit: `5c19155cbd93bfa099016e7487259f61669823ff`

## Current Contract

- `RuntimeToolDefinition`, `RuntimeToolExposure` and `RuntimeTool` bind model-visible spec, exposure and executor.
- `ToolCall` owns stable turn/call/tool identity, arguments, environment snapshots and a host-provided lifecycle emitter.
- `RuntimeTool::execute_call` emits one started/terminal lifecycle, validates the bound tool name and normalizes success or failure.
- `NormalizedToolOutput` preserves text, structured content, error, duration, truncation, sidecar reference and extension metadata.

## Verification

- `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-s4a-tool-core-target cargo test --manifest-path lime-rs/Cargo.toml -p tool-runtime tool_`: pass, 97 passed, 0 failed, 165 filtered.
- exact rustfmt check: pass.
- `cargo fmt --manifest-path lime-rs/Cargo.toml -p tool-runtime --check`: pass.
- exact diff check: pass.

## Governance

- `current`: canonical tool spec/executor/exposure/call/emitter/output contract.
- `test-only`: recording emitter and structured executor fixtures.
- `compat`, `deprecated`, `dead`: none introduced.
- Production callers remain zero by design; S4a is a contract seed, not proof of product cutover.

## Remaining

S4b must freeze Tool/Approval/MCP/Collab display DTO after S1f/S2e release. S4c then migrates the production lime-agent/App Server lifecycle to `RuntimeTool` and deletes the old ToolStart/ToolEnd emitter path with runtime fixture evidence.
