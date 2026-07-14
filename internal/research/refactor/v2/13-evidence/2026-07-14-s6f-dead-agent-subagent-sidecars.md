# S6f 无调用 Lime-Agent Subagent Sidecar 删除证据

> date: 2026-07-14
> slice: S6f-dead-agent-subagent-sidecars
> owner: root

## 事实源

可见 Subagents 的 current 产品链继续是：

```text
Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore
  -> canonical agent graph / mailbox -> Thread / Turn / Item projection -> GUI
```

通用 `SubagentRuntimeStatus`、`SubagentLatestTurnProjection` 与状态枚举的唯一 DTO owner 是
`agent-runtime/src/session_execution.rs`。`lime-agent/subagent_control` 只是本地 queue、旧
`subagent_control.v0` extension 和 Team governor 的旁路 loader；`subagent_profiles` 只是无消费者
的 profile DTO。两者没有 Rust crate 内外 caller，不能作为 current 或 compat 保留。

## 已删除

- 删除 `lime-rs/crates/agent/src/subagent_control.rs`，包括 local status loader、旧 extension
  state 和内嵌测试；
- 删除 `lime-rs/crates/agent/src/subagent_profiles.rs`，包括无消费者 profile/skill DTO；
- 删除 `agent/src/lib.rs` 的两个 private module declaration；
- `agentMigrationBoundary` 记录两个物理删除路径；
- `rust-retired-agent-subagent-sidecars` dead guard 禁止 module、loader、旧 extension 和 profile
  DTO 恢复。

未修改 `agent-runtime/session_execution.rs`，也未触碰 App Server canonical graph、mailbox、child
session、协议、Electron 或 GUI projection。

## 验证

- Rust 搜索 `subagent_control`、`subagent_profiles`、`load_subagent_runtime_status`、
  `SubagentSkillSummary` 与 `SubagentCustomizationState`：删除后零命中；
- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent --lib -q`：通过；
- `cargo check --manifest-path lime-rs/Cargo.toml -p lime-agent`：通过；
- `cargo test --manifest-path lime-rs/Cargo.toml -p agent-runtime session_execution --lib -q`：通过；
- `cargo check --manifest-path lime-rs/Cargo.toml -p agent-runtime`：通过；
- `npx vitest run src/lib/governance/legacySurfaceCatalog.test.ts --silent=passed-only`：202 tests 通过；
- `npx vitest run src/lib/governance/agentMigrationBoundary.test.ts --testNamePattern "已删除的 lime-agent Agent adapter 不得恢复" --silent=passed-only`：通过；
- catalog JSON parse 与 S6f 精确写集 `git diff --check`：通过。

本 slice 不改桥接、JSON-RPC、Renderer 或 GUI 行为，GUI smoke 与 Gate B 不适用。

## 分类

- `current`：`agent-runtime/session_execution.rs` generic DTO，App Server canonical graph/mailbox
  与 Thread/Turn/Item projection；
- `compat` / `deprecated`：本 slice 未保留或新增；
- `dead / deleted / forbidden-to-restore`：`lime-agent` local `subagent_control` loader、
  `subagent_control.v0` extension、profile/skill DTO 与 module declarations。
