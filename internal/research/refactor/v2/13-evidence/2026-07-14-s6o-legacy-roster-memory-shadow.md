# S6o Legacy Roster Memory Shadow Retirement

时间：2026-07-14

## 结论

Team memory runtime 不再接收或序列化 legacy child/sibling session roster：

- 删除 `AgentSubagentSessionInfo` / `AgentSubagentParentContext` 类型依赖。
- 删除 `childSubagentSessions` / `subagentParentContext` memory-runtime 参数。
- 删除 `team.subagents` / `team.parent_context` 正向写入、序列化和测试口径。
- 同步时仅保留 `team.selection` 与非 `team.*` memory；既有旧 team roster shadow 会被清除。

`team.selection`、selected-team restore、canonical child Thread roster、parent-thread visibility 和
SubAgent navigation 保持 current。

## 分类

- `current`：`team.selection` selected-team memory；canonical child Thread roster。
- `compat`：剩余 session detail / GUI legacy roster DTO consumer，继续由 S6o 后续阶段迁出，不得扩展。
- `deprecated`：无新增。
- `dead`：team-memory child/sibling roster shadow、对应参数和正向测试口径。

## 验证

- focused Vitest：3 files / 5 tests passed。
- 精确新/独立文件 ESLint 与 Prettier：passed。
- `npm run typecheck`：passed。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移 0、边界违规 0。
- claimed write set `git diff --check`：passed。
- `npm run verify:gui-smoke`：passed；Renderer、Electron Host、App Server sidecar 和 Claw shell ready。

共享脏文件 `AgentChatWorkspace.tsx` 的全文件 Prettier 仍提示前序 S6l navigation block 排版；只读格式 diff
证明与本阶段 memory hunk 无关，因此未写格式化覆盖该 block。

## 下一刀

删除 Harness canonical list 对 `childSubagentSessions` 的 fallback，并把 task rail/inputbar subtask stats
迁到 `CanonicalChildThreadSummary[]`；随后才能物理删除 session detail 的 legacy roster DTO contract。
