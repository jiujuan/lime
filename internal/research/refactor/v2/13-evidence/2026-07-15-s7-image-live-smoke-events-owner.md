# S7 Image Live Smoke Events Owner

## 结论

`5f9b7b2b9` 将 `image_task.create_failed` emitter 从 `image_command/mod.rs` 拆到 current
owner `image_command/events.rs`，但 live smoke guard 的 source read set 没有同步，导致事件
仍存在却误报失败。修复只把 `events.rs` 加入 guard 读取范围，不修改 production Rust、事件名
或 live-provider policy。

## 分类

- `current`：`image_command/events.rs` 唯一事件 owner，`mod.rs` workflow facade。
- `test-only`：`claw-image-live-smoke.test.mjs` source guard。
- `dead`：旧 `image_task.presentation.unavailable` half-success surface，继续受负向 guard 保护。
- `compat / deprecated`：无。

## 验证

- focused live smoke guard：`5/5`。
- fresh frontend batch 14：16 files / `111/111`，其中 image guard `5/5`。
- fresh `npm run verify:gui-smoke`：通过真实 Electron/App Server sidecar 主链。
- fresh `npm run governance:legacy-report`：`0/0/0`。
- Prettier 与 claimed diff check：通过。
- `verify:local` 的前端 110/110 batches 全绿；changed-Rust 外部 MCP stdio stack overflow
  不属于本 slice。

## 并行边界

`mod.rs` 与 `events.rs` 在本 slice 中只读且无本 slice diff；active S2o Rust 热区未夹写。
