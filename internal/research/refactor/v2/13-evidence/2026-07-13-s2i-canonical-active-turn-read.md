# S2i canonical active Turn read

## 范围

S2i 验证长生命周期 active Turn 在队列控制期间是否持续存在于 canonical
`thread/read {threadId, turnsView: "full"}`。事实源仍是
`ProjectionStore -> canonical ThreadStore -> Thread/Turn/Item`；没有新增
legacy read 或 Renderer active-stream fallback。

## Rust 证据

新增回归
`runtime::canonical_thread_store_tests::canonical_read_keeps_active_turn_when_long_stream_precedes_queue`
按真实增量顺序分别 apply：

1. `turn.accepted(active)`
2. `message.delta(active)`
3. `queue.added(queued)`

随后 full canonical read 返回两个 Turn，active Turn 为
`status=inProgress, queue.state=running`，queued Turn 为
`status=inProgress, queue.state=queued`。

命令：

```text
LIBRARY_PATH=<native sherpa lib> DYLD_LIBRARY_PATH=<native sherpa lib> \
CARGO_TARGET_DIR=.lime/refactor-v2/targets/s4d-coordinator \
cargo test -p app-server canonical_read_keeps_active_turn_when_long_stream_precedes_queue --lib
```

结果：`1 passed`。

## Gate B 证据

场景：`inputbar-pending-steer-pop-front-resume`，真实 Electron + preload/IPC +
`app_server_handle_json_lines` + external fixture backend。

- 首次复跑：失败。`queuedPromotion.readModelResolved` 的
  `readModelRunningTurnId=null`，没有 `turnCancel`，promotion 等待 120 秒；summary：
  `s2i-canonical-active-turn-read-summary.json`。
- kept run 1：通过。summary：
  `s2i-canonical-active-turn-read-kept-summary.json`；backend ledger 收到 active
  `turnCancel`，SQLite `canonical_turns` 含 active 与 queued Turn。
- kept run 2：通过。summary：
  `s2i-canonical-active-turn-read-kept-2-summary.json`；backend ledger 收到 active
  `turnCancel`，queued second Turn 在 reload 后 position 0。

kept run 1 的 durable event log 证明 active admission/progress 已先写入：

```text
seq 1  message.created   active
seq 2  turn.accepted     active
seq 3-6 provider/message active progress
seq 8  queue.added       rich queued
seq 10 queue.added       second queued
seq 11 queue.promoted    rich
seq 12 turn.canceled     active
```

对应 SQLite `canonical_turns` 在收尾时保留 active（terminal interrupted）与两个
queued/promoted Turn，说明 materializer/store 不会因 queue apply 删除 active identity。

### kept run 3（2026-07-12T21:50Z）

命令：

```text
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs \
  --scenario inputbar-pending-steer-pop-front-resume \
  --prefix s2i-canonical-active-turn-read-rerun \
  --keep-temp --timeout-ms 240000 --interval-ms 500
```

结果：通过。summary：
`.lime/qc/gui-evidence/claw-chat-current-fixture/s2i-canonical-active-turn-read-rerun-summary.json`；
backend ledger：
`.lime/qc/gui-evidence/claw-chat-current-fixture/s2i-canonical-active-turn-read-rerun-backend-ledger.json`。

本次 `queuedPromotion.readModelResolved` 解析到唯一 active
`e0b29cde-c29a-488b-87cd-376dee4c6870`，随后 `promoteResult`、`interruptResult`
均成功，backend ledger 收到该 Turn 的 `turnCancel`。保留临时目录：
`/var/folders/87/s6cpr7hd1_v43cs833x4s_900000gn/T/claw-chat-current-fixture-FqtLKT`。

该目录的 durable event log 为：

```text
seq 1  message.created   active
seq 2  turn.accepted     active
seq 3-6 provider/message active progress
seq 7  message.created   queued rich
seq 8  queue.added       queued rich
seq 9  message.created   queued second
seq 10 queue.added       queued second
seq 11 queue.promoted    rich queued
seq 12 turn.canceled     active
```

`projection_1.sqlite` 的 `canonical_turns` 在收尾时仍包含 active（`status=interrupted`,
`queue.state=running`）以及两个 queued/promoted Turn；`canonical_history_applies`
包含 queue/read 相关序列，证明这次 promotion 前的 canonical read 不是 Renderer 本地
状态推断。

## 判定

- `current`：canonical Thread/Turn/Item materializer、SQLite ThreadStore、S5c queue
  projection；没有新增实现。
- `compat`：无。
- `deprecated`：旧 AgentSession rich read 仍仅作为尚未删除的历史/旁路 consumer，不能
  回到 S5 queue truth。
- `dead`：无新增删除。

一次无 kept-temp 的早读失败仍保留为 timing/environment evidence；随后三次 kept-temp
Gate B 均在 promotion 前从 canonical read 解析唯一 active Turn，并在 backend ledger
看到 cancel。Rust focused regression 与 durable event/SQLite 证据均未发现服务端丢写，
因此不添加 GUI fallback，也不再把该失败作为 S2i 交付阻塞。

## Coordinator 验收（2026-07-13T01:30:20Z）

只读复核确认 queue control 的 `activeTurnId` 仅来自 full canonical
`thread/read` 投影；缺 canonical thread、identity 冲突、queued membership 不符或多 active
均 fail closed，本地 active stream 不会参与 interrupt identity。

当前工作树复测结果：

- Rust canonical active read 回归：`1 passed`；
- queue/read/flow focused TS：`32/32 passed`；
- `npm run typecheck`：通过；
- `npm run test:contracts`：通过，App Server client `290 checks`。

S2i 判定为 `completed / coordinator-validated`，协调锁已标记 released；未删除锁目录。
