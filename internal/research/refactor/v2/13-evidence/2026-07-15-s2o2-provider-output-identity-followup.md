# S2o2 Provider Output Identity Follow-up

## 结论

S2o 的 per-item Message / Reasoning lifecycle 已完成 shared-worktree 收尾。provider raw ID 继续按
sampling attempt scope 生成；Text / Reasoning Start、Delta、End 在 Agent 与 App Server 间保留同一
Item identity。`provider_turn.rs` 与 canonical lifecycle 测试已拆到仓库体量门槛内。

related Rust 首轮暴露 7 个 App Server 回归。6 个来自旧 fixture 仍假设 completion-time lifecycle；
另 1 个是真实实现缺陷：从 `reasoning.completed` 补建 `item.started` 时丢失 source ordinal，导致 imported
Reasoning 与 Agent 同占 ordinal 4，canonical SQLite 因唯一约束回滚。现在 synthesized start 只继承排序、
来源和 metadata 上下文，不复制 reasoning 正文，source ordinal 3 可稳定进入 ThreadStore。

## 实现与守卫

- `provider_turn/output_lifecycle.rs` 独立承接 attempt-scoped output identity 和 start/end 校验。
- canonical lifecycle state 继续以 `(family, itemId)` 为键，terminal Item 拒绝 late delta。
- imported reasoning start 保留 `ordinal/importVersion/sourceProvenance`，正文只由原 reasoning event 持有。
- mailbox、phased Message、external Reasoning 与 conversation import fixtures 已按显式
  started/delta/completed 和 canonical ordinal 更新；生产 fail-closed 规则未放宽。
- 新增回归证明 synthesized Reasoning start 保留 source ordinal，且不会复制 reasoning text。

## 验证

- `npm run test:rust:related -- <S2o2 paths>`：通过。
  - `agent-runtime`：116/116。
  - `app-server`：1112/1112。
  - `lime-agent`：265/265。
  - `lime-scheduler`：24/24。
  - `lime-server`：111/111。
- 三个根因回归 exact test：import canonical lifecycle、reasoning/tool ordinal、source-ordinal start
  context 均 1/1 通过。
- `cargo check --manifest-path lime-rs/Cargo.toml -p app-server --lib`：通过，无 production warning。
- claim 内 Rust 文件 exact `rustfmt --check` 与 `git diff --check`：通过。
- `npm run test:contracts`：通过；client contract 288 checks，命令、modality、scripts 与 docs boundary
  均通过。

全 workspace `cargo fmt --check` 仍会报告并行 MCP 写集的格式差异；本切片未格式化或覆盖该热区。
App Server test build 的 4 个 unused warning 同样来自并行 MCP fixture；统一 Rust runner 已通过真实 stdio
fixture，production check 无 warning。

## 分类

- `current`：attempt-scoped provider identity、per-item lifecycle、source-ordinal-preserving Reasoning start、
  canonical ThreadStore projection。
- `compat`：无新增。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：turn terminal 合成 Item completion、缺失 start 的 external lifecycle、
  丢失 source ordinal 后依赖运行时序号碰运气。

## 路线图关系

S2o2 关闭了 S2o 在完整 related Rust 范围内的最后回归，使 live provider output、conversation import、
mailbox recovery 与 cold read 继续共享同一 Thread/Turn/Item identity 和 ordinal 事实源。
