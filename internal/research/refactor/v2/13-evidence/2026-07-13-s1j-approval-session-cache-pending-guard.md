# S1j Approval Session Cache Pending Guard

> status: blocked on S4m canonical materializer
> verified_at: 2026-07-13
> owner: S1j coordinator; fix owner: S4m App Server projection

## Gate B evidence

The controlled Electron `approval-request-resume` fixture completed the second
turn and restored the input, but its current turn still rendered `待确认 1`.
The strict Renderer guard correctly rejects this state.

- command:
  `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario approval-request-resume --prefix s1j-canonical-approval-resume-pending-guard --timeout-ms 240000 --keep-temp`
- evidence:
  `.lime/qc/gui-evidence/claw-chat-current-fixture/s1j-canonical-approval-resume-pending-guard-summary.json`
- failure snapshot:
  `approvalPromptVisible=false`, `hasSecondPrompt=true`,
  `hasSecondDoneText=true`, `hasPendingApprovalStatus=true`,
  `textareaVisible=true`, `textareaDisabled=false`.

The guard scopes `待确认` to the second `message-turn-group`; it deliberately
does not inspect the complete page, where the first turn's terminal Approval
record is expected.

## Root cause and owner

Retained canonical event log:

`/var/folders/87/s6cpr7hd1_v43cs833x4s_900000gn/T/claw-chat-current-fixture-W7zzi9/electron-user-data/app-server/runtime/events/sessions/session_claw-chat-current-1783923850381-79994.jsonl`

For second turn `8b9b2161-5fa7-4dfb-87d2-c6f01a12ea00`:

1. Sequence 14 `approval.session_cache.hit` carries provider request ID
   `claw_request_547665a81a28416699a749d746c1aa18` and original
   `sourceRequestId` only.
2. Sequence 16 `action.resolved` correctly owns canonical request/action ID
   `permission-8b9b2161-5fa7-4dfb-87d2-c6f01a12ea00`, with
   `source=approval_session_cache` and `decision=allow_for_session`.

The retained `projection_1.sqlite` proves the duplicate materialization in
`canonical_items` for that turn:

- seq 14, item/request ID `claw_request_547665a81a28416699a749d746c1aa18`,
  `kind=approval`, `status=pending`;
- seq 16, item/request ID
  `permission-8b9b2161-5fa7-4dfb-87d2-c6f01a12ea00`, `kind=approval`,
  `status=completed`.

The App Server canonical materializer currently turns the cache-hit audit event
into a pending Approval using the provider request ID. The later resolved event
uses the canonical permission ID, so it cannot clear that false pending item.
This is an S4m `event_store` / `thread_item_projection` owner defect, not a
Renderer condition that may be relaxed.

## Required exit

- `approval.session_cache.hit` remains audit evidence and must never materialize
  an Approval Item, pending request, or `action_required` state.
- `action.resolved` remains the sole terminal Approval Item for the generated
  `permission-<turnId>` identity.
- Add materializer and restart/read regressions for cache-hit then resolved:
  no pending Approval remains and the canonical resolved request ID persists.
- Rebuild App Server assets and rerun the strict Gate B. It must show no second
  turn `待确认`, while retaining exactly one compact terminal Approval record.

## Guard and local validation

S1j added a static fixture regression requiring the current-turn pending guard
to remain present. `node --check` passed for the affected fixture scripts;
`npx vitest run scripts/agent-runtime/claw-chat-current-fixture-gui-completion-waits.test.mjs scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs --reporter=dot`
passed `55/55`; `git diff --check` passed.

## Resolution

> status: completed / Gate-B-passed
> resolved_at: 2026-07-13T15:13:33+08:00
> owner: S1k approval-session-cache-audit-only coordinator

The canonical materializer now treats `approval.session_cache.hit` as audit
evidence only. It creates neither an Approval Item nor a canonical Item
notification. The subsequent cache-backed `action.resolved` is the single
terminal Approval Item and retains `permission-<turnId>` identity.

Focused validation passed before the Electron rerun:

- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server approval_session_cache_hit_remains_audit_only_before_auto_resolution --lib`: `1/1`.
- Focused fixture Vitest: `56/56`.
- `npm run electron:build:app-server-assets`.
- `git diff --check`.

Final strict Gate B:

```text
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs \
  --scenario approval-request-resume \
  --prefix s1k-approval-session-cache-audit-only \
  --timeout-ms 240000 \
  --keep-temp
PASS
```

Evidence:

- `.lime/qc/gui-evidence/claw-chat-current-fixture/s1k-approval-session-cache-audit-only-summary.json`
- `.lime/qc/gui-evidence/claw-chat-current-fixture/s1k-approval-session-cache-audit-only-backend-ledger.json`

All `50/50` assertions passed. The second real Electron turn persisted:

```text
turn.accepted
-> approval.session_cache.hit (audit)
-> action.resolved (permission-<turnId>)
-> provider.request.started
-> turn.completed
```

The second `message-turn-group` had no `待确认`; the strict Renderer guard was
not relaxed. The canonical read model retained one compact completed Approval
record.

## Classification

- `current`: canonical App Server Thread/Turn/Item projection and strict
  Renderer guard.
- `compat`: none.
- `deprecated`: none added.
- `dead`: using a provider request ID to create an Approval Item from a
  cache-hit audit event.
