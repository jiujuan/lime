# S4r2b Reverse JSON-RPC Correctness

## Review closure

The S4r2 foundation had passed its original focused tests, but its first evidence draft did not
record three closeout review requirements. The released source now satisfies all three and this
slice validates and records them before S4r3 may depend on the broker.

## Guarantees

- App Server outer ids include a random boot UUID plus a monotonic counter, so a stale Renderer
  response from an old sidecar process cannot collide with the first request after restart.
- `PendingServerRequest` keeps its receiver armed while awaiting. Aborting the wait drops the
  registration owner and removes the exact pending sender before a late response can arrive.
- Renderer tracks both in-flight and settled request ids for one connection. Concurrent or
  sequential replay does not execute the handler or responder twice; `reset()` defines the only
  boundary that clears those identities.
- Multiple simultaneous App Server clients fail closed as ambiguous and do not leak a waiter.

## Validation

- App Server focused server-request tests: 7/7.
- Renderer server-request dispatcher tests: 6/6.
- Scoped Rustfmt, Prettier, and `git diff --check`: passed.
- `npm run test:contracts`: passed, including 290 App Server client checks and docs boundary.

`cargo fmt -p app-server --check` reports a pre-existing formatting delta in the released S4r2
`app-server/src/lib.rs` write set. The claimed `server_request.rs` passes scoped Rustfmt; S4r2b did
not widen its write set merely to rewrite unrelated shared formatting.

## Classification

- `current`: boot-scoped exact App Server request routing and connection-scoped Renderer at-most-once dispatch.
- `compat`: none.
- `deprecated`: none retained.
- `dead`: process-local-only outer ids, abort-leaking pending registrations, and replayable settled
  request ids; removed and covered by regressions.
