# S6t Canonical Parent Thread Identity

时间：2026-07-14

## 结论

Workspace 的 parent-thread 可见性已从 legacy session parent context 收敛到 canonical
`thread/list -> Thread.parentThreadId`。同一次分页读取同时返回当前 Thread 的 parent identity
和直接 children，`useCanonicalChildThreads` 再把 canonical `hasParentThread` 交给
`useWorkspaceTeamRuntime`；不再接受 session roster/context 的第二身份源。

## 写集

- `src/lib/api/agentRuntime/canonicalThreadClient.ts` 及定向测试
- `workspace/useCanonicalChildThreads.ts`
- `workspace/useWorkspaceTeamRuntime.ts` 及定向测试

Active S6s React/API/Rust child-roster 写集、S2l history repair、AgentChatWorkspace、Electron、
Rust 与协议均未触碰。

## 分类

- `current`：canonical `Thread.parentThreadId`、direct child Thread list、
  `CanonicalChildThreadSummary[]`。
- `dead / retired guard-only`：Workspace team runtime 的 legacy parent-context Boolean 输入。
- `compat`：无新增。
- `deprecated`：无新增。

## 验证

- focused Vitest：2 files / 9 tests passed。
- exact-set ESLint passed。
- exact-set Prettier passed。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- claimed write set `git diff --check` passed。

新增回归覆盖当前 canonical Thread 有 parent、没有 children 且 SubAgent tool 关闭时，
runtime 会话与 Subagents 入口仍保持可见；空 Thread identity 不访问 App Server，重复 cursor
继续 fail-safe 终止。

## 下一刀

由 active S6s coordinator 汇总 child roster DTO/state/API/Rust export 删除并运行 GUI smoke；
随后清 Electron `pluginRuntimeTaskHost` 的空 legacy roster fixture，并把仍标记旧 roster 为
current 的 roadmap 文档迁到 canonical Thread/AgentGraph 事实源。
