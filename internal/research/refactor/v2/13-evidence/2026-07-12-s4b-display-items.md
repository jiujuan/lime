# S4b Canonical Display Item Evidence

> date: 2026-07-12
> owner: refactor-v2-coordinator
> status: ready-for-review

## Contract

Canonical ThreadItem payloads now distinguish native Tool, MCP tool call, Collab agent call,
Approval and SubAgent activity. Core identity, arguments, output, duration, truncation, reference,
scope, decisions and recovery timestamps are typed fields rather than metadata conventions.

Approval resolution is independent from approval decision. Ask-user and MCP elicitation actions may
complete with `decision = null`; their Item is terminal and Turn approval state is `Resolved`, so
replay cannot reopen a completed request or fabricate approval.

## Validation

- `cargo test -p agent-protocol`: 24 passed.
- `cargo test -p app-server thread_item_projection --lib`: 25 passed.
- `cargo test -p app-server-protocol --test schema_fixtures`: 1 passed.
- App Server TypeScript client typecheck: passed.
- App Server TypeScript client tests: 62 passed.
- `npm run test:contracts`: passed; 678 generated v0 types, zero drift, 287 client checks.

## Remaining

S4c has connected RuntimeTool/ToolCall/Emitter to the current provider. S4d must project that
lifecycle directly to canonical Tool Item and delete the deprecated ToolStart/ToolEnd wire. MCP Turn
snapshot, approval restart recovery, Skills policy and AgentControl/mailbox remain separate S4 work.
