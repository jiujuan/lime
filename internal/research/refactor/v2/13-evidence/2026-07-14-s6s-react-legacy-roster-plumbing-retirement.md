# S6s React Legacy Roster Plumbing Retirement

日期：2026-07-14

## 事实源

React roster 与 lineage 只允许消费 `useCanonicalChildThreads` 返回的 canonical child
Thread summaries 和 canonical parent Thread identity。session detail 的 legacy child/parent
roster DTO 不再进入 React snapshot、Hook 或 Workspace。

## 本轮收口

- `AgentSessionSnapshot`、empty snapshot 和 detail hydration 删除
  `childSubagentSessions` / `subagentParentContext`。
- `useAgentSession` 删除两组 React state、setter、snapshot 搬运、依赖和返回字段；
  `useAgentChat` 不再继续向 Workspace 暴露 legacy roster。
- `AgentChatWorkspace` 不再解构或向 Team、context、Inputbar 等 surface 转发 legacy
  roster，child roster 统一使用 `canonicalChildren`。
- `useWorkspaceTeamRuntime` 删除 `session.hasParentThread` optional fallback，parent identity
  只使用 `canonical.hasParentThread`。
- 删除零调用的 legacy runtime-status helpers 及其 `AgentSubagentSessionInfo` 类型依赖，
  并移除只为 legacy roster 服务的测试 fixture。
- 新增 React plumbing boundary guard，禁止 legacy child/parent roster、旧 hydration 和
  runtime-status helpers 回流，同时锁定 canonical parent identity。

## 治理分类

- `current`：`useCanonicalChildThreads` -> `canonicalChildren` 与
  `canonical.hasParentThread` -> Workspace UI。
- `compat`：本 slice 未新增或保留 compat 包装。
- `deprecated`：本 slice 范围内无残留；API / App Server / Rust contract 由并行 owner
  独立收口，本 owner 未触碰其写集。
- `dead`：React child/parent roster snapshot、Hook plumbing、Workspace fallback、零调用
  status helpers 和对应正向 fixture。
- `test-only`：legacy 标识仅保留在负向边界测试文字中。

## 验证

- focused Vitest：10 files / 255 tests passed。
- canonical parent identity 最终补丁：2 files / 5 tests passed，覆盖
  `useWorkspaceTeamRuntime` unit test 与 React boundary guard。
- `npm run typecheck`：renderer / node TypeScript 通过；最终纯 canonical fallback 删除按
  coordinator 要求不重复启动第三份 typecheck，由上述 focused test 与 exact lint 覆盖。
- claimed TypeScript exact ESLint 与 Prettier：通过。
- `npm run governance:legacy-report`：扫描 2410 个文件，零引用候选 0、分类漂移 0、
  边界违规 0。
- production scan：`src`、`electron`、`packages`、`lime-rs` 中四个 legacy roster 标识
  零命中；React production 中 `session.hasParentThread` 零命中。
- root shared-tree integrated `npm run verify:gui-smoke` session `93758`：exit 0；
  renderer loaded、App Server `appserver.v0` initialized、Claw workbench shell 与 memory
  settings ready。为释放并行构建资源，本 owner 的重复 session `55001` 按 coordinator
  指令中止，未作为有效门禁结果。
- claimed tracked write set `git diff --check`：通过。

## 并行协作

`AgentChatWorkspace.tsx`、`useAgentChat.ts` 和部分测试文件包含并行 owner 的既有改动；
本 slice 只处理 legacy roster 相关 hunk，没有覆盖或回退其它变更。API、Electron、Rust、
packages 与中央执行计划均保持避让。

## 下一刀

本 React slice 完成度 100%。下一步由 refactor-v2 coordinator 汇总并行完成的 API contract
与 Rust export slices，执行更高层集成门禁；React roster plumbing 已无待迁 residual。
