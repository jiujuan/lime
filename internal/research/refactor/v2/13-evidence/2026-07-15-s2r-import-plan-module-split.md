# S2r Conversation Import Plan Module Split

## Fact Source

Codex conversation import 在 parser 边界把 source event 归一化为 typed draft。`events.rs`
只负责 ResponseItem / EventMsg family 路由和 Plan-vs-Tool 分派；Plan lowering 与展示格式属于
独立 specialized module。

## Changes

- 新增 `codex/events/plan.rs`，承接 `update_plan` ResponseItem、completed Plan Item、
  step status normalization 与 markdown 构造。
- `item_completed_event` 继续在 root 精确判断 Plan 或 Tool，再委托 specialized builder；
  authoritative item/revision identity、status、source 与 wire 字段未改变。
- `events.rs` 从 1002 行降至 921 行，关闭 S2m 登记的超线退出条件。
- 未修改 active S2o2 持有的 `conversation_import/tests/runtime_events.rs`，也未触碰协议、
  Renderer、Electron、provider 或 runtime behavior。

## Validation

- `cargo test -p app-server plan --lib`: 24/24 passed，覆盖三个 imported Plan lifecycle
  回归及相邻 canonical Plan projection/parser tests。
- `cargo check -p app-server --lib`: passed。
- scoped `rustfmt --check`: passed。
- root line count: `1002 -> 921`。
- scoped `git diff --check`: passed。

## Classification

- `current`: typed Codex import router 与 specialized Plan lowering module。
- `compat`: none。
- `deprecated`: none。
- `dead`: root 中混合承担的 Plan builder/helper responsibility，已迁出且不保留双实现。

## Next Cut

Skills Runtime test-only external fixture 仍发送已退役 raw Tool lifecycle；应迁到 canonical
Tool Item，并补 retired raw fixture guard 后重跑专用 Electron Gate B。
