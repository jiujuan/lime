## Lime v1.98.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Connected Tool Runtime to the current tool execution surface, adding collaboration-agent, file read / search, shell, native dispatch, request-user-input, tool-call surface, and result-projection modules for the Codex-first Thread / Turn / Item execution chain.
- Reused `tool-runtime` request-user-input protocol and `model-provider` response-event types from Agent Runtime, reducing duplicate definitions across runtime, provider, and tool layers.
- Added benchmark release current-chain evidence builder, P0 coding workflow, release audit report, baseline descriptor, and true-run evidence forwarding so external benchmarks must prove the `agentSession/turn/start` and `evidence/export` current chain.
- Extended App Server coding evidence summaries with tool-call counts, completed / failed counts, tool names, and tool call ids for release and replay audits.

### Fixes

- Fixed App Server tool lifecycle projection for runtime `tool_input_delta` events without `tool.started`, while avoiding duplicate runtime starts after synthetic starts.
- Fixed state mismatches between stopping / interrupting an Agent stream, assistant messages, thread items, text overlays, queued-turn restoration, and later continuation.
- Fixed history hydrate / local merge handling of interrupted turns so restored sessions do not show canceled output as still running.
- Fixed benchmark true-run summary checks for current-chain execution, external verifier execution, Evidence Pack validity, and task-set readiness so one ready task or fake evidence cannot release an entire suite.

### Improvements and Refactors

- Significantly reduced the old Aster-shaped `agent-compat` surface by deleting legacy context, permission policy, parallel, resume, recipe, provider, prompt, scheduler, and several old tool files while keeping the required compat owner.
- Split the App Server read model into model routing, queued turns, runtime items, session metadata, and test submodules to reduce central-file complexity.
- Split Claw / AgentChatWorkspace right surfaces, article editor, workspace file manager, skill directory, task-center sending, scene-app execution, and home recovery runtime out of the giant component.
- Split `model-provider` provider stream events into failure, image input, model change, notification, plaintext tool use, poll, progress, response content / context / event, sampling, source execution, text delta, and tool input delta modules.

### Tests and Quality

- Added and updated regressions for tool runtime execution, request user input, collab agent, provider stream, App Server read model, tool lifecycle, coding evidence, Agent stream flow control, and session state.
- Expanded benchmark release run / summary / render / audit report / current-chain evidence tests so strict gate, P0 blockers, true-run blockers, and evidence blockers fail closed.
- Updated App Server protocol schemas, manifest, generated TypeScript types, current boundary guards, Aster migration boundary checks, and i18n unused-key checks.
- External benchmark release gates still require real current-chain evidence and will not pass from dry-run, preflight, or missing local evidence alone.

### Documentation

- Updated Aster migration Phase 6, dead-code deletion, provider reply backend, refactor v1 impact audit, benchmark release, version-test-plan, and execution-plan index materials.
- Documented the benchmark P0 coding gate, current-chain evidence, release audit report, and strict-gate baseline policy.

### Other

- Bumped version facts to `1.98.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.97.0` -> `v1.98.0`
