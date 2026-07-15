# S5ae Types Barrel Retirement

## 结论

Agent Runtime frontend type aggregate 已在真实 module consumer 归零后物理删除：

- `src/lib/api/agentRuntime/types.ts`：35 行 re-export facade。
- `src/lib/api/agentRuntime/types.d.ts`：2026 行手写漂移镜像。

未创建替代 barrel。session/request/evidence/media/tool/execution direct modules 是唯一继续演进的
type owner。

## 守卫

- session roster contract 不再读取已删除 declaration 镜像。
- ESLint 不再推荐 `agentRuntime/types`，并禁止 `./types` 与 `./agentRuntime/types`。
- `checkRetiredAgentRuntimeClientShells` 将两个物理路径纳入 forbidden-to-restore 检查。
- fresh source scan 只剩 `skillBindingsCurrentBoundary.test.ts` 的负向禁止字符串，不是 consumer。

## 验证

- focused boundary Vitest：2 files / `4/4`。
- renderer/node `npm run typecheck`：通过。
- App Server client contract：`288` checks。
- `npm run governance:legacy-report`：`0/0/0`。
- `npm run governance:modality-contracts`：通过。
- `npm run test:contracts`：完整通过，包含 protocol、command、harness、modality、scripts、Electron
  release、cleanup 与 docs boundary。
- exact ESLint、Prettier、script syntax、path/specifier scan 与 diff check：通过。

## 分类

- `current`：分域 direct type owners。
- `compat`：无。
- `deprecated`：无。
- `dead / deleted / forbidden-to-restore`：`types.ts`、`types.d.ts` 与所有旧 module specifier。
