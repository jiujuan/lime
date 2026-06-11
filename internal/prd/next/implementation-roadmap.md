# Lime Next 实施路线

> 状态：north-star planning source
> 更新时间：2026-06-07

## 1. 实施原则

1. 先固定事实源，再抽组件。
2. 先完成真实 turn lifecycle，再扩展 polish。
3. 先 headless projection，再 UI primitives，再物理抽包。
4. 先 current 主链，后 compat 退场。
5. 先定义 sandbox / permissions，再定义 remote gateway 和基础设施 ports。
6. Redis / Postgres / S3 / Queue / Docker / Kubernetes 等只能在 sandbox 边界之后作为 adapter 或 worker 承载选项出现。
7. 每一刀都必须提高 App Server / RuntimeCore / AgentRuntime UI / 多端复用的主线完成度。

## 2. 阶段总览

| 阶段 | 目标 | 关键产物 | 退出条件 |
| --- | --- | --- | --- |
| N0 | 北极星冻结 | `internal/prd/next/*` | 产品、架构、前端共享、治理口径明确。 |
| N1 | App Server 主链实证 | Claw turn lifecycle 真实 GUI E2E | 发送、streaming、event refresh、read model 回流可证。 |
| N2 | Projection 标准化 | `AgentEvent/readModel -> AgentRuntimeViewModel` | Claw 可通过 projection 渲染核心 timeline。 |
| N3 | UI primitives 内部复用 | message/timeline/tool/action/artifact/evidence 组件候选 | 组件不依赖 host，单测覆盖状态。 |
| N4 | Agent App 对话复用 | Agent App turn 进入 `agentSession/*` | 不靠 UI runtime 生命周期伪造对话完成。 |
| N5 | content-studio 试点 | Electron main client + businessObjectRef | 内容业务对象内完成最小 Agent flow。 |
| N6 | Sandbox / Permissions PRD | permission profile、FS / network policy、approval、exec policy、sandbox backend | 客户端和服务端都有统一执行安全模型。 |
| N7 | Remote Runtime Gateway PRD | auth / tenant / sandbox profile / event / action / artifact gateway | 移动 App / 小程序 / 消息渠道有统一服务端入口设计。 |
| N8 | 服务端基础设施 ports | Cache / DB / ObjectStore / Queue / Secret / Observability ports | RuntimeCore 不依赖 Redis / S3 / Postgres / Docker / Kubernetes。 |
| N9 | 移动 App / 小程序原型 | action 审批、session 查看、artifact preview | 轻端只通过 Remote Gateway 消费 projection。 |
| N10 | 物理抽包 | projection / primitives package | 两个真实消费者复用，props 合同稳定。 |
| N11 | compat 退场 | legacy agent runtime glue 逐步删除 | 守卫能阻止旧入口回流。 |

## 3. 下一刀排序

当前最高杠杆顺序：

1. **完整 Claw streaming GUI E2E**：证明 `agentSession/turn/start -> event -> read model` 主链真实可用。
2. **Projection 标准化**：把当前 Claw timeline / runtime status 的事实解释收敛成 headless view model。
3. **Agent App 对话 turn fixture**：证明 Agent App 不只启动 UI iframe，而是能复用 `agentSession/*` 对话主链。
4. **content-studio client 试点**：接入 app-server-client、sidecar lifecycle 和 businessObjectRef。
5. **Sandbox / Permissions PRD**：把 permission profile、filesystem / network policy、approval、exec policy、client / server sandbox backend 写清楚。
6. **Remote Gateway / Server Mode PRD**：把认证、租户、sandbox profile、事件订阅、action 幂等、artifact 安全预览、基础设施 ports 写清楚。
7. **UI primitive 候选拆分**：只拆已经被 projection 喂数且无 host 依赖的组件。

## 4. N1：App Server 主链实证

目标：

1. Claw 真实发送进入 `agentSession/turn/start`。
2. 真实事件进入 `agentSession/event`。
3. 前端能刷新 read model。
4. 终态不由 UI 猜测。
5. 本地 tool attempt 能追溯 active permission profile。

退出条件：

1. live provider 授权下运行完整 Claw streaming GUI E2E。
2. 未授权时 smoke fail closed，不用 mock 代替。
3. 证据记录真实 App Server method、事件、read model 回流和本地 sandbox / approval 摘要。

## 5. N2：Projection 标准化

目标：

1. 定义 `AgentRuntimeViewModel`。
2. 将 message、timeline、tool、action、artifact、evidence、runtime status 投影从 React 挂载逻辑中抽出。
3. 保持 Claw UI 行为不变。

退出条件：

1. projection 有单测。
2. Claw 组件只消费 ViewModel。
3. projection 不 import host / bridge / client。
4. 终态规则由测试锁住。

## 6. N3：UI Primitives 内部复用

目标：

1. 从 Claw 中识别无 host 依赖组件。
2. 用 props / callbacks 收口组件边界。
3. 不发布包，只在仓库内按共享合同写。

退出条件：

1. 组件无 `safeInvoke` / Electron / legacy command 依赖。
2. 状态覆盖完整。
3. 至少一组组件可在测试 fixture 中脱离 Claw shell 渲染。

## 7. N4：Agent App 对话复用

目标：

Agent App 不只复用 UI runtime start/status/stop，而是复用 Agent turn runtime。

退出条件：

1. task facade 携带 `RuntimeOptions.hostOptions.asterChatRequest` 和 `turn_config`。
2. turn 经 `agentSession/turn/start` 进入 RuntimeCore。
3. turn 携带 active permission profile，工具执行不绕过 Sandbox Manager。
4. `agentSession/event`、`agentSession/read` 和 evidence 回流可验证。
5. UI iframe 证据不能替代对话 runtime 证据。

## 8. N5：content-studio 试点

目标：

让 content-studio 成为第一个外部业务 App 试点。

退出条件：

1. Electron main 使用 `app-server-client`。
2. sidecar binary 从 manifest / resources 解析。
3. renderer 只通过 preload IPC 消费 projection。
4. session 绑定 businessObjectRef。
5. 最小内容任务可触发 Agent turn。

## 9. N6：Sandbox / Permissions PRD

目标：

1. 定义 `PermissionProfile`、filesystem policy、network policy、approval policy、exec policy 和 secret scope。
2. 定义 `SandboxManager`、local sandbox backend、server worker sandbox backend 和 audit 事件形态。
3. 明确客户端本地 sandbox 与服务端 worker sandbox 的差异。
4. 明确 Docker / Kubernetes 只是 worker isolation / scheduling backend，不是 permission model。

退出条件：

1. 每个 turn / tool attempt 都能追溯 active permission profile。
2. denied-read、protected metadata、network deny、secret ref 都 fail closed。
3. 客户端和服务端 sandbox backend 的最小矩阵明确。
4. ToolRuntime / ExecutionBackend 不能绕过 Sandbox Manager。

## 10. N7：Remote Runtime Gateway PRD

目标：

1. 定义移动 App、微信小程序、消息渠道和 Web Console 的统一远程入口。
2. 映射 `agentSession/*`、`artifact/read`、`evidence/export` 和 `capability/list` 语义。
3. 明确认证、租户、sandbox profile、capability policy、事件订阅、断线恢复和 action 幂等。

退出条件：

1. 不新增第二套 runtime facts。
2. 小程序和移动端不直连本地 sidecar。
3. secret、OpenID、push token 只作为 gateway 上下文，不进入 RuntimeCore facts。
4. gateway 发起的 turn 必须携带 tenant / app / user scoped sandbox profile。

## 11. N8：服务端基础设施 Ports

目标：

1. 定义 `CachePort`、`DatabasePort`、`ObjectStorePort`、`QueuePort`、`WorkspacePort`、`SecretPort`、`ObservabilityPort`。
2. 为客户端和服务端分别定义 adapters。
3. 服务端 adapters 可选 Redis、Postgres、S3 / OSS、Queue、Secret Manager、OpenTelemetry。
4. Worker 承载可选 Docker / Kubernetes / container / namespace / VM / microVM，但必须在 Sandbox Manager 之后。
5. 以 [client-server-infrastructure.md](./client-server-infrastructure.md) 作为 port / adapter 边界事实源。

退出条件：

1. RuntimeCore 不直接 import Redis / Postgres / S3 / Docker / Kubernetes 或云 SDK。
2. Artifact / Evidence 通过 object ref / summary / contentStatus 暴露。
3. 服务端长任务有 sandbox profile、queue、worker、event store 和 observability 设计。
4. 客户端 adapter 与服务端 adapter 可以独立替换，移动 App / 小程序只经 Remote Gateway 消费 projection。

## 12. N9：移动 App / 微信小程序原型

目标：

1. 移动 App 原型覆盖 session 查看、action 审批、artifact preview。
2. 微信小程序原型覆盖登录绑定、预定义 capability 触发、任务状态查询。
3. 两者都复用 headless projection 或其端侧 port。

退出条件：

1. 端侧不持有 provider secret。
2. 端侧不自建 AgentRuntime。
3. action respond 经 gateway 做身份和幂等校验。
4. artifact / evidence 只展示安全预览。
5. 端侧审批只作用于受控 approval scope，不直接修改 sandbox profile。

## 13. N10：物理抽包

触发条件：

1. Claw 和第二个真实 App 同时使用同一 projection。
2. 至少一组 primitives 被两个 shell 使用。
3. package 不暴露 Claw shell。
4. 本地化、主题、CSS scope、测试策略明确。

建议包边界：

```text
@limecloud/agent-runtime-client
@limecloud/agent-ui-contracts
@limecloud/agent-runtime-projection
@limecloud/agent-runtime-ui
```

命名最终以仓库已落地四包为准。`@limecloud/agent-runtime-projection` 和 `@limecloud/agent-runtime-ui` 是 canonical package names；早期讨论名 `@limecloud/agent-ui-projection`、`@limecloud/agent-ui-react` 不再新增为平行包、workspace alias 或发布包，避免 projection 与 React primitives 出现两套 API 面。新增包默认不加品牌前缀，除非对外发布品牌生态需要。

2026-06-09 current 落地状态：

1. `@limecloud/agent-runtime-client` 是标准 Runtime client facade。它只 re-export / 委托 `app-server-client` 中的 current App Server JSON-RPC runtime surface，不新增协议，不触碰 legacy desktop facade，不伪造 `readTask`。
2. `@limecloud/agent-ui-contracts` 是类型事实源，包含 execution event、read model、message parts、process timeline、execution graph、projection state 和 projector interface。
3. `@limecloud/agent-runtime-projection` 提供 `projectAgentUiState`、`createAgentUiProjector` 等纯投影函数，并 re-export contracts 类型以兼容旧调用。旧 `projectAgentRuntimeReadModel` 保留为兼容事实栏入口。
4. `@limecloud/agent-runtime-ui` 提供 `AgentUiProjectionView`、`UIMessagePartsView`、`ProcessTimelineView`、`ExecutionGraphView`、`ToolGroup`、`ActionRequiredList`，直接消费 contracts / projection state。旧 `AgentTimeline` / `RuntimeFactsPanel` 保留为兼容 primitives。
5. `app-server-client` 仍是底层 App Server JSON-RPC 与 sidecar lifecycle client；`AgentRuntimeClient` facade 落在这里，`@limecloud/agent-runtime-client` 只作为对外标准包入口。
6. Agent App Host Drawer 已把运行过程 view model 切到 `AgentUiProjectionState -> Agent App view model`，并保留本地 artifact / evidence / action 业务卡片作为宿主扩展层；旧组件目录 projection 类型只作为迁移输入适配来源，不再是该入口的最终 read model。
7. 公共 Agent UI adapter event 类型已迁到 `@limecloud/agent-ui-contracts`；主聊天旧 projection 文件只 re-export 这些公共类型并继续保留自己的投影构建逻辑，作为后续分批迁移来源，而不是新的类型事实源。
8. 前端 `src/lib/api/agentRuntime/threadClient.ts` 的 turn lifecycle 已可消费标准 `AgentRuntimeClient` facade：`submit / cancel / respond / read` 先从旧 UI 请求 shape 投影为 App Server current 参数，再委托 `startTurn / cancelTurn / respondAction / readThread`。该文件仍是迁移期 compat gateway，负责旧 DTO、事件路由、read model 投影、file checkpoint / queue / compact / replay 等尚未进入标准 client 的业务面，不允许继续扩展成第二套 runtime SDK。
9. 根依赖、TypeScript paths 与 Vite alias 已接入 `@limecloud/agent-runtime-client`，避免标准包只停留在 package 目录而无法被前端 current 网关消费。
10. `@limecloud/agent-runtime-projection` 已承接 host-neutral 的 Agent UI projection event index / scope selector / latest selector。主聊天 `conversationProjectionStore` 只保留本地 external store、stream diagnostics 和兼容导出名，事件筛选与索引不再在主聊天目录内作为公共事实解释继续扩展。
11. `@limecloud/agent-runtime-projection` 已承接 host-neutral 的 Agent UI summary selectors：事件类型分组、action / task / artifact / evidence / diagnostics 计数、notable latest events、Subagents surface / lane 聚合和 artifact latest lookup。主聊天 `agentUiProjectionSummary.ts` 只保留本地化 label、展示文案 formatter 和兼容导出名，不再作为这些 selector 的事实源。
12. `internal/aiprompts/agent-ui-runtime-standard.md` 已成为四包职责、宿主接入、App Server runtime 配合、主聊天 projection 迁移分类和守卫要求的集中事实源；后续改标准包或主聊天 projection 前应先读该文档。
13. `scripts/check-app-server-client-contract.mjs` 已守住标准包名入口，扫描根依赖、lockfile、TypeScript paths、Vite alias 和 `packages/*/package.json`，防止早期讨论包名回流成新的物理包或 alias。
14. Agent App Runtime 已作为第二个真实宿主基线消费标准 projection：`agentRunProjectionState.ts` 从 host run state 生成标准 `AgentUiProjectionState`，`AgentRunProjectionPanel.tsx` 直接渲染 `AgentUiProjectionView`，宿主 summary / action callback / artifact presentation 保留在 Agent App adapter 层。

退出条件补充：

1. 新 Agent UI 页面默认走 `AgentRuntimeClient -> projectAgentUiState -> AgentUiProjectionView`，中间的 execution events 适配由宿主边界负责。
2. 不允许把组件本地树或 UI 本地状态定义成 runtime fact source。
3. `readThread` 当前映射 `agentSession/read`；独立 `readTask` 只能等 App Server current method 出现后再接入。
4. 至少两个真实宿主复用 `@limecloud/agent-ui-contracts`、`@limecloud/agent-runtime-projection` 与 `@limecloud/agent-runtime-ui` 后，才能继续收缩旧主聊天专用 projection / UI 壳。
5. 主聊天目录不得重新实现标准 projection selector；新增 host-neutral selector 必须先进入 `@limecloud/agent-runtime-projection`，宿主只做本地化、交互路由和业务卡片适配。
6. 标准包实现不得重新合并为单文件；`@limecloud/agent-runtime-projection` 的 `index` 只能做 barrel exports，具体实现必须按 contracts / eventStore / summary / readModel / uiState 等职责拆分。
7. `@limecloud/agent-runtime-ui` 的 `index.ts` 只能做 barrel exports；React primitives 必须按 types / labels / messages / processTimeline / executionGraph / runtimeFacts / projectionView 等职责拆分。
8. `@limecloud/agent-ui-projection`、`@limecloud/agent-ui-react` 只能作为历史讨论语义出现在路线图或标准说明中，不得进入依赖、paths、alias 或 workspace package。
9. 第二宿主复用不再以“拼几个 primitives”为合格证据；至少一个非主聊天宿主必须直接渲染 `AgentUiProjectionView`，并由测试锁住 `.agent-ui-projection`、`.agent-ui-main`、`.agent-ui-sidecar`。

## 14. N11：compat 退场

目标：

1. `agent_runtime_*` 不再作为正向完成证据。
2. legacy desktop facade 只保留可证明需要的兼容委托。
3. mock fallback 只存在于测试夹具。
4. governance report 能发现旧路回流。

## 15. 完成判定

Lime Next 不是某个文件夹完成，而是满足：

1. 至少两个 App 通过 App Server 复用同一 Agent turn runtime。
2. 至少两个 App 复用同一 headless projection。
3. Claw 旗舰体验不退化。
4. Agent Apps 不自建 runtime。
5. content-studio 不直接依赖 Lime 内部 Rust workspace。
6. 移动 App / 小程序通过 Remote Runtime Gateway 消费 runtime，不直连 sidecar。
7. 客户端和服务端执行链都通过 permission profile、Sandbox Manager、approval / escalation 和 audit。
8. 服务端模式通过 ports / adapters 接入 Redis / Postgres / S3 / Queue / Docker / K8s / Secret / OTel。
9. legacy desktop command glue 有明确退出条件和守卫。
