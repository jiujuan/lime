## Lime v1.93.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Continued moving Agent Runtime toward the Codex-first Thread / Turn / Item path with runtime conversation, queue, timeline, session query, and thread-store projection modules that reduce coupling to old Aster session storage.
- Expanded subagent and collaboration projections so App Server, Rust agent, `packages/agent-runtime-projection`, UI contracts, and chat surfaces can present subagent status, collaboration facts, tool lifecycle metadata, and thread item state more consistently.
- Added more Soul / personal style output surfaces, including built-in profiles, style directives, interaction copy, and tool lifecycle descriptors shared by settings, chat workspace, and the five locale resource sets.
- Improved plugin runtime declarations and Content Factory release gates with runtime capabilities, detail-page declaration sections, signed release gate GUI support, operator readiness, cloud evidence fetching, and release evidence output.

### Fixes

- Fixed Claw / Agent chat stream resume, input restore, terminal turn guard, stale stream handling, and user input submission boundaries to reduce stuck input, stale terminal events, and history hydrate mismatches.
- Fixed App Server event stream, thread client, session runtime read models, tool event projection, and imported runtime event details so live streams and history hydrate use the same projection semantics.
- Fixed model request policy, managed model fetch access, provider stream, context fragments, and auto-compaction handling to keep model capabilities, tool policy, and request metadata aligned.
- Fixed Electron App Server sidecar proxy / environment propagation, dev launch, package resource verification, and packaged manifest loading for more stable development, GUI smoke, and packaged startup flows.

### Improvements and Refactors

- Retired a large slice of vendor Aster residuals, removing old auto reply, background, blueprint, checkpoint, Chrome MCP, codesign, diagnostics, git/github, map, and session export implementations while strengthening Aster migration boundary guards.
- Split Rust agent and app-server central files into narrower domain modules for tool lifecycle, tool output truncation, runtime store adapters, session record SQL, context auto compaction, tool process metadata, and request context.
- Split Agent chat frontend logic for timeline copy, collaboration copy, tool batch grouping, tool process summary metadata, stream input restore policy, and workspace session projection to reduce component-level state machine complexity.
- Continued turning Writing v2, Soul, Aster migration, Claw stream test matrices, and refactor v1 research into versioned repository artifacts for follow-up execution.

### Tests and Quality

- Added and updated regressions for Agent runtime current fixtures, Claw stream P0, subagent status, tool lifecycle, tool truncation, app server facts, thread item projection, streaming text, input restore, and workspace send flows.
- Added Rust targeted tests for model request policy, session execution runtime, session store provider routing, tool orchestrator lifecycle / truncation, context auto compaction, plugin runtime capabilities, and media task artifacts.
- Updated App Server client contracts, protocol projection, Electron current entrypoint guards, package resource verifier, scripts governance, Aster migration boundary, and context policy boundary checks.
- Expanded Content Factory production readiness, signed release gate, release evidence, and GUI evidence tests around signing placeholders, secret hygiene, cloud evidence fetches, pipeline reports, and operator command output.

### Documentation

- Updated the root AGENTS guide and engineering navigation to name Codex-first as the primary Agent refactor rule and document new module, command boundary, quality workflow, and execution-plan entry points.
- Updated Writing v2, Soul personal style, Aster capability intake, Claw stream guardrails, refactor v1 impact audit, and test roadmaps with the current release candidate context and exit conditions.

### Other

- Bumped version facts to `1.93.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, `lime-rs/vendor/aster-rust/Cargo.lock`, packaged App Server manifest, and the current-turn smoke client.

**Full changes**: `v1.92.0` -> `v1.93.0`
