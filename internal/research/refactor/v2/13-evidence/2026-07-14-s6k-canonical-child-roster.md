# S6k canonical child roster evidence

日期：2026-07-14

## 结论

Renderer Multi-Agent roster/status 已从 legacy `AgentSessionReadResponse.detail` 与 raw Team sidecar 收敛到 canonical Thread owner：

```text
AgentGraphStore + AgentIdentityStore + canonical child Thread lifecycle
  -> App Server thread/list + thread/read
  -> canonical child selector/hook
  -> Workspace / Harness roster and status
```

App Server read/list 在 canonical Thread 上投影 parent ThreadId、agent path/nickname/role、last task message 与七态 agent state；Renderer 按 parent ThreadId 过滤、稳定排序，并对 activity 引用但 list 缺失的 child 显式投影 `notFound`，不回退 raw status 或 mock。

## 实现范围

- `ProjectionStore` 的 canonical thread read/list 在读取时 join durable spawn edge 与 agent identity；关闭 edge 投影 `shutdown`，但不擦除 identity。
- typed App Server client 接入既有 `thread/list` method；canonical child client 按 cursor 分页收集并只保留目标 parent children。
- selector 从 canonical Thread/lifecycle 派生 pendingInit/running/interrupted/completed/errored/shutdown/notFound 与计数。
- Workspace、Harness、Runtime strip 消费 canonical children；legacy child session 仅保留尚未迁完的兼容展示输入，不再是 roster owner。
- canonical children 同时保留 threadId/sessionId；导航由 S6l 使用 roster sessionId，缺失时走 `thread/read`。

## 验证

- canonical client/selector/Workspace focused：15/15。
- S6k/S6l 统一 focused：91/91。
- `test:related`：33 files 中 256/258 通过；主线相关 stop test 的陈旧 toast 断言已修复并单独 1/1 通过。剩余 `index.autoGuide03.test.tsx` 因 Skills mock 缺 `listExecutableSkills` 失败，与 roster 无关。
- Rust 精确：agent state 1/1；canonical read join 3/3。
- `cargo check --manifest-path lime-rs/Cargo.toml -p app-server --lib`：通过。
- Rust related 扩大到 app-server 1092 tests 后，被无关 `mcp_current_jsonrpc_starts_real_stdio_server_and_reads_tool_resource` stack overflow/SIGABRT 中止；新增测试无失败。
- `npm run typecheck`：通过。
- `npm run test:contracts`：290 checks 通过。
- `npm run smoke:claw-chat-current-fixture -- --scenario multi-agent-team --timeout-ms 180000`：真实 Electron/App Server、GUI/read model 完成与 Evidence Pack 导出通过。
- `npm run verify:gui-smoke`：通过。

完整 current aggregate 在 Skills Runtime 场景稳定显示外部 Provider 鉴权失败后 exit 1；此前首页、Workbench、图片、cancel/continue、Approval、Inputbar 与 Plan history 均通过。首次 plain-image 运行曾因并发 build 瞬时缺失 `dist/index.html` 失败，稳定资产定向复跑与完整复跑均通过。

## 治理分类

- `current`：AgentGraph/AgentIdentity、canonical Thread lifecycle、App Server thread/list/read、canonical child selector/roster。
- `compat`：真实 legacy child session input 只为未迁完消费者提供展示/直达 sessionId，不承接新状态逻辑。
- `deprecated`：raw status refresh/projector 和 legacy roster DTO。
- `dead / deleted / forbidden-to-restore`：Renderer Team runtime sidecar、restored synthetic facts、本地 live maps 与 unavailable child controls。

本切片是既有架构的 current owner 接线，不新增协议 method、Electron 后端、runtime taxonomy、mock 或 fallback；无需修改架构图。
