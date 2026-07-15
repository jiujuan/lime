# S2q AgentSession Canonical Presentation Boundary

## 结论

`agentSession/read` 明确保留为 ThreadStore-backed current 产品 presentation endpoint；
`thread/read/list/...` 继续拥有 canonical identity 与 control edge。两者读取同一事实源，不构成第二
read model。

Renderer 已删除“缺少 detail 时合成空 messages/items/thread_read”的 fallback，App Server 缺失
canonical detail 现在显式失败。`AppServer::new()` 仅在 test build 存在；production binary 与 library
embedding 必须通过 `AppServer::with_runtime(...)` 显式注入 RuntimeCore / ProjectionStore owner。

## 分类

- `current`：`agentSession/read` 产品 presentation、`thread/read/list/...` identity/control、ThreadStore、
  App Server read model、Renderer typed session client。
- `compat`：无新增；AgentSession presentation 不是 compat namespace。
- `deprecated`：历史 event/app-data fallback 只作为 evidence，不是运行路径。
- `dead / forbidden-to-restore`：Renderer 空详情 synthesis、production `AppServer::new()` 默认 runtime、
  第二 read model 或生产 mock fallback。

## 验证

- `appServerSessionClient.test.ts`：22/22 通过，两个 missing-detail 场景均 fail closed。
- `npm run typecheck`：通过。
- `npm run test:contracts`：通过；protocol types 698 无漂移、client contract 288 checks、命令、
  modality、scripts 与 docs boundary 全部通过。
- `npm run smoke:agent-session-history-electron-fixture`：通过。
  - evidence summary `ok=true`。
  - 覆盖真实 Electron/preload/IPC/App Server、archive/unarchive、重启 readback、分页同构与 visual replay。
  - 证据：`.lime/qc/gui-evidence/agent-session-history-electron-fixture/agent-session-history-electron-fixture-summary.json`。
- `npm run verify:gui-smoke -- --reuse-running`：通过；Renderer、Electron Host、App Server sidecar、
  Claw workbench shell 与 memory settings ready。
- production App Server check 与完整 related Rust 聚合通过。

## 路线图关系

S2q 用代码和 Gate B 证据取代了“删除整个 AgentSession read namespace”的旧退出条件。v2 现在只有一套
ThreadStore 事实源，同时保留 GUI 所需的 current presentation endpoint。
