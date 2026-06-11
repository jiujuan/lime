# Lime Agent Workbench 路线图

> 状态：active
> 更新时间：2026-06-11
> 范围：`/Users/coso/Documents/dev/ai/limecloud/lime-agent-workbench` 文档站、Lime AgentUI SDK 标准、AgentRuntime 配合边界、Subagents 标准化。

## 主目标

把 `lime-agent-workbench` 从“参考 AG-UI 的中文文档站”推进成 Lime 内部 AgentUI / AgentRuntime 标准指引，并让后续实现只能向 Lime current 主链收敛：

```text
App Server / RuntimeCore / ExecutionBackend
  -> RuntimeEvent / ThreadReadModel / TaskSnapshot / EvidencePack
  -> @limecloud/agent-ui-contracts
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui
  -> Product Apps / Content Studio / Agent Apps
```

Workbench 不是外部 SDK 套壳，也不是第二套 runtime。外部 AG-UI、AI SDK、OpenAI Agents JS、LangGraph 等只能作为参考；Lime 的事实源仍是 App Server、RuntimeCore、ExecutionBackend、AgentUI Projection、Evidence / Replay / Review 和治理分类。

## 固定结论

1. AgentRuntime 拥有执行事实；AgentUI 只消费 facts 并投影 UI。
2. UI 标准使用 `UIMessageParts`、`ProcessTimeline`、`ExecutionGraph`、ToolGroup、ActionRequired、ArtifactRef、EvidenceRef；不再使用非标准组件树术语。
3. TypeScript 包线拆为四个 current 包，`@limecloud/agent-ui` 只允许作为 future facade。
4. 产品应用不能各自复制过程组件、runtime client、投影 reducer 或工具状态机。
5. `subagents` 必须进入 RuntimeEvent / TaskSnapshot / ExecutionGraph / `AgentUiProjectionState.subagents` 主链，不能靠 assistant 正文或本地 React state 表达。
6. 文档站必须和 Lime 现有代码、路线图、App Server / AgentRuntime / AgentUI 事实源对齐；不能写成外部标准翻译稿。

## 当前阶段

当前处于 `v0.2.x -> v0.4.x` 标准化阶段：

| 阶段 | 状态 | 目标 |
| --- | --- | --- |
| v0.1.0 | done | 建站、发布 GitHub Pages、形成中文文档骨架。 |
| v0.2.0 | done | 去掉非标准树形过程方向，初步对齐 AG-UI / AI SDK / Lime runtime 现实。 |
| v0.3.0 | active | 补齐 Subagents、SDK 包边界、runtime client、projection conformance、Lime 现有实现迁移路线。 |
| v0.4.0 | active | 从文档标准推进到 Lime 主仓包实现、guard、Artifact/Evidence refs surface、Agent App 真实 smoke 和 Content Studio 标准 UI surface adoption。 |

## 阅读顺序

| 文档 | 作用 |
| --- | --- |
| [iteration-plan.md](iteration-plan.md) | 本次迭代目标、缺口、写集和完成判定。 |
| [task-board.md](task-board.md) | 当前迭代可并行认领的任务板、写集、验收和推荐下一刀。 |
| [parallel-workstreams.md](parallel-workstreams.md) | 多进程并行认领方式、每条 workstream 的写集和验收。 |
| [acceptance.md](acceptance.md) | Workbench 标准、SDK、runtime、subagents 的统一验收矩阵。 |
| [standard-package-release-runbook.md](standard-package-release-runbook.md) | 标准 npm 包发布、Content Studio 安装接入和 GUI smoke 的阻塞解除步骤。 |

相关既有路线图：

- `internal/roadmap/agentui/README.md`
- `internal/roadmap/agentruntime/README.md`
- `internal/roadmap/agentruntime/agentui-adoption-gap.md`
- `internal/roadmap/agentruntime/agentruntime-standard-adoption-gap.md`
- `internal/roadmap/agentapp/README.md`

## current / compat / deprecated / dead

### current

- `lime-agent-workbench` GitHub Pages 中文标准站。
- Lime App Server JSON-RPC + RuntimeCore + ExecutionBackend runtime facts。
- `RuntimeEvent / ThreadReadModel / TaskSnapshot / EvidencePack`。
- `@limecloud/agent-ui-contracts`、`@limecloud/agent-runtime-projection`、`@limecloud/agent-runtime-ui`、`@limecloud/agent-runtime-client`。
- Product Apps 通过 runtime client + projection + React surfaces 复用 AgentUI。
- Agent App 运行页通过标准 `AgentRuntimeClient`、`projectAgentUiState` 和 `AgentUiProjectionView` 接入共享 SDK seed。
- Agent App Host action 决策已走 current `AgentRuntimeClient.respondAction -> agentSession/action/respond`；Host drawer 主体只保留抽屉、指标和标准 projection 接线，本地 process fallback / projection 输入增强已拆成独立模块。
- Agent App 真实 Electron 主路径已通过 smoke：`Agent Apps` 聚合入口 -> runtime iframe SDK -> App Server current `agentSession/*` -> Host Agent Run 标准 projection DOM。
- Content Studio `AI agents` 工作台和通用 `AgentSessionPanel` 已统一通过 `AgentUiProjectionSurface` 消费共享 projection read model，并输出 `.agent-ui-projection` / `.agent-ui-main` / `.agent-ui-sidecar` 标准 DOM surface；其 standalone/dev App Server turn 主链已通过 `@limecloud/agent-runtime-client/sessionGateway` 包装为标准 `AgentRuntimeClient`。标准 npm 链路已发布并接入 `@limecloud/app-server-client@1.66.0` 与 `@limecloud/agent-runtime-client@0.1.1`，Content Studio 不能安装误发的无 scope 链路。
- `@limecloud/agent-runtime-ui` 已有 `ArtifactRefList` / `EvidenceRefList`，引用内容由宿主 artifact workspace / evidence pack owner 打开。
- `@limecloud/agent-runtime-ui` 已有 `SubagentsView`，只消费 `state.subagents`。

### compat

- Lime 现有 `packages/app-server-client` 作为 `@limecloud/app-server-client` 的本地开发事实源。
- 未来 `@limecloud/agent-ui` facade 作为非 current 可选聚合入口。
- 产品应用本地 `messages / executionEvents / process panel / host bridge service` 作为迁移缓存；已接入共享 SDK 的页面不得再新增平级本地过程事实源。
- Agent App task event 作为 projection 输入，但必须桥接到标准 event class。

退出条件：facade 明确不导出 runtime transport，产品应用只显式依赖 current 四包后，不再用规划名描述 current owner。

### deprecated

- 每个产品应用自建 Agent 过程组件。
- 从 assistant prose 解析工具成功、artifact 类型、evidence verdict。
- 把 UI component tree 当成 runtime protocol。
- AgentUI React 组件直接订阅 Provider 或读取 App Server DB。

### dead

- 非标准树形过程术语作为 Lime 标准术语或协议。
- 已清退的旧协作 UI surface 作为 current 类型、组件、state 字段或 SDK API。
- 第二套 Agent App runtime facts。
- 业务 App 直连 Provider API 作为生产 Agent 能力。
- 把外部 SDK 作为 Lime runtime owner 直接套用。

## 本轮下一刀

优先补 Lime 主仓与 `lime-agent-workbench` 之间的实现闭环：

1. 补 Content Studio GUI smoke / 产品回归，证明 `.agent-ui-projection` 标准 surface 在真实页面中可运行，并把边界审计纳入常规验证。
2. Agent App projection bridge 已拆成 normalization facade、projection builders、field readers、runtime event adapter 和 mapping helpers；下一步只在标准 projection 空态覆盖足够后下线本地 process fallback。
3. 继续收紧治理 guard，防止非标准树术语、本地 process owner、直连 Provider runtime 和第二套 runtime facts 回流。

## 并行协作规则

多进程并行时，先只读 `git status --short`，再认领窄写集。默认不要多个进程同时编辑同一个文件；如果必须改同一导航文件，先完成内容页，再由一个进程统一接导航。

本路线图目录是并行协作入口。新进程先读 `task-board.md` 认领窄写集，完成后把进度写回 `iteration-plan.md` 的进度日志，避免聊天记录成为唯一状态源。

发布与 Content Studio 接入阶段先读 `standard-package-release-runbook.md`。当前 scoped registry 发布与 Content Studio 依赖接入已完成；后续提升完成度前必须先补 GUI smoke / 产品回归证据。
