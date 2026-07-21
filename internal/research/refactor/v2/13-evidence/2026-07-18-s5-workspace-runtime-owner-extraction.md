# S5 Workspace runtime owner extraction

> 日期：2026-07-18
> 状态：current owner split complete；fresh current-tree gates pending

## 变更

- `AgentChatWorkspace.tsx` 只保留公共组件入口，当前 13 行。
- Workspace runtime 现在固定为 `Entry -> Setup -> Command -> Scene`：
  - `useAgentChatWorkspaceEntryRuntime.ts`：624 行，入口/bootstrap owner。
  - `useAgentChatWorkspaceSetupRuntime.ts`：782 行，Agent Chat 与 read-model setup owner。
  - `useAgentChatWorkspaceCommandRuntime.ts`：653 行，command、side-effect、shell/artifact wiring owner。
  - `useAgentChatWorkspaceSceneRuntime.tsx`：684 行，inputbar、canvas、task center、right surface 和 JSX composition owner。
  - `useAgentChatWorkspaceRuntime.tsx`：41 行，只做四个 current Hook 的无条件组合。
- 拆分不改变 Hook 顺序、Thread/Turn/Item 投影、App Server JSON-RPC 或 Electron bridge。
- Workspace 边界守卫改读 current runtime owner，并新增入口体量与 owner 委托守卫。
- 目标架构与执行计划已记录 `Entry -> Setup -> Command -> Scene` current 组合及四个 `<800` owner 的退出条件。
- 与并行 `internal/refactor/v1` 协调：本刀只写 Workspace owner、boundary guard、v2 文档/evidence；避让 `electron/**`、`src/lib/api/agentRuntime/**`、stream/state hooks、协议/catalog 和 smoke 脚本热区。

## 消息投影根因

canonical `agent_message` snapshot 以前被当作新的 text delta 追加；同一 item 的后续 snapshot 因此生成重复消息，React 列表按新节点布局，视觉上表现为前一条消息被后续内容挤下去。当前实现按稳定 item ID 原位替换、按 timeline position 排序，并让 `final_answer` snapshot 替换正文，commentary 不再污染最终答案。

## 验证

- owner boundary guards：33 files / 50 tests 通过，入口、主 runtime、Entry、Setup、Command、Scene 均满足 `<800`。
- `npx tsc --noEmit --project tsconfig.renderer.json` 通过；五个 current owner 的定向 ESLint 通过。
- `npm run test:related -- ...` 相关测试通过；消息 snapshot projection 与 stream regression 继续由既有 owner 测试覆盖。
- canonical projection / stream / thread-state 定向回归：4 files / 32 tests 通过；input restore guard：3 tests 通过。
- Workspace/投影定向测试：38 files / 72 tests 通过。
- `npm run typecheck` 在本轮 renderer owner 接线下通过。
- `npm run test:contracts` 的历史基线曾通过（protocol types 704、client contract 291）；本轮 fresh 运行被并行 v1 协议写集阻断：`catalog.rs` 已切换 `thread/*`/`turn/*`，但 `method_names.rs` 尚未提供 manifest 要求的 6 个 `agentSession/*` constants。该阻塞不属于本轮 Workspace 写集。
- `npm run governance:legacy-report` 通过：zero-reference 0、classification-drift 0、boundary-violations 0。
- `npm run verify:gui-smoke` 已完成真实 Electron Desktop Host/App Server 启动、reload、Settings 和 bridge 断言，但 fresh run 在 `noConsoleErrors`（1 条 console error）失败；同一时间段其它并发 smoke 也出现同样基线现象，未观察到 page/invoke/preload/crash/mock fallback 错误。
- `npm run smoke:agent-runtime-current-fixture` 的 unit/fixture guard 阶段通过；renderer fixture 重建被 v1 当前协议生成漂移阻断：`METHOD_AGENT_SESSION_TURN_START` 不再由 generated protocol types 导出。
- `git diff --check` 通过。

`npm run verify:local` 未达到通过：smart 门禁在既有 `i18n:unused --check` 基线处停止，报告 `agentTeamWorkspace` namespace 的 7 个未引用 key；该资源清理不属于本次 Workspace owner/消息投影写集，需后续单独治理。

## 收口状态

`AgentChatWorkspace.tsx`、主 runtime 与四个 Workspace current owner 均满足 `<800` 结构退出条件。S5/S7 仍不能标记 archive-ready，原因只剩 fresh current-tree/架构确认，以及既有 `i18n:unused --check` 的 7 个未引用 key blocker；下一刀不恢复旧 runtime、compat wrapper 或生产 mock fallback。
