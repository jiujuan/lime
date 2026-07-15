# S5z declaration types owner 收敛证据

## 结论

`S5z-declaration-types-owner` 已将九个手写 declaration consumer 从
deprecated `agentRuntime/types` 聚合面迁到 direct current owner。目标写集中的
`./types` / `./agentRuntime/types` static 与 dynamic type import 从 `9` 个文件降为
`0`，未新增 declaration barrel、compat wrapper 或运行时行为。

## 事实源映射

| 类型类别 | current owner |
| --- | --- |
| approval / sandbox / execution strategy | `src/lib/api/agentExecutionRuntime.ts` |
| session / read model / checkpoint result / objective / title / provider DTO | `src/lib/api/agentRuntime/sessionTypes.ts` |
| turn / checkpoint / session mutation request | `src/lib/api/agentRuntime/requestTypes.ts` |
| evidence / handoff / replay / review decision | `src/lib/api/agentRuntime/evidenceTypes.ts` |
| tool inventory / workspace skill binding | `src/lib/api/agentRuntime/toolInventoryTypes.ts` |
| runtime search mode | `@limecloud/app-server-client` |

`RuntimeSearchMode` 直接使用 package current source，与
`agentProtocolOps.ts` 的生产实现一致；没有在 Lime 内复制或重导出新的声明。

## 写集

- `src/lib/api/agentProtocol.d.ts`
- `src/lib/api/agentRuntime/inventoryClient.d.ts`
- `src/lib/api/agentRuntime/normalizers.d.ts`
- `src/lib/api/agentRuntime/objectiveClient.d.ts`
- `src/lib/api/agentRuntime/sessionClient.d.ts`
- `src/lib/api/agentRuntime/threadClient.d.ts`
- `src/lib/api/agentRuntime/clientFactory.d.ts`
- `src/lib/api/agentRuntime/agentClient.d.ts`
- `src/lib/api/agentRuntime/exportClient.d.ts`

`threadClient.d.ts` 原先是压缩格式；本 slice 触碰 import 后按 exact Prettier 展开，
其余声明签名未改。

## Consumer 减量

开始时九个目标文件均为 compat type consumer；完成后目标写集扫描为零。结合完成时
workspace fresh scan，精确 `agentRuntime/types` consumer 总数从本 slice 开始时可还原的
`13` 个降为 `4` 个：

- `src/lib/api/agentRuntime/exportClient.ts`
- `src/lib/api/agentRuntime/inventoryClient.ts`
- `src/components/agent/chat/components/skillBindingsCurrentBoundary.test.ts`
- `src/components/agent/chat/workspace/useWorkspaceSendActions.ts`

以上四个文件不在本 slice 写集；其中 Workspace 文件属于已声明避让的脏热区。

## 验证

- exact Prettier：九个 declaration 全部通过。
- exact ESLint：默认规则将 `.d.ts` ignore；使用 `--no-ignore` 对九个 declaration
  执行后 `0` error / `0` warning。
- target compat-types scan：无匹配，`9 -> 0`。
- workspace compat-types scan：剩余四个精确 consumer，与上述清单一致。
- `git diff --check`：九个 declaration 通过。
- scoped diff review：仅 direct owner import 与 Prettier 机械展开，无协议或运行时签名变更。
- 按 coordinator 要求未运行 shared typecheck / contracts，由 root 在并行 slices 合并后统一执行。

## 治理分类

- `current`：`agentExecutionRuntime`、`sessionTypes`、`requestTypes`、`evidenceTypes`、
  `toolInventoryTypes` 与 app-server-client `RuntimeSearchMode`。
- `deprecated`：`agentRuntime/types.ts` 与 `agentRuntime/types.d.ts`；本 slice 未修改，
  declaration consumer 已全部迁出。
- `dead`：九个 declaration 对 compat aggregate 的引用，已移除。
- 回流守卫：本 slice 写集不含共享 guard；最终删除 compat 文件时应由 coordinator
  反转现有规则并补物理路径恢复守卫。

这一步直接推进 v2 的单一 owner 主线。下一刀应迁出上述四个 residual consumer，随后
删除 `types.ts/types.d.ts`，并由 coordinator 执行 shared typecheck、contracts 与守卫反转。
