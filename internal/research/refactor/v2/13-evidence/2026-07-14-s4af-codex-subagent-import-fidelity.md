# S4af Codex SubAgent import fidelity evidence

日期：2026-07-14

## 结论

Codex `sub_agent_activity` / `subagent_activity` import 现在显式把 source `kind`
写入内部 `subagent.activity` 事件的 `activity` 字段。canonical materializer 已优先读取
`activity`，因此 `Started`、`Interacted`、`Interrupted` 不再被 `statusLabel=running`
或 `status=in_progress` 误投影为统一的 `Interacted`。

`statusLabel`、`status`、`role` 继续只承载旧展示和来源信息；它们不替代 typed activity。
本切片没有恢复 raw Codex product wire、没有修改 SubAgent protocol/schema，也没有触碰
S4ae cold/live GUI、Plan materializer 或 Electron 热区。

## 回归

新增 `codex_subagent_activity_preserves_current_kind`，逐值验证三种 current Codex kind
进入内部 runtime event 后仍保留同名 `activity`，并确认事件类型仍为
`subagent.activity`。

## 验证

- scoped `rustfmt --check`：通过。
- tracked diff `git diff --check` 与新文件 trailing-whitespace 扫描：通过。
- `codex_subagent_activity_preserves_current_kind`：1/1。
- `commit_projects_codex_runtime_specialized_items_into_existing_timeline_types`：1/1，证明
  commit/read 端到端 timeline 未回归。
- `cargo check -p app-server --lib`：通过。

首次 focused test 曾因共享磁盘 `ENOSPC` 失败；并行进程恢复可用空间后已完整重跑通过，
因此该环境问题不再是本切片 blocker。测试编译仅报告共享基线中的未使用测试辅助代码 warning。

## 治理与并行边界

- `current`：Codex current activity kind 到 canonical SubAgent activity 的精确保真。
- `compat`：无新增。
- `deprecated`：source-local status label/role 仍由既有 import presentation 使用，本切片不扩展。
- `dead`：raw Codex event 作为 product wire，未恢复。

S4ae active claim 占用 `thread.rs`、schema/generated TS、GUI、architecture 与执行计划；本切片
全部避让。执行计划登记应在 S4ae 释放热区后由 coordinator 合并，不能夹写当前 active owner。
