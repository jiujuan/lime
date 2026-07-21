# @limecloud/agent-workbench-adapter

`@limecloud/agent-workbench-adapter` 是 Agent 工作台的 headless adapter。它不渲染 UI，只把产品页面的 intent、composer 状态、runtime facts 和 turn payload 拼成可复用的标准结构。

目标是让 Plugin、Content Studio 这类 surface 共享工作台控制逻辑，而不是重复开发整套前端页面。

## Boundary

这个包负责：

- quick intent / task kind 到 runtime capability policy 的映射。
- composer 提交模式判断：start、send、queue、disabled。
- runtime facts 摘要：sources、tools、pending actions、artifacts、evidence、tasks。
- Agent 工作台任务视图模型：当前任务、状态、事实计数、检查点和运行面板开关。
- Agent 工作台 runtime facts 判断：是否存在可展示的事实面。
- `turn/start` payload 拼装。

这个包不负责：

- React state、组件和 CSS。
- IPC / Electron / JSON-RPC 传输。
- session store 持久化。
- 产品业务文案。
- 读取或保存模型 API Key。

## Usage

```ts
import {
  buildAgentTurnStartPayload,
  resolveWorkbenchIntentCapabilityPolicy,
} from "@limecloud/agent-workbench-adapter";

const policy = resolveWorkbenchIntentCapabilityPolicy({
  intentId: "research",
});

const payload = buildAgentTurnStartPayload({
  pluginId: "content-studio",
  workspacePath,
  prompt,
  capabilityId: "content.draft.generate",
  requiredCapabilities: policy.requiredCapabilities,
  capabilityHints: policy.capabilityHints,
});
```
