# @limecloud/agent-ui-contracts

`@limecloud/agent-ui-contracts` 是 Lime Agent UI / Runtime 共享的契约事实源。它导出 TypeScript 类型、标准 conformance fixtures 和轻量 validation helpers，不包含投影逻辑、React 组件、JSON-RPC client 或 Electron bridge。

## Boundary

这个包负责：

- runtime execution event 最小公共形状。
- 跨宿主 Agent UI adapter event 最小公共形状。
- action、read model、message parts、process timeline、execution graph、Subagents 和 projection state 类型。
- `AgentUiProjector` 等纯接口定义。
- 标准 conformance fixtures：text、tool、HITL、artifact/evidence、stream repair、subagent handoff。
- validation helpers：runtime event、read model、projection state、fixture 的最小结构校验。

这个包不负责：

- 将 runtime events 投影成 UI state。
- 渲染 React UI。
- 发起或订阅 JSON-RPC。
- 管理 session store 或业务对象。

## Package Roles

```text
@limecloud/agent-runtime-client
  -> App Server current runtime facade
@limecloud/agent-ui-contracts
  -> shared event and UI projection contracts
@limecloud/agent-runtime-projection
  -> pure event-to-state projection
@limecloud/agent-runtime-ui
  -> React primitives for the projection state
```

当前物理包名以 `@limecloud/agent-runtime-projection` 和 `@limecloud/agent-runtime-ui` 为准。`@limecloud/agent-ui-projection`、`@limecloud/agent-ui-react` 只允许作为历史规划名或未来 alias 讨论，不能写成 current owner。

## Install

```bash
npm install @limecloud/agent-ui-contracts
```

这个包通常被另外三个包直接依赖。产品应用只有在需要声明自己的 adapter input / output 类型、编写 conformance fixture，或在边界处做最小结构校验时才直接导入它。

## Source Layout

实现必须按职责拆分，`src/index.ts` 只能做 type-only barrel exports：

```text
src/events.ts     -> Agent UI adapter event taxonomy
src/runtime.ts    -> runtime execution event / read model / action contracts
src/projection.ts -> AgentUiProjectionState / Subagents / projector contracts
src/messages.ts   -> UI message part contracts
src/timeline.ts   -> process timeline contracts
src/graph.ts      -> execution graph contracts
src/fixtures.ts   -> standard conformance fixtures
src/validation.ts -> minimal contract validation helpers
src/index.ts      -> barrel exports
```

新增类型必须落在对应职责文件；不得把事件、runtime、projection、message、timeline 和 graph 类型重新合并回 `src/index.ts`。

`AgentRuntimeEventProjection.action` 保留兼容单按钮读取，`AgentRuntimeEventProjection.actions` 是标准多 action controls 表达，用于 approve / reject / answer / retry / stop 等宿主 intent。

## Quick Start

定义运行时事件时，只声明结构化事实，不写 UI 文案推断和 provider 原始对象：

```ts
import type { AgentRuntimeExecutionEvent } from "@limecloud/agent-ui-contracts";

export function toolStartedEvent(params: {
  turnId: string;
  toolCallId: string;
  toolName: string;
}): AgentRuntimeExecutionEvent {
  return {
    id: `tool:${params.toolCallId}:started`,
    schemaVersion: "lime-runtime-event/v0.1",
    runtimeId: "runtime-1",
    threadId: "thread-1",
    turnId: params.turnId,
    sequence: 1,
    kind: "tool",
    status: "running",
    eventClass: "tool.started",
    title: params.toolName,
    toolCallId: params.toolCallId,
    runId: params.turnId,
    createdAt: new Date().toISOString(),
    payload: {
      toolName: params.toolName,
    },
  };
}
```

定义 UI projection state 类型时只引用 contracts，不从 React 或 runtime client 反向导入：

```ts
import type {
  AgentUiProjectionState,
  AgentUiSubagentsModel,
  ProcessTimeline,
  UIMessageParts,
} from "@limecloud/agent-ui-contracts";

export interface HostAgentPanelState {
  messages: UIMessageParts;
  timeline: ProcessTimeline;
  projection: AgentUiProjectionState;
  subagents: AgentUiSubagentsModel;
}
```

`AgentUiProjectionState.subagents` 是标准子代理模型。React 组件和产品应用不能再从 `graph`、`readModel.visibleEvents`、assistant 正文或本地 state 重新解释 subagent、handoff、review 事实；这些解释必须在 projection 层完成。

Subagents view model 的 thread、delegation 和 activity 都可以携带 `AgentUiCollaborationFactsView`。该 view 只保存结构化 `collaborationFacts`、`collaborationSurface`、`collaborationPhase`、`styleLevel`、`riskLevel`、`profileId`、`packId` 和 `toneVariant`；UI / 宿主可以把它暴露为 DOM contract 或事实标签，但不得把它扩展成 profile-specific 本地句库。

## Core Event Taxonomy

Contracts 层只定义事实 envelope 和稳定枚举，不规定传输方式。事件族按 `eventClass` 划分：

| Event family | Required scope | Standard UI surface |
| --- | --- | --- |
| `turn.*` / `run.*` | `threadId`、`turnId`、`runId` | runtime status、ProcessTimeline。 |
| `model.*` / `reasoning.*` | message id 或 turn scope | `UIMessageParts`。 |
| `tool.*` | `toolCallId` | ToolGroup、ProcessTimeline、ExecutionGraph。 |
| `action.*` | `actionId` | ActionRequired。 |
| `artifact.*` | `artifactId` 或 `artifactRefs` | ArtifactRef / artifact workspace。 |
| `evidence.*` / `review.*` | `evidenceId` 或 `evidenceRefs` | EvidenceRef、review lane。 |
| `task.*` / `subagent.*` / `handoff.*` | `taskId`、`subagentId`、`handoffId` | ExecutionGraph、Subagents；协作 facts 通过 `AgentUiCollaborationFactsView` 随 Subagents view 传递。 |
| `snapshot.*` / `stream.*` | sequence / cursor | hydration、repair diagnostics。 |

新增事件族时先补 contracts fixture 和 validation 文档，再让 projection / UI 包消费；不要先在产品组件里私有解释。

## Fixtures

`agentUiConformanceFixtures` 固定当前最小验收切片：

- `text-basic`
- `tool-success`
- `tool-failure`
- `hitl-action`
- `artifact-evidence`
- `stream-repair`
- `subagent-handoff`

这些 fixtures 只包含 normalized runtime facts 和 read model 摘要，不包含 React props、Provider SDK 对象或 App Server transport。

宿主或下游包新增投影能力时，优先扩展 fixture，再让 projection / UI 测试消费同一份 fixture：

```ts
import {
  agentUiConformanceFixtures,
  getAgentUiFixture,
} from "@limecloud/agent-ui-contracts";

for (const fixture of agentUiConformanceFixtures) {
  console.log(fixture.id, fixture.events.length);
}

const hitl = getAgentUiFixture("hitl-action");
console.log(hitl.expected.pendingActionCount);
```

新增 fixture 的最低要求：

- `id` 稳定，能作为测试名和文档锚点。
- `schemaVersion` 使用当前 `AGENT_UI_FIXTURE_SCHEMA_VERSION`。
- `events` 只包含 normalized runtime facts。
- `readModel` 只放结构化摘要，不放 React props。
- `expected` 描述 UI 应见事实，不描述具体 DOM 样式。

## Validation

```ts
import {
  validateAgentUiFixture,
  validateRuntimeEvent,
} from "@limecloud/agent-ui-contracts";

validateRuntimeEvent(event);
validateAgentUiFixture(fixture);
```

Validation helpers 只做合同层最小检查：必需字段、scope id、sequence gap、secret-bearing key 和大 payload inline 风险。复杂 reducer 行为必须放在 projection 包验证。

`validateProjectionState` 要求 projection state 包含完整 `subagents` 模型：

```ts
{
  hasSubagents: boolean;
  threads: AgentUiSubagentThreadView[];
  delegationCalls: AgentUiSubagentDelegationView[];
  activities: AgentUiSubagentActivityView[];
  activeThreadIds: string[];
  completedThreadIds: string[];
  failedThreadIds: string[];
}
```

缺少这些字段时，projection state 不符合 Lime AgentUI 标准。

边界层建议使用 `collect*ValidationIssues` 做非抛错检查，把问题汇入宿主诊断：

```ts
import { collectRuntimeEventValidationIssues } from "@limecloud/agent-ui-contracts";

const issues = collectRuntimeEventValidationIssues(event);
if (issues.length > 0) {
  reportContractIssues(issues);
}
```

## Product App Usage

产品应用直接使用本包时，通常只做三件事：

1. 为自己的 adapter 参数声明标准 event / projection 类型。
2. 在接入测试中读取 `agentUiConformanceFixtures`。
3. 在 App Server facts 进入 projection 前做最小合同校验。

推荐接入边界：

```text
Product App runtime service
  -> AgentRuntimeExecutionEvent[]
  -> validateRuntimeEvent / validateAgentUiFixture
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui 或产品自己的 presentation adapter
```

## Conformance

一个 runtime provider 或产品 adapter 声称兼容 Lime AgentUI contracts 时，至少要证明：

| Slice | Required proof |
| --- | --- |
| Text turn | `text-basic` fixture validation 通过，streaming text 可 replay。 |
| Tool lifecycle | `tool-success` / `tool-failure` 有 `toolCallId`，大输出走 refs。 |
| HITL | `hitl-action` 有 `action.required` / `action.resolved` 和 `actionId`。 |
| Artifact / evidence | refs 不内联大 payload，不泄露 secret-bearing key。 |
| Stream repair | sequence gap 只在声明 repair diagnostics 的 fixture 中允许。 |
| Subagents | `subagent-handoff` 能表达 task、subagent、handoff、review scope。 |
| Subagents | projection state 包含完整 `subagents` 字段，且协作事件可以保留 `AgentUiCollaborationFactsView`。 |

下游包应从 `agentUiConformanceFixtures` 读取标准样本，而不是在自己的测试里复制一套私有 fixture。

## Package Metadata

| Item | Value |
| --- | --- |
| Runtime | Node `>=20`，ESM。 |
| Side effects | `false`，只导出类型、fixtures 和 validation helpers。 |
| Public files | `dist`、`README.md`。 |
| License | `MIT`。 |
| Versioning | 与 AgentUI 四包同步发布；contracts 破坏性变更必须走 major。 |

## Do Not

- 不要在本包里实现 reducer、selector、React 组件或 JSON-RPC client。
- 不要把 Provider SDK 类型、API key、HTTP response 或 Electron bridge 类型放进 contracts。
- 不要把业务 App 的私有 task、prompt、artifact schema 当成标准 contracts。
- 不要恢复旧树形过程术语作为标准；过程 UI 标准是 `UIMessageParts`、`ProcessTimeline`、`ExecutionGraph`。
- 不要在 `src/index.ts` 写实现逻辑；它只能做 barrel exports。

## Development

```bash
npm --prefix packages/agent-ui-contracts run build
npm --prefix packages/agent-ui-contracts run test
npm --prefix packages/agent-ui-contracts pack --dry-run
```
