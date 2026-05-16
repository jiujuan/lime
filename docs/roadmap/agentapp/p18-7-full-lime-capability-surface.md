# P18.7 Full Lime Capability Surface

更新时间：2026-05-16

状态：P18.7-A 到 P18.7-E Host first-cut 已落地；标准 v0.6 分层 manifest / `app.runtime.yaml` 兼容、capability discovery、AgentRuntime resource projection、Tool / Integration 受控 intent、内容工厂 Host iframe profile 消费和完整 GUI smoke 已有当前证据。P18.7-F 的最小真实按钮 E2E 已通过：内容工厂 iframe 内“整理知识库”会进入 `lime.agent.startTask`、拿到 Host task id（taskIdSource=hostTaskRunRecord）、启动 models/usage/skills 运行事实拉取和 `lime.agent.streamTask` 订阅；仍需继续推进完成态 artifact / evidence / workspace patch 与逐页面长链路 E2E。

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

状态：first-cut 已落地；Host discovery 和业务 App profile 消费已具备最小路径，仍需补齐更多后端 owner / unavailable reason。

目标：让 App 能通过 `lime.capabilities.getProfile / list / get` 看到 Host 当前能力、实现方式、stage、owner 和 unavailable 原因。

完成标准：

1. Host snapshot / Host Bridge 可投影 catalog 摘要。
2. `lime.capabilities` 不直接暴露 Lime internal path。
3. preview 能力未接线时明确 `enabled=false / implementation=none`。
4. App UI 根据 profile 降级，不自行猜测底层能力。

### P18.7-D：AgentRuntime Resource 能力接线

状态：first-cut 已落地；`lime.models / lime.usage / lime.skills` 可进入 Host runtime facts，深水位模型约束、预算策略和 workspace skill binding 仍需补齐。

优先级：

1. `lime.usage`：从 request telemetry / runtime facts 投影 model、token、cost、budget。
2. `lime.models`：读取模型事实源、路由结果和 capability constraints。
3. `lime.skills`：读取 workspace skill binding、ready 状态、调用证据。
4. `lime.memory` / `lime.context`：读取 session/thread/turn context 与记忆状态，不自动写入。

完成标准：

- 内容工厂的运行过程面板可以展示模型、Token、费用、Skill 使用、上下文状态，且这些事实来自 Host / AgentRuntime projection，不来自 App 自己解析底层事件。

### P18.7-E：Tool / Integration 能力接线

状态：Host first-cut 已落地；执行型能力只返回受控 `requires_agent_task` intent 或只读投影，真实 ToolRuntime / Connector execution gate 仍需后续深水位。

优先级：

1. `lime.search` / `lime.browser`：支撑内容工厂资料补齐、竞品调研、网页来源。
2. `lime.documents` / `lime.media`：支撑 PDF/Word/PPT 解析导出、图片/音频/视频素材。
3. `lime.mcp` / `lime.terminal`：支撑高级工具场景，但必须经过 policy/sandbox。
4. `lime.connectors`：后移到 tenant / secret / Cloud overlay 稳定后。

完成标准：

- App 只能声明 capability intent；实际工具、浏览器、MCP、终端执行继续由 Lime 主 App 管理权限、进度和 evidence。

### P18.7-F：内容工厂产品闭环复核

状态：first-cut 已完成；知识库整理、场景、内容战役、脚本、交付、复盘均已具备 typed Agent task / Host Bridge 主路径和页面内运行现场，外部内容工厂测试已覆盖 Host profile / runtime facts / workspace patch 写回，Lime Host focused smoke 已证明 iframe 内 Host profile 可见。可选深水位 smoke 已证明“整理知识库”真实按钮能进入 `lime.agent.startTask`、拿到 Host task id（taskIdSource=hostTaskRunRecord）、启动 models/usage/skills 运行事实拉取和 `lime.agent.streamTask` 订阅；仍需 Host iframe 内逐个真实业务 AI 动作完成态 E2E 证明。

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
- 内容工厂：`/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 中 `npm test` 通过 56 项，`npm run validate:app` 返回 `ok=true / status=passed`；`npm run readiness:app` 返回 `ok=true / status=needs-setup`，剩余 warning 是 Host 运行前必须满足的 skills / knowledge / tool / artifact / eval / service 绑定。

## 下一刀

进入 P18.7-F 深水位：从已通过的最小真实按钮 E2E 继续往后推进，补 runtimeProcess 中模型 / Token / 费用 / Skill invocation 的真实回写断言，再推进 artifact / evidence / workspace patch 完成态；随后按“生成场景 -> 生成内容 -> 交付 / 复盘”的顺序扩展可选 gate。这些完成前，不把“全部业务 AI 动作均真实闭环”标为完成。
