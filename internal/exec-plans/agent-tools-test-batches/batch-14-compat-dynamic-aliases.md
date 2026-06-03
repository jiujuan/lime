# Batch 14 - Compat Dynamic Aliases 工具链

## 背景

本批次覆盖已经由 Lime 前端兼容展示、但容易被遗漏的动态工具别名：`MCPTool`、`McpAuthTool`、`REPLTool`、`ListSkills`、`LoadSkill`、`WaitAgent`、`ResumeAgent`、`CloseAgent`。这些工具不是新的 runtime 能力，而是旧命名、provider alias 或动态调度层会继续产出的展示面。

本批次目标是证明这些 alias 不会退回 raw tool name、不会打断探索批次，也不会把子任务控制动作错误显示成“创建子任务”。

## 当前事实源与分类

事实源声明：compat alias 的 current 展示主路径收敛到 `normalizeToolNameKey`、`toolDisplayInfo.ts`、`toolProcessSummary.ts`、`toolBatchGrouping.ts` 和 Agent thread preview；不按 session、provider、model 或具体子任务 ID 硬编码。

- `current`
  - `MCPTool / McpAuthTool / REPLTool / ListSkills / LoadSkill`
  - `WaitAgent / ResumeAgent / CloseAgent`
- `compat`
  - 旧工具名和 provider alias 通过 `normalizeToolNameKey` 收敛到当前展示键
- `deprecated`
  - 把 `WaitAgent / ResumeAgent / CloseAgent` 显示成泛化 `subagent` 创建/拆分任务
  - 让 `REPLTool / ListSkills / LoadSkill` 打断探索批次摘要
- `dead`
  - raw alias name 直接出现在用户可见步骤标题中

## 当前认领写集

- `internal/exec-plans/agent-tools-test-batches/README.md`
- `internal/exec-plans/agent-tools-test-batches/coverage-matrix.md`
- `internal/exec-plans/agent-tools-test-batches/batch-14-compat-dynamic-aliases.md`
- `src/components/agent/chat/utils/toolDisplayInfo.test.ts`
- `src/components/agent/chat/utils/toolProcessSummary.ts`
- `src/components/agent/chat/utils/toolProcessSummary.test.ts`
- `src/components/agent/chat/utils/toolBatchGrouping.test.ts`

不修改：Tauri tool 注册、真实 provider 调用、i18n resources、Inputbar、设置页。

## 修复摘要

- `WaitAgent / ResumeAgent / CloseAgent` 的 pre/post 过程文案改为子任务控制语义，并保留主体对象。
- `ListSkills / LoadSkill / WaitAgent / ResumeAgent / CloseAgent` 补充展示标签、用户可见标签和主体对象回归。
- `ListSkills / LoadSkill` 与 `REPLTool` 一样作为辅助步骤吸收到探索批次，不打断读/搜摘要。
- `WaitAgent / ResumeAgent / CloseAgent` 不被错误折叠成探索或网页搜索批次，保留独立过程步骤。

## 验证结果

通过：

```bash
npm test -- "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts"
npm test -- "src/components/agent/chat/utils/agentThreadGrouping.test.ts"
npx eslint "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts" --max-warnings 0
```

结果：`4` 个 test files / `61` tests passed，ESLint 无 warning。

## 剩余缺口

- 尚未执行 GUI / Playwright 截图对齐。
- 尚未验证真实 provider stream 中这些 alias 的历史恢复截图；本批次先用 deterministic helper tests 锁住展示、摘要和折叠投影。
