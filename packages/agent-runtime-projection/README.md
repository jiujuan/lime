# @limecloud/agent-runtime-projection

`@limecloud/agent-runtime-projection` 是 Lime Cloud 系列应用共享的 Agent Runtime 事件投影层。它把 App Server / JSON-RPC / 本地运行时产生的 execution events 转成前端稳定可渲染的 read model，并复用 `@limecloud/agent-ui-contracts` 中的标准类型契约。

这个包只包含纯 TypeScript 类型和函数，不依赖 React，不调用 JSON-RPC，不访问 Electron IPC，也不绑定任何具体业务模块。

## Standard Package Layering

Agent UI / Runtime 的标准链路由四个包共同组成：

```text
@limecloud/agent-runtime-client
  -> executionEvents
  -> @limecloud/agent-ui-contracts
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui 或宿主 presentation adapter
```

各层边界：

- `@limecloud/agent-runtime-client` 只封装 App Server current runtime facade，不新增协议。
- `@limecloud/agent-ui-contracts` 只定义跨宿主类型契约，不承接投影逻辑。
- `@limecloud/agent-runtime-projection` 只做 headless projection 和 selectors，不接触宿主、网络、React 或业务对象。
- `@limecloud/agent-runtime-ui` 只消费 projection state 渲染标准 React primitives，不订阅运行时。

宿主负责把 App Server 事件适配为标准 execution events，再按 `AgentRuntimeClient -> executionEvents -> projectAgentUiState -> AgentUiProjectionView` 或自己的 presentation adapter 渲染。宿主可以保留本地化、点击路由、业务卡片和页面布局；不得重新实现 scope 匹配、latest index、summary selector 或运行时事实解释。

## Source Layout

实现必须按职责拆分，`src/index.ts`、`src/index.js` 和 `src/index.d.ts` 只能做 barrel exports only：

```text
src/contracts.ts   -> contracts 类型转导
src/eventStore.ts  -> event store / scope / latest selectors
src/normalization.ts -> 字段读取、文本预览、ID 列表与 payload compact
src/refs.ts        -> artifact refs 等跨宿主引用提取
src/routing.ts     -> routing decision payload 标准化
src/runtimeFacts.ts  -> runtime entity/status/phase/topology 标准事实解释
src/summary.ts     -> summary / surface / lane selectors
src/readModel.ts   -> execution events -> read model
src/uiState.ts     -> execution events -> AgentUiProjectionState / projector
src/index.ts       -> barrel exports only
```

## Installation

```bash
npm install @limecloud/agent-ui-contracts @limecloud/agent-runtime-projection
```

## Boundary

这个包负责：

- 识别事件属于 action、evidence、artifact、tool、permission、context、runtime status 还是 message。
- 把 `action.required` 投影成可点击的人类待办。
- 用 `action.resolved` 标记已处理 action。
- 聚合 artifact refs、evidence refs、task refs、source count。
- 给 UI 提供 `UIMessageParts`、`ProcessTimeline`、`ExecutionGraph`、`actions`、`tools` 和 `readModel` 等标准渲染对象。
- 为 `AgentUiProjectionEvent` 提供 host-neutral 的索引、scope selector 和 latest selector，宿主 store 只负责持久化和订阅。
- 为 `AgentUiProjectionEvent` 提供 host-neutral 的 summary selector，包括 action / task / artifact / evidence / diagnostics 计数、notable latest events、Team Workbench surface / lane 聚合和 artifact latest lookup。
- 为宿主事件 adapter 提供 host-neutral 的字段规整、artifact refs 提取、routing decision payload、runtime entity/status/phase/topology 和 worker usage 解释函数。

这个包不负责：

- 发起或订阅 JSON-RPC。
- 调用模型、工具或 Electron bridge。
- 渲染 React UI。
- 持久化 session 或执行状态。
- 定义某个业务 App 的 Prompt、知识库、素材、审核流程。

## Usage

```ts
import {
  projectAgentUiState,
  projectAgentRuntimeReadModel,
  type AgentRuntimeExecutionEvent,
} from "@limecloud/agent-runtime-projection";

const events: AgentRuntimeExecutionEvent[] = [
  {
    id: "evt-action",
    kind: "action",
    status: "pending",
    eventClass: "action.required",
    title: "需要补充输入源",
    actionId: "action-1",
    payload: {
      actionKind: "add-input-source",
      targetModule: "knowledge-inputs",
    },
    createdAt: new Date().toISOString(),
  },
];

const readModel = projectAgentRuntimeReadModel({
  executionEvents: events,
  sourceCount: 0,
});

console.log(readModel.pendingActions[0]?.action?.decision);

const uiState = projectAgentUiState({
  executionEvents: events,
  sourceCount: 0,
});

console.log(uiState.messages, uiState.timeline, uiState.graph);
```

## Event Shape

`AgentRuntimeExecutionEvent` 是跨应用的最小公共事件形状。业务应用可以使用自己的 session 类型，只要 execution event 字段兼容即可：

```ts
interface AppSession {
  executionEvents?: AgentRuntimeExecutionEvent[];
  sourceCount?: number;
}
```

常用事件类型：

- `action.required`
- `action.resolved`
- `evidence.changed`
- `artifact.changed`
- `tool.started`
- `tool.result`
- `tool.failed`
- `model.completed`
- `model.failed`
- `snapshot.updated`

## Standard UI Projection

`projectAgentUiState` 是前端标准入口。它把同一组 execution events 投影成：

- `messages`: 面向消息流的 `UIMessageParts`。
- `timeline`: 面向过程组件的 `ProcessTimeline`。
- `graph`: 面向任务、run、step、tool 和 action 的 `ExecutionGraph`。
- `tools`: 工具事件组。
- `actions`: 待用户处理的 action。
- `readModel`: 兼容既有事实栏的 read model。
- `runtime`: 当前运行状态。
- `hydration`: 宿主应用判断快照 / 实时流状态的水位信息。

`projectAgentRuntimeReadModel` 仍然保留，用于只需要事实栏或旧组件的宿主；新 UI 默认使用 `projectAgentUiState`。

## Event Store Selectors

宿主可以保留自己的 external store，但事件筛选、索引和 summary 聚合应复用本包：

```ts
import {
  createEmptyAgentUiProjectionEventStoreState,
  indexAgentUiProjectionEvents,
  selectAgentUiProjectionEventsForScopeFromStore,
  summarizeAgentUiProjectionEvents,
  type AgentUiProjectionEvent,
} from "@limecloud/agent-runtime-projection";

let state = createEmptyAgentUiProjectionEventStoreState();
const events: AgentUiProjectionEvent[] = [];

state = {
  events,
  ...indexAgentUiProjectionEvents(events),
};

const visible = selectAgentUiProjectionEventsForScopeFromStore(state, {
  sessionId: "session-1",
});
const summary = summarizeAgentUiProjectionEvents(visible);
```

不要在业务宿主里重新实现 `session / thread / run / turn / task` scope 匹配、latest event 索引、artifact / evidence / action lookup、事件类型分组、Team Workbench surface / lane 聚合或 notable event summary。否则不同 App 会逐步长出不同的 Agent UI 解释口径。

也不要在业务宿主里重新实现 `definedString`、`truncateText`、`metadataKeys`、`extractArtifactRefs`、`buildRoutingDecisionPayload`、`buildWorkerUsageProjection`、runtime entity/status/phase/topology 这类通用事实解释。宿主 adapter 只把自己的事件 shape 映射到标准 projection event，通用规整与事实解释必须回到本包。

主聊天、Agent App、content-studio 等宿主可以继续保留本地化 label、文案格式化、点击行为和业务卡片，但这些属于 presentation adapter，不是 runtime projection 标准事实源。

## Backend Integration

后端交互应留在宿主应用内：

```text
App Server JSON-RPC
  -> app service/store
  -> executionEvents
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui 或宿主 UI
```

不要让 UI 组件直接调用 JSON-RPC。这样主聊天、工作台和后续独立 App 可以共享同一套投影逻辑，同时保留自己的后端连接方式。

宿主应用如果把 App Server 的 `artifact.snapshot` 物化成本地业务产物，例如 Prompt 草稿、文章版本或素材交付物，应只把最终业务产物对应的 `artifact.changed` 传给投影层。上游快照可以保留在 provider 原始事件或诊断 payload 中，不要再作为第二个可见 artifact 事件传入，否则 UI 会把“中间快照”和“最终业务产物”渲染成两个并列产物。

共享投影层不会按 `artifactId` 或 `turnId` 自动合并多条 artifact 事件，因为多产物会话是合法场景。是否折叠、隐藏中间快照或提升最终产物，由宿主的业务适配层决定。

## Development

```bash
npm --prefix packages/agent-runtime-projection run build
npm --prefix packages/agent-runtime-projection run test
npm --prefix packages/agent-runtime-projection pack --dry-run
```

## Publish

首次发布到 npmjs：

```bash
npm --prefix packages/agent-runtime-projection publish --access public
```

发布前必须先确认版本号、npm 账号和 `npm pack --dry-run` 输出。
