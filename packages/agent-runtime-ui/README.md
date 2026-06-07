# @limecloud/agent-runtime-ui

`@limecloud/agent-runtime-ui` 是 Lime Cloud 系列应用共享的 Agent Runtime React UI primitives。它提供 Claw-style 会话流、运行事实栏、action / evidence / artifact 卡片等组件。

这个包是 UI 渲染层，不直接调用 JSON-RPC，不依赖 Electron，不绑定 Lime 或 content-studio 的业务 store。宿主应用负责后端交互、session 持久化、业务对象和页面布局。

## Installation

```bash
npm install @limecloud/agent-runtime-ui @limecloud/agent-runtime-projection
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
import { AgentTimeline, RuntimeFactsPanel } from "@limecloud/agent-runtime-ui";
import { projectAgentRuntimeReadModel } from "@limecloud/agent-runtime-projection";

const readModel = projectAgentRuntimeReadModel({
  executionEvents: session.executionEvents,
  sourceCount: session.sourceSnapshots.length,
});

export function AgentPanel() {
  return (
    <section>
      <div className="agent-session-flow">
        <AgentTimeline messages={session.messages} />
      </div>

      <aside className="agent-session-sidecar">
        <RuntimeFactsPanel
          readModel={readModel}
          onResolveAction={(event, action) => {
            // 宿主应用决定打开哪个业务模块或发送哪个 action response。
            console.log(event.id, action.decision);
          }}
        />
      </aside>
    </section>
  );
}
```

## Components

- `AgentTimeline`
- `RuntimeFactsPanel`
- `RuntimeFactsSummary`
- `RuntimeEventList`
- `RuntimeFactCard`
- `ActionCard`
- `EvidenceCard`
- `ArtifactCard`

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
- `agent-empty-session`
- `agent-runtime-event`
- `agent-runtime-summary`
- `agent-execution-events`
- `agent-event-surface`
- `agent-event-action`
- `agent-session-artifact`

content-studio 当前复用这些 class names 以承接既有 `agent-session.css`。

## Backend Integration

推荐数据流：

```text
App Server JSON-RPC
  -> host app service/store
  -> executionEvents
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui
  -> host app action resolver
```

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

`RuntimeFactsPanel` 只渲染宿主传入的 read model，不会订阅 JSON-RPC，也不会判断某个 artifact 是否已经被业务层物化。content-studio 这类宿主如果已经把 App Server `artifact.snapshot` 写成 Prompt 草稿，应在进入 `@limecloud/agent-runtime-projection` 前去掉上游快照事件，只保留本地草稿的 `artifact.changed`。这样右侧事实栏展示的是可继续编辑、可应用的业务交付物，而不是后端中间事件。

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
