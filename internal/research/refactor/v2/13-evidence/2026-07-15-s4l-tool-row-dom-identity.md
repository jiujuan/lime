# S4l Current Tool Row DOM Identity

状态：`current component boundary completed / Electron Gate B pending rerun`

## 事实源与写集

S4l 的 production GUI 路径为：

`StreamingRenderer -> StreamingProcessRun -> InlineToolProcessStep -> tool-call-row`

`InlineToolProcessStep` 直接消费 canonical typed `AgentToolCallState`。`ToolCallDisplayList` 仅被
`ToolCallDisplay.testFixtures.tsx` 引用，不是这条产品链，因此本切片没有扩张到该孤立组件。

实际源码写集只有：

- `src/components/agent/chat/components/InlineToolProcessStep.tsx`
- `src/components/agent/chat/components/InlineToolProcessStep.test.tsx`

中央计划、architecture、S4l smoke 脚本、Rust、i18n 与并行脏热区均未修改。

## 实现

current `[data-testid="tool-call-row"]` 新增两个非用户可见语义属性：

- `data-tool-name={toolCall.name}`
- `data-tool-status={toolCall.status}`

属性直接来自 typed view model；没有读取 raw wire、解析 locale 文案、依赖 Tool row 顺序、增加 mock
fallback 或 compat owner。用户可见布局、交互与文案没有改变。

组件测试使用 canonical `tool_search / completed` fixture，精确断言同一 Tool row 暴露上述 identity。

## 验证

- `npx vitest run src/components/agent/chat/components/InlineToolProcessStep.test.tsx --reporter=dot`：
  `29/29` pass。
- 精确 ESLint：pass。
- `npm run typecheck`：pass。
- claimed source/test `git diff --check`：pass。
- Prettier 全文件 check：命中 HEAD 既有 baseline drift；新补丁行没有出现在 Prettier diff 中。为避免
  越界格式化 900/1000+ 行共享文件，本切片未改动基线段落。
- `npm run verify:gui-smoke` 与 S4l managed Electron fixture：本切片未执行。当前变更是非可见 DOM
  semantic attribute，组件边界已验证；最终 S4l visible-DOM Gate B 仍需由原 fixture owner 在同一真实
  Electron run 中重跑并出证据。

## 治理分类

- `current`：typed `AgentToolCallState -> InlineToolProcessStep -> tool-call-row` identity 投影。
- `compat / deprecated`：未新增。
- `dead`：未恢复 raw Tool lifecycle、locale selector、旧 runtime 或 mock fallback。
- `test-only`：canonical `tool_search / completed` component fixture。

路线图关系：本切片补齐 S4l visible-DOM observer 的唯一 GUI identity blocker；下一刀是重跑既有 managed
Electron deferred MCP fixture，严格断言 completed `tool_search` 与 deferred tool row，并把 Gate B 结果写回
S4l evidence/中央计划。
