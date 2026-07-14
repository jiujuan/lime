# S4r8b 历史进入与 canonical recovery evidence

日期：2026-07-14

## 结论

侧栏会话无法进入、历史对话无法恢复和 `turn/start` 偶发 canonical identity 缺失已收口。
current 链路仍是唯一事实源：

```text
Electron Desktop Host
  -> app_server_handle_json_lines
  -> App Server JSON-RPC
  -> EventLog / ProjectionRepair
  -> canonical Thread / Turn / Item
  -> agentSession/read
  -> GUI
```

## 根因与修复

- Electron Host 过去把任意首条通知当成当前 `turn/start` admission，并只读一次 canonical
  Turn。旧 turn 通知或短暂 read-model 延迟会错误返回 identity 缺失。Host 现在只接受与请求
  `sessionId/turnId` 匹配的通知，并对 canonical read 做 2 秒有界重试。
- JSONL repair 过去只重建 `projected_*` session read model；`agentSession/list` 能看到条目，
  `agentSession/read` 随后却因 canonical Thread 缺失而失败。`ProjectionRepair` 现在用同一批
  EventLog 事件建立缺失的 canonical Thread，并物化 Turn / Item 后才返回。
- history fixtures 已改为 Codex typed Item 口径：UserMessage、Reasoning、AgentMessage 使用稳定
  canonical identity；assistant 由 `message.delta -> message.completed` 进入 completed；replayed
  reasoning / MCP 使用 typed `ThreadItem`，不再依赖旧 payload 摘要猜测。

没有新增 projected fallback、renderer 本地历史拼装、第二 read model 或 turn-terminal Item
状态推断。修复前已经落盘且缺少 `message.completed` 的旧 EventLog 不被静默改写；当前 Runtime
Backend 已按 Codex 在 `turn.completed` 前发送正式 `message.completed`。

## Gate B

- `smoke:agent-session-history-electron-fixture` 通过：真实 Electron/preload/IPC、App Server
  JSON-RPC、归档/恢复重启、侧栏点击、分页、thread resume、reasoning/MCP visual replay 全闭环。
- `smoke:claw-chat-current-fixture` 通过：用户消息、assistant 输出、read model completed、输入框恢复。
- `smoke:claw-chat-current-fixture -- --scenario cancel-then-continue` 通过：停止后同一 session 再次
  提交并完成。
- 真实用户数据 CDP `9223`：`window.__LIME_ELECTRON__=true`，preload invoke 可用；侧栏“你好”
  按钮可点击，进入后恢复 2 个 turn，composer 可用；IPC trace 为 `electron-ipc`。
- 真实 Provider 当前返回 `404 Application not found`，页面能终态失败并恢复输入；该配置错误不再
  表现为列表不可点、历史不可进入或 turn 永久 active。

## 验证

- App Server projection repair：7/7。
- Electron Host + history guard：32/32。
- `npm run typecheck:electron`：通过。
- `npm run verify:gui-smoke -- --reuse-running`：通过。
- `npm run smoke:agent-runtime-current-fixture` 已越过原 plan revision identity blocker，并通过首页、
  Coding、图片、cancel-then-continue、approval、rich draft、queue 与 Plan history hydrate；最终仅在
  Skills Runtime fixture 因 Provider 鉴权失败停止。
- `npm run test:contracts` 的协议/client/command/harness/modality/scripts/Forge/cleanup 子门禁通过；
  最终仅因并行 `internal/exec-plans/release-v1.102.0-plan.md` 违反 docs ignore 边界退出 1。

## 治理分类

- `current`：Electron Host canonical admission；EventLog -> canonical Thread repair；typed Message /
  Reasoning / MCP Item；App Server current read model；GUI history hydrate。
- `compat`：无新增。
- `deprecated`：`agentSession/read` presentation adapter 仍由后续 consumer cutover 负责删除。
- `dead / forbidden-to-restore`：projected-only history truth、renderer history synthesis、生产 mock
  fallback、以 `turn.completed` 猜测 Item terminal。
