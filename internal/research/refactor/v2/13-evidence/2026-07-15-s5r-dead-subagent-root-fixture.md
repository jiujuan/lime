# S5r dead subagent root fixture read-only evidence

日期：2026-07-15

## 结论

本 slice 在 claim 后发现两个源码目标被未确认的外部进程同时改写，因此按并行协作规则执行
`external-overlap-no-patch`：未对源码追加补丁，也不认领观察到的源码 diff。

当前共享工作树中，`index.testFixtures.tsx` 已没有 exact root
`@/lib/api/agentRuntime` partial mock，close/resume/send/wait 四个 legacy subagent mock 的声明、导出和
reset 已归零；`index.stopTeam.test.tsx` 不再设置或断言旧 close helper，但仍保留
`mockToast.info` 负向断言，因此尚未满足“只断言 `stopSending`”的字面退出条件。
`agentRuntime/inventoryClient` current mock及其真实测试消费者保持不变。

## 并行重叠

- claim 前两个源码文件均为 clean。
- claim 后两文件在 `2026-07-14T21:01:46Z` 同时出现目标 diff；协调者和并行 S5q 进程均确认不是其写入。
- 本 slice 停止源码写入，只做只读审计和当前共享工作树验证。
- 观察到 `src/lib/api/agentRuntime.ts`、`src/lib/api/agentRuntime/index.ts` 也处于其它 S5 切片的删除状态；本 slice 不归属、不修改这些文件。

## 治理分类

- `current`：`stopSending` 是 stopTeam 唯一动作；`agentRuntime/inventoryClient` 是工具库存 mock owner。
- `dead`：root barrel close/resume/send/wait partial mock及仅服务它们的 fixture 声明、导出、reset 和 stopTeam 假设置/假断言。
- `compat` / `deprecated`：本 slice 未新增，也未保留例外。

## 剩余 residual

- `index.stopTeam.test.tsx` 仍 destructure `mockToast` 并断言 `mockToast.info` 未调用。
- 实际源码 owner 应确认该断言没有其它 current 产品语义后，将 destructure 和断言一并删除；本 slice
  因 external overlap 未追加此补丁。

## 验证

- exact `vi.mock("@/lib/api/agentRuntime"` scan：0。
- `mockCloseAgentRuntimeSubagent|mockResumeAgentRuntimeSubagent|mockSendAgentRuntimeSubagentInput|mockWaitAgentRuntimeSubagents` 在两个目标文件：0。
- `npx vitest run src/components/agent/chat/index.stopTeam.test.tsx --silent=passed-only --disableConsoleIntercept`：1/1 通过。
- `npx vitest run src/components/agent/chat/index.workbench01.test.tsx --testNamePattern "工具库存读取" --silent=passed-only --disableConsoleIntercept`：2/2 通过，证明 inventory current mock未误删。
- exact-set ESLint：通过。
- exact-set Prettier check：通过。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移候选 0、边界违规 0。
- exact source diff check：通过。
- 按 coordinator 要求未运行 typecheck；由 root 最终共享门禁统一覆盖。

## 实际写集

仅 claim、lock、本 evidence 与 handoff。两个源码目标为只读验证，外部 diff 的实际 owner 仍需在自己的
claim/evidence 中认领并收掉上述 residual 后，再由 coordinator 汇总完成。
