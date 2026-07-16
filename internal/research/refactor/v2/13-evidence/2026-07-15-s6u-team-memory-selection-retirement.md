# S6u Team Memory / Selection Retirement

日期：2026-07-15

## 结论

S6u follow-on 已完成。旧 Team memory shadow、TeamDefinition 本地 owner、`recent_team_selection`
session/read-model/schema 字段和 Workspace/service-skill metadata 注入链已从 current 构建图删除。
Multi-Agent GUI 继续只消费 AgentControl Tool Item、canonical child Thread/AgentGraph 和 typed
ContextPacket `team_memory_refs`。

## 已删除

- `localStorage -> teamMemorySync -> useTeamMemoryShadowSync -> team_memory_shadow` 整条链。
- `useSelectedTeamPreference`、TeamDefinition、TeamStorage、TeamRequestMetadata 及其正向 fixture。
- Renderer/App Server client/runtime 的 `recent_team_selection` / `recentTeamSelection` request、readback、compaction 和 schema consumer。
- Rust `SessionExecutionRuntimeRecentTeamSelection`、metadata extractor、runtime extension state 和 App Server session projection/write path。
- service-skill workspace launch 不再注入 selected-team metadata。
- Harness TeamConfig section 与其 current section wiring 删除；Harness 详情继续以 canonical child/thread facts 为准。

## 保留

- typed `team_memory_refs` 仍由 ContextPacket/turn context projection 读取，默认 source 统一为 `context`。
- AgentControl 六工具、canonical SubAgent Item 和 `thread/list|read` child roster 不变。
- 旧 Team 字段仅保留在 `clearLegacyHarnessStateFields`、retired compaction guard 和 boundary test 中，用于阻止回流；它们不是产品事实源。

## 验证

- `npm run typecheck`：通过。
- S6u 定向 Vitest：228/228 通过（Workspace、Harness metadata、Service Skill、runtime compaction、boundary guards）。
- `cargo check --manifest-path "lime-rs/Cargo.toml"`：通过；仅存在既有 unused import 警告。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime`：116/116 通过。
- `npm run governance:legacy-report`：通过，0 zero-reference candidates / 0 drift / 0 boundary violations。
- `npm run test:contracts`：通过（protocol/client/command/harness/modality/scripts/docs）。
- `npm run verify:gui-smoke`：通过；Electron renderer、host/preload、App Server sidecar 与 Claw workbench 均正常启动。
- `git diff --check`：通过。

## 分类

- `current`：ContextPacket typed memory refs、AgentControl、canonical child Thread/Item projection。
- `compat`：无新增。
- `deprecated`：无新增。
- `dead / deleted / forbidden-to-restore`：Team memory shadow、TeamDefinition/local storage owner、recent Team session/read-model/schema、service-skill Team metadata 注入。

## 下一刀

继续清理 Harness summary 中仅用于 retired Team 字段的 guard-only 参数；不得恢复 Team picker、Team metadata 或第二套 child roster。
