# S6s legacy SubAgent session contract retirement

日期：2026-07-14

## 结论

S6 canonical child roster 收口完成：

- React session snapshot、Hook、AgentChatWorkspace 和 test fixture 不再持有
  `childSubagentSessions` / `subagentParentContext`。
- session API 的 legacy child/sibling/parent roster DTO、normalizer 与空 fixture producer
  已物理删除；旧输入不能穿透 object spread。
- Workspace parent visibility 只读 canonical thread family 的 `hasParentThread`，不保留
  session fallback。
- export `activeSubagentCount` 保持外部输出字段，但输入改为 canonical AgentGraph direct
  open children + hydrated `Thread.agent_state`；raw detail roster 不再参与统计。

## 分类

- `current`：canonical Thread family、`CanonicalChildThreadSummary[]`、AgentGraph 与
  canonical `CollabAgentStatus` 七态。
- `dead / deleted`：legacy session roster DTO/state/normalizer/fixture、parent fallback、
  raw export metrics fallback。
- `compat`：无。
- `deprecated`：无；API 只在读取边界删除历史 key。

## 验证

- React focused：10 files / 255 tests passed；final hook/boundary 5/5 passed。
- API focused：60/60 passed；相关 `clientFactory` session 回归 1/1 passed。
- Rust focused：canonical status mapping 1/1、handoff export 1/1 passed。
- `npm run typecheck`：renderer/node 通过。
- exact ESLint、Prettier、rustfmt 与 claimed diff check：通过。
- `npm run governance:legacy-report`：0/0/0。
- `npm run verify:gui-smoke`：退出码 0，真实 Electron/App Server/Claw shell/memory
  settings smoke 通过。

Rust `npm run test:rust:related` 已完成编译并进入 app-server 1094 tests，随后被未触及的
`local_data_source::tests::mcp_current_jsonrpc_starts_real_stdio_server_and_reads_tool_resource`
stack overflow / SIGABRT 阻断。完整 `clientFactory.test.ts` 的未通过项同样是未触及的
turn-lifecycle `readThread` 旧期望；本刀相关用例均已精确复跑通过。

## 路线图关系

本刀完成 S6 的 legacy SubAgent roster contract 物理退役。下一刀应回到 S5 剩余
Agent Runtime compat consumer 或 S7 当前 gate refinement，不再为 roster 建立新切片。
