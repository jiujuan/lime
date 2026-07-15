# S2o Runtime Message / Reasoning Item Lifecycle Evidence

## 结论

Runtime 的 UserMessage、AgentMessage 与 Reasoning 已按 Codex 语义进入正式 Item lifecycle：
`item.started` 固定 identity 与 ordinal，delta 只更新同一 Item，`item.completed` 原位完成。
`turn.completed` 不再创建或补全 Message / Reasoning Item。

原故障来自 completion-time materialization：Reasoning 虽先开始，但晚完成时会被创建到最终回答之后。
现在即使 AgentMessage 先 completed、Reasoning 后 completed，展示位置仍由 started ordinal 决定。

## 实现边界

- provider / agent runtime 转发 source Item identity，并为无 identity 的 raw provider family 使用稳定的
  turn fallback identity。
- App Server event mapper 与 event store 统一生成或保留 canonical lifecycle，不重复包装 external current
  producer 已提供的 lifecycle。
- mailbox recovery 只校验 raw mailbox carrier，忽略带 mailbox metadata 的 managed lifecycle envelope。
- terminal Item 拒绝同 identity 的 late delta；新的 distinct identity 仍可开始新的 Item。
- 未修改 Electron、protocol/schema、generated client 或 Renderer；历史同 session hydrate 由独立 S2p 收口。

## Codex 对齐

事实源对照 `/Users/coso/Documents/dev/rust/codex`：Item 在 started 时进入 Thread，后续 delta 与
completed 更新同一 identity。Lime 不再从 completion sequence 或 Turn terminal 猜测 Item 位置和终态。

## 验证

```text
thread_item_projection: 37/37 passed
turn_lifecycle: 24/24 passed
App Server full suite: 1105/1105 passed
npm run test:rust:related -- <S2o Rust paths>: 1105/1105 passed
```

- exact changed-Rust `rustfmt --check` passed；`git diff --check` passed。
- `npm run smoke:claw-chat-current-fixture -- --scenario reasoning-first-visible` passed，session
  `claw-chat-current-1784064402312-77470`，proof level 为 `Gate B controlled fixture`。
- Gate B 断言包含 `guiReasoningFirstVisibleBeforeAnswer=true`、
  `guiReasoningFirstVisibleCompleted=true`、`readModelReasoningFirstVisibleItemObserved=true`。
- 真实用户 Electron 通过 CDP 读取旧 ORDER 会话：`electron=true`、preload invoke 可用、
  `agentSession/read` 为 `electron-ipc/success`；第二轮 reasoning DOM top `378`，answer top `508`，
  `orderCorrect=true`。
- 真实窗口截图：`.lime/qc/gui-evidence/s2p-matched-session-history-hydration/real-electron-order.png`。
- `npm run smoke:agent-session-history-electron-fixture` passed；覆盖持久化、归档、恢复、重启
  readback、分页同构和 history replay visual。
- `npm run verify:gui-smoke -- --reuse-running` passed；Renderer、Electron Host、App Server sidecar、
  Claw shell 与 memory settings ready。

## Concern

- `npm run test:contracts` 的 App Server client、command 和 harness contracts 均通过；随后在独立
  `governance:modality-contracts` 失败，原因是 active S5 task-index 文件
  `HarnessTaskIndexSection.tsx` 缺少既有 shared taskIndex filter surface。该文件不属于 S2o 写集。
- history fixture 首次在第二次归档菜单定位处抖动失败，原命令立即复跑完整通过；真实产品窗口中的
  session action button 存在且 enabled。记录为 fixture 时序噪音，不扩大生产补丁。

## 治理分类

- `current`：stable Message / Reasoning identity + started/delta/completed + canonical ordinal。
- `compat`：无新增。
- `deprecated`：raw start/end/completion 仅作为 normalization 输入，不再拥有 lifecycle。
- `dead / forbidden-to-restore`：completion 时创建新的时间线位置、从 `turn.completed` 猜 Item terminal。

## 路线图关系

S2o 关闭 Runtime Message / Reasoning lifecycle 缺口，使 live streaming 与 history cold read 共享同一
Thread/Turn/Item 排序事实源。下一刀回到 refactor v2 coordinator 继续处理独立的 active slices；不得恢复
completion-time Item owner。
