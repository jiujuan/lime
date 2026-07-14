# S6p-a canonical navigation/runtime strip fallback retirement evidence

## 结论

本刀把两个已经没有 current producer 的 Renderer fallback 收敛到 canonical owner：

- `useWorkspaceSubagentNavigationRuntime` 删除 `childSubagentSessions` known-session 直达分支；目标只按 canonical child ThreadId 命中 roster sessionId，缺失时通过 `readThreadSessionId` 解析。
- `AgentRuntimeStrip` 删除 legacy `AgentSubagentSessionInfo` 输入、统计分支和 prop；空 canonical roster 保持零计数，状态统计只按 Codex canonical child 七态计算。
- 对应正向 legacy fixture 与 boundary guard 断言同步迁移；Harness delegation/status fallback、Task Rail stats、session state 和 legacy DTO 没有混入本刀。

## 唯一事实源与分类

- `current`：`canonicalThreadClient -> useCanonicalChildThreads -> canonicalChildThreadSummary`，以及 `readThreadSessionId(threadId)` 的 Thread identity resolver。
- `dead / deleted`：runtime strip 的 legacy roster fallback、导航的 known-session legacy branch。
- `deprecated / follow-up`：HarnessStatusPanel/HarnessDelegationSection 的 legacy list fallback、Task Rail/Inputbar subtask stats、`AgentSubagentSessionInfo` state/normalizer/metrics plumbing；它们没有外部兼容约束，应由后续独立切片迁出。
- `test-only`：本刀不新增 retired string；boundary guard 只保留负向检查。

## 验证

- navigation + AgentChatWorkspace boundary：5/5。
- `AgentRuntimeStrip.test.tsx`：10/10。
- `npm run typecheck`：通过。
- `npm run governance:legacy-report`：零引用候选、分类漂移、边界违规均为 0。
- `npm run verify:gui-smoke`：通过，退出码 0；Electron smoke 完成 renderer load、App Server ready、Claw workbench shell 和 memory settings smoke。
- claimed write set `git diff --check`：通过。

## 路线图关系

本刀继续 S6 的 canonical child roster 主线，移除导航和 runtime strip 的 legacy 身份旁路。下一刀应按独立写集删除 Harness delegation/status 的可见 fallback，再把 Task Rail/Inputbar subtask stats 迁到 canonical child counts，最后处理 DTO/state/normalizer/metrics 的整体退役。
