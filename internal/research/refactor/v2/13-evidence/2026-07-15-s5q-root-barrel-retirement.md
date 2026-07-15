# S5q Root Barrel Retirement

## 结论

Agent Runtime frontend root aggregate 已物理删除，不再保留另一版 compat 转发壳：

- `src/lib/api/agentRuntime.ts`
- `src/lib/api/agentRuntime.d.ts`
- `src/lib/api/agentRuntime/index.ts`
- `src/lib/api/agentRuntime/index.d.ts`

production、test、fixture 的真实 static import、dynamic import 与 `vi.mock` 已归零。Agent API
aggregate test 拆到 `agentClient`、`exportClient`、`inventoryClient`、`sessionClient`、`threadClient`
direct owners；component mocks 分别直连 `agentClient/sessionClient/objectiveClient`；退役 SubAgent
root mock 与四个 dead helper/reset 已删除。

## 分类

- `current`：domain clients、typed request/session/evidence/tool owners 与 current boundary guards。
- `compat`：无 root aggregate。
- `deprecated`：无 root aggregate。
- `dead / deleted / forbidden-to-restore`：四个 barrel 文件、exact root module specifier、retired
  SubAgent test helpers。

`scripts/check-app-server-client-contract.mjs::checkRetiredAgentRuntimeClientShells` 已把四个物理路径
加入 retired guard；现有领域 current-boundary tests 保留 source-string 负向断言，不是消费者。

## 验证

- root-retirement focused：9 files / `125/125` 通过，覆盖 Agent API、ChatModelSelector、
  EmptyState、adapter、stopTeam 和三个 boundary tests。
- clientFactory mock focused：3 files / `204/204` 通过。
- exact ESLint、Prettier、typecheck 与 claimed diff check：通过。
- app-server client contract：`288` checks passed。
- `npm run governance:legacy-report`：零引用候选 `0`、分类漂移候选 `0`、边界违规 `0`。
- `npm run docs:boundary`：通过。
- 四路径 absent；anchored static/dynamic import 与 root mock scan：`0`。

完整 `npm run test:contracts` 已通过 protocol types、client/command/harness contracts，随后被独立
active `S5-i18n-task-index-review-dialog` 的 modality source-string guard 阻断；失败文件
`HarnessTaskIndexSection.tsx` 不在本切片写集，root retirement 相关 contract 已通过。

## 协调恢复

原 claim 源码、守卫与文档 diff 完成后长期保持 active 且无测试进程/evidence；coordinator 只补验证、
evidence、中央计划与 lock release，没有再修改其源码写集。

## 下一刀

`agentRuntime/types.ts/types.d.ts` 仍是独立 compat/deprecated type barrel。继续按
`sessionTypes/requestTypes/evidenceTypes/mediaTaskTypes/toolInventoryTypes/agentExecutionRuntime` 分域
迁出，最后物理删除两文件并反转 ESLint/contract guard。
