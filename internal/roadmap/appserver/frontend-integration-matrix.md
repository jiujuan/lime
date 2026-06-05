# App Server 前端对接矩阵

> 状态：current planning source
> 更新时间：2026-06-06
> 作用：把 App Server JSON-RPC、Electron Desktop Host、前端 API 网关、mock 和真实 UI caller 对齐到同一张表，避免继续出现“后端接口存在，但前端只接 mock / compat”的半闭环。

## 1. 当前结论

当前 App Server 已经具备 protocol / Rust processor / TypeScript client / Electron sidecar 通道的骨架，但前端主 Agent 流程还没有完整切到 App Server current 主链。

事实口径：

1. `packages/app-server-client/src/index.ts` 已列出并实现 App Server method builder / connection helper，覆盖 `agentSession/*`、workspace、skill、model、artifact、evidence 等方法。
2. `electron/appServerHost.ts` 已能启动 sidecar，并提供 `request(...)`、`handleJsonLines(...)`、`drainEvents(...)`。
3. `electron/hostCommands.ts` 已把部分 legacy 前端命令投影到 App Server method，例如 session list/read、workspace、skill、model 和 capability inventory。
4. `electron/ipcChannels.ts` 只把 `app_server_handle_json_lines` / `app_server_drain_events` 作为通用 App Server JSON-RPC IPC 暴露给 renderer。
5. `src/lib/api/appServer.ts` 是 renderer 侧 JSON-RPC client gateway，但当前非测试代码没有把主 Agent UI 接到它。
6. `src/lib/api/agentRuntime/threadClient.ts` 仍通过 `agent_runtime_submit_turn`、`agent_runtime_interrupt_turn`、`agent_runtime_respond_action` 进入 compat 命令面。
7. `src/lib/desktop-host/agentRuntimeMocks.ts` 仍为 `agent_runtime_submit_turn` / `agent_runtime_respond_action` 提供 mock 成功值；因此浏览器或 Electron 未覆盖命令时，主 Agent 流程存在 mock-only 成功风险。

## 2. 状态定义

| 状态 | 含义 |
| --- | --- |
| `wired` | UI 主路径经前端 gateway / Electron host / App Server method 进入真实 sidecar 或 in-process App Server，并有契约或 GUI 证据。 |
| `adapter-wired` | UI 仍调用 legacy 命令名，但 Electron host 已把它同步投影到 App Server current method。 |
| `client-only` | protocol / TS client 存在，但没有真实 UI caller。 |
| `backend-only` | Rust method 存在，但 Electron / 前端 gateway 未接。 |
| `mock-only` | 前端或 desktop-host mock 有返回，但没有真实 host / App Server 证据。 |
| `blocked` | 当前被已知编译、runtime 或并行写集阻塞。 |

## 3. Agent 主路径矩阵

| 用户能力 | App Server method | TS client | Electron host | 前端主 caller | 当前状态 | 下一刀 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始化 / handshake | `initialize` / `initialized` | `AppServerConnection` / `src/lib/api/appServer.ts` | `ElectronAppServerHost.#start()` 自动握手 | 非测试 UI 不直接调用 | `client-only` | 保持为 host 生命周期内部能力；GUI 只需要状态投影。 |
| capability inventory | `capability/list` | `listCapabilities(...)` | `agent_runtime_get_tool_inventory -> METHOD_CAPABILITY_LIST` | Agent runtime inventory client | `adapter-wired` | 补 contract guard，证明 Electron truth adapter 不回退 mock。 |
| session list | `agentSession/list` | `listSessions(...)` | `agent_runtime_list_sessions -> METHOD_AGENT_SESSION_LIST` | `createSessionClient().listAgentRuntimeSessions` | `adapter-wired` | 保留 legacy command 名作为 compat facade，后续改 frontend client 直读 App Server projection。 |
| session read | `agentSession/read` | `readSession(...)` | `agent_runtime_get_session -> METHOD_AGENT_SESSION_READ` | `createSessionClient().getAgentRuntimeSession` / thread read 相关 UI | `adapter-wired` | 确认 read model 是否覆盖 timeline / queued turn / action states。 |
| session start | `agentSession/start` | `startSession(...)` | 通用 JSONL 可达；legacy `createSession` 尚未投影 | Agent session create 仍在 `agent_runtime_create_session` 体系 | `client-only` | 第一竖切内把 create session 或 submit lazy session 纳入 App Server path。 |
| turn start | `agentSession/turn/start` | `startTurn(...)` | 通用 JSONL 可达；`agent_runtime_submit_turn` 未列入 Electron host command | `createThreadClient().submitAgentRuntimeTurn` | `mock-only / client-only` | 第一优先级：新增 App Server turn gateway 或 Electron truth adapter，让主发送按钮走 `agentSession/turn/start`。 |
| turn cancel | `agentSession/turn/cancel` | `cancelTurn(...)` | 通用 JSONL 可达；`agent_runtime_interrupt_turn` 未列入 Electron host command | `createThreadClient().interruptAgentRuntimeTurn` | `mock-only / client-only` | 与 turn start 同一竖切，统一映射 cancel / interrupt 语义。 |
| action respond | `agentSession/action/respond` | `respondAction(...)` | 通用 JSONL 可达；`agent_runtime_respond_action` 未列入 Electron host command | `createThreadClient().respondAgentRuntimeAction` | `mock-only / client-only` | 与 turn start 同一竖切，替换确认/补参响应路径。 |
| streaming event | `agentSession/event` | `AppServerAgentEventRouter` / `drainEvents(...)` | `app_server_drain_events` 可达；Electron event fanout 尚未成为 Agent UI 主路径 | Agent UI 仍消费 legacy runtime events/read model | `partial` | 先接 turn event -> read model 刷新，再做 push fanout。 |
| artifact read | `artifact/read` | `readArtifacts(...)` | 通用 JSONL 可达 | Artifact UI 尚未接 App Server gateway | `client-only` | 跟随 turn event 后接入，避免孤立 artifact API。 |
| evidence export | `evidence/export` | `exportEvidence(...)` | 通用 JSONL 可达 | Harness/evidence UI 仍主要走 agent runtime export command | `client-only` | turn lifecycle 稳定后迁移 evidence gateway。 |

## 4. Workspace / Skill / Model 矩阵

| 用户能力 | App Server method | Electron host adapter | 前端 caller | 当前状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| workspace list/read/default/ensure | `workspace/*` | `workspace_* -> METHOD_WORKSPACE_*` | workspace API / project selector | `adapter-wired` | 这组已接近真实对接，后续补 GUI smoke 证据。 |
| skill list/read | `skill/list` / `skill/read` | `list_executable_skills` / `get_skill_detail` | skill execution gateway | `adapter-wired` | 仍需确认 UI 所需字段与 App Server projection 一致。 |
| workspace skill bindings | `workspaceSkillBindings/list` | `agent_runtime_list_workspace_skill_bindings` | inventory client | `adapter-wired` | 属于 App Server current 事实源，可继续保留 compat 命名 facade。 |
| model list/preferences/sync/provider/catalog/alias | `model*` | `get_model_*` / provider commands -> App Server | model/provider settings 和 runtime init | `adapter-wired` | 需要防止 `aster_agent_init` 继续吞失败后走 mock。 |
| Agent App UI runtime | 无完整 App Server method | Electron host 返回 stopped / failed | Agent App gateway | `mock-only` | 不应作为 App Server 真实对接完成证据。 |

## 5. 第一竖切交付标准

第一竖切只认 `Agent turn lifecycle`，不再用“接口已存在”作为完成依据。

必须同时满足：

1. 前端主发送路径不再直接把 `agent_runtime_submit_turn` 作为唯一事实源；要么经 `src/lib/api/appServer.ts` 调 `agentSession/turn/start`，要么 Electron truth adapter 明确把 legacy facade 投影到该 method。
2. cancel / interrupt 路径同一轮接到 `agentSession/turn/cancel`，不能只接 submit。
3. action respond 路径接到 `agentSession/action/respond`，不能继续只由 mock 返回 `{}`。
4. App Server event 至少能被前端 API 层消费为一次 read model 刷新或 timeline append；初期可以轮询 / drain，不要求一步到位 push fanout。
5. `src/lib/desktop-host/agentRuntimeMocks.ts` 对这条主路径的 mock 只能作为浏览器开发 fallback，不得在 Electron bridge 在线但命令未实现时伪造成功。
6. Contract guard 必须能防止 `agent_runtime_submit_turn`、`agent_runtime_interrupt_turn`、`agent_runtime_respond_action` 在 Electron current 模式下继续成为 mock-only。
7. GUI 证据以 Electron 为准：至少跑 `npm run verify:gui-smoke` 或记录不能运行的环境原因；Rust/TS 单测不能单独证明可交付。

## 6. 下一刀顺序

1. `P3.121`：先补 Agent turn lifecycle 前端 gateway 方案和 contract guard，选择“直接 App Server gateway”或“Electron truth adapter 投影 legacy facade”之一，不再两条路同时长。
2. `P3.122`：把主发送按钮 / cancel / action respond 的 API 调用切到该竖切，并补前端单测。
3. `P3.123`：接 `agentSession/event` 到 read model 刷新或 timeline append，补 Electron GUI smoke。
4. `P3.124`：再迁 artifact/evidence，不提前做孤立 API polish。

