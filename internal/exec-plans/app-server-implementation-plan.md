# App Server 实施计划

> 状态：进行中
> 更新时间：2026-06-05
> 主路线图：`internal/roadmap/appserver/README.md`
> 参考实现：`/Users/coso/Documents/dev/rust/codex/codex-rs/app-server*`
> 当前阶段：`P3.82 npm client schema manifest consumption completed`

## 1. 当前目标

把 Lime Agent Runtime 的服务化路线从规划推进到可运行骨架：

```text
App Client
  -> app-server-client / transport
  -> app-server
  -> RuntimeCore
  -> ExecutionBackend
  -> AsterBackend / future backends
```

本计划是长任务执行事实源。后续每一刀都必须更新状态、验证和退出条件。

## 2. 参考 Codex 的范围

只参考 Codex 的工程分层，不复制业务协议：

| Codex 参考 | Lime 对应 |
| --- | --- |
| `app-server-protocol` | `app-server-protocol` |
| `app-server-transport` | `app-server-transport` |
| `app-server` | `app-server` |
| `app-server-client` | `app-server-client` |
| `app-server-daemon` | `app-server-daemon` |
| `app-server-test-client` | `app-server-test-client` |
| `JSON-RPC over stdio` | P1 首选 transport |
| `initialize -> initialized` 门禁 | P1 必做 |
| `<resource>/<method>` | Lime 协议命名规则 |
| schema / fixture / contract tests | P1-P2 验证方向 |

不参考：

1. 不复制 Codex 的 `thread/turn/item` 业务对象。
2. 不引入 Codex 账号、插件、远控等产品面。
3. 不把 App Server 绑定到某个单一 App。

## 3. 事实源分类

| 分类 | 对象 | 说明 |
| --- | --- | --- |
| `current` | `internal/roadmap/appserver/*` | App Server 产品和架构事实源。 |
| `current` | `internal/exec-plans/app-server-implementation-plan.md` | 当前实施进度事实源。 |
| `current` | `lime-rs/crates/app-server-protocol` | App Server wire DTO 和 JSON-RPC 基础类型。 |
| `current` | `lime-rs/crates/app-server-transport` | App Server transport 边界，P1 先承接 stdio JSONL。 |
| `current` | `lime-rs/crates/app-server` | App Server 进程、router 和 request processor。 |
| `current` | `lime-rs/crates/app-server-client` | 独立 App 和后续 Desktop adapter 复用的 client。 |
| `current` | `lime-rs/crates/app-server-daemon` | 本地 server 生命周期与共享连接管理。 |
| `current` | `lime-rs/crates/app-server-test-client` | 协议 / transport 调试和 fixture 驱动客户端。 |
| `current target` | `RuntimeCore` | 公共 session/thread/turn/task/run/action/event/artifact/evidence 事实源。 |
| `current target` | `ExecutionBackend` | Aster 和未来后端的统一适配接口。 |
| `current target` | `AsterBackend` | 对现有 Aster runtime 的首个 backend adapter。 |
| `current target` | `RuntimeQueueEventPort` | queue service 事件出口的 host port，后续替换 Tauri event bus。 |
| `current target` | `AppServerRuntimeQueueEventPort` | Desktop in-process App Server 的 direct event bridge，优先把 runtime event 写入 App Server read model / outbound notification。 |
| `current target` | `RuntimeTurnHostContext` | runtime turn 执行链的 Desktop host context，后续继续拆成可替换 host ports。 |
| `current target` | `RuntimeCompactionEventPort` | compaction direct event 与 terminal event queue/projection 的 host port，后续替换 Tauri event bus。 |
| `current target` | `RuntimeTimelineEventPort` | side-event timeline persist / request_user_input 的 host port，后续替换 Tauri timeline recorder bridge。 |
| `current target` | `RuntimeStreamTimelineEventPort` | stream runtime event timeline persist 的 host port，后续替换 Tauri timeline recorder bridge。 |
| `current target` | `RuntimeMemoryCapturePort` | runtime turn 后台记忆沉淀的 host port，后续替换 `AppHandle.state::<ContextMemoryServiceState>()` 直接查找。 |
| `current target` | `CapabilityInventorySource / CapabilitySource / CapabilityListContext` | App Server capability discovery 的 host-independent inventory 与 source 边界；`appId/workspaceId/sessionId` 从 JSON-RPC params 进入 source context，`sessionId` 存在时由 `RuntimeCore` 以已存 session 的 app/workspace scope 为权威上下文，record 可按 app/workspace/session scope 过滤；`cursor/limit` 由 RuntimeCore 对 source 输出做稳定分页；Desktop adapter 已把 current tool catalog 与动态 runtime inventory snapshot 中的 visible runtime / MCP / extension tools 映射成 `CapabilityInventoryRecord`；可执行 capability 的方法事实统一由 `CapabilityInventoryRecord::executable_agent_turn(...)` 与 `capability_descriptor_allows_agent_turn_start(...)` 表达；Desktop adapter 已把 `workspace_skill_runtime_enable` 的 session-scoped manual enable projection 接入 `CapabilitySource::prepare_turn_capabilities(...)`，只有明确 session/app/workspace scope 且状态为 executable 的 fact 才会生成 `agentSession/turn/start` capability，discovery-only 只保留 `capability/list`，blocked/denied 不投影；Desktop adapter 已通过 `WorkspaceManager::get()` 把非绝对 session `workspaceId` 显式解析为 workspace root 后再调用 P3E resolver，解析失败或 metadata root 不匹配时不投影 executable，避免把数据库 id 猜成 filesystem root。后续继续把真实 app policy source 接入该 seam。 |
| `compat` | Tauri command glue | 迁移期继续服务 Lime Desktop，但只允许逐步退回 adapter。 |
| `deprecated` | 壳层内继续新增 runtime 业务逻辑 | 不允许新增，只能下沉。 |

## 4. 阶段计划

### P0：路线图冻结

状态：`done`

已完成：

1. 新增 `internal/roadmap/appserver/` 文档系列。
2. 固定 JSON-RPC / stdio / service facade / 多 App 复用路线。
3. 修复 Mermaid sequenceDiagram 的保留词 alias。

### P0.5：公共 RuntimeCore / ExecutionBackend 边界冻结

状态：`done`

目标：

1. 更新 roadmap / architecture / service-extraction。
2. 明确公共 core、backend adapter、host adapter、protocol 的切分。
3. 停止把 Aster 当成公共 runtime core。
4. 明确 content-studio 等独立 App 通过 versioned TS client + sidecar binary 消费，不做源码同步。
5. 后续代码从 Codex-style crate 家族和接口开始，不先接真实 Aster。

退出条件：

1. 文档不再把 `AgentRuntimeService`、Aster 或 Tauri command runtime 当作核心命名。
2. 文档明确 `RuntimeCore / ExecutionBackend / AsterBackend`。
3. 文档明确独立 App 的消费和发布机制。
4. 执行计划重新排序后再继续代码。

### P1：Codex-style crate 家族骨架

状态：`done`

目标：

1. 新增 `app-server-protocol`。
2. 新增 `app-server-transport`。
3. 新增 `app-server`。
4. 新增 `app-server-client`。
5. 新增 `app-server-daemon`。
6. 新增 `app-server-test-client`。
7. 先只放最小可编译边界和协议类型。
8. 不急着接真实 runtime。

边界：

1. P1 允许使用 MockBackend，不接真实 runtime。
2. P1 不依赖 Tauri。
3. P1 不改 Lime Desktop GUI / command。
4. P1 不把 Aster DTO 暴露到协议。

退出条件：

1. `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol` 通过。
2. `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-transport` 通过。
3. `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server` 通过。
4. `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client` 通过。
5. `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-daemon` 通过。
6. `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-test-client` 通过。
7. crate 命名和依赖方向与 Codex app-server 家族一致。

### P2：RuntimeCore / ExecutionBackend 接口

状态：`done for interface skeleton`

目标：

1. 抽出 `RuntimeCore`。
2. 抽出 `ExecutionBackend`。
3. 抽出 `RuntimeEventSink`。
4. 抽出 `RuntimeHostContext`。
5. 建立 `MockBackend`。

退出条件：

1. `app-server` crate 不依赖 Tauri。
2. `RuntimeCore / ExecutionBackend / RuntimeEventSink / RuntimeHostContext / MockBackend` 已落到 `lime-rs/crates/app-server/src/runtime.rs`。
3. MockBackend 只能输出公共 `RuntimeEvent`，不暴露 Aster DTO。
4. `RuntimeCore` 事件已由 App Server 投递为 JSON-RPC `agentSession/event` notification。

### P2.5：AsterBackend adapter

状态：`done for async host port skeleton`

目标：

1. 先只读盘点现有 Aster runtime_turn/tool_runtime 依赖。
2. 把可下沉逻辑拆成 adapter 输入 / 输出映射表。
3. 不把 Aster 私有 DTO 上浮到 protocol。
4. 先补后端事件到公共 RuntimeEvent 的映射边界。
5. 再接最小 submit / cancel / event stream。

当前盘点结论：

| 能力 | 现有入口 | 判断 | 下一步 |
| --- | --- | --- | --- |
| submit turn | `command_api/runtime_api.rs::agent_runtime_submit_turn` / Agent App / Automation / subagent / managed objective -> in-process App Server JSON-RPC `agentSession/turn/start` -> `TauriAsterBackendHost` -> `RuntimeCommandContext::submit_runtime_turn` | 已迁成 Desktop compat adapter；旧 `AsterChatRequest -> QueuedTurnTask` 只保留在 host adapter 内 | 下一步做真实 sidecar backend 与 GUI smoke。 |
| queue task | `runtime_turn/queue.rs::build_queued_turn_task` | 输入是 `AsterChatRequest` / queue payload，属于 Aster adapter 内部输入，不上浮协议 | 后续由 `AsterBackend` 内部构造。 |
| cancel turn | `agent_runtime_interrupt_turn` -> `state.cancel_session` / `abort_running_turn_by_id` / queue clear | 取消路径混合 runtime state、DB 和 Tauri app state | 先定义 cancel port，再迁实现。 |
| event projection | `runtime_turn/event_projection.rs::emit_runtime_events` | 现有事件直接发 Tauri event；公共层不能复用此输出 | `ExecutionBackend` 公共合同只返回 `RuntimeEvent`；旧 Lime Agent event payload 只在 Desktop compat adapter 内解析和映射。 |

已完成：

1. `lime-rs/crates/app-server/src/backend_event.rs` 只保留通用 backend event type 归一化 helper，不再依赖 Lime 内部事件类型。
2. `AsterBackendSubmitResult / AsterBackendCancelResult` 已改为 `Vec<RuntimeEvent>`，`ExecutionBackend` 公共合同不再暴露 `lime_agent::AgentEvent`。
3. `lime-rs/crates/app-server/tests/host_boundary_guard.rs` 防止 `app-server` 直接引入 Tauri 壳层依赖。
4. `ExecutionBackend`、`RuntimeCore::start_turn`、`RuntimeCore::cancel_turn` 已 async 化，避免真实 submit / cancel 被同步接口卡住。
5. `AsterBackendHost` 已抽成 async submit / cancel port，`AsterBackend` 只做 host 调用和事件映射。
6. `AppServer` JSON-RPC 分发已支持 async turn start / cancel，业务错误仍封装为 JSON-RPC error response。

本阶段禁止：

1. 不从 `app-server` 直接调用 `RuntimeCommandContext`。
2. 不把 `AsterChatRequest`、Tauri command DTO 或 `AppHandle` 放进 `app-server-protocol`。
3. 不让 JSON-RPC 层理解 `lime_agent::AgentEvent`；必须先映射为公共 `RuntimeEvent` / `AgentEvent`。

### P3：真实 turn 主链接入

状态：`in_progress for Desktop compat adapter; real sidecar backend pending`

目标：

1. 将 `runtime_turn` 中非壳层 orchestration 下沉。
2. App Server 的 `turn/start` 进入真实 Query Loop。
3. cancel / event stream / read model 接入真实 runtime。

已完成：

1. 新增 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`，作为 Tauri 侧 `AsterBackendHost` adapter 骨架。
2. `TauriAsterBackendHost` 持有 `RuntimeCommandContext`，submit 路径映射为 `AsterChatRequest -> QueuedTurnTask -> submit_runtime_turn`。
3. cancel 路径复用现有 `cancel_session / abort_running_turn_by_id / finish_active_runtime_turn_if_matches / clear_runtime_queue` 组合。
4. 主 crate 只依赖 `app-server` facade，不直接依赖 `app-server-protocol`；`app-server` re-export adapter 测试所需的公开协议 DTO。
5. 现有 Tauri command 注册、前端 bridge、GUI 行为均未改变。
6. `RuntimeCoreEventAppender` / `AppServerEventBridge` 已拆出轻量外部事件追加器，Tauri host adapter 不持有完整 `AppServer`，避免 `AppServer -> RuntimeCore -> BackendHost -> AppServer` 强引用环。
7. `TauriAsterBackendHost` 在 in-process App Server submit 前按 session 注册 `agentSession/event/<session>` Tauri listener，解析 `lime_agent::AgentEvent` payload，映射为公共 `RuntimeEvent` 后调用 `AppServerEventBridge::append_external_runtime_events(...)`。
8. host listener bridge 遇到 `TurnCompleted / TurnFailed / FinalDone / Error` 终态事件时自动 `unlisten`；submit 失败时也会撤销 listener，避免 session 级监听泄漏。
9. 新增 host-port JSON-RPC 契约测试，验证 `AppServerRuntimeFactory::aster_app_server(...)` 能把 `initialize -> session/start -> turn/start` 的 client info、session id、thread id、event name、runtime options 传给 `AsterBackendHost`，并把 host 返回的 `RuntimeEvent` 投影为公共 `agentSession/event` notification。
10. `TauriAsterBackendHost` 的 event listener 生命周期已抽成内部 `RuntimeEventBridgeRegistry` seam；生产实现仍委托 `AppHandle.listen_any/unlisten`，测试实现可直接触发 payload handler，避免为了单测启用 `tauri/test` feature。
11. 新增 listener seam 测试，覆盖同 session 重复注册会先撤销旧 listener、非终态事件保持监听、终态事件自动撤销 listener，并继续验证 outbound JSON-RPC notification。
12. `RuntimeCommandContext` 相关动作已抽成内部 `AsterRuntimeHostBridge` seam；生产实现仍委托 `RuntimeCommandContext`、现有 DB/session/queue/timeline 函数，测试实现可记录 submit/cancel 调用和返回结果。
13. 新增 submit/cancel 编排测试，覆盖 submit 成功时先持久化 session、注册 listener、构造 queued task、委托 runtime submit；submit 失败时撤销刚注册的 listener；cancel 路径委托 runtime host 并保留 session/turn/event_name 作用域。
14. JSON-RPC `agentSession/turn/start` 已补齐 `queueIfBusy` 与 `skipPreSubmitResume`，并贯通到 `RuntimeCore -> ExecutionRequest -> AsterBackendSubmitRequest -> TauriAsterBackendHost -> RuntimeCommandContext` seam。
15. `app-server-client` 已新增 `AppServerConnection`，独立 App 可直接通过 `startSession / readSession / startTurn / cancelTurn` 消费 sidecar，不再手写 `send + nextMessage + response matcher`。
16. renderer-safe `src/lib/api/appServer.ts` 已同步 `queueIfBusy / skipPreSubmitResume` 类型，Desktop adapter 的 JSON-RPC current 入口保持与独立 client 一致。
17. JSON-RPC `agentSession/turn/start` 已支持 caller-supplied `turnId`，Desktop adapter 不再返回一个 turn id、实际 queue 使用另一个 turn id。
18. `RuntimeOptions.hostOptions` 已作为 host-local 透传口接入；`agent_runtime_submit_turn` 会把完整旧 `AsterChatRequest` 快照放入 `hostOptions.asterChatRequest`，确保迁入 App Server JSON-RPC 后不丢 `webSearch / systemPrompt / approvalPolicy / sandboxPolicy / providerConfig` 等旧运行参数。
19. `agent_app_runtime_start_task` 已删除本地重复 JSON-RPC helper，改为复用 `submit_desktop_app_server_turn(...)`，继续作为 Desktop compat facade 调 App Server JSON-RPC。
20. `agent_runtime_submit_turn` 已从直接 `build_queued_turn_task -> RuntimeCommandContext::submit_runtime_turn` 改成 Desktop compat adapter：先构造 in-process `AppServer`，再提交 `agentSession/start` + `agentSession/turn/start` JSON-RPC；旧 queue 提交只留在 `TauriAsterBackendHost`。
21. `runtime_queue_service` 的 queue event emitter 已抽成 `RuntimeQueueEventPort`；生产默认由 `TauriRuntimeQueueEventPort` 适配 `AppHandle.emit`，`RuntimeCommandContext` 持有可替换 port，submit / resume / startup / clear 统一走 `*_with_event_port`。
22. 已删除 `runtime_queue_service` 中无引用的旧 submit / resume / startup wrapper，避免新增一个绕过注入端口的 compat 旁路。
23. `AgentRuntimeQueueContext` 已持有同一个 `RuntimeQueueEventPort`；`runtime_turn/queue.rs` 的 provider/team transient runtime status 不再直接调用 `context.app.emit`，改为通过 event port 输出。
24. `runtime_turn/status.rs` 的 submit accepted 与 keepalive runtime status 已改为通过 `RuntimeQueueEventPort` 输出；`execute_aster_chat_request(...)` 只把 `AppHandle` 继续留给 keepalive 生命周期以外的 Desktop projection / Query Loop 依赖。
25. `runtime_turn/event_projection.rs::emit_runtime_events(...)` 已改为接收 `RuntimeQueueEventPort`；主执行链上的 timeline terminal events、provider bootstrap failure、pre-model failure、direct stream delta、final done / cancel done / error 均通过同一个 port 输出。
26. `execute_runtime_turn_pipeline(...) -> execute_runtime_stream_with_strategy(...) -> execute_runtime_stream_attempt(...) -> finalize_runtime_turn_result(...)` 已贯穿 `RuntimeQueueEventPort`，避免主流式事件在 pipeline 中途退回 `AppHandle.emit`。
27. `runtime_turn/compaction.rs` 仍作为 Desktop compat 路径使用 `TauriRuntimeQueueEventPort` 适配新 `emit_runtime_events(...)` 签名；后续拆 compaction host-agnostic context 时删除该临时适配。
28. `RuntimeCommandContext` 新增可注入 event port 的构造 / clone helper；默认 Desktop command 仍使用 `TauriRuntimeQueueEventPort`，in-process App Server 可注入 direct event bridge。
29. `AppServerRuntimeQueueEventPort` 已接入 Desktop in-process App Server：runtime events 直接 append 到 App Server read model / outbound JSON-RPC notification，并继续委托 Tauri port 保持 Desktop GUI 事件兼容。
30. `TauriAsterBackendHost` 对 direct event port 场景登记 `event_name -> session_id / turn_id` scope，并禁用旧 Tauri listener 回填，避免同一事件重复写入 App Server；旧 listener 只保留给未使用 direct port 的 compat 构造路径。
31. `AgentRuntimeQueueContext` 已从单一 `RuntimeQueueEventPort` 扩展为 `RuntimeQueueHostPorts`，按 Codex app-server 的 processor / outbound / host boundary 思路拆出 event、execution、projection、managed objective continuation 四类 host port。
32. `runtime_turn/queue.rs::execute_queued_request_with_team_runtime_governor(...)` 不再直接调用 `execute_aster_chat_request(...)`、`emit_subagent_status_changed_events(...)` 或 managed objective continuation 函数；真实执行、Desktop 投影和自动续跑提交均通过 ports 委托。
33. Desktop 现有行为保留在 `DesktopRuntimeQueueExecutionPort`、`DesktopRuntimeQueueProjectionPort`、`DesktopManagedObjectiveContinuationPort` 内，属于 compat adapter；queue 调度函数只保留 provider/team guard 编排和公共 runtime status 输出。
34. `RuntimeCommandContext` 持有 `RuntimeQueueHostPorts`；in-process App Server direct bridge 只替换 event port，不重建 execution/projection/objective ports，避免 App Server event bridge 破坏 Desktop runtime host 组合。
35. `runtime_turn` 新增 `RuntimeTurnHostContext`，把 `AppHandle / AsterAgentState / DbConnection / ApiKeyProviderServiceState / LogState / GlobalConfigManagerState / McpManagerState / AutomationServiceState` 从 `execute_runtime_turn_pipeline(...)`、`execute_runtime_turn_with_session_scope(...)`、`execute_runtime_turn_submit(...)` 的散装参数收成一个 Desktop host context。
36. `execute_aster_chat_request(...)` 仍作为 Desktop compat entry，但会先组装 `RuntimeTurnHostContext` 再进入 pipeline；这一步不改变 Query Loop 行为，只让后续 standalone backend 可替换 host context implementation。
37. P3.13 `RuntimeQueueHostPorts` 已完成：queue 调度、execution、projection、managed objective continuation 和 event 输出已统一挂到 host ports，direct App Server event bridge 可只替换 event port。
38. P3.14 `RuntimeTurnHostContext` 已完成核心接线和定向验证：runtime turn pipeline 入口不再继续扩散散装 Desktop host 依赖，但 `flow/preparation.rs` 及 event projection / compaction / skill launch / stream 相关 host ports 仍待继续收敛。
39. P3.15 已完成 `flow/preparation.rs` 与 `runtime_turn/submit_bootstrap.rs` 的 host context 收口：session preparation、request preparation、provider config、workspace sandbox、MCP / automation side effects 仍走原实现，但调用边界不再散传 Desktop host state。
40. P3.16 已完成 stream 外层 host context 收口：`execute_runtime_stream_with_strategy(...)`、`finalize_runtime_turn_result(...)`、`prepare_runtime_turn_prelude(...)` 和 `flow/execution.rs` 调用链均改为接收 `RuntimeTurnHostContext`，stream 内部再派生局部 context。
41. `app-server-client` Rust crate 已补 typed facade：`TypedRequest<P>`、`typed::*` helper 和 `ClientEvent` 分类，独立 App 不需要直接拼 method / JSON-RPC request。
42. `app-server-protocol` 已补最小 wire fixture 测试，固定 initialize、session start、turn start、turn cancel、session event notification 的当前 JSON shape。
43. P3.17 已完成 compaction 局部 host context：`compact_runtime_session_with_trigger_and_model_timeout(...)` 接收 `RuntimeCompactionHostContext`，`app.state::<McpManagerState>()` 旁路集中到构造点，自动压缩入口复用同一 context。
44. P3.18 已按代码事实补齐 skill launch 局部 host context：`runtime_turn/skill_launch.rs` 新增 `RuntimeSkillLaunchHostContext`，service skill preload、Agent App required skill contract、image skill direct task 内部不再散传 `AppHandle / event_name / timeline_recorder / workspace_root`；旧 `emit_runtime_side_event(...)` 暂作 compat wrapper，供 request resolution / stream recovery 等调用点后续迁移。
45. P3.19 已完成 event projection 最小 port：profile event、profile projection、runtime event projection 通过 `RuntimeProjectionEventPort` 输出；Tauri `AppHandle.emit` 被限制在 `TauriRuntimeProjectionEventPort` adapter 内，旧调用方行为不变。
46. P3.20 已完成直接 runtime projection 调用点收口：pre-model failure、submit accepted status、direct stream event projection 均显式构造 `TauriRuntimeProjectionEventPort` 后调用 `emit_agent_app_runtime_event_projection_with_port(...)`。
47. P3.21 已完成 artifact materialization 局部 host context：output contract materialization 与 ArtifactDocument autopersist 内部改用 `RuntimeArtifactMaterializationHostContext` 统一承载 `app / event_name / timeline_recorder / workspace_root`，外部包装保持兼容。
48. P3.22 已完成 compaction emit host context 收口：`compact_runtime_session_with_trigger_and_model_timeout(...)`、manual skip、auto failure warning 和 compaction terminal events 均通过 `RuntimeCompactionHostContext` 的事件方法发出；`AppHandle.emit` 在 compaction 模块内只保留在 host context adapter 方法内。
49. P3.23 已完成主 turn warning emit host context 收口：workspace 自动恢复 warning 与 workspace sandbox fallback warning 不再直接调用散落 `app.emit`，统一通过 `RuntimeTurnHostContext::emit_runtime_event(...)` 发出。
50. P3.24 已完成通用 side-event host context 局部迁移：`RuntimeSideEventHostContext` 从 skill launch 事件投递能力中抽出，request resolution 聚合 side events、runtime image input warning、model fallback / fallback failed warning、finalize stop warning / cost recorded / runtime limit event 不再直接调用 `emit_runtime_side_event(...)` compat wrapper。
51. P3.25 已完成 permission / user-lock action-required side events 收口：`maybe_emit_runtime_permission_confirmation_request(...)` 与 `maybe_emit_runtime_user_lock_capability_request(...)` 改为接收 `RuntimeSideEventHostContext`，并通过 host context 记录 `request_user_input` 与发出 `ActionRequired` runtime event；旧行为保留，散装 `AppHandle / event_name / timeline_recorder / workspace_root` 不再扩散到这两个 helper。
52. P3.26 已完成 artifact materialization side-event wrapper 收口：`RuntimeArtifactMaterializationHostContext` 改为复用 `RuntimeSideEventHostContext`，output contract / ArtifactDocument autopersist 不再通过旧 `emit_runtime_side_event(...)` compat wrapper；旧 wrapper 已删除。
53. `app-server` crate 已拆出 `processor.rs::RequestProcessor`：JSON-RPC request dispatch、initialize/initialized gate、参数解析、runtime 调用和事件通知序列化从 `AppServer` 主结构中下沉，`AppServer` 保留 transport loop、outbound subscription 和 external event bridge。
54. P3.27 已开始 profile / projection wrapper 端口化：pre-model failure 路径中的 task failed / turn failed / snapshot failed profile events 改为复用同一个 `TauriRuntimeProjectionEventPort` 并调用 `emit_agent_runtime_profile_event_with_port(...)`，与 error runtime projection 共用 port 边界。
55. P3.28 已完成 finalize 路径 profile / runtime projection 端口化：`finalize_runtime_turn_result(...)` 中的 task completed / failed、turn completed / failed、snapshot updated 以及 final done / cancel done / error runtime projection 均复用同一个 `TauriRuntimeProjectionEventPort`，不再调用 `emit_agent_runtime_profile_event(...)` 或 `emit_agent_app_runtime_event_projection(...)` wrapper。
56. P3.29 已完成 stream attempt 模型 profile events 端口化：`model_requested` / `model_failed` / `model_completed` 复用同一个 `TauriRuntimeProjectionEventPort`，不再调用 `emit_agent_runtime_profile_event(...)` wrapper。
57. P3.30 已删除 `emit_agent_runtime_profile_event(app, ...)` 旧 wrapper：`stream/events.rs` 的 tool profile events、`flow/execution.rs` 的 turn submitted / task started / turn started profile events，以及 `action_runtime.rs` 的 action resolved profile event 均改为显式 `RuntimeProjectionEventPort` / `TauriRuntimeProjectionEventPort`。
58. P3.31 已删除 `emit_agent_app_runtime_event_projection(app, ...)` 旧 wrapper：`flow/preparation.rs` 的 provider bootstrap error projection 与 `skill_launch.rs` 的 side-event projection 均改为显式 `TauriRuntimeProjectionEventPort`，runtime projection 旧 `AppHandle` wrapper 调用全清零。
59. P3.32 已完成 `emit_runtime_events(...)` 签名端口化：函数改为接收 `RuntimeProjectionEventPort`，不再内部构造 `TauriRuntimeProjectionEventPort`；`flow/preparation.rs`、`request_resolution.rs`、`stream/finalize.rs`、`compaction.rs` 调用点均显式传入 projection port。
60. P3.33 已抽出 `RuntimeSideEventPort` / `TauriRuntimeSideEventPort`：`RuntimeSideEventHostContext` 不再自己组合 direct `app.emit` 与 Agent App projection，side-event emit 出口改为可替换 port；`RuntimeSkillLaunchHostContext` 从 `Copy` 调整为 `Clone`，显式处理复用点。
61. P3.34 已抽出 `RuntimeCompactionEventPort` / `TauriRuntimeCompactionEventPort`：`RuntimeCompactionHostContext` 的 direct emit、warning emit 与 terminal queue/projection 组合改为通过可替换 port 委托；Tauri 细节收敛到 adapter，host context 从 `Copy` 调整为 `Clone`。
62. P3.35 已开始 stream projection port 接线：`RuntimeStreamEventContext` 新增显式 `RuntimeProjectionEventPort` 依赖，direct stream event projection 与 tool profile projection 不再在 `record_runtime_stream_event(...)` 内部构造 `TauriRuntimeProjectionEventPort`；`AppHandle` 暂时仍用于 timeline recorder，后续继续拆。
63. P3.36 已完成 flow profile helper 端口化：`RuntimeTurnPreparedExecution::emit_profile_turn_submitted(...)`、`emit_profile_task_started(...)`、`emit_profile_turn_started(...)` 改为接收 `RuntimeProjectionEventPort`，不再以 `AppHandle` 作为 profile projection helper 参数。
64. 已按用户确认恢复 `lime-rs` 工作树删除状态：`lime-rs/Cargo.toml`、`lime-rs/crates/agent`、`lime-rs/crates/core`、`lime-rs/crates/aster-rust` 和 staged-added `app-server` crates 重新回到磁盘，P3.35/P3.36 可重新执行 Rust 主 crate 复验。
65. P3.37 已抽出 `RuntimeTimelineEventPort` / `TauriRuntimeTimelineEventPort`：`RuntimeSideEventHostContext` 不再直接 lock `AgentTimelineRecorder` 或调用 `record_runtime_event(...) / record_request_user_input(...)`，side-event timeline persist 与 request input 记录改由可替换 port 委托。`AppHandle` 仍保留给 image direct task adapter 使用，未把业务工具提交误判为 timeline 依赖。
66. P3.38 已抽出 `RuntimeStreamTimelineEventPort` / `TauriRuntimeStreamTimelineEventPort`：`RuntimeStreamEventContext` 不再直接持有 `AppHandle` 与 `AgentTimelineRecorder`，stream event timeline persist 改由可替换 port 委托；`stream_reply_once(...)` 的 Desktop fallback emit 行为保持不变。
67. P3.39 已抽出 `RuntimeMemoryCapturePort` / `TauriRuntimeMemoryCapturePort`：`spawn_runtime_memory_capture_task(...)` 保持 Desktop compat 入口，内部先按 memory config 与内容信号短路，再通过 host port 获取 `ContextMemoryService`；`spawn_runtime_memory_capture_task_with_port(...)` 可供后续 sidecar / 测试注入，不再把后台记忆沉淀固定到 Tauri state lookup。
68. `capability/list` 已完成最小协议闭环：`app-server-protocol` 新增 `CapabilityListParams / CapabilityListResponse / CapabilityDescriptor`，`RequestProcessor` 在 `initialize -> initialized` 后返回最小 `agent.session` descriptor，Rust / TS client 均提供 typed helper；当前只是静态 capability discovery skeleton，尚未接真实 inventory / policy。
69. P3.40 已新增 host-independent `CapabilitySource` source 注入边界，`RuntimeCore` 支持通过 `with_backend_and_capability_source(...)` 注入 capability source；默认行为仍返回最小 `agent.session` descriptor，但不再把 capability discovery 固定写死在 `RuntimeCore::list_capabilities(...)` 内，后续可接真实 inventory / policy source。
70. P3.41 已按 `/Users/coso/Documents/dev/rust/codex` 的 App Server DTO 形状校准 `capability/list`：`CapabilityListParams` 新增可选 `appId / workspaceId`，`RequestProcessor` 不再丢弃 params，`RuntimeCore` 将 params 转成 host-independent `CapabilityListContext` 传给 `CapabilitySource`；Rust / TS client 均支持默认空 params 与 scoped params，contract guard 锁定 Rust protocol / runtime / processor / client 与 TS client 同步。
71. P3.42 已新增 `app-server/src/capability.rs`：`CapabilityInventoryRecord` 承载 descriptor 与可选 app/workspace allowlist，`CapabilityInventorySource` 基于 `CapabilityListContext` 做 host-independent scope 过滤；`RuntimeCore::with_backend(...)` 默认使用 inventory-backed `agent.session` source，`AppServerRuntimeFactory::mock_runtime_core_with_capability_source(...)` 允许 Desktop / sidecar adapter 注入真实 source。`StaticCapabilitySource` 旧命名已删除，避免继续扩展静态路径；host boundary guard 已覆盖 `capability.rs`，确保 capability source 不直接依赖 Tauri / Aster 私有事件。
72. P3.43 已补完整 JSON-RPC router 回归：`AppServer::with_runtime(AppServerRuntimeFactory::mock_runtime_core_with_capability_source(...))` 走 `initialize -> initialized -> capability/list`，证明 scoped `CapabilityInventorySource` 返回的 app/workspace 过滤结果能穿过 `RequestProcessor`、`RuntimeCore` 和 JSON-RPC response，而不只停留在 source 单测层。
73. P3.44 已把 `runtimeOptions.capabilityId` 接入 `CapabilitySource` policy gate：`RuntimeCore::start_turn(...)` 在创建 turn 前按 session 的 `appId / workspaceId` 查询可见 capability，隐藏或未授权 capability 返回 `CAPABILITY_DENIED = -32020`，且不持久化 accepted turn；TS client 同步暴露 `ERROR_CODES.capabilityDenied`，contract guard 锁定 Rust/TS 错误码和 JSON-RPC denied 行为。
74. P3.45 已按 Codex list/read 参考形态为 `capability/list` 补 `cursor / limit`：`CapabilityListParams` 支持 scoped + paginated 查询，`CapabilityListResponse.nextCursor` 由 `RuntimeCore` 对 host-independent source 输出做稳定分页；Rust / TS client 与 JSON-RPC router 回归均锁定分页请求和响应，后续真实 Desktop / sidecar inventory adapter 不需要先实现独立分页层。
75. P3.46 已补独立 App sidecar 事件投影 smoke：`AppServerAgentEventRouter` 可把 `agentSession/event` 投影到 app-owned renderer state；`AppServerConnection::nextNotification(...)` 与 request/response 读取之间加独占 transport read，避免 Electron main 空闲 notification loop 抢读 response 后卡住 request；packaged sidecar lifecycle smoke 已覆盖 manifest、sha256、initialize、`capability/list`、`agentSession/start`、`agentSession/turn/start`、idle notification loop 和 projection event count。
76. P3.47 已接 Desktop capability inventory adapter：`app-server` crate 继续只消费 host-independent `CapabilitySource / CapabilityInventorySource`，`AppServerRuntimeFactory::aster_runtime_core_with_capability_source(...)` 允许 Desktop adapter 注入 source；`app_server_host.rs` 从 `build_tool_inventory(...)` 构造 Desktop source，把 current tool catalog 与 visible runtime tools 映射成 `tool.<name>` capability record，并通过 `capability/list` 和 `runtimeOptions.capabilityId=tool.Agent` policy gate。共享 `agent_tools/inventory.rs` 不依赖 `app-server` DTO，避免 `lime-agent` crate 反向依赖 App Server。
77. P3.48 已把 Desktop capability source 从静态 catalog 推进到动态 runtime inventory refresh：`agent_runtime_get_tool_inventory(...)` 的采集逻辑抽为 `collect_runtime_tool_inventory(...)`，Desktop `DesktopRuntimeCapabilitySource` 先用 baseline current catalog，随后异步复用同一 collector 读取 runtime registry、current surface tools、MCP servers/tools 与 extension tools，并刷新 `CapabilitySource` cache。`app-server` crate 仍不读取 Tauri state，只通过 host adapter 注入 source。
78. P3.49 已把 workspace skill binding readiness 接入 Desktop capability source：`app_server_host.rs` 在 Desktop host adapter 内读取 `WorkspaceManager` 的 workspace id/root，再调用既有 `list_workspace_skill_bindings(...)`，只把 `runtime_binding_target=workspace_skill` 且 `ReadyForManualEnable` 的 P3B/P3C registered skill 投影成 scoped `workspace_skill.<directory>` capability record；blocked / 非 workspace_skill binding 不进入 App Server capability list。该投影只表示“可手动启用的候选能力”，methods 固定为 `capability/list`，不带 `agentSession/turn/start`，因此不会放行 `runtimeOptions.capabilityId=workspace_skill.*`，也不表示已注入 Query Loop / SkillTool / 默认 tool surface。
79. P3.50 已把 `RuntimeCore::start_turn(...)` 的 capability gate 从“session scope 可见”收紧为“scope 可见且 descriptor methods 包含 `agentSession/turn/start`”：workspace skill readiness 仍可通过 `capability/list` 被发现，但 readiness-only capability 不能作为 `runtimeOptions.capabilityId` 启动 turn，且拒绝时不会持久化 turn。`scripts/check-app-server-client-contract.mjs` 已增加 guard，防止 Desktop readiness projection 未来被误改成可执行 turn capability。
80. P3.51 已把 capability context 扩到 session scope：`CapabilityListParams`、Rust / TS clients 和 renderer-safe App Server helper 均支持可选 `sessionId`；`CapabilityInventoryRecord` 支持 `.for_sessions(...)`；`RuntimeCore::list_capabilities(...)` 在收到 `sessionId` 时会先读取已存 session，并以 session 的 `appId/workspaceId/sessionId` 作为权威过滤上下文，未知 session 返回 `SESSION_NOT_FOUND`，避免把 session-scoped policy facts 泛化成 workspace 级能力。`RuntimeCore::ensure_capability_allowed(...)` 复用同一 session context，因此未来 session-scoped executable capability 可以安全承接 `agentSession/turn/start`。参考 `/Users/coso/Documents/dev/rust/codex` 的只读结论：Codex 没有同名 `capability/list` / `capabilityId` gate，最接近的是 connection-level `experimentalApi` 与 thread/turn `permissions/approval/sandbox` override；Lime 本轮不复刻 connection-scoped capability，而把 execution gate 绑定到 session runtime context。
81. P3.52 已补 session policy executable capability 的最小投影 seam：`app-server/src/capability.rs` 新增 `CapabilityInventoryRecord::executable_agent_turn(...)` 与 `capability_descriptor_allows_agent_turn_start(...)`，`RuntimeCore::ensure_capability_allowed(...)` 复用同一 helper，避免 future adapter 手写可执行 method 判断；Desktop `app_server_host.rs` 新增纯 `DesktopSessionPolicyCapabilityFact` 投影，只有 `Executable` 且绑定明确 `appId/workspaceId/sessionId` 的 fact 生成 executable capability，`DiscoveryOnly` 只生成 `capability/list`，`Blocked/Denied` 不投影。该 seam 不读取 Tauri state、不接真实 policy service、不触碰 `runtime_turn/**`；Planck 只读盘点确认现有 `resolve_workspace_skill_runtime_enable(...)` 已表达 session-scoped manual enable，但真实接入仍在 runtime turn 链路，下一刀再把该事实安全投影到 App Server capability source。
82. P3.53 已补 `agentSession/action/respond` current JSON-RPC 闭环：协议常量 / DTO、`RequestProcessor` dispatch、`RuntimeCore::respond_action(...)`、`ExecutionBackend::respond_action(...)`、Aster backend host port、Desktop `TauriAsterBackendHost` adapter、Rust client、npm `app-server-client`、renderer-safe `src/lib/api/appServer.ts` 与 contract guard 已成组同步；Desktop 旧 `agent_runtime_respond_action` 保留为 compat wrapper，真实逻辑抽到 `respond_runtime_action_internal(...)` 供 App Server host adapter 委托。独立 App 后续可通过 `app-server-client.respondAction(...)` 响应 `action.required`，不需要调用 Lime Desktop Tauri command。
83. P3.54 已把 `resolve_workspace_skill_runtime_enable(...) / WorkspaceSkillRuntimeEnableProjection` 接入 Desktop App Server capability source：`CapabilitySource::prepare_turn_capabilities(...)` 会在 `RuntimeCore::start_turn(...)` 的 capability gate 前读取本次 `runtimeOptions.metadata.harness.workspace_skill_runtime_enable`，只在 session context 带 `appId / sessionId / workspaceId` 且 `workspaceId` 是绝对 workspace root 时投影 executable `workspace_skill.<directory>`；projection 继续复用既有 P3E resolver 校验 metadata workspace root、registered skill、`ReadyForManualEnable`、注册目录位于当前 `.agents/skills` 和 verification provenance。Desktop source 现在按当前 session 清理并替换 session policy records，防止同一 session 的旧 executable capability 在后续不带 enable metadata 的 turn 中残留。非绝对 workspace id 直接跳过，不把数据库 id 猜成路径；后续如要支持 session 只存 workspace id，需要显式注入 id -> root resolver。
84. P3.55 已为 Desktop App Server capability source 补显式 workspace id -> root resolver：`DesktopRuntimeCapabilitySource` 通过 `DesktopWorkspaceRootResolver` 持有 host adapter 依赖，真实 Desktop runtime 构建时用 `WorkspaceManager::get()` 把非绝对 session `workspaceId` 解析成 workspace root，再复用 P3E `resolve_workspace_skill_runtime_enable(...)` 投影 session executable `workspace_skill.<directory>`；resolver 找不到 id、返回非绝对 root，或 metadata `workspace_root` 与解析 root 不一致时都不投影 executable。App Server crate 仍只依赖 host-independent `CapabilitySource`，不会读取 Tauri state 或数据库 workspace 概念。
85. P3.56 已补 `artifact/read` current JSON-RPC summary loop：协议常量 / DTO、`RequestProcessor` dispatch、`RuntimeCore::read_artifacts(...)`、Rust client、npm `app-server-client`、renderer-safe `src/lib/api/appServer.ts` 与 contract guard 已成组同步；该 API 只从 App Server RuntimeCore 已存 `AgentEvent` 中提取 artifact summary，按 `artifactRef` 去重取最新事件，支持 `sessionId / turnId / artifactRef / cursor / limit`，不读磁盘、不接 Desktop state。独立 App 后续可通过 `app-server-client.readArtifacts(...)` 读取会话产物摘要，但真实文件内容 provider / evidence export 仍留到后续阶段。
86. P3.57 已补 `artifact/read` 内容读取 provider seam：`ArtifactReadParams.includeContent` 控制是否读取 content；`RuntimeCore` 新增 host-independent `ArtifactContentProvider / ArtifactContentRequest` 和默认 `InlineArtifactContentProvider`，读取发生在分页之后，默认只透传 event summary 内嵌 content，未请求内容时清空 `ArtifactSummary.content`，避免 summary list 隐式携带大内容。Rust / TS client 与 renderer-safe helper 已同步 `includeContent`，contract guard 锁定 provider 注入边界和 summary/content 双向契约；真实文件 provider / evidence export / Desktop timeline materialization adapter 仍留到后续阶段。
87. P3.58 已补 host-independent `FilesystemArtifactContentProvider` 和 Desktop in-process 注入：provider 只接受 allow-root 下的相对 artifact path，拒绝绝对路径与 `..` 目录逃逸，按 `DEFAULT_ARTIFACT_CONTENT_MAX_BYTES` 或注入上限读取 UTF-8 文件；读取失败、越界或超限时回退到 event 内嵌 content，不把读取失败扩散成新的 JSON-RPC 协议分支。`RuntimeCore::read_artifacts(...)` 已在锁内只克隆 session 与 summary，释放 state mutex 后再分页和调用 content provider，避免 Desktop workspace resolver / 文件 IO 拖住 runtime 状态锁。Desktop `build_tauri_aster_runtime_core(...) / build_tauri_aster_app_server(...) / in_process_app_server(...)` 已通过 `aster_runtime_core_with_sources(...)` 注入 `DesktopArtifactContentProvider`，该 provider 只接受经 `WorkspaceManager::get()` 解析出的 session workspace id 作为 root，显式拒绝把绝对 `workspaceId` 直接当文件读取根；仍不接 Desktop timeline / materialization state，不导出 evidence pack。独立 App / standalone sidecar 后续仍需要显式注入 artifact root 与权限策略。

当前限制：

1. 当前 `tauri` 依赖未启用 `test` feature，主 crate 单元测试内无法使用 `tauri::test::mock_context(...) / noop_assets()`；当前 Tauri builder surface 也没有可用的 `any_thread()` helper。因此暂不为一个测试改依赖特性，完整 `RuntimeCommandContext + build_tauri_aster_app_server(...)` AppHandle harness 仍留到下一刀。
2. 真实 `turn/start -> TauriAsterBackendHost -> RuntimeCommandContext::submit_runtime_turn -> Query Loop` 仍未做 GUI smoke。原因是该路径需要真实 `AppHandle / AsterAgentState / DbConnection / ApiKeyProviderServiceState / LogState / GlobalConfigManagerState / McpManagerState / AutomationServiceState`，并可能继续触发 Provider / runtime dir / tool registry 环境要求；本阶段不伪造为已完成。
3. standalone `app-server` 默认仍只支持 mock backend；真实 Agent turn 仍依赖 Desktop in-process `TauriAsterBackendHost`，不能宣称 content-studio 已可生产跑真实 Agent。
4. queue / runtime turn 执行上下文仍携带 Desktop host context，因为真实 Query Loop、Agent App projection 和后续 tool/runtime side effect 仍依赖 Tauri state；但 queue transient status、submit accepted status、keepalive status、direct stream event、terminal timeline events、final done/error、subagent status projection、managed objective continuation 提交以及 runtime turn preparation/bootstrap/stream 外层 host 装配已不再散落在参数列表中。
5. `runtime_turn/event_projection.rs` 已有最小 projection port，profile event、Agent App runtime projection 旧 `AppHandle` wrapper 已删除，`emit_runtime_events(...)` 也改为显式 projection port；side-event event/timeline、stream timeline、compaction event host context 与 memory capture 已有可替换 port。剩余较高价值缺口是 standalone `app-server --backend aster` 仍未接真实 Aster backend，且部分局部 host context 仍持有 Desktop state。
6. `capability/list` 目前已具备 `appId / workspaceId / sessionId` scope 穿透、`cursor / limit` 分页、host-independent inventory source、Desktop current tool catalog records、动态 runtime / MCP / extension snapshot refresh、Desktop workspace skill readiness scoped records、session-scoped runtime enable executable projection，以及 Desktop workspace id -> root resolver；turn execution gate 已按 descriptor methods 区分 discovery-only 与 executable capability，并且 session scope 由已存 session 事实补全。但真实 app policy source 与 standalone sidecar 真实 inventory 仍未接入，不能宣称多 App capability discovery 已完成。
7. content-studio 只读审阅已确认适合通过 npm `app-server-client` + packaged sidecar 接入；真实接入还未修改 content-studio 仓库，且 P4 试点仍需真实 sidecar Agent flow、preload IPC projection 和 app-owned smoke。
8. `agentSession/action/respond` 已具备 current JSON-RPC、client SDK 和 Desktop host adapter 闭环，但真实 GUI 里的全部 `tool_confirmation / ask_user / elicitation` 交互仍未做端到端 smoke；standalone `app-server` 真实 Aster backend 未接入前，content-studio 也不能宣称已可生产处理真实 action required。
9. `artifact/read` 已具备 current JSON-RPC、client SDK、renderer-safe helper、host-independent content provider seam、受限 filesystem provider，以及 Desktop in-process adapter 按 session workspace id/root resolver 注入的文件读取链路；Desktop 侧不会把绝对 `workspaceId` 直接当 artifact read root。content-studio / standalone sidecar 仍未接真实 artifact root / evidence export，也不桥接 Desktop timeline / materialization state。

退出条件：

1. 一个真实 Agent turn 可通过 stdio App Server 跑通。
2. Lime Desktop 现有主路径不回退。

### P4：content-studio 试点

状态：`pending`

目标：

1. content-studio Electron main 启动 / 连接 App Server。
2. renderer 继续通过 preload IPC。
3. Agent session 绑定业务对象 ref。

退出条件：

1. content-studio 至少一个真实 Agent flow 通过 App Server 完成。
2. 事件、artifact、action、error 可投影到业务 UI。

## 5. 本轮写集

本轮认领：

1. `.gitignore`
2. `internal/exec-plans/app-server-implementation-plan.md`
3. `internal/roadmap/appserver/consumer-integration.md`
4. `package.json`
5. `scripts/app-server-stdio-smoke.mjs`
6. `lime-rs/Cargo.toml`
7. `lime-rs/crates/app-server*/**`
8. `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`
9. `lime-rs/src/commands/aster_agent_cmd/mod.rs`
10. `lime-rs/src/app/runner.rs`
11. `src/lib/api/appServer.ts`
12. `src/lib/api/appServer.test.ts`
13. `src/lib/governance/agentCommandCatalog.json`
14. `src/lib/dev-bridge/mockPriorityCommands.ts`
15. `src/lib/tauri-mock/agentRuntimeMocks.ts`
16. `internal/aiprompts/README.md`
17. `internal/aiprompts/commands.md`
18. `internal/aiprompts/governance.md`
19. `internal/aiprompts/services.md`
20. `.codex/skills/lime-command-boundary/SKILL.md`
21. `.codex/skills/lime-governance/SKILL.md`
22. `.codex/skills/lime-quality-workflow/SKILL.md`
23. `.codex/skills/project-skill-factory/SKILL.md`
24. `lime-rs/src/agent/runtime_queue_service.rs`

不触碰：

1. Lime Desktop GUI。
2. content-studio 仓库。
3. Provider / Tool / Evidence 真实 runtime。

仅作为 Desktop compat adapter 触碰：

1. 现有 Tauri command 壳层。

## 6. 进度日志

### 2026-06-04

计划：

1. 建立执行计划文件。
2. 先更新文档，冻结公共 core/backend/host/protocol 切分。
3. 补独立 App 消费方案：TS client、sidecar binary、release manifest、content-studio 集成边界。
4. 再新增 P1 app-server crate 家族。
5. 跑 protocol / server 定向 Rust 测试。
6. 如 cargo lock 变更，只接受由新 workspace crate 产生的必要变更。

已完成：

1. 新增 Codex-style `app-server*` 六个 Rust crate。
2. `app-server-protocol` 定义 JSON-RPC 基础类型、initialize、agentSession session/turn/event DTO。
3. `app-server-transport` 定义 JSONL codec。
4. `app-server` 定义 stdio binary、initialize 门禁、JSON-RPC router、Mock runtime。
5. `app-server-client` 定义 typed request builder。
6. `app-server-daemon` 定义 sidecar launch config。
7. `app-server-test-client` 定义最小 initialize fixture line。
8. 抽出 `RuntimeCore / ExecutionBackend / RuntimeEventSink / RuntimeHostContext / MockBackend`。
9. 显式排除旧空目录 `crates/agent-app-server*`，防止 workspace glob 继续吸入旧命名。
10. `RuntimeCore` 事件投递为 JSON-RPC `agentSession/event` notification。
11. 新增 `backend_event`，把 backend snake_case event type 归一化为公共 `RuntimeEvent` event type；Lime 内部事件解析只留在 Desktop compat adapter。
12. 新增 `host_boundary_guard`，防止 `app-server` 直接依赖 Tauri。
13. `ExecutionBackend / RuntimeCore / AsterBackendHost / AppServer` 已完成 async 边界收敛。
14. `AsterBackend` 已具备 host-agnostic async submit / cancel port，后续可接真实 Tauri host adapter 或独立进程 host。
15. `AsterBackendSubmitRequest / AsterBackendCancelRequest` 已补齐 host adapter 需要的 `host / event_name / queue_if_busy / skip_pre_submit_resume` 等内部字段，不改变 JSON-RPC wire DTO。
16. 已只读盘点真实 submit / cancel 主链：旧 `agent_runtime_submit_turn` 曾经直接转换为 `AsterChatRequest`、构造 `QueuedTurnTask`，再通过 `RuntimeCommandContext::submit_runtime_turn` 进入共享 queue；本轮已改成 App Server JSON-RPC Desktop compat adapter。cancel 仍混合 `AsterAgentState::cancel_session`、timeline abort、queue clear 和 Tauri app state。
17. 新增 Tauri 侧 `TauriAsterBackendHost` adapter 骨架，后续可把 Desktop command 或 in-process App Server 组装到 `RuntimeCore + AsterBackend`。
18. `RuntimeCommandContext` 补充只读 `app_handle()` accessor，仅用于 adapter 复用现有 queue clear / event emitter 边界。
19. `build_tauri_aster_runtime_core(...)` / `build_tauri_aster_app_server(...)` 已把 Tauri host adapter 串到 `RuntimeCore + AsterBackend`，但尚未接入现有 Desktop command 注册。
20. `TauriAsterBackendHost::submit_turn(...)` 会在 submit 前调用 `ensure_persisted_runtime_session(...)`，确保 App Server session id 与 Aster DB session 同源，避免内存 session 和持久化 session 分裂。
21. `AgentSessionStartParams` 支持可选 `sessionId / threadId`，RuntimeCore 可绑定调用方提供的稳定 session，重复 `sessionId` 返回 `SESSION_ALREADY_EXISTS`。
22. 新增 `packages/app-server-client`，提供 `app-server-client` TS workspace package：JSON-RPC request builder、JSONL codec、stdio sidecar args、release manifest artifact selector、协议版本 guard 和 sidecar sha256 校验 helper。
23. `package-lock.json` 只同步新增 workspace link；未新增第三方 npm 依赖。
24. `app-server-client` 已新增 `spawnAppServerSidecar(...)` 与 `connectAppServerSidecar(...)`，覆盖 stdio child process lifecycle、JSONL 收发、`initialize -> initialized` 握手和失败时关闭 sidecar。
25. 新增 `npm run smoke:app-server-stdio`，用真实 `app-server --stdio` 验证独立 App 消费路径的最小闭环。
26. `smoke:app-server-stdio` 本地使用 repo-local `packages/app-server-client/dist/index.js`，避免根 `node_modules` workspace symlink 未安装时误报；独立 App 生产消费仍以发布后的 `app-server-client` 包为边界。
27. 新增 `AppServerRuntimeFactory`，统一组装 `mock_runtime_core / mock_app_server / aster_runtime_core / aster_app_server`。
28. 新增 `AppServerBackendMode`，standalone `app-server` 只接受 `--backend mock`；`--backend aster` 明确失败，防止把 Tauri host state 误接进 standalone sidecar。
29. `TauriAsterBackendHost` 改为通过 `AppServerRuntimeFactory::aster_runtime_core(...)` 注入，真实 Aster host 仍只在 Lime Desktop in-process adapter 内存在。
30. `app-server-client` 新增 `resolveSidecarBinaryPath(...)` 和 `defaultPackagedSidecarRelativePath(...)`，统一独立 App 的 env / packaged resources / dev fallback binary path 优先级。
31. `smoke:app-server-stdio` 改为复用 `resolveSidecarBinaryPath(...)`，本地 smoke 与 Electron main 未来接入使用同一套 path resolver。
32. `app-server-client` 新增 `resolveSidecarFromReleaseManifest(...)`，从 release manifest + resources path 生成带 artifact / sha256 的 stdio sidecar config。
33. 新增 `scripts/app-server-release-manifest.mjs`、`npm run app-server:manifest` 和 `npm run app-server:manifest:test`，用于从本地 sidecar binary 生成 `version / protocolVersion / artifacts[]` manifest。
34. 新增 fake `AsterBackendHost` JSON-RPC 端到端测试，验证 `AppServerRuntimeFactory::aster_app_server(...)` 能穿过 `initialize -> session/start -> turn/start -> agentSession/event`，并将后端 `TextDelta` 映射为公共 `message.delta` notification。
35. 已按命令边界迁移 `agent_runtime_submit_turn`：Tauri command 名称、前端网关、mock 与治理目录册保持兼容，但 Rust command 内部不再直接构造 queued task，而是通过 App Server JSON-RPC `agentSession/turn/start` 进入 `RuntimeCore -> AsterBackend -> TauriAsterBackendHost`。
36. `RuntimeCore::append_external_runtime_events(...)` 和 `AppServer::append_external_runtime_events(...)` 已成为公共外部事件出口：真实 Aster Query Loop 后续事件可先映射为公共 `RuntimeEvent`，再追加到 read model 并生成 `agentSession/event` notification。
37. `AppServer` 新增 outbound notification broadcast；`run_stdio(...)` 订阅该通道并把异步外部事件写回 stdout JSONL。同步 request 产生的事件仍随 request response 返回，不进入 outbound 通道，避免客户端收到重复事件。
38. `run_stdio(...)` 拆出可测试的 `run_json_lines(...)`，用内存 duplex 覆盖 external event -> outbound broadcast -> JSONL writer 的 transport 边界。
39. 新增 `RuntimeCoreEventAppender` 和 `AppServerEventBridge`，把外部事件追加能力从完整 `AppServer` clone 中拆出，供 Tauri host adapter 安全持有。
40. `TauriAsterBackendHost` 新增 host listener bridge skeleton：监听现有 Aster `event_name`，解析 `lime_agent::AgentEvent` payload，映射为公共 runtime event，再写入 App Server read model 和 outbound notification。
41. host listener bridge 只存在于 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`，`app-server` crate 仍不依赖 Tauri；现有 Tauri command 注册、前端 bridge、mock 和 GUI 主路径未改。
42. host bridge 关键逻辑已抽成 `append_lime_agent_payload_to_app_server_bridge(...)`，定向测试可直接证明 Tauri payload 字符串进入 `AppServerEventBridge` 后会写入 read model 并发布 outbound JSON-RPC notification。
43. 新增 `app_server_aster_host_port_preserves_json_rpc_session_contract`，用 fake host 在主 crate adapter 测试内覆盖 JSON-RPC session/turn 合同、host context 传递、`event_name` 生成、runtime options 传递和 `RuntimeEvent` 到公共 notification 的映射。
44. 已尝试低成本 Tauri AppHandle harness 探针，但当前 `tauri/test` feature 未启用，且 `Builder::any_thread()` 不在当前依赖 surface 中；已撤回探针，不为测试引入依赖特性漂移。
45. 新增内部 `RuntimeEventBridgeRegistry` seam，生产路径由 `TauriRuntimeEventBridgeRegistry` 包装 `AppHandle.listen_any/unlisten`，测试路径用 fake registry 直接触发 payload；这让 host listener 生命周期可测，但不改变 App Server protocol、Desktop command 或 GUI 主链。
46. 新增 `runtime_event_bridge_subscription_replaces_existing_listener_and_closes_on_terminal_event`，验证重复注册替换、非终态事件保留监听、终态事件清理监听，以及 payload 进入 App Server read model 后发布 outbound notification。
47. 新增内部 `AsterRuntimeHostBridge` seam，生产路径由 `RuntimeCommandContextHost` 委托原 `RuntimeCommandContext`、`ensure_persisted_runtime_session`、`submit_runtime_turn`、`cancel_session / abort_running_turn_by_id / finish_active_runtime_turn_if_matches / clear_runtime_queue` 组合；测试路径用 fake runtime host 验证 adapter 编排顺序。
48. 新增 `tauri_aster_backend_host_submit_persists_registers_and_delegates_runtime_turn`，验证 App Server submit request 被映射为 `AsterChatRequest -> QueuedTurnTask`，保留 session/event/turn/metadata，并把 queue flags 传入 runtime host。
49. 新增 `tauri_aster_backend_host_submit_failure_unregisters_listener`，验证 runtime submit 失败时会撤销已注册 listener，避免 session listener 泄漏。
50. 新增 `tauri_aster_backend_host_cancel_delegates_to_runtime_host`，验证 cancel path 保留 session/turn/event_name scope 后委托 runtime host。
51. App Server 新主线已全局去品牌前缀：Rust package/lib/bin、TS package、sidecar binary、release manifest、脚本、路线图、执行计划和生成产物统一使用 `app-server` / `app_server` / `app-server-client` / `APP_SERVER_BIN`，不再使用带品牌前缀的 App Server 命名。
52. 新增 in-process Tauri command：`app_server_handle_json_lines` 与 `app_server_drain_events`，作为 Desktop adapter 的 App Server JSON-RPC 入口；命令注册、治理目录册、Bridge mock 优先集合和 tauri mock 已同步。
53. 新增 `src/lib/api/appServer.ts` renderer-safe client helper，提供 `AppServerClient`、`initialize -> initialized`、`agentSession/start/read/turn/start/turn/cancel`、event drain、JSON-RPC encode/decode 和 `AppServerRpcError`；该 helper 只依赖 Tauri command，不把 Node sidecar client 打进 renderer。
54. 新增 `src/lib/api/appServer.test.ts`，锁定前端 App Server helper 必须走 `app_server_handle_json_lines` / `app_server_drain_events`，并覆盖 initialize 握手、turn/start 同批 notification、JSON-RPC error 和 drain events。
55. 仓库规则已同步：新增程序、目录、crate/package、命令、API 网关、类型、模块和脚本默认不得添加 `Lime` / `lime_` / `lime-` 前缀；新增 AI Agent / runtime / host integration / 跨 App 复用能力默认走 App Server JSON-RPC current 主链，`agent_runtime_*` / Aster Tauri command 只作为 Lime Desktop 兼容适配层。
56. `agentSession/turn/start` 协议新增 `queueIfBusy` 与 `skipPreSubmitResume`，字段命名为 camelCase，默认值为 `false`；Rust 协议测试锁定不会回退到 snake_case wire 字段。
57. `RuntimeCore::start_turn(...)` 将 queue flags 写入 `ExecutionRequest`，`AsterBackend` 再原样传给 `AsterBackendHost`；`app-server` JSON-RPC router 测试已证明字段能从 request params 进入 fake Aster host。
58. `TauriAsterBackendHost` host-port JSON-RPC 契约测试已证明 queue flags 能从 in-process App Server 透传到 captured `AsterBackendSubmitRequest`，后续真实 Query Loop 验证可直接复用该字段链路。
59. `packages/app-server-client` 新增 `AppServerConnection`，封装 request/response 等待、同批 notification 收集和异步 notification 读取；`connectAppServerSidecar(...)` 现在返回 `connection`，供 content-studio / 独立 App 的 Electron main 直接调用。
60. `packages/app-server-client/README.md` 已把 Electron main 示例更新为 `connection.startSession(...) -> connection.startTurn(...)`，并示范业务对象 ref、capability id、stream 和 `queueIfBusy`。
61. `agentSession/turn/start` 新增 `turnId` 和 `hostOptions`：`turnId` 用于调用方稳定绑定 turn，`hostOptions` 仅供 host-local adapter 透传私有运行参数，不作为独立 App 的通用业务协议。
62. `submit_desktop_app_server_turn(...)` 成为 Lime Desktop compat command 进入 App Server JSON-RPC 的共用 helper；`agent_app_runtime_start_task` 和 `agent_runtime_submit_turn` 已复用该 helper。
63. 新增 `tauri_aster_backend_host_submit_preserves_host_options_aster_request`，锁定 `hostOptions.asterChatRequest` 不丢旧 Runtime command 的 `web_search / reasoning_effort / system_prompt / workspace_id / queued_turn_id` 等参数。
64. Automation `agent_turn` 已从直接 `build_queued_turn_task -> runtime_queue_service::submit_runtime_turn` 改为复用 `submit_desktop_app_server_turn(...)`；完整旧 `AsterChatRequest` 通过 `hostOptions.asterChatRequest` 进入 `TauriAsterBackendHost`，旧 queue 提交只留在 host adapter 内。
65. `services/automation_service/agent_turn_runtime_request.rs` 的测试已从旧 queue payload 断言改为 App Server hostOptions 语义，继续验证 provider config、access mode、metadata 和 content id 不丢失。
66. subagent 生产入口已收敛：managed session message、background spawn turn、send subagent input 均通过 `submit_desktop_aster_chat_request(...) -> agentSession/start + agentSession/turn/start` 进入 App Server JSON-RPC；旧 queue 提交只留在 `TauriAsterBackendHost`。
67. managed objective 生产入口已收敛：manual continue 与 auto idle continuation 均通过 App Server JSON-RPC 提交；auto idle 保留 `queue_if_busy=true / skip_pre_submit_resume=true`，manual continue 保留 busy/pending/interrupt guard 与 `queue_if_busy=false`。
68. objective continuation 的 `workspace_id` 已从 objective record 或 owner session workspace 回填，避免历史 objective 缺 workspace 时向 App Server session contract 传空字符串。
69. `app-server` 独立库默认 surface 已收窄：`aster-backend` 成为非默认 feature，默认 standalone `app-server` 不再依赖 `lime-agent`；Lime Desktop 主 crate 显式启用该 feature。
70. `AsterBackendHost` 的 submit / cancel result 已改为公共 `RuntimeEvent`，`lime_agent::AgentEvent` 只在 `TauriAsterBackendHost` listener 里作为 Desktop compat payload 解析。
71. `host_boundary_guard` 新增公共后端事件边界扫描，防止 `lime_agent::AgentEvent` 或旧 `lime_agent_*` helper 回到 `app-server` 公共边界。
72. `packages/app-server-client` 已补齐 `agentSession/turn/start.turnId` 类型和 request builder 测试，避免 content-studio 等独立消费者拿到落后的 TS client。
73. 新增 `scripts/check-app-server-client-contract.mjs` 并接入 `npm run test:contracts`，锁定 Rust protocol 与 TS client 的 `turnId / queueIfBusy / skipPreSubmitResume / runtimeOptions / hostOptions` 关键字段不漂移。
74. `app-server-client` sidecar resolver 新增 `allowEnvOverride`；生产调用可传 `false`，强制从 packaged resources + manifest sha256 启动，避免 `APP_SERVER_BIN` 绕过发布产物校验。
75. `runtime_queue_service` 新增 `RuntimeQueueEventPort` 与 `TauriRuntimeQueueEventPort`，把 queue event emitter 从固定 `AppHandle.emit` 抽成可替换 host port。
76. `RuntimeCommandContext` 注入并复用 `RuntimeQueueEventPort`；App Server host adapter 的 cancel queue clear 也通过该 context port，不再直接调用 Tauri AppHandle 版 clear helper。
77. 删除无引用的旧 queue submit / resume / startup wrapper；current 调用路径只保留 `RuntimeCommandContext -> *_with_event_port -> shared queue service`。
78. `AgentRuntimeQueueContext` 持有 `event_port`，queue executor 内部的 transient runtime status 事件通过 port 输出。
79. 新增 `transient_runtime_status_uses_runtime_queue_event_port`，防止 queue status 输出退回 `AppHandle.emit`。
80. `execute_aster_chat_request(...)` 接收 `RuntimeQueueEventPort`，submit accepted 与 keepalive runtime status 事件均通过同一 port 输出。
81. 新增 `submit_accepted_runtime_status_event_is_preparing_status` 与 `runtime_turn_keepalive_status_event_is_runtime_status`，锁定主执行状态事件构造。
82. `prepare_runtime_turn_submit_preparation(...)` 已改为接收 `RuntimeTurnHostContext`，内部不再散传 `AppHandle / state / db / provider / logs / config / MCP / automation`。
83. `prepare_runtime_turn_submit_bootstrap(...)` 已改为接收 `RuntimeTurnHostContext`，workspace sandbox、provider bootstrap、execution tracker 仍保留原行为。
84. stream 模块新增局部 attempt / event / recovery context，并把外层 `execute_runtime_stream_with_strategy(...)`、`finalize_runtime_turn_result(...)`、`prepare_runtime_turn_prelude(...)` 接到 `RuntimeTurnHostContext`。
85. `app-server-client` Rust facade 新增 typed request helper 与 `ClientEvent` 分类，为 content-studio 等消费者提供不手写 method 字符串的公共入口。
86. `app-server-protocol` 新增 wire fixture 回归，固定当前 JSON-RPC 协议形状，后续 TS client / 独立 App 集成可用该形状做 contract baseline。
87. `runtime_turn/compaction.rs` 新增 `RuntimeCompactionHostContext`，自动压缩入口 `compaction/auto.rs` 已改为构造并传递同一 context。
88. `runtime_turn/skill_launch.rs` 新增 `RuntimeSkillLaunchHostContext`，把 service skill preload、required skill contract、image skill direct task 的内部 host 参数收口；`emit_runtime_side_event(...)` 仍保留为 compat wrapper，避免一次性改动所有 stream / request resolution 调用点。
89. `runtime_turn/event_projection.rs` 新增 `RuntimeProjectionEventPort` 和 `TauriRuntimeProjectionEventPort`；profile event / Agent App projection 包装层继续保留 Desktop 行为，新增 port 级单测避免回退到不可替换的 `AppHandle.emit`。
90. `runtime_turn/request_resolution.rs`、`runtime_turn/status.rs`、`runtime_turn/stream/events.rs` 的直接 Agent App runtime projection 调用已改为显式 projection port 调用。
91. `runtime_turn/artifact_materialization.rs` 新增 `RuntimeArtifactMaterializationHostContext`；`contract_artifact.rs` 与 `document_autopersist.rs` 的内部 side event 调用改为通过 host context 发出。

验证：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server-transport -p app-server -p app-server-client -p app-server-daemon -p app-server-test-client
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server-transport -p app-server -p app-server-client -p app-server-daemon -p app-server-test-client
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host
npm --prefix "packages/app-server-client" test
npx vitest run "src/lib/api/appServer.test.ts"
npx eslint "src/lib/api/appServer.ts" "src/lib/api/appServer.test.ts" --max-warnings 0
npm run typecheck
npm run app-server:manifest:test
cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server
npm run smoke:app-server-stdio
npm run app-server:manifest -- --binary "lime-rs/target/debug/app-server" --url "https://example/app-server-darwin-arm64.tar.gz" --platform "darwin-arm64" --out "/tmp/app-server-manifest.json"
lime-rs/target/debug/app-server --backend aster --stdio
git diff --check
```

结果：

1. `app-server`：18 个 lib tests、3 个 binary CLI tests、1 个 host boundary integration test 通过。
2. `app-server-client`：1 个 client request builder test 通过。
3. `app-server-daemon`：1 个 stdio sidecar config test 通过。
4. `app-server-protocol`：3 个协议序列化 test 通过。
5. `app-server-test-client`：1 个 initialize JSONL fixture test 通过。
6. `app-server-transport`：1 个 JSONL codec test 通过。
7. `lime`：`commands::aster_agent_cmd::app_server_host::*` 9 个定向测试通过，覆盖 host-port JSON-RPC 合同、listener lifecycle seam、submit/cancel runtime host seam、Aster submit 映射、Tauri event payload 解析 / 映射、payload -> read model -> outbound notification、终态 listener 清理判断。
8. `app-server-client`：9 个 node:test 测试通过，覆盖 request builder、JSONL codec、stdio sidecar args、sidecar binary path resolver、release manifest artifact selector、manifest-to-sidecar config、sidecar sha256 校验、fake sidecar spawn / JSONL、`connectAppServerSidecar` initialize/initialized handshake。
9. `smoke:app-server-stdio`：通过，真实 `app-server --stdio` 已跑通 `initialize -> initialized -> agentSession/start -> agentSession/turn/start -> agentSession/event`，收到 `turn.accepted` notification。
10. `app-server --backend aster --stdio`：按预期失败，错误为 `unsupported app-server backend mode: aster`，证明 standalone sidecar 未误开放 Tauri Aster host。
11. `app-server:manifest:test`：3 个 node:test 通过，覆盖 CLI 参数解析、sha256 manifest 构建和 manifest 写文件。
12. `app-server:manifest`：已对真实 debug binary 生成 `/tmp/app-server-manifest.json`，验证 manifest 生成链路可运行。
13. `cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server`：通过，确认 host bridge 变更后 debug sidecar binary 可构建。
14. `git diff --check`：通过，无 whitespace / conflict marker 问题。
15. `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：改名后通过，9 个 host adapter 定向测试全部通过。
16. `npm --prefix "packages/app-server-client" test`：改名后通过，9 个 node:test 全部通过。
17. `npx vitest run "src/lib/api/appServer.test.ts"`：通过，5 个前端 App Server helper 单测全部通过。
18. `npx eslint "src/lib/api/appServer.ts" "src/lib/api/appServer.test.ts" --max-warnings 0`：通过。
19. 全局命名扫描通过：仓库和 content-studio 均未发现带品牌前缀的 App Server 命名残留。
20. `npm run typecheck`：通过。
21. `npm run test:contracts`：通过，命令契约、Harness 契约、modality runtime 契约、cleanup report 合同和 docs boundary 均通过。
22. 本轮增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server`：通过。
23. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol`：通过，4 个协议测试通过，覆盖 queue flags camelCase 序列化。
24. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server`：通过，18 个 lib tests、3 个 binary tests、1 个 host boundary integration test 通过。
25. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：通过，9 个 host adapter 定向测试通过。
26. 本轮增量 `npm --prefix "packages/app-server-client" test`：通过，11 个 node:test 通过，覆盖 `AppServerConnection` 与 queue flags request builder。
27. 本轮增量 `npx vitest run "src/lib/api/appServer.test.ts"`：通过，5 个 renderer-safe App Server helper 测试通过。
28. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：通过，10 个 host adapter 定向测试通过，新增覆盖 `hostOptions.asterChatRequest` 旧参数保留。
29. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime agent_app_runtime`：通过，32 个 Agent App Runtime 相关测试通过。
30. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime test_agent_runtime_submit_turn_request_maps_to_aster_chat_request`：通过。
31. 本轮增量 `npm run test:contracts`：通过，命令契约 / mock / docs boundary 未漂移。
32. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime agent_turn_runtime_request`：通过，8 个 Automation agent turn 组包测试通过。
33. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime automation_service`：通过，48 个 Automation service 相关测试通过。
34. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime objective_api`：通过，2 个 objective API 测试通过。
35. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime objective_continuation`：通过，15 个 managed objective continuation 测试通过。
36. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime subagent_runtime`：通过，32 个 subagent runtime 测试通过。
37. 本轮增量旧入口扫描 `rg -n "build_queued_turn_task|runtime_queue_service::submit_runtime_turn|\\.submit_runtime_turn\\(" "lime-rs/src/commands/aster_agent_cmd"`：通过，旧 queue 生产调用只剩 `app_server_host.rs`、queue 内部实现、re-export 和 queue tests。
38. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --no-default-features`：通过，默认 standalone surface 13 个 lib tests、3 个 binary tests、1 个 host boundary integration test 通过。
39. 本轮增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --features aster-backend`：通过，带 Desktop/Aster feature 的 18 个 lib tests、3 个 binary tests、1 个 host boundary integration test 通过。
40. 本轮增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server --no-default-features`：通过，standalone binary 默认不依赖 `lime-agent`。
41. 本轮增量 `cargo tree --manifest-path "lime-rs/Cargo.toml" -p app-server --no-default-features -e features | rg "app-server|lime-agent|aster-backend"`：通过，默认 app-server tree 未出现 `lime-agent` / `aster-backend`。
42. 本轮增量品牌前缀扫描通过：未发现新增带品牌前缀的 App Server 命名。
43. 本轮增量 `git diff --check && git diff --cached --check`：通过。
44. P3.7 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --no-default-features`：通过，14 个 lib tests、3 个 binary tests、2 个 host boundary integration tests 通过。
45. P3.7 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --features aster-backend`：通过，16 个 lib tests、3 个 binary tests、2 个 host boundary integration tests 通过。
46. P3.7 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：通过，11 个 Desktop host adapter 定向测试通过。
47. P3.7 增量 `cargo tree --manifest-path "lime-rs/Cargo.toml" -p app-server --features aster-backend -e features | rg "app-server|lime-agent|aster-backend"`：通过，带 `aster-backend` feature 仍未出现 `lime-agent`，说明 public backend event contract 已脱离 Lime 内部事件 crate。
48. P3.7 增量 `node scripts/check-app-server-client-contract.mjs`：通过，Rust protocol / TS client 关键字段未漂移。
49. P3.7 增量 `npm --prefix "packages/app-server-client" test`：通过，11 个 node:test 通过，新增覆盖 `turnId` 与 `allowEnvOverride=false` packaged resources 路径。
50. P3.7 增量 `npm run test:contracts`：通过，并已包含 `check-app-server-client-contract`。
51. P3.7 增量 `npm run smoke:app-server-stdio`：通过，mock standalone sidecar 最小闭环仍可运行。
52. P3.7 增量 `rg -n "build_queued_turn_task|runtime_queue_service::submit_runtime_turn|\\.submit_runtime_turn\\(" "lime-rs/src/commands/aster_agent_cmd" --glob "*.rs"`：通过，旧 queue 生产调用只剩 `app_server_host.rs`、queue 内部实现、re-export 和 queue tests。
53. P3.8 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过，无新增编译错误。
54. P3.8 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_queue_event_emitter_delegates_to_port`：通过，1 个 queue event port 单测通过。
55. P3.8 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：通过，11 个 Desktop host adapter 定向测试通过。
56. P3.9 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
57. P3.9 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime transient_runtime_status_uses_runtime_queue_event_port`：通过，1 个 queue transient status port 单测通过。
58. P3.9 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_queue_event_emitter_delegates_to_port`：通过，1 个 queue event port 单测通过。
59. P3.9 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：通过，11 个 Desktop host adapter 定向测试通过。
60. P3.10 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
61. P3.10 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime submit_accepted_runtime_status_event_is_preparing_status`：通过。
62. P3.10 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_turn_keepalive_status_event_is_runtime_status`：通过。
63. P3.10 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime transient_runtime_status_uses_runtime_queue_event_port`：通过。
64. P3.10 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：通过，11 个 Desktop host adapter 定向测试通过。
65. P3.11 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
66. P3.11 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime submit_accepted_runtime_status_event_is_preparing_status`：通过。
67. P3.11 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_turn_keepalive_status_event_is_runtime_status`：通过。
68. P3.11 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime transient_runtime_status_uses_runtime_queue_event_port`：通过。
69. P3.11 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime test_runtime_turn_source_emits_task_profile_events_on_current_runtime_chain`：通过。
70. P3.11 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：通过，11 个 Desktop host adapter 定向测试通过。
71. P3.11 增量 `npm run test:contracts`：通过，App Server client contract / command contract / mock / docs boundary 未漂移。
72. P3.12 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
73. P3.12 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
74. P3.12 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_runtime_queue_event_port_appends_direct_runtime_event`：通过，证明 direct event port 可不经 Tauri listener 写入 App Server read model / outbound notification。
75. P3.12 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：通过，12 个 Desktop host adapter 定向测试通过。
76. P3.12 增量 `npm run test:contracts`：通过。
77. P3.12 增量品牌前缀扫描通过：未发现新增带品牌前缀的 App Server 命名。
78. P3.12 增量 `git diff --check && git diff --cached --check`：通过。
79. P3.13 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --check`：通过。
80. P3.13 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
81. P3.13 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_queue_host_ports_can_replace_event_port_without_rebuilding_host_ports`：通过，证明 direct event bridge 可只替换 event port，不重建 execution/projection/objective host ports。
82. P3.13 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime transient_runtime_status_uses_runtime_queue_event_port`：通过，queue transient status 仍走 event port。
83. P3.13 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：通过，12 个 Desktop host adapter 定向测试通过。
84. P3.14 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
85. P3.14 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --check`：通过。
86. P3.14 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：通过，12 个 Desktop host adapter 定向测试通过。
87. P3.15-P3.16 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --check`：通过。
88. P3.15-P3.16 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
89. P3.15-P3.16 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol`：通过，7 个协议 fixture 测试通过。
90. P3.15-P3.16 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client`：通过，5 个 Rust client facade 测试通过。
91. P3.15-P3.16 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host`：通过，12 个 Desktop host adapter 定向测试通过。
92. P3.15-P3.16 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_queue_host_ports_can_replace_event_port_without_rebuilding_host_ports`：通过。
93. P3.15-P3.16 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime transient_runtime_status_uses_runtime_queue_event_port`：通过。
94. P3.15-P3.16 增量 `npm run test:contracts`：通过。
95. P3.15-P3.16 增量品牌前缀扫描通过：未发现新增带品牌前缀的 App Server 命名。
96. P3.15-P3.16 增量 `git diff --check && git diff --cached --check`：通过。
97. P3.17 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" --package lime compaction --lib`：通过，17 个 compaction 相关测试通过。
98. P3.18 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_turn::tests::agent_app_skill`：通过，5 个 Agent App skill 测试通过。
99. P3.19 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
100. P3.19 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime projection --lib`：通过，30 个 projection 相关测试通过。
101. P3.19 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
102. P3.20 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
103. P3.20 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime projection --lib`：通过，30 个 projection 相关测试通过。
104. P3.20 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime submit_accepted_runtime_status_event_is_preparing_status`：通过。
105. P3.20 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
106. P3.21 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime artifact --lib`：通过，107 个 artifact 相关测试通过。
107. P3.21 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime projection --lib`：通过，30 个 projection 相关测试通过。
108. P3.21 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
109. P3.22 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
110. P3.22 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" --package lime compaction --lib`：通过，17 个 compaction 相关测试通过。
111. P3.22 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
112. P3.18 修正增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
113. P3.18 修正增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_turn::tests::agent_app_skill`：通过，5 个 Agent App skill 测试通过。
114. P3.18 修正增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
115. P3.23 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
116. P3.23 增量 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
117. P3.24 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
118. P3.24 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-side-event" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过；使用独立 target-dir 是因为本地 `lime-rs/target` 被外部 `cargo run` 长时间持锁。
119. P3.24 增量 `git diff --check && git diff --cached --check`：通过。
120. P3.25 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
121. P3.25 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-action-required" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
122. P3.25 增量 `git diff --check && git diff --cached --check`：通过。
123. P3.25 增量品牌前缀扫描：通过，未发现新增带品牌前缀的 App Server 命名。
124. P3.26 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
125. P3.26 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-artifact-wrapper" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime artifact --lib`：通过，107 个 artifact 相关测试通过。
126. App Server processor 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check`：通过。
127. App Server processor 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server`：通过，14 个 lib tests、3 个 binary CLI tests、2 个 host boundary integration tests 通过。
128. 收口增量 `git diff --check && git diff --cached --check`：通过。
129. 收口增量品牌前缀扫描：通过，未发现新增带品牌前缀的 App Server 命名。
130. P3.27 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
131. P3.27 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-profile-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
132. P3.28 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
133. P3.28 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-finalize-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
134. P3.29 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
135. P3.29 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-attempt-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
136. P3.30 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
137. P3.30 增量 `rg -n "emit_agent_runtime_profile_event\\(" "lime-rs/src" "lime-rs/crates"`：通过，无旧 wrapper 调用残留。
138. P3.30 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-profile-wrapper-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
139. P3.31 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
140. P3.31 增量 `rg -n "emit_agent_app_runtime_event_projection\\(" "lime-rs/src/commands/aster_agent_cmd/runtime_turn"`：通过，无旧 wrapper 调用残留。
141. P3.31 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-runtime-projection-wrapper-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
142. P3.31 增量 `git diff --check && git diff --cached --check`：通过。
143. P3.31 增量品牌前缀扫描：通过，未发现新增带品牌前缀的 App Server 命名。
144. P3.32 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
145. P3.32 增量 `rg -n "emit_runtime_events\\([^\\n]*,\\s*(app|host\\.app|self\\.app)" "lime-rs/src/commands/aster_agent_cmd/runtime_turn"`：通过，无旧 `AppHandle` 参数形态残留。
146. P3.32 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-runtime-events-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
147. P3.33 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
148. P3.33 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-side-event-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
149. P3.33 增量 `git diff --check && git diff --cached --check`：通过。
150. P3.33 增量品牌前缀扫描：通过，未发现新增带品牌前缀的 App Server 命名。
151. P3.34 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
152. P3.34 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-runtime-events-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
153. P3.35 增量 `rustfmt --edition 2021 "lime-rs/src/commands/aster_agent_cmd/runtime_turn/stream/events.rs" "lime-rs/src/commands/aster_agent_cmd/runtime_turn/stream/attempt.rs"`：通过。
154. P3.35 增量 `git diff --check && git diff --cached --check`：通过。
155. P3.35 增量品牌前缀扫描：通过，未发现新增带品牌前缀的 App Server 命名。
156. P3.35 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-runtime-events-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：未通过，原因是当前工作树删除了 `lime-rs/Cargo.toml` 与 `lime-rs/crates/core/src/lib.rs` 等 workspace 入口文件，`lime-core` 无法读取 `crates/core/src/lib.rs`；这不是 P3.35 stream projection port 的已知类型错误，但仍需恢复工作树状态后复验。
157. P3.36 增量 `rustfmt --edition 2021 "lime-rs/src/commands/aster_agent_cmd/runtime_turn/flow.rs" "lime-rs/src/commands/aster_agent_cmd/runtime_turn/flow/execution.rs"`：通过。
158. P3.36 增量 `rg -n "fn emit_profile_(turn_submitted|task_started|turn_started).*AppHandle|emit_profile_(turn_submitted|task_started|turn_started)\\(host\\.app|emit_profile_(turn_submitted|task_started|turn_started)\\([^\\)]*&AppHandle" "lime-rs/src/commands/aster_agent_cmd/runtime_turn/flow.rs" "lime-rs/src/commands/aster_agent_cmd/runtime_turn/flow/execution.rs"`：通过，无旧 `AppHandle` profile helper 签名或调用残留。
159. P3.36 增量 `git diff --check && git diff --cached --check`：通过。
160. P3.36 增量品牌前缀扫描：通过，未发现新增带品牌前缀的 App Server 命名。
161. 恢复 `lime-rs` 工作树删除状态后，P3.35/P3.36 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
162. `packages/app-server-client` 增量 `npm test --workspace "packages/app-server-client"`：通过，11 个 Node tests 通过，覆盖 JSON-RPC request builder、stdio sidecar launch、release manifest、sha256 和 initialize handshake。
163. P3.35/P3.36 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-runtime-events-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：首次复跑发现 `TauriRuntimeProjectionEventPort` 被 move closure 捕获后的 E0382；已给该引用型 adapter 增加 `Clone, Copy`，再次复跑通过。
164. P3.37 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
165. P3.37 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-runtime-events-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
166. P3.38 增量 `CARGO_TARGET_DIR="/tmp/lime-codex-target/app-server-runtime-events-port" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime`：通过。
167. P3.38 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
168. P3.38 增量 `rg -n "RuntimeStreamEventContext<'a> \\{[^}]*app:|RuntimeStreamEventContext<'a> \\{[^}]*timeline_recorder:|record_runtime_event\\(\\s*context\\.app|record_runtime_event\\([^\\n]*context\\.timeline_recorder" "lime-rs/src/commands/aster_agent_cmd/runtime_turn/stream/events.rs" "lime-rs/src/commands/aster_agent_cmd/runtime_turn/stream/attempt.rs"`：通过，无旧 stream context 直接持有 `AppHandle / timeline_recorder` 或旧记录调用残留。
169. P3.39 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过。
170. P3.39 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime disabled_auto_memory_capture_does_not_touch_host_port --lib`：通过，1 个 memory capture port 单测通过，锁定关闭自动记忆时不触碰 host port。
171. P3.39 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime should_auto_capture_runtime_memory_turn --lib`：通过，2 个自动记忆触发策略测试通过。
172. P3.39 增量 `git diff --check -- "lime-rs/src/commands/aster_agent_cmd/runtime_turn/memory.rs"`：通过。
173. `capability/list` 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server --package app-server-client`：通过。
174. `capability/list` 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" --target-dir "/tmp/lime-appserver-capability-target" -p app-server-protocol -p app-server -p app-server-client`：通过，使用独立 target-dir 避免与并行 Cargo 进程争用 artifact lock。
175. `capability/list` 增量 `npm --prefix "packages/app-server-client" run test`：通过，13 个 Node tests 通过。
176. `capability/list` 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，11 项 Rust protocol / TS client contract guard 通过。
177. P3.40 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --check`：通过。
178. P3.40 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" --target-dir "/tmp/lime-appserver-capability-source-target" -p app-server runtime_core_uses_injected_capability_source`：通过，证明 `RuntimeCore` 的 capability discovery 可由注入 source 驱动。
179. P3.41 参考校准：已只读对照 `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol`，确认 Codex 的 `app/list`、`mcpServerStatus/list` 等 list 请求使用具体 Params DTO 承载可选过滤 / 上下文字段；本轮 `CapabilityListParams { appId?, workspaceId? }` 与该形状一致，不退回无参请求或散装 map。
180. P3.41 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server --package app-server-client --check`：通过。
181. P3.41 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" --target-dir "/tmp/lime-appserver-capability-scope-target" -p app-server-protocol -p app-server -p app-server-client`：通过，16 个 `app-server` lib tests、3 个 bin tests、2 个 host boundary tests、7 个 Rust client tests、8 个 protocol fixture tests 均通过；使用独立 target-dir 避免与并行 Cargo 进程争用 artifact lock。
182. P3.41 增量 `npm --prefix "packages/app-server-client" run test`：通过，13 个 Node tests 通过，覆盖 TS client scoped capability request 与 connection wrapper。
183. P3.41 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，11 项 Rust protocol / runtime / processor / client 与 TS client contract guard 通过。
184. P3.41 增量 `git diff --check -- <本轮 touched files>`：通过。
185. P3.42 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --package app-server-protocol --package app-server-client --check`：通过。
186. P3.42 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" --target-dir "/tmp/lime-appserver-capability-inventory-target" -p app-server-protocol -p app-server -p app-server-client`：通过，20 个 `app-server` lib tests、3 个 bin tests、2 个 host boundary tests、7 个 Rust client tests、8 个 protocol fixture tests 均通过；新增覆盖 inventory scope 过滤、factory source 注入和 host boundary guard。
187. P3.42 增量 `npm --prefix "packages/app-server-client" run test`：通过，14 个 Node tests 通过。
188. P3.42 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，16 项 Rust protocol / capability source / runtime / factory / host guard / client 与 TS client contract guard 通过。
189. P3.42 增量 `git diff --check -- <本轮 touched files>`：通过。
190. P3.43 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --check`：通过。
191. P3.43 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" --target-dir "/tmp/lime-appserver-capability-inventory-target" -p app-server capability_list_flows_through_json_rpc_router_with_scoped_inventory_source`：通过，证明 scoped inventory source 可通过完整 JSON-RPC router 返回。
192. P3.43 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" --target-dir "/tmp/lime-appserver-capability-inventory-target" -p app-server`：通过，21 个 `app-server` lib tests、3 个 bin tests、2 个 host boundary tests 均通过。
193. P3.43 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，18 项 contract guard 通过。
194. P3.43 增量 `git diff --check -- <本轮 touched files>`：通过。
195. P3.44 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server --package app-server-client --check`：通过。
196. P3.44 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" --target-dir "/tmp/lime-appserver-capability-policy-target" -p app-server-protocol -p app-server -p app-server-client`：通过，24 个 `app-server` lib tests、3 个 bin tests、2 个 host boundary tests、7 个 Rust client tests、8 个 protocol fixture tests 均通过；新增覆盖 visible capability allow、hidden capability deny 和 JSON-RPC `CAPABILITY_DENIED`。
197. P3.44 增量 `npm --prefix "packages/app-server-client" run test`：通过，17 个 Node tests 通过，包含 `ERROR_CODES.capabilityDenied`。
198. P3.44 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，21 项 contract guard 通过。
199. P3.45 参考校准：只读对照 `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol` 与 explorer 结果，确认 Codex 参考更偏向 initialize 只协商 client capability、server 清单通过独立 list/read 方法返回；因此本轮没有扩展 initialize response，而是把 `capability/list` 补成 scoped + paginated list。
200. P3.45 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server --package app-server-client --check`：通过。
201. P3.45 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-capability-pagination-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server -p app-server-client`：通过，25 个 `app-server` lib tests、3 个 bin tests、2 个 host boundary tests、7 个 Rust client tests、8 个 protocol fixture tests 均通过；新增覆盖 capability list 分页和 JSON-RPC `nextCursor`。
202. P3.45 增量 `npm --prefix "packages/app-server-client" run test`：通过，18 个 Node tests 通过，覆盖 TS client `cursor / limit` request 和 `nextCursor` response。
203. P3.45 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，23 项 contract guard 通过。
204. P3.45 增量 `git diff --check -- <本轮 touched files>`：通过。
205. P3.46 并行协作盘点：当前另一个进程已占用 `lime-rs/src/agent_tools/inventory.rs`、`lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`lime-rs/crates/app-server/src/capability.rs`、`lime-rs/crates/app-server/src/runtime_factory.rs` 等真实 Desktop inventory adapter 写集；本轮主进程只认领 `packages/app-server-client/*`、`scripts/app-server-sidecar-lifecycle-smoke.mjs`、`scripts/check-app-server-client-contract.mjs`、`src/lib/api/appServer.ts` 与对应测试，未夹写 Rust adapter。
206. P3.46 只读 Rust 子 agent 审阅结论：`capability_inventory_records_from_tool_inventory(...)` 已能把 Desktop tool facts 映射为 `CapabilityInventoryRecord`，但当前 `desktop_app_server_capability_source()` 仍以空 registry / MCP / extension 输入构造 inventory，尚未复用真实 `agent_runtime_get_tool_inventory(...)` 完整采集路径；真实 Desktop / sidecar inventory adapter 未完成。
207. P3.46 只读 content-studio 子 agent 审阅结论：content-studio 适合在 Electron main 通过 npm `app-server-client` 启动 packaged sidecar，renderer 继续只经 preload IPC；建议接入点为 `src/main/services/appServerSidecarService.ts`、`src/main/ipc.ts`、`src/preload/index.ts`、`src/shared/types.ts` 和 renderer Agent projection，不同步 Lime 源码。
208. P3.46 增量 `npm test --workspace "packages/app-server-client"`：通过，20 个 Node tests 通过，覆盖 event router、idle notification loop 与 request response 并发读取缓冲。
209. P3.46 增量 `APP_SERVER_BIN="/tmp/lime-codex-target/app-server-sidecar-lifecycle/debug/app-server" npm run smoke:app-server-sidecar-lifecycle`：通过，输出 `projectedEvents=1`，证明 packaged sidecar lifecycle smoke 覆盖 Electron main 式事件投影。
210. P3.46 增量 `npm run test:contracts`：通过，App Server client contract、command contract、harness contract、modality governance、cleanup report 和 docs boundary 均通过。
211. P3.46 增量品牌前缀扫描：通过，未发现新增带品牌前缀的 App Server 命名。
212. P3.46 增量 `git diff --check -- <本轮 touched files>`：通过。
213. P3.47 参考校准：只读对照 `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server*` 与 explorer 结论，确认 `app-server` crate 应保持 host-independent，server 清单继续走独立 `capability/list`，Desktop / Tauri facts 只在 host adapter 注入 source，不复制 Desktop state / event bus / Webview 管理到 `app-server` crate。
214. P3.47 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --package app-server --check`：通过。
215. P3.47 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-desktop-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server`：通过，25 个 `app-server` lib tests、3 个 binary tests、2 个 host boundary tests 均通过。
216. P3.47 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-desktop-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime tool_inventory --lib`：通过，11 个 tool inventory 相关测试通过，验证共享 inventory 未被 App Server DTO 依赖污染。
217. P3.47 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-desktop-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host --lib`：通过，15 个 App Server host adapter 相关测试通过，新增覆盖 Desktop source 暴露 `tool.Agent`、visible runtime tool 映射和 JSON-RPC `capability/list`。
218. P3.47 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，28 项 contract guard 通过，新增锁定 Desktop adapter 注入真实 tool inventory 和共享 `agent_tools/inventory.rs` 不依赖 App Server DTO。
219. P3.47 增量 `git diff --check -- <本轮 touched files>`：通过。
220. P3.48 增量实现审阅：`agent_runtime_get_tool_inventory(...)` 已改为调用内部 `collect_runtime_tool_inventory(...)`，Desktop `DesktopRuntimeCapabilitySource` 通过 `spawn_refresh(...)` 异步复用 collector，动态读取 runtime registry、current surface tools、MCP 与 extension snapshots 后替换 capability records。
221. P3.48 增量 contract guard 更新：`scripts/check-app-server-client-contract.mjs` 锁定 `DesktopRuntimeCapabilitySource`、`collect_runtime_tool_inventory(...)`、动态 refresh 测试和共享 `agent_tools/inventory.rs` 不依赖 App Server DTO。
222. P3.48 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --package app-server --check`：通过。
223. P3.48 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-desktop-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server`：通过，25 个 `app-server` lib tests、3 个 binary tests、2 个 host boundary tests 均通过。
224. P3.48 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-desktop-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime tool_inventory --lib`：通过，11 个 tool inventory 相关测试通过。
225. P3.48 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-desktop-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host --lib`：通过，16 个 App Server host adapter 相关测试通过，新增覆盖 `DesktopRuntimeCapabilitySource` 从 runtime inventory refresh 后暴露 `tool.custom_visible` 并过滤 caller-hidden tool。
226. P3.48 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，29 项 contract guard 通过。
227. P3.48 增量 `npm run test:contracts`：通过，App Server client contract、command contract、harness contract、modality governance、cleanup report 和 docs boundary 均通过。
228. P3.48 增量 `git diff --check -- <本轮 touched files>`：通过。
229. P3.50 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，29 项 contract guard 通过；新增锁定 readiness-only workspace skill capability 只带 `capability/list`，且 RuntimeCore gate 使用 `METHOD_AGENT_SESSION_TURN_START` 常量判断可执行 method。
230. P3.50 增量 `CARGO_TARGET_DIR="/tmp/app-server-runtime-gate-target-2" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server start_turn`：通过，3 个 start_turn 测试通过，覆盖 visible capability allow、hidden capability deny、readiness-only capability deny 且不持久化 turn。
231. P3.50 增量 `git diff --check && git diff --cached --check`：通过。
232. P3.50/P3.49 复验 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --package app-server --check`：通过。
233. P3.50/P3.49 复验 `CARGO_TARGET_DIR="/tmp/lime-appserver-workspace-skill-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host --lib`：通过，17 个 App Server host adapter 相关测试通过，覆盖 scoped `workspace_skill.capability-report` readiness record、blocked binding 过滤和 readiness-only method。
234. P3.50/P3.49 复验 `CARGO_TARGET_DIR="/tmp/lime-appserver-workspace-skill-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_skill_binding --lib`：通过，9 个 runtime skill binding readiness / enable 投影测试通过。
235. P3.50/P3.49 复验 `CARGO_TARGET_DIR="/tmp/lime-appserver-workspace-skill-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server`：通过，26 个 `app-server` lib tests、3 个 binary tests、2 个 host boundary tests 均通过。
236. P3.50/P3.49 复验 `npm run test:contracts`：通过，App Server client contract、command contract、harness contract、modality governance、cleanup report 和 docs boundary 均通过。
237. P3.50/P3.49 复验 `git diff --check -- <本轮 touched files>`：通过。
238. P3.51 参考复核：只读对照 `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server*`，确认 Codex 没有同名 `capability/list` / session-scoped capability / `runtimeOptions.capabilityId` gate；本轮只借鉴 Codex 将 turn 权限绑定 runtime context 的方向，不复刻 connection-level `InitializeCapabilities.experimentalApi`。
239. P3.51 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-session-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server capability`：通过，17 个 capability 相关测试通过，覆盖 session-scoped inventory filter、`capability/list` session context、unknown session error、session-scoped `runtimeOptions.capabilityId` allow 和 readiness-only deny。
240. P3.51 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-session-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server`：通过，31 个 lib tests、3 个 binary tests、2 个 host boundary tests 通过。
241. P3.51 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-session-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol`：通过，10 个 protocol fixture / method catalog 测试通过，锁定 `capability/list` 的 `sessionId` wire shape。
242. P3.51 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-session-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client`：通过，8 个 Rust client facade 测试通过，锁定 `CapabilityListParams.sessionId` 透传。
243. P3.51 增量 `npm --prefix "packages/app-server-client" test`：通过，21 个独立 TS client / sidecar lifecycle 测试通过，锁定 `CapabilityListParams.sessionId` 与 connection helper。
244. P3.51 增量 `npx vitest run "src/lib/api/appServer.test.ts"`：通过，6 个 renderer-safe App Server helper 测试通过，新增覆盖 `listCapabilities(...)` 透传 `sessionId`。
245. P3.51 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，31 项 contract guard 通过，新增锁定 session-scoped capability context、renderer-safe helper 与 RuntimeCore session gate。
246. P3.51 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server --package app-server-client --package lime --check`：通过。
247. P3.51 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-session-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host --lib`：通过，17 个 Desktop App Server host adapter 测试通过；同时补齐 action/respond 既有增量在 fake/probe host 中缺失的 trait 方法和 move/borrow 编译缺口。
248. P3.51 增量 `npm run test:contracts`：通过，App Server client contract、command contract、harness contract、modality governance、cleanup report 和 docs boundary 均通过。
249. P3.51 增量 `git diff --check -- <本轮 touched files>`：通过。
250. P3.52 参考复核：只读对照 `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server*`，再次确认 Codex 的相关事实仍是 initialize `experimentalApi`、thread/turn `approvalPolicy` / `sandboxPolicy` / permissions override，而不是同名 `capability/list` / `capabilityId` gate；Lime 继续只参考“执行权限绑定 runtime context”的分层，不复制 Codex 协议。
251. P3.52 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --package lime --check`：通过。
252. P3.52 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-policy-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server capability`：通过，18 个 capability 相关测试通过；新增覆盖 executable record helper、RuntimeCore gate helper、session-scoped executable policy allow 与 discovery-only deny。
253. P3.52 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-policy-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host --lib`：通过，19 个 Desktop App Server host adapter 测试通过；新增覆盖 session policy fact 只在 matching session 可见、executable 可启动 turn、discovery-only 不可启动 turn、blocked/denied 不投影。
254. P3.52 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，43 项 contract guard 通过；新增锁定 executable helper、RuntimeCore gate helper 与 Desktop session policy projection seam。
255. P3.52 增量 `npm run test:contracts`：通过，App Server client contract、command contract、harness contract、modality governance、cleanup report 和 docs boundary 均通过。
256. P3.52 增量 `git diff --check -- <本轮 touched files>`：通过。
257. P3.53 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，43 项 contract guard 通过；新增锁定 `agentSession/action/respond` 的 Rust protocol / runtime / Aster backend / Desktop adapter / Rust client / TS client / renderer-safe helper。
258. P3.53 增量 `npm test --workspace "packages/app-server-client"`：通过，23 个独立 TS client / sidecar lifecycle 测试通过；新增覆盖 `AppServerClient.respondAction(...)` 与 `AppServerConnection.respondAction(...)`。
259. P3.53 增量 `npm run test -- "src/lib/api/appServer.test.ts"`：通过，7 个 renderer-safe App Server helper 测试通过；新增覆盖 `AppServerClient.respondAction(...)` 只走 `app_server_handle_json_lines`。
260. P3.53 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server --package app-server-client --package lime --check`：通过。
261. P3.53 增量 `CARGO_TARGET_DIR="/tmp/app-server-action-respond-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server -p app-server-client action`：通过，锁定 protocol fixture 与 Rust client action helper；无 feature 的 `app-server` action filter 当前无匹配 runtime 测试。
262. P3.53 增量 `CARGO_TARGET_DIR="/tmp/app-server-action-respond-client-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client respond_action --lib`：通过，1 个 Rust client facade 测试通过。
263. P3.53 增量 `CARGO_TARGET_DIR="/tmp/app-server-action-respond-host-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime tauri_aster_backend_host_respond_action_maps_protocol_params_to_runtime_request --lib`：通过，1 个 Desktop host adapter 映射测试通过；首次新 target 编译耗时约 12m52s。
264. P3.53 增量 `CARGO_TARGET_DIR="/tmp/app-server-action-respond-aster-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --features aster-backend aster_backend_action_responses_are_mapped_into_runtime_core_events`：首跑发现 Mock Aster host 对 action 测试预备 turn 复用 submit metadata 断言导致失败；修正测试预备 turn 的 metadata / queue flags 后重跑通过，覆盖 feature-gated Aster backend action port。
265. P3.53 增量 `npm run test:contracts`：通过，App Server client contract、command contract、harness contract、modality governance、cleanup report 和 docs boundary 均通过。
266. P3.53 增量 `git diff --check && git diff --cached --check`：通过。
267. P3.54 并行协作盘点：继续避让 `runtime_turn/**` 与 `action_runtime.rs` 既有并行写集，本轮只追加 `app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 和本执行计划的 runtime enable capability projection 收口；Planck 只读审阅指出 stale session policy cache 与 workspace id/root 混用风险，本轮按当前安全口径修掉 stale cache，并把非绝对 `workspaceId` 直接短路为无 projection。
268. P3.54 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --package lime --check`：通过。
269. P3.54 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-runtime-enable-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server capability`：通过，19 个 capability 相关测试通过，覆盖 executable/session/filter/gate 既有回归。
270. P3.54 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-runtime-enable-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_runtime_enable_metadata --lib`：通过，3 个新增 Desktop host adapter 回归通过；覆盖绝对 workspace root + `workspace_skill_runtime_enable` 将 registered skill 投影为 session executable capability、缺失 metadata 清理同 session executable capability、非绝对 `workspaceId` 不误投影。
271. P3.54 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-runtime-enable-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host --lib`：通过，22 个 Desktop App Server host adapter 测试通过。
272. P3.54 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，43 项 contract guard 通过；新增锁定 `prepare_turn_capabilities`、`resolve_workspace_skill_runtime_enable` 接线、绝对 workspace root 门槛与 P3.54 三条测试名。
273. P3.54 增量 `npm run test:contracts`：通过，App Server client contract、command contract、harness contract、modality governance、cleanup report 和 docs boundary 均通过。
274. P3.54 增量 `git diff --check -- <本轮 touched files>`：通过。
275. P3.55 并行协作盘点：继续避让 `runtime_turn/**` 与 `action_runtime.rs` 既有并行写集；本轮认领 `app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 和执行计划中的 workspace id resolver 收口，发现计划已有 P3.56 并行记录后只插入 P3.55，不覆盖 P3.56 内容。
276. P3.55 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check`：通过；`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --package lime --check` 首跑仍会报告隔壁 P3.56 已处理前的 `processor.rs` / `runtime.rs` 格式差异，本轮未改非认领文件。
277. P3.55 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-workspace-resolver-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_runtime_enable_metadata --lib`：通过，6 个 Desktop runtime enable metadata 回归通过，覆盖绝对 workspace root、workspace id -> root resolver、缺失 metadata 清理、非绝对 id 无 resolver 不投影、resolver 找不到 id 不投影、metadata root 与 resolver root 不一致不投影。
278. P3.55 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-workspace-resolver-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host --lib`：通过，25 个 Desktop App Server host adapter 相关测试通过。
279. P3.55 增量 `CARGO_TARGET_DIR="/tmp/lime-appserver-workspace-resolver-capability-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server capability`：通过，19 个 App Server capability 相关测试通过；`app-server` crate 仍有既有 `ensure_capability_allowed` dead_code warning。
280. P3.55 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，52 项 contract guard 通过；新增锁定 `DesktopWorkspaceRootResolver`、`WorkspaceManager::get()` resolver、`resolve_workspace_skill_runtime_enable(..., &workspace_root)` 接线和 P3.55 三条 resolver 测试名。
281. P3.55 增量 `npm run test:contracts`：通过，App Server client contract、command contract、harness contract、modality governance、cleanup report 和 docs boundary 均通过。
282. P3.55 增量 `git diff --check -- <本轮 touched files>`：通过。
283. P3.56 并行协作盘点：本轮只认领 `artifact/read` current JSON-RPC summary loop 验证与执行计划记录；继续避让隔壁进程写集 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`，不夹写 Desktop host adapter。
284. P3.56 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server --package app-server-client --check`：首跑发现 `processor.rs` 断言换行与 `runtime.rs` 测试链式调用缩进未过 rustfmt；修正格式后复跑通过。
285. P3.56 增量 `CARGO_TARGET_DIR="/tmp/app-server-artifact-read-protocol-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol artifact_read`：通过，锁定 `artifact/read` request fixture shape。
286. P3.56 增量 `CARGO_TARGET_DIR="/tmp/app-server-artifact-read-server-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_artifacts`：通过，锁定 RuntimeCore 从已存 `AgentEvent` 提取 artifact summary、按 `artifactRef` 去重并保留最新事件。
287. P3.56 增量 `CARGO_TARGET_DIR="/tmp/app-server-artifact-read-server-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server artifact_read`：通过，锁定 JSON-RPC router 初始化门禁与 response shape；`app-server` crate 仍有既有 `ensure_capability_allowed` dead_code warning。
288. P3.56 增量 `CARGO_TARGET_DIR="/tmp/app-server-artifact-read-client-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client read_artifacts --lib`：通过，锁定 Rust client facade 透传 filter 与稳定 method。
289. P3.56 增量 `npm test --workspace "packages/app-server-client"`：通过，25 个 Node tests 通过，覆盖 `readArtifacts(...)` request builder、response shape 与 connection wrapper。
290. P3.56 增量 `npm run test -- "src/lib/api/appServer.test.ts"`：通过，8 个 renderer-safe App Server helper tests 通过，覆盖 `AppServerClient.readArtifacts(...)` 只走 `app_server_handle_json_lines`。
291. P3.56 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，52 项 contract guard 通过，锁定 Rust protocol / runtime / processor / clients、TS client、renderer-safe helper 与 renderer test 同步。
292. P3.56 增量 `git diff --check && git diff --cached --check`：通过。
293. P3.57 并行协作盘点：当前无相关 Cargo 进程运行；本轮只认领 `artifact/read` content provider seam，继续避让 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`，不夹写 Desktop host adapter。
294. P3.57 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server --package app-server-client --check`：通过。
295. P3.57 增量 `CARGO_TARGET_DIR="/tmp/app-server-artifact-content-protocol-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol artifact_read`：通过，锁定 `includeContent` wire shape。
296. P3.57 增量 `CARGO_TARGET_DIR="/tmp/app-server-artifact-content-server-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_artifacts`：首跑发现新增 provider 测试向不存在 turn 追加事件导致 `TurnNotActive("turn_content")`；修正为 session-level artifact event 后复跑通过，2 个 RuntimeCore artifact tests 通过，覆盖默认不返回 content、`includeContent=true` 调用注入 provider。
297. P3.57 增量 `CARGO_TARGET_DIR="/tmp/app-server-artifact-content-server-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server artifact_read`：通过，锁定 JSON-RPC router 初始化门禁与 artifact/read response shape；`app-server` crate 仍有既有 `ensure_capability_allowed` dead_code warning。
298. P3.57 增量 `CARGO_TARGET_DIR="/tmp/app-server-artifact-content-client-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client read_artifacts --lib`：通过，锁定 Rust client 透传 `includeContent` 与稳定 method。
299. P3.57 增量 `npm test --workspace "packages/app-server-client"`：通过，25 个 Node tests 通过，覆盖 TS client `includeContent` request builder、connection wrapper 与 content response。
300. P3.57 增量 `npm run test -- "src/lib/api/appServer.test.ts"`：通过，8 个 renderer-safe App Server helper tests 通过，覆盖 `includeContent` 透传和 content response。
301. P3.57 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，52 项 contract guard 通过，新增锁定 `ArtifactContentProvider` seam、`includeContent` 参数和 TS/renderer content 断言。
302. P3.57 增量 `git diff --check && git diff --cached --check`：通过。
303. P3.58 并行协作盘点：当前无相关 Cargo 进程运行；本轮只认领 `app-server` crate 的受限 filesystem artifact provider、contract guard 和执行计划记录，继续避让 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`，不夹写 Desktop host adapter。
304. P3.58 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --check`：通过。
305. P3.58 增量 `CARGO_TARGET_DIR="/tmp/app-server-artifact-file-provider-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server filesystem_artifact_content_provider`：通过，2 个文件 provider 测试通过，覆盖 allow-root 相对路径读取、`..` 逃逸拒绝和超限回退。
306. P3.58 增量 `CARGO_TARGET_DIR="/tmp/app-server-artifact-file-provider-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_artifacts`：通过，2 个 RuntimeCore artifact tests 通过，覆盖 summary/content provider 既有行为。
307. P3.58 增量 `CARGO_TARGET_DIR="/tmp/app-server-artifact-file-provider-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server artifact_read`：通过，锁定 JSON-RPC router 初始化门禁与 artifact/read response shape；`app-server` crate 仍有既有 `ensure_capability_allowed` dead_code warning。
308. P3.58 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，52 项 contract guard 通过，新增锁定 `FilesystemArtifactContentProvider`、默认大小限制、相对路径校验 helper 和文件 provider 回归名。
309. P3.58 增量 `git diff --check && git diff --cached --check`：通过。
310. P3.59 并行协作盘点：本轮只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 和本执行计划中的 Desktop artifact provider 注入收口；`app-server` crate 继续保持 host-independent，Desktop workspace id/root 解析只留在 Tauri host adapter。
311. P3.59 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --package app-server --check`：通过。
312. P3.59 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，52 项 contract guard 通过；新增明确锁定 `ArtifactContentRequest`、`DesktopArtifactContentProvider`、`desktop_artifact_content_provider_with_runtime(...)`、三处 `aster_runtime_core_with_sources(...)` 注入和 Desktop provider 回归名。
313. P3.59 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_artifact_content_provider --lib`：通过，2 个 Desktop artifact provider 测试通过，覆盖 session `workspaceId` -> workspace root -> 受限 filesystem provider 读取，以及绝对路径 workspace id 作为 root 的回归。
314. P3.59 首次尝试 `CARGO_TARGET_DIR="/tmp/lime-appserver-desktop-artifact-provider-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_artifact_content_provider --lib`：失败原因是本机磁盘空间耗尽，`icrate` / `lime-core` / OpenSSL 构建报告 `No space left on device`，不是代码断言失败；后续改用默认 `lime-rs/target` 复用缓存后定向测试通过。
315. P3.59 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_host --lib`：首跑因并行默认 target/冷编译竞争失败在环境层，`tauri::generate_context!()` 瞬时读不到 Cargo registry 中 `tauri-2.11.2/scripts/bundle.global.js`；复查后文件已恢复存在，复跑通过，27 个 Desktop App Server host adapter 相关测试通过，覆盖 capability source、session policy、event bridge、action/respond、Desktop artifact provider 和 host options。
316. P3.60 并行协作盘点：本轮只认领 `lime-rs/crates/app-server/src/lib.rs`、`scripts/check-app-server-client-contract.mjs` 和本执行计划中的真实 App Server Agent flow 冒烟闭环；继续避让隔壁 `desktop_artifact_content_provider` cargo 进程和 Desktop host adapter 写集。
317. P3.60 增量实现：新增 feature-gated `aster_backend_json_rpc_agent_flow_smoke_covers_artifact_read_and_action_response`，通过 `AppServerRuntimeFactory::aster_app_server(...)` 真实走 `initialize -> initialized -> agentSession/start -> agentSession/turn/start -> agentSession/event -> artifact/read -> agentSession/action/respond -> agentSession/event`，并用专用 Aster host mock 返回 `artifact.snapshot` 与 `action.resolved` 事件，证明 current JSON-RPC 主链闭环。
318. P3.60 增量守卫：`scripts/check-app-server-client-contract.mjs` 新增 App Server Aster flow smoke guard，锁定专用 host、`METHOD_ARTIFACT_READ`、`METHOD_AGENT_SESSION_ACTION_RESPOND`、`ArtifactReadParams`、`AgentSessionActionRespondParams` 与 action/artifact notification 断言同现，防止后续只保留半条链。
319. P3.60 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --check`：首跑只发现新增测试里 artifact response 链式调用需 rustfmt 换行，修正后复跑通过。
320. P3.60 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，53 项 contract guard 通过，新增锁定真实 Aster JSON-RPC flow smoke。
321. P3.60 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --features aster-backend aster_backend_json_rpc_agent_flow_smoke_covers_artifact_read_and_action_response --lib`：通过，1 个 feature-gated flow smoke 测试通过；`app-server` crate 仍有既有 `ensure_capability_allowed` dead_code warning。
322. P3.61 并行协作盘点：本轮认领 `evidence/export` current JSON-RPC skeleton 的协议 / RuntimeCore / processor / Rust client / TS client / renderer helper / contract guard / 执行计划写集；继续避让 `lime-rs/src/commands/aster_agent_cmd/runtime_turn/**`、`lime-rs/src/commands/aster_agent_cmd/action_runtime.rs` 和 Desktop host adapter 相邻写集。
323. P3.61 增量实现：`evidence/export` 进入 `app-server-protocol`、`RuntimeCore::export_evidence(...)`、JSON-RPC processor、`app-server` facade、Rust `app-server-client`、npm `packages/app-server-client` 与 renderer-safe `src/lib/api/appServer.ts`；响应只导出 current read model snapshot：`session / turns / events / artifacts / exportedAt`，`turnId` 只过滤 turns/events/artifacts，`includeEvents/includeArtifacts` 默认开启。
324. P3.61 范围收窄：本轮明确不接 Desktop timeline、harness evidence pack、artifact 文件内容读取、压缩包或 completion audit 派生字段；`threadStatus / latestTurnStatus / eventCount / artifactCount / evidenceRefs / knownGaps / completionAuditSummary` 不进入 P3.61 协议 DTO，后续只能通过真实 evidence pack adapter 重新设计。
325. P3.61 增量守卫：`scripts/check-app-server-client-contract.mjs` 扩展到 61 项检查，锁定 Rust protocol / runtime / processor / facade / Rust client / TS client / renderer helper / renderer test 的 `evidence/export` 同步，并用 absent guard 防止 P3.61 skeleton 重新漂移成完整 evidence pack。
326. P3.61 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server --package app-server-client --check`：通过；首跑发现 `app-server/src/lib.rs` 仍有 P3.60 smoke 的 completion audit 断言，已收窄为 current snapshot 后复跑通过。
327. P3.61 增量 `CARGO_TARGET_DIR="/tmp/app-server-evidence-export-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol evidence_export`：通过，2 个 protocol fixture 测试通过。
328. P3.61 增量 `CARGO_TARGET_DIR="/tmp/app-server-evidence-export-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence`：通过，1 个 RuntimeCore evidence snapshot 测试通过；`app-server` crate 仍有既有 `ensure_capability_allowed` dead_code warning。
329. P3.61 增量 `CARGO_TARGET_DIR="/tmp/app-server-evidence-export-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_export`：通过，1 个 processor JSON-RPC 初始化门禁与 response shape 测试通过；同样保留既有 warning。
330. P3.61 增量 `CARGO_TARGET_DIR="/tmp/app-server-evidence-export-client-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client export_evidence --lib`：通过，1 个 Rust client facade 测试通过。
331. P3.61 增量 `npm test --workspace "packages/app-server-client"`：通过，27 个 Node tests 通过，新增覆盖 `AppServerClient.exportEvidence(...)` 与 `AppServerConnection.exportEvidence(...)`。
332. P3.61 增量 `npm run test -- "src/lib/api/appServer.test.ts"`：通过，9 个 renderer-safe App Server helper tests 通过，新增覆盖 `AppServerClient.exportEvidence(...)` 只走 `app_server_handle_json_lines`。
333. P3.61 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，61 项 contract guard 通过。
334. P3.61 增量 `npm run test:contracts`：通过，App Server client contract、command contract、harness contract、modality governance、cleanup report 和 docs boundary 均通过。
335. P3.61 增量 `CARGO_TARGET_DIR="/tmp/app-server-evidence-export-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --features aster-backend aster_backend_json_rpc_agent_flow_smoke_covers_artifact_read_and_action_response --lib`：首跑发现 P3.60 smoke 期望遗漏 `message.delta` payload 中已有 `evidenceRefs`，补齐原样投影断言后复跑通过。
336. P3.61 增量 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server -p app-server-client evidence --lib`：通过，5 个 evidence 相关 Rust lib tests 通过；初始等待默认 `lime-rs/target` artifact lock，未中断并行编译进程。
337. P3.61 审计补强：只读子代理确认 protocol / runtime / processor / Rust client / TS client / renderer helper 已闭环，仅指出 `artifactCount` 尚未进入 absent guard；本轮补到 Rust protocol / runtime、TS client 与 renderer helper contract guard，不扩大 evidence DTO。
338. P3.61 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，61 项 contract guard 通过，并继续阻止 `completionAuditSummary / evidenceRefs / eventCount / artifactCount` 进入 P3.61 skeleton。
339. P3.61 增量 `git diff --check && git diff --cached --check`：通过。
340. P3.62 并行协作盘点：本轮只认领 `evidence/export` evidence pack provider seam 的协议 / RuntimeCore / factory / Rust client / TS client / renderer helper / contract guard / 执行计划写集；继续避让 `lime-rs/src/commands/aster_agent_cmd/runtime_turn/**`、`lime-rs/src/commands/aster_agent_cmd/action_runtime.rs` 和 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`，不夹写 Desktop adapter。
341. P3.62 增量实现：`EvidenceExportParams` 新增 `includeEvidencePack`，`EvidenceExportResponse` 新增可选 `evidencePack`；`EvidencePackSummary / EvidencePackArtifact` 只作为 wire DTO 表达真实 pack 结果，`RuntimeCore` 新增 host-independent `EvidenceExportProvider` / `EvidencePackRequest` / `NoopEvidenceExportProvider`，默认 standalone mock server 返回 `None`，注入 provider 时在释放 state mutex 后接收 `session / turns / events / artifacts` current snapshot。
342. P3.62 范围收窄：本轮不把 Desktop `agent_runtime_export_evidence_pack` 或 `runtime_evidence_pack_service.rs` 搬进 `app-server` crate；不在 `RuntimeCore` 内计算 `completionAuditSummary / knownGaps / evidenceRefs / eventCount / artifactCount` 等派生字段；这些字段只允许出现在真实 provider 返回的 `evidencePack` 下。
343. P3.62 增量守卫：`scripts/check-app-server-client-contract.mjs` 扩展到 67 项检查，锁定 Rust protocol DTO、`EvidenceExportProvider` seam、factory 注入函数、Rust client `includeEvidencePack`、TS client / renderer helper 的 `EvidencePackSummary` 类型，并继续用 absent guard 阻止旧顶层 evidence summary 字段回流。
344. P3.62 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server --package app-server-client -- --check`：通过。
345. P3.62 增量 `CARGO_TARGET_DIR="/tmp/app-server-evidence-pack-provider-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol evidence_export`：通过，2 个 protocol fixture 测试通过，锁定 `includeEvidencePack` request 与嵌套 `evidencePack` response shape。
346. P3.62 增量 `CARGO_TARGET_DIR="/tmp/app-server-evidence-pack-provider-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence`：通过，3 个 RuntimeCore evidence tests 通过，覆盖默认 no-op 不伪造 evidence pack、注入 provider 接收 current snapshot、`includeEvidencePack=false` 不调用 provider；`app-server` crate 仍有既有 `ensure_capability_allowed` dead_code warning。
347. P3.62 增量 `CARGO_TARGET_DIR="/tmp/app-server-evidence-pack-provider-client-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client export_evidence --lib`：通过，1 个 Rust client facade 测试通过，锁定 `includeEvidencePack` 透传。
348. P3.62 增量 `npm test --workspace "packages/app-server-client"`：通过，27 个 Node tests 通过，覆盖 TS client `includeEvidencePack` request、connection wrapper 和 `evidencePack.completionAuditSummary` 嵌套 response。
349. P3.62 增量 `npm run test -- "src/lib/api/appServer.test.ts"`：通过，9 个 renderer-safe App Server helper tests 通过，覆盖 `includeEvidencePack` 透传和嵌套 `evidencePack` response。
350. P3.62 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，67 项 contract guard 通过。
351. P3.62 增量 `npm run test:contracts`：通过，App Server client contract、command contract、harness contract、modality governance、cleanup report 和 docs boundary 均通过。
352. P3.62 增量 `CARGO_TARGET_DIR="/tmp/app-server-evidence-pack-provider-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_export`：通过，1 个 JSON-RPC processor 初始化门禁与 response shape 测试通过；`app-server` crate 仍有既有 `ensure_capability_allowed` dead_code warning。
353. P3.62 增量 `CARGO_TARGET_DIR="/tmp/app-server-evidence-pack-provider-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --features aster-backend aster_backend_json_rpc_agent_flow_smoke_covers_artifact_read_and_action_response --lib`：通过，1 个 feature-gated Aster flow smoke 通过，证明新增 DTO 不破坏 `turn/start -> event -> artifact/read -> action/respond` current JSON-RPC 主链。
354. P3.62 并行守卫协调：并行 sidecar backend-mode 守卫要求 `ResolveSidecarFromManifestOptions.backendMode` 类型片段以逗号分隔；本轮在共享写集内做语法等价调整后复跑 `node "scripts/check-app-server-client-contract.mjs"` 通过，67 项 contract guard 通过。
355. P3.62 增量 `npm test --workspace "packages/app-server-client"`：复跑通过，27 个 Node tests 通过，确认 sidecar 守卫协调不破坏 TS client build。
356. P3.62 增量 `git diff --check && git diff --cached --check`：通过。
357. P3.63 并行协作盘点：本轮只认领 standalone sidecar backend mode 边界、npm `app-server-client` sidecar launch 默认参数、contract guard 和执行计划记录；继续避让 Desktop adapter、`runtime_turn/**` 与 evidence pack provider 既有写集，不覆盖隔壁进程的 P3.62 结果。
358. P3.63 增量实现：standalone `app-server` binary 默认 backend 从 `mock` 改为 `unavailable`，`--backend mock` 只作为显式开发 / 测试模式；`UnavailableBackend` 对 `turn/start`、`turn/cancel`、`action/respond` 返回稳定 `standalone app-server backend is not configured`，`RuntimeCore::start_turn(...)` 在 backend 失败后回滚已插入 turn 并恢复 session，避免独立 App 把 mock 误认为真实 Agent。
359. P3.63 npm client 边界：`packages/app-server-client` 新增 `DEFAULT_STANDALONE_BACKEND_MODE = "unavailable"`，`stdioSidecar(...)`、release manifest sidecar config 和低层 `sidecarArgs(...)` 默认都输出 `--backend unavailable`；显式 `backendMode: "mock"` 仍可生成 mock 参数，用于本地 smoke 或假 sidecar，不作为 packaged / independent app 默认。
360. P3.63 增量守卫：`scripts/check-app-server-client-contract.mjs` 维持 67 项检查并新增锁定 Rust CLI 默认 `Unavailable`、TS 默认常量、`sidecarArgs` 默认 fallback、manifest resolution 默认 backend 和显式 mock 测试，防止 standalone 默认 mock 回流。
361. P3.63 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --package app-server-protocol --package app-server-client --check`：通过。
362. P3.63 增量 `CARGO_TARGET_DIR="/tmp/app-server-standalone-backend-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server parse_args --bin app-server`：通过，4 个 CLI 参数测试覆盖默认 unavailable、显式 mock、显式 unavailable 和拒绝 standalone `aster`。
363. P3.63 增量 `CARGO_TARGET_DIR="/tmp/app-server-standalone-backend-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server unavailable --lib`：通过，2 个测试覆盖 unavailable runtime 构建与 backend 失败不持久化 fake turn；并行 Cargo lock 等待未中断其他进程。
364. P3.63 增量 `CARGO_TARGET_DIR="/tmp/app-server-standalone-backend-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server backend_mode --lib`：通过，1 个 backend mode 测试覆盖 `mock / unavailable` parse 与 `aster` 拒绝。
365. P3.63 增量 `CARGO_TARGET_DIR="/tmp/app-server-standalone-backend-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence --lib`：通过，4 个 evidence 相关测试通过，证明本轮 backend 默认边界不破坏 P3.61/P3.62 evidence/export current path。
366. P3.63 增量 `npm test --workspace "packages/app-server-client"`：通过，27 个 Node tests 通过，覆盖 sidecar 默认 unavailable、显式 mock、manifest resolution、packaged lifecycle 和 stdio handshake。
367. P3.63 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，67 项 contract guard 通过。
368. P3.63 增量 `git diff --check -- <本轮 touched files>` 与 `git diff --cached --check -- <本轮 touched files>`：通过。
369. P3.64 并行协作盘点：本轮只认领 standalone app policy / capability source 配置入口、`app-server-client` sidecar `appPolicyPath` 参数、contract guard 和执行计划记录；继续避让 Desktop adapter、`runtime_turn/**` 与 evidence pack provider 写集。
370. P3.64 增量实现：`app-server/src/capability.rs` 新增 host-independent `AppPolicyManifest / AppPolicyCapability` 与 `capability_source_from_app_policy_json(...)`，可从 JSON policy manifest 构造 `CapabilityInventorySource`，并按 `appIds / workspaceIds / sessionIds` 过滤能力；空 id、空 title、空 methods 会在加载期失败。
371. P3.64 standalone CLI：`app-server --app-policy <path>` 会读取 JSON policy 并注入 `CapabilitySource`；默认 backend 仍是 `unavailable`，`--backend mock` 只显式用于开发 / 测试。该入口只解决独立 App capability / policy source，不把 mock 伪装成真实 Agent Query Loop。
372. P3.64 npm client：`SidecarLaunchConfig`、`stdioSidecar(...)`、release manifest resolution 和 `sidecarArgs(...)` 支持 `appPolicyPath`，独立 App 可通过 `app-server-client` 生成 `--app-policy <path>`，无需手写底层 sidecar args。
373. P3.64 增量守卫：`scripts/check-app-server-client-contract.mjs` 扩展到 70 项检查，锁定 Rust app policy manifest、facade re-export、factory capability source 注入、CLI `--app-policy`、TS `appPolicyPath` 与 sidecar args 测试，防止 policy source 退回 Desktop 私有 adapter 或手写 args。
374. P3.64 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --package app-server-protocol --package app-server-client --check`：通过。
375. P3.64 增量 `CARGO_TARGET_DIR="/tmp/app-server-app-policy-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server app_policy --lib`：通过，2 个 policy manifest 测试覆盖 scoped capability source 和不完整 policy 拒绝。
376. P3.64 增量 `CARGO_TARGET_DIR="/tmp/app-server-app-policy-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server app_policy --bin app-server`：通过，2 个 CLI policy 测试覆盖 `--app-policy` 参数解析与从 JSON 文件读取 scoped capability source。
377. P3.64 增量 `CARGO_TARGET_DIR="/tmp/app-server-app-policy-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server capability --lib`：通过，22 个 capability 相关测试通过，覆盖 policy manifest、session scope、capability gate 与 JSON-RPC router。
378. P3.64 增量 `CARGO_TARGET_DIR="/tmp/app-server-app-policy-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server capability_source --lib`：通过，5 个 capability source / factory 注入测试通过。
379. P3.64 增量 `CARGO_TARGET_DIR="/tmp/app-server-app-policy-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server parse_args --bin app-server`：通过，5 个 CLI 参数测试覆盖默认 unavailable、显式 mock、显式 unavailable、`--app-policy` 和拒绝 standalone `aster`。
380. P3.64 增量 `npm test --workspace "packages/app-server-client"`：通过，27 个 Node tests 通过，覆盖 `appPolicyPath` sidecar args、manifest resolution、packaged lifecycle 与 stdio handshake。
381. P3.64 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，70 项 contract guard 通过。
382. P3.65 并行协作盘点：本轮只认领 standalone external backend seam、CLI launch options、npm `app-server-client` sidecar external 参数、contract guard 和本执行计划记录；继续避让 Desktop adapter、`runtime_turn/**` 与 content-studio 仓库，不夹写并行进程的目标文件。
383. P3.65 增量实现：`app-server` 新增 host-independent `ExternalBackend / ExternalBackendConfig`，每次 backend 调用以 command + args 分离方式启动外部进程，stdin 写入一行 JSON `{ kind, request }`，stdout 读取 `{ events }` 并映射为 `RuntimeEvent`；支持 `turnStart / turnCancel / actionRespond`，默认超时 `30000ms`，空 command、spawn、timeout、非零退出与 response decode 都走明确 backend error。
384. P3.65 standalone CLI：`app-server --backend external --backend-command <path> [--backend-arg value...] [--backend-timeout-ms ms]` 进入 current 主链，可与 `--app-policy <path>` 组合；未配置 command 时启动前失败，不回退 mock，不依赖 Desktop host。
385. P3.65 runtime factory：`AppServerBackendMode::External`、`external_runtime_core(...)`、`external_app_server(...)` 与 capability source 注入函数已进入 `app-server` facade，独立 App 可用同一 RuntimeCore / JSON-RPC surface 接真实 backend。
386. P3.65 npm client：`SidecarLaunchConfig` 与 release manifest resolution 支持 `backendMode: "external"`、`backendCommand`、`backendArgs`、`backendTimeoutMs` 和 `appPolicyPath`，`sidecarArgs(...)` 输出 Codex 风格 stdio sidecar 参数，保持 command / args 分离，不要求 consumer 手写 shell 字符串。
387. P3.65 增量守卫：`scripts/check-app-server-client-contract.mjs` 扩展到 73 项检查，锁定 Rust external backend module / re-export / CLI / factory、TS sidecar external 参数和 Node tests，防止 standalone 真实 backend 入口退回 mock 或 Desktop 私有 adapter。
388. P3.65 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --package app-server-protocol --package app-server-client --check`：通过。
389. P3.65 增量 `CARGO_TARGET_DIR="/tmp/app-server-external-backend-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server external --lib`：通过，8 个 external 相关 lib tests 通过，覆盖外部进程调用、RuntimeEvent 映射、factory external runtime、event notification 和 sequence/turn scope；仍有既有 `ensure_capability_allowed` / test helper dead_code warning。
390. P3.65 增量 `CARGO_TARGET_DIR="/tmp/app-server-external-backend-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server backend_mode --lib`：通过，1 个 backend mode 测试覆盖 external / mock / unavailable 显式解析和 standalone 拒绝 `aster`。
391. P3.65 增量 `CARGO_TARGET_DIR="/tmp/app-server-external-backend-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server parse_args --bin app-server`：通过，6 个 CLI 参数测试覆盖默认 unavailable、显式 mock、显式 unavailable、external command / args / timeout、`--app-policy` 和拒绝 `aster`。
392. P3.65 增量 `npm test --workspace "packages/app-server-client"`：通过，27 个 Node tests 通过，覆盖 external sidecar args、manifest resolution、packaged lifecycle 和 stdio handshake。
393. P3.65 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，73 项 contract guard 通过。
394. P3.66 并行协作盘点：本轮只认领 independent external backend smoke、npm smoke 入口、contract guard 和本执行计划记录；继续避让 Desktop adapter、`runtime_turn/**`、release notes 与 content-studio 仓库，不夹写并行进程的目标文件。
395. P3.66 增量实现：新增 `scripts/app-server-external-backend-smoke.mjs`，临时生成 content-studio app policy 和可执行 Node Query Loop backend command，启动真实 `app-server` sidecar，走 `initialize -> capability/list -> agentSession/start -> agentSession/turn/start -> agentSession/event -> artifact/read -> evidence/export`，证明 external backend 不是 mock 包装。
396. P3.66 npm 入口：`package.json` 新增 `smoke:app-server-external-backend`，先构建 `packages/app-server-client`，再运行独立 App external backend smoke；脚本可通过 `APP_SERVER_BIN=/path/to/app-server` 指向打包或临时构建产物。
397. P3.66 增量守卫：`scripts/check-app-server-client-contract.mjs` 扩展到 75 项检查，锁定 external backend smoke、npm 入口、`backendMode: "external"`、`backendCommand`、`appPolicyPath`、`message.delta`、`artifact.snapshot`、`artifact/read` 和 `evidence/export` 同链路，防止 future regression 退回 mock / unavailable。
398. P3.66 增量 `CARGO_TARGET_DIR="/tmp/app-server-external-smoke-target" cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server`：通过，生成 `/tmp/app-server-external-smoke-target/debug/app-server`；仅保留既有 `ensure_capability_allowed` dead_code warning。
399. P3.66 增量 `APP_SERVER_BIN="/tmp/app-server-external-smoke-target/debug/app-server" npm run smoke:app-server-external-backend`：通过，输出 `capabilities=content.draft.generate events=message.delta,artifact.snapshot artifacts=1`，证明真实 standalone sidecar + external backend command + policy + artifact/evidence current 链路可运行。
400. P3.66 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，75 项 contract guard 通过。
401. P3.66 增量 `npm test --workspace "packages/app-server-client"`：通过，27 个 Node tests 通过，确认 external smoke 入口与 client build/test 不冲突。
402. P3.67 并行协作盘点：本轮只认领 Codex reference 四个 crate 分层对齐、`app-server-protocol / transport / daemon / test-client` 工具层和本执行计划记录；继续避让 Desktop adapter、`runtime_turn/**`、release notes、content-studio 与 external backend smoke 相邻写集，不夹写隔壁进程结果。
403. P3.67 参考范围收窄：只参考 Codex `app-server-daemon / app-server-protocol / app-server-transport / app-server-test-client` 的机制分层，不搬 Codex `thread / turn / item` 业务对象、remote control、websocket、账号、插件、install.sh、Unix-only daemon 或 `$CODEX_HOME` 路径假设。
404. P3.67 transport 增量：`app-server-transport` 新增 `ConnectionId / ConnectionOrigin / OutgoingMessage / QueuedOutgoingMessage / CHANNEL_CAPACITY`，作为后续 writer queue / in-process transport 的通用连接与出站消息模型；JSONL codec 测试补齐空行、trim、request / notification / response / error round-trip、connection id 与 queued message 起始状态。
405. P3.67 protocol 增量：`app-server-protocol` 新增 schema fixture manifest、canonical fixture tree 生成 / 读写 / normalize helper；manifest 只列 Lime current `APP_SERVER_METHODS` 与 JSON-RPC envelope 事实，不引入 Codex 业务 schema，生成端和读回端统一 canonical JSON，避免 fixture 顺序漂移。
406. P3.67 daemon 增量：`app-server-daemon` 新增 `DaemonSettings` 与 managed sidecar identity helper，支持 camelCase JSON settings、缺失文件默认值、保存时创建父目录、平台资源布局路径和 binary sha256 identity；不引入 Codex daemon 安装器或生产自启动语义。
407. P3.67 test-client 增量：`app-server-test-client` 新增 `initialize-line / initialized-line / capability-list-line / smoke-lines` 子命令与库函数，输出 Lime current `initialize -> initialized -> capability/list` JSONL smoke 样例；未知参数继续兼容旧行为，当作 client name 输出 initialize line。
408. P3.67 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server-transport --package app-server-daemon --package app-server-test-client --check`：通过。
409. P3.67 增量 `CARGO_TARGET_DIR="/tmp/app-server-codex-reference-crates-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server-transport -p app-server-daemon -p app-server-test-client`：通过，`app-server-daemon` 15 个、`app-server-protocol` 16 个、`app-server-test-client` lib 3 个、bin 0 个、`app-server-transport` 5 个测试通过。
410. P3.67 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，75 项 contract guard 通过，确认新增工具层未冲撞 App Server client current contract。
411. P3.67 增量 `git diff --check -- "lime-rs/crates/app-server-protocol" "lime-rs/crates/app-server-transport" "lime-rs/crates/app-server-daemon" "lime-rs/crates/app-server-test-client"` 与 `git diff --cached --check -- <同四个 crate>`：通过。
412. P3.68 跨仓库协作盘点：本轮只在 `/Users/coso/Documents/dev/ai/limecloud/content-studio` 认领 App Server 试点写集：`src/main/services/appServerSidecarService.ts`、`scripts/app-server-smoke.mjs`、`resources/app-server/**`、content-studio 路线图文档、`electron-builder.yml`、`package.json`、`src/shared/types.ts`、`src/main/ipc.ts`、`src/preload/index.ts` 和定向 functional 测试；避让 content-studio 中并行图片生产 / UI 改动，不覆盖隔壁进程文件。
413. P3.68 content-studio main sidecar service：新增 `AppServerSidecarService`，main 进程直接使用 JSONL protocol 启动 Lime `app-server --stdio --backend external`，临时生成 content-studio policy 和 external backend command，跑通 `initialize -> capability/list -> agentSession/start -> agentSession/turn/start -> agentSession/event -> artifact/read -> evidence/export`；缺少 sidecar 时返回 explicit missing，不伪造成功。
414. P3.68 content-studio IPC / preload：新增 `appServer:health` 与 `appServer:smoke`，同步 `ContentStudioApi` 类型和 preload facade；现有 `agent:run / agent:cancel` 与业务 UI 暂不切换，避免在试点未覆盖 cancel / actionRespond / restart 前影响用户主链。
415. P3.68 content-studio 打包约定：`electron-builder.yml` 增加 `extraResources` 映射 `resources/app-server -> app-server`；新增 `resources/app-server/README.md` 与 `content-studio.policy.example.json`，只提交资源约定和 policy 示例，不提交平台二进制。
416. P3.68 content-studio smoke：新增 `npm run smoke:app-server`，要求 `APP_SERVER_BIN` 指向 Lime 构建产物，验证真实 sidecar + external backend + policy + artifact/evidence；普通 functional suite 在无 `APP_SERVER_BIN` 时只验证 missing 边界，避免本地环境假失败。
417. P3.68 content-studio 文档：更新 content-studio 路线图 `limeagent/README.md` 与 `integration.md`，把“standalone 只支持 mock backend”的旧阻塞改为 external backend smoke 已落地，并记录剩余缺口：`agent:run` 默认仍走 `ClaudeAgentService`、生产 manifest/sha256 流水线未接、真实内容工厂 Query Loop backend 未接。
418. P3.68 增量 `/Users/coso/Documents/dev/ai/limecloud/content-studio` `npm run typecheck`：通过。
419. P3.68 增量 `/Users/coso/Documents/dev/ai/limecloud/content-studio` `node scripts/run-functional-tests.mjs --test-name-pattern "content-studio consumes App Server external backend sidecar"`：通过；无 `APP_SERVER_BIN` 时覆盖 explicit missing health 分支。
420. P3.68 增量 `/Users/coso/Documents/dev/ai/limecloud/content-studio` `APP_SERVER_BIN="/tmp/app-server-external-smoke-target/debug/app-server" npm run smoke:app-server`：通过，输出 `capabilities=content.draft.generate events=message.delta,artifact.snapshot artifacts=content-studio-draft-smoke evidenceEvents=2 evidenceArtifacts=1`。
421. P3.68 增量 `/Users/coso/Documents/dev/ai/limecloud/content-studio` `npm run build`：通过，完成 main / preload / renderer production build。
422. P3.68 增量 `/Users/coso/Documents/dev/ai/limecloud/content-studio` `git diff --check -- <App Server 试点写集>`：通过。

423. P3.69 content-studio 默认 agent path：在 `/Users/coso/Documents/dev/ai/limecloud/content-studio` 将 `agent:run` 默认委托到 `AppServerSidecarService.runAgent(...)`，通过真实 `app-server --stdio --backend external` 启动 `content.draft.generate` turn，并把 `message.delta / artifact.snapshot / turn.failed / turn.completed / tool*` 投影回现有 `AgentEvent`；`ClaudeAgentService` 仅在 `CONTENT_STUDIO_AGENT_RUNTIME=claude-sdk` 时作为显式 fallback。
424. P3.69 content-studio cancel path：`agent:cancel` 优先取消 App Server running task，向 sidecar 发送 `agentSession/turn/cancel` 后关闭子进程并清理临时 policy 目录；旧 runtime cancel 仅作为 compat fallback。
425. P3.69 content-studio backend boundary：默认 `agent:run` 不再伪造 mock；缺少 `APP_SERVER_BIN` 或 `CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND` 时发布明确 `error` event，并清理 running task。真实 backend command 通过 `CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND` 和 JSON / newline `CONTENT_STUDIO_APP_SERVER_BACKEND_ARGS` 注入，仍保持 command / args 分离。
426. P3.69 content-studio tests：`tests/functional/content-flow.test.mjs` 覆盖 backend 未配置 error、不发送 fake done、真实 sidecar external backend 事件投影、`selectedSkillSlugs / permissionMode` metadata 透传，以及 task 完成后的 cancel false 清理边界。
427. P3.69 content-studio docs：更新 content-studio 内部 Lime Agent 路线图 README 与 integration 文档，把 current 改为 App Server JSON-RPC / external backend / `AppServerSidecarService` / `agent:run` 默认路径；`ClaudeAgentService` 归类为显式 compat fallback；剩余缺口收敛为生产 release manifest / sha256 流水线、真实内容工厂 backend、cancel / delayed streaming / restart-backoff 的生产级验证。
428. P3.70 content-studio 生产资源流水线：新增 `/Users/coso/Documents/dev/ai/limecloud/content-studio/scripts/prepare-app-server-resources.mjs` 和 `npm run app-server:prepare`，从 Lime `app-server.release.json` 按当前平台选择 artifact，支持本地路径 / `file://` / `http(s)`，复制或下载 sidecar，校验 sha256，写入 `resources/app-server/current/app-server(.exe)` 与 `resources/app-server/app-server.release.json`；`--binary` 只覆盖 artifact source，仍必须匹配 manifest sha256。
429. P3.70 content-studio resources smoke：`AppServerSidecarService.resolveBinaryPath(...)` 支持 `APP_SERVER_RESOURCES_DIR`，`npm run smoke:app-server` 不再强制 `APP_SERVER_BIN`，可验证 packaged resources / 打包输入目录；真实临时 manifest + `/tmp/app-server-external-smoke-target/debug/app-server` 已跑通 `app-server:prepare -> APP_SERVER_RESOURCES_DIR=... npm run smoke:app-server`，输出 `source=resources`。
430. P3.70 content-studio 守卫：新增 `scripts/prepare-app-server-resources.test.mjs` 与 `npm run app-server:prepare:test`，覆盖 protocol/platform artifact 选择、sha256 成功安装、sha256 mismatch 拒绝；content-studio `.gitignore` 放行其内部 Lime Agent 路线图目录，同时忽略 `resources/app-server/current/` 与生成的 `app-server.release.json`，避免平台二进制误入版本库。
431. P3.70 content-studio sidecar lifecycle 修复：定向 functional test 暴露 task 完成后立即 `cancelAgent(...)` 可能向已退出 sidecar 写入并触发 `EPIPE`；`JsonLineSidecar` 新增 `canWrite()`、stdin error 边界和 close 状态，`cancelAgent` 仅在 sidecar 可写时发送 `agentSession/turn/cancel`，完成态 cancel 返回 false 且不产生未捕获异常。
432. P3.70 content-studio 文档：更新 `resources/app-server/README.md`、content-studio 内部 Lime Agent 路线图 README 与 `integration.md`，把生产资源入口改为 `app-server:prepare` + `APP_SERVER_RESOURCES_DIR=... npm run smoke:app-server`；剩余缺口调整为 CI / release job 串联、真实内容工厂 backend、delayed streaming / cancel / crash-backoff / stderr 生产级验证。
433. P3.71 并行协作盘点：用户指出 P3.67 参考不完整后，本轮重新完整对照 Codex `app-server-daemon / app-server-protocol / app-server-transport / app-server-test-client`；认领写集仍限 Lime 四个 reference crate 与本执行计划，继续避让 Desktop adapter、`runtime_turn/**`、content-studio 并行 P3.68-P3.70 写集和 release notes。
434. P3.71 subagents 只读对照：复用 Turing / Lagrange / Harvey / Einstein / Avicenna 完成 protocol、transport、test-client、daemon 结构审阅；结论统一为“迁移机制层，不搬 Codex 业务协议”：不迁 `thread/turn/item/account/plugin/model/config/remote_control/realtime/mcp/fs/process/command_exec`，不迁 `$CODEX_HOME`、`install.sh`、Unix-only pid daemon、UDS websocket 或 remote-control。
435. P3.71 transport 完整机制补齐：`app-server-transport` 新增 `transport` facade、`AppServerTransport` listen URL parser、`TransportEvent`、`next_connection_id()`、control/startup path helper、入站 queue overload 处理、`StdioConnection` JSONL read/write、stdio initialize clientName 解析，并 re-export `OutgoingResponse / OutgoingError`；仍不实现 websocket/auth/unix socket/remote-control acceptor，避免产生假 listen 入口。
436. P3.71 daemon 完整机制补齐：`app-server-daemon` 新增 `backend.rs / lifecycle.rs / client.rs / update_policy.rs`，覆盖 Codex daemon 的 lifecycle DTO/state path/backend path、initialize probe request/initialized notification/probe response parsing、Codex-style user-agent version parser、binary identity update decision；不启动 pid daemon、不拉网络 installer、不接 remote-control，local socket/pid lifecycle 仍待 App Server listen 真正支持后实现。
437. P3.71 protocol 完整机制补齐：`app-server-protocol` 新增 `schema_export.rs`，生成 deterministic JSON schema bundle 和 schema tree；`schema_fixtures.rs` 现在合并 schema bundle、manifest、JSON-RPC envelope fixtures，并提供 Codex-style fixture tree comparison helper；canonicalizer 只排序 primitive 数组和带 `method` key 的目录数组，不对任意 object array 排序，避免隐藏 schema 顺序语义。Codex 建议的 `jsonrpc_lite.rs / protocol/v0.rs / schemars / ts-rs` 完整生成链登记为后续拆分，不在本轮 dirty worktree 里做大重构。
438. P3.71 test-client 完整机制补齐：`app-server-test-client` 新增 `harness.rs`，提供 `HarnessCommand` parser、`StdioLaunchConfig`、JSONL exchange encode/decode helpers；`main.rs` 改为 parser 分派，保留旧 clientName 兼容行为；`launch-stdio` 只输出将执行的 stdio 命令参数，不实际 spawn，避免在没有 server 时制造挂起副作用；Codex account/thread/approval/live-provider 命令明确不迁移。
439. P3.71 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server-transport --package app-server-daemon --package app-server-test-client --check`：通过。
440. P3.71 增量 `CARGO_TARGET_DIR="/tmp/app-server-complete-reference-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server-transport -p app-server-daemon -p app-server-test-client`：通过，`app-server-daemon` 24 个、`app-server-protocol` 19 个、`app-server-test-client` lib 6 个 / bin 0 个、`app-server-transport` 11 个测试通过，共 60 个测试。
441. P3.72 content-studio packaged backend：新增 `/Users/coso/Documents/dev/ai/limecloud/content-studio/resources/app-server/backend/content-backend.mjs`，作为默认 packaged external backend；`AppServerSidecarService.resolveAgentBackend(...)` 现在按显式 `CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND` -> `APP_SERVER_RESOURCES_DIR/backend/content-backend.mjs` -> packaged resources -> repo dev fallback 解析，默认不再要求开发者手填 backend command。
442. P3.72 backend 真实模型边界：packaged backend 读取 App Server external stdin `{ kind, request }`，输出 `{ events }`；正常路径按 `CONTENT_STUDIO_TEXT_*` / 通用 LLM env 调 OpenAI Chat / Anthropic Messages / Gemini GenerateContent HTTP 文本模型生成 Markdown artifact；缺少模型配置时输出 `turn.failed` 并非零退出，使 App Server turn/start 失败，不伪造成功。
443. P3.72 backend 测试与投影：新增 `npm run app-server:backend:test`，直接覆盖 packaged backend 缺模型失败和 echo 成功协议路径；functional tests 扩展为 4 条 App Server agent path：external smoke、packaged backend 缺模型 error、packaged backend echo artifact、显式 external backend metadata/event projection。`turn.completed` 才代表成功完成，`turn.failed` 不再产生 fake `done`。
444. P3.72 Electron packaged backend 启动：`JsonLineSidecar` 支持 spawn env 注入，启动 sidecar 时传入 `ELECTRON_RUN_AS_NODE=1`，确保 packaged Electron binary 可作为 Node 执行 `backend/content-backend.mjs`；同时保留显式 backend command / args 覆盖入口。
445. P3.72 content-studio 文档：更新 `resources/app-server/README.md`、content-studio 内部 Lime Agent 路线图 README 与 `integration.md`，把 current 改为 packaged backend 已接入；剩余缺口收敛为 CI / release job 串联 `app-server:prepare`、真实生产模型配置验收、delayed streaming / cancel / crash-backoff / stderr 生产级验证。
446. P3.73 Lime Desktop GUI 宿主切换：默认 `npm run dev / build / preview` 已切到 Electron；`npm run verify:gui-smoke` 改为 Electron smoke；`tauri:*` npm 入口统一进入 deprecated gate，输出 Tauri GUI 宿主下线提示，不再作为 Desktop 前端主路径。
447. P3.73 Electron host 边界：新增 `electron/main.ts / preload.ts / ipcChannels.ts / appServerHost.ts`，main 只负责窗口、平台能力和 App Server sidecar 生命周期；preload 只暴露 `window.electronAPI` 白名单能力，不暴露完整 `ipcRenderer`；renderer 继续只通过 `safeInvoke / listen / emit` 与 `@tauri-apps/*` alias 兼容层进入宿主。
448. P3.73 App Server 接管策略：Electron host 只声明接管 `app_server_handle_json_lines / app_server_drain_events`；开发态未配置 `APP_SERVER_BIN` 时不截获这些命令，继续回到 HTTP Bridge / mock fallback，避免在 sidecar artifact 未准备好时把 GUI 卡死或伪造真实 Agent 完成。生产态通过 packaged resources / release manifest 或 `APP_SERVER_BIN` 启动 sidecar。
449. P3.73 Tauri 下线边界：`lime-rs/` 仍保留为 Rust Runtime / App Server workspace，不代表 GUI 宿主 current 路径；Tauri GUI smoke 不再作为可交付证明。后续如需真实 Aster backend，必须继续沿 App Server / RuntimeCore / ExecutionBackend 解耦，而不是恢复 Tauri webview 主路径。
450. P3.73 参考仓库对照：只读参考 `/Users/coso/Documents/dev/js/craft-agents-oss` 的分段 Electron build、preload API 白名单和 IPC channel map 守卫；本轮只借鉴机制层，未照搬其 Bun workspace、WS routed client、remote server、账号/权限/窗口管理业务协议。
451. P3.73 增量 `npm install --save-dev electron`：通过，新增项目级 Electron devDependency 并更新 `package-lock.json`；npm audit 报 31 个既有依赖风险，本轮不执行 `npm audit fix`，避免大范围升级偏航。
452. P3.73 增量 `npm test -- electron/ipcChannels.test.ts src/lib/dev-bridge/safeInvoke.test.ts src/lib/tauri-mock/plugin-dialog.test.ts`：通过，23 个测试覆盖 Electron host command 白名单、`electron-ipc` trace、未支持命令继续走 HTTP bridge、浏览器 dialog mock 行为。
453. P3.73 增量 `npm run typecheck:electron`：首跑发现 Tauri dialog `multiple/directory` 与 Electron `OpenDialogOptions.properties` 语义不一致；修正 main 侧映射后复跑通过。
454. P3.73 增量 `npm run electron:build:host`：通过，`packages/app-server-client` build、Electron main/preload typecheck 和 Vite SSR build 均通过，产物输出到忽略的 `dist-electron/`。
455. P3.74 并行协作盘点：本轮只认领 `lime-rs/crates/app-server-protocol/**` 与本执行计划记录；继续避让 Electron GUI 宿主替换写集（`electron/**`、Electron scripts、`vite.config.ts`、package / mock / DevBridge 相关文件）和隔壁进程已写入的 P3.73 记录。Electron 替换 Tauri GUI 宿主后，App Server 仍是 Agent / runtime / sidecar current 服务边界；Tauri / Electron 只作为 host adapter 语境，不允许把协议 DTO 重新绑死到某个 GUI 壳层。
456. P3.74 Codex protocol 完整对照：本轮重新阅读 Codex `app-server-protocol` 的 `lib.rs`、`jsonrpc_lite.rs`、`protocol/mod.rs`、`protocol/v1.rs`、`protocol/v2/**`、`export.rs`、`schema_fixtures.rs`、`tests/schema_fixtures.rs`、`schema/json/**` 和 `schema/typescript/**` 组织；同时由 Lorentz 子代理做只读审计。结论：迁移模块边界、schema fixture / drift test / 生成入口机制；不迁 Codex `thread/turn/item/account/plugin/model/config/remote_control/realtime/mcp/fs/process/command_exec` 业务 DTO，不引入 v1 legacy surface。
457. P3.74 protocol 结构拆分：`app-server-protocol/src/lib.rs` 改成 Codex-style facade；JSON-RPC envelope、`RequestId`、`JsonRpcMessage`、error codes 和 constructor helper 下沉到 `jsonrpc_lite.rs`；Lime current `appserver.v0` 方法目录、initialize、capability、artifact、evidence、agent session / turn / action / event DTO 下沉到 `protocol/v0.rs`；`protocol/mod.rs` 作为版本命名空间入口。crate root 继续 re-export 既有公开类型，不改变 wire format。
458. P3.74 schema fixture 闭环：新增 `src/bin/write_schema_fixtures.rs`，默认写入 crate-local `schema/`；新增 `tests/schema_fixtures.rs` 独立 drift test，比较 checked-in fixture tree 与 `generated_fixture_tree()`；新增 `schema/json/app_server_protocol.schemas.json`、`schema/json/manifest.json` 和 `schema/json/envelopes/{request,notification,response,error}.json`。当前 schema 仍是 envelope + method catalog 层，不伪装为 DTO 级 schema；`schemars / ts-rs / schema/typescript` 仍作为后续评估项。
459. P3.74 增量 `cargo run --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol --bin write_schema_fixtures`：通过，生成 crate-local schema fixtures；首次运行等待 package cache lock 后完成。
460. P3.74 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --check`：通过。
461. P3.74 增量 `CARGO_TARGET_DIR="/tmp/app-server-protocol-p372-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol`：通过，19 个 lib tests、0 个 bin tests、1 个 integration drift test 通过。
462. P3.74 增量 `node "scripts/check-app-server-client-contract.mjs"`：先暴露 contract guard 仍硬编码从 protocol `lib.rs` 扫 DTO；已更新脚本为组合扫描 `lib.rs + jsonrpc_lite.rs + protocol/v0.rs`，保留 re-export 与实际定义的守卫语义，重跑通过，75 项 contract guard 通过。
463. P3.74 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-protocol --package app-server-transport --package app-server-daemon --package app-server-test-client --check`：通过。
464. P3.74 增量 `CARGO_TARGET_DIR="/tmp/app-server-reference-p374-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server-transport -p app-server-daemon -p app-server-test-client`：通过，`app-server-daemon` 24 个、`app-server-protocol` 19 个 lib + 1 个 integration drift、`app-server-test-client` lib 6 个 / bin 0 个、`app-server-transport` 11 个测试通过。
465. P3.74 增量 `git diff --check` 与 `git diff --cached --check`：通过。
466. P3.75 Electron 开发入口瘦身：`electron:dev` 不再走完整 `electron:build:host`，改为 `electron:build:host:dev`；开发态只打包 Electron main/preload 与桌面 assets，renderer 继续由 Vite dev server 承接，App Server client 源码通过 Vite alias 直接打入 main bundle。生产 `electron:build` 仍保持 `packages/app-server-client build + typecheck:electron + host bundle + assets`，避免把开发态捷径带进发布链路。
467. P3.75 开发体验边界：首次出现 `Downloading Electron binary...` 是 Electron npm 包拉取 Runtime 二进制，不是下载或打包 App Server 后端；该成本由 npm/Electron 缓存承担。本轮优化的是避免日常 `npm run dev` 每次先跑 renderer production build 或 App Server client dist build，sidecar 未配置时仍按 P3.73 走 HTTP Bridge / mock fallback，不阻塞 GUI。
468. P3.75 增量 `npm run electron:build:host:dev`：通过，main/preload Vite SSR bundle 与 7 个 desktop assets copy 均通过；开发 host bundle 输出 `dist-electron/main/main.js` 与 `dist-electron/preload/preload.cjs`。
469. P3.76 并行协作盘点：用户提醒隔壁进程正在 Electron 全面替换 Tauri 后，本轮继续避让 `.gitignore`、`package*.json`、`vite.config.ts`、`electron/**`、Electron scripts、`src/lib/dev-bridge/**`、`src/lib/tauri-mock/**`、`src/lib/electron-host.ts`、`tsconfig.electron.json` 与 Electron 路线图写集；本轮只认领 `app-server-protocol` schema 生成链、`lime-rs/Cargo.lock`、contract guard 和本执行计划记录。新 subagent spawn 因线程上限失败后，已复用现有 Turing / Lagrange / Harvey / Lorentz 做 daemon / transport / test-client / protocol 只读差距审计，不允许它们写文件。
470. P3.76 protocol DTO schema 生成链：`app-server-protocol` 引入已在 workspace lock 中存在的 `schemars 1.2.1`，JSON-RPC envelope 和 Lime current `appserver.v0` DTO 统一派生 `JsonSchema`；新增 `JSONRPC_SCHEMA_TYPE_NAMES` 与 `V0_SCHEMA_TYPE_NAMES` 作为 schema registry 事实源，并由 `schema_export.rs` 的 `schema_registry_matches_declared_type_names` 测试锁定，避免新增 DTO 后漏出 schema fixture。
471. P3.76 schema fixture 扩展：`generated_schema_tree()` 现在除了 bundle、manifest 和 envelope fixtures，还生成 `schema/json/jsonrpc/*.json` 与 `schema/json/v0/*.json`；`manifest.json` 记录 `schemas.jsonrpc` 与 `schemas.v0` 清单。`AgentSessionTurnStartParams`、`RuntimeOptions`、`EvidenceExportResponse` 等 current DTO 已进入 checked-in JSON schema；`serde_json::Value` 继续保持开放 schema，用于 `metadata / hostOptions / payload` 这类 host-local 或 runtime payload 字段。
472. P3.76 contract guard：`scripts/check-app-server-client-contract.mjs` 从 75 项扩展到 76 项，新增 guard 锁定 `schemars::JsonSchema`、schema registry 常量、`jsonrpc_schemas()`、`v0_schemas()`、`json/v0` / `json/jsonrpc` 输出路径、manifest `schemas` 字段和 registry 测试名，防止协议 DTO 与 schema fixture 再次脱钩。
473. P3.76 范围边界：本轮只迁 Codex 的 schema 机制层，不迁 Codex `thread/turn/item/account/plugin/model/config/remote_control/realtime/mcp/fs/process/command_exec` 业务 DTO；也不引入 `ts-rs` 或 `schema/typescript`，避免在 Electron 宿主迁移并行写集上扩大依赖和生成产物。TypeScript schema / npm client 消费仍留到后续独立一刀。
474. P3.76 增量 `cargo run --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol --bin write_schema_fixtures`：通过，重新生成 `app-server-protocol/schema/json/**`，包含 JSON-RPC 与 `appserver.v0` DTO 单文件 schema。
475. P3.76 增量 `CARGO_TARGET_DIR="/tmp/app-server-protocol-schema-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol`：通过，20 个 lib tests、0 个 bin tests、1 个 integration drift test 通过，覆盖 schema registry、fixture tree 和 DTO wire fixture。
476. P3.76 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，76 项 contract guard 通过。
477. P3.76 增量 `CARGO_TARGET_DIR="/tmp/app-server-reference-p375-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server-transport -p app-server-daemon -p app-server-test-client`：通过，`app-server-daemon` 24 个、`app-server-protocol` 20 个 lib + 1 个 integration drift、`app-server-test-client` lib 6 个 / bin 0 个、`app-server-transport` 11 个测试通过。
478. P3.76 增量 `git diff --check && git diff --cached --check`：通过。
479. P3.76 subagent 只读审计结论：Protocol 缺口已由本轮 DTO schema 补齐；transport 下一缺口是把 `TransportEvent / StdioConnection / extract_stdio_initialize_client_name / queue overload` 从测试结构接进真实 `app-server` stdio lifecycle 和每连接写出队列，避免 `broadcast` lag 继续作为实际出站路径；daemon 下一缺口是 stdio sidecar launch args、readiness probe、stderr drain、跨平台 lifecycle lock 和 `Pid` 能力显式下线或实现；test-client 下一缺口是真实 stdio spawn/initialize/capability-list harness、RAII child cleanup 与 CLI 帮助体验。四个审计均确认不要迁 Codex remote-control、websocket/UDS、network updater、CODEX_HOME、thread/turn/account/plugin/model/fs/process 等业务协议。
480. P3.77 并行协作盘点：隔壁进程仍在 Electron/Tauri 宿主替换写集上推进，本轮继续避让 `.gitignore`、`package*.json`、`vite.config.ts`、`electron/**`、Electron scripts、DevBridge / tauri-mock / protocol schema / daemon / transport / test-client 写集；只认领 `lime-rs/crates/app-server/src/external_backend.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。
481. P3.77 external backend JSONL 事件流：`ExternalBackend` 不再用 `child.wait_with_output()` 一次性读取 stdout；改为 `BufReader::lines()` 按行解析 stdout，每行可为单事件 `{ "type": "...", "payload": ... }` 或兼容批量 `{ "events": [...] }`，stderr 独立 drain，非零退出仍把 stderr 带入明确 backend error。该能力先解决独立 App backend 长输出不必攒成单个巨大 JSON 的底层协议边界；RuntimeCore / processor 仍是收集式事件派发，真正边读边向 JSON-RPC client 推送留到后续一刀。
482. P3.77 Rust 测试：新增 `external_backend_reads_jsonl_event_stream`，覆盖两个单事件 JSONL 行和一个批量 `events` 行进入同一个 RuntimeCore turn output；既有 `external_backend_invokes_process_and_maps_runtime_events` 继续证明单 JSON response 兼容。
483. P3.77 contract guard：`scripts/check-app-server-client-contract.mjs` 锁定 `stdout_lines.next_line()`、`emit_external_backend_line(&line, sink)`、`external_backend_reads_jsonl_event_stream`，并禁止 `child.wait_with_output()` 回流，防止 external backend 退回一次性 stdout 模式。
484. P3.77 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --check`：通过。
485. P3.77 增量 `CARGO_TARGET_DIR="/tmp/app-server-external-stream-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server external_backend --lib`：通过，3 个 external backend 定向测试通过；仍保留既有 `ensure_capability_allowed` 与 `assert_agent_event_notification` dead_code warning。
486. P3.77 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，76 项 contract guard 通过。
487. P3.77 增量 `git diff --check -- "lime-rs/crates/app-server/src/external_backend.rs" "scripts/check-app-server-client-contract.mjs"`：通过。
488. P3.78 Electron desktop polish：Electron app / dock icon 从旧 `public/icon.png` 切到 current `lime-rs/icons/icon.png`，desktop assets copy 同步改用同一源；`dist-electron/desktop-assets/icon.png` 与 `lime-rs/icons/icon.png` sha256 一致，避免 Dock 继续显示旧虾图标。tray 仍复用 `lime-rs/icons/tray/*`，macOS template tray 与运行状态图标未改动。
489. P3.78 Electron dev UX：开发态不再默认 `openDevTools({ mode: "detach" })`，只有显式 `LIME_ELECTRON_OPEN_DEVTOOLS=1` 时才打开，避免启动时先弹出空白 `http://127.0.0.1:1420/` DevTools skeleton；同时 `LIME_ELECTRON_E2E=1 / LIME_ELECTRON_SMOKE=1` 可绕过 single-instance lock，便于 Playwright 启动隔离实例。
490. P3.78 Electron App Server IPC 修复：`run-electron-dev.mjs` 在本地存在 `lime-rs/target/debug/app-server(.exe)` 时自动注入 `APP_SERVER_BIN`；`ElectronAppServerHost` 对 renderer JSONL 输入补齐行尾换行，并把 renderer 的重复 `initialize` 投影为 lifecycle 已缓存的 `initializeResponse`，`initialized` notification 不再重复转发到同一 sidecar，解决前端 App Server 调用超时或 `initialize has already been accepted`。
491. P3.78 Playwright Electron 诊断：通过 Playwright `_electron.launch` 启动隔离实例，页面加载到 `http://127.0.0.1:1420/`，`window.electronAPI` 注入成功，`supportsCommand("app_server_handle_json_lines")=true`，`initialize` 返回 `appserver.v0 / 1.59.0` 和 `agentSession/artifact/capabilityDiscovery/evidence` capabilities，`capability/list` 返回真实 `agent.session` 能力；`workspace_list` 仍明确不属于 Electron host 命令。
492. P3.78 增量验证：`npm run electron:build:host:dev`、`npm run typecheck:electron`、`npm test -- electron/ipcChannels.test.ts src/lib/dev-bridge/safeInvoke.test.ts src/lib/tauri-mock/plugin-dialog.test.ts src/lib/api/appServer.test.ts`、`npm run electron:build:host` 与 `git diff --check` 均通过。
493. P3.79 并行协作盘点：隔壁进程正在 Electron 全面替换 Tauri，并已把 Rust workspace 从 `src-tauri/` 改名为 `lime-rs/`；本轮继续避让 `.gitignore`、`package*.json`、`vite.config.ts`、`electron/**`、Electron scripts、`src/lib/dev-bridge/**`、`src/lib/tauri-mock/**`、`src/lib/electron-host.ts`、`tsconfig.electron.json` 与旧 `src-tauri/` 删除写集；只认领 App Server stdio streaming dispatch、`app-server-transport` re-export、contract guard 和本执行计划记录。
494. P3.79 App Server stdio streaming dispatch：`run_json_lines(...)` 接入 `app-server-transport` 的 stdio connection event / per-connection writer queue；`agentSession/turn/start` 进入 streaming path 后由后台 task 执行，backend emit 的 `RuntimeEvent` 通过 `RuntimeCore::start_turn_with_event_callback(...) -> RequestProcessor::handle_request_streaming(...) -> StreamedTransportMessage` 立即写回同一 JSON-RPC connection，允许 `agentSession/event` notification 先于最终 turn response 到达。
495. P3.79 transport lifecycle 接入：`app-server-transport` facade re-export `start_stdio_connection`；`run_json_lines(...)` 消费 `TransportEvent::ConnectionOpened / StdioClientInitialized / IncomingMessage / ConnectionClosed`，把 `ConnectionId -> QueuedOutgoingMessage` writer 登记到 `AppServer`，同步 response、streamed event 和 external runtime event 都投递到 per-connection writer queue；真实 stdio 出站不再依赖 `broadcast::error::RecvError::Lagged` 路径。external runtime event fanout 改为后台 `send().await`，避免 writer queue 满时 `try_send` 静默丢消息。
496. P3.79 RuntimeCore event sink：新增 `AppendingRuntimeEventSink`，streaming path 中每个 backend event 先 append 到 RuntimeCore read model，再 callback 为 JSON-RPC notification；backend 在未 emit 事件前失败仍回滚刚创建的 turn，已 emit 后失败不回滚已对 client 可见的事件。
497. P3.79 external backend stdio 回归：新增 `json_lines_loop_streams_external_backend_events_before_turn_response`，使用临时 Node external backend 输出两条 JSONL event，断言两条 `message.delta` notification 都先于 `turn/start` response；既有 `json_lines_loop_writes_external_outbound_notification` 更新为 stdio streaming 语义，固定 `turn.accepted` notification 先到、response 后到。`app-server-transport` 的 `stdio_connection_emits_lifecycle_events_and_writes_queue_messages` 固定连接打开、initialize clientName 探测、incoming message、writer queue 写出和 close lifecycle。
498. P3.79 contract guard：`scripts/check-app-server-client-contract.mjs` 扩展到 79 项检查，锁定 `start_stdio_connection` re-export、`TransportEvent` lifecycle、per-connection writer registry、`StreamedTransportMessage`、`handle_message_streaming`、`handle_request_streaming`、`start_turn_with_event_callback`、`AppendingRuntimeEventSink`、streaming stdio 测试名和 scoped event helper，并禁止 `broadcast::error::RecvError::Lagged` 回流到真实 stdio 出站路径，也禁止 `try_send(QueuedOutgoingMessage` 静默丢出站消息。
499. P3.79 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server-transport -p app-server --check`：通过。
500. P3.79 增量 `CARGO_TARGET_DIR="/tmp/app-server-p377-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-transport -p app-server`：通过，`app-server` lib 53 个、bin 8 个、host boundary 2 个、`app-server-transport` lib 12 个测试通过；仍保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。
501. P3.79 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，79 项 contract guard 通过。

下一刀：

1. 若由持有 Electron 写集的进程继续推进，优先补 Electron packaging resources：把 `app-server.release.json`、platform sidecar binary 和 policy/backend resources 接入 Lime Desktop Electron 打包流水线，并用 sha256 pin 住。
2. 若当前进程继续避让 Electron 写集，优先补 `app-server-test-client` 真实 stdio harness：spawn `app-server --stdio`，跑 `initialize -> initialized -> capability/list`，并用 RAII 清理 child，保留当前 JSONL fixture。
3. 再补 `app-server-daemon` stdio sidecar launch args、readiness probe、stderr drain、跨平台 lifecycle lock，并显式下线或实现 `Pid` 能力。
4. 再补 protocol TypeScript schema / npm client 消费链：评估是否引入 `ts-rs` 生成 `schema/typescript`，或先让 `packages/app-server-client` 消费 `schema/json/v0`；必须继续以 drift test 为门禁，不复制 Codex 业务协议。
5. 再补 Electron GUI smoke / Playwright 续测的稳定证据，覆盖首屏、DevBridge fallback、平台 dialog/shell/window/deep-link 基础能力。
6. 再继续 content-studio `app-server:prepare` CI / release job，确保生产包内 sidecar 被 manifest pin 住并校验 sha256。
7. 再补 Desktop evidence pack provider 注入：在 Electron/App Server host 侧委托 `agent_runtime_export_evidence_pack` 同源服务 / `runtime_evidence_pack_service.rs`，把真实结果映射为 `EvidencePackSummary`，但继续让 `app-server` crate 保持 host-independent。
8. P3.80 并行协作盘点：隔壁进程已把 Rust workspace 从 `src-tauri/` 改名为 `lime-rs/` 并继续推进 Electron 替换；本轮继续避让 `.gitignore`、`package*.json`、`vite.config.ts`、`electron/**`、Electron scripts、`src/lib/dev-bridge/**`、`src/lib/tauri-mock/**`、`src/lib/electron-host.ts`、`tsconfig.electron.json` 与旧 `src-tauri/` 删除写集；只认领 `lime-rs/crates/app-server-test-client/**`、contract guard 和本执行计划记录。
9. P3.80 test-client 真实 stdio harness：`app-server-test-client launch-stdio <app-server-bin> [extra args...]` 不再只打印命令；现在会启动真实 `app-server --stdio`，发送 `initialize -> initialized -> capability/list` JSONL，读取并校验 request id `1/2` 的 JSON-RPC response，统计 capability 数量，关闭 stdin 后等待 child 退出，超时或异常时清理子进程。
10. P3.80 CLI 保持 fixture 能力：`initialize-line / initialized-line / capability-list-line / smoke-lines` 仍保留为纯 JSONL fixture 输出；`launch-stdio` 新增 `extra_args` 透传，支持 `--backend unavailable|mock|external ...` 等 standalone 参数，不引入 Codex account/thread/model/approval/live-provider 业务命令。
11. P3.80 contract guard：`scripts/check-app-server-client-contract.mjs` 扩展到 79 项，锁定 `StdioSmokeReport`、`run_stdio_smoke(...)`、真实 `.spawn()`、`read_response(... RequestId::Integer(1/2))`、`wait_for_exit`、`cleanup_child` 和 `main.rs` 的真实 smoke 调用，防止 `launch-stdio` 回退成假入口。
12. P3.80 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-test-client --check`：通过。
13. P3.80 增量 `CARGO_TARGET_DIR="/tmp/app-server-test-client-harness-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-test-client`：通过，7 个 lib tests、0 个 bin tests 通过。
14. P3.80 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，79 项 contract guard 通过。
15. P3.80 增量 `CARGO_TARGET_DIR="/tmp/app-server-test-client-harness-target" cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server -p app-server-test-client`：通过，生成真实 `app-server` 与 `app-server-test-client` debug binary；仍保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。
16. P3.80 增量 `"/tmp/app-server-test-client-harness-target/debug/app-server-test-client" launch-stdio "/tmp/app-server-test-client-harness-target/debug/app-server" --backend unavailable`：通过，输出 `[app-server-test-client] ok appServerBin=/tmp/app-server-test-client-harness-target/debug/app-server initializeResponseId=1 capabilityListResponseId=2 capabilities=1`。
17. P3.81 并行协作盘点：隔壁进程已把 Rust workspace 从 `src-tauri/` 改名为 `lime-rs/` 并继续推进 Electron 替换；本轮继续避让 `.gitignore`、`package*.json`、`vite.config.ts`、`electron/**`、Electron scripts、DevBridge / tauri-mock / `src/lib/electron-host.ts`、`tsconfig.electron.json` 与旧 `src-tauri/` 删除写集；只认领 `app-server-daemon` stdio lifecycle、contract guard 和本执行计划记录。
18. P3.81 daemon readiness probe：`SidecarLaunchConfig::probe_readiness(...)` 现在会先做 sha256 校验，再真实启动 `app-server --stdio --backend unavailable`，发送 daemon initialize request，读取 initialize response 并解析 `ProbeInfo`，再发送 `initialized` notification、关闭 stdin、等待 sidecar 退出、drain stderr 到日志文件并清理 child；这收掉了 daemon “只会 spawn、不证明 sidecar 已 ready”的假入口。
19. P3.81 daemon launch options / lifecycle 对齐：`SidecarLaunchConfig` 与 `SidecarBinaryPathOptions` 保留 standalone backend / policy 透传，release manifest resolution 覆盖 backend launch options；`OperationLock` 用跨平台 `create_new(true)` sentinel 串行化本地 lifecycle 动作；`Pid` backend 仍明确 unsupported，等待 local socket lifecycle 真正启用后再实现，不新增伪 pid daemon。
20. P3.81 contract guard：`scripts/check-app-server-client-contract.mjs` 扩展到 82 项，新增 Rust daemon readiness、standalone backend launch options、operation lock 与 `Pid` unsupported 守卫，锁定 `probe_readiness`、`SidecarReadinessReport`、`SidecarReadinessError`、initialize / initialized JSON-RPC probe、stderr drain、2 秒退出等待、child cleanup、真实 app-server smoke 测试名、`SidecarBackendMode` 和 `OperationLock`。
21. P3.81 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-daemon --check`：通过。
22. P3.81 增量 `CARGO_TARGET_DIR="/tmp/app-server-daemon-p381-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-daemon`：通过，32 个 daemon 测试通过。
23. P3.81 增量 `CARGO_TARGET_DIR="/tmp/app-server-daemon-p381-target" cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server`：通过，生成真实 `/tmp/app-server-daemon-p381-target/debug/app-server`；仍保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。
24. P3.81 增量 `APP_SERVER_DAEMON_TEST_APP_SERVER_BIN="/tmp/app-server-daemon-p381-target/debug/app-server" CARGO_TARGET_DIR="/tmp/app-server-daemon-p381-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-daemon readiness_probe_smokes_real_app_server_when_env_is_set -- --nocapture`：通过，确认不是无环境变量 early return。
25. P3.81 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，82 项 contract guard 通过。
26. P3.81 增量 `git diff --check -- "lime-rs/crates/app-server-daemon/src/lib.rs" "lime-rs/crates/app-server-daemon/src/backend.rs" "lime-rs/crates/app-server-daemon/src/lifecycle.rs" "scripts/check-app-server-client-contract.mjs" "internal/exec-plans/app-server-implementation-plan.md"`：通过。
27. P3.82 并行协作盘点：Electron / Tauri 替换写集仍覆盖 `package*.json`、`electron/**`、DevBridge、tauri-mock、`vite.config.ts` 与旧 `src-tauri/` 删除；本轮继续避让这些宿主层文件，只认领 `packages/app-server-client/**`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录，仅读取 `lime-rs/crates/app-server-protocol/schema/json/**` 作为 Rust schema fixture 事实源。
28. P3.82 npm client schema manifest 消费：`packages/app-server-client` 新增 `AppServerProtocolSchemaManifest`、`readProtocolSchemaManifest(...)`、`assertCompatibleProtocolSchemaManifest(...)`、`protocolSchemaFilePath(...)` 与 `listProtocolSchemaFiles(...)`，可读取 `schema/json/manifest.json`、校验 `protocolVersion` / JSON-RPC version / method catalog，并按 manifest 解析 `jsonrpc` 与 `v0` schema 文件路径；本轮不引入 `ts-rs` 或生成 TS 类型，先把 npm client 与 Rust checked-in JSON schema 串成同一事实源。
29. P3.82 schema 消费测试：`packages/app-server-client/tests/client.test.mjs` 新增临时 manifest 测试与真实 checked-in Rust schema manifest 测试，覆盖 method 顺序无关校验、protocol drift 拒绝、method catalog drift 拒绝，以及 `AgentSessionTurnStartParams / EvidenceExportResponse / JsonRpcRequest` schema 条目可被 npm client 定位。
30. P3.82 contract guard：`scripts/check-app-server-client-contract.mjs` 扩展到 84 项，新增 TypeScript schema manifest API 与 checked-in Rust schema 消费测试守卫，防止 npm client 继续只维护手写 DTO 而不消费 Rust schema fixture。
31. P3.82 增量 `npm test --workspace "packages/app-server-client"`：通过，29 个 Node tests 通过，新增覆盖 schema manifest helper 与 checked-in Rust schema manifest 消费。
32. P3.82 增量 `npx tsc --noEmit --project "packages/app-server-client/tsconfig.json"`：通过。
33. P3.82 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，84 项 contract guard 通过。
34. P3.82 增量 `git diff --check -- "packages/app-server-client/src/index.ts" "packages/app-server-client/tests/client.test.mjs" "scripts/check-app-server-client-contract.mjs" "internal/exec-plans/app-server-implementation-plan.md"`：通过。
35. P3.83 规则 / skills / testing policy 迁移：测试用例口径已从 Tauri current 改为 Electron Desktop Host + App Server JSON-RPC current。新增和重写测试默认覆盖 Electron IPC / preload、App Server protocol / client、`src/lib/desktop-host/` mock 与 `smoke:electron` / `verify:gui-smoke`；legacy Tauri adapter、`tauri-mock`、旧 `generate_handler!` 测试只作为退役守卫，不能再作为 GUI current 可交付证据。
36. P3.83 执行规则同步：已更新 `internal/test/README.md`、`internal/test/testing-strategy-2026.md`、`internal/test/e2e-tests.md`、高频 `internal/aiprompts/*` 导航，以及 `.codex/skills` 中 command-boundary / quality-workflow / governance / playwright / product-e2e / release / heatmap 入口。后续 agent 读取规则时应优先选择 Electron/App Server current 测试，不再围绕旧 Tauri headless 或 `src-tauri` 路径补主线证据。
37. P3.84 并行协作盘点：本轮继续避让 Electron / Tauri 替换写集，只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录；子代理只读审计确认 core `evidence/export -> RuntimeCore -> EvidenceExportProvider` 已闭合，但 Desktop JSONL in-process App Server 构造漏注入 evidence provider。
38. P3.84 Desktop evidence provider 注入：`in_process_app_server(...)` 已从 `aster_runtime_core_with_sources(...)` 改为 `aster_runtime_core_with_sources_and_evidence_export_provider(...)`，复用 `desktop_evidence_export_provider_with_runtime(&runtime)`；`app_server_handle_json_lines -> evidence/export` 不再落回 `NoopEvidenceExportProvider`，可委托同源 `export_runtime_evidence_pack_for_runtime(...)` 生成 `EvidencePackSummary`。
39. P3.84 定向守卫：`app_server_aster_host_port_json_rpc_evidence_export_uses_injected_provider` 通过 JSON-RPC `initialize -> initialized -> agentSession/start -> agentSession/turn/start -> evidence/export` 验证 provider 收到 current session / turn / events snapshot，并在 response 的嵌套 `evidencePack` 中返回 `completionAuditSummary` 与 evidence artifact；contract guard 锁定 Desktop provider 注入点，防止 in-process App Server 回退到无 evidence pack 的构造。
40. P3.85 测试入口 / 失败提示收口：把 DevBridge / smoke 失败提示从 `npm run tauri:dev:headless` 改为 `npm run electron:dev`；旧 `scripts/verify-gui-smoke.mjs` 明确标为 legacy Tauri GUI smoke 脚本，current `verify:gui-smoke` 继续由 `package.json` 指向 `smoke:electron`。
41. P3.85 质量任务选择器迁移：`scripts/quality-task-planner.mjs` 的 GUI smoke / bridge 触发面改到 `electron/**`、Electron build/smoke scripts、`src/lib/electron-host.ts` 与 `src/lib/desktop-host/**`；旧 `lime-rs/tauri.conf*` 只继续服务版本 / app metadata 一致性，不再代表 GUI current smoke。新增回归断言覆盖 Electron host 与 desktop-host mock 改动会触发 bridge + GUI smoke，`lime-rs/tauri.conf.json` 不再触发 GUI smoke。
42. P3.85 增量 `npm test -- scripts/quality-task-planner.test.ts`：通过，28 个 tests 通过。
43. P3.85 增量文本守卫：`rg -n "tauri:dev:headless|headless Tauri|Tauri IPC|Tauri mock|Tauri 命令封装|src/lib/tauri/|scripts/verify-gui-smoke.mjs"` 对本轮认领文件无 current 回流命中；保留命中仅限 legacy/deprecated 说明。
44. P3.85 增量 `git diff --check`：通过，覆盖本轮脚本、质量文档、测试指南和 Desktop Host 注释改动。
45. P3.86 Electron dev sidecar 自举：`scripts/run-electron-dev.mjs` 不再依赖开发机预先存在 `lime-rs/target/debug/app-server(.exe)`；新增 `scripts/lib/electron-dev-sidecar.mjs`，在未设置 `APP_SERVER_BIN` 且本地 debug sidecar 缺失时自动执行 `cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server`，构建成功后再把二进制路径注入 Electron 主进程。
46. P3.86 Electron renderer 依赖收口：`run-electron-dev.mjs` 现在监听 Vite renderer 子进程 `error/exit`；renderer dev server 异常退出时同步关闭 Electron 并以失败退出，避免开发态留下 `chrome-error://chromewebdata/` 空窗口和“后端已通但前端未加载”的假可用状态。
47. P3.86 自动构建守卫：新增 `scripts/lib/electron-dev-sidecar.test.mjs`，覆盖平台二进制名、仓库内 debug sidecar 路径、`APP_SERVER_BIN` 覆盖、本地二进制存在不构建、缺失时触发构建、构建后仍缺失时报错、cargo build 参数和 cargo 失败传播。
48. P3.86 增量验证：`node --check "scripts/run-electron-dev.mjs" && node --check "scripts/lib/electron-dev-sidecar.mjs"`、`npm test -- scripts/lib/electron-dev-sidecar.test.mjs`、`npm run typecheck:electron` 均通过；Playwright `_electron.launch` 在 Vite renderer 真实监听 `http://127.0.0.1:1420/` 时验证窗口 URL 为 `http://127.0.0.1:1420/`，`window.electronAPI` 注入成功，`get_config / workspace_list / app_server_handle_json_lines` 均支持，App Server `initialize` 返回 `appserver.v0 / 1.59.0`。
49. P3.87 并行协作盘点：Electron / package / DevBridge 写集仍由隔壁进程持有，本轮继续避让这些文件，只认领 `lime-rs/crates/app-server-daemon/src/settings.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录；目标是补 daemon settings 对 standalone external backend lifecycle 的持久化缺口。
50. P3.87 daemon settings external backend 持久化：`DaemonSettings` 新增 `backendCommand / backendArgs / backendTimeoutMs`，与已有 `backendMode / appPolicyPath / resourceRelativePath / allowEnvOverride` 一起 round-trip；这让 daemon lifecycle 后续可从 settings 完整恢复 `app-server --backend external --backend-command ... --backend-arg ... --backend-timeout-ms ...`，避免只保存 `backendMode=external` 后丢失真实 backend 启动参数。
51. P3.87 contract guard：`scripts/check-app-server-client-contract.mjs` 新增 daemon settings external backend launch options 守卫，锁定 camelCase JSON 字段、round-trip 测试和 packaged backend path 示例，防止独立 App / packaged resources lifecycle 回退成无法恢复 external backend 的半配置。
52. P3.88 DevBridge / 文档 current 口径收口：`safeInvoke` 类型与实现补齐 Electron IPC transport 语义，DevBridge 错误提示从旧 Tauri dev 后端改为 Electron 开发入口；高权重 `internal/aiprompts`、`src/lib`、`src/pages` 文档把命令边界、测试分层、webview / ASR 网关描述从 Tauri current 改为 Electron Desktop Host / App Server current，legacy Tauri 只保留 compat / deprecated / dead 说明。
53. P3.88 增量验证：`npm run test:bridge` 通过，覆盖 `src/lib/dev-bridge/safeInvoke.test.ts` 与 `src/lib/desktop-host/core.test.ts` 共 41 个测试；`npm run test:contracts` 通过，App Server client contract 85 项、command / harness / modality / docs boundary 均通过；关键词守卫确认 `Tauri IPC / Tauri mock / src-tauri / tauri:dev:headless` 在本轮认领文件只剩 legacy / deprecated / dead 语境；`git diff --check` 通过。
54. P3.89 Electron App Server eager warmup：`ElectronAppServerHost` 新增 `warmup()`，Electron `app.whenReady()` 后立即启动 App Server sidecar 并打印 `app-server ready`，不再等前端第一次 `app_server_handle_json_lines` 才懒启动；`run-electron-preview.mjs` 与 `electron-smoke.mjs` 也复用 `resolveDevAppServerBinary()`，未设置 `APP_SERVER_BIN` 且本地 debug sidecar 缺失时自动构建，确保 dev / preview / smoke 三条入口都能带起同一后端。
55. P3.89 Electron smoke 后端门禁：`LIME_ELECTRON_SMOKE=1` 不再只验证 renderer loaded；现在 renderer 加载后必须经 Electron host 发送 App Server JSON-RPC `initialize`，并断言 `serverInfo.name=app-server`、`protocolVersion=appserver.v0`，失败则 smoke 失败退出，避免“前端窗口已开但后端没启动”的假可用。
56. P3.89 增量验证：`node --check "scripts/run-electron-preview.mjs" && node --check "scripts/electron-smoke.mjs" && node --check "scripts/lib/electron-dev-sidecar.mjs"` 通过；`npm run typecheck:electron` 通过；`npm test -- scripts/lib/electron-dev-sidecar.test.mjs electron/ipcChannels.test.ts` 通过，13 个测试通过；`npm run electron:build:host:dev && node scripts/electron-smoke.mjs` 通过，输出 `[electron-host] app-server ready protocol=appserver.v0 version=1.59.0` 与 `[electron-smoke] app-server initialized protocol=appserver.v0 version=1.59.0`。完整 `npm run smoke:electron` 本轮曾卡在全量 `tsc` 阶段，未到 Electron/App Server 阶段，已改用 host build + smoke 覆盖本轮真实风险。
54. P3.89 并行协作盘点：继续避让 Electron / package / DevBridge 写集，本轮只认领 `lime-rs/crates/app-server-daemon/src/lib.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录；目标是把 P3.87 持久化的 daemon settings 真正接进 sidecar launch resolution，而不是只停留在 settings JSON。
55. P3.89 daemon settings 应用边界：`SidecarBinaryPathOptions` 新增 `apply_daemon_settings(...)` / `with_daemon_settings(...)`，把 `allowEnvOverride / resourceRelativePath / backendMode / backendCommand / backendArgs / backendTimeoutMs / appPolicyPath` 统一应用到 release manifest resolution；unsupported backend mode 会在 launch resolution 前失败，避免把错误配置延迟到 sidecar spawn。
56. P3.89 定向守卫：新增 daemon 测试覆盖 settings 应用后从 packaged resources 解析 binary path、保留 manifest sha256、生成 `external` backend launch config，并携带 content backend path、workspace args、timeout 和 policy path；contract guard 锁定 settings -> `SidecarBinaryPathOptions` 的应用边界。
54. P3.88 `npm run verify:local` 尝试结果：已通过版本一致性、i18n 资源结构、i18n unused key 后在 lint 阶段失败；失败点为并行进程未跟踪写集 `src/lib/desktop-host/plugin-dialog.ts` 的 overload 声明触发 `no-redeclare`，不在本轮认领文件内。本轮未夹写该目录，避免覆盖隔壁 Electron desktop-host 替换进程；后续由持有 `src/lib/desktop-host/**` 写集的进程修复该 lint。
55. P3.90 并行协作盘点：继续避让 Electron / package / DevBridge / desktop-host 写集，以及旧 `src-tauri/` 删除；本轮只认领 `lime-rs/crates/app-server-daemon/src/lib.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。子代理 Aquinas 只读对照 Codex daemon settings / lifecycle，结论是只迁 settings 缺失默认、路径上下文、operation lock、readiness probe 等机制层，不迁 `CODEX_HOME`、installer/updater、remote-control、websocket/UDS、Unix-only pid daemon 或 Codex 业务协议。
56. P3.90 daemon settings 文件消费闭环：`SidecarBinaryPathOptions` 新增 `with_daemon_state_paths(...)`，从 `DaemonStatePaths.settings_file` 加载 `DaemonSettings` 后应用到 launch options；新增 `resolve_sidecar_from_release_manifest_path_with_daemon_state(...)`，把 settings file -> release manifest -> `SidecarLaunchConfig` 串成 daemon lifecycle 可消费入口，不再停留在 settings object helper。
57. P3.90 定向守卫：新增 daemon 测试覆盖 settings 文件驱动 manifest resolution，确认 `allowEnvOverride=false` 会避开 env binary、`resourceRelativePath` 进入 packaged resources path、`backendMode=external` 携带 `backendCommand/backendArgs/backendTimeoutMs/appPolicyPath`；同时覆盖 settings 文件缺失时继续使用默认 resolution，避免独立 App 必须预写 settings。
58. P3.90 contract guard：`scripts/check-app-server-client-contract.mjs` 锁定 `with_daemon_state_paths(...)`、`DaemonSettings::load(&state_paths.settings_file)?`、`resolve_sidecar_from_release_manifest_path_with_daemon_state(...)` 以及两条 settings-file 测试名，防止 daemon lifecycle 回退成只保存 settings、不消费 settings 的半配置。
59. P3.90 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-daemon --check`：通过。
60. P3.90 增量 `CARGO_TARGET_DIR="/tmp/app-server-daemon-p390-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-daemon`：通过，37 个 daemon 测试通过。
61. P3.90 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，87 项 contract guard 通过。
62. P3.91 并行协作盘点：继续避让 Electron / package / DevBridge / desktop-host / npm client / sidecar smoke 脚本写集；本轮只认领 `lime-rs/crates/app-server-daemon/src/lib.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。目标是补 daemon readiness 失败路径的 stderr 证据，直接推进 production external backend crash / stderr validation 缺口。
63. P3.91 daemon readiness 失败 stderr 证据：`probe_sidecar_readiness(...)` 在 handshake 失败后先清理 child，再尝试 `drain_child_stderr(...)` 写入同一个 `stderr_log_file`；成功路径保持原有 probe report 的 `stderr_bytes`，失败路径不再只返回 `Protocol/Io` 而丢失 sidecar 启动错误输出。
64. P3.91 定向守卫：新增 `readiness_probe_drains_stderr_when_sidecar_exits_before_initialize_response`，用真实 `app-server --stdio --backend external` 但缺 `--backend-command` 的启动失败场景验证 readiness probe 失败时也会落 `--backend-command is required when --backend external` 到 stderr log。该测试仍受 `APP_SERVER_DAEMON_TEST_APP_SERVER_BIN` 门禁保护，普通 daemon 单测不会依赖本地 sidecar binary。
65. P3.91 contract guard：`scripts/check-app-server-client-contract.mjs` 锁定 `if result.is_err()`、失败路径 `drain_child_stderr(...)` 和新测试名，防止 readiness probe 后续回退成只在成功路径 drain stderr。
66. P3.91 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server-daemon --check`：通过。
67. P3.91 增量 `CARGO_TARGET_DIR="/tmp/app-server-daemon-p391-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-daemon`：通过，38 个 daemon 测试通过。
68. P3.91 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，87 项 contract guard 通过。
69. P3.91 增量 `CARGO_TARGET_DIR="/tmp/app-server-daemon-p391-target" cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server`：通过，生成真实 `app-server`；仍保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。
70. P3.91 增量 `APP_SERVER_DAEMON_TEST_APP_SERVER_BIN="/tmp/app-server-daemon-p391-target/debug/app-server" CARGO_TARGET_DIR="/tmp/app-server-daemon-p391-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-daemon readiness_probe_drains_stderr_when_sidecar_exits_before_initialize_response -- --nocapture`：通过，确认不是无环境变量 early return。
71. P3.92 并行协作盘点：继续避让 Electron / package / DevBridge / desktop-host / npm client / sidecar smoke 脚本写集；本轮只认领 `lime-rs/crates/app-server/src/external_backend.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。目标是补 standalone external backend 超时清理和 stderr 诊断，推进 production external backend crash/backoff/stderr validation 缺口。
72. P3.92 external backend 超时清理：`invoke_external_backend(...)` 在等待 stdout line 超时或等待 child exit 超时时，不再直接返回错误；现在统一进入 `cleanup_external_backend_after_timeout(...)`，先 `start_kill()` 再 `wait().await` 清理外部 backend 进程，并把 stderr reader join 后的摘要放入 `RuntimeCoreError::Backend` 文案。正常 JSONL streaming、stderr 读取、非零 exit 行为保持原有语义。
73. P3.92 定向守卫：新增 `external_backend_timeout_kills_process_and_reports_stderr_while_reading_stdout` 与 `external_backend_timeout_kills_process_and_reports_stderr_while_waiting_for_exit`，分别覆盖 backend 启动后不输出 stdout、以及 stdout EOF 后进程不退出两类真实 timeout；两条测试都确认错误文案包含 timeout phase 和 backend stderr。
74. P3.92 contract guard：`scripts/check-app-server-client-contract.mjs` 锁定 `cleanup_external_backend_after_timeout(...)`、`child.start_kill()`、`child.wait().await`、stderr summary 和两条超时测试名，继续禁止 `child.wait_with_output()` 回流，防止 external backend 退回一次性 stdout 或超时遗留子进程。
75. P3.92 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --check`：通过。
76. P3.92 增量 `CARGO_TARGET_DIR="/tmp/app-server-p392-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server external_backend --lib`：通过，6 个 external backend / streaming 定向测试通过；仍保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。
77. P3.92 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，87 项 contract guard 通过。
78. P3.93 并行协作盘点：继续避让 Electron / package / DevBridge / desktop-host / npm client / sidecar smoke 脚本写集；本轮只认领 `lime-rs/crates/app-server/src/runtime.rs`、`lime-rs/crates/app-server/src/lib.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。目标是补 streaming external backend 已发出部分事件后失败时的最终失败事件，继续推进 independent App 对 external backend crash 的可观测闭环。
79. P3.93 streaming 失败事件语义：`RuntimeCore::start_turn_inner(...)` 在 streaming path 中如果 backend 尚未 emit 事件就失败，仍按原语义 rollback turn；如果 backend 已 emit 过事件，新增 `AppendingRuntimeEventSink::emit_failure(...)` 追加 `turn.failed` 事件并通过同一 JSON-RPC connection 发给 client，然后再返回原始 JSON-RPC error。这样独立 App 不需要只依赖最终 response 才能知道 turn 失败。
80. P3.93 定向守卫：新增 `json_lines_loop_streams_turn_failed_after_partial_external_backend_events`，用真实 Node external backend 先输出 `message.delta` 再 stderr + exit(7)，断言 client 依次收到 partial event、`turn.failed` notification、`agentSession/turn/start` error response，且失败文案包含 backend stderr。
81. P3.93 contract guard：`scripts/check-app-server-client-contract.mjs` 锁定 `emit_failure(...)`、`"turn.failed"`、新 JSONL streaming 失败测试名和 `external backend crashed after partial output` 文案，防止 streaming path 回退成“已发 partial event 后只返回 error、没有最终失败事件”。
82. P3.93 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --check`：通过。
83. P3.93 增量 `CARGO_TARGET_DIR="/tmp/app-server-p393-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server json_lines_loop_streams --lib`：通过，2 个 JSONL streaming 测试通过；仍保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。
84. P3.93 增量 `CARGO_TARGET_DIR="/tmp/app-server-p393-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server external_backend --lib`：通过，7 个 external backend / streaming 定向测试通过；仍保留既有 dead_code warning。
85. P3.93 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，87 项 contract guard 通过。
86. P3.94 并行协作盘点：继续避让 Electron / package / DevBridge / desktop-host / npm client / sidecar smoke 脚本写集；本轮只认领 `lime-rs/crates/app-server/src/lib.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。目标是证明 streaming external backend 已输出部分事件后失败产生的 `turn.failed` 不只实时通知给 client，也能经 App Server current `evidence/export` 事后读取。
87. P3.94 evidence export 失败闭环：扩展 `json_lines_loop_streams_turn_failed_after_partial_external_backend_events`，在收到 `message.delta`、`turn.failed` notification 和 `agentSession/turn/start` error response 后，同一 JSONL connection 继续发送 `METHOD_EVIDENCE_EXPORT`，断言 read model events 同时包含 partial `message.delta` 与 `turn.failed`，且失败 message 保留 external backend stderr 摘要；artifacts 为空，避免把 failure event 误投影成 artifact。
88. P3.94 contract guard：`scripts/check-app-server-client-contract.mjs` 在 App Server stdio streaming guard 中锁定 `METHOD_EVIDENCE_EXPORT`、`includeEvents/includeArtifacts`、失败后 evidence export response 断言和 `turn.failed` 文案，防止后续回退成“实时 client 看得到失败，但 evidence/export 丢失失败终态”。
89. P3.94 增量 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --check`：通过。
90. P3.94 增量 `CARGO_TARGET_DIR="/tmp/app-server-p394-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server json_lines_loop_streams_turn_failed_after_partial_external_backend_events --lib`：通过，1 个 JSONL streaming 失败闭环测试通过；仍保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。
91. P3.94 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，87 项 contract guard 通过。
92. P3.94 增量 `npm run test:contracts`：通过，agent runtime clients、App Server client contract、command contracts、harness contracts、modality contracts、harness cleanup report 与 docs boundary 均通过。
93. P3.95 并行协作盘点：`scripts/app-server-sidecar-lifecycle-smoke.mjs`、`scripts/app-server-external-backend-smoke.mjs` 与 `packages/app-server-client/**` 已有 staged 改动；本轮先只读审阅并运行现有 smoke。确认 sidecar lifecycle smoke 证明 packaged manifest + JSON-RPC + event routing success path，external backend smoke 证明 external backend success path + artifact/evidence export，但二者之间仍缺 packaged sidecar 下 external backend crash 后 `turn.failed` / evidence 的 independent app client 失败路径证据。
94. P3.95 TypeScript client 失败路径诊断：`AppServerConnection.waitForResponse(...)` 收到目标 JSON-RPC error response 时不再丢弃此前已收集的 streaming notifications / messages；新增 `AppServerRequestError`，保留 `response`、`notifications` 与 `messages`，让 independent app 在 `agentSession/turn/start` 失败时仍可读取已到达的 `message.delta` 与 `turn.failed` 事件。
95. P3.95 定向守卫：`packages/app-server-client/tests/client.test.mjs` 新增 `connection request errors preserve streamed notifications and response context`，用内存 transport 模拟 `message.delta -> turn.failed -> error response`，断言抛出的 `AppServerRequestError` 携带 `turn.failed` 和原始 runtime error response；contract guard 同步锁定错误类型和测试断言，防止 client 包装层回退成只抛普通 `Error`。
96. P3.95 运行证据：用 `/tmp/app-server-smoke-target/debug/app-server` 跑现有 `scripts/app-server-sidecar-lifecycle-smoke.mjs` 与 `scripts/app-server-external-backend-smoke.mjs` 均通过；随后用一次性 Node E2E 构造临时 packaged resources + external backend，backend 先输出 `message.delta` 再写 stderr 并 exit(7)，验证 independent app client 收到 `AppServerRequestError`，其 `clientEvents=message.delta,turn.failed`，再调用 `evidence/export` 得到 `evidenceEvents=message.delta,turn.failed`。该临时 E2E 未写入仓库，避免覆盖已被隔壁进程占用的 smoke 脚本。
97. P3.95 增量 `npm --prefix "packages/app-server-client" run build`：通过。
98. P3.95 增量 `npm --prefix "packages/app-server-client" test`：通过，30 个 Node tests 通过。
99. P3.95 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，87 项 contract guard 通过。
100. P3.96 packaged external backend failure smoke 固化：因 `scripts/app-server-sidecar-lifecycle-smoke.mjs`、`scripts/app-server-external-backend-smoke.mjs` 与 `package.json` 仍由隔壁 Electron / smoke 写集占用，本轮新增独立 `scripts/app-server-packaged-external-backend-failure-smoke.mjs`，不覆盖现有 smoke。新脚本复用 packaged resources release manifest / sha256 / `startPackagedAppServerSidecar(...)`，但以 `backendMode=external` 启动会先输出 `message.delta`、再写 stderr 并 `exit(7)` 的 backend。
101. P3.96 failure smoke 断言：脚本要求 `startTurn(...)` 抛出 `AppServerRequestError`，并从 `turnResult.error.notifications` 断言 client streamed events 包含 `message.delta` 与 `turn.failed`；随后调用 `connection.exportEvidence({ includeEvents: true, includeArtifacts: true })`，断言 evidence events 同样包含 `message.delta` 与 `turn.failed`，且两个 failure payload 都包含 `packaged external backend crashed after partial output` stderr 摘要，失败 turn artifact count 为 0。
102. P3.96 contract guard：`scripts/check-app-server-client-contract.mjs` 新增 `Packaged sidecar failure smoke preserves streamed failure evidence` 守卫，锁定 `AppServerRequestError`、`backendMode: "external"`、`writeFailingExternalBackend(...)`、`assertFailureEvents(clientEvents, ...)`、`connection.exportEvidence` 与 `clientEvents/evidenceEvents` 输出，防止 packaged sidecar failure evidence 入口退化成只测 success path。
103. P3.96 增量 `node --check "scripts/app-server-packaged-external-backend-failure-smoke.mjs"`：通过。
104. P3.96 增量 `npm --prefix "packages/app-server-client" test`：通过，30 个 Node tests 通过。
105. P3.96 增量 `node "scripts/check-app-server-client-contract.mjs"`：通过，88 项 contract guard 通过。
106. P3.96 增量 `APP_SERVER_BIN="/tmp/app-server-smoke-target/debug/app-server" node "scripts/app-server-packaged-external-backend-failure-smoke.mjs"`：通过，输出 `clientEvents=message.delta,turn.failed`、`evidenceEvents=message.delta,turn.failed`，client failure 与 evidence failure 都包含 `external app-server backend exited with status exit status: 7: packaged external backend crashed after partial output`。
107. P3.97 并行协作盘点：`package.json`、`package-lock.json`、`electron/**`、`scripts/prepare-electron-app-server-assets.mjs`、`scripts/lib/electron-app-server-assets.mjs`、`scripts/stage-electron-release-assets.mjs` 与 `scripts/verify-electron-package-resources.mjs` 仍由隔壁 Electron packaging 写集占用；本轮不夹写这些文件，只运行现有入口并记录验收证据。Zeno 只读审阅确认 packaged resources / manifest / sha256 / Desktop assets / Electron host packaged sidecar 启动链路已有实现依据，剩余缺口是 `scripts/app-server-packaged-external-backend-failure-smoke.mjs` 尚未接入 npm / packaging gate。
108. P3.97 Electron packaged resource 验证：`node "scripts/verify-electron-package-resources.mjs" --package-root "dist-electron"` 通过，验证当前 `dist-electron` 下 `app-server.release.json`、`app-server/darwin-arm64/app-server` sha256、`desktop-assets/*` 与 `dist-electron/main/main.js` import 形态；输出 verified platform 为 `darwin-arm64`，resourceRoot 为仓库 `dist-electron`。
109. P3.97 Electron host build 验证：`npm run electron:build:host` 通过，覆盖 `packages/app-server-client` build、`npm run typecheck:electron`、Electron main/preload build、desktop assets copy 与 `prepare-electron-app-server-assets`；App Server sidecar 通过 `cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server` 构建并复制到 `dist-electron/app-server/darwin-arm64/app-server`，仍保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。
110. P3.97 Electron package resource 脚本语法验证：`node --check "scripts/verify-electron-package-resources.mjs" && node --check "scripts/stage-electron-release-assets.mjs"` 通过。
111. P3.97 Electron smoke 当前阻塞：直接运行 `node "scripts/electron-smoke.mjs"` 失败于 Electron main 加载阶段，尚未进入 App Server sidecar initialize；错误为 `Named export 'autoUpdater' not found. The requested module 'electron-updater' is a CommonJS module`，来源是 `electron/updateHost.ts` 中 `import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater"` 被打包成 `dist-electron/main/main.js` 的 named ESM import。该文件属于隔壁 Electron 写集，本轮未夹写；下一刀应由 Electron 写集持有者改为默认 import 解构或等同兼容写法，再重跑 `node scripts/electron-smoke.mjs`。
112. P3.97 gate 缺口：当前 `package.json` 已有 `smoke:app-server-sidecar-lifecycle`、`smoke:app-server-external-backend`、`electron:verify:package`、`electron:package:dir` 与 `electron:dist`，但尚未把 `scripts/app-server-packaged-external-backend-failure-smoke.mjs` 接进 npm scripts 或 packaging verification gate；等 `package.json` 写集稳定后，应新增统一入口并让 `electron:verify:package` 或 release/windows packaging gate 引用它，避免 failure smoke 只停留在手动脚本。
113. P3.98 并行协作盘点：向 Franklin / Boole / Zeno 只读确认 `electron/updateHost.ts`、`electron/main.ts`、`package.json`、`package-lock.json`、`scripts/*electron*` 与 `scripts/app-server-*smoke.mjs` 写集；三者均回复未认领或可避让。本轮认领范围收敛为 `electron/updateHost.ts`、`package.json`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录；不触碰 `package-lock.json`、Electron packaging helper 脚本或已有 sidecar success smoke。
114. P3.98 Electron updater CJS/ESM 阻塞修复：`electron/updateHost.ts` 保留 `ProgressInfo / UpdateInfo` 的 type-only import，但运行时值改为默认导入 `electronUpdater` 后解构 `autoUpdater`，匹配 `electron-updater` 当前 CommonJS 运行时形态，避免 Vite 产物继续生成 named ESM import。更新业务语义、命令白名单和 IPC 路由均不变。
115. P3.98 Electron smoke 闭环：`npm run typecheck:electron` 通过；`npm run electron:build:host` 通过，覆盖 app-server-client build、Electron typecheck、main/preload build、desktop assets 与 App Server sidecar assets；`node "scripts/electron-smoke.mjs"` 通过，输出 renderer loaded、`app-server ready protocol=appserver.v0 version=1.59.0` 与 `app-server initialized protocol=appserver.v0 version=1.59.0`，确认 P3.97 main-load 阻塞解除并到达 App Server initialize。
116. P3.98 packaged failure smoke gate 接入：`package.json` 新增 `smoke:app-server-packaged-external-backend-failure`，统一执行 `packages/app-server-client` build 后运行 `scripts/app-server-packaged-external-backend-failure-smoke.mjs`；`electron:verify:package` 改为先验证 package resources，再串接该 failure smoke，防止 packaged external backend failure evidence 只停留为手动脚本。
117. P3.98 contract guard：`scripts/check-app-server-client-contract.mjs` 新增 `Root package gate runs packaged external backend failure smoke` 守卫，锁定 npm script、failure smoke 脚本路径、app-server-client build 前置和 `electron:verify:package` 串接关系；App Server client contract guard 从 88 项增至 89 项。
118. P3.98 failure smoke 验证：`npm run smoke:app-server-packaged-external-backend-failure` 通过，输出 `clientEvents=message.delta,turn.failed` 与 `evidenceEvents=message.delta,turn.failed`，client failure / evidence failure 均包含 `packaged external backend crashed after partial output` stderr 摘要。
119. P3.98 resource / contract 验证：`node "scripts/verify-electron-package-resources.mjs" --package-root "dist-electron"` 通过，验证 `dist-electron` 下 app-server release manifest、darwin-arm64 sidecar sha256 与 desktop assets；`node "scripts/check-app-server-client-contract.mjs"` 通过，89 项 contract guard 通过；`npm run test:contracts` 通过，agent runtime clients、App Server client contract、command / harness / modality / cleanup / docs boundary 均通过。
120. P3.98 聚合 gate 限制：直接运行 `npm run electron:verify:package` 会先查默认 `release-electron`，在未完成 `electron-builder --dir` 的本地环境下失败于 `no Electron packaged resource root found under .../release-electron`；这不是 failure smoke 本身失败。随后尝试 `npm run electron:package:dir` 生成真实 `release-electron`，但在当前多进程并发环境中长时间卡在全量 renderer `tsc` 阶段，且机器上同时存在其他同类构建链；为避免影响隔壁进程，本轮只终止自己启动的 package-dir 进程树，未宣称 release-electron package-dir 验收完成。
121. P3.98 diff hygiene：本轮认领文件 `git diff --check -- "electron/updateHost.ts" "package.json" "scripts/check-app-server-client-contract.mjs"` 通过。
122. P3.98 剩余缺口：还需在低并发环境完成 `npm run electron:package:dir && npm run electron:verify:package`，证明 `release-electron` 的真实 electron-builder directory package 同时满足 packaged resources 校验与 external backend failure smoke；true standalone Aster backend 仍未实现，当前真实 Aster 路径仍是 Desktop host adapter / in-process bridge。
62. P3.91 Electron packaged sidecar resources：新增 `scripts/lib/electron-app-server-assets.mjs` 与 `scripts/prepare-electron-app-server-assets.mjs`，生产 `electron:build:host` 在复制 logo/tray 后继续准备 `dist-electron/app-server/<platform>/app-server` 与 `dist-electron/app-server.release.json`；manifest 使用 `appserver.v0`、package version、platform artifact 和 sha256 pin。`electron:build:host:dev` 仍只构建 main/preload 与桌面 assets，不把 dev watch 路径强行变成 packaged resources。
63. P3.91 helper 边界收敛：`electron-dev-sidecar.mjs` 继续作为开发态 debug binary / cargo build / watch 的唯一来源；`electron-app-server-assets.mjs` 只复用其 `appServerBinaryName` 与 `resolveDevAppServerBinary`，不复制开发态 watch / build 参数规则。`run-electron-preview.mjs` 与 `electron-smoke.mjs` 改为 `resolveElectronAppServerRuntimeEnv()`，有 `dist-electron/app-server.release.json` 时不再注入 `APP_SERVER_BIN`，无 manifest 时才回退开发 binary。
64. P3.91 Electron host resources fallback：`ElectronAppServerHost` 在无 `APP_SERVER_BIN` 时先尝试 `process.resourcesPath/app-server.release.json`，再尝试未打包预览的 `app.getAppPath()/dist-electron/app-server.release.json`，最后才回退开发 debug binary；Electron ready 后仍 eager warmup，确保 packaged/preview 后端不是等前端第一次请求才启动。
65. P3.91 增量验证：`node --check scripts/lib/electron-app-server-assets.mjs scripts/prepare-electron-app-server-assets.mjs scripts/run-electron-preview.mjs scripts/electron-smoke.mjs scripts/lib/electron-dev-sidecar.mjs` 通过；`npm test -- scripts/lib/electron-dev-sidecar.test.mjs scripts/lib/electron-app-server-assets.test.mjs` 通过，17 个测试；`npm run typecheck:electron` 通过；`npm run electron:build:host` 通过并生成 `dist-electron/app-server.release.json` 与 `dist-electron/app-server/darwin-arm64/app-server`；sha256 校验 manifest 与二进制一致；未设置 `APP_SERVER_BIN` 直接运行 `node scripts/electron-smoke.mjs` 通过，输出 `app-server ready protocol=appserver.v0 version=1.59.0` 与 `app-server initialized protocol=appserver.v0 version=1.59.0`。本轮认领文件 `rg "src-tauri"` 无命中，`git diff --check` 通过。
62. P3.91 src/lib current 文案收口：继续避让 Electron / package / desktop-host 未跟踪写集，只认领 `src/hooks/useDeepLink.ts`、`src/lib/dev-bridge/http-client.{ts,d.ts}`、`src/lib/webview-api.ts`、`src/lib/api/{apiKeyProvider,skill-execution,videoGeneration}.ts`、`src/lib/api/{agentApps,layeredDesignAnalysis}.test.ts` 与 `src/lib/layered-design/analyzer.unit.test.ts`。把 Deep Link、DevBridge、webview、Provider / Skill / Video API 网关、Layered Design / Agent App 测试描述里的 “Tauri current 命令 / Tauri 后端” 改为 Desktop Host / App Server current 口径，legacy Tauri 只保留兼容 adapter 语境。
63. P3.91 增量验证：关键词守卫 `rg -n "Tauri 后端|非 Tauri webview|Tauri webview/window/event|current Tauri|Tauri 命令调用|Tauri 命令代理|Tauri native heuristic|通过 HTTP 桥接调用 Tauri"` 对本轮认领源码无命中；`npm test -- "src/hooks/useDeepLink.test.tsx" "src/lib/dev-bridge/http-client.test.ts" "src/lib/dev-bridge/safeInvoke.test.ts" "src/lib/api/layeredDesignAnalysis.test.ts" "src/lib/layered-design/analyzer.unit.test.ts" "src/lib/api/agentApps.test.ts"` 通过，6 个测试文件共 80 个测试通过；`npm run docs:boundary` 与本轮认领文件 `git diff --check` 均通过。
64. P3.92 scripts current 口径收口：继续避让 Electron / package / desktop-host / App Server daemon 写集，只认领 `scripts/ensure-dev-port.mjs`、`scripts/knowledge-release-scope-report.mjs`、`scripts/lib/vitest-layer-classifier.mjs`、`scripts/lib/vitest-layer-classifier.unit.test.mjs` 与本执行计划记录。把开发端口提示从旧 `tauri:dev` 改为 current `npm run dev`，把知识发布范围和 Vitest 分层分类器从 `tauri-mock` / `tauri-api` / `src-tauri/target` 口径收敛到 Desktop Host / `lime-rs/target` current 事实源；legacy Tauri adapter 仍只保留在明确 legacy / deprecated 语境。
65. P3.92 增量验证：`node --check "scripts/ensure-dev-port.mjs" && node --check "scripts/knowledge-release-scope-report.mjs" && node --check "scripts/lib/vitest-layer-classifier.mjs"` 通过；`npm test -- "scripts/lib/vitest-layer-classifier.unit.test.mjs"` 通过，15 个 tests 通过；关键词守卫 `rg -n "runningInsideSrcTauri|npm run tauri:dev|src/lib/tauri-mock/core|tauri-api|Tauri / bridge|tauri-mock"` 对本轮认领脚本无 current 回流命中；本轮认领文件 `git diff --check` 通过。
66. P3.93 Agent App 架构测试 current 守卫：继续避让 Electron / package / desktop-host / standalone packaging staged 写集，只认领 `src/features/agent-app/architecture/importBoundaries.test.ts` 与本执行计划记录。把 Domain / Shell / Packaging 与 UI 边界测试从 “Tauri invoke current” 文案改为 Desktop Host / App Server current 口径，并新增禁止 Domain / UI 直接 import `@/lib/desktop-host/*` 的守卫；`@tauri-apps/*` 仍作为 legacy Tauri API 禁止项保留。
67. P3.93 增量验证：`npm test -- "src/features/agent-app/architecture/importBoundaries.test.ts"` 通过，1 个文件 3 个 tests 通过；关键词守卫 `rg -n "Domain / Shell / Packaging 模块不反向依赖 UI、Tauri|UI 不直接触碰 Tauri invoke|直接 invoke Tauri command|直接依赖 Tauri API" "src/features/agent-app/architecture/importBoundaries.test.ts"` 无命中；本轮认领文件 `git diff --check` 通过。
68. P3.94 standalone release evidence 口径收口：继续避让 standalone Tauri adapter / packaging staged 测试写集，只认领 `scripts/lib/agent-app-standalone-release-evidence-core.mjs`、`src/features/agent-app/packaging/releasePipeline.ts` 与本执行计划记录。把 final release / release pipeline 里的 “Tauri build evidence” 中性化为 standalone build evidence / production artifact build evidence；`tauri_build_runner` 等旧 adapter 名保持 deprecated adapter 语境，不在本轮大迁名。
69. P3.94 增量验证：`npm test -- "scripts/lib/agent-app-standalone-release-evidence-core.test.mjs" "src/features/agent-app/packaging/releasePipeline.test.ts"` 通过，2 个文件 10 个 tests 通过；关键词守卫 `rg -n "Tauri build evidence|completed Tauri build|Tauri build before" "scripts/lib/agent-app-standalone-release-evidence-core.mjs" "src/features/agent-app/packaging/releasePipeline.ts"` 无命中；本轮认领文件 `git diff --check` 通过。
70. P3.95 旧 Tauri dev server helper 封存：继续避让 `package.json`、`scripts/run-tauri-dev.mjs`、`scripts/run-tauri-profile.mjs` 与 staged `scripts/tauri-deprecated.mjs` 写集，只认领 `scripts/start-tauri-dev-server.mjs` 与本执行计划记录。旧 helper 不再调用 `runViteDevServerBootstrap({ browserBridge:false })` 或 `dev:tauri-shell` 启动 Tauri/Vite 开发面，改为导入现有退役提示脚本，确保直接执行旧入口也只提示 Electron current 入口。
71. P3.95 增量验证：`node --check "scripts/start-tauri-dev-server.mjs"` 通过；关键词守卫 `rg -n "runViteDevServerBootstrap|dev:tauri-shell|browserBridge: false|tauri dev|Tauri dev server" "scripts/start-tauri-dev-server.mjs"` 无命中；本轮认领文件 `git diff --check` 通过。
72. P3.96 appserver 路线图 current/compat 口径收口：继续避让 staged `internal/roadmap/appserver/{README,frontend-electron-migration,implementation-plan,service-extraction}.md`，只认领 `internal/roadmap/appserver/{architecture,protocol,prd,flowcharts}.md` 与本执行计划记录。把仍像 current 主路径的 `Tauri command` / `Tauri adapter` 描述改为 `legacy Tauri adapter` / `compat / deprecated` 语境，并在架构图中把 Lime Desktop current client 指向 Electron Main Client；legacy Tauri adapter 只保留 dotted compat 边。
73. P3.96 增量验证：`npm run docs:boundary` 通过；关键词守卫 `rg -n 'Tauri command|Tauri adapter|Tauri DTO|Tauri event|Tauri state|Tauri AppHandle|Tauri-only|@tauri-apps|Tauri' "internal/roadmap/appserver/protocol.md" "internal/roadmap/appserver/architecture.md" "internal/roadmap/appserver/prd.md" "internal/roadmap/appserver/flowcharts.md"` 的剩余命中均为 `legacy Tauri ...` 或 compat 描述；本轮认领文件 `git diff --check` 通过。
74. P3.97 Electron updater release 主链替换：继续避让大面积 Rust / DevBridge / desktop-host 写集，只认领 Electron release/updater/package 边界。`release.yml` 与 `build-windows-test.yml` 已从 Tauri action / Tauri signing updater 资产切到 `electron-builder`；macOS 签名/公证改用 Electron Builder `CSC_LINK / CSC_KEY_PASSWORD / APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID`，updater feed 改为 `electron-updater` generic provider，按 `darwin-arm64 / darwin-x64 / win32-x64` 三个 current feed 发布。
75. P3.97 updater 资产治理：`electron-builder.yml` 生成 `dmg / zip / nsis` 与 Electron `latest-mac.yml / latest.yml / .blockmap`；`stage-electron-release-assets.mjs` 只 staging Electron installer / updater metadata；`plan-electron-updater-r2-upload.mjs` 只上传 current feed 与 `v<version>` 版本化路径，并拒绝 `.app.tar.gz / .sig / latest.json` 旧 Tauri updater 资产。`prepare-github-release-assets.mjs` 删除旧 `.app.tar.gz(.sig)` 特例，只保留通用同名资产平台前缀。
76. P3.97 release 测试与守卫：`scripts/release-updater-manifest.test.mjs` 不再测试旧 Tauri updater 清单生成，改为覆盖 Electron updater R2 upload plan、legacy asset 拒绝、R2 cleanup 的 Electron 路径样本和 GitHub release asset staging。`release-updater-manifest.mjs` 当前未被 `package.json` 或 release workflow 调用，分类为 `deprecated/dead` 残留，下一刀在取得删除确认后物理删除。
77. P3.97 增量验证：`node --check "scripts/prepare-github-release-assets.mjs" "scripts/stage-electron-release-assets.mjs" "scripts/plan-electron-updater-r2-upload.mjs" "scripts/verify-electron-package-resources.mjs"` 通过；YAML parse 覆盖 `.github/workflows/release.yml`、`.github/workflows/build-windows-test.yml`、`electron-builder.yml` 通过；`npx vitest run "scripts/release-updater-manifest.test.mjs"` 通过，4 个 tests；`npm run typecheck:electron` 通过；`npm run electron:build:host && node scripts/electron-smoke.mjs` 通过，输出 `app-server ready protocol=appserver.v0 version=1.59.0` 与 `app-server initialized protocol=appserver.v0 version=1.59.0`；`node "scripts/verify-electron-package-resources.mjs" --package-root "dist-electron"` 通过。完整 `npm run smoke:electron` 本轮因并行多个全量 `tsc` 卡在 renderer build 阶段，已停止本轮启动的进程组，未把它作为通过证据。
78. P3.99 Electron packaged sidecar 启动收口：`ElectronAppServerHost` 的 launch config 现在携带 `verifySha256`，默认仍验证 release manifest sha256；仅在 macOS packaged app 且资源根等于 `process.resourcesPath` 时关闭启动前文件 hash，避免 Developer ID / ad-hoc signing 改写 sidecar Mach-O 后阻断 App Server warmup。开发态、`APP_SERVER_BIN`、未打包预览、Windows packaged 仍保留原校验口径。
79. P3.99 packaged resource verifier：`scripts/verify-electron-package-resources.mjs` 输出 manifest / packaged sha256 对比证据；若 macOS packaged sidecar hash 不一致，只有 `codesign --verify --strict` 通过时才接受为 `macos-signed-sidecar`，否则仍失败。当前本机 `release-electron/mac-arm64/Lime.app` 验证结果为 `matches: true` / `acceptedBecause: "sha256"`。
80. P3.99 standalone updater secret 迁移：Agent App standalone release gate 的 current secret 入口从 `TAURI_SIGNING_*` 改为 `LIME_AGENT_APP_UPDATER_SIGNING_PRIVATE_KEY*`，workflow 不再注入 Tauri signing secrets；preflight 脚本保留旧 `TAURI_SIGNING_*` alias 作为迁移兼容，分类为 `compat`，退出条件是 CI secrets 全量切到新命名后删除 alias 和对应测试。
81. P3.99 packaged release 验证：`CSC_IDENTITY_AUTO_DISCOVERY=false LIME_ELECTRON_UPDATES_URL="https://updates.limecloud.com/lime/stable/darwin-arm64/" npx electron-builder --dir --publish never` 生成 `release-electron/mac-arm64/Lime.app`；本轮启动的 builder 会话因 Electron Builder 静默挂起已在产物验证通过后只终止本轮 PID 3064/3369，未触碰更早存在的 57772/57865 进程。`node "scripts/verify-electron-package-resources.mjs" --package-root "release-electron" --platform darwin --arch arm64` 通过，确认 packaged resources、desktop assets、sidecar 和 manifest 可用。
82. P3.99 增量验证：`npm run typecheck:electron` 通过；`npm run electron:build:host` 通过；`node scripts/electron-smoke.mjs` 通过并输出 renderer loaded、`app-server ready protocol=appserver.v0 version=1.59.0`、`app-server initialized protocol=appserver.v0 version=1.59.0`；`npx vitest run "scripts/release-updater-manifest.test.mjs"` 通过，4 个 tests；`npx vitest run "scripts/lib/agent-app-standalone-release-secret-preflight-core.test.mjs"` 通过，5 个 tests；`node --check "scripts/verify-electron-package-resources.mjs" "scripts/agent-app-standalone-release-secret-preflight.mjs" "scripts/lib/agent-app-standalone-release-secret-preflight-core.mjs"` 通过；`npm run electron:verify:package` 通过，串接真实 `release-electron` resource verifier 与 packaged external backend failure smoke。
83. P3.100 packaged directory gate 收口：`electron/updateHost.ts` 已修复 `electron-updater` CommonJS / ESM named import 阻塞，Electron smoke 可进入 App Server sidecar initialize；`package.json` 新增 `smoke:app-server-packaged-external-backend-failure`，并让 `electron:verify:package` 串接 `verify-electron-package-resources` 与 packaged external backend failure smoke，防止 release package gate 漏掉 partial-output failure / evidence 回归。
84. P3.100 本地 directory package 入口：新增 `scripts/run-electron-package-dir.mjs`，`electron:package:dir` 改为先 `npm run electron:build` 再运行该脚本；脚本只在 directory package 验收路径设置 `CSC_IDENTITY_AUTO_DISCOVERY=false`，规避本机多个同名 Developer ID 证书导致的 `codesign ambiguous`，不改变 `electron:dist` 的发布签名 / 公证路径。
85. P3.100 Rust compile 阻塞修复：`lime-rs/crates/app-server/src/runtime.rs` 中 `AgentSessionReadResponse` 构造补齐 `detail: None`，使当前 `app-server` binary 可以从 `lime-rs/Cargo.toml` workspace manifest 正常构建；该改动只补协议字段构造，不改变 session read 语义。
86. P3.100 真实 package 验收：`npm run electron:package:dir` 已生成 `release-electron/mac-arm64/Lime.app`；`npm run electron:verify:package` 已通过，验证真实 packaged resources、`app-server/darwin-arm64/app-server`、manifest / packaged sidecar hash 证据，以及 packaged external backend failure smoke。macOS signing 改写 sidecar 时 verifier 仅在 `codesign --verify --strict` 通过时接受 `macos-signed-sidecar`。
87. P3.100 增量验证：`node --check "scripts/run-electron-package-dir.mjs"`、`node "scripts/check-app-server-client-contract.mjs"` 通过并固定 90 项 contract guard、`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server --check` 通过、`cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server` 通过、`npm run electron:package:dir` 通过、`npm run electron:verify:package` 通过、`npm run test:contracts` 通过、认领文件 `git diff --check` 通过；本轮未宣称 true standalone Aster backend 完成，当前真实 Aster 仍依赖 Desktop host adapter / in-process bridge。
88. P3.101 Electron updater / metadata current 事实源收口：继续避让并行 Electron packaging / DevBridge / desktop-host 大写集，本轮认领 app metadata evidence、Rust legacy updater dependency、capability 描述与本执行计划记录。`scripts/i18n-app-metadata-workflow-report.ts` 与 `scripts/i18n-app-metadata-locale-build-manifest.ts` 支持读取 YAML，reviewed metadata 从旧 `tauri.conf*` 切到 `electron-builder.yml#productName/appId/artifactName/protocols[0].schemes/mac.icon/win.icon`；`internal/roadmap/i18n/app-metadata-translation-scope.json`、`app-metadata-locale-build-manifest.json` 与 `app-metadata-workflow-inventory.json` 已刷新为 Electron Builder 证据，`agent-app-shell` capability 描述改为 Desktop Host IPC。
89. P3.101 Tauri updater 下线：`lime-rs/Cargo.toml` 移除 `tauri-plugin-updater` workspace 与 root dependency，`Cargo.lock` 自动收敛删除 `tauri-plugin-updater` 及其独有依赖；`lime-rs/src/app/runner.rs` 不再注册 Tauri updater plugin；`lime-rs/src/commands/update_cmd.rs` 移除 `tauri_plugin_updater` 安装路径，legacy `download_update` / `start_update_install_session` 只保留检查和手动下载兜底，并明确当前安装升级由 Electron updater 接管。current updater 事实源保持 `electron/updateHost.ts` + `electron-builder.yml` generic feed。
90. P3.101 增量验证：`npx vitest run "scripts/quality-task-planner.test.ts" "scripts/i18n-app-metadata-workflow-report.test.ts" "scripts/i18n-app-metadata-locale-build-manifest.test.ts"` 通过，34 个 tests；`npm run verify:app-version` 通过；`npm run test:contracts` 通过，App Server client contract 当前 91 checks；`cargo fmt --manifest-path "lime-rs/Cargo.toml" --check` 通过；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime --lib` 通过，仅保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime update_cmd --lib` 通过，3 个 update_cmd 单测；`rg` 确认 current i18n evidence 无 `tauri.conf/src-tauri/Tauri IPC` 命中，Cargo / Rust source 无 `tauri-plugin-updater`、`tauri_plugin_updater`、`LIME_UPDATER_PUBLIC_KEY`、`updater_builder`、`build_tauri_updater` 或 `install_update_via_updater` 命中。
91. P3.101 剩余治理分类：`scripts/release-updater-manifest.test.mjs` 中“拒绝旧 Tauri updater 资产”属于 `dead` asset 防回流测试；`scripts/lib/agent-app-standalone-release-secret-preflight-core.{mjs,test.mjs}` 中 `TAURI_SIGNING_*` 属于 standalone release secret 迁移 `compat` alias，退出条件是 CI secrets 全量迁到 `LIME_AGENT_APP_UPDATER_SIGNING_*` 后删除 alias 和测试；`scripts/run-tauri-dev.mjs`、`scripts/run-tauri-profile.mjs`、`scripts/update-version.sh`、standalone Tauri config/build runner tests 属于 `deprecated/dead` Tauri adapter 残留，删除文件需单独确认。
92. P3.102 Aster adapter host-state 边界切分：继续避让 Electron / package / DevBridge / desktop-host 大写集，本轮只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。`TauriAsterBackendHost::submit_turn(...)` 中的纯映射已提取为 `DesktopAsterQueuedTurn` 和 `desktop_aster_queued_turn_from_backend_request(...)`，先把 `AsterBackendSubmitRequest -> AsterChatRequest -> QueuedTurnTask` 从 session persistence、Tauri event listener 和 `RuntimeCommandContext::submit_runtime_turn(...)` 中切开；这不是宣称 true standalone Aster backend 完成，而是减少后续 standalone host 需要搬运的 Desktop state 混杂面。
93. P3.102 定向守卫：新增 `desktop_aster_queued_turn_boundary_preserves_submit_mapping_without_host_state`，不构造 `RuntimeCommandContext`、不注册 Tauri listener，直接证明 queued turn 边界保留 session / turn / provider / model / queued_turn_id / metadata / `app_server` capability metadata / queue flags。`scripts/check-app-server-client-contract.mjs` 增至 91 项，新增 “Desktop Aster adapter separates queued-turn mapping from host state” 守卫，锁定新边界结构、函数、测试名和 `submit_runtime_turn(queued_turn.queued_task, ...)` 调用形态，防止协议映射重新揉回 Desktop host-state glue。
94. P3.102 子代理只读审阅结论：`app-server/src/aster_backend.rs` 的 `AsterBackendHost` 已是干净的 host-independent 外层边界；true standalone Aster backend 的主要阻塞仍在 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs` 与 `runtime_turn/**`：`RuntimeCommandContext` 绑定 `AppHandle / AsterAgentState / DbConnection / ApiKeyProvider / Config / Mcp / Automation`，session 持久化依赖 Desktop DB/state/MCP，cancel 绑定 Desktop queue / timeline / turn gate，action response 绑定 Desktop action runtime，streaming event bridge 仍通过 Tauri listener 和 `lime_agent::AgentEvent` 转换。下一刀应继续把这些 port 化，而不是把 `external` backend 或 fake skeleton 伪装成 true Aster。
95. P3.102 增量验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check` 通过；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_aster_queued_turn_boundary_preserves_submit_mapping_without_host_state --lib` 通过，1 个定向测试通过、1593 个过滤；`node "scripts/check-app-server-client-contract.mjs"` 通过，91 项 contract guard；`npm run test:contracts` 通过，覆盖 agent runtime clients、App Server client contract、command / harness / modality / cleanup / docs boundary。仍保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。
96. P3.103 deprecated Tauri runner 下线：继续沿 Electron Desktop Host current 目标做入口收口，本轮认领 `scripts/run-tauri-dev.mjs`、`scripts/run-tauri-profile.mjs`、`scripts/update-version.sh`、`scripts/tauri-deprecated-entrypoints.test.mjs`、`internal/roadmap/appserver/testing-migration.md` 与本执行计划记录。`run-tauri-dev` / `run-tauri-profile` 现在直接导入 `scripts/tauri-deprecated.mjs` 并退出，不再组装 `npm exec -- tauri dev`、`--config lime-rs/tauri.conf.headless.json`、profiling features 或 Cargo target dir；旧 runner 只作为 deprecated guard。`update-version.sh` 不再写 `lime-rs/tauri.conf.json`，改为同步 `package.json`、`packages/lime-cli-npm/package.json` 与 `lime-rs/Cargo.toml`，并提示先跑 `npm run verify:app-version`、发布走 Electron release workflow。
97. P3.103 增量验证：`npx vitest run "scripts/tauri-deprecated-entrypoints.test.mjs" "scripts/electron-current-entrypoints.test.mjs"` 通过，5 个 tests；`npm run verify:app-version` 通过；`rg -n "tauri dev|tauri\\.conf|src-tauri|npm run tauri|@tauri-apps/cli" "scripts/run-tauri-dev.mjs" "scripts/run-tauri-profile.mjs" "scripts/update-version.sh" "scripts/tauri-deprecated-entrypoints.test.mjs" "package.json"` 无命中。`internal/roadmap/appserver/testing-migration.md` 已把 run-tauri runner guard 从“下一批 / 暂缓”迁为已完成证据；剩余 deprecated 面继续是 `scripts/verify-gui-smoke.mjs`、standalone Tauri build/config runner 与 legacy process observer。
98. P3.104 direct GUI smoke current wrapper：继续沿 Electron Desktop Host current 目标做入口收口，本轮认领 `scripts/verify-gui-smoke.mjs`、`scripts/electron-current-entrypoints.test.mjs`、`internal/roadmap/appserver/testing-migration.md` 与本执行计划记录。`scripts/verify-gui-smoke.mjs` 从 legacy GUI smoke 实现收缩为兼容文件名 wrapper，直接执行也只委托 `npm run smoke:electron`，不再组装旧宿主、Cargo target、旧配置或 DevBridge health loop；旧脚本名仍可满足历史自动化入口，但证明对象变为 Electron Desktop Host current GUI smoke。
99. P3.104 守卫与验证计划：`scripts/electron-current-entrypoints.test.mjs` 新增 direct wrapper 断言，锁定 `scripts/verify-gui-smoke.mjs` 必须包含 `smoke:electron`，且不得重新出现旧宿主关键字、`tauri.conf`、headless 链路或 CLI 直连。`internal/roadmap/appserver/testing-migration.md` 已把 `verify-gui-smoke` 从下一批 / 暂缓缺口迁为 current 测试事实源；剩余 deprecated 面继续是 standalone Tauri build/config runner、legacy process observer，以及 standalone secret 迁移 alias。
100. P3.105 Aster session persistence 输入边界切分：继续避让 Electron / package / DevBridge / desktop-host 大写集，本轮只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。`ensure_persisted_runtime_session(...)` 不再直接散取 `AsterBackendSubmitRequest` 字段，而是先通过 `DesktopAsterSessionPersistenceInput` / `desktop_aster_session_persistence_input_from_backend_request(...)` 纯化出 `session_id / workspace_id / title`，再交给 Desktop runtime context 的 session 创建函数；这继续降低 true standalone Aster backend 后续需要搬运的 Desktop state 混杂面，但不宣称 standalone Aster 已完成。
101. P3.105 定向守卫：新增 `desktop_aster_session_persistence_input_keeps_request_identity_without_runtime_context` 与 `desktop_aster_session_persistence_input_requires_workspace_id_before_runtime_context`，不构造 `RuntimeCommandContext` 即可证明 session/workspace/title 映射保真，并在缺少 workspace_id 时提前失败。`scripts/check-app-server-client-contract.mjs` 新增 “Desktop Aster adapter separates session persistence input from runtime context” 守卫，锁定新结构、纯映射函数、调用点和两条测试名，防止 session persistence 输入重新揉回 Desktop host-state glue。
102. P3.105 增量验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check` 通过；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_aster_session_persistence_input --lib` 通过，2 个定向测试通过、1594 个过滤；`node "scripts/check-app-server-client-contract.mjs"` 通过，92 项 contract guard；`npm run test:contracts` 通过，覆盖 agent runtime clients、App Server client contract、command / harness / modality / cleanup / docs boundary。仍保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning；true standalone Aster backend 剩余缺口仍是 Desktop session persistence DB/state/MCP port、cancel queue/timeline/turn gate port、action response runtime port、streaming event bridge 脱离 Tauri listener。
103. P3.106 standalone Tauri artifact adapter 硬退役：继续沿 Electron Desktop Host current 目标做入口收口，本轮只认领 standalone adapter 脚本层和测试，不夹写当前已脏的 `src/features/agent-app/packaging/*`。`scripts/agent-app-standalone-tauri-config-writer.mjs` 与 `scripts/agent-app-standalone-tauri-build-runner.mjs` 现在直接进入 `scripts/tauri-deprecated.mjs`，不再解析参数、写 config evidence 或执行 build plan；旧文件名只作为 deprecated entrypoint guard。
104. P3.106 core helper 短路：`scripts/lib/agent-app-standalone-tauri-config-writer-core.mjs` 的 writer API 固定返回 `DEPRECATED_TAURI_STANDALONE_ADAPTER` blocked，不再写 `tauri.conf.json` 或 `.env.standalone`；`scripts/lib/agent-app-standalone-tauri-build-runner-core.mjs` 的 build plan 固定 `deprecated_not_release_ready`，并删除旧的 `npm run tauri -- build --config ...` 命令计划和 process runner helper。这样即使旧测试或内部调用绕过 CLI，也不能恢复可执行 Tauri artifact path。
105. P3.106 增量验证：`node --check "scripts/standalone-deprecated-artifact-adapter-guard.test.mjs" "scripts/lib/agent-app-standalone-tauri-config-writer-core.mjs" "scripts/lib/agent-app-standalone-tauri-build-runner-core.mjs"` 通过；`npx vitest run "scripts/standalone-deprecated-artifact-adapter-guard.test.mjs" "scripts/lib/agent-app-standalone-tauri-config-writer-core.test.mjs" "scripts/lib/agent-app-standalone-tauri-build-runner-core.test.mjs" "scripts/tauri-deprecated-entrypoints.test.mjs"` 通过，4 个文件 17 个 tests；关键词守卫 `rg -n "npm run tauri|run\\\", \\\"tauri|tauri -- build|node_modules/.bin/tauri|agent-app-standalone-tauri-(config-writer|build-runner).*--execute"` 对本轮脚本层无命中；剩余 `tauri.conf` 命中只存在于 deprecated tests 的历史 fixture 路径和“不写出”断言。
106. P3.107 Aster cancel 输入边界切分：继续避让 Electron / package / DevBridge / desktop-host / App Server data source 写集，本轮只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。`TauriAsterBackendHost::cancel_turn(...)` 现在先通过 `DesktopAsterCancelInput` / `desktop_aster_cancel_input_from_backend_request(...)` 纯化出 `session_id / turn_id / event_name`，`AsterRuntimeHostBridge::cancel_turn(...)` 不再接收完整 `AsterBackendCancelRequest`，后续 port 化 cancel queue / timeline / turn gate 时可直接围绕 Desktop cancel input 收口，而不是继续把 App Server protocol DTO 传入 Desktop runtime glue。
107. P3.107 定向守卫：新增 `desktop_aster_cancel_input_keeps_request_scope_without_runtime_context`，不构造 `RuntimeCommandContext` 即可证明 cancel scope 映射保真；fake runtime host 从 `cancel_requests: Vec<AsterBackendCancelRequest>` 改为 `cancel_inputs: Vec<DesktopAsterCancelInput>`，既有 `tauri_aster_backend_host_cancel_delegates_to_runtime_host` 断言更新为检查纯 input。`scripts/check-app-server-client-contract.mjs` 新增 “Desktop Aster adapter separates cancel input from runtime context” 守卫，锁定新结构、纯映射函数、host seam 参数和测试名，防止 cancel 输入重新揉回完整 App Server DTO。
108. P3.107 增量验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check` 通过；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_aster_cancel_input --lib` 通过，1 个定向测试通过、1596 个过滤；`node "scripts/check-app-server-client-contract.mjs"` 通过，93 项 contract guard；`npm run test:contracts` 通过，覆盖 agent runtime clients、App Server client contract、command / harness / modality / cleanup / docs boundary；本轮认领文件 `git diff --check` 通过。补跑更宽的 `tauri_aster_backend_host_cancel_delegates_to_runtime_host` 时被并行未跟踪 `lime-rs/crates/app-server/src/local_data_source.rs` 阻塞：该文件的 `AppDataSource` 实现缺 `list_workspaces / read_workspace / read_workspace_by_path / read_default_workspace / ensure_default_workspace / ensure_workspace_ready / read_workspace_projects_root / resolve_workspace_project_path / list_skills / read_skill / list_workspace_skill_bindings`，不在本轮写集，已通知并行 Agent；true standalone Aster backend 仍未完成，剩余主缺口继续是 cancel queue/timeline/turn gate port、action response runtime port、streaming event bridge 脱离 Tauri listener、session persistence DB/state/MCP port。
109. P3.108 Agent QC process owner current 口径收口：继续沿 Electron Desktop Host current 目标做测试 / 诊断旁路收口，本轮只认领 `scripts/lib/agent-qc-process-owner-core.mjs`、`scripts/lib/agent-qc-process-owner-core.test.ts`、`scripts/agent-qc-process-owner-check.mjs`、`internal/roadmap/appserver/testing-migration.md` 与本执行计划记录。process owner summary 不再输出 `passiveTauriRuntime=`，旧 `tauri dev` 改为 `deprecatedTauriRuntime` 旁路观测；`passiveDesktopRuntime` 只统计 Electron dev host，`cargoOrRust` 也排除 deprecated Tauri runtime，避免旧宿主诊断继续阻断 current heavy gate。
110. P3.108 定向守卫：`scripts/lib/agent-qc-process-owner-core.test.ts` 新增 “deprecated Tauri runtime 只作为旁路观测，不阻断 current heavy gates”，证明单独存在 `tauri dev --config lime-rs/tauri.conf.headless.json` 时 verdict 为 `pass`，active GUI / Cargo / passive desktop runtime 都为空，summary 只出现 `deprecatedTauriRuntime=1`。既有混合场景同时覆盖 Electron passive runtime 与 deprecated Tauri runtime 分离。
111. P3.108 增量验证：`node --check "scripts/agent-qc-process-owner-check.mjs" "scripts/lib/agent-qc-process-owner-core.mjs" "scripts/lib/agent-qc-process-owner-current.test.mjs"` 通过；`npx vitest run "scripts/lib/agent-qc-process-owner-core.test.ts" "scripts/lib/agent-qc-process-owner-current.test.mjs"` 通过，2 个文件 7 个 tests；关键词守卫 `rg -n "passiveTauriRuntime=|Passive Tauri dev runtime|passiveDesktopRuntime.*Tauri|isPassiveElectronRuntime\\(entry\\) \\|\\| isPassiveTauriRuntime"` 的剩余命中仅为测试里的禁止断言和 `deprecatedTauriRuntime` current summary；本轮认领文件 `git diff --check` 通过。
112. P3.109 Electron package monitor 收口：继续沿 Electron Desktop Host current 目标做脚本入口收口，本轮认领 `scripts/monitor-build.sh`、`scripts/electron-current-entrypoints.test.mjs`、`internal/roadmap/appserver/testing-migration.md` 与本执行计划记录。旧监控脚本不再显示 “Tauri 打包进度监控”、不再读 `/tmp/tauri-build.log`、不再检查 `lime-rs/target/release/bundle` 或 `tauri build` 进程；现在监控 `/tmp/electron-build.log`、`release-electron` 产物，以及 `electron-builder|electron:package:dir|electron:dist` 进程。
113. P3.109 增量验证：`bash -n "scripts/monitor-build.sh"` 通过；`npx vitest run "scripts/electron-current-entrypoints.test.mjs"` 通过，4 个 tests；关键词守卫 `rg -n "Tauri 打包|tauri build|/tmp/tauri-build|src-tauri/target|lime-rs/target/release/bundle"` 对 `scripts/monitor-build.sh` 无命中，剩余命中仅为测试里的禁止断言；`git diff --check -- "scripts/monitor-build.sh" "scripts/electron-current-entrypoints.test.mjs"` 通过。
114. P3.110 sherpa runtime Rust workspace 口径收口：继续沿 `src-tauri -> lime-rs` 目标做脚本级事实源收口，本轮认领 `scripts/prepare-sherpa-onnx-runtime.mjs`、`scripts/prepare-sherpa-onnx-runtime.test.mjs`、`internal/roadmap/appserver/testing-migration.md` 与本执行计划记录。该脚本默认目录已是 `lime-rs`，本轮进一步把内部 `DEFAULT_SRC_TAURI_DIR / srcTauriDir / srcTauriRoot` 命名收敛为 `DEFAULT_RUST_WORKSPACE_DIR / rustWorkspaceDir / rustWorkspaceRoot`，避免后续维护继续把 Rust runtime workspace 误读成 Tauri host。
115. P3.110 CLI / API 守卫：`prepareSherpaOnnxRuntime(...)` 与 `resolveSherpaRuntimePlan(...)` 现在接收 `rustWorkspaceDir`；CLI 只接受 `--lime-rs-dir`，不再接受 `--src-tauri-dir`。`scripts/prepare-sherpa-onnx-runtime.test.mjs` 新增显式 Rust workspace 目录用例，证明 release/runtime lib paths 从自定义 workspace 派生，而不是旧 host 目录。
116. P3.110 增量验证：`node --check "scripts/prepare-sherpa-onnx-runtime.mjs" "scripts/prepare-sherpa-onnx-runtime.test.mjs"` 通过；`npx vitest run "scripts/prepare-sherpa-onnx-runtime.test.mjs"` 通过，4 个 tests；关键词守卫 `rg -n "srcTauri|SRC_TAURI|src-tauri|--src-tauri-dir|DEFAULT_SRC_TAURI_DIR"` 对该脚本和测试无命中；`git diff --check -- "scripts/prepare-sherpa-onnx-runtime.mjs" "scripts/prepare-sherpa-onnx-runtime.test.mjs"` 通过。
117. P3.111 standalone App Server local data source 编译闭环：继续沿 App Server current 目标清阻塞，本轮认领 `lime-rs/crates/app-server/src/local_data_source.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。`LocalAppDataSource` 已补齐当前 `AppDataSource` 的 workspace / skill / workspace skill bindings surface 实现，并保留真实 workspace DB 读取、默认 workspace ensure、projects root resolve、Skill catalog 读取和 workspace 本地注册 Skill readiness 投影；这不是新增平行业务路径，而是让 standalone `app-server` binary 的 current data source 不再停留在 trait 半实现状态。
118. P3.111 contract guard：`scripts/check-app-server-client-contract.mjs` 新增 “Standalone App Server local data source implements workspace and skill surfaces” 守卫，锁定 `LocalAppDataSource`、workspace read / ensure / project path、skill list / read、workspace skill bindings 和本地 helper，防止后续 `AppDataSource` 扩展时只改 trait / processor / runtime，不补 standalone local data source。
119. P3.111 增量验证：`rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/local_data_source.rs"` 通过；`cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server` 通过，仅保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime tauri_aster_backend_host_cancel_delegates_to_runtime_host --lib` 通过，确认 P3.107 宽验证不再被 local data source 编译缺口阻塞；`node "scripts/check-app-server-client-contract.mjs"` 通过，94 项 contract guard；`npm run test:contracts` 通过；本轮认领文件 `git diff --check` 通过。true standalone Aster backend 仍未完成，剩余主缺口继续是 cancel queue/timeline/turn gate port、action response runtime port、streaming event bridge 脱离 Tauri listener、session persistence DB/state/MCP port。
120. P3.112 Vite DevBridge bootstrap 旧宿主模式退役：继续沿 Electron Desktop Host current 目标做开发脚本入口收口，本轮认领 `scripts/lib/vite-dev-server-bootstrap.mjs`、新增 `scripts/lib/vite-dev-server-bootstrap.test.mjs`、`internal/roadmap/appserver/testing-migration.md` 与本执行计划记录。该 bootstrap 当前唯一调用方是 `scripts/start-web-bridge-dev.mjs`，且调用时 `browserBridge: true`；本轮将非 browserBridge 分支改为直接拒绝，避免继续通过 `TAURI_ENV_PLATFORM` / `.vite-tauri` 维护旧宿主解析模式。
121. P3.112 current mode 守卫：`scripts/lib/vite-dev-server-bootstrap.mjs` 不再设置 `TAURI_ENV_PLATFORM`，优化依赖目录固定为 `.vite-web`，运行时探测只接受 `src/lib/desktop-host/plugin-dialog` mock；旧 “Tauri 原生模式 / Tauri dev server / Tauri dialog / Tauri 抢跑” 文案已移除。新增 `scripts/lib/vite-dev-server-bootstrap.test.mjs` 覆盖 `browserBridge: false` 必须 reject，并扫描脚本本体不得重新暴露旧 Tauri dev server mode。
122. P3.112 增量验证：`node --check "scripts/lib/vite-dev-server-bootstrap.mjs" "scripts/lib/vite-dev-server-bootstrap.test.mjs"` 通过；`npx vitest run "scripts/lib/vite-dev-server-bootstrap.test.mjs"` 通过，2 个 tests；关键词守卫 `rg -n "TAURI_ENV_PLATFORM|vite-tauri|Tauri 原生模式|Tauri dev server|Tauri 抢跑|Tauri dialog|TAURI_DIALOG|browserBridge: false"` 的剩余命中仅为新测试里的退役断言；`git diff --check -- "scripts/lib/vite-dev-server-bootstrap.mjs" "scripts/lib/vite-dev-server-bootstrap.test.mjs"` 通过。
123. P3.113 Agent App production artifact build 命名收口：继续沿 Electron Desktop Host current 目标做发布证据事实源收口，本轮只认领 `src/features/agent-app/packaging/artifactBuilder.ts`、`src/features/agent-app/packaging/packageDescriptor.test.ts`、`internal/roadmap/appserver/testing-migration.md` 与本执行计划记录。`buildStandaloneArtifactBuildPlan(...)` 的 current `requiredAdapters` 从 `tauri_config_writer` / `tauri_build_runner` 改为 `native_shell_config_writer` / `electron_artifact_builder`，blocker code 从 `TAURI_CONFIG_*` 改为 `NATIVE_SHELL_CONFIG_*`；底层 `tauriConfigWritePlan` / `tauriConfigMaterializer` 仍仅作为 deprecated adapter 依赖保留，退出条件是 Agent App standalone packaging 完成 Electron/native shell config materializer 后集中改名或删除。
124. P3.113 增量验证：`npx vitest run "src/features/agent-app/packaging/packageDescriptor.test.ts" "src/features/agent-app/packaging/releasePipeline.test.ts"` 通过，2 个文件 21 个 tests；关键词守卫 `rg -n "tauri_config_writer|tauri_build_runner|TAURI_CONFIG_MATERIALIZER_MISSING|TAURI_CONFIG_MATERIALIZATION_BLOCKED|TAURI_CONFIG_WRITE_PLAN_BLOCKED" "src/features/agent-app/packaging/artifactBuilder.ts" "src/features/agent-app/packaging/packageDescriptor.test.ts"` 无命中；`rg -n "native_shell_config_writer|electron_artifact_builder|NATIVE_SHELL_CONFIG" ...` 命中均为本轮 current 断言；本轮认领文件 `git diff --check` 通过。
125. P3.114 Aster action response 输入边界切分：继续沿 true standalone Aster backend 目标降低 Desktop runtime glue 耦合，本轮只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。`TauriAsterBackendHost::respond_action(...)` 现在先通过 `DesktopAsterActionResponseInput` / `desktop_aster_action_response_input_from_backend_request(...)` 纯化出 `session_id / request_id / action_type / confirmed / response / user_data / metadata / event_name / action_scope`，`AsterRuntimeHostBridge::respond_action(...)` 不再接收 `AgentRuntimeRespondActionRequest`；生产 host 内部再用 `runtime_action_request_from_desktop_aster_action_response_input(...)` 转入既有 `respond_runtime_action_internal(...)`，作为后续 action response runtime port 化前的兼容适配层。
126. P3.114 定向守卫：新增 `desktop_aster_action_response_input_maps_protocol_without_runtime_context`，不构造 `RuntimeCommandContext` 即可证明 App Server action respond protocol 到 Desktop action input 的映射保真；fake runtime host 从 `action_requests: Vec<AgentRuntimeRespondActionRequest>` 改为 `action_inputs: Vec<DesktopAsterActionResponseInput>`，既有 host 委托测试改为 `tauri_aster_backend_host_respond_action_delegates_desktop_input`，断言 legacy adapter 只把纯 input 交给 runtime host。`scripts/check-app-server-client-contract.mjs` 新增 “Desktop Aster adapter separates action response input from runtime context” 守卫，并同步更新旧 action response delegation guard，防止 action response 输入重新揉回完整 runtime request。
127. P3.114 增量验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check` 通过；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_aster_action_response_input --lib` 通过，1 个定向测试通过、1597 个过滤；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime tauri_aster_backend_host_respond_action_delegates_desktop_input --lib` 通过，1 个定向测试通过、1597 个过滤；两条 Rust 测试仅保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。`node "scripts/check-app-server-client-contract.mjs"` 通过，95 项 contract guard；`npm run test:contracts` 通过，覆盖 agent runtime clients、App Server client contract、command / harness / modality / cleanup / docs boundary；本轮认领文件 `git diff --check` 通过。true standalone Aster backend 仍未完成，剩余主缺口继续是 action response runtime 更深 port 化、cancel queue/timeline/turn gate port、streaming event bridge 脱离 Tauri listener、session persistence DB/state/MCP port。
128. P3.115 Aster event bridge registration 输入边界切分：继续沿 true standalone Aster backend 目标降低 streaming event bridge 的 Desktop / protocol 混杂面，本轮只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。`RuntimeEventBridgeSubscriptions::register(...)` 不再接收完整 `AsterBackendSubmitRequest`，改为接收 `DesktopAsterEventBridgeRegistration`；`TauriAsterBackendHost::submit_turn(...)` 先通过 `desktop_aster_event_bridge_registration_from_backend_request(...)` 纯化出 `event_name / session_id / turn_id`，再注册 direct event scope 或 legacy Tauri listener。该步不宣称 streaming event bridge 已脱离 Tauri listener，但把后续 port 化所需的事件 scope 输入从 submit DTO 中切出。
129. P3.115 定向守卫：新增 `desktop_aster_event_bridge_registration_maps_scope_without_runtime_context`，不构造 `RuntimeCommandContext` 即可证明 submit request 的事件桥 scope 映射保真；既有 `runtime_event_bridge_subscription_replaces_existing_listener_and_closes_on_terminal_event` 改为先构造 registration，再调用 `subscriptions.register(&registration)`，继续覆盖替换旧 listener、转发 `message.delta`、terminal event 后 unlisten 的行为。`scripts/check-app-server-client-contract.mjs` 新增 “Desktop Aster adapter separates event bridge registration from backend request” 守卫，锁定新结构、纯映射函数、submit 调用点和测试名，防止 event bridge registration 回退成直接吃完整 `AsterBackendSubmitRequest`。
130. P3.115 增量验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check` 通过；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_aster_event_bridge_registration --lib` 通过，1 个定向测试通过、1598 个过滤；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_event_bridge_subscription_replaces_existing_listener_and_closes_on_terminal_event --lib` 通过，1 个定向测试通过、1598 个过滤；两条 Rust 测试仅保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。`node "scripts/check-app-server-client-contract.mjs"` 通过，96 项 contract guard；`npm run test:contracts` 通过，覆盖 agent runtime clients、App Server client contract、command / harness / modality / cleanup / docs boundary；本轮认领文件 `git diff --check` 通过。true standalone Aster backend 仍未完成，剩余主缺口继续是 streaming event bridge 脱离 Tauri listener、cancel queue/timeline/turn gate port、session persistence DB/state/MCP port、action response runtime 更深 port 化。
131. P3.116 Aster session persistence bridge 入参再切分：继续沿 true standalone Aster backend 目标降低 Desktop runtime host 对 App Server protocol DTO 的依赖，本轮仍只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。`AsterRuntimeHostBridge::ensure_persisted_session(...)` 不再接收完整 `AsterBackendSubmitRequest`，改为接收 `DesktopAsterSessionPersistenceRequest`；`TauriAsterBackendHost::submit_turn(...)` 在进入 runtime host 前先通过 `desktop_aster_session_persistence_request_from_backend_request(...)` 纯化出 `session_id` 和 lazy `create_input`。
132. P3.116 语义守卫：`DesktopAsterSessionPersistenceRequest` 保留 `session_id` 作为已有 session 检查事实，`create_input` 只在 session 不存在、确实需要创建时展开，因此缺少 `workspace_id` 不会提前阻断已有 session 的 submit。新增 `desktop_aster_session_persistence_request_keeps_session_id_before_create_input`，证明 `workspace_id` 缺失只进入 create input error；fake runtime host 从 `ensure_calls: Vec<String>` 改为 `ensure_requests: Vec<DesktopAsterSessionPersistenceRequest>`，既有 submit 委托测试改为断言 runtime host 收到纯 request 与 create input，而不是完整 submit DTO。
133. P3.116 增量验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check` 通过；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_aster_session_persistence_request --lib` 通过，1 个定向测试通过、1599 个过滤；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime tauri_aster_backend_host_submit_persists_registers_and_delegates_runtime_turn --lib` 通过，1 个定向测试通过、1599 个过滤；两条 Rust 测试仅保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。`node "scripts/check-app-server-client-contract.mjs"` 通过，96 项 contract guard；`npm run test:contracts` 通过，覆盖 agent runtime clients、App Server client contract、command / harness / modality / cleanup / docs boundary；本轮认领文件 `git diff --check` 通过。true standalone Aster backend 仍未完成，剩余主缺口继续是 streaming event bridge 脱离 Tauri listener、cancel queue/timeline/turn gate port、session persistence DB/state/MCP port、action response runtime 更深 port 化。
134. P3.117 Aster submit runtime host 入参收束：继续沿 true standalone Aster backend 目标降低 Desktop runtime host glue 参数面，本轮仍只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。`AsterRuntimeHostBridge::submit_runtime_turn(...)` 不再接收散装 `QueuedTurnTask + queue_if_busy + skip_pre_submit_resume` 三参数，改为接收上一阶段已纯化的 `DesktopAsterQueuedTurn`；`TauriAsterBackendHost::submit_turn(...)` 现在直接把 `queued_turn` 交给 runtime host，生产实现内部再委托既有 `RuntimeCommandContext::submit_runtime_turn(...)`。
135. P3.117 守卫口径：`scripts/check-app-server-client-contract.mjs` 更新 queued-turn guard，锁定 `queued_turn: DesktopAsterQueuedTurn`、`.submit_runtime_turn(queued_turn)` 和生产实现内部对 `queued_turn.queued_task / queue_if_busy / skip_pre_submit_resume` 的委托，防止 submit host seam 回退成三散参数。既有 `tauri_aster_backend_host_submit_persists_registers_and_delegates_runtime_turn` 继续证明 persistence、event registration、runtime submit payload 和 queue flags 保真。
136. P3.117 增量验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check` 通过；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime tauri_aster_backend_host_submit_persists_registers_and_delegates_runtime_turn --lib` 通过，1 个定向测试通过、1599 个过滤，仅保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。`node "scripts/check-app-server-client-contract.mjs"` 通过，96 项 contract guard；`npm run test:contracts` 通过，覆盖 agent runtime clients、App Server client contract、command / harness / modality / cleanup / docs boundary；本轮认领文件 `git diff --check` / `git diff --cached --check` 通过。true standalone Aster backend 仍未完成，剩余主缺口继续是 streaming event bridge 脱离 Tauri listener、cancel queue/timeline/turn gate port、session persistence DB/state/MCP port、action response runtime 更深 port 化。
137. P3.118 Aster cancel runtime operation 收束：继续沿 true standalone Aster backend 目标降低 Desktop runtime host 自己组合底层状态的耦合，本轮仍只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。只读核对 Codex 参考实现后确认，Codex 将 `protocol` 限定为 turn interrupt/cancel 的稳定 JSON-RPC 语义，将 `transport` 限定为连接/帧/背压/断连生命周期，将 `daemon` 限定为 app-server 进程生命周期，不让 transport 或 daemon 介入 turn cancel 业务；Lime 这轮据此继续把 cancel 收到 App Server runtime/backend port，而不是扩展 Electron 或 legacy Tauri 业务面。
138. P3.118 守卫口径：新增 `DesktopAsterCancelOperation` 与 `desktop_aster_cancel_operation_from_input(...)`，`TauriAsterBackendHost::cancel_turn(...)` 仍先保留 `DesktopAsterCancelInput` 作为 App Server protocol scope 映射，再纯化成 runtime operation 交给 `AsterRuntimeHostBridge::cancel_turn(...)`；生产实现只委托 `execute_runtime_cancel_operation(...)`，由该函数集中处理 `cancel_session / abort_running_turn_by_id / finish_active_runtime_turn_if_matches / clear_runtime_queue`。fake runtime host 从 `cancel_inputs` 改为 `cancel_operations`，新增 `desktop_aster_cancel_operation_maps_runtime_scope_without_protocol_event`，既保留 event_name 映射测试，又防止 runtime host seam 回退成直接吃 protocol event。
139. P3.118 增量验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check` 通过；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_aster_cancel --lib` 通过，2 个定向测试通过、1599 个过滤；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime tauri_aster_backend_host_cancel_delegates_to_runtime_host --lib` 通过，1 个定向测试通过、1600 个过滤；两条 Rust 测试仅保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。`node "scripts/check-app-server-client-contract.mjs"` 通过，96 项 contract guard；`npm run test:contracts` 通过，覆盖 agent runtime clients、App Server client contract、command / harness / modality / cleanup / docs boundary。true standalone Aster backend 仍未完成，剩余主缺口继续是 streaming event bridge 脱离 Tauri listener、session persistence DB/state/MCP port、action response runtime 更深 port 化，以及将 cancel outcome 上提到 App Server backend 结构化结果。
140. P3.119 Aster streaming event bridge append seam 收束：继续沿 true standalone Aster backend 目标降低 streaming bridge 对 Tauri listener callback 的依赖，本轮仍只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。新增 `DesktopAsterRuntimeEventBridgeAppend`，把 `lime_agent::AgentEvent / payload -> RuntimeEvent + session_id + turn_id + should_close` 的映射从 listener callback 与 direct queue event port 中抽成 `desktop_aster_runtime_event_bridge_append_from_event(...)`；Tauri listener 和 direct event path 现在只负责取得 event/payload 并调用 `append_desktop_aster_runtime_event_to_app_server_bridge(...)` 写入 App Server event bridge。
141. P3.119 事件 turn id 修正与守卫：`runtime_event_turn_id(...)` 不再只读取顶层 `turn_id / turnId`，同时读取真实 `AgentEvent::TurnCompleted` 等终态事件序列化后的 `/turn/id`、`/turn/turn_id`、`/turn/turnId`，避免终态事件被 fallback turn 覆盖。新增 `desktop_aster_runtime_event_bridge_append_maps_event_without_bridge_state` 与 `desktop_aster_runtime_event_bridge_append_prefers_event_turn_id`，证明 append input 可以在不构造 Tauri listener / App Server bridge 的情况下完成映射，并且真实事件 turn id 优先于 fallback。`scripts/check-app-server-client-contract.mjs` 新增 “Desktop Aster adapter separates event bridge append from Tauri listener” 守卫，锁定 append input、统一 append 函数、嵌套 turn id 提取和测试名。
142. P3.119 增量验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check` 通过；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_aster_runtime_event_bridge_append --lib` 先暴露终态事件 turn id 被 fallback 覆盖的问题，修复后通过，2 个定向测试通过、1601 个过滤；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime app_server_event_bridge_appends_payload_to_read_model_and_outbound_notification --lib` 通过，1 个测试通过、1602 个过滤；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_event_bridge_subscription_replaces_existing_listener_and_closes_on_terminal_event --lib` 通过，1 个测试通过、1602 个过滤；Rust 测试仅保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。`node "scripts/check-app-server-client-contract.mjs"` 通过，97 项 contract guard；`npm run test:contracts` 通过，覆盖 agent runtime clients、App Server client contract、command / harness / modality / cleanup / docs boundary。true standalone Aster backend 仍未完成，剩余主缺口继续是 session persistence DB/state/MCP port、action response runtime 更深 port 化、将 cancel outcome 上提为 App Server backend 结构化结果，以及后续把 event bridge append port 从 legacy adapter 进一步上提到 standalone host 可复用实现。
143. P3.120 Aster session persistence operation 收束：继续沿 true standalone Aster backend 目标降低 Desktop runtime host 对 DB/state/MCP 创建细节的直接耦合，本轮仍只认领 `lime-rs/src/commands/aster_agent_cmd/app_server_host.rs`、`scripts/check-app-server-client-contract.mjs` 与本执行计划记录。新增 `DesktopAsterSessionPersistenceOperation`，把 `DesktopAsterSessionPersistenceRequest` 先转成 `AlreadyPersisted` 或 `Create(DesktopAsterSessionPersistenceInput)`，`ensure_persisted_runtime_session(...)` 只负责检查既有 session 并委托 operation 生成 / 执行。
144. P3.120 语义守卫：`desktop_aster_session_persistence_operation_from_request(...)` 保留 P3.116 的 lazy create 语义：已有 session 时直接返回 `AlreadyPersisted`，不会展开 `create_input`，因此已有 session 不会因 App Server request 缺少 `workspace_id` 被提前阻断；新 session 才要求 `create_input` 并由 `execute_desktop_aster_session_persistence_operation(...)` 调用 `create_runtime_session_internal_with_runtime_and_session_id(...)` 进入当前 DB/state/MCP 创建链。新增 `desktop_aster_session_persistence_operation_skips_create_input_for_existing_session` 与 `desktop_aster_session_persistence_operation_requires_create_input_for_new_session`；`scripts/check-app-server-client-contract.mjs` 同步锁定 operation enum、转换函数、执行函数和测试名。
145. P3.120 增量验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime --check` 通过；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime desktop_aster_session_persistence --lib` 通过，5 个定向测试通过、1600 个过滤；`CARGO_TARGET_DIR="/tmp/app-server-aster-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime tauri_aster_backend_host_submit_persists_registers_and_delegates_runtime_turn --lib` 通过，1 个测试通过、1604 个过滤；Rust 测试仅保留既有 `RuntimeCore::ensure_capability_allowed` dead_code warning。`node "scripts/check-app-server-client-contract.mjs"` 通过，97 项 contract guard；`npm run test:contracts` 通过，覆盖 agent runtime clients、App Server client contract、command / harness / modality / cleanup / docs boundary。true standalone Aster backend 仍未完成，剩余主缺口继续是 action response runtime 更深 port 化、将 cancel outcome 上提为 App Server backend 结构化结果，以及把 session persistence operation 进一步上提到 standalone host 可复用实现。
146. P3.121 前端对接主线纠偏：用户指出“每个接口和前端都没有很好对接”后，本轮停止把后端 seam / protocol guard 当作主完成依据，新增 `internal/roadmap/appserver/frontend-integration-matrix.md` 作为 current planning source，把 App Server method、TS client、Electron host adapter、前端 gateway、UI caller、mock 和验证状态拉到一张表。当前事实是：`packages/app-server-client/src/index.ts` 与 `electron/appServerHost.ts` 已具备 App Server JSON-RPC / sidecar 通道，`electron/hostCommands.ts` 已把 session list/read、workspace、skill、model、capability inventory 投影到 App Server，但主 Agent UI 的 submit / cancel / action respond 仍主要经 `agent_runtime_*` compat 命令和 desktop-host mock，不能再宣称整体接口已接好。
147. P3.121 第一竖切标准：下一刀只认 `Agent turn lifecycle`，不再横向 polish 孤立接口。完成标准是主发送路径进入 `agentSession/turn/start`，cancel / interrupt 同轮进入 `agentSession/turn/cancel`，action respond 进入 `agentSession/action/respond`，`agentSession/event` 至少被前端 API 层消费成 read model 刷新或 timeline append，并且 contract guard 防止 `agent_runtime_submit_turn`、`agent_runtime_interrupt_turn`、`agent_runtime_respond_action` 在 Electron current 模式下继续 mock-only 成功。
148. P3.121 并行协作口径：考虑隔壁进程正在全面替换 Electron / Tauri 宿主，本轮不夹写 `electron/**`、`src/lib/api/**`、`src/lib/desktop-host/**` 的实现文件，只追加路线图矩阵与执行计划记录；后续实现时优先二选一：要么让 `src/lib/api/appServer.ts` 成为 Agent turn lifecycle 的直接前端 gateway，要么在 Electron truth adapter 明确把 legacy facade 投影到 App Server method，禁止两条路同时长。
