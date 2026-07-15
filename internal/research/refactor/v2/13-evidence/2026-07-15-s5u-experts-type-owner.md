# S5u Experts Type Owner

## 结论

四个 Experts production consumers 与两个 test consumers 已从 `agentRuntime/types` compat
barrel 迁到领域 current owner：`AgentRuntimeWorkspaceSkillBinding` 直连
`agentRuntime/toolInventoryTypes`，`ExpertInfoPanel.test.tsx` 的
`AgentRuntimeEvidencePack` 单独直连 `agentRuntime/evidenceTypes`。运行时逻辑、组件 props、
fixture 和断言均未改变。

为满足 exact Prettier gate，formatter 另对三个 claimed 文件中的既有长行做了机械折行：
`expertSkillRuntimeCandidates.ts`、`expertSkillRuntimeCandidates.test.ts` 与
`ExpertSkillsSection.tsx`。这些 formatter-only diff 不改变行为，也未扩散到写集外。

## 分类

- `current`：`agentRuntime/toolInventoryTypes` 与 `agentRuntime/evidenceTypes`。
- `compat / deprecated`：`agentRuntime/types` root barrel，只允许继续迁出。
- `dead / forbidden-to-restore`：本轮六个 claimed 文件对 root barrel 的直接 import。

## 验证

- focused Vitest：3 files / `27/27` 通过，覆盖 runtime candidates、ExpertInfoPanel /
  ExpertSkillsSection 交互和 workspace skill runtime hook。
- 六个 claimed 文件 exact ESLint、Prettier：通过。
- claimed compat root specifier scan：`6 files -> 0`。
- scoped `git diff --check`：通过。
- consumer 净减：production `-4` files / `-4` type imports；test `-2` files /
  `-3` type imports。
- shared root `npm run typecheck` 在本轮 imports 落盘后启动，由 coordinator 持有；为避免
  重复 `tsc` 竞争，本 owner 主动终止自己的重复进程并将最终结果标为 pending root，
  不是类型失败。

## 剩余

fresh scan 仍有 8 个 `agentRuntime/types` consumers（5 production / 3 test），均在本轮
避让写集内。下一刀应由 coordinator 按现有 claim 继续分配 Workspace consumers；不要恢复
Experts root-barrel imports。
