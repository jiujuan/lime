# S7p Stream Binding Canonical Lifecycle Fixture Alignment

## 结论

`agentStreamTurnEventBinding` 的 current 正向测试已恢复 production
`projectAppServerAgentEventPayload`，并用 canonical AgentMessage、Tool、Reasoning 与 Turn entity
驱动 GUI stream listener。无 `canonicalEvent` 的 raw lifecycle 继续 fail closed；中途出现的
test-only raw projector workaround 已从这两份 current-chain 测试移除。

## 根因与修复

- batch 70 的 7 个失败都来自手写 `params.event` 缺 canonical entity，不是 production projector
  回归。
- stale-recovery 接管无 lock、无存活 owner 且已停止变化的旧 claim；恢复记录位于
  `.lime/refactor-v2/handoffs/20260714T170700Z-S7p-stream-binding-raw-lifecycle-fixture-alignment-stale-recovery-root.md`。
- `runtime.error` fixture 改为 canonical failed Turn；message delta 使用 in-progress AgentMessage
  Item；WebSearch/WebFetch 使用 canonical Tool Item；reasoning 使用稳定 ordinal 的 canonical Item；
  completed/canceled 使用 canonical terminal Turn。
- tail recovery 仍刻意不提供 terminal，但正文首包本身是合法 canonical AgentMessage Item。

## 分类

- `current`：production projector、canonical Thread/Turn/Item lifecycle、GUI stream listener。
- `test-only`：两份 stream binding fixture。
- `compat / deprecated`：本切片未保留。
- `dead / forbidden-to-restore`：current 正向测试通过 raw lifecycle test projector、raw
  `runtime.error`、raw tool fan-out、无 canonical entity 的 message/turn lifecycle。

## 验证

- 两份 focused stream binding 测试：`16/16` passed。
- 与 S7r/S7v 合并 focused：`4 files / 110 tests` passed。
- exact ESLint、Prettier、`git diff --check`：passed。
- smart Vitest resumable state：`passed`；该状态由并行续跑共同推进，focused 数字仍以上述独立命令为准。

本切片未修改 production、协议、Electron 或 Rust，因此不声明新的 GUI Gate B。
