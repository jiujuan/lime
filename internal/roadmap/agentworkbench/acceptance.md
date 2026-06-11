# Agent Workbench 验收矩阵

> 状态：active
> 范围：文档站标准、SDK 边界、AgentRuntime 配合、Subagents、治理与发布。

## 1. 文档站验收

| 项 | 必须满足 | 证据 |
| --- | --- | --- |
| 架构 | App Server、RuntimeCore、ExecutionBackend、AgentUI Projection、Product Apps 的关系清楚 | `docs/concepts/architecture.md` |
| 协议参考 | AG-UI、AI SDK、OpenAI Agents JS 等只作为 reference，不成为 Lime owner | `docs/agentic-protocols.md` |
| 标准术语 | 使用 UIMessageParts、ProcessTimeline、ExecutionGraph、ToolGroup、ActionRequired、ArtifactRef、EvidenceRef | `docs/contracts/ui-projection.md` |
| 禁止旧词 | 不把非标准树形过程术语写成 Lime 标准 | 全站搜索 |
| 导航 | 新增核心页面能从 sidebar 访问 | `docs/.vitepress/config.mts` |
| 构建 | VitePress build 通过 | `npm run docs:build` |

## 2. SDK 验收

| 包 | current 职责 | 禁止 |
| --- | --- | --- |
| `@limecloud/agent-ui-contracts` | types、schemas、fixtures、version constants | React、transport、provider、产品应用依赖 |
| `@limecloud/agent-runtime-projection` | projector、selectors、hydration、replay、reconciliation、Subagents model | React DOM、Electron、Provider SDK、App Server DB |
| `@limecloud/agent-runtime-ui` | React primitives、surfaces、callbacks、i18n label contract、CSS / DOM contract | runtime truth、Provider key、JSON-RPC transport |
| `@limecloud/agent-runtime-client` | App Server JSON-RPC、Host bridge、events、read APIs、action response、evidence export | UI projection state、React component、Provider Store owner |
| `@limecloud/agent-ui` | future facade，只 re-export UI 侧包 | runtime transport、业务实现 |

最小 API 验收：

- contracts 有 RuntimeEvent、ThreadReadModel、TaskSnapshot、ProjectionState、ArtifactRef、EvidenceRef、AgentUiSubagentsModel。
- projection 能 `projectAgentUiState`、`createAgentUiProjector`、`replayAgentUiFixture`、`replayAppServerFacts`、`buildAgentUiSubagentsModel`。
- react 组件只接受 projection state 和 command callbacks；Subagents 只消费 `state.subagents`；Artifact/Evidence refs 只展示轻量 ref 并通过 callback 交还宿主。
- runtime-client 有 `startTurn`、`subscribeEvents`、`nextEvent`、`readThread`、`respondAction`、`cancelTurn`、`exportEvidence`。

## 3. Runtime 配合验收

| 能力 | 必须事实化 | UI 表达 |
| --- | --- | --- |
| turn 生命周期 | `turn.submitted / started / completed / failed` | Runtime status、message shell |
| 模型输出 | `model.delta / completed / failed` | UIMessageParts text |
| reasoning / plan | `reasoning.delta / summary`、`plan.delta / final` | reasoning part、ProcessTimeline |
| 工具 | `tool.started / args / progress / result / failed` | ToolGroup、ExecutionGraph step |
| 人工动作 | `action.required / resolved / cancelled / expired` | ActionRequired |
| artifact | `artifact.changed / versioned / exported` | ArtifactRef、artifact workspace |
| evidence | `evidence.changed / exported / review.verdict` | Evidence lane、review/replay |
| subagent | `subagent.started / updated / completed / failed` | Subagents threads、ExecutionGraph child |
| handoff / review | `handoff.requested / completed`、`review.verdict` | Subagents delegation / activity summary |
| 断流恢复 | `stream.repaired / snapshot.updated` | stale / repairing 状态 |

不合格情况：

- 只有 assistant prose，没有 typed payload。
- UI 从本地 state 推断工具成功或 evidence verdict。
- 产品应用直读 Provider key 或 App Server DB。
- Runtime provider 输出 React props。

## 4. Subagents 验收

| 项 | 必须满足 |
| --- | --- |
| identity | subagent 必须有 `subagentId`，并关联 parent task / run / step。 |
| lineage | parent/child、handoff、dependency edges 可被 ExecutionGraph 表达。 |
| lifecycle | started、progress、blocked、completed、failed、cancelled 可区分。 |
| communication | channel message、worker notification、handoff request 不伪装成普通用户消息。 |
| control | cancel / pause / resume / respond action 进入 runtime control plane。 |
| evidence | 子代理输出能进入 artifact/evidence refs，保留 correlation ids。 |
| projection | `AgentUiProjectionState.subagents` 有 threads、delegationCalls、activities、active/completed/failed thread ids 和 isolation 摘要。 |
| degradation | 缺 lineage 时显示 unknown / unavailable，不猜测团队结构。 |

## 5. Conformance Fixture 验收

每个 runtime provider 或 SDK 切片至少准备以下 fixture：

| Fixture | 覆盖 |
| --- | --- |
| text-basic | streaming delta + final reconciliation |
| tool-success | tool args/progress/result + output ref |
| tool-failure | failure category + recovery action |
| hitl-action | action required/resolved + waiting state |
| artifact-evidence | artifact changed + evidence exported |
| stream-repair | interrupted stream + read model repair |
| subagent-handoff | parent task -> child subagent -> handoff/review |

通过标准：

- Projection replay 幂等。
- 重放顺序由 `sequence` 和 scope ids 决定。
- 大输出只通过 refs 表达。
- 断流后能从 read model 修复。

## 6. Lime 主仓迁移验收

| 现有路径 | 目标 | 验收 |
| --- | --- | --- |
| `packages/app-server-client` | `@limecloud/agent-runtime-client` seed | 不生成 UI projection，不带 React。 |
| `packages/agent-runtime-projection` | `@limecloud/agent-runtime-projection` current | projector / selectors 在 React 外可测，输出 `state.subagents`。 |
| `packages/agent-runtime-ui` | `@limecloud/agent-runtime-ui` current | 只消费 projection state，Subagents 不重算 runtime facts，Artifact/Evidence refs 不读取大 payload。 |
| `packages/agent-app-runtime/projection` | compat adapter | 迁完后不保留第二套 projection owner。 |
| 产品应用 local process component | deprecated | 迁到共享 ProcessTimeline / ExecutionGraph / Subagents surfaces。 |

## 7. 发布验收

| 项 | 命令 / 证据 |
| --- | --- |
| 构建 | `npm run docs:build` |
| 版本 | `package.json`、`package-lock.json` 一致 |
| 更新记录 | `docs/development/updates.md` |
| GitHub Pages | `.github/workflows/deploy.yml` |
| tag / push | 仅在用户明确要求后执行 |

## 8. 完成度口径

| 完成度 | 口径 |
| --- | --- |
| 30% | 文档站骨架和核心概念存在。 |
| 50% | P0 文档齐全，构建通过，导航完整。 |
| 70% | SDK API 草案、fixture、conformance 和迁移表完整。 |
| 85% | Lime 主仓 seed 包实现可被至少一个产品应用消费。 |
| 95% | 四包 seed、SDK reference、refs surface、Agent App seed adoption 和 Content Studio adoption blueprint 完成，但仍缺真实产品主路径 smoke。 |
| 97% | Agent App 主路径已通过真实 Electron smoke 证明复用 runtime-client + projection + React surfaces；Content Studio 仍停留在 adoption blueprint。 |
| 98% | Content Studio 产品 UI 主路径已统一到标准 projection surface，且有边界审计阻止页面直接拼共享 primitives；但 App Server turn 主链仍未抽成标准 session gateway 形状。 |
| 98.5% | Content Studio App Server turn 主链已抽到标准 session gateway 形状，`nextEvent()` 保持 `agentSession/event` notification 合同，sidecar service 已委托 gateway；标准包已发布到 `@limecloud` organization：`@limecloud/app-server-client@1.66.0` 与 `@limecloud/agent-runtime-client@0.1.1`。Content Studio 已固定安装 registry 版 `@limecloud/agent-runtime-client@0.1.1`，并通过 `@limecloud/agent-runtime-client/sessionGateway` 包装现有 gateway；首轮误发的无 scope `app-server-client@1.66.0` 和依赖旧名的 `@limecloud/agent-runtime-client@0.1.0` 只作为 compat-misrelease 记录。GUI smoke 仍未补齐，因此不提升到 100%。 |
| 100% | Content Studio 主路径真实复用 runtime-client + projection + React surfaces，且 Agent App / Content Studio 均有 smoke / contract 证明。 |
