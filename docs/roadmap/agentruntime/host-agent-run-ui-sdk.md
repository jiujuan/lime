# Host Agent Run UI SDK

> 状态：current-minimum-slice
> 更新时间：2026-05-17
> 目标：把 Claw 类 AI 运行现场上移为 Lime Host 通用 UI 能力，让内容工厂和后续 Agent App 不再重复实现思考、执行、Skill、工具、模型、Token、费用、证据链和确认链展示。

## 1. 为什么需要这一层

Agent App 的价值不是把 Lime Chat 换成 iframe，也不是让业务 App 直接调模型 API。Agent App 应该把业务流程做成合适的产品形态，同时继续复用 Lime 已有 AgentRuntime / Claw / ToolRuntime / Skill / Evidence 能力。

内容工厂暴露出的核心问题是：业务 App 一旦需要真实 AI Agent，就会被迫重新实现一套“AI 同事”侧栏，包括流式输出、思考过程、工具调用、Skill 调用、模型选择、Token、费用、Evidence 和人工确认。这会带来三类错误：

- 每个 App 复制一份运行 UI，体验和数据口径漂移。
- App 误以为自己需要直连模型 API，退化成普通 Web App。
- Claw 已有能力无法共享，Lime 的 AgentRuntime 事实源被拆散。

因此需要 Host 级 `lime.ui.openAgentRun / updateAgentRun / closeAgentRun`，由 Lime 主 App 提供统一运行面板，业务 App 只声明“我要展示哪次 Agent Run”。

## 2. 责任边界

| 层 | 应该做什么 | 不应该做什么 |
| --- | --- | --- |
| Lime Host UI | 提供通用 Agent Run 面板、抽屉/弹窗/子页容器、运行过程折叠、模型/Token/费用/Skill/Evidence/确认链展示 | 写死内容工厂业务字段，或让每个 App 自己复制 Claw 渲染 |
| AgentRuntime / ToolRuntime | 产出 `runtimeProcess`、timeline、stream、thinking、execution、tool/skill、artifact、evidence、usage、cost 事实 | 决定业务页面布局，或把结果只塞进聊天文本 |
| SDK / Host Bridge | 暴露 `lime.ui.openAgentRun/updateAgentRun/closeAgentRun`，把 App 请求路由到 Host UI | 让 App 绕过 Host DOM 或私有 postMessage 协议 |
| 业务 Agent App | 定义业务流程、任务 contract、expected output、artifact adapter、人工确认和写回 | 自建底层 Agent Runtime、直连 provider key、复制 Skill runtime、长期维护私有 AI 过程 UI |
| 内容工厂 | 规划项目资料、场景、文案、脚本、图片需求、交付和复盘 | 把所有 AI 思考/工具/Skill/用量渲染逻辑长期留在 App 内 |

边界结论：

```text
Agent App 可以有很多个，但 Agent Run UI 只能有一个 Host 事实源。
业务 App 可以决定何时打开、如何命名、如何把产物落回业务状态；不能拥有模型、Skill、Tool、Token、费用和 Evidence 的底层事实源。
```

## 3. SDK 合同

### 3.1 `lime.ui.openAgentRun`

App 在启动或恢复 Agent task 后调用：

```ts
await lime.ui.openAgentRun({
  taskId,
  bridgeAction: "content_factory.production",
  title: "生成内容批次",
  mode: "drawer",
  expectedOutput: { artifactKind: "content_batch" },
});
```

Host 返回：

```ts
{
  opened: true,
  surface: "host_agent_run",
  mode: "drawer",
  taskId
}
```

### 3.2 `lime.ui.updateAgentRun`

App 或 Host Bridge 在拿到 task snapshot、subscription event、`runtimeProcess`、runtime facts 后调用，用于刷新同一个 Host 面板：

```ts
await lime.ui.updateAgentRun({
  taskId,
  title,
  runtimeProcess,
  events,
  task,
  snapshot,
});
```

Host UI 必须保证：运行中可展开过程；终态默认折叠但过程不消失。

### 3.3 `lime.ui.closeAgentRun`

App 可以在用户关闭业务页面、取消任务、或希望释放视图时调用。关闭 UI 不等于取消 Agent task；取消仍走 `lime.agent.cancelTask`。

## 4. 渲染原则

Host 统一 Agent Run UI 第一刀只做通用容器，不急着复刻完整 Claw：

- 展示标题、taskId、bridgeAction 和来源 App。
- 展示模型、Token、费用、Skill 约束和真实调用情况。
- 读取 `runtimeProcess.timeline`，运行中展开，完成后折叠但不删除。
- 读取 `events / taskEvents / runtimeFacts`，把确认链、交付物和 Evidence 单独收成事实栏，避免业务 App 只在自家面板里展示这些关键过程。
- 按 `timeline.kind` 呈现 routing / skill / tool / execution / artifact / warning / completed 的轻量语义标记，让 Host 面板接近 Claw 的运行现场，而不是普通日志列表。
- 工具标题复用 Claw 的 `resolveUserFacingToolDisplayLabel`，避免 Agent App Host UI 暴露 `browser_snapshot` 这类底层工具名。
- 展示 `thinkingText / executionText / streamText` 的入口，但不让业务 App 自己解析底层事件。
- 后续可把 Claw 已有 renderer 下沉成共享 `AgentRunRenderer`，由 Host UI 调用，而不是 iframe App import Claw React 组件。

当前代码边界：

- `src/features/agent-app/ui/AgentRunHostDrawer.tsx` 是 Host 级 Agent Run UI 的第一份可复用组件。
- `AgentRunProcessPanel` 是抽屉、弹窗或未来 Claw 共享 renderer 都可复用的运行过程面板；Host Shell 负责容器，Process Panel 负责运行事实渲染。
- `src/features/agent-app/ui/AgentAppRuntimePage.tsx` 只负责 iframe runtime、Host Bridge 生命周期和 `lime.ui.*AgentRun` state 连接。
- 后续如果 Claw renderer 抽包，应该替换 `AgentRunHostDrawer` 内部 timeline/text 渲染器，而不是再把渲染逻辑塞回 `AgentAppRuntimePage` 或业务 App。

## 5. 内容工厂过渡策略

当前内容工厂已有 App 内 `AI 同事` 面板，这是过渡实现，不是目标架构。退出条件：

1. 内容工厂启动 Agent task 后调用 `lime.ui.openAgentRun`。
2. task subscription / stream / snapshot 更新时调用 `lime.ui.updateAgentRun`。
3. App 内面板只作为 Host UI 不可用时的 fallback。
4. 所有新 App 默认接 Host UI SDK，不再新写私有 `host-task-process` 解析器。
5. 真实 Claw 过程渲染、模型选择、Token、费用、Evidence、确认链继续在 Lime Host / AgentRuntime 层收敛。

## 6. 本轮最小交付

本轮先实现最小垂直切片：

- SDK contract / catalog 增加 `openAgentRun / updateAgentRun / closeAgentRun`。
- Host Bridge 拦截 `lime.ui` capability invoke，支持 toast / navigation / download / snapshot 和 Agent Run UI 请求。
- `AgentAppRuntimePage` 渲染 Host 级统一 Agent Run 抽屉。
- 内容工厂调用 Host UI SDK，保留 App 内面板作为 fallback。

不在本轮完成：

- 不把 Claw 的完整 React renderer 抽包。
- 不新增 `content_factory_*` Tauri 命令。
- 不动 0.7 manifest/reference CLI 并行写集。
- 不把 App 内所有页面一次性重设计完成。

## 7. 验收口径

最小验收：

- App 通过 SDK 调用 `lime.ui.openAgentRun` 后，Host 页面出现通用 AI 运行抽屉。
- 抽屉能显示 taskId、标题、模型、Token、费用、Skill 和 timeline。
- `updateAgentRun` 后 Host 抽屉内容刷新。
- `closeAgentRun` 只关闭 UI，不取消 Agent task。
- 内容工厂在 Host 不支持该能力时仍能用本地 fallback，不中断业务流。

完整验收：

- Host UI 使用 Claw 共享 renderer，而不是重新复制样式。
- Evidence Pack、analysis handoff、review decision、人工确认都能在同一个 Host Run UI 中追踪。
- 内容工厂全流程页面不再长期维护私有底层 Agent 过程解析。

## 8. 当前完成审计

| 要求 | 现有证据 | 结论 |
| --- | --- | --- |
| App 能通过 SDK 打开 Host Run UI | `AgentAppRuntimePage.test.tsx` 覆盖 `lime.ui.openAgentRun / updateAgentRun / closeAgentRun` | done/first-cut |
| 完成后折叠但过程不消失 | Host Run dock / drawer 保留同一份 `agentRunUi`，测试断言终态仍能看到历史 timeline | done/first-cut |
| 思考、执行、成稿流式输出不被 App 私有解析 | `AgentRunHostDrawer.tsx` 直接读取 `runtimeProcess.thinkingText / executionText / streamText` | done/first-cut |
| Tool / Skill / 模型路由 / 产物等过程可区分 | `AgentRunHostDrawer.tsx` 读取 `timeline.kind` 并输出 `data-agent-run-timeline-kind` 语义标记；测试覆盖 `routing / skill / tool / execution / completed` | done/first-cut |
| Host UI 不只绑定抽屉一种形态 | `AgentRunProcessPanel` 从 `AgentRunHostDrawer` 抽出，后续可被 modal/page/Claw shared renderer 复用；测试断言 `agent-run-process-panel` 存在 | done/first-cut |
| Claw 工具名展示复用 | `AgentRunHostDrawer.tsx` 复用 `resolveUserFacingToolDisplayLabel`；测试断言 `browser_snapshot` 在 Host Run UI 中显示为“页面截图” | done/first-cut |
| 模型、Token、费用、Skill 由 Host 统一展示 | `AgentRunMetricCards` 读取 `runtimeProcess.model / usage / cost / skillNames / invokedSkillNames`；测试覆盖模型、Token、费用、Skill | done/first-cut |
| 证据链、交付物、确认链不丢 | `AgentRunFactRail` 读取 `events / taskEvents / runtimeFacts`；测试覆盖 review request、artifact、evidence | done/first-cut |
| 真正复用 Claw renderer | 目前仍是 Host Run 专用 renderer，未从 Claw 抽出共享 React renderer | missing |
| 内容工厂移除私有 AI 面板 | 内容工厂已接 Host UI SDK，但 App 内 AI 面板仍作为 fallback | partial |
