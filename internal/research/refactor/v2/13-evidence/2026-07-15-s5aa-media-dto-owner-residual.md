# S5aa media DTO owner residual closeout

状态：completed / residual-media-dto-owner-validated / released

## 结论

`mediaTaskTypes.ts` 现在是 media DTO 的唯一 current type owner。`mediaTasks.ts` 只保留
App Server behavior gateway 和 method constants，不再导出 DTO 类型；所有受影响的生产、
Workspace、layered-design、页面 smoke 与测试消费者均直接导入 typed owner。

## 分类

- `current`：`src/lib/api/agentRuntime/mediaTaskTypes.ts` 持有请求、输出和 modality contract DTO。
- `current`：`src/lib/api/mediaTasks.ts` 持有 App Server media task behavior。
- `compat / deprecated`：mediaTasks DTO re-export 已删除。
- `dead / forbidden-to-restore`：从 behavior gateway 重新导出 DTO 或恢复 retired media client。

## 验证

- 受影响 Vitest：10 suites / 100 tests passed。
- `mediaTaskTypeOwnerBoundary.test.ts`：2/2。
- `npm run typecheck`：renderer 与 node 两个项目通过。
- exact Prettier、ESLint 与 `git diff --check`：通过。

## 并行边界

本刀只改 media type import owner；App Server client、协议、provider lowering、Electron
behavior 和 S6/S7 runtime 写集未触碰。
