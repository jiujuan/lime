# S6s Rust canonical export subagent count

日期：2026-07-14

## 事实源

App Server export 的 `active_subagent_count` 只从 canonical AgentGraph direct child
关系和 hydrated `Thread.agent_state` 派生。export 不再读取
`AgentSessionReadResponse.detail.child_subagent_sessions` 或顶层 `subagents`。

## 本轮收口

- `handoff_metrics` 改为异步读取 `RuntimeCore.projection_store`：先按父 Thread 查询
  direct open children，再以 `ThreadTurnsView::Summary` 读取 child Thread，避免 terminal
  child 因缺少 latest Turn 被误判为 `PendingInit`。
- `PendingInit`、`Running` 计入 active；`Interrupted`、`Completed`、`Errored`、
  `Shutdown`、`NotFound` 不计入。closed edge、archived/missing child 也不计入。
- 没有 `ProjectionStore` 时返回 `0`。这是 fail closed：canonical
  `spawn_agent_controlled` 本身会在缺少 ProjectionStore 时拒绝创建 child，因此不存在可计数的
  canonical AgentGraph。
- handoff bundle、replay case、analysis handoff、review decision 四个 export 入口统一 await
  canonical metrics；输出 protocol 和 builder shape 不变。
- 删除 raw detail roster fallback 和 `handoff_status_is_active` 字符串 helper。
- handoff export fixture 使用真实 canonical spawn edge，证明一个 open child 计入、一个
  closed child 排除，并同时断言 response 与 `progress.json` 的 active count。

## 分类

- `current`：`ProjectionStore -> AgentGraph direct children -> hydrated
  Thread.agent_state -> active_subagent_count`。
- `dead / deleted`：export metrics 对 `child_subagent_sessions`、顶层 `subagents` 和 legacy
  runtime status 字符串的读取。
- `compat`：未新增。
- `deprecated`：本刀未保留 export roster 例外。

## 验证

- exact `rustfmt --check`：三个 claimed Rust 文件通过。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server
  canonical_subagent_status_mapping_is_exhaustive`：1 passed。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server
  export_handoff_bundle_writes_current_session_bundle_to_workspace`：1 passed。
- raw 回流扫描：claimed export 源码不再包含 `child_subagent_sessions`、顶层
  `detail.get("subagents")`、`handoff_status_is_active` 或 legacy runtime status key。
- claimed write set `git diff --check`：通过。
- `npm run test:rust:related -- <three claimed Rust files>`：成功映射到 `app-server` 并完成
  crate 编译，运行 1094 项 lib tests 时被无关既有测试
  `local_data_source::tests::mcp_current_jsonrpc_starts_real_stdio_server_and_reads_tool_resource`
  的 stack overflow / SIGABRT 阻断。本刀两个 focused 测试均已单独通过；未修改该 MCP
  测试或其共享热区。

## 架构确认

本刀为非重大架构变更：不修改 protocol、schema、read model、canonical store 或 Agent
control，只把 export 指标切换到已存在的 canonical owner。

## 路线图关系

本刀关闭 S6 legacy roster 在 Rust export 旁路中的最后一个正向消费者。下一步由 refactor-v2
协调者继续处理剩余 session DTO / adapter 空字段物理删除；不得恢复 raw roster fallback。
