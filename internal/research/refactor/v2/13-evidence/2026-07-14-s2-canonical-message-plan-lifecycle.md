# S2 canonical Message / Plan lifecycle evidence

日期：2026-07-14

## 结论

canonical user/agent Message 与 proposed Plan 生命周期已按 Codex 收口。Plan 不再是附着在普通
消息或 `update_plan` Tool 上的旁路状态，而是可持久化、可通知、可跨重启恢复的正式
`ThreadItemPayload::Plan`。聚合 fixture 原有的 Plan revision identity blocker 已解除。

current 链路是：

```text
Runtime event
  -> canonical Message / Plan Item lifecycle
  -> ProjectionStore / ThreadStore
  -> read model + canonical notification
  -> Renderer typed reader
  -> GUI Plan rail / implementation decision
```

## Codex 对齐

- `codex-rs/core/src/session/mod.rs`：user input 发送 `ItemStarted` 后立即发送同一 Item 的
  `ItemCompleted`；所有 terminal Item 都携带 completed timestamp。
- `codex-rs/core/src/session/turn.rs`：Plan 使用稳定 Item ID，流式 `PlanDelta` 与 completed Plan
  snapshot 共用 identity；completed snapshot 是权威内容，不要求等于 delta 拼接。
- 同文件 `leading_whitespace_by_item`：Plan 前纯空白在第一个真实 assistant 文本前缓存；若整轮
  只有 Plan，则不启动 AgentMessage。
- `app-server-protocol/src/protocol/v2/item.rs`：Plan、ItemStarted、ItemCompleted 与 PlanDelta 是
  typed contract；历史由 durable completed Item 恢复。

## 实现事实

- `message.created` 直接物化为 completed UserMessage，并记录 `completed_at_ms`。
- assistant `message.delta` 启动稳定的 AgentMessage；`message.completed` 完成同一 Item，取消或
  中断映射为 `ItemStatus::Interrupted`。
- Plan payload 保存 `text`、`revision_id`、`source`、typed steps/status、explanation、tool/source
  identity；`ItemKind::Plan` 已进入 protocol/schema/generated client。
- Plan Item ID 固定为 `plan_{turnId}_{revisionId}`。`plan.delta` 创建/更新 running Item；
  `plan.final` 以 completed authoritative snapshot 更新同一 Item，保留首 delta ordinal。
- canonical store restart、AgentSession presentation read model 与 Renderer canonical reader 都保留
  revision/source/steps/status。
- proposed Plan parser 缓存首个真实正文前的空白。Plan-only 输出即使包含前后换行，也不发
  `message.delta` 或 `message.completed`；后续出现正文时，缓存空白与正文一起发出。

## 验证

- `cargo test -p app-server proposed_plan_parser --lib`：8/8。
- `cargo test -p app-server thread_item_projection --lib`：37/37。
- canonical store restart revision identity、user/agent completed lifecycle、message terminal ordering、
  canceled agent Interrupted 与 typed `message.completed -> item/completed` 定向回归：全部通过。
- `cargo test -p agent-protocol`：27/27（最终共享树包含并行 S6k 新增的 Codex child-state contract）。
- Renderer canonical reader Vitest：15/15；fixture/聚合脚本 Vitest：69/69。
- `npm run typecheck`：通过。
- `npm run check:protocol-types`：694 types，0 drift。
- App Server client contract：290 checks，通过。
- `npm run verify:gui-smoke`：通过；Renderer production build、Electron main/preload、App Server
  1.102.0 sidecar、初始化、Claw workbench shell 与 memory settings 均就绪。首次尝试撞到并行 S6k
  尚未完成的 protocol 根导出中间态；S6k 补齐后同一命令复跑通过，未修改 S2 实现绕过失败。
- `npm run test:contracts`：协议、client、command、harness、modality、scripts、Forge 与 cleanup
  子门禁均通过；最终 `docs:boundary` 因既有已跟踪
  `internal/exec-plans/release-v1.102.0-plan.md` 应被 ignore 而失败。该文件不在 S2 写集，本轮未改动。

## Gate B

证据：
`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-plan-history-hydrate-regression-summary.json`

- `ok=true`，`proofLevel="Gate B controlled fixture"`，使用真实 Electron/preload/IPC、
  `app_server_handle_json_lines`、App Server JSON-RPC、runtime/read model 与 GUI；backend 为受控
  external fixture，不是 production mock fallback，也不证明 live Provider。
- Plan mode/prompt/collaboration mode 已进入 backend；GUI Plan rail、steps 与 implementation decision
  均可见，且未自动执行计划。
- reload 后 read model 与 GUI 均保留 `revisionId=proposed_plan:fixture-1`、
  `source=proposed_plan` 和全部三条 Plan step；实施确认绑定同一 turn/revision。
- completed Plan ThreadItem 可读，legacy `update_plan` Tool Item 数量为 0。
- invoke error 与 actionable console error 为 0。

聚合 `smoke:agent-runtime-current-fixture` 已越过原 Plan blocker，随后在独立 Skills Runtime 场景
因 Provider 鉴权失败停止。该外部配置失败不属于 Message/Plan lifecycle 回归，不用于扩大或缩小
本切片的 Gate B claim。

## 治理分类

- `current`：typed UserMessage、AgentMessage、Plan Item lifecycle；ProjectionStore/ThreadStore；
  canonical notification/read model；Renderer typed reader 与 GUI revision binding。
- `compat`：无新增。
- `deprecated`：`agentSession/read` presentation adapter 仍等待 S5/S6 consumer cutover 后删除。
- `dead / forbidden-to-restore`：Plan-as-`update_plan` truth、Renderer 本地 revision/lifecycle 合成、
  Plan-only 空白 AgentMessage、第二 read model 或 production mock fallback。

下一刀：继续 S6k canonical child roster 主链；Message/Plan lifecycle 不再是其聚合 fixture blocker。
