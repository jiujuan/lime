# S6q canonical Task Rail subtask stats evidence

## 结论

Task Center Task Rail 的子任务统计已从 legacy session detail roster 收敛到 canonical child Thread summaries：

- `canonicalChildren` 从 AgentChatWorkspace scene 进入 `useWorkspaceConversationSceneRuntime`。
- `useWorkspaceTaskRailRuntime`、TaskCenterUtilityToolbar 和 Task Rail ViewModel/Context 只传递 canonical children。
- 七态映射固定为 `pendingInit/running -> active`、`completed/shutdown -> completed`、`errored/notFound/interrupted -> 需处理`。
- Task Rail 的 `childSubagentSessions` prop 和统计 helper 已删除；MessageList、Inputbar、Harness 与 session DTO 不在本刀写集。

## 唯一事实源与分类

- `current`：`canonicalThreadClient -> useCanonicalChildThreads -> canonicalChildThreadSummary`。
- `dead / deleted`：Task Rail 内部 legacy `childSubagentSessions` 输入与 subtask stats reducer。
- `deprecated / follow-up`：MessageList/Inputbar/Harness 的 legacy roster props、session state/normalizer/metrics DTO；后续分别迁移，不能回流成为 Task Rail owner。

## 验证

- Task Rail runtime、scene、ViewModel、Toolbar 四组 focused tests：78/78。
- 最终 canonical interrupted 映射回归：7/7。
- `npm run typecheck`：通过。
- `npm run governance:legacy-report`：零引用候选、分类漂移、边界违规均为 0。
- `npm run verify:gui-smoke`：通过，退出码 0；Electron renderer、App Server、Claw workbench shell 和 memory settings smoke 完成。
- claimed write set `git diff --check`：通过。

## 路线图关系

本刀继续 S6 的 canonical child roster 主线，关闭 Task Rail 统计旁路。下一刀优先删除 Harness delegation/status 的 canonical-list fallback，再迁移 Inputbar 子任务统计，最后处理剩余 session detail DTO/state/normalizer/metrics 退役。
