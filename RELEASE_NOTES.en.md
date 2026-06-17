## Lime v1.71.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features
- Added the Codex conversation import path: the sidebar can scan Codex sessions, preview rollout content, require user confirmation, import into a Lime session, and preserve source provenance.
- Added `conversationImport/thread/preview` and `conversationImport/thread/commit` App Server JSON-RPC methods with dry-run impact counts for messages, turns, attachments, and timeline items.
- Codex import now supports current `state_*.sqlite` metadata, archived sessions, stale rollout path repair, `.jsonl.zst` rollout files, and Codex image attachment mapping.
- Imported sessions enter the current `agentSession/read` / `evidence/export` chain and can continue with a new turn in the same Lime session.

### Fixes
- Fixed duplicate Codex import commits creating duplicate Lime sessions; the same source thread now reuses the existing imported session within the same RuntimeCore process.
- Fixed imported sessions showing only text while losing tool, command, patch, approval, and web-search detail in the conversation page.
- Fixed imported-session continuation losing source cwd, model, reasoning, approval, sandbox, memory, and related runtime context.
- Fixed project-scoped sidebar conversation ownership and import entry behavior when the active workspace is restored from remembered project state.

### Improvements and Refactors
- Split the conversation import runtime into focused Codex parser, path repair, media, dry-run, commit-event, and import-status modules to keep the central runtime boundary small.
- Added RuntimeCore imported-session timeline projection so imported runtime events become GUI-readable `detail.items`.
- Moved the sidebar import flow into a dedicated dialog and empty-state component while keeping the sidebar itself as thin wiring.
- Kept conversation import protocol, schemas, npm client, frontend API shape guards, and governance scripts aligned on the current App Server source of truth.

### Tests and Quality
- Added a real Codex content-studio dogfood smoke covering unconfirmed commit rejection, preview / confirmed commit, duplicate import reuse, dry-run summary, attachments, and provenance.
- Added an Electron continuation fixture that reads the imported session through the real preload bridge, verifies imported timeline details, and continues in the same session.
- Added an Electron click-through fixture that starts from the sidebar import dialog, confirms import, opens the session page, verifies imported details, and sends a follow-up through the real input box.
- Expanded Rust conversation import, evidence export, runtime item projection, App Server protocol schema, app-server-client, sidebar, and Agent Chat history hydration coverage.
- Updated the root app, Rust workspace, CLI npm package, App Server client package, Agent Runtime client dependency, pnpm lock, and Cargo lock to `1.71.0`.

### Documentation
- Added the Codex conversation import PRD covering Codex-first scope, Claude Code importer extension points, canonical import bundles, dry-run behavior, fidelity summary, and provenance rules.
- Added the Codex conversation import implementation tracker from scan / preview through commit / evidence / continuation / click-through GUI fixture closure.
- Updated Agent Workspace roadmap notes for future artifact evidence and run observability use of imported timeline and provenance.

### Other
- This release continues moving external Agent-client history assets into Lime `SessionDetail`, Agent Runtime events, Evidence Export, and Electron Desktop Host current paths. Codex source directories remain read-only, with no renderer-side local scanning or second transcript store.

**Full changes**: `v1.70.0` -> `v1.71.0`
