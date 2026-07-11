## Lime v1.99.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Continued converging Agent / Tool Runtime on the Codex-first Thread / Turn / Item chain with structured request-user-input, runtime timeline record, runtime item / request / status / turn event modules.
- Added current extension surface, runtime store, sampling, gateway dispatch, and request-user-input execution layers across MCP, thread-store, model-provider, and tool-runtime to reduce old Aster surface in production paths.
- Split Agent Chat Workspace runtime modules for artifacts, browser assist, conversation message list, right surface, service skills, team memory, image workbench, and inputbar presentation, reducing giant-component complexity.
- Extended benchmark release and agent runtime smoke coverage with managed tool execution, P0 coding artifact, and current fixture assertions so release evidence remains tied to the real current chain.

### Fixes

- Fixed state closure across Agent stream completion, failure, stop, continuation, history restore, and assistant visible text to reduce fake running states and duplicate output.
- Fixed current projection consistency for request user input, approval prompts, tool batches, shell / file execution, runtime overlay, and tool inventory.
- Fixed boundary regressions around image commands, model selection, provider stream, OpenAI image requests, and reasoning policy.
- Fixed Workspace initial navigation, input restore, task-center sending, right surfaces, and workbench canvas layout regressions.

### Improvements and Refactors

- Removed large old Aster-shaped areas from `agent-compat` and `agent-runtime`, including ask, subagent, session manager, legacy tool, file/search/shell/powershell implementations, while keeping the required compat owner.
- Split runtime state, request tool policy, runtime store, conversation transcript, runtime snapshot, and reply backend logic into smaller responsibility-focused modules.
- Reduced direct business state inside `AgentChatWorkspace.tsx` and Workspace scene runtime by moving testable logic into projections, selectors, hook runtimes, and unit tests.
- Updated Desktop Host, DevBridge, command runtime, Playwright, quality workflow, and Aster migration boundary guidance to keep old paths classified as retired guards or dead surfaces.

### Tests and Quality

- Added and updated regressions for AgentChatWorkspace boundary guards, InputbarApprovalPrompt, message-list projection, stream lifecycle, Workspace scene, conversation message list, right surfaces, and service skills.
- Expanded targeted Rust runtime / tool-runtime / provider / thread-store / App Server tests for request user input, runtime store, gateway dispatch, sampling, and session state.
- Updated Aster migration boundary, production command current boundary, DevBridge command policy, model reasoning policy, and modality execution profile guards.
- Updated benchmark release manifest, agent-qc scripts, and Electron smoke entry points so release evidence remains bound to the current chain.

### Documentation

- Updated Aster migration Phase 6, refactor v1 impact audit, approval HITL decision model, provider reply backend, clawstream guardrail, benchmark progress, and version test plan.
- Updated command runtime, command boundary, Playwright E2E, and quality workflow docs to clarify current / compat / dead classification.

### Other

- Bumped version facts to `1.99.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.98.0` -> `v1.99.0`
