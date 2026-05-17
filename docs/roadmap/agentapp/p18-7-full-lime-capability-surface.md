# P18.7 Full Lime Capability Surface

更新时间：2026-05-17

状态：P18.7-A 到 P18.7-E Host first-cut 已落地；标准 v0.6 分层 manifest / `app.runtime.yaml` 兼容、capability discovery、AgentRuntime resource projection、`lime.models` 模型约束事实、`lime.usage.getBudget` runtime limit / cost facts、`lime.skills` workspace binding readiness、`lime.memory/context` gate projection、`lime.tasks` App-scoped task observability、Tool / Integration 受控 intent、AgentRuntime `threadRead.tool_calls` 执行证据 first-cut、P18.7-E4 工具 output/progress/evidence refs 只读回写 first-cut、connector authorization request handoff 与 snapshot `task:blocked` 投影 first-cut、Host-managed fixture connector mutation/evidence proof、Cloud Overlay outbox adapter first-cut、outbox evidence projection first-cut 与 Host Bridge handoff、内容工厂 Host iframe profile 消费和完整 GUI smoke 已有当前证据。P18.7-F 的真实按钮 completion E2E 已覆盖“整理知识库 / 生成场景 / 生成内容 / 只重写 / 生成脚本 / 交付 / 复盘”：七个按钮都会进入 `lime.agent.startTask`、拿到 Host task id、启动 models/usage/skills 运行事实拉取和 `lime.agent.streamTask` 订阅，并在 completion-focused gate 中完成 model / usage estimate / cost / Skill invocation / artifact / evidence / workspace patch 回写；20:49 run-scenarios、22:13 run-strategy、22:19 run-review 与 22:33 五动作 full-flow 当前 action gates 也已分别证明页面物化、runtime、Skill、成本、workspace patch 和 no Host fallback；full-flow 仍有 1 条 console error 噪声，不能当作完全干净 GUI smoke。

## 一句话目标

把 Lime 主 App 的所有可复用功能抽象成统一 `lime.* capability surface`，让内容工厂和后续业务 App 在自己的业务工作台内完成完整 AI Agent 流程，同时继续复用 Lime 的 AgentRuntime、Claw 能力、模型路由、Skills、Tools、MCP、浏览器、搜索、媒体、终端、记忆、凭证、策略、Token 用量、Artifact 和 Evidence。

这不是给内容工厂补更多专用 API，而是把 Lime 作为 Agent OS 的能力边界固定下来。

## 背景判断

用户提出的核心问题是：Lime 本身是 Chat UI 形态的 AI Agent 工具，但业务流程很难都塞进 Chat；因此需要在 Lime 之上运行多个业务 App。App 可以很多个，但重点不是“多 App”，而是：

1. 用户应停留在业务 App 的页面、表单、看板和 workflow 内完成工作。
2. App 仍必须获得完整 Lime AI Agent 能力，否则独立 Web / 独立 App 更合理。
3. 完整能力不能等同于模型 API，也不能复制 Claw UI 或 `*_skill_launch` 到每个 App。
4. Lime 主 App 必须把底层能力封装成稳定 capability，App 只消费这些 capability。
5. Lime Experts 保持对话优先的专家模块定位；Agent App 可以包含 `expert-chat` 入口，但完整业务流程必须落在可安装业务工作台内。

新增硬验收：凡是业务 App 页面触发“整理、生成、分析、推荐、复核、导出结论”任一 AI 动作，页面必须真实进入 Lime AgentRuntime，并展示业务化的 AI 运行现场。运行现场至少包含思考、执行、流式输出、Skill、工具、模型、Token、费用、artifact 和 evidence；完成后可以默认折叠，但过程不能在数据层消失。做不到这一点的页面，不算完整 Agent App，要重新设计或下线该 AI 动作。

## 固定边界

| 责任                               | Lime 主 App / AgentRuntime 做                                                  | 业务 App 做                                         | 禁止                                           |
| ---------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------- |
| 业务形态                           | 提供 UI Host、主题、导航、权限、运行过程投影。                                 | 定义业务页面、业务对象、流程阶段、人工确认。        | 把所有业务页面塞回通用 Chat。                  |
| Agent 执行                         | 托管 session/thread/turn/task、队列、模型、上下文、工具、证据。                | 组装 task input、expected output、write-back 目标。 | App 自建第二套 Agent task runtime。            |
| Claw 能力复用                      | 把 `@配图 / @搜索 / @研报 / @PDF / @PPT / @浏览器` 等注册成可复用 capability。 | 声明需要的 capability hint 并消费结构化结果。       | 复制 Claw UI、prompt 分支或 Rust launch 实现。 |
| 模型 / Token / 成本                | 统一模型事实源、provider 能力、路由、usage telemetry、预算策略。               | 展示业务任务成本和降级提示。                        | App 直接保存 provider key 或自己统计 token。   |
| Skills / Tools / MCP               | 管 catalog、workspace binding、runtime gate、Tool Broker、MCP bridge。         | 声明必需 Skill / Tool / MCP capability。            | App 直连 MCP server 或直接运行底层 tool。      |
| 文件 / 搜索 / 浏览器 / 媒体 / 终端 | 管授权、sandbox、执行、审计、artifact/evidence。                               | 提供业务 brief、筛选规则、结果落点。                | App 绕过 policy 调文件系统、浏览器、shell。    |
| Storage / Artifact / Evidence      | namespace 隔离、持久化、导出、provenance。                                     | 定义业务 schema、产物类型、证据类型。               | 聊天文本成为唯一结果或证据。                   |
| Policy / Secrets / Review          | 统一权限、secret ref、企业策略、人工审核。                                     | 解释用途并处理拒绝 / 重试。                         | App 读取 secret 明文或自行做审批绕过。         |

## 单一事实源

| 事实                               | current source                                              | 要求                                                               |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| capability 名称、分组、owner、阶段 | `src/features/agent-app/sdk/capabilityCatalog.ts`           | 新增 `lime.*` 只能先改 catalog。                                   |
| typed invoke contract              | `src/features/agent-app/sdk/capabilityContract.ts`          | 每个 capability 必须有 typed method，未接线也返回 stable error。   |
| SDK facade                         | `src/features/agent-app/sdk/capabilityAdapters.ts`          | `createLimeCoreCapabilityAdapters()` 从 catalog 生成全部 adapter。 |
| readiness profile                  | `src/features/agent-app/readiness/hostCapabilityProfile.ts` | profile 覆盖全部能力，未实现默认 `none`。                          |
| mock / adapter profile             | `mockCapabilityProfile.ts`、`adapterCapabilityProfile.ts`   | 只从 catalog 派生，不再维护平行数组。                              |
| runtime execution                  | AgentRuntime / ToolRuntime / Desktop Host                   | 业务 App 不拥有执行事实源。                                        |
| 产品解释                           | 本文、`capability-sdk.md`、`app-surface-runtime.md`         | 文档必须先说明边界，再做代码接线。                                 |

## 全量能力分层

| 层               | Capability                                                                                                | 当前阶段          | 后端 owner                                    | 说明                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------- | ----------------------------------------------- |
| Host / UI        | `lime.ui`、`lime.events`、`lime.workspace`                                                                | current / preview | Desktop Host                                  | 主题、导航、事件、workspace 上下文。            |
| App data         | `lime.storage`、`lime.files`、`lime.knowledge`、`lime.artifacts`、`lime.documents`                        | current / preview | Desktop / Knowledge / Artifact / Tool Runtime | 业务数据、文件、知识、产物、文档解析导出。      |
| Agent runtime    | `lime.agent`、`lime.workflow`、`lime.automation`、`lime.tasks`                                            | current / preview | AgentRuntime                                  | App-scoped task、workflow、后台 job、任务中心。 |
| Agent resources  | `lime.models`、`lime.usage`、`lime.memory`、`lime.skills`、`lime.context`                                 | preview           | AgentRuntime                                  | 模型路由、成本、记忆、Skill、上下文。           |
| Tool integration | `lime.tools`、`lime.mcp`、`lime.browser`、`lime.search`、`lime.media`、`lime.terminal`、`lime.connectors` | current / preview | ToolRuntime / Cloud Overlay                   | 工具、MCP、浏览器、搜索、媒体、终端、外部连接。 |
| Governance       | `lime.policy`、`lime.secrets`、`lime.settings`、`lime.review`、`lime.capabilities`                        | current / preview | Policy / Desktop Host                         | 权限、凭证、配置、审核、能力发现。              |
| Evidence         | `lime.evidence`                                                                                           | current           | Artifact / Evidence Runtime                   | 来源、评估、发布证据和可审计链路。              |

## 分期计划

### P18.7-A：Catalog / SDK / Profile 收敛

状态：第一刀已完成。

完成标准：

1. `LIME_CAPABILITY_NAMES` 从 catalog 派生。
2. p0 / mock / adapter profile 从 catalog 派生。
3. SDK adapter 按 catalog 生成全部 facade key。
4. `capabilityContract.test.ts` 断言 catalog、contract、profile 不漂移。
5. `capabilityAdapters.test.ts` 断言全部 adapter key 和 method 存在。
6. `publicSdkSurface.test.ts` 固定 SDK-only public surface。

### P18.7-B：文档与标准 v0.6 对齐

状态：已完成当前 v0.6 兼容；不把分层 manifest / runtime contract 新字段静默扩成未治理的生产能力。

完成标准：

1. Agent App 文档承认上游 `/Users/coso/Documents/dev/ai/limecloud/agentapp` 已进入 `manifestVersion: 0.6.0`，并新增 `app.runtime.yaml`。
2. Lime `normalizeManifest` / readiness 明确支持 `0.2 / 0.3 / 0.5 / 0.6`，其他版本继续阻断。
3. v0.6 兼容不应变成“放宽所有字段”；只允许先做 version normalization、capability list、layered manifest、`agentRuntime` 保留和 reference cross-check 复绿。
4. `docs/roadmap/agentapp/README.md`、`capability-sdk.md`、`app-surface-runtime.md` 必须回链本文。
5. `referenceCliCrossCheck.test.ts` 必须兼容 reference CLI 的 capability list 和 `agentRuntime`，并显式登记 discovery / marketplace / compliance / health / runtime policy 等尚未投影字段的退出条件。

### P18.7-C：Host Capability Profile / Discovery Surface

状态：first-cut 已落地；Host discovery、Runtime iframe `getProfile` 和业务 App profile 降级消费均已具备最小路径，仍需在后续补齐更多后端 owner / unavailable reason。

目标：让 App 能通过 `lime.capabilities.getProfile / list / get` 看到 Host 当前能力、实现方式、stage、owner 和 unavailable 原因。

完成标准：

1. Host snapshot / Host Bridge 可投影 catalog 摘要。
2. `lime.capabilities` 不直接暴露 Lime internal path。
3. preview 能力未接线时明确 `enabled=false / implementation=none`。
4. App UI 根据 profile 降级，不自行猜测底层能力。

### P18.7-D：AgentRuntime Resource 能力接线

状态：first-cut 已落地；`lime.models / lime.usage / lime.skills / lime.memory / lime.context / lime.tasks` 可进入 Host runtime facts；模型约束事实源、预算 facts、workspace skill binding readiness、memory/context gate 和 App-scoped task observability 已补 first-cut。后续只在打开真实 mutation / runtime enable 时继续扩展，不再伪造可写、可自动执行或第二套队列。

优先级：

1. `lime.usage`：从 request telemetry / runtime facts 投影 model、token、cost、budget。
2. `lime.models`：读取模型事实源、路由结果和 capability constraints。
3. `lime.skills`：读取 workspace skill binding、ready 状态、调用证据。
4. `lime.memory` / `lime.context`：读取 session/thread/turn context 与记忆状态，不自动写入。
5. `lime.tasks`：读取 App-scoped runtime task 列表和详情；取消/订阅继续回到 `lime.agent` 主链。

完成标准：

- 内容工厂的运行过程面板可以展示模型、Token、费用、Skill 使用、上下文状态，且这些事实来自 Host / AgentRuntime projection，不来自 App 自己解析底层事件。

### P18.7-E：Tool / Integration 能力接线

状态：Host first-cut 已落地；`lime.tools.invoke/getProgress` generic facade 与分项执行型能力只返回受控 `requires_agent_task` intent 或只读投影，并已从 AgentRuntime `threadRead.tool_calls / turns[].tool_calls` 投影 `web_search` 与 `connector__notion__createPage` 的真实运行证据 first-cut；`executionGate / authorizationGate` 已明确 mutation、token、secret 不暴露。P18.7-E1 request envelope 已在 `executionGate.request` 中固定 `capability / method / toolName / action / input / reason / appId / entryKey / taskId / sessionId / policy / idempotencyKey`，并裁剪 secret、provider key、absolute local path、raw OAuth token 和 App 自造 evidence id。P18.7-E2 TS Host first-cut 已复用 `lime.agent.startTask` / `agent_app_runtime_start_task` 主链创建 `agent_app.tool_execution` handoff task，并把 envelope 写入 task input/metadata；`lime_fixture / recordMutation` 已由 Host Bridge 注入 `host_fixture_connector` runtime facts 并进入同一 handoff 主链。P18.7-E3 Rust owner binding first-cut 已让 `agent_app.tool_execution` metadata 强制进入 AgentRuntime full-runtime / `agent_app_tool_execution` tool surface，并由 ToolRuntime permission manager 按 request 生成 session-scoped 默认拒绝 + 请求工具 allowlist；Browser 自动走 `mcp__lime-browser__*` / Browser Assist，Connector 只暴露 exact `connector__<id>__<action>` 与 `secret_binding=host_managed` metadata；Connector preview result 已补 `adapterKind / adapterReadiness / next.required`，可区分 desktop system action surface 与 Cloud Overlay 授权事实；Host Bridge 已把安全 `connectorRuntimeFacts` 写入 `executionGate.request.input`，让 Rust readiness seam 消费真实 Host projection；`connector__lime_fixture__recordMutation` 已补 Host-managed fixture adapter，可在满足 Host-managed 授权 fact 时执行 workspace-local mutation 并返回脱敏 evidence refs。P18.7-E4 cancellation first-cut 已让工具类 `cancel` 在拿到 Agent task id 时回到 `lime.agent.cancelTask` 主链，只有 runId 时返回 canonical next action，不绕 Host Bridge 直杀工具进程；工具执行后的 `threadRead.tool_calls` 现在会把 arguments、output preview、started/finished/updated 时间和 metadata evidence refs 投影给 App task events；`lime.connectors.requestAuth` 已创建 `agent_app.connector_authorization` Host-managed task，connector auth request 会进入 `lime_runtime.runtime_summary` 并在 `agent_app_runtime_get_task` 中投影 `task:blocked` 授权事件，且 raw OAuth token / secret 不出 Host。真实 Connector OAuth/secret delivery 和产品级 non-fixture mutation smoke 仍需后续补齐。

优先级：

1. `lime.tools`：先提供 generic Tool Broker facade 的受控 intent / progress projection，不直接执行工具。
2. `lime.search` / `lime.browser`：支撑内容工厂资料补齐、竞品调研、网页来源。
3. `lime.documents` / `lime.media`：支撑 PDF/Word/PPT 解析导出、图片/音频/视频素材。
4. `lime.mcp` / `lime.terminal`：支撑高级工具场景，但必须经过 policy/sandbox。
5. `lime.connectors`：后移到 tenant / secret / Cloud overlay 稳定后。

完成标准：

- App 只能声明 capability intent；实际工具、浏览器、MCP、终端执行继续由 Lime 主 App 管理权限、进度和 evidence。
- Host Bridge 可以只读展示 AgentRuntime 已产生的 `threadRead.tool_calls` 执行证据，但不能把该 projection 扩写成 App 可直接执行工具。

### P18.7-F：内容工厂产品闭环复核

状态：first-cut 已完成；知识库整理、场景、内容战役、脚本、交付、复盘均已具备 typed Agent task / Host Bridge 主路径和页面内运行现场，外部内容工厂测试已覆盖 Host profile / runtime facts / workspace patch 写回，Lime Host focused smoke 已证明 iframe 内 Host profile 可见。可选深水位 smoke 已证明“整理知识库 / 生成场景 / 生成内容 / 只重写 / 生成脚本 / 交付 / 复盘”七个真实按钮都能进入 `lime.agent.startTask`、拿到 Host task id、启动 models/usage/skills 运行事实拉取和 `lime.agent.streamTask` 订阅，并在 completion-focused gate 中完成 model / usage estimate / cost / Skill invocation / artifact / evidence / workspace patch 回写；20:49 run-scenarios、22:13 run-strategy、22:19 run-review 与 22:33 五动作 full-flow 当前 action gates 已继续提供页面物化和 no Host fallback 的独立通过证据；full-flow 仍有 1 条 console error 噪声，不能当作完全干净 GUI smoke。

完成标准：

1. 内容工厂“整理知识库 / 生成场景 / 生成文案和配套素材 / 只重写文案 / 生成脚本 / 交付包 / 复盘”真实通过 `lime.agent` 进入 AgentRuntime。
2. 运行过程展示来自 Host `runtimeProcess`，完成后折叠但不消失。
3. 使用的模型、Token、费用、Skill、工具、引用、artifact、evidence 均可见。
4. 最终业务结果写回 App storage / artifacts / evidence。
5. 不需要跳回 Lime 通用 Chat，也不直接调用模型 API。
6. standalone 页面只可作为 UI smoke，不可替代 Host iframe 内真实 AgentRuntime 闭环证据。

## v0.6 标准兼容策略

原阻塞事实：外部标准示例 `/Users/coso/Documents/dev/ai/limecloud/agentapp/docs/examples/content-factory-app/APP.md` 已进入 `manifestVersion: 0.6.0`，且 v0.6 通过 `app.runtime.yaml` 声明 Agent task event/result、structured output、approval、session policy、tool discovery、checkpoint 和 observability contract；旧版 Lime 只识别 `APP.md` frontmatter，会漏掉分层文件。当前已完成版本无关 layered manifest resolver 与前端 merge，阻塞解除。

兼容策略：

1. 把 `0.6.x` normalize 成内部 `"0.6"`，继续保留 `0.5` compat，不静默降级为 `0.3`。
2. `supportsManifestRuntime()` 明确支持 `0.6`，并保留 unsupported blocker 给其他版本。
3. `supportsRequestedRange()` 支持 `@lime/app-sdk@^0.6.0` 和 capability list `lime.*` 的当前 profile 匹配。
4. reference cross-check 的 `manifestVersion` 期望应从 reference projection 读取，不再硬编码 `0.3`。
5. v0.6 新字段若尚未进入 Lime projection / runtime policy，必须在 accepted divergences 写清楚退出条件；不能无声丢字段。

落地记录：

- `normalizeManifest()` 将 `0.6.x` 归一化为内部 `"0.6"`，保留 `0.2 / 0.3 / 0.5`，其他版本继续报错。
- `checkReadiness()` 将 `"0.6"` 视为受支持 manifest runtime，并可解析 `@lime/app-sdk@^0.6.0` 形式的 SDK range。
- `referenceCliCrossCheck.test.ts` 兼容 reference CLI `capabilityRequirements.capabilities` 从 object 到 array 的变化；当 reference readiness 不再输出 capability check 时，以 projection capability list 为对齐事实。
- `parseManifest.test.ts` 增加 v0.6 capability list 和 layered manifest 回归，确认 `lime.agent / lime.skills / lime.usage` 被归一化为 `"*"` range，且 `app.runtime.yaml` 能合并为 `agentRuntime`。
- v0.5/v0.6 新增 metadata / discovery / runtime policy 字段未完全进入 Lime projection 的部分，已在 accepted divergences 逐项登记；退出条件是 P18.7-C Host discovery、Agent App runtime policy 和后续 marketplace / cloud release review 正式投影。

## 后端接线顺序

| 顺序 | 先接能力                                        | 原因                                          | 不做                            |
| ---- | ----------------------------------------------- | --------------------------------------------- | ------------------------------- |
| 1    | `lime.capabilities`                             | 让 App 先知道 Host 到底支持什么。             | 不把 catalog owner 下放给 App。 |
| 2    | `lime.usage` / `lime.models`                    | 用户明确要求模型、Token、费用可见。           | 不在 App 内估算 token。         |
| 3    | `lime.skills`                                   | 内容生成必须用 Skills。                       | 不复制 Claw skill launch。      |
| 4    | `lime.search` / `lime.documents` / `lime.media` | 内容工厂最直接需要资料、文档、图片/素材能力。 | 不做内容工厂专用 command。      |
| 5    | `lime.browser` / `lime.mcp` / `lime.terminal`   | 高风险工具先受控接入。                        | 不绕过 sandbox / policy。       |
| 6    | `lime.memory` / `lime.context` / `lime.tasks`   | 提升长期业务连续性和任务中心统一。            | 不做第二套任务队列。            |

## 验收清单

| 要求                          | 证据                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| 全量能力名只有一份事实源。    | catalog 测试断言 `LIME_CAPABILITY_NAMES`、profile keys、adapter keys 一致。                               |
| App 不再自建底层 Agent 能力。 | 内容工厂只调用 SDK facade；无裸模型 API / 私有 bridge / 专用 Tauri command。                              |
| Lime 主 App 封装运行过程。    | `runtimeProcess` 包含 thinking、text、execution、tools、skills、model、usage、cost、artifacts、evidence。 |
| 过程不消失。                  | 终态默认折叠但 timeline 保留。                                                                            |
| 使用 Skills。                 | `lime.agent` task 的 capability hints / skill bindings 可被 Host 投影，调用证据可见。                     |
| 模型和 Token 可见。           | `lime.usage` / `runtimeProcess.usage` 来自 AgentRuntime telemetry。                                       |
| 页面确实 Agent 化。           | 知识库、场景、战役、交付、复盘页面的 AI 动作均构造 typed Agent task；Host connected 时本地生成 API 被硬拒绝。 |
| v0.6 标准兼容。                | `referenceCliCrossCheck.test.ts` 重新通过，不靠跳过；Host / 前端 resolver 能读 `app.runtime.yaml`。          |
| GUI 主路径可交付。            | 定向测试、`typecheck`、`test:contracts`、必要时 `verify:gui-smoke`。                                      |

## current / compat / deprecated / dead

- `current`：`lime.* capability catalog + typed SDK + Host Bridge + AgentRuntime facts`。
- `compat`：现有 mock / adapter / workflow host，可服务 preview 和测试，但只能从 catalog 派生。
- `deprecated`：App 手写 bridge、App 自己解析 runtime 底层事件、各文件自建 capability 数组。
- `dead`：App 裸调用模型 API、复制 Claw UI/skill launch、垂直专用 `content_factory_*` 后端命令。

## 当前验证证据

- Lime Host：2026-05-16 23:05 `npm run verify:gui-smoke` 通过，覆盖 workspace ready、browser runtime、site adapters、Skill Forge entry、runtime tool surface、runtime surface page、`@` command registry、Agent Apps、Claw streaming、Knowledge GUI、Design Canvas。
- Agent Apps：2026-05-16 23:08 增强后的 `npm run smoke:agent-apps -- --timeout-ms 180000 --prefix agent-apps-smoke-p18-7-runtime-frame-profile` 通过，`runtimeFrameContentFactoryLoaded=true` 且 `runtimeFrameHostProfileVisible=true`。
- Agent Apps deep gate：2026-05-16 23:48 `npm run smoke:agent-apps -- --timeout-ms 180000 --prefix agent-apps-smoke-p18-7-content-action-e2e-fixed5 --include-content-factory-action-e2e` 通过；点击内容工厂 iframe 内“知识库底座 -> 整理知识库”后，summary 断言 `contentFactoryActionStarted=true`、`contentFactoryActionTaskAccepted=true`、`contentFactoryActionRuntimeFactsObserved=true`、`contentFactoryActionRuntimeFactsStarted=true`、`contentFactoryActionStreamOrGetTaskStarted=true`、`contentFactoryActionRequiredSkillsProjected=true`、`contentFactoryActionNoHostFallback=true`。当前 task-scoped record 仍显示 `modelLabel=模型等待路由`、`hasUsage=false`、`hasCost=false`、`invokedSkillNames=[]`、`artifactCount=0`，所以完成态仍未覆盖。
- Agent Apps completion gate：2026-05-16 23:55 新增并运行 `npm run smoke:agent-apps -- --timeout-ms 180000 --prefix agent-apps-smoke-p18-7-completion-gate-current --include-content-factory-completion-e2e --completion-timeout-ms 30000`，当前预期失败；failure JSON 明确缺 `modelReady / usageReady / costReady / skillInvocationReady / artifactReady / evidenceReady`，task record 仍是 `active_turn_id=null / profile_status=idle`。
- Runtime root probe：2026-05-17 00:02 针对同一 session 直接查 `agent_runtime_get_thread_read` / `agent_runtime_get_session`，均为 `idle / queued_turns=0 / turns=0 / messages=0`；SQLite 只有 `agent_sessions` 行，无 `agent_thread_turns`、`agent_messages`、`agent_runs`；`agent_runtime_promote_queued_turn(agent-app-queued-{taskId})` 返回 `false`。下一刀应查 `agent_app_runtime_start_task -> submit_runtime_turn -> spawn_runtime_turn_task` 为什么 accepted 后未产生 runtime turn。
- Agent Apps completion-focused gate：2026-05-17 03:12 `npm run smoke:agent-apps -- --timeout-ms 540000 --prefix agent-apps-smoke-p18-7-completion-focused-direct --include-content-factory-completion-e2e --completion-timeout-ms 420000` 通过；summary 为 `.lime/qc/gui-evidence/agent-apps/agent-apps-smoke-p18-7-completion-focused-direct-summary.json`，断言 `contentFactoryCompletionReady=true`，Host task `agent-app-task-29323f7a-54f3-4419-b2f3-d3ccc0734503` / session `agent-app-runtime-9d52d59b-84aa-4780-80dd-c5af942f53fd` 完成，`directRuntimeSnapshot.taskStatus=completed`、`toolCallCount=2`、`artifactCount=1`，completion 七项均为 true：`modelReady / usageReady / costReady / skillInvocationReady / artifactReady / evidenceReady / workspacePatchReady`。
- Agent Apps scenario completion gate：2026-05-17 03:52 `npm run smoke:agent-apps -- --timeout-ms 720000 --prefix agent-apps-smoke-p18-7-completion-run-scenarios-success --include-content-factory-completion-e2e --content-factory-action run-scenarios --completion-timeout-ms 600000` 通过；summary 为 `.lime/qc/gui-evidence/agent-apps/agent-apps-smoke-p18-7-completion-run-scenarios-success-summary.json`，断言 `contentFactoryActionMatches=true`、`contentFactoryCompletionReady=true`，Host task `agent-app-task-c1f33fef-56bb-4082-98d7-0618677f0ebc` / session `agent-app-runtime-15f59fb7-2af8-4ae8-b77a-626e0cad9c88` 完成，completion 八项均为 true：`modelReady / usageReady / costReady / skillInvocationReady / artifactReady / evidenceReady / workspacePatchReady / terminalReady`。该 gate 已收紧为 direct snapshot 必须为成功终态；历史 provider stream decode error 不再被误判为完成。
- Agent Apps production completion gate：2026-05-17 04:17 `npm run smoke:agent-apps -- --timeout-ms 720000 --prefix agent-apps-smoke-p18-7-completion-run-production --include-content-factory-completion-e2e --content-factory-action run-production --completion-timeout-ms 600000` 通过；summary 为 `.lime/qc/gui-evidence/agent-apps/agent-apps-smoke-p18-7-completion-run-production-summary.json`，断言 `contentFactoryActionMatches=true`、`contentFactoryCompletionReady=true`，Host task `agent-app-task-4a72880b-2892-4215-b5f0-96880be802b4` / session `agent-app-runtime-773fb2a9-f91b-4bd7-92b3-e1c153b548fb` 完成，required Skills 为 `article-writer / content-reviewer`，completion 八项均为 true：`modelReady / usageReady / costReady / skillInvocationReady / artifactReady / evidenceReady / workspacePatchReady / terminalReady`。
- Agent Apps rewrite completion gate：2026-05-17 04:59 `npm run smoke:agent-apps -- --timeout-ms 720000 --prefix agent-apps-smoke-p18-7-completion-only-copy --include-content-factory-completion-e2e --content-factory-action only-copy --completion-timeout-ms 600000` 通过；summary 为 `.lime/qc/gui-evidence/agent-apps/agent-apps-smoke-p18-7-completion-only-copy-summary.json`，Host task `agent-app-task-7d1fa5ef-c6c8-4064-ba99-bb052dab9cc0` / session `agent-app-runtime-9ee5737b-28a1-4819-b43e-370b2416547d` 完成，required Skills 为 `article-writer / content-reviewer`，completion 八项均为 true。
- Agent Apps scripts completion gate：2026-05-17 05:03 `npm run smoke:agent-apps -- --timeout-ms 720000 --prefix agent-apps-smoke-p18-7-completion-run-scripts --include-content-factory-completion-e2e --content-factory-action run-scripts --completion-timeout-ms 600000` 通过；summary 为 `.lime/qc/gui-evidence/agent-apps/agent-apps-smoke-p18-7-completion-run-scripts-summary.json`，Host task `agent-app-task-f004ba38-cae1-498b-b793-d457db21bf1a` / session `agent-app-runtime-ff73121d-f5f9-4c15-bcac-93dd380008bc` 完成，required Skills 为 `article-writer / content-reviewer`，completion 八项均为 true。
- Agent Apps strategy completion gate：2026-05-17 05:05 `npm run smoke:agent-apps -- --timeout-ms 720000 --prefix agent-apps-smoke-p18-7-completion-run-strategy --include-content-factory-completion-e2e --content-factory-action run-strategy --completion-timeout-ms 600000` 通过；summary 为 `.lime/qc/gui-evidence/agent-apps/agent-apps-smoke-p18-7-completion-run-strategy-summary.json`，Host task `agent-app-task-3e8d8ba7-070a-47ce-b5c9-fa0338a5e91b` / session `agent-app-runtime-5342296e-f980-4170-a02a-beab59720da3` 完成，required Skills 为 `article-writer / content-reviewer`，completion 八项均为 true。
- Content factory run-strategy current flow：2026-05-17 22:13 隔壁 `content-factory-run-strategy-local-current-after-cross-project-fix-20260517` 通过；summary 为 `.lime/qc/gui-evidence/agent-apps/content-factory-run-strategy-local-current-after-cross-project-fix-20260517-summary.json`，断言 `sameIframeContext / actionCount / allActionsCompleted / allActionsUsedExpectedSkills / allActionsHaveModelUsageCost / allActionsHaveWorkspacePatch / allActionsFullRuntimeReady / processVisibleAfterEachAction / noHostFallback / consoleErrorCount=0` 全通过，direct runtime 为 `taskStatus=completed / profileStatus=completed / artifactCount=1 / toolCallCount=2 / hasWorkspacePatch=true / evidenceReady=true`，模型为 `deepseek-v4-flash`，required Skills 为 `article-writer / content-reviewer`。该证据修复 21:59 并行运行面导致的 run-strategy 页面物化失败，但仍不代表 P18.7-E 真实 Connector OAuth / secret adapter 完成。
- Agent Apps review completion gate：2026-05-17 05:09 `npm run smoke:agent-apps -- --timeout-ms 720000 --prefix agent-apps-smoke-p18-7-completion-run-review --include-content-factory-completion-e2e --content-factory-action run-review --completion-timeout-ms 600000` 通过；summary 为 `.lime/qc/gui-evidence/agent-apps/agent-apps-smoke-p18-7-completion-run-review-summary.json`，Host task `agent-app-task-01957be0-0f4d-40b1-b735-e7098b3f6905` / session `agent-app-runtime-464c50d0-e759-45ca-b48d-027747af3d1c` 完成，required Skill 为 `content-reviewer`，completion 八项均为 true。
- Content factory run-review current flow：2026-05-17 22:19 隔壁 `content-factory-run-review-local-current-20260517` 通过；summary 为 `.lime/qc/gui-evidence/agent-apps/content-factory-run-review-local-current-20260517-summary.json`，同一组 flow 断言全通过，direct runtime 为 `taskStatus=completed / profileStatus=completed / artifactCount=1 / toolCallCount=1 / hasWorkspacePatch=true / evidenceReady=true`，模型为 `deepseek-v4-flash`，required Skill 为 `content-reviewer`。该证据增强 P18.7-F 当前 flow 证据，但仍不代表 P18.7-E 真实 Connector OAuth / secret adapter 完成。
- Content factory full-flow current gate：2026-05-17 22:33 隔壁 `content-factory-full-flow-after-runtime-package-cross-project-fix-20260517` 产出 summary，五个动作 `run-scenarios / run-production / run-scripts / run-strategy / run-review` 的 action gates 均通过，五个 direct runtime snapshot 均为 completed、`artifactCount=1`、`hasWorkspacePatch=true`、`evidenceReady=true`，tool call 数为 `3 / 2 / 2 / 2 / 1`；但 summary 同时记录 `consoleErrorCount=1` 与 17 条 `net::ERR_ABORTED` failedRequests，因此只作为五动作业务 action gate 通过证据，不作为完全干净 GUI smoke 证据。
- P18.7-E Cloud Overlay outbox adapter：2026-05-17 22:54 `cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_connector --lib` 通过，8 tests；覆盖非 fixture cloud connector 在 Host-managed 授权 facts 下写入 `.lime/agent-app-connectors/cloud-overlay/outbox.jsonl` 并返回脱敏 evidence refs。2026-05-17 23:17 追加 `collects_structured_connector_evidence_refs`、`thread_read_should_project_cloud_overlay_outbox_evidence_for_connector_tool_calls`、`test_agent_app_runtime_task_events_project_connector_outbox_evidence`、`agent_app_runtime` 29 tests 与标准 `cargo check` 通过，覆盖 outbox evidence 进入 `threadRead.tool_calls` / Agent App task events，并忽略 redacted placeholder。2026-05-18 00:00 追加 `collects_evidence_refs_from_bounded_tool_output_metadata` 与 read-only replay `.lime/qc/gui-evidence/agent-apps/p18-7-e-runtime-outbox-output-metadata-projection-20260518-summary.json`，让 live ToolRuntime 输出中 `[Lime 工具元数据开始]...` bounded metadata block 内的 `evidenceRefs` 也进入 `threadRead` evidence summary；本轮因 `tauri dev` 持有默认 artifact lock，使用 `CARGO_TARGET_DIR=/tmp/lime-codex-target-p18e` 完成定向 Rust 验证与 `cargo check`。该证据只证明 outbox/evidence 可观测管线，不代表外部 OAuth / Cloud delivery 完成。2026-05-18 00:08 新增 `scripts/agent-app-connector-outbox-smoke.mjs`，并用 `--mode replay` 生成 `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-replay-20260518-summary.json`，把既有 live runtime session 的 outbox evidence 投影复核固化为可重复脚本。2026-05-18 00:13 继续增强 live 模式自动 provider/model 选择，并生成 replay 证据 `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-replay-auto-provider-20260518-summary.json`；2026-05-18 00:22 跑通 focused live runtime smoke `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-live-auto-provider-final-20260518-summary.json`，自动选择 `deepseek/deepseek-v4-flash`，`toolCallCount=1` 且 outbox evidence 同时进入 tool call、thread summary 与 Agent App task events。2026-05-18 00:37 补 Host-managed secret delivery fact seam 并跑通 `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-live-secret-delivery-20260518-summary.json`，显示 `adapterReadiness=host_managed_secret_delivery_adapter_ready / secretDeliveryStatus=ready / credentialMaterialExposed=false / tokenExposed=false / externalStatus=not_delivered`。2026-05-18 00:42 追加 secret-delivery assertion gate，`node --check "scripts/agent-app-connector-outbox-smoke.mjs"` 通过，replay `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-secret-delivery-assertions-replay-20260518-summary.json` 断言 `adapterReadiness / externalStatus / nextRequired / secretDeliveryStatus / credentialMaterialExposed / tokenExposed` 均符合预期。2026-05-18 00:58 追加 Host-managed secret lease fact seam：Rust readiness 现在要求 `secretDelivery.binding/source/target/leaseRef` 与 material/token 不暴露同时成立，`cloud_overlay_outbox` 会把 `secret-lease://connector/...` 句柄写入 workspace-local outbox internal metadata；验证 `agent_app_connector` 11 tests、标准 `cargo check` 与 `node --check` 通过。2026-05-18 01:00 Host Bridge 也会在已完成 `agent_app.connector_authorization` 后注入同一 `secretDelivery` lease fact，`capabilityDispatcher.test.ts` 18 tests 与 `npm run typecheck` 通过。2026-05-18 01:11 继续把同一 lease readiness 投影到 `lime.connectors.getStatus/list`：授权 task 成功时返回 `status=authorized`、App-safe `authorizationRequest.secretDelivery` 与 App-safe `connectorRuntimeFacts.secretDelivery`，未完成授权仍是 `requires_host_authorization`；同一组 TS 回归与 typecheck 通过。2026-05-18 02:06 继续收紧 lease handle 可见性：TS Host Bridge 分出 public/internal request，Rust readiness 优先消费 `agent_app_tool_execution.internalRequest`，Cloud Overlay outbox 文件保留 internal `leaseRef`，但 ToolResult metadata/output、threadRead、Agent App task events 与 focused smoke summary 只暴露 `leaseObserved=true / leaseRefExposed=false / leaseHandleStatus=host_managed`，并新增 `secretDeliveryConcreteLeaseRefNotExposed` smoke assertion；`npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 18 tests、`npm run typecheck`、`CARGO_TARGET_DIR=/tmp/lime-codex-target-p18e cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_connector --lib` 11 tests、同 target `cargo check --manifest-path "src-tauri/Cargo.toml" -p lime --lib --message-format short`、`node --check` 与 `rustfmt --check` 均通过。该证据只证明 outbox/evidence 可观测管线、Cloud worker 后续可消费的 internal lease contract，以及 App/model/public evidence 不暴露 concrete lease handle；不代表外部 OAuth / Cloud delivery 完成。
- P18.7-E threadRead tool evidence：2026-05-17 06:19 `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 通过，13 tests；2026-05-17 06:21 `npm run typecheck` 与 `npm test -- "src/features/agent-app"` 通过，37 files / 203 tests。证据覆盖 Host Bridge 从 AgentRuntime `threadRead.tool_calls / turns[].tool_calls` 投影 `web_search` 和 `connector__notion__createPage` 的 source / input / output，`lime.search.getRun` 可读取 threadRead run，`lime.connectors.list/getStatus/invoke` 可看到 mixed source 的连接器运行证据；仍不打开真实工具 mutation 或连接器授权执行。
- P18.7-E generic tools facade：2026-05-17 06:27 `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 通过，13 tests；2026-05-17 06:29 `npm run typecheck` 与 `npm test -- "src/features/agent-app"` 通过，37 files / 203 tests。证据覆盖 `lime.tools.invoke` 返回受控 `requires_agent_task` intent 并复用 `web_search` runtime/threadRead runs，`lime.tools.getProgress` 可用 invocationId 读取 threadRead run；仍不直接打开 ToolRuntime mutation。
- P18.7-D task observability：2026-05-17 06:34 `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 通过，14 tests；2026-05-17 06:35 `npm run typecheck` 与 06:36 `npm test -- "src/features/agent-app"` 通过，37 files / 204 tests。证据覆盖 `lime.tasks.list/get` 只读投影 App-scoped runtime task，`cancel/subscribe` 指向 `lime.agent.cancelTask/streamTask`，不新增第二套队列。
- P18.7-C 外部 App profile 降级：2026-05-17 06:39 在 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 运行 `npm test` 通过 63 tests，覆盖 `lime.capabilities.getProfile`、0.5/0.6 Host 能力包展示、Host profile 缺少 AI 任务能力时阻止本地模型兜底；`npm run validate:app` 返回 `ok=true/status=passed`，`npm run readiness:app` 返回 `ok=true/status=needs-setup` 且 warning 均为 Host 运行前绑定项。
- P18.7-E gate contract：2026-05-17 06:42 `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 通过，14 tests；2026-05-17 06:45 `npm run typecheck` 与 `npm test -- "src/features/agent-app"` 通过，37 files / 204 tests。证据覆盖 tool intent 的 `executionGate.mutationExposed=false`，以及 connector `requestAuth` 的 `authorizationGate.secretBinding=host_managed / tokenExposed=false / sessionScoped=true`；仍不执行真实 ToolRuntime mutation 或 Connector OAuth/secret binding。
- P18.7-E1 execution request envelope：2026-05-17 07:05 `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 通过，14 tests；2026-05-17 07:07 `npm run typecheck` 通过；2026-05-17 07:07 `npm test -- "src/features/agent-app"` 通过，37 files / 204 tests。证据覆盖 `lime.search.query`、generic `lime.tools.invoke`、`lime.connectors.invoke` 的 `executionGate.request`，包含 policy owner/scope/approval/sandbox/secret binding，并断言 secret、raw OAuth token、absolute local path、App 自造 evidence id 不进入 envelope；仍不执行真实 ToolRuntime mutation，也未接 AgentRuntime task/action handoff。
- P18.7-E2 AgentRuntime handoff first-cut：2026-05-17 07:20 `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 通过，15 tests；2026-05-17 07:21 `npm run typecheck` 通过；2026-05-17 07:22 `npm test -- "src/features/agent-app"` 通过，37 files / 205 tests。证据覆盖 `executionGate.request -> lime.agent.startTask -> agent_app_runtime_start_task` handoff，`agent_app.tool_execution` task input/metadata 均携带 redacted envelope，Host Bridge 仍不直跑工具；真实 ToolRuntime owner binding / Connector OAuth 执行与 evidence 回写仍未完成。
- P18.7-E3 ToolRuntime owner binding first-cut：2026-05-17 07:45 `cargo test --manifest-path "src-tauri/Cargo.toml" agent_app_tool_execution --lib` 通过，2 tests；`cargo test --manifest-path "src-tauri/Cargo.toml" agent_app_runtime_tool_execution --lib` 通过，1 test；`cargo test --manifest-path "src-tauri/Cargo.toml" agent_app_runtime --lib` 通过，23 tests；`npm run test:contracts` 通过。证据覆盖 `agent_app.tool_execution` metadata 会写入 full-runtime/task-mode/tool surface/browser assist hint，task prompt 带 Tool Execution Owner Contract；ToolRuntime permission manager 会按 request 生成 session-scoped 默认拒绝 + `WebSearch` / exact connector allowlist，并确认 connector secret 只保留 `host_managed` metadata、不进入 permission metadata。
- P18.7-E4 cancellation first-cut：2026-05-17 07:53 `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 通过，15 tests；2026-05-17 07:53 `npm run typecheck` 通过；2026-05-17 07:53 `npm test -- "src/features/agent-app"` 通过，37 files / 205 tests。证据覆盖工具类 `cancel` 在传入 `taskId` 时调用 `lime.agent.cancelTask`，并在只有 `runId` 时返回 `requires_agent_task_cancellation` 与 canonical `lime.agent.cancelTask(taskId)` next action；Host Bridge 仍不直接取消终端 / MCP / connector 进程。
- P18.7-E4 tool output/progress/evidence refs 回写 first-cut：2026-05-17 08:12 `cargo test --manifest-path "src-tauri/Cargo.toml" thread_read_should_project_tool_calls_for_profile_consumers --lib` 通过，1 test；`cargo test --manifest-path "src-tauri/Cargo.toml" agent_app_runtime --lib` 通过，23 tests；`rustfmt --check` scoped 通过；`npm run typecheck` 通过；`npm test -- "src/features/agent-app/runtime/agentRuntimeProcess.test.ts"` 通过，5 tests；2026-05-17 08:16 `npm run test:contracts` 通过。证据覆盖 Rust `AgentRuntimeThreadToolCallView` 从 timeline tool call 投影 arguments、output/output_preview、started/finished/updated 时间和 metadata evidence refs，Agent App task events 会把首个 evidence ref、outputPreview 和发生时间带给 App runtime process；仍不代表 Connector OAuth/secret 真实执行已经完成。
- P18.7-E4 connector authorization request handoff first-cut：2026-05-17 08:31 `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 通过，16 tests；`npm run typecheck` 通过；2026-05-17 08:37 `npm test -- "src/features/agent-app"` 通过，37 files / 206 tests；`npm run test:contracts` 通过。证据覆盖 `lime.connectors.requestAuth` 创建 `agent_app.connector_authorization` Host-managed task，authorization envelope 写入 `agent_app_connector_authorization.request` metadata，`secretBinding=host_managed / tokenExposed=false / sessionScoped=true`，并断言 raw OAuth token 不进入 App response 或 startTask payload；仍不代表 Connector OAuth/secret 完整执行或外部平台登录已经完成。
- P18.7-E4 connector authorization snapshot projection first-cut：2026-05-17 08:46 `cargo test --manifest-path "src-tauri/Cargo.toml" connector_authorization --lib` 通过，2 tests；`cargo test --manifest-path "src-tauri/Cargo.toml" agent_app_runtime --lib` 通过，25 tests；`rustfmt --edition 2021 --check` scoped 通过；2026-05-17 08:49 `npm run test:contracts` 通过。证据覆盖 Rust metadata 会把 `agent_app_connector_authorization.request` 安全写入 `lime_runtime.runtime_summary`，并由 `agent_app_runtime_get_task` 投影 `task:blocked` authorization gate；raw OAuth token 不进入 metadata 或 task event payload。
- 内容工厂：`/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 中 2026-05-17 06:39 `npm test` 通过 63 项，`npm run validate:app` 返回 `ok=true / status=passed`；`npm run readiness:app` 返回 `ok=true / status=needs-setup`，剩余 warning 是 Host 运行前必须满足的 skills / knowledge / tool / artifact / eval / service 绑定。

## 下一刀

P18.7 全局 completion audit 已回写到 `p18-7-parallel-validation.md`：A/B/C 已完成 first-cut，D Host resource first-cut 已覆盖，E 已补 generic `lime.tools` facade、threadRead execution evidence、gate contract first-cut、E1 request envelope、E2 AgentRuntime handoff、E3 ToolRuntime owner binding first-cut、E4 cancellation first-cut、tool output/progress/evidence refs 回写 first-cut、Host-managed fixture mutation/evidence proof、Cloud Overlay outbox adapter first-cut、metadata/output 双路径 outbox evidence projection first-cut、focused live runtime smoke harness 与 Host Bridge handoff；仍缺真实 Connector OAuth/raw secret material delivery 与非 fixture 产品级 mutation GUI smoke，F 内容工厂七个真实按钮 completion gate、20:49 run-scenarios / 22:13 run-strategy / 22:19 run-review 当前 GUI flow，以及 22:33 五动作 full-flow action gates 已覆盖；full-flow 仍有 console 噪声。P18.7-E 深水位 execution gate 执行计划见 `docs/roadmap/agentapp/p18-7-e-toolruntime-execution-gate-plan.md`。
2026-05-17 05:45 已补 P18.7-D `lime.usage.getBudget` first-cut：从 AgentRuntime `threadRead.limit_state / cost_state` 投影 `limitStatus / costStatus / estimatedCost / candidateCount / notes`，存在 runtime facts 时返回 `status=observed`。
2026-05-17 05:52 已补 P18.7-D `lime.skills` workspace binding readiness first-cut：从 AgentRuntime request metadata 的 `workspace_skill_bindings` 投影 `ready_for_manual_enable / nextGate / runtimeGate / permissionSummary`；仍不打开 `bind/invoke` mutation，也不把 readiness 误判为已注入 tool surface。
2026-05-17 05:59 已补 P18.7-D `lime.memory/context` gate first-cut：从 AgentRuntime `context_summary` 投影 `memory_budget / retrieval_refs / missing_context / team_memory_refs`，`lime.memory.query` 可命中 context refs；仍不开放 memory write/compact 或 context attach/detach mutation。
2026-05-17 06:06 已补 P18.7-D `lime.models` 模型约束事实源 first-cut：从 AgentRuntime `model_routing / limit_state / cost_state` 投影 selected/requested model、routing mode、decision source/reason、candidate count、fallback chain、capability gap、limit/cost status 和 pricing snapshot。
2026-05-17 06:22 已补 P18.7-E threadRead tool / connector execution evidence first-cut：`capabilityDispatcher` 从 AgentRuntime `threadRead.tool_calls / turns[].tool_calls` 投影 `web_search` 与 `connector__notion__createPage` 的 source / input / output，`lime.search.getRun` 和 `lime.connectors.list/getStatus/invoke` 可读取这些只读运行证据；真实 ToolRuntime mutation / Connector auth execution gate 仍不开放。
2026-05-17 06:29 已补 P18.7-E generic `lime.tools.invoke/getProgress` first-cut：`invoke` 返回受控 `requires_agent_task` intent 并复用现有 tool run projection，`getProgress` 可用 invocationId 读取 AgentRuntime threadRead run；真实 ToolRuntime mutation 仍不开放。
2026-05-17 06:36 已补 P18.7-D `lime.tasks` task observability first-cut：`list/get` 从 Host task store 只读投影 App-scoped task，`cancel/subscribe` 返回 `not_available` 并指向 `lime.agent.cancelTask/streamTask`；不新增第二套任务队列。
2026-05-17 06:39 已复核 P18.7-C 外部内容工厂 profile 降级：`content-factory-app` 通过 `lime.capabilities.getProfile` 展示 0.5/0.6 Host 能力包，Host profile 缺少 AI 任务能力时阻止本地模型兜底；外部 `npm test` 63 项通过，validate passed，readiness needs-setup 仅保留 Host 运行前绑定 warning。
2026-05-17 06:45 已补 P18.7-E `executionGate / authorizationGate` 合同 first-cut：工具 intent 明确 `mutationExposed=false`，连接器授权明确 `secretBinding=host_managed / tokenExposed=false / sessionScoped=true`；真实 ToolRuntime mutation / Connector OAuth/secret binding 执行仍不开放。
2026-05-17 06:50 已新增 P18.7-E 深水位执行计划 `docs/roadmap/agentapp/p18-7-e-toolruntime-execution-gate-plan.md`，明确真实 execution gate 的非目标、分期、写集和验证矩阵；E1 request envelope 已完成，下一刀由 AgentRuntime owner 接 task/action handoff。
2026-05-17 07:07 已补 P18.7-E1 execution request envelope：`lime.search.query`、generic `lime.tools.invoke`、`lime.connectors.invoke` 会在 `executionGate.request` 输出可机器读取的受控请求，并裁剪 secret、provider key、absolute local path、raw OAuth token、App 自造 evidence id；下一刀进入 P18.7-E2 AgentRuntime task/action handoff。
2026-05-17 07:22 已补 P18.7-E2 AgentRuntime handoff first-cut：`capabilityDispatcher` 会把 `executionGate.request` 交给 `lime.agent.startTask`，创建 `agent_app.tool_execution` task，并通过 `AgentRuntimeCapabilityHost` 写入 `agent_app_runtime_start_task` 的 input/metadata。
2026-05-17 07:45 已补 P18.7-E3 ToolRuntime owner binding first-cut：`agent_app.tool_execution` metadata 会强制进入 full runtime / `agent_app_tool_execution` tool surface，并让 ToolRuntime permission manager 按 request 建立 session-scoped 默认拒绝 + 请求工具 allowlist；下一刀进入 P18.7-E4 execution evidence / cancellation 回写与 Connector OAuth/secret 真实执行。
2026-05-17 07:53 已补 P18.7-E4 cancellation first-cut：工具 cancel 可用 Agent task id 回到 `lime.agent.cancelTask`，runId-only 场景只返回 canonical next action；下一刀继续补执行后 tool output / artifact / evidence 回写，以及 Connector OAuth/secret 真实执行。
2026-05-17 08:12 已补 P18.7-E4 tool output/progress/evidence refs 回写 first-cut：`AgentRuntimeThreadToolCallView` 会从 timeline tool call 投影 arguments、output preview、started/finished/updated 时间和 metadata evidence refs，`agent_app_runtime_get_task` 的 task events 会带 `evidenceRef / outputPreview / occurredAt` 给 App。
2026-05-17 08:31 已补 P18.7-E4 connector authorization request handoff first-cut：`lime.connectors.requestAuth` 会把授权 intent 交给 `lime.agent.startTask` 创建 `agent_app.connector_authorization` Host-managed task，并在 request metadata 中保留 `secretBinding=host_managed / tokenExposed=false`；下一刀继续补 Connector OAuth/secret 真实执行和非 fixture 产品级真实 ToolRuntime mutation smoke。
2026-05-17 08:46 已补 P18.7-E4 connector authorization snapshot projection first-cut：Rust 侧会把 connector authorization request 安全写入 `lime_runtime.runtime_summary` 并投影成 App task `task:blocked` 事件；下一刀继续补 Connector OAuth/secret 完整执行和非 fixture 产品级真实 ToolRuntime mutation smoke。
2026-05-17 17:03 已补 P18.7-E Connector adapter readiness seam：ToolRuntime preview tool 在不执行外部 mutation 的前提下返回 `adapterKind / adapterReadiness / next.required`，区分 desktop system connector action surface 与 Cloud Overlay authorized runtime fact；验证 `agent_app_connector_preview` 3 tests passed，真实 Connector OAuth/secret 完整执行仍未完成。
2026-05-17 17:50 已补 P18.7-E Host connector runtime facts envelope：`lime.connectors.invoke` 会把已观测 connector run / 已完成 Host-managed authorization 的安全 facts 写入 `executionGate.request.input.connectorRuntimeFacts`，并随 `agent_app.tool_execution` metadata 进入 Rust seam；验证 `capabilityDispatcher.test.ts` 17 tests passed、`npm test -- "src/features/agent-app"` 41 files / 235 tests passed、typecheck、contracts、标准 Rust manifest cargo check 与 agent_app_runtime / connector preview 定向测试通过，真实 Connector OAuth/secret 完整执行仍未完成。
2026-05-17 21:15 已补 P18.7-E Host-managed fixture connector mutation proof：`connector__lime_fixture__recordMutation` 只有在 Rust seam 同时观测到 `capability=lime.connectors`、Host-managed 授权状态、`secretBinding=host_managed` 与 `tokenExposed=false` 时才执行 workspace-local mutation，写 `.lime/agent-app-connectors/fixture/mutations.jsonl` 并返回脱敏 `evidenceRefs`；验证 `cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_connector --lib` 8 tests passed。该 proof 只证明 ToolRuntime mutation/evidence 管线，不代表外部 OAuth / Cloud Overlay connector adapter 已完成。
2026-05-17 21:31 已补 P18.7-E Host Bridge fixture connector facts handoff：`lime.connectors.invoke` 对 `connectorId=lime_fixture / action=recordMutation` 会注入 `host_fixture_connector` 授权 facts 并创建 `agent_app.tool_execution` task，startTask payload 继续裁剪 fixture token、absolute path 和 App evidence id；验证 `capabilityDispatcher.test.ts` 18 tests passed、`npm run typecheck` 和 `npm run test:contracts` 通过。真实外部 Connector OAuth / Cloud Overlay mutation adapter 仍未完成。

2026-05-17 18:40 已补 P18.7-E Connector readiness 二次校验：Rust seam 不再只凭 `authorizationStatus=authorized` 判定 Cloud Overlay 授权事实，必须同时看到 `capability=lime.connectors`、Host-managed secret binding 和 `tokenExposed=false`；伪造授权状态或通过 generic `lime.tools.invoke` 伪造 connector facts 仍返回 `adapter_not_configured`，避免把 App/模型输入误当作真实 secret binding。验证 `agent_app_connector_preview` 5 tests passed、标准 `cargo check` 和 `test:contracts` 通过。
