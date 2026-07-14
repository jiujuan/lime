# S4ae canonical SubAgent GUI evidence

日期：2026-07-14

## 当前结论

canonical SubAgent GUI 骨架已形成，唯一活动语义为：

- `Started` / `Interacted`：活动仍在进行，GUI 使用 running/acting。
- `Interrupted`：活动被中断，GUI 使用 cancelled/interrupted。
- activity Item 的 `ItemStatus::Completed` 只表示事实已持久化，不代表 child terminal。
- child completed/failed 继续只由 S4aa Result mailbox 与 child thread lifecycle 表达。

冷恢复当前由 `agentSession/read -> canonical ThreadStore -> detail.items/thread_read.thread_items`
承接；本轮没有额外并发 `thread/read(full)`，避免历史分页和 refresh 重复读取完整 Thread。
live 与 cold 使用相同 canonical Item ID，hydrate 按 ID 去重。

## 已收口 surface

- 删除 `real:subagent:*` synthetic producer 及正向测试，Workspace 不再合并 child-session sidecar。
- 删除 activity Item 伪造的 `worker.notification`；真实 child terminal notification owner 不变。
- Harness 不再从 activity Item status 构造 child terminal roster。
- timeline badge 按 activity 而不是 Item status 选择状态，并覆盖五语言；未知 wire 不显示 raw enum。
- App Server canonical ThreadStore 重启后仍读取三类 activity 的稳定 Item ID 与 child ThreadId。

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

## 并行冲突处理

并行只读审计曾以 `v1.101.0/v1.102.0` 本地开发数据为由要求保留十值。该假设与仓库“无外部
用户、无历史兼容负担”的事实源冲突，也偏离 Codex 仅三值的 canonical contract，因此未采纳。
`thread.rs`、schema 与 generated TS 已重新收口为三值；旧七值由反序列化负向测试禁止回流。

磁盘空间随后被外部进程释放，本进程没有执行删除。`verify:gui-smoke` 已通过；current fixture 已越过
此前 ENOSPC 和多个真实 Electron 场景，最终仅被 Skills Runtime fixture Provider 鉴权失败阻断。
本文件状态为 implementation-complete / GUI-smoke-validated /
aggregate-fixture-external-provider-auth-blocked。

## 治理分类

- `current`：canonical ThreadStore cold read、live Thread/Turn/Item、三态本地化 GUI。
- `compat`：`agentSession/read` 作为当前冷恢复入口；后续 S5/S6 迁到 typed `thread/read(full)` 后删除。
- `deprecated`：无新增。
- `dead`：旧七 activity wire、activity worker-result、`real:subagent:*` synthetic sidecar。
