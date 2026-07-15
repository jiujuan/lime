# S4ae canonical SubAgent GUI evidence

日期：2026-07-15

## 当前结论

canonical SubAgent GUI 骨架已形成，唯一活动语义为：

- `Started` / `Interacted`：活动仍在进行，GUI 使用 running/acting。
- `Interrupted`：活动被中断，GUI 使用 cancelled/interrupted。
- activity Item 的 `ItemStatus::Completed` 只表示事实已持久化，不代表 child terminal。
- child completed/failed 继续只由 S4aa Result mailbox 与 child thread lifecycle 表达。

冷恢复当前由 `agentSession/read -> canonical ThreadStore -> detail.items/thread_read.thread_items`
承接；本轮没有额外并发 `thread/read(full)`，避免历史分页和 refresh 重复读取完整 Thread。
live 与 cold 使用相同 canonical Item ID，hydrate 按 ID 去重。

六个 AgentControl 工具已通过真实 Electron managed Gate B。child 首 Turn 与 followup Turn
即使收到相同 provider raw output ID，也使用
`provider:{turnId}:{attempt}:{family}:{sourceItemId}` 生成不同 canonical Item identity。
ThreadStore 继续对跨 Turn Item identity 变更 fail closed；没有增加 ID normalization、EventLog
sequence fallback 或第二持久化队列。

## 已收口 surface

- 删除 `real:subagent:*` synthetic producer 及正向测试，Workspace 不再合并 child-session sidecar。
- 删除 activity Item 伪造的 `worker.notification`；真实 child terminal notification owner 不变。
- Harness 不再从 activity Item status 构造 child terminal roster。
- timeline badge 按 activity 而不是 Item status 选择状态，并覆盖五语言；未知 wire 不显示 raw enum。
- App Server canonical ThreadStore 重启后仍读取三类 activity 的稳定 Item ID 与 child ThreadId。
- child Turn 在 durable graph/identity/mailbox commit 后后台执行，parent 只等待 `turn.accepted`
  admission，不等待 child terminal。
- child 继承 parent Turn 的显式 provider/runtime request，并清除 parent-only output contract。
- 删除 E2E 文档中旧 Team 五工具的 current 口径；六个 AgentControl 名称成为唯一正向工具面。
- tool execution evidence 删除陈旧 `usesCompatToolInventoryCommand`，改为准确的
  `usesAppServerToolInventoryCurrent`，并补旧字段负向守卫。

## Gate B 根因与修复

首次 fresh Gate B 已越过原同步等待和 provider request 继承问题，但暴露：

- followup child Turn 复用了首 Turn 的 `provider:1:text:text-0`，canonical SQLite 正确拒绝
  `item ... changed turn identity`。
- EventLog-first append 已落盘，而 canonical projection 失败后内存没有推进；后续 interrupt
  因此报告 `expected 28, got 26`。这是前一个 identity 错误的次生结果，不是另一个 sequence owner。

修复只提升 current provider output identity 的 scope，将 canonical Turn ID 加入唯一身份；
ThreadStore 与 EventLog 的 fail-closed 规则保持不变。最终同一场景中 wait、interrupt 均完成，
两个错误同时归零。

## 验证

- `npm --prefix packages/agent-runtime-projection test`：298/298。
- focused Vitest：7 files / 70 tests。
- `src/components/agent/chat/index.test.tsx`：16/16。
- `cargo test -p app-server read_detail_prefers_canonical_thread_store_items_after_restart --lib`：1/1。
- `cargo test -p agent-protocol subagent_activity_accepts_only_codex_current_wire_values --lib`：1/1。
- `npm run check:protocol-types`：694 types，0 drift。
- `npm run typecheck`：通过。
- `npm run i18n:check:json`：五语言，0 issue。
- `npm run smoke:agent-runtime-current-fixture`：history/cache 31/31、stream 32 passed、Electron
  fixture guard 64/64；真实 Electron 首页、问候、Coding Workbench、图片、cancel/continue、Approval、
  Inputbar queue/restore 与 Plan history 场景通过。最终 Skills Runtime 场景因 fixture Provider 鉴权失败
  显示配置错误，命令 exit 1；不是 SubAgent GUI 投影失败。
- `npm run verify:gui-smoke`：通过；Renderer、Electron Host/preload、真实 App Server sidecar、初始化、
  Claw shell 与 memory settings 均成功。
- `cargo test --manifest-path lime-rs/Cargo.toml -p agent-runtime provider_turn --lib`：
  11/11，覆盖跨 Turn、跨 sampling attempt identity；完整 related Rust 结果见 S2o3 evidence。
- `cargo test --manifest-path lime-rs/Cargo.toml -p app-server --lib agent_control`：13/13。
- `npm exec vitest run scripts/agent-runtime/tool-execution-smoke.test.mjs`：5/5。
- `npm run smoke:agent-runtime-tool-execution:managed -- --batch agent-control-tools --output
  .lime/qc/s4ae-agent-control-tools-gate-b-final.json --timeout-ms 300000`：通过；`status=pass`、
  15 项 assertions 全真、六工具均 `completed/success=true`、`incompleteBatchTargetTools=[]`。
- S2o3 独立复跑 `.lime/qc/s2o3-s4ae-agent-control-tools-gate-b-rerun.json`：同样 pass，
  15/15 assertions、六工具 completed。
- `npm run docs:boundary`：通过。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移 0、边界违规 0。

## 并行冲突处理

并行只读审计曾以 `v1.101.0/v1.102.0` 本地开发数据为由要求保留十值。该假设与仓库“无外部
用户、无历史兼容负担”的事实源冲突，也偏离 Codex 仅三值的 canonical contract，因此未采纳。
`thread.rs`、schema 与 generated TS 已重新收口为三值；旧七值由反序列化负向测试禁止回流。

本次 AgentControl managed 场景覆盖真实 Electron、preload/IPC、`app_server_handle_json_lines`、
App Server JSON-RPC、current runtime/provider、canonical read model 与 GUI shell。该 batch 当前没有
SubAgent visible-DOM、console 与 invoke trace 断言，因此不把它扩张表述为完整可见 DOM Gate B；
可见 timeline/child 导航继续由既有 S4ae GUI focused、通用 GUI smoke 与 canonical projection
证据承接。

Codex 对照仍发现一个独立 refinement：Lime 继承的是 parent `turn_runtime_options` 显式请求；
当有效 provider/model 只由 session default/profile 解析时，尚未复制解析后的有效 Turn route。
该缺口不恢复 compat，后续必须在 current request-context owner 解决。

## 后续收口

S4ag 已把 parent 的 effective session-default/profile route 回写唯一
`StoredSession.turn_runtime_options` 后再供 gateway 复制，关闭本文件登记的 route refinement。
S4ah 已补 `.lime/qc/s4ah-agent-control-visible-dom-gate-b.json`：28/28 assertions，六个
AgentControl typed Tool row 全部 completed/visible，三类 canonical SubAgent activity 可见，
`agentSession/read` 为 `electron-ipc`，console/invoke error 均为 0。`wait_agent` 不再误投影为
`subagent_activity(kind=wait)`。

本文件状态为 implementation-complete / focused-validated /
agent-control-visible-DOM-Gate-B-validated。

## 治理分类

- `current`：canonical ThreadStore cold read、live Thread/Turn/Item、三态本地化 GUI、六个
  AgentControl 工具、Turn-scoped provider output identity；`agentSession/read` 是同一
  ThreadStore-backed 产品 presentation endpoint。
- `compat`：无新增。
- `deprecated`：无新增。
- `dead / deleted / forbidden-to-restore`：旧七 activity wire、activity worker-result、
  `real:subagent:*` synthetic sidecar、旧 Team 五工具 current 文档、attempt-only provider output
  identity、`usesCompatToolInventoryCommand` current evidence 字段。
