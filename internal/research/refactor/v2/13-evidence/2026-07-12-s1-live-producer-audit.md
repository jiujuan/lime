# S1 Canonical Live Producer Audit

> date: 2026-07-12
> scope: read-only producer completeness audit
> next slice: S1g-canonical-live-producer

## Finding

The canonical store path is current, but the live notification path is not yet complete:

1. `AgentSessionEventParams::from_event` only creates a canonical notification when `AgentEvent.payload` already contains a fully deserializable `thread`, `turn` or `item` entity.
2. Main App Server production backends emit raw lifecycle payloads such as `turn.completed` metadata without a canonical `turn` object.
3. `append_runtime_events_to_stored_session` applies those events to the canonical `ProjectionStore`, then returns the original raw `AgentEvent` clone.
4. Streaming and non-streaming processor paths both pass that raw event directly to `event_notification_jsonrpc`.

Therefore a successful canonical database write does not guarantee a canonical live notification. Renderer normalization cannot repair this without recreating a second lifecycle owner.

## Contract Mismatch

Production and App Server validation use `turn.canceled`, and the materializer maps it to `TurnStatus::Interrupted`. The protocol live adapter currently accepts `turn.interrupted` instead, which has no current production source and is rejected by the current event schema.

## Frozen Fix Boundary

`S1g-canonical-live-producer` will:

- create canonical notification clones before durable persistence by using the existing typed materializer;
- fail before persistence when a recognized lifecycle event cannot materialize its canonical entity;
- preserve internal durable source payloads instead of embedding notification-only entities back into event-log truth;
- map current `turn.canceled` notifications to the canonical interrupted status and remove the dead `turn.interrupted` branch;
- add positive turn/item notification coverage and a negative missing-entity/fail-closed regression.

The slice must wait for S4b to release the App Server protocol/generated schema hot zone. It may consume the finalized materializer but must not edit S4b display DTO or materializer files.

## Provenance

Codex sends typed `turn/started`, `turn/completed`, `item/started`, `item/completed` and related notifications from its App Server owner; clients do not reconstruct them from raw runtime payloads. Relevant upstream owners are `codex-rs/app-server-protocol/src/protocol/common.rs`, `protocol/thread_history_projection.rs` and App Server outgoing/message processing.
