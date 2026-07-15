# S7ad read model workflow owner split

状态：completed / focused-owner-boundary-and-smart-suite-validated

## 结论

`workflow/read` 的 canonical pending-action 过滤行为保持不变，但实现不再回收到
`runtime/read_model.rs` facade。过滤逻辑现在由
`runtime/read_model/workflow.rs` 单独持有，主文件只负责构造 read model 并调用 owner。

这次拆分把 `read_model.rs` 从 880 行降到 831 行，重新满足既有 840 行职责上限；
没有提高阈值、增加 compat、改变协议或恢复 synthetic action fallback。

## 分类

- `current`：`runtime/read_model/workflow.rs` 持有 workflow respond action 的 canonical
  pending identity、deadline、action type 与 run turn 一致性过滤。
- `current`：`runtime/read_model.rs` 继续作为 session/thread read model facade。
- `dead / forbidden-to-restore`：无 canonical pending action 的 fixture respond、顶层
  read-model workflow 业务逻辑和抬高行数阈值的规避方案。

## 验证

- `npm exec vitest run src/lib/governance/appServerRuntimeBoundary.test.ts`：25/25。
- `cargo test --manifest-path lime-rs/Cargo.toml -p app-server --lib workflow_respond_action_requires_matching_canonical_pending_action`：1/1。
- `rustfmt --edition 2021 --check --config skip_children=true`：精确两文件通过。
- `git diff --check`：精确写集通过。
- `npm test -- --resume`：续跑到 110/110，最终 smart state 为 `passed`、
  `failed_batch: null`；第 36 批在 2026-07-15T06:01:36Z 以 exit 0 重跑通过。

## 并行边界

本 slice 未触碰并行 S7y/S2s 的 `read_model/approval.rs`、`read_model/tests.rs` 改动，
也未触碰 active S7ae 的 Content Factory scripts、Rust contract tests 或中央计划。
