# S6u Current Roadmap Roster Alignment

时间：2026-07-15

## 结论

6 份 clean current roadmap 已从 legacy session roster DTO 口径收敛到 S6 已验证的唯一
事实源：App Server `thread/list|read` join canonical AgentGraph/identity，读取
`Thread.parentThreadId / agentState` 并投影为 `CanonicalChildThreadSummary[]`。旧
`childSubagentSessions`、`child_subagent_sessions`、sibling/parent context 不再被这些
current roadmap 标为产品事实。

## 写集与避让

更新：

- `internal/roadmap/projectthread/README.md`
- `internal/roadmap/agent-workspace/README.md`
- `internal/roadmap/agent-workspace/run-observability.md`
- `internal/roadmap/agentui/conversation-projection-fact-map.md`
- `internal/roadmap/agentui/lime-agentui-target-architecture.md`
- `internal/roadmap/agentui/conversation-projection-implementation-plan.md`
- `src/lib/governance/legacySubagentRoadmapBoundary.test.ts`

`internal/roadmap/agentui/lime-agentui-standard-alignment.md` 在本切片开始前已被并行进程
修改，因此没有夹写。该文件第 248 行仍有一处旧 session roster 历史完成描述，必须在
owner 释放后单独迁成 canonical Thread family 口径；本 evidence 不把它计入已清范围。

## 分类

- `current`：canonical Thread family、AgentGraph/identity、
  `CanonicalChildThreadSummary[]` 及其 current roadmap 描述。
- `dead / deleted`：legacy session child/sibling/parent roster DTO 及其 current roadmap
  正向口径。
- `retired guard-only`：新 roadmap boundary test 中的旧字段字符串。
- `compat` / `deprecated`：本切片未新增。

## 验证

- focused roadmap boundary Vitest：1 file / 1 test passed。
- 新守卫 exact ESLint 与 Prettier passed。
- 6 份 roadmap claimed `git diff --check` passed。
- 6 份 roadmap 精确 `rg` 无 legacy roster 字段。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。

本切片只校正文档事实与新增静态守卫，没有生产、协议、Bridge 或 GUI 行为变化，未运行
GUI smoke。

## 下一刀

等待 `lime-agentui-standard-alignment.md` 的并行 owner 释放后，收掉其第 248 行残留并把
该文件加入 roadmap guard；随后继续 S5 root compat consumer 迁移和 S7 refinement
行政 closeout。
