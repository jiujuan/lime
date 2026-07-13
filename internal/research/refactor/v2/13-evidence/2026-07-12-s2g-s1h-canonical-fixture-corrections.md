# S2g/S1h Canonical Fixture Corrections

> date: 2026-07-12
> status: ready-for-review

## Result

- `message.delta_batch` is preserved by the canonical materializer and coalesces by current `itemId`.
- `requestId` merges `action.required` and `action.resolved` into one terminal Approval item.
- Projection-summary tests seed JSONL, the classic projection and canonical ThreadStore consistently.
- App Server notification tests verify the notification-only canonical Item before comparing the unchanged durable source payload.

Codex warnings remain notifications rather than ThreadItems; no warning DTO or raw fallback was added.

## Verification

- `thread_item_projection`: 26 passed.
- `runtime::tests::sessions`: 19 passed.
- broad `sessions` filter: 30 passed.
- targeted S1h JSONL loop: 1 passed.
- exact rustfmt and diff checks passed.

The latest controlled Electron fixture completed with `ok=true`, real preload/App Server JSON-RPC,
current session start/read/list, completed read model, aligned tool call and no live provider.
