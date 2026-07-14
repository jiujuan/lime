# S7e Runtime Value Fields Split Evidence

## 结论

`RuntimeCore` facade 中通用的 ID、JSON 字段与时间 helper 已原样迁入私有
`runtime/value_fields.rs` owner。`runtime.rs` 从 `741` 行降到 `656` 行，只保留状态、依赖注入、
backend contract 与 facade wiring；没有修改持久化、lifecycle、协议、compat 或 fallback 行为。

## 边界与可见性

- `current`：`runtime.rs` 继续是 `RuntimeCore` facade/state wiring owner；`value_fields.rs` 是通用
  runtime 值字段 helper 的唯一 current owner。
- `new_id`、`optional_id_or_new`、`string_field`、`string_array_field`、`raw_string_field`、
  `metadata_string`、`timestamp`、`timestamp_seconds`、`json_string` 通过 facade 私有导入继续只供
  `runtime/**` 后代使用。
- `event_request_id` 在 facade 上保留原 `pub(super)` 重导出，因此 crate 内既有调用可见性不变；
  私有 `value_fields` 模块没有成为新的外部入口。
- `compat` / `deprecated` / `dead`：本切片没有新增或保留这些 surface，也没有建立包装层。
- S2l 的 `canonical_thread_store`、`projection_repair`、`event_mapper` 以及 `runtime_backend` 均未触碰。

## 变更

- 新增 `runtime/value_fields.rs`，承接原 `runtime.rs:652-738` 的 10 个 helper，函数体保持原样。
- `chrono::{SecondsFormat, Utc}` 与 `uuid::Uuid` 随实现迁入新 owner。
- `runtime.rs` 只新增模块声明、私有导入和 `event_request_id` 的同级重导出。
- guard support/test 未修改；`appServerRuntimeBoundary` owner list 更新仍由 coordinator 执行。

## 验证

```text
rustfmt --edition 2021 --config skip_children=true \
  lime-rs/crates/app-server/src/runtime.rs \
  lime-rs/crates/app-server/src/runtime/value_fields.rs
=> passed

cargo test --manifest-path lime-rs/Cargo.toml -p app-server --lib -j 2 \
  "runtime::tests::" -- --nocapture
=> 234 passed; 0 failed; 859 filtered out

cargo check --manifest-path lime-rs/Cargo.toml -p app-server
=> passed

git diff --check -- lime-rs/crates/app-server/src/runtime.rs
=> passed

rg -n '[[:blank:]]+$' \
  lime-rs/crates/app-server/src/runtime/value_fields.rs \
  internal/research/refactor/v2/13-evidence/2026-07-14-s7e-runtime-value-fields-split.md
=> no matches
```

测试编译输出包含 `runtime_backend/tests.rs` 的 4 条既存 unused/dead-code warning；本切片没有修改该
文件，且测试与 check 均以退出码 `0` 完成。

## 下一刀

coordinator 应把 `value_fields.rs` 加入 `appServerRuntimeBoundary` 的允许 owner 并运行对应 guard；
随后继续按独立 claim 拆分 facade 中剩余职责，不应把 helper 重新堆回 `runtime.rs`。
