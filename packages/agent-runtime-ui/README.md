# @limecloud/agent-runtime-ui

`@limecloud/agent-runtime-ui` 是 Lime Cloud 系列应用共享的 Agent Runtime React UI primitives。它面向标准 `AgentUiProjectionState`，提供消息部件、过程时间线、执行图、运行事实栏、action / evidence / artifact 卡片等组件。

这个包是 UI 渲染层，不直接调用 JSON-RPC，不依赖 Electron，不绑定任何宿主应用的业务 store。宿主应用负责后端交互、session 持久化、业务对象和页面布局。

## Installation

```bash
npm install @limecloud/agent-ui-contracts @limecloud/agent-runtime-ui @limecloud/agent-runtime-projection
```

React 是 peer dependency：

```json
{
  "react": ">=18 <20",
  "react-dom": ">=18 <20"
}
```

## Boundary

这个包负责：

- 渲染 `AgentUiProjectionState` 标准 UI surface。
- 渲染 `UIMessageParts` 消息部件。
- 渲染 `ProcessTimeline` 过程时间线。
- 渲染 `ExecutionGraph` 执行图。
- 渲染 Agent 消息时间线。
- 渲染运行事实摘要。
- 渲染 action、evidence、artifact、tool 等 runtime facts。
- 通过 callback 把用户处理 action 的意图交还给宿主应用。

这个包不负责：

- 订阅 JSON-RPC 或调用 App Server。
- 管理 session store。
- 打开业务页面或路由。
- 提供全局 CSS reset、主题系统或业务文案体系。
- 渲染 Prompt 草稿、知识库、素材、审核任务等宿主业务壳。

## Usage

```tsx
import { AgentUiProjectionView } from "@limecloud/agent-runtime-ui";
import { projectAgentUiState } from "@limecloud/agent-runtime-projection";

const state = projectAgentUiState({
  executionEvents: session.executionEvents,
  sourceCount: session.sourceSnapshots.length,
});

export function AgentPanel() {
  return (
    <AgentUiProjectionView
      state={state}
      onResolveAction={(event, action) => {
        // 宿主应用决定打开哪个业务模块或发送哪个 action response。
        console.log(event.id, action.decision);
      }}
    />
  );
}
```

## Components

- `AgentTimeline`
- `AgentUiProjectionView`
- `UIMessagePartsView`
- `ProcessTimelineView`
- `ExecutionGraphView`
- `ToolGroup`
- `ActionRequiredList`
- `RuntimeFactsPanel`
- `RuntimeFactsSummary`
- `RuntimeEventList`
- `RuntimeFactCard`
- `ActionCard`
- `EvidenceCard`
- `ArtifactCard`

## Source Layout

实现必须按职责拆分，`src/index.ts` 只能做 barrel exports：

```text
src/types.ts           -> 公共 props / callback / message 类型
src/labels.ts          -> 默认 label、status 和 meta formatter
src/messages.tsx       -> AgentTimeline / UIMessagePartsView
src/processTimeline.tsx -> ProcessTimelineView
src/executionGraph.tsx -> ExecutionGraphView
src/runtimeFacts.tsx   -> RuntimeFactsPanel / RuntimeFactCard / action/tool lists
src/projectionView.tsx -> AgentUiProjectionView 标准组合入口
src/index.ts           -> barrel exports only
```

新增 primitive 必须落在对应职责文件，或先新增职责明确的小模块；不得把实现重新合并回 `src/index.ts`。

## CSS Contract

组件只输出稳定 class names，不注入全局样式。宿主应用应按自己的设计语言提供样式。

核心 class names：

- `agent-turn`
- `agent-turn user`
- `agent-turn assistant`
- `agent-turn-avatar`
- `agent-turn-body`
- `agent-turn-head`
- `agent-turn-model`
- `agent-turn-details`
- `agent-message-parts`
- `agent-message-part`
- `agent-empty-session`
- `agent-runtime-event`
- `agent-runtime-summary`
- `agent-process-timeline`
- `agent-process-entry`
- `agent-execution-events`
- `agent-tool-group`
- `agent-action-required-list`
- `agent-execution-graph`
- `agent-execution-node`
- `agent-event-surface`
- `agent-event-action`
- `agent-session-artifact`
- `agent-ui-projection` class name
- `agent-ui-main`
- `agent-ui-sidecar`

这些 class names 是包级 CSS contract。宿主应用可以用自己的设计系统实现样式，不应把样式文件或页面壳反向变成包依赖。

## Backend Integration

推荐数据流：

```text
App Server JSON-RPC
  -> host app service/store
  -> executionEvents
  -> @limecloud/agent-ui-contracts
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui
  -> host app action resolver
```

新页面默认使用 `projectAgentUiState(...) -> AgentUiProjectionView`。如果宿主只需要旧事实栏，可以继续使用 `projectAgentRuntimeReadModel(...) -> RuntimeFactsPanel`；这属于兼容入口，不是新增 surface 的默认路径。

`onResolveAction` 只返回用户意图，不直接处理后端：

```tsx
<RuntimeFactsPanel
  readModel={readModel}
  onResolveAction={(event, action) => {
    if (action.decision === "open-model-settings") {
      openSettings();
    }
  }}
/>
```

`RuntimeFactsPanel` 只渲染宿主传入的 read model，不会订阅 JSON-RPC，也不会判断某个 artifact 是否已经被业务层物化。宿主如果已经把 App Server `artifact.snapshot` 写成业务产物，应在进入 `@limecloud/agent-runtime-projection` 前去掉上游快照事件，只保留本地业务产物的 `artifact.changed`。这样右侧事实栏展示的是可继续编辑、可应用的交付物，而不是后端中间事件。

## Development

```bash
npm --prefix packages/agent-runtime-projection run build
npm --prefix packages/agent-runtime-ui run build
npm --prefix packages/agent-runtime-ui run test
npm --prefix packages/agent-runtime-ui pack --dry-run
```

## Publish

首次发布到 npmjs：

```bash
npm --prefix packages/agent-runtime-ui publish --access public
```

发布前必须先发布同版本的 `@limecloud/agent-runtime-projection`，并确认 `npm pack --dry-run` 输出只包含 `dist` 和 `README.md`。
