# S4am spawn_agent V2 contract gap

日期：2026-07-15

## 结论

Lime 当前 `spawn_agent` 只实现 `task_name + message`。本次审计开始时，共享 projection package 把
`agent_type`、`fork_turns`、`model`、`reasoning_effort`、`service_tier` 标成可选输入，
形成了“TS 声明可用、Rust 生产路径拒绝”的假契约。

本切片不在 `tool-runtime` 单边追加并丢弃字段，也不借旧 Team metadata、session
metadata 或第二 route map 承接。完整迁移必须由 tool schema、App Server AgentControl、
canonical history fork 和 effective child route 同一垂直切片闭环；在闭环前，这五个字段
不能计为 `current`。

并行状态更新：审计结论回传后，另一个施工进程已把 projection `optionalInputFields` 清空，
并把上述字段改为 `unsupported_field` fail closed；这一步恢复了当前契约真相，但不等于 Codex
optional capability 已实现。本 evidence 不认领、未夹写该 sibling patch。

## Codex 事实

参考仓库：`/Users/coso/Documents/dev/rust/codex`。

- `codex-rs/core/src/tools/handlers/multi_agents_spec.rs:595` 定义 V2 schema：required
  `task_name/message`，optional `agent_type/fork_turns/model/reasoning_effort/service_tier`；
  schema 不再广告 `fork_context`。
- Codex 会按 `hide_spawn_agent_metadata` 动态隐藏 `agent_type/model/reasoning_effort/
  service_tier`，但 `fork_turns` 始终可见；隐藏时输出只要求 canonical `task_name`，非隐藏时
  才要求 `task_name/nickname`。Lime 不应把 metadata options 和 nickname 视为无条件契约。
- `codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs:178` 使用
  `deny_unknown_fields` 严格解析；`fork_context` 虽不在 schema，仍作为明确迁移错误入口，
  提示改用 `fork_turns`。
- 同文件 `:191` 固定 `fork_turns`：缺省或空白为 `all`，`none` 不 fork，`all` fork
  完整 history，正整数字符串 fork 最近 N 个 Turn；`0` 和非法字符串 fail closed。
- 同文件 `:67` 禁止 full-history fork 同时覆盖 `agent_type/model/reasoning_effort`；非 full
  fork 才应用 role/model/reasoning override。`service_tier` 走独立校验与继承。
- 同文件 `:95` 建立 canonical spawn source/path，`:122` 传递 parent call、fork mode、
  parent thread 和 environment selections，`:142` 生成 Started activity。
- `codex-rs/core/src/agent/control.rs:60` 以 `SpawnAgentForkMode::{FullHistory,
  LastNTurns}` 和 `SpawnAgentOptions` 表达控制面，不把 fork 退化成布尔字段。
- `codex-rs/core/src/agent/control/spawn.rs:301` 在 fork/new-thread 两条路径显式分流；
  `:493` 截断最近 N 个 Turn，`:529` 只为 full history 保留 reference context item，并过滤
  tool call、reasoning、inter-agent communication 等不可直接复制的 rollout item。

这些是一个整体语义，不能只复制 JSON schema。

## Lime 当前证据

- `lime-rs/crates/tool-runtime/src/agent_control.rs:38` 的生产 tool definition 只广告
  `task_name/message`。
- 同文件 `:125` 的 `AgentControlCommand::SpawnAgent` 只携带这两个字段；`:316` 的 parser
  只能构造该二字段命令；`:400` 使用 `deny_unknown_fields`，因此五个 Codex optional 字段
  当前都会被生产路径拒绝。
- `lime-rs/crates/app-server/src/runtime/agent_control_gateway.rs:98` 只解构
  `task_name/message`；`:248` 的 spawn executor 也没有 fork、role 或 route override 输入。
- `lime-rs/crates/app-server/src/runtime/agent_control.rs:13` 的
  `AgentControlSpawnRequest` 只有 parent/child session/thread identity；`:53` 直接创建空 child
  session/thread，没有 canonical history fork 输入。
- child 的 `events/turns` 从空集合开始，provider history 也只从 child 自身 events 投影，故
  Lime 当前真实默认语义恒为 `fork_turns=none`，与 Codex 缺省 `all` 相反。
- App Server 当前返回 identity 的 task-name 末段，而 Codex V2 返回 canonical full path；这不是
  GUI 显示差异，而是 tool result contract 偏差。
- `tool-runtime::turn_tool_surface` 曾保留一套只在模块内测试调用的 subagent whitelist helper；
  它不在生产 exposure 链。S4an 已物理删除该 dead API 和回流入口。current
  `turn_execution -> per-turn gateway -> provider step snapshot` 对 child session 同样成立，现有
  restart 测试也从 child gateway 创建 grandchild，因此递归 AgentControl 不是本轮 blocker。
- 审计开始时，`packages/agent-runtime-projection/src/multiAgentToolSchema.ts:72` 把五字段列为
  optional，package test 还把 `fork_turns: "all"` 断言为合法；并行 sibling patch 已把它们改为
  unsupported。该 validator/projection builder 仍没有产品消费者；同包 taxonomy 只借
  `getCodexMultiAgentToolSchemaContract` 判断六个工具名。

可复用 owner 不能按“出现了同名字段”判断：

| 能力 | Lime current owner | 可复用结论 |
| --- | --- | --- |
| `model` / `reasoning_effort` | RuntimeBackend effective model selection + `StoredSession.turn_runtime_options` | 可复用 S4ag 的唯一 effective route snapshot，但 override 必须重新走同一 selection/validation owner。 |
| `fork_turns` | canonical ThreadStore history/read model | 只能复用 history 数据；没有 fork filter、Turn truncate、child 原子导入和补偿 owner。 |
| `agent_type` | `thread-store::AgentIdentity.role` | 只有结果存储字段，没有 Codex role registry/config merge/apply owner，不能直接复用为执行语义。 |
| `service_tier` | model catalog/default 与 Codex import metadata | 没有 production `RuntimeRequest`/`RuntimeOptions` 执行字段，不能宣称已支持。 |

因此当前真实状态是：

- `current`：Rust `task_name + message` strict tool contract、durable AgentGraph/mailbox、
  effective parent route inheritance、canonical child Thread/Turn/Item 和 GUI projection。
- `compat`：无，也不应新增。
- `deprecated`：无。
- `dead / remove-or-forbid`：无消费者的 TS schema projection/validator；把不可执行五字段当作
  current optional input 的正向 fixture 已由 sibling patch 清理，待其 owner 完成验证。
- `pending current capability`：Codex `fork_turns`、role/model/reasoning/service tier 完整语义。

## 为什么本切片不做半实现

若只扩 `tool-runtime`，`AgentControlCommand` 会把新字段推到 App Server，但现有 gateway 没有
任何 owner 能执行它们。静默忽略会让模型误以为已应用；硬编码到 identity/session metadata
则会恢复已删除的 Team/metadata 旁路。

`fork_turns` 还要求：

1. 从 parent canonical ThreadStore history 按 Turn 边界选择 full/last-N。
2. 过滤不可复制的 Tool/Reasoning/InterAgent lifecycle item，并定义 compaction/reference context
   语义。
3. 在 child 初始 message 进入前原子写入 forked history，失败时补偿 child session、thread、
   graph edge 和 identity，禁止出现半个 child。
4. 把 parent call/thread/environment selection 作为 canonical spawn source，而不是 session metadata。

role/model/reasoning 还要求把请求与 S4ag 已有 effective child route 合并，并在 full history
override 冲突时 fail closed；service tier 需要先在 production runtime request/provider lowering
建立单一执行 owner。这些都不属于 `tool-runtime` parser 可独立完成的职责。

## 下一刀：S4am vertical slice

建议由根协调进程拆成三个互斥写集，按依赖顺序合并；每个施工进程只写自己的 owner：

1. **A - contract owner**：`tool-runtime/src/agent_control.rs` 与其内联 tests。复制 Codex
   `SpawnAgentForkMode`/strict parser/schema，新增 `SpawnAgentOptions`，明确拒绝
   `fork_context`、非法 `fork_turns` 和 full-history override 冲突。A 不解释 history。
2. **B - runtime owner**：App Server AgentControl gateway/core、canonical ThreadStore history
   fork 与 focused Rust tests。消费 A 的 typed options，完成 history filter/truncate、原子 child
   创建/补偿、canonical full-path result、role resolution 和 effective route merge。B 不新增
   metadata、第二 route map 或 compat wrapper。
3. **C - projection cleanup**：`agent-runtime-projection` schema/taxonomy/tests/docs。并行 patch
   已停止宣传不可执行 optional fields；仍应删除无产品消费者的 schema projection/validator
   正向 surface。B 完成后只从 production contract/evidence 生成或核对 schema，禁止继续手写
   第二份事实源。

role registry 和 service tier 当前没有可复用执行 owner，应拆成后续独立跨 crate slice；不要让
A/B 为凑齐参数表临时创建 metadata owner。递归 child AgentControl 已由 current per-turn gateway
和 provider step snapshot 承接；后续只需按 Codex 补齐 root-tree 并发/residency policy，不恢复
V1 depth compat。

共享热区 `internal/exec-plans/refactor-v2-implementation.md`、verification ledger 与架构确认只由
根协调进程更新，A/B/C 不夹写。

## 退出条件与验证

- `fork_turns` 缺省、空白、`none`、`all`、正整数、`0`、非法字符串全部有 strict parser test。
- full history + role/model/reasoning override fail closed；非 full override 与 service tier 有
  effective child route test。
- full/last-N/no-fork 的 child canonical history、compaction/reference context、environment
  inheritance 和 initial message 顺序有 ThreadStore/App Server tests。
- 任一步失败后不存在 orphan session/thread/open edge/identity/mailbox item。
- production tool schema、Rust command、App Server consumer 和 projection package 不再漂移；
  `fork_context` 只保留负向 guard。
- tool output 返回 canonical full path；child 继续拥有 V2 AgentControl tools，递归 spawn 保持
  root-tree isolation；并发/residency policy 另有明确回归。
- 最低验证：tool-runtime focused tests、App Server AgentControl/history focused tests、
  `cargo check -p app-server --lib`、projection package build/test、`npm run test:contracts`、
  `npm run smoke:agent-runtime-current-fixture`；最终补真实 Electron visible-DOM Gate B。

## 本轮写集

本轮只新增并更新本 evidence。tool-runtime、App Server、Renderer、projection sibling patch、
共享实施计划和已有脏 ledger 均未由本进程修改；不存在 compat、新 runtime owner 或生产 mock
fallback。

## 2026-07-15 sibling implementation follow-up

协调者在不触碰本审计写集的前提下完成了 projection contract cleanup：

- `packages/agent-runtime-projection/src/multiAgentToolSchema.ts` 的 `spawn_agent`
  optional fields 已清空；`agent_type`、`fork_turns`、`model`、`reasoning_effort`、
  `service_tier` 不再被 Renderer 宣传为 current capability。
- TS validator 现在与 Rust `additionalProperties: false` 对齐，所有未列入 contract 的
  输入字段返回 `unsupported_field`；`fork_context/items/target` 仍按显式 forbidden guard
  处理。
- 当前结果契约改为真实 Rust gateway 必返的 `task_name/message_id`；`nickname` 仍是
  可选 identity metadata，不再作为必返字段。
- package 全量测试 `294/294` 通过。Rust tool-runtime/App Server 没有在本 follow-up 中
  扩展字段，因此 Codex fork/history/role/override/service-tier 的缺口仍保持 pending，
  不得把本次 schema cleanup 计为能力实现。
- S4an 后续证明旧 subagent whitelist helper 无生产 caller并已删除；App Server current turn
  gateway 对 root/child 一视同仁，provider step snapshot 只按 gateway presence 暴露六工具。
- S4ao 将 spawn 结果 `task_name` 对齐为 canonical full path，并删除恒空 `nickname`；
  `message_id` 保留为 Lime durable mailbox current fact。

## 2026-07-15 canonical fork implementation follow-up

协调者随后在 current owner 完成了 `fork_turns` 垂直切片；本节取代本文前面的 pending 口径：

- `tool-runtime::agent_control` 现在唯一拥有 strict string parser 与 typed
  `SpawnAgentForkMode::{None, FullHistory, LastNTurns(usize)}`。缺省、空白与 `all` 使用完整历史，
  `none` 不复制，正整数字符串选择最近 N 个 Turn；`0`、非法字符串、`fork_context` 与未知字段
  fail closed。
- App Server 在 child identity、初始 mailbox task 和执行调度之前，把选择后的 parent Turn 写入
  child 自身 `StoredSession.events/turns/turn_inputs`、EventLog、ProjectionStore 与 ThreadStore。
  forked Turn 使用 child thread + source turn digest 生成稳定新 identity；不复用 parent Item ID。
- 复制内容只包含 canonical parent 用户输入和已完成 Turn 的 assistant message events；reasoning、
  tool lifecycle、inter-agent communication 与 raw Team 旁路被过滤。provider transcript 从同一 child
  EventLog 生成，没有第二 history store 或 metadata owner。
- history/graph/identity/mailbox 任一阶段失败时删除不可用 child；cold restart 只 hydrate child，
  不要求加载 parent。child 后续 turn 继续通过 current per-turn gateway 获得六个 AgentControl 工具。
- `agent_type/model/reasoning_effort/service_tier` 仍没有完整 current owner，继续以
  `unsupported_field` fail closed；本次没有用 metadata、compat 或静默忽略伪造支持。

已通过验证：

- `cargo test -p tool-runtime agent_control`：`6/6`。
- `CARGO_TARGET_DIR=/tmp/lime-gate-fork-turns-target cargo test --manifest-path lime-rs/Cargo.toml -p app-server agent_control`：`17/17`。
- `npm --prefix packages/agent-runtime-projection test`：`294/294`。

项目级 `test:contracts`、current fixture、新候选 Wave 1 和真实 Electron Gate B 仍由
`project-gate-a-b-acceptance-plan.md` 继续执行；本 follow-up 只关闭 P0 parity gap，不代表 Gate A/B
已经通过。

## 2026-07-15 P1 review correction

后续只读复核证明上一节的 `17/17` 是假绿，原实现不能按完整 fork 能力签字：

- 原实现只复制 raw `message.delta*`，没有复制 `message.completed`，会留下
  `Completed Turn + InProgress AgentMessage`。
- raw event 过滤无法区分 commentary 与 final answer，也会继承 parent trace/request/run 字段。
- child 只写 graph parent，没有持久化 canonical `forked_from_id`。
- graph/identity/mailbox 返回错误后的补偿没有清 EventLog/workflow audit/sidecar，稳定 child ID 重试
  会受到旧 sequence 污染。
- Renderer 用正则接受任意长度数字，Rust 用 `usize::parse`，在 `null`、`01`、`+1`、溢出数字上
  行为不一致。

本轮已在 current owner 修正这些问题：

- App Server 先读 canonical parent Thread/Turn/Item。Turn 只由 completed canonical UserMessage
  进入候选，完整 typed `AgentInput` 从同一 EventLog hydrate；assistant 只选已完成 Turn 中
  `ItemStatus::Completed + phase=final_answer` 的 AgentMessage。
- child 不复制 raw payload，而是从 typed text/content parts 重建成对的
  `message.delta + message.completed`；commentary、reasoning、tool、inter-agent 与 parent
  `trace_id/request_id` 均不进入 child EventLog。
- child Turn/Item 使用 child thread + source identity 派生的稳定新 ID。legacy ProjectionStore 的 Turn ID
  仍是全局键，直接复用 source Turn ID 会与 parent 冲突；因此 source identity 明确写入
  `forkedFromThreadId/forkedFromTurnId/forkedFromItemId` EventLog payload 和 canonical Item metadata。
- `ThreadMetadataPatch` 增加 typed `forked_from_id`。`all/last-N` 同时持久化
  `parent_thread_id + forked_from_id`，`none` 只保留 parent graph edge；SQLite close/reopen 有回归。
- 返回错误的 cleanup 改为 best-effort 聚合：即使 mailbox/identity/graph 中某一步清理失败，仍继续清
  ProjectionStore、session EventLog、workflow audit/archives、sidecar、approval cache 和内存 session。
- Renderer validator 按 64 位发布目标精确模拟 Rust `usize`：接受 `null`、空白、`01`、`+1` 和
  `usize::MAX`，拒绝 `0`、负数、下划线、`usize::MAX + 1` 与任意超大整数。

新增或强化的回归覆盖：

- `all/last-N/none`、多个 completed final-answer、commentary/final 过滤。
- child AgentMessage 全部 terminal，provider transcript 只包含选中的 user/final-answer。
- stable child identity、source mapping、parent/fork lineage。
- child EventLog 不含 parent trace/request，cold restart 无需 hydrate parent。
- graph 失败后 EventLog/canonical/in-memory 清零，同一稳定 child ID 连续两次重试不发生 sequence 污染。

当前验证：

- `cargo test --manifest-path lime-rs/Cargo.toml -p app-server "runtime::agent_control::tests::" --lib`：`19/19`。
- `cargo test --manifest-path lime-rs/Cargo.toml -p app-server spawn_forks_`：`2/2`。
- `graph_failure_clears_fork_event_log_and_stable_retry_stays_clean`：`1/1`。
- `restart_restores_forked_child_history_without_parent_hydration`：`1/1`。
- thread-store metadata patch：`2/2`；canonical fork lineage reopen：`1/1`。
- projection build/focused/full：`6/6`、`294/294`；scoped rustfmt 与 `git diff --check` 通过。
- `npm run test:contracts`：App Server client `290` checks、command/harness/modality/scripts/release/docs
  全绿；`npm run governance:legacy-report` 为 `0/0/0`。

`npm run smoke:agent-runtime-current-fixture` 已执行但不能记通过：history/storage、stream completion、
fixture guards 与首个 Electron home-hotpath 均通过，第二个 `home-hotpath-greeting` 连续两次在
`homeHotpathPendingProjectionVisibleWithinBudget` 失败。retry 证据显示 backend/GUI/read model 最终
全部完成、console/page error 为 0，但 pending conversation 首次可见为 `584ms`，超过 `250ms`
预算。失败证据：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-home-hotpath-greeting-retry-summary.json`。
该路径属于并行 GUI 热区，
本 S4am 写集不修改性能阈值或 GUI 以掩盖失败。

上一段记录的两个 blocker 已由后续 current-owner 施工关闭：durable pending-spawn/recovery 已落地，
最新 home-hotpath GUI handoff 也已稳定。`agent_type/model/reasoning_effort/service_tier` 继续为
`unsupported_field`、不得用 thread/session metadata 假实现；项目级 aggregate current fixture、完整
contracts 与 GUI smoke 仍需统一续跑，不能用单场景 Gate B 代替项目级收口。

治理分类：上述实现均为 `current`；未新增 `compat` 或 `deprecated`。raw event fork、无 completion
fixture 与任意长度 TS 数字接受路径属于 `dead / removed`，不得恢复。

## 2026-07-16 current-owner closeout

本节更新上一轮 evidence 的 crash 与 GUI 口径，作为 S4am 当前事实源：

- **Durable pending transaction**：spawn 先写可识别的 Pending 前缀和事务事实，再完成 child identity、
  parent edge、initial mailbox/TriggerTurn 与 canonical history；启动阶段只回滚残缺 Pending，运行期不
  做全局 reconciliation，避免并发 `spawn_agent` 互相删除。Pending child 在 Thread/session read/list、
  roster、GUI/API 中隐藏；只有精确 Open + pending TriggerTurn child 才进入恢复路径。
- **冷恢复与并发回归**：纯 `session.created` child 冷恢复保持 Session/Thread `Idle`、Agent
  `PendingInit`、turn/item 为空；inflight pending spawn 不被 runtime gateway 误删；完整 AgentControl
  定向测试 `23/23` 通过。
- **GUI canonical identity**：`MessageListItem` 现在优先暴露 content-part provenance，其次读取当前
  timeline 或 `agentSession/read` 的 `thread_items`，只在存在真实 `agent_message` Item 时写入
  `data-thread-item-id`。Gate B 不再把 renderer UUID 当 canonical Item；缺失 identity 仍 fail closed。
- **最新真实 Electron Gate B**：
  - `identity.consistent=true`，renderer/read model 均为同一
    `item_agent-message-final-<turnId>`；session/turn 也严格匹配。
  - `submitToConversationStability.stable=true`，`unstableCount=0`，handoff 期间无首页/空白闪回。
  - Electron/preload/App Server JSON-RPC/Runtime/read model 链路有效；legacy command、mock fallback、
    page error、page crash 均为 `0`。
  - 证据：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。

当前分类：pending transaction、fork history、canonical GUI identity 均为 `current`；旧全局 recovery、
renderer UUID 伪 canonical、raw fork event 与不可执行 optional field fixture 为 `dead / removed`；无
新增 `compat` 或 `deprecated`。剩余下一刀是项目级 `npm run test:contracts`、
`npm run smoke:agent-runtime-current-fixture` 与 `npm run verify:gui-smoke` 的统一收口，完成后再做
架构确认和 release evidence。
