# @limecloud/agent-runtime-projection

`@limecloud/agent-runtime-projection` 是 Lime Cloud 系列应用共享的 Agent Runtime 事件投影层。它把 App Server / JSON-RPC / 本地运行时产生的 execution events 转成前端稳定可渲染的 read model。

这个包只包含纯 TypeScript 类型和函数，不依赖 React，不调用 JSON-RPC，不访问 Electron IPC，也不绑定任何具体业务模块。

## Installation

```bash
npm install @limecloud/agent-runtime-projection
```

## Boundary

这个包负责：

- 识别事件属于 action、evidence、artifact、tool、permission、context、runtime status 还是 message。
- 把 `action.required` 投影成可点击的人类待办。
- 用 `action.resolved` 标记已处理 action。
- 聚合 artifact refs、evidence refs、task refs、source count。
- 给 UI 提供 `visibleEvents`、`pendingActions` 和 `inputSourceRecovery` 等 read-model 字段。

这个包不负责：

- 发起或订阅 JSON-RPC。
- 调用模型、工具或 Electron bridge。
- 渲染 React UI。
- 持久化 session 或执行状态。
- 定义某个业务 App 的 Prompt、知识库、素材、审核流程。

## Usage

```ts
import {
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

## Backend Integration

后端交互应留在宿主应用内：

```text
App Server JSON-RPC
  -> app service/store
  -> executionEvents
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui 或宿主 UI
```

不要让 UI 组件直接调用 JSON-RPC。这样 Claw、content-studio 和后续独立 App 可以共享同一套投影逻辑，同时保留自己的后端连接方式。

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
