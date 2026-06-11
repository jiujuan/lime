# Agent Workbench 当前迭代任务板

> 状态：active
> 更新时间：2026-06-11
> 目的：把本次 Agent Workbench 迭代拆成可并行认领的窄任务，后续多开进程时以本文件为任务入口。

## 主目标

把 Agent Workbench 从文档站推进成 Lime AgentUI / AgentRuntime 标准指引和实现种子。所有新增实现必须继续向以下 current 主链收敛：

```text
App Server / RuntimeCore / ExecutionBackend
  -> RuntimeEvent / ThreadReadModel / TaskSnapshot / EvidencePack
  -> @limecloud/agent-ui-contracts
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui
  -> Product Apps / Content Studio / Agent Apps
```

外部 AG-UI、AI SDK、OpenAI Agents JS、LangGraph 等只作为参考；不能成为 Lime runtime owner，也不能让产品应用绕开 App Server / RuntimeCore 直接拥有 Provider key 或 runtime facts。

## 当前完成度

| 维度 | 状态 | 证据 |
| --- | --- | --- |
| Workbench P0 文档站 | done | Subagents、SDK、runtime host、read model、provider 文档已补齐，`npm run docs:build` 已通过。 |
| Contracts seed | done | `@limecloud/agent-ui-contracts` 已有 fixtures、validation、完整 `AgentUiSubagentsModel`、subagent / handoff / review scope ids。 |
| Projection replay seed | done | `@limecloud/agent-runtime-projection` 已能 replay contracts fixtures，并输出 `state.subagents`。 |
| React fixture smoke | done | `@limecloud/agent-runtime-ui` 已用 fixture replay state 做 server render smoke，Subagents 只消费 `state.subagents`。 |
| Runtime client conformance | done | `@limecloud/agent-runtime-client/sessionGateway` 已补完整 runtime client conformance，覆盖 lifecycle、read、evidence export、event dispatch / nextEvent、transport error 和 browser-safe 子路径。 |
| App Server facts runner | done | `@limecloud/agent-runtime-projection` 已有纯 App Server facts adapter，可 replay `agentSession/event`、`agentSession/read`、`evidence/export` 到标准 projection。 |
| SDK package README | done | 四包 README 已补 current 包名、生命周期、transport、state/hydration、React surface、conformance、package metadata。 |
| Governance guard | done | 已通过 legacy surface catalog、catalog test、legacy report 和 contract guard 防止非标准树术语、本地 process owner、HostDrawer fallback 回流、provider direct API、第二套 runtime facts 回流。 |
| Artifact / Evidence refs React surface | done | `@limecloud/agent-runtime-ui` 已新增 `ArtifactRefList`、`EvidenceRefList`、`AgentUiRefList`，组合视图输出 refs DOM contract，包级测试通过。 |
| SDK reference completeness | done | Workbench 新增 event families、projection state、transport、provider boundary、callbacks、refs、conformance runner、minimal panel 页面，导航已接入。 |
| Standard package publish gate | done | `@limecloud/app-server-client@1.66.0`、`@limecloud/agent-runtime-client@0.1.1` 已发布到 `@limecloud` organization；无 scope `app-server-client@1.66.0` 和依赖旧名的 `@limecloud/agent-runtime-client@0.1.0` 只作为 compat-misrelease 记录，不作为标准完成证据。 |
| Product app seed adoption | partial | Agent App 真实 Electron 主路径已证明复用标准 `AgentRuntimeClient`、共享 `AgentUiProjectionView` 与 Artifact/Evidence refs；Host action 决策已走 current `respondAction -> agentSession/action/respond`，Host drawer 已成为始终渲染标准 projection 的宿主壳；Content Studio UI 主路径已统一到标准 `AgentUiProjectionSurface`，并已通过 registry 版 `@limecloud/agent-runtime-client@0.1.1/sessionGateway` 包装 App Server turn 主链，GUI smoke 仍待补。 |

整体目标完成度：`98.5%`。口径见 [acceptance.md](acceptance.md)。

## 并行认领规则

1. 开始前先执行 `git status --short`，只读盘点目标写集。
2. 每个进程只认领一个 workstream，不跨写集夹写。
3. 发现目标文件已有未理解改动，停止写入该文件，切只读审阅。
4. `iteration-plan.md` 只追加进度日志，不重写其他进程的历史记录。
5. 修改命令边界、runtime client、App Server host、DevBridge 或 mock 时，必须同时回到 `current / compat / deprecated / dead` 分类。
6. 不主动执行 `git commit`、`git push`、tag、版本发布；这些只在用户明确要求后做。

## Workstream 0：集成协调

| 项 | 内容 |
| --- | --- |
| 状态 | active |
| 推荐负责人 | 单进程 |
| 写集 | `internal/roadmap/agentworkbench/**` |
| 禁止夹写 | `packages/**`、`src/**`、`lime-rs/**` |
| 目标 | 维护本任务板、合并各进程进度、更新完成度口径。 |

验收：

- 每个完成的 workstream 都在 `iteration-plan.md` 增加进度日志。
- `README.md`、`parallel-workstreams.md`、`acceptance.md` 与本文件不冲突。
- 新增任务均有写集、验证命令和 current owner。

## Workstream 1：Runtime Client Conformance

| 项 | 内容 |
| --- | --- |
| 状态 | done |
| 写集 | `packages/agent-runtime-client/**` |
| 前置 | 先盘点该目录 dirty diff；若发现其他进程正在编辑，停止写入。 |
| current owner | `@limecloud/agent-runtime-client` 只拥有 App Server JSON-RPC、Host bridge、events、read APIs、action response、evidence export。 |
| 禁止方向 | 生成 projection state、包含 React、持有 Provider key、直读 App Server DB、内置 mock fallback 作为生产路径。 |

任务：

- 盘点现有 `README.md`、`package.json`、`src/index.ts`、`tests/client.test.mjs`、`src/sessionGateway.ts` dirty diff。
- 补齐 startTurn、subscribeEvents、getThreadReadModel、respondAction、cancelTurn、exportEvidence 的最小 conformance。
- 补 transport error、stream interruption、action response、evidence export 的错误分类测试。
- 文档明确 runtime client 与 projection / react 的依赖边界。

验证：

```bash
npm --prefix packages/agent-runtime-client run test
```

若改动触及 App Server JSON-RPC 方法名、bridge 或 mock 边界，还要运行：

```bash
npm run test:contracts
```

完成证据：

- runtime client 不导出 UI projection state。
- tests 覆盖正常路径和错误路径。
- `iteration-plan.md` 追加日志。

当前证据：

- `packages/agent-runtime-client/src/sessionGateway.ts` 返回完整 `AgentRuntimeClient`，只适配 App Server session gateway，不生成 projection state。
- `packages/agent-runtime-client/tests/client.test.mjs` 覆盖 lifecycle、`exportEvidence`、`dispatchEvent`、`nextEvent`、`drainEvents`、缺 surface fail closed、transport error propagation 和 browser-safe bundle guard。
- `npm --prefix packages/agent-runtime-client run test` 通过。

## Workstream 2：App Server Facts Runner

| 项 | 内容 |
| --- | --- |
| 状态 | done |
| 写集 | 优先 `packages/agent-runtime-projection/**`；如必须接 App Server client，另行认领 `packages/app-server-client/**`。 |
| current owner | App Server / RuntimeCore 输出 facts；projection 只消费 facts 并生成 UI state。 |
| 禁止方向 | 在 projection 内发起 Provider 请求、直读数据库、根据 assistant prose 推断工具或 evidence 状态。 |

任务：

- 定义从 App Server read model / facts export 到 `RuntimeEvent[]` 或 fixture replay 输入的 adapter。
- 支持 snapshot reconciliation、stream repair、大输出 refs、subagent scope ids。
- 添加 replay 幂等测试，覆盖至少 text、tool、hitl、artifact/evidence、subagent handoff。
- 若需要新增 fixture，只放在 contracts 包或 projection test fixture，不在产品应用里私有定义。

验证：

```bash
npm --prefix packages/agent-runtime-projection run test
```

必要时加：

```bash
npm --prefix packages/agent-ui-contracts run test
```

完成证据：

- App Server facts 可进入标准 projection replay。
- projection 不拥有 runtime truth。
- `iteration-plan.md` 追加日志。

当前证据：

- `packages/agent-runtime-projection/src/appServerFacts.ts` 新增 headless adapter，消费 `agentSession/event`、`agentSession/read`、`evidence/export` facts，输出标准 `AgentRuntimeExecutionEvent[]` 和 `AgentUiProjectionState`。
- adapter 不创建 App Server client、不订阅 JSON-RPC、不直读数据库；`waitingAction` 映射为 `action.required` + waiting runtime state。
- `packages/agent-runtime-projection/tests/appServerFacts.test.mjs` 覆盖 text、tool、HITL、artifact/evidence、read model hydration、evidence export 与幂等去重。
- `npm --prefix packages/agent-runtime-projection run test` 通过。

## Workstream 3：Governance Guard

| 项 | 内容 |
| --- | --- |
| 状态 | done |
| 写集 | 优先 `src/lib/governance/**`、相关 contract / governance tests；如新增脚本，必须放 `scripts/<domain>/` 或所属 package。 |
| current owner | 仓库治理 catalog / contract tests 是防回流事实源。 |
| 禁止方向 | 只写文档提醒、不加机械守卫；把 mock fallback 当生产可交付路径。 |

任务：

- 增加或扩展扫描规则，防止非标准树形过程术语作为标准术语回流。
- 防止产品应用新增本地 process component 作为 AgentUI 标准 owner。
- 防止生产路径直连 Provider API 绕开 App Server / RuntimeCore。
- 防止第二套 Agent App runtime facts 与标准 SDK 平级扩张。
- 对允许存在的历史引用标注 `test-only`、`retired` 或 `historical reference`。

验证：

```bash
npm run governance:legacy-report
npm run test:contracts
```

若新增或移动脚本：

```bash
npm run governance:scripts
```

完成证据：

- 旧路被 catalog 或 contract test 机械封住。
- 保留的 compat / deprecated 均有退出条件。
- `iteration-plan.md` 追加日志。

当前证据：

- `src/lib/governance/legacySurfaceCatalog.json` 已登记 `agent-ui-nonstandard-tree-terminology`、`agent-ui-local-process-owner-terminology`、`agent-app-host-drawer-local-process-fallback`、`agent-ui-direct-provider-runtime-surface`。
- `src/lib/governance/legacySurfaceCatalog.test.ts` 断言 AgentUI seed 包不得恢复非标准树术语。
- `scripts/check-app-server-client-contract.mjs` 已对齐当前 `sharedProjectionInput -> buildAgentRunStandardProjectionStateFromState(sharedProjectionInput)` 接线，防止 contract guard 把实现拉回旧参数形状。
- `npm test -- src/lib/governance/legacySurfaceCatalog.test.ts`、`npm run governance:legacy-report`、`npm run test:contracts` 通过。

## Workstream 4：Product App Adoption Blueprint

| 项 | 内容 |
| --- | --- |
| 状态 | partial |
| 写集 | 优先 Workbench 文档：`/Users/coso/Documents/dev/ai/limecloud/lime-agent-workbench/docs/tutorials/**`、`docs/profiles/**`；Content Studio 产品接入另行认领 `/Users/coso/Documents/dev/ai/limecloud/content-studio/src/renderer/src/components/agent/**`、`/Users/coso/Documents/dev/ai/limecloud/content-studio/src/renderer/src/components/agents/**`、`/Users/coso/Documents/dev/ai/limecloud/content-studio/scripts/lime-agent-boundary-audit.mjs`。 |
| current owner | 产品应用只提供业务 context、callbacks、workspace surfaces；runtime facts 来自 runtime client + projection。 |
| 禁止方向 | Content Studio / Agent Apps 自建第二套过程组件、直接拼 Provider params、复制 projection reducer。 |

任务：

- 用 Content Studio Host Provider Runtime PRD 作为第一条 adoption blueprint。
- 写清 Product App 需要提供的 business context、artifact workspace、action callbacks、i18n keys。
- 写清 Product App 不应该拥有的 runtime client、tool state machine、subagent lineage truth。
- 给出迁移表：local process panel -> shared ProcessTimeline / ExecutionGraph / ActionRequired。

验证：

```bash
cd /Users/coso/Documents/dev/ai/limecloud/lime-agent-workbench
npm run docs:build
```

完成证据：

- Workbench 文档能指导 Content Studio 接入共享 AgentUI。
- 未触碰生产代码或已另行登记生产写集。
- `iteration-plan.md` 追加日志。

当前证据：

- `src/features/agent-app/runtime/agentRuntimeClientApi.ts` 把 Agent App `startTask / getTask / cancelTask / submitHostResponse` 适配到标准 `AgentRuntimeClient.startTurn / readThread / cancelTurn / respondAction`。
- `src/features/agent-app/runtime/agentRuntimeAppServerClient.ts` 使用 `@limecloud/agent-runtime-client/sessionGateway` 包装 App Server `agentSession/*` current 方法。
- `src/features/agent-app/ui/AgentRunProjectionPanel.tsx` 渲染共享 `AgentUiProjectionView`，并把标准 action callback 回传宿主。
- `src/features/agent-app/ui/AgentAppRuntimePage.agentRun.test.tsx` 已把 Host action 断言迁到 current `appServerClientMocks.respondAction`，拒绝动作精确点击 action-required 列表内按钮，避免旧 Host response mock 被误当成 current 完成证据。
- `scripts/agent-app/runtime-electron-sdk-fixture-smoke.mjs` 已通过真实 Electron fixture：`Agent Apps` 聚合入口 -> runtime iframe SDK -> App Server current `agentSession/*` -> Host Agent Run 标准 projection DOM。
- `src/features/agent-app/runtime/agentUiProjectionBridge.ts` 已把 App Server artifact replay 的 `evidence:recorded` refs 投影到标准 `EvidenceRefList`。
- `src/features/agent-app/runtime/agentUiProjectionBridge.ts` 已拆出 `agentUiProjectionFieldReaders.ts` 与 `agentUiRuntimeEventAdapter.ts`，主文件从 `1253` 行降到 `895` 行，低于 `1000` 行治理红线；相邻 Agent App projection 回归通过。
- `src/features/agent-app/runtime/agentUiProjectionBridge.ts` 已继续压薄为 `82` 行 normalization facade，projection builders / owner-scope-status mapping 分别进入 `agentUiProjectionBuilders.ts` 与 `agentUiProjectionMapping.ts`；相关文件均低于 `800` 行预警线。
- `src/features/agent-app/runtime/agentUiProjectionBoundary.test.ts` 已补结构守卫，防止 bridge 重新承接 builders / mapping 职责，并机械检查 projection runtime 拆分文件低于 `800` 行。
- `src/features/agent-app/ui/AgentRunHostDrawer.tsx` 已拆出 `AgentRunHostDrawerProjectionInput.ts` 并压薄为标准 projection 宿主壳；主抽屉始终渲染 `AgentRunProjectionPanel`，不再 import 或调用本地 process fallback，标准 projection 负责空态。
- `src/features/agent-app/ui/AgentRunHostDrawerFallback.tsx` 文件仍存在，但已退出主路径，只作为待删除的 `deprecated` residual；物理删除需单独确认。
- `src/features/agent-app/ui/AgentRunHostDrawerBoundary.test.ts` 已补结构守卫，防止主抽屉直接 import 本地 process 组件、fallback 文件或旧条件分支，并要求空态交给标准 projection。
- `/Users/coso/Documents/dev/ai/limecloud/lime-agent-workbench/docs/tutorials/content-studio.md` 已补完整 adoption blueprint，明确 Content Studio owns / does not own、标准 surface 映射、compat 迁移表和 blocked 行为。
- `/Users/coso/Documents/dev/ai/limecloud/content-studio/src/renderer/src/components/agent/AgentUiProjectionSurface.tsx` 已作为产品侧标准 surface adapter，统一组合 `@limecloud/agent-runtime-ui` 的 timeline / facts primitives 与 Content Studio artifact/evidence refs。
- Content Studio `AgentsWorkbench` / `AgentSessionPanel` 已改为消费 `AgentUiProjectionSurface`，不再直接散装组合共享 AgentUI primitives。
- `/Users/coso/Documents/dev/ai/limecloud/content-studio/scripts/lime-agent-boundary-audit.mjs` 已增加边界检查，阻止产品页面绕过标准 surface 直接拼共享 primitives，并检查 `.agent-ui-projection` / `.agent-ui-main` / `.agent-ui-sidecar` DOM contract。
- `/Users/coso/Documents/dev/ai/limecloud/content-studio/src/main/services/appServerAgentRuntimeGateway.ts` 已抽出 `ContentStudioAgentRuntimeSessionGateway`，并通过 `@limecloud/agent-runtime-client/sessionGateway` 的 `createAgentRuntimeClientFromSessionGateway(...)` 包装成标准 `AgentRuntimeClient`；本地 gateway 只保留 `agentSession/start`、`artifact/read` 和 sidecar transport 适配。
- `ContentStudioAgentRuntimeSessionGateway.nextEvent()` 已保持标准 `agentSession/event` notification 形状，内部 turn drain 通过标准 `runtimeClient.nextEvent()` 消费 notification，再由本地 guard 提取裸 `RuntimeEvent`。
- 标准包发布前门槛已通过：`npm --prefix packages/app-server-client run test`、`npm --prefix packages/agent-runtime-client run test`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_fixtures_match_generated_output`、两个 package 目录内的 `npm pack --dry-run --json --ignore-scripts` 均通过。
- `npm view "@limecloud/app-server-client@1.66.0" version` 与 `npm view "@limecloud/agent-runtime-client@0.1.1" version` 已可查询；`npm view "app-server-client@1.66.0" version` 与 `npm view "@limecloud/agent-runtime-client@0.1.0" version` 只作为误发兼容记录。
- [standard-package-release-runbook.md](standard-package-release-runbook.md) 已更新为 scoped registry 发布、Content Studio 接入、GUI smoke 验收和 compat-misrelease 处理证据。

## Workstream 5：React Artifact / Evidence Refs

| 项 | 内容 |
| --- | --- |
| 状态 | done |
| 写集 | `packages/agent-runtime-ui/**`、Workbench runtime-ui docs |
| current owner | `@limecloud/agent-runtime-ui` 只渲染 `state.artifacts` / `state.evidence` 轻量 refs，并通过 callback 交还宿主。 |
| 禁止方向 | 在 React 包里读取 artifact body、导出 evidence pack、推断 review verdict 或复制大 payload。 |

完成证据：

- `packages/agent-runtime-ui/src/refs.tsx` 新增 `AgentUiRefList`、`ArtifactRefList`、`EvidenceRefList`。
- `AgentUiProjectionView` 接入 `onSelectArtifactRef` / `onSelectEvidenceRef` 和 refs labels。
- `packages/agent-runtime-ui/tests/ui.test.mjs` 覆盖 artifact/evidence fixture render 和稳定 DOM contract。
- `npm --prefix packages/agent-runtime-ui run test` 通过。
- `src/features/agent-app/runtime/agentRunProjectionState.ts` 使用 `projectAgentUiState` 生成标准 `AgentUiProjectionState`。
- 定向测试 `agentRuntimeClientApi`、`agentRuntimeAppServerClient`、`agentRuntimeCapabilityHost`、`AgentAppRuntimePage.hostBridge`、`AgentRunProjectionPanel` 已通过。

剩余：

- Content Studio 已安装并接入 `@limecloud/agent-runtime-client/sessionGateway`；`package-lock.json` 解析到 `@limecloud/agent-runtime-client@0.1.1` 与间接 `@limecloud/app-server-client@1.66.0` registry tarball。
- Content Studio 仍缺真实 GUI smoke / 产品回归证据。
- Agent App 本地 process fallback 文件仍存在但已退出主路径；不得再把它接回主抽屉或扩成主展示 owner。
- Agent App 后续新增协议映射必须进入 builders / mapping / field readers 对应边界，不得塞回 `agentUiProjectionBridge.ts`。
- Agent App 主抽屉后续新增 UI 必须继续走标准 projection panel 或独立宿主壳；空态也必须交给标准 projection。

## Workstream 5：SDK React Surfaces Adoption

| 项 | 内容 |
| --- | --- |
| 状态 | done |
| 写集 | `packages/agent-runtime-ui/**`，必要时只读产品应用现有过程组件。 |
| current owner | `@limecloud/agent-runtime-ui` 只消费 projection state 和 command callbacks。 |
| 禁止方向 | React surface 直接订阅 Provider、发 JSON-RPC、持有 runtime facts。 |

任务：

- 固定 MessageParts、ProcessTimeline、ExecutionGraph、ActionRequired、Artifact / Evidence surfaces 的 props contract。
- 把复杂状态分支保留在 projection / selectors，React 测试只覆盖渲染与事件接线。
- 准备产品应用可复用的最小 surface 示例，但不把业务逻辑塞进 UI 包。

验证：

```bash
npm --prefix packages/agent-runtime-ui run test
npm --prefix packages/agent-runtime-ui run typecheck
```

完成证据：

- React surfaces 不再依赖产品本地 runtime state。
- fixture smoke 覆盖核心 surfaces。
- `SubagentsView` 只消费 `state.subagents`，不在组件内重新筛 `graph` / `readModel`。
- `RuntimeFactCard` 输出稳定 `agent-runtime-event` CSS contract。
- `iteration-plan.md` 追加日志。

## Workstream 6：Release Integration

| 项 | 内容 |
| --- | --- |
| 状态 | blocked |
| 阻塞 | 需要用户明确要求版本号、commit、tag、push 或 GitHub Pages 发布。 |
| 写集 | Workbench `package.json`、`package-lock.json`、`docs/development/updates.md`、GitHub workflow；必要时版本 tag。 |
| current owner | GitHub Pages workflow + Workbench package version。 |

任务：

- 只有在用户明确要求后，才更新版本号并发布。
- 发布前运行 docs build。
- 若进入 Lime 主仓版本相关文件，必须按仓库发版规则运行版本一致性检查。

验证：

```bash
cd /Users/coso/Documents/dev/ai/limecloud/lime-agent-workbench
npm run docs:build
```

完成证据：

- 版本、更新记录、构建、tag / push 状态一致。
- 发布行为已由用户明确授权。

## Workstream 7：Standard Package Release / Content Studio Runtime Client Adoption

| 项 | 内容 |
| --- | --- |
| 状态 | in-progress |
| 阻塞 | scoped registry 发布和 Content Studio 依赖接入已完成；剩余阻塞是 Content Studio GUI smoke / 产品回归。 |
| 写集 | 发布阶段优先 `packages/app-server-client/**`、`packages/agent-runtime-client/**`；接入阶段另行认领 `/Users/coso/Documents/dev/ai/limecloud/content-studio/package.json`、lockfile、`src/main/services/appServerAgentRuntimeGateway.ts`、`scripts/lime-agent-boundary-audit.mjs`。 |
| current owner | npm registry 正式包 + Content Studio 标准 runtime-client facade。 |
| 禁止方向 | `file:` / 绝对路径依赖、复制 dist、把 Content Studio 本地 gateway 继续扩成第二套 runtime client。 |

任务：

- 维持 [standard-package-release-runbook.md](standard-package-release-runbook.md) 中的 scoped registry 事实源。
- 保持 Content Studio 固定安装并消费 `@limecloud/agent-runtime-client@0.1.1/sessionGateway`。
- 补 Content Studio GUI smoke / 产品回归。

验证：

```bash
npm view "@limecloud/app-server-client@1.66.0" version
npm view "@limecloud/agent-runtime-client@0.1.1" version
```

Content Studio 接入后再运行：

```bash
npm run verify:lime-agent
npm run test:functional -- --test-name-pattern "Lime Agent 边界审计会阻断 runtime/key/UI 协议回流"
npx tsc --noEmit --pretty false
```

完成证据：

- 两个目标包均可从 npm registry 查询。
- Content Studio lockfile 消费正式 registry 包。
- Content Studio 主路径实际调用 `@limecloud/agent-runtime-client/sessionGateway`。
- `npm run verify:lime-agent`、定向 functional 和 `npx tsc --noEmit --pretty false` 已通过。
- GUI smoke 证明 `.agent-ui-projection` 标准 surface 可运行。

## 当前推荐下一刀

优先级按对整体目标的提升排序：

1. Content Studio GUI smoke / 产品回归。证明 `.agent-ui-projection` 标准 surface 在真实页面中可运行，且边界审计进入常规验证。
2. Agent App 本地 process fallback 物理删除。`AgentRunHostDrawerFallback.tsx` 已退出主路径并有结构守卫防回流；删除文件属于高风险文件系统操作，需要单独确认后执行。
3. 真实 Provider / live evidence。只有在明确授权真实 Provider 后，补 live streaming / evidence 验证；日常回归继续使用 current fixture 和 GUI smoke。

不要优先做发布集成；当前 v0.3.0 / v0.4.0 仍缺 Content Studio 真实产品主路径和必要的收口拆分，发布只能算阶段快照。
