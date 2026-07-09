# Aster Runtime 迁移路线图

状态：in_progress  
创建时间：2026-07-03  
最新更新：2026-07-10
主目标：按 Codex 风格把 Lime Agent Runtime 收敛为一等 workspace crate 分层，停止把 `aster-rust` 当作 Lime current 运行时事实源。

最新现实校准：2026-07-10 探索性工作后，整体目标完成度仍为约 `95%`。vendor/aster-rust 已物理删除，Fast A1 public surface 收缩完成，provider source backend wrapper 已下沉到 `model-provider`，`agent-runtime` 只保留 Turn source execution payload materialization，RuntimeReplyResponseEvent materializer 已完成。剩余 5% 主要是 lime-agent 中 99 处 `use aster::` 引用，都集中在 compat adapter 文件（credential_bridge, request_tool_policy, aster_session_store 等），这是合理的迁移期状态。`tool-runtime` 已接收 tool execution policy、shell/network policy、shell parser / read-target preflight / concurrency analysis、command semantics、process decode、platform shell runtime、tool definition / extension DTO、WebSearch / WebFetch、apply_patch、skill_search、memory_store、image_task、Codex-style sleep current executor、Codex-style view_image current executor、Codex-style update_plan current executor，以及 Codex-style native dispatch / gateway-aware dispatch builder 骨架；`agent-runtime` 已接收 reply input 与 reply stream envelope；`model-provider` 的 provider stream handle metadata 与 provider source backend wrapper 已进入 current 主链。

本轮校准的关键变化是：`agent_tools/tool_orchestrator/aster_registry_adapter.rs` 已删除，`tool_orchestrator` 工具批执行不再依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`；WebFetch/WebSearch/apply_patch/skill_search/memory_store/image_task/sleep/view_image/update_plan 的 Lime 侧 Aster adapter 已统一委托 `tool-runtime::native_dispatch` 或 gateway-aware dispatch builder。但 root workspace 仍有 vendored `aster` dependency，`lime-agent` 仍有 `aster.workspace = true`；provider/reply loop、Aster `Agent::reply` / `Message` / provider trait、session store / subagent adapter、Aster reply loop 内 native tool registry 与这些临时 Aster `Tool` trait 注册壳仍是 Phase 6 blocker。详见 [2026-07-05-progress-reality-check.md](./2026-07-05-progress-reality-check.md)。

## 结论

`lime-rs/crates/aster-rust` 已从 current crate 区移出，当前 `dead / forbidden-to-restore`；`vendor/aster-rust/crates/aster` 已被移入 `lime-rs/crates/agent-compat`，但这不是新的 current owner。`agent-compat` 的唯一身份是待迁出 staging / compat blocker：仍被 `lime-agent` 生产 `use aster::...` 命中的文件必须继续迁到 `agent-runtime`、`agent-protocol`、`model-provider`、`tool-runtime`、`thread-store`、`lime-mcp`、`lime-skills`、`media-runtime` 或 App Server；Codex 无对应能力时直接删除。`agent-compat` 不是“暂时不动”的保护目录，允许改动只包括迁出生产调用、删除 Aster-only surface、减少 burn-down 依赖。`agent-compat` 现存指向 Lime current owner 的依赖只是 burn-down allowlist，退出条件是迁出对应调用并删除依赖，不能继续扩张成反向承接层。`vendor/aster-rust/crates/aster-models` 曾临时落到 `lime-rs/crates/agent-compat-models`，现已由 `agent-protocol::{openai, anthropic}` 承接并删除重复 crate。2026-07-09 起迁移策略纠偏为：不得把 `agent-compat` 作为迁移完成态，并在 Phase 6 删除 root `aster` alias 与 `crates/agent-compat*`。

后续固定方向是：**学习 Codex 的 crate 存放和依赖方式，把 Lime 自己的 runtime 能力拆成平铺的一等 workspace crate；Aster 只作为 `compat vendor / deprecated migration reference`，不再是 current 主链。**

具体文件移动计划见 [./owner-file-move-skeleton-plan.md](./owner-file-move-skeleton-plan.md)。第一批已把 `plan/**`、`rules/**`、`streaming/**` 从 `agent-compat` 移到对应 owner 的 `compat/aster_reference`，并从 `agent-compat/src/lib.rs` 删除 public module surface；`agent-compat-models` 已清理为 `dead / deleted / forbidden-to-restore`，`agent-compat/tests/**` 与 `agent-compat/src` 下独立旧测试文件也已清理，不能继续作为 current 迁移证据。

2026-07-07 起，Aster 能力接收口径进一步收紧为：**Codex 有则迁，Codex 没有则删**。迁移前必须对照 `/Users/coso/Documents/dev/rust/codex` 的 current 工具面、runtime 分层、Thread / Turn / Item 归属和命名；Codex 有的能力才进入 Lime current，并必须接入 App Server / 前端 / Evidence / runtime 至少一条真实消费链。Codex 没有的 Aster-only 能力直接按 `dead / deleted / forbidden-to-restore` 清理，不再因为“Aster 框架有用”保留 vendor 实现、catalog alias、前端专用展示或 compat 壳。

## Codex 对照

参考路径：`/Users/coso/Documents/dev/rust/codex/codex-rs`。

Codex 的关键做法：

1. 一等能力直接平铺在 workspace 根目录，例如 `protocol`、`model-provider`、`exec-server`、`thread-store`、`tools`、`app-server`。
2. `app-server` 负责 JSON-RPC、请求处理和投影，不在顶层重新实现 turn loop、provider 采样、tool execution。
3. `core` / execution / provider / protocol / store 各自有明确 crate owner，而不是把外部 agent framework 整体塞进主 workspace。
4. 兼容或实验能力也有明确 crate，例如 `external-agent-sessions`、`external-agent-migration`，不会伪装成 current runtime。

Lime 应采用同样模式：把 runtime 能力按协议、模型、执行、工具、线程存储和 App Server adapter 拆成一等 crate；不继续让 Aster 类型扩散到多个 current crate。

## 目标架构

建议的 current 分层：

```text
app-server
  -> agent-runtime
  -> agent-protocol
  -> model-provider
  -> tool-runtime
  -> thread-store
  -> runtime-core
```

职责边界：

- `agent-protocol`：稳定 DTO、event、action、thread read、tool call、artifact、evidence 引用，不依赖 Aster。
- `model-provider`：模型路由、provider 请求、能力描述、流式响应归一化，不把 Aster provider 类型外泄。
- `thread-store`：session、thread、turn、message、checkpoint、artifact 持久化，不实现 Aster trait 作为公共边界。
- `tool-runtime`：工具定义 DTO、工具注册、权限检查、shell parser / read-target preflight / concurrency analysis、shell command exit semantics、process output decode、Windows no-window / UTF-8 wrapper、platform shell runtime、执行结果、host tool bridge、MCP bridge，不让 App Server 直接构造 Aster tool registry。
- `agent-runtime`：turn orchestration、queue、subagent、action response、runtime event stream，作为 App Server 的唯一执行入口。
- `app-server`：JSON-RPC、session/read model、artifact/evidence/data-source 投影和受控 adapter，不拥有 Aster 运行语义。

## 分类

### current

- Codex 风格的一等 Lime runtime crate 分层。
- App Server JSON-RPC -> RuntimeCore / Agent Runtime -> read model / evidence / replay 主链。
- Lime 自有 protocol、provider、tool、thread-store、runtime event 类型。

### compat

- 迁移期的 `lime-agent` facade。
- 迁移期的 Aster event -> Lime runtime event 转换器。
- 迁移期的 Aster session / conversation 读取 adapter。
- `lime-rs/crates/agent-compat` 中仍被生产 `use aster::...` 命中的最小 staging blocker；它不是 owner，退出条件是迁出到 Lime current owner 或删除。
- Aster reply loop 内的 native tool registry，以及 WebFetch / WebSearch / apply_patch / skill_search / memory_store / image_task / sleep / view_image / update_plan 的临时 Aster `Tool` trait adapter，只服务尚未迁出的 `Agent::reply` 工具调用面。

退出条件：App Server、RuntimeCore、GUI、evidence、replay、tests 均只消费 Lime 自有协议和 runtime crate 后删除。

### deprecated

- `lime-agent` 内仍直接引用 Aster DTO / trait 的 provider、execution、tool、session adapter 面。
- root workspace 仍临时暴露 vendor `aster` 给 `lime-agent` 剩余 compat adapter；假 optional feature 路线已删除，不得恢复。
- `services` / `app-server` 重新直接依赖 `aster::*` 的任何回流；`agent` 内未迁完的 direct Aster 引用继续按 compat/deprecated 面收口。
- 在 App Server runtime backend 内继续扩展 Aster provider、tool、session、streaming loop。

### dead

- `lime-rs/crates/aster-rust/**`：已降级到 `vendor`，不得恢复到 current crate 区。
- `lime-rs/crates/agent-compat-models/**`：OpenAI / Anthropic wire DTO 已归属 `agent-protocol`，不得恢复重复 `aster-models` crate。
- `lime-rs/crates/agent-compat/tests/**`：Aster compat staging crate 的旧 integration / property / replay 正向测试面已删除；current 行为测试必须归属 Lime owner crate。
- `lime-rs/crates/agent-compat/src/**/{tests.rs,*_tests.rs,*_property_tests.rs}`：Aster compat staging crate 的旧源码内正向测试面已删除；必要回归必须迁到 `agent-runtime`、`agent-protocol`、`model-provider`、`tool-runtime`、`thread-store` 或 App Server。
- `lime-rs/crates/agent-compat/src/config/signup_{openrouter,tetrate}/**`：Aster-only 本地浏览器 signup 向导已删除；Codex 无对应 current 面，Lime provider credential onboarding 若需要必须进入 current provider/settings 主链。
- `lime-rs/crates/agent-compat/src/config/{agents_md_parser,config_command,config_manager,experiments,watcher}.rs`：Aster-only config CLI / multi-source manager / watcher / experiment manager staging 面已删除；Codex 无对应 current 工具面，Lime 配置能力后续只能进入 provider/settings current 主链。
- `lime-rs/crates/agent-compat/src/context/{agents_md_parser,cache_controller,compressor,context_service,context_uri,file_mention,manager,priority_sorter,pruner,summarizer,token_estimator,tool_io,types,window_manager}.rs`：未被 Lime current / compat 主链消费的 Aster context framework helper 已删除；Codex 有 AGENTS.md / context owner，但不采用这套 Aster 自研 public API，也没有 `aster://` context storage API。`agent-compat` context 只保留 `ContextTraceStep`；tool I/O / token / truncation 规则归属 `tool-runtime::tool_io` current owner。
- `lime-rs/crates/agent-compat/src/mcp/**`：Aster root MCP manager 已删除；外部生产引用为 0，Lime current MCP owner 是 `lime-mcp` / App Server MCP gateway / `tool-runtime::mcp_notification`、`mcp_resource`、`tool_search`。R7 剩余 blocker 只指 `agents/mcp_client.rs`、Aster extension manager / built-in extension clients 的 reply loop adapter。
- `lime-rs/crates/agent-compat/src/skills/**` 与 `lime-rs/crates/agent-compat/src/agents/skills_extension.rs`：Aster skills registry / loader / executor / workflow helper 和 `loadSkill` platform extension 已删除；Skill current owner 是 `lime-skills`、`tool-runtime::skill_execute` / `skill_gate` / `skill_result` 与 App Server skill 数据源。`LimeSkillTool` 仅作为 R4 未迁完前的临时 Aster `Tool` trait 外壳。
- `lime-rs/crates/agent-compat/src/{posthog,security,slash_commands,tool_monitor,user_message_manager}.rs`、`lime-rs/crates/agent-compat/src/{hints,network}/mod.rs`、`lime-rs/crates/agent-compat/src/{oauth,token_counter}.rs`：Fast A1 no-op / empty queue / custom slash recipe / dummy helper stubs 已删除或迁出；Codex 有 TUI slash command 和 AGENTS.md current owner，但没有 Aster 任意 `/xxx` 绑定本地 recipe 文件并注入 prompt 的 runtime 语义，也不需要 Aster empty hints loader、root OAuth bail stub 或 dummy token counter。Posthog telemetry、security inspector、repetition inspector、user message queue 均为空实现，不得恢复为 compat 壳。`network` 的 localhost proxy bypass 规则已迁到 `model-provider::http`，token fallback 已改用 `tool-runtime::tool_io`。
- 恢复 `lime-rs/src/**` 旧 Tauri command wrapper。
- 新增 `backend_mode=aster` 或第二套 Aster runtime backend。
- 为新能力继续复制 Aster `*_skill_launch`、tool registry、session store 或 provider factory。
- 在 vendored Aster 中恢复 `tools/path_guard.rs`、`tools/command_semantics.rs`、`src/subprocess.rs`、`tools/shell_runtime.rs`、shell analysis / read-target preflight public re-export，或为已迁到 `tool-runtime` 的 shell/path/command/process runtime 逻辑继续提供 Aster public wrapper。
- 在 vendored Aster 中恢复仅服务 subprocess helper 的 `encoding_rs` direct dependency；process output decode 只能归属 `tool-runtime::subprocess`。
- 在 `tool_orchestrator` 中为了 shell permission preflight 临时注册 Aster `BashTool` / `PowerShellTool`，或重新调用 Aster `check_tool_permissions`。
- 在 `tool_orchestrator` shell permission preflight 中为了 policy metadata 分类重新构造 Aster `ToolError`。
- 恢复 `agent_tools/tool_orchestrator/aster_registry_adapter.rs`，或在主 `tool_orchestrator.rs` 重新直接 import / 构造 Aster `ToolRegistry` / `ToolContext` / `ToolError` / `SandboxConfig` / `SandboxType` / `with_turn_context`。
- 在 vendored BashTool property tests 中恢复 shell permission 行为测试；permission 行为必须在 `tool-runtime` current tests 覆盖。

## 迁移原则

1. 先定 Lime current crate owner，再迁调用；不要把旧 Aster wrapper 平移成新长期 compat。
2. 新能力只进入 Lime current runtime crate，不进 Aster 或 Aster wrapper。
3. App Server 只依赖 Lime runtime interface，不直接 import Aster 类型。
4. `services` 和 `core` 只承接 Lime 领域模型和 persistence，不实现 Aster 公共 trait。
5. Aster 源码只允许作为迁移参考或短期 vendor，不承担 Lime 业务事实源。
6. 命名优先短、领域化、可读：学习 Aster 的简洁命名品味和 Codex 的工具命名，但不把 `lime_*`、`aster_*`、`agent_runtime_*` 或冗长历史词带进 current API。
7. 所有迁移必须配守卫：Cargo 依赖守卫、源码 import 守卫、App Server runtime boundary 守卫。

## 配套文档

- [./aster-runtime-codex-style-migration-plan.md](./aster-runtime-codex-style-migration-plan.md)：分阶段迁移计划、验收标准和验证入口。
- [./aster-capability-intake-strategy.md](./aster-capability-intake-strategy.md)：Aster 有价值能力的接收矩阵，明确“接收能力但不续命 Aster 事实源”的分类口径。
- [./aster-capability-intake-execution-plan.md](./aster-capability-intake-execution-plan.md)：按能力接收矩阵执行迁移的批次计划、写集边界、退出条件和进度日志。
- [./phase6-continuation-tracker.md](./phase6-continuation-tracker.md)：2026-07-09 起的 Phase 6 active tracker，列剩余 blocker、下一刀顺序和后续进度。
- [./phase6-remaining-tracker.md](./phase6-remaining-tracker.md)：Phase 6 第一段冻结跟踪，保留 context 收口与 R2/R3 provider source 已完成进度。
- [./phase5-vendor-downgrade-plan.md](./phase5-vendor-downgrade-plan.md)：Aster vendor 降级与最终删除退出条件。
- [./2026-07-05-progress-reality-check.md](./2026-07-05-progress-reality-check.md)：按退出条件重算进度，纠正 `99%` / “无 Aster 依赖完成态”误判。
- `internal/roadmap/agentruntime/README.md`：AgentRuntime 主链事实源。
- `internal/roadmap/appserver/app-server-aster-runtime-boundary-governance.md`：现有 App Server / Aster 边界治理记录。
- `internal/aiprompts/governance.md`：current / compat / deprecated / dead 分类规则。
