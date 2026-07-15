# S5 Test Type Current Owner Components

## 结论

三个 component/Harness test-only consumer 已退出 compat `agentRuntime` 根 barrel：

- Task Rail 与 Task Center 的 `AgentRuntimeThreadReadModel` 直连 `agentRuntime/sessionTypes`。
- Harness 的三个 Tool Inventory entry 类型直连 `agentRuntime/toolInventoryTypes`。

本 slice 只迁移 type import，不修改 fixture、mock、断言或 production 行为。

## 分类

- `current`：`agentRuntime/sessionTypes`、`agentRuntime/toolInventoryTypes`。
- `compat`：root barrel 仍被其他 test/fixture 使用。
- `deprecated`：无新增。
- `dead / retired guard-only`：上述三文件的 root type import。

## 验证

- focused Vitest：3 files、53/53 passed。
- `npm run typecheck`：passed。
- exact ESLint：passed。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移候选 0、边界违规 0。
- claimed diff check：passed。
- Prettier：2 个文件 passed；`generalWorkbenchTaskRailPlanState.unit.test.ts` 的 HEAD 基线模板对象
  有一处已有换行差异，本轮 import hunk不在该差异内，未扩大写集。
- Agent Chat test/fixture 中仍有 27 个真实 static root type-import 文件；行为 mock 与 boundary 负向
  字符串不计入该数字。

## 下一刀

继续迁移不与 S2o/S4ae 重叠的 test-only type import；history/session/turn lifecycle 测试等待 S2o
释放，root behavior mock 另按实际 current client owner 拆分。
