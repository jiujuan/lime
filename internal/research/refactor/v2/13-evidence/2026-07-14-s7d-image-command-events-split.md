# S7d Image Command Events Split Evidence

## 结论

image command 的 canonical image / workflow / Tool Item / turn event projection 已从
`image_command/mod.rs` 原样抽到私有 `image_command/events.rs` owner。主文件从基线 `909` 行降到
`234` 行，新 events owner 为 `696` 行；workflow facade、事件顺序、payload、协议与 GUI surface
均未另起第二套实现。

## 分类

- `current`：`image_command/mod.rs` 是图片命令 workflow orchestration facade，负责 intent、
  presentation、media task 调用与成功/失败分支编排。
- `current`：`image_command/events.rs` 是该 workflow 内部 event projection 的唯一 owner，负责
  workflow audit、assistant presentation、canonical Tool Item、image task domain event 与
  `turn.completed` 投影。
- `compat / deprecated / dead`：本切片没有新增或保留这些 surface；没有 raw Tool lifecycle、
  fallback、mock 或旧 image skill launch 恢复。

## 变更事实

- `mod.rs` 新增私有 `mod events`，只导入 workflow orchestration 实际调用的 event helper。
- 原 `mod.rs:262-908` 的 workflow step facts、audit payload、presentation event、task create
  event、canonical Tool Item 与 terminal event helper 迁入 `events.rs`。
- 测试需要的 event DTO import 改为 `#[cfg(test)]`，生产 facade 不再持有 event projection
  的具体类型依赖。
- `appServerRuntimeBoundary` 已把 `events.rs` 登记为 image command 拆分 owner，主文件
  `<=800` 行守卫继续生效。

## 验证

```text
rustfmt --edition 2021 --check \
  lime-rs/crates/app-server/src/runtime_backend/image_command/mod.rs \
  lime-rs/crates/app-server/src/runtime_backend/image_command/events.rs
=> passed

cargo test --manifest-path lime-rs/Cargo.toml -p app-server --lib \
  "runtime_backend::image_command::tests::" -- --nocapture
=> 10 passed; 0 failed; 1085 filtered out

cargo check --manifest-path lime-rs/Cargo.toml -p app-server
=> passed

./node_modules/.bin/vitest run \
  src/lib/governance/appServerRuntimeBoundary.test.ts --reporter=dot
=> 25 passed; 0 failed

git diff --check -- <S7c/S7d/S7f claimed implementation files>
=> passed
```

Rust test build 报告了共享 `runtime_backend/tests.rs` 的 4 条既存 unused/dead-code warning；
S7d 未修改该文件，测试与 check 均以退出码 `0` 完成。

## 阻塞与协调状态

- 原 owner `image-command-events` 已断线；实现、focused test、`cargo check` 与 guard 已客观
  完成，但其 claim 仍为 active，且没有 owner handoff / release。本 evidence 不代替 coordinator
  做 claim/lock 清理。
- 本切片没有改变 GUI 或跨层协议，未运行 GUI smoke / Gate B；现有验证只证明结构抽离与 Rust
  行为回归，不单独构成 GUI 可交付证据。

## 下一刀

`image_command/presentation.rs` 当前仍超过 `800` 行。若继续扩 presentation，应先按生成调用、
解析/校验或 Soul presentation 的现有职责边界另开窄 claim 拆分；不得把事件 helper 折回
`mod.rs`，也不得借拆分改变 canonical Tool / image task / turn event 顺序。
