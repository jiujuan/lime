# S4aa Agent terminal mailbox activity evidence

日期：2026-07-14

## 结论

S4aa 将 Codex Multi-Agent V2 的 child completion activity 接入 Lime current GUI runtime 主链，但没有复制 TUI：

```text
canonical child turn.completed / turn.failed
  -> canonical child Turn / Item durable
  -> AgentGraphStore direct Open parent
  -> deterministic QueueOnly Result mailbox
  -> parent canonical assistant Item + mailbox metadata
  -> wait_agent structured activity
```

`turn.canceled` / Interrupted 不生成 `FINAL_ANSWER`。Result 不启动 parent turn，不进入第二队列，也不依赖 process-global agent registry、legacy session metadata 或 path fallback。

## Codex 适配

- Codex completion fragment 的 role 是 assistant；Lime Result 因此物化为 completed `AgentMessage`，不再降为 user message。
- canonical Item metadata 保留 `messageId`、root/sender/recipient thread、kind、source turn、result status 和 delivery mode，供 GUI/read model 后续专用 activity projection 使用。
- completed child 使用该 Turn 最后 assistant text 并完整传递长 Unicode 内容；仅 failed error envelope 保留有界错误文本。
- Lime 没有复制 Codex TUI/InputQueue 的同-step activity 注入。`wait_agent` 返回结构化 `activity`，GUI 继续只消费 canonical Thread/Turn/Item。

## Durable correctness

- terminal EventLog/canonical persist 在 Result append 之前；canonical apply 前失败和 canonical 成功后 Result append 失败都能由 direct parent 的 wait/下一真实 turn 恢复。
- recovery 只枚举 direct Open children，不 hydrate child、不递归 grandchild；repairable 和 empty-prefix crash tail 均 fail-safe。
- EventLog clone 使用 session-scoped I/O lock，scan/repair 不会截断同一 session 正在 append 的 record，其他 session append 不被该锁阻塞。
- wait 对调用前已排队和等待中新增的 steer 都优先于 mailbox；轮询使用有界指数退避，deadline 返回前强制 final recovery/recheck。
- mailbox pending -> delivered 使用 SQLite immediate transaction CAS。RuntimeCore 在 state mutex 内按 mailbox message ID 去重 event，两个并发 wait 只能产生一次 activity、一次内存 event 和一次 EventLog record。
- canonical Item 可读后才 ack；重复 terminal append、restart recovery 和 delivered replay 都保持幂等。

## 审查修复

只读审查在收尾前发现并关闭以下问题：

- Result 被错误投影成 user message且丢结构化 metadata。
- prequeued steer lost wakeup，以及 steer/mailbox 同时存在时优先级错误。
- active wait 只在进入时 repair，terminal effect 晚到会误超时。
- timeout deadline 前缺 final recovery。
- recovery 与 EventLog append 并发时可能误截断 in-flight tail。
- 25ms 全量 recovery 扫描和全局 I/O lock 的放大效应。
- concurrent wait 重复返回 activity或重复写 EventLog。
- completed final answer 静默截断到 4,000 chars。

最终只读复核没有剩余 correctness blocker。

## 验证

- `thread-store agent_graph`：1/1。
- `thread-store agent_mailbox`：1/1。
- App Server `canonical_thread_spawn`：8/8。
- App Server `agent_mailbox_store`：7/7。
- App Server `agent_mailbox_delivery`：6/6。
- App Server `agent_terminal_activity`：13/13。
- App Server `event_log`：24/24。
- App Server `agent_control`：12/12。
- S4aa Rust `rustfmt --check`：通过。
- S4aa tracked write set `git diff --check`：通过。
- 最终 `cargo check --manifest-path lime-rs/Cargo.toml -p app-server --lib`：协调进程复用 `/tmp/lime-s4z-app-server-check` 在最终源码哈希上通过。原 owner 的 `/tmp/lime-s4x-final-verify` 首次尝试曾因 ENOSPC 失败，但未删除共享缓存，且该环境阻塞已由后续独立 target 复验关闭。
- `npm run verify:gui-smoke`：重试通过；Electron renderer/host、App Server sidecar 初始化、Claw shell 与 memory settings 均 ready。首跑曾在数据卷仅余约 701 MiB 时触发 ENOSPC；未删除共享缓存，失败进程释放临时空间后原命令通过。
- `npm run smoke:agent-runtime-current-fixture`：Rust sidecar 与多条真实 Electron Claw/Coding/Approval/Inputbar 场景通过，聚合命令最终被独立 Plan history fixture 的 `planDecisionRevisionBound=false` 阻断，因此不记为全量通过。

上述证据证明 focused Rust contract 与通用 GUI 主壳健康；它们仍不能替代 Multi-Agent 专用 JSON-RPC/Renderer Gate B。

## 治理分类

- `current`：AgentGraph direct parent、durable identity/mailbox、terminal Result、assistant canonical Item、steer-first wait、EventLog recovery。
- `compat`：无新增。
- `deprecated`：无新增。
- `dead`：本 slice 不新增或恢复旧 Team/collab_agent、旧 alias、process-local registry、第二队列或 TUI surface。

## 剩余范围

- JSON-RPC、Renderer、专用 SubAgent activity GUI 和真实 Electron Gate B 不属于 S4aa。
- wait recovery 仍会按退避周期扫描 direct child EventLog；长历史、多 child 的性能基准属于后续优化。
- SQLite CAS 已覆盖当前单 App Server RuntimeCore 并发语义；没有跨进程共享同一 projection DB 的压力证据。
- Result metadata 已可供 GUI 专用渲染，但当前仍可能显示原始 `FINAL_ANSWER` envelope，必须由后续 GUI slice 收口，生产不能用 Team sidecar 或 mock fallback 遮蔽。
