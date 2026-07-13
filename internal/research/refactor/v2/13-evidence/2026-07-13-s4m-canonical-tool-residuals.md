# S4m Canonical Tool Residuals

## Fact source

Large-output persistence and media projection only consume canonical nested Tool Items.
Raw `tool.started/result/failed/completed` and the `tool_end` alias cannot create
sidecar, read-model, artifact, transcript, or media state.

## Findings

- EventStore already rejected raw Tool lifecycle before output normalization, but omitted
  `tool_end`; that alias was still production-reachable through external append.
- `output_refs` still accepted raw terminal events and could recover text from outer
  `output/result/runtimeEvent` fields. A legal canonical Item could therefore be changed by an
  outer legacy fallback.
- Media projection claimed canonical support but only recognized `tool_call`; current
  `ThreadItemPayload::Tool` serializes as `tool`. It also looked for metadata inside the payload
  even though canonical metadata belongs to the Item. The canonical branch was unreachable.
- Raw output snapshot and media fixtures were positive tests for paths EventStore already rejects.

## Changes

- EventStore rejects `tool_end` with the rest of the retired Tool wire, and external negative
  tests cover the alias.
- Output normalization only accepts terminal `item.completed` with typed Tool, MCP, or Collab
  output. Text and reusable output ref come only from `ToolOutput`; all outer legacy fallback and
  mutation helpers were deleted.
- Large text is previewed in the nested output, marked truncated, and persisted through the
  existing `tool_output` sidecar. Hydration without an event type now defaults to canonical
  `item.completed`.
- Tool, MCP, and Collab large-output fixtures use paired canonical Items and prove read model,
  artifact, filesystem sidecar, and restart hydration behavior.
- Media projection deserializes the nested ThreadItem, reads typed call/name, Item metadata, and
  structured output, and only emits final media for completed+succeeded tasks with sidecar facts.
- Materializer side-channel handling is an exact allowlist for `tool.progress` and
  `tool.output.delta`; raw lifecycle and `tool.input.delta` remain negative-only.
- Large test files were split: `output_refs.rs` is 620 lines; typed projection tests are
  570/416 lines; output snapshot integration remains 794 lines.
- Governance allowlist follows the moved `output_refs/tests.rs` test-only owner, and contract
  guards prevent legacy extractors, projection branches, raw positive snapshots, or missing
  `tool_end` rejection from returning.

## Validation

- `cargo check -p app-server`: pass.
- `cargo test -p app-server output_refs::tests --lib`: `6/6`.
- `cargo test -p app-server coding_events::output_snapshots --lib`: `6/6`.
- `cargo test -p app-server external_events::canonical_tool_items --lib`: `4/4`.
- `cargo test -p app-server thread_item_projection --lib`: `34/34`.
- Media projection focused subset: `5/5`.
- `npm run test:contracts`: pass, `290 checks`.
- `npx vitest run src/lib/governance/legacySurfaceCatalog.test.ts`: `199/199`.
- `npm run governance:legacy-report`: pass, boundary violations `0`.
- Scoped `rustfmt --check` and `git diff --check`: pass.

This slice does not change Electron, JSON-RPC, or Renderer contracts. It fixes the App Server
read/projection owner behind the already validated canonical GUI wire, so no new Gate B run was
required.

## Classification

- `current`: typed Tool/MCP/Collab output sidecar; completed+succeeded canonical media projection.
- `compat`: none.
- `deprecated`: reachable `tool_end` and outer output fallback, removed in this slice.
- `dead`: raw lifecycle output/media interpretation and positive fixtures.
- `test-only`: explicit raw rejection/ignore fixtures.

## Next cut

Audit and delete the zero-consumer `backend_event` mapper/export and the zero-consumer
`core::agent::types::StreamEvent` ToolStart/ToolEnd surface. Keep this separate from current
provider and MCP snapshot owners; prove zero compile-graph consumers before deletion.
