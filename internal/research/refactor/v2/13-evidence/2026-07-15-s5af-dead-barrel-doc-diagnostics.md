# S5af Dead Barrel Documentation And Diagnostics

## 结论

Agent Runtime 的四个 root aggregate 与两个 type aggregate 已物理删除并禁止恢复：

- `src/lib/api/agentRuntime.ts`
- `src/lib/api/agentRuntime.d.ts`
- `src/lib/api/agentRuntime/index.ts`
- `src/lib/api/agentRuntime/index.d.ts`
- `src/lib/api/agentRuntime/types.ts`
- `src/lib/api/agentRuntime/types.d.ts`

当前源码没有 static、dynamic 或 mock consumer，也没有替代 barrel。文档示例已直连
`@/lib/api/agentRuntime/inventoryClient`；ESLint 诊断明确要求 session/request/evidence/media/tool/execution
分域 owner，并删除了已不存在的 root file ignore。

## 分类

- `current`：分域 client 和 `sessionTypes/requestTypes/evidenceTypes/mediaTaskTypes/toolInventoryTypes/
  agentExecutionRuntime` 类型 owner。
- `compat`：无。
- `deprecated`：无。
- `dead / deleted / forbidden-to-restore`：上述六个 aggregate 文件与任何 replacement barrel。

## 验证

- exact ESLint：通过，0 warning。
- exact Prettier：`eslint.config.js` 与 `internal/prd/tools/inventory.md` 通过。
- `npm run test:contracts`：通过；deleted-path physical guard 与 client contract 288 checks 通过。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移候选 0、边界违规 0。
- 非测试 `src/**` import consumer scan：0。
- 六个目标路径 `rg --files` scan：0；Git 当前树均为 physical delete。
- exact `git diff --check`：通过。

## 路线图关系

S5af 完成 S5 type/root barrel 删除后的文档和诊断收尾，确保后续开发只能依赖唯一分域 owner，不能因
旧示例或 lint 文案恢复兼容入口。
