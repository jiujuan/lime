## Lime v1.80.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Plugins are now the top-level Lime product concept. New plugin roadmap, PRD, architecture, interface contracts, history-restore rules, and prototypes define plugins as the install / authorization / distribution root, with workspace apps as a plugin capability.
- Added the first Plugin Center and Marketplace frontend path: plugin lists, detail panels, registration and skill panels, installed-state merging, capability categories, view-model projection, and navigation / app-page entry points.
- Claw composer now supports explicit plugin activation with plugin chips / selectors, `@plugin` input, plugin activation context, send-time metadata merging, and Right Surface opening rules. Normal chats no longer rely on semantic plugin guessing.
- Content Factory moved onto the plugin dogfood path with plugin contracts, worker runtime samples, delivery plans, workspace patches, media-cache declarations, fixture packages, and browser intent launch wiring.
- Agent App task worker runtime was expanded so App Server can resolve installed runtime packages, execute worker turns, project product Profile / artifact documents, and keep traceable evidence for Content Factory worker output.
- Browser Runtime high-risk actions now use a confirmation / human-takeover loop. Mutating actions such as `click`, `type`, `submit`, `upload`, `download`, and `javascript` fail closed in the CDP executor and emit `action.required`, permission facts, and Evidence Pack action-index entries.
- ArtifactDocument persistence now carries cross-session scope, save evidence, automatic preview synchronization, and file-level archive manifests, so history restore can continue saving to the same App Server session / artifact ref.

### Fixes

- Fixed ordinary tool process records being replaced by batch summaries. `Read`, `Ran`, Skill, MCP, and similar process steps now remain visible in tool-id order, while WebSearch / WebFetch keep their dedicated retrieval timeline.
- Fixed installed Agent App intent lookup blocking normal sends. Failures or timeouts now skip intent matching without blocking `agentSession/turn/start`.
- Fixed an Artifact store synchronization loop risk during streaming / Browser Assist by switching to artifact content signatures instead of message object identity.
- Fixed stale embedded-browser `WebContentsView` cleanup after main-window refreshes, preventing old browser views from crossing into new renderer state.
- Fixed scattered ArtifactDocument scope during history editing by standardizing `artifact/read`, preview sync, and save append on `artifactDocumentPersistence` metadata.

### Improvements and Refactors

- Split plugin work into testable modules for manifest contracts, marketplace registry, installed state, activation, history restore, Right Surface projection, Content Factory contracts, and browser intent launch.
- Consolidated plugin activation, Agent App intent routing, and installed App cache refresh in `useWorkspaceSendActions` while keeping sends on the current App Server JSON-RPC / RuntimeCore path.
- Added Browser Runtime `action_policy` and moved high-risk action gating into the Rust executor; App Server evidence now consumes structured action state.
- Continued separating Agent Chat streaming rendering by content part, lifecycle, and provenance, with clear owners for ordinary tools, web retrieval, thinking, and final answer text.
- Added a typed OEM cloud control-plane client and contract tests to keep the future remote plugin marketplace boundary explicit.

### Tests and Quality

- Added and expanded tests for plugin manifests, marketplace view models, installed state, activation, history restore, Content Factory contracts, browser intent launch, and Right Surface projection.
- Added and expanded App Server regressions for Agent App worker turns, runtime package resolution, product Profile artifact documents, worker failures, browser action evidence export, and read models.
- Added and expanded Claw regressions for inputbar plugin controls, send routing, ArtifactDocument persistence, artifact preview sync, StreamingRenderer, InlineToolProcessStep, and Markdown display source handling.
- Added and expanded Browser Runtime high-risk action fail-closed tests, Electron embedded-browser host tests, code artifact workbench fixtures, Claw current fixtures, and GUI evidence assertions.
- Updated five-locale i18n resources for new visible copy in Plugin, Agent, Inputbar, Workspace, and Navigation surfaces.
- Updated release version facts to `1.80.0` across the root app, Rust workspace, CLI npm package, App Server client package, Cargo lock, and the Aster sub-workspace lock.

### Documentation

- Added the `internal/roadmap/plugin/` documentation set for the plugin roadmap, including PRD, architecture, technical baseline, interface contracts, implementation plan, history restore, HTML prototype, and low-fidelity prototype.
- Updated Agent App Host v3, Browser Runtime Right Surface, and Claw streaming rendering execution plans with v1.80.0 release-candidate validation evidence, remaining gaps, and exit criteria.
- Updated the browser roadmap to define the current boundary for high-risk action confirmation / human takeover and Evidence Pack action indexing.

### Other

- This release continues converging the plugin workspace, Content Factory dogfood path, ArtifactDocument persistence, Browser Runtime safe actions, and Claw tool-process display onto the App Server JSON-RPC / RuntimeCore / Electron Desktop Host current path. Old plugin command families, semantic activation guessing, ordinary-tool batch summaries, and mock fallback are not sources for new capabilities.

**Full changes**: `v1.79.0` -> `v1.80.0`
