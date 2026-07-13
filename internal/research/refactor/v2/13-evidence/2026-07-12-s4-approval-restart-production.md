# S4 Approval Restart Production Evidence

日期：2026-07-12

## 结论

Approval/action-required restart production 链已收敛到：

```text
RuntimeCore hydrate StoredSession
  -> current action.required event identity
  -> typed PendingActionDescriptor
  -> RuntimeBackend restored pending state
  -> structured action response error / canceled terminal
```

RuntimeCore 在 decision、session cache、runtime preflight 和 backend dispatch 前校验 canonical action type 以及完整 session/thread/turn scope。descriptor 直接从 `StoredSession.events` 构造，不再经过 `AgentSessionReadResponse` presentation round-trip。进程重启后无法恢复原 oneshot continuation 时稳定返回 `action_not_resumable`，不写 `action.resolved`；ask-user/elicitation 的否定响应会消费 waiter 并写 `action.canceled`。

## 定向验证

- `cargo check -p app-server --lib`：通过。
- `cargo test -p agent-runtime action_required --lib`：9/9 通过。
- `cargo test -p lime-agent current_provider_turn --lib`：8/8 通过。
- `cargo test -p lime-agent request_user_input_bridge --lib`：2/2 通过。
- StoredSession waiting/session-turn identity：1/1 通过。
- runtime preflight wrong type / missing scope / wrong scope + valid response：1/1 通过。
- store handle reopen + direct `respond_action` lazy hydrate + RuntimeBackend：1/1 通过。
- restored continuation、重复 terminal reason：1/1 通过。
- denied ask-user emits canceled without resolved：1/1 通过。
- missing descriptor fail-closed：1/1 通过。
- projection waitingAction lowering：1/1 通过。
- workflow resume audit canonical pending fixture：1/1 通过。
- processor `agentSession/action/respond` JSON-RPC `{code, requestId}`：1/1 通过。
- `npm run test:contracts`：通过，包含 286 app-server-client checks、command/harness/contracts 和 scripts/docs governance。
- `git diff --check`：通过。

App Server test link 使用独立 target，并通过 `LIBRARY_PATH` / `DYLD_LIBRARY_PATH` 指向该 target 已准备的 Sherpa 动态库；未复制、删除或修改系统库。

## Gate B

`npm run smoke:agent-runtime-current-fixture` 已通过 history/cache、stream completion、fixture guards、Claw home hotpath、Claw greeting hotpath 与 Coding Workbench Electron 恢复闭环。聚合 smoke 最终在独立的 image-command 场景失败：GUI 停在“正在生成图片”，没有 image task card/terminal；该路径属于 active `S4h-delete-live-tool-args`/image consumer 写集，不经过本轮 approval restart。

单独 `approval-request-resume` Electron 场景在 action.required 前显示 Provider 鉴权失败。summary 明确 `backendMode=external`，但没有 backend turn trace/pending Item，因此不能作为 approval 行为失败证据，也不能标记 approval Gate B 通过。

## 治理分类

- `current`：StoredSession event identity、serializable pending descriptor、RuntimeCore type/scope gate、RuntimeBackend restore、structured JSON-RPC error、action canceled terminal。
- `compat`：无新增。
- `deprecated`：AgentSession presentation/read model 仍服务其它迁移期 consumer，但已退出 approval restart descriptor owner。
- `dead`：本 slice 未执行物理删除；S4h raw tool fixture 由其 active owner处理。

## 剩余阻塞

1. S4h active fixture `ApprovalCancelRespondTerminalBackend` 仍发 raw `tool.started`，阻断聚合 `action_response` filter；已写 handoff。
2. Approval Electron fixture 的 external backend 未产生 action.required，需 fixture owner修复后重跑 `approval-request-resume/decline/cancel`。

