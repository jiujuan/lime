# Aster Runtime 迁移路线图

状态：in_progress  
创建时间：2026-07-03  
最新更新：2026-07-10
主目标：按 Codex 风格把 Lime Agent Runtime 收敛为一等 workspace crate 分层，停止把 `aster-rust` 当作 Lime current 运行时事实源。

最新现实校准：2026-07-10 探索性工作后，骨架迁移完成度约 `95%`，彻底搬空 `agent-compat` / 删除 root `aster` dependency 的完成度约 `84%`。vendor/aster-rust 已物理删除，Fast A1 public surface 收缩完成，provider source backend wrapper（`model-provider::provider_stream::source_execution`）、provider response event/item DTO（`provider_stream::response_event`）、provider response content contract（`provider_stream::response_content`）、provider response context header extraction（`provider_stream::response_context`）、provider sampling request/mode（`provider_stream::sampling`）、provider stream poll/cancel policy（`provider_stream::poll`）、provider first-text delta trim/count policy、provider tool-input delta event policy、provider model-change metadata policy、provider stream notification envelope / text classification、provider stream progress / milestone state、provider failure logging / telemetry category classification、provider trace DTO alias / trace failure projection、provider plaintext tool-use parser、provider image input policy / input modality metadata parser 与 empty-first-content retry policy 已下沉到 `model-provider`，reply loop 标准 native tools 已优先走 `tool-runtime::native_dispatch` + current permission preflight，reply loop Bash / PowerShell 前台执行已优先走 `tool-runtime::shell_execution`，reply loop Read 文件读取与 Glob/Grep 文件搜索已优先走 `tool-runtime::{file_read_execution,file_search_execution}`，reply loop 工具并发安全 / 合批策略已下沉到 `tool-runtime::tool_batch`，Agent spawn / SendMessage / TeamCreate / TeamDelete / ListPeers 执行编排、canonical lookup 与 model-visible definitions 已下沉到 `tool-runtime::collab_agent`，协作工具不再注册 Aster `Tool` trait 壳，`request_user_input` tool surface contract 已下沉到 `tool-runtime`，`provider_stream.rs` 主 facade 仍低于 `800` 行预警线，`agent-runtime` 只保留 Turn source execution payload materialization、RuntimeReplyResponseEvent materializer 与 request_user_input current runner。

最新扫描仍有 `112` 处生产 `use aster::`，集中在 compat adapter 文件（credential_bridge, request_tool_policy, aster_session_store 等），这只是可解释的迁移期 blocker 状态，不是 `agent-compat` owner 或保护目录。`tool-runtime` 已接收 tool execution policy、shell/network policy、shell parser / read-target preflight / concurrency analysis、command semantics、process decode、platform shell runtime、Read 文件读取、Glob/Grep 文件搜索、tool definition / extension DTO、WebSearch / WebFetch、apply_patch、skill_search、memory_store、image_task、turn tool surface / scope policy、tool exposure / registration gate、tool call surface normalization、native tool result projection、native dispatch execution owner、request_user_input schema / parse / validation / normalization、reply-loop native dispatch overlay lookup、reply-loop tool execution scheduling policy、Codex-style sleep current executor、Codex-style view_image current executor、Codex-style update_plan current executor，以及 Codex-style native dispatch / gateway-aware dispatch builder 骨架；`agent-runtime` 已接收 reply input、reply stream envelope 与 request_user_input runner；`model-provider` 的 provider stream handle metadata、provider source execution wrapper、provider response event/item/content/context contract、poll/cancel policy、first-text delta policy、tool-input delta policy、model-change policy、notification envelope / text classification、progress / milestone state、failure logging / telemetry category classification、provider trace alias / trace failure projection、plaintext tool-use normalization、image input policy / input modality metadata parser 与 sampling policy 已进入 current 主链。

Fast A1/A2 已继续删除 Aster permission framework、Aster 本地 recipe 文件 runtime、recipe scheduler、Aster recipe 生成/parser/metadata DTO、Aster root hook stub、Aster root context public surface、Aster agent context / parallel / resume framework、Aster media helper、`Read` image/PDF base64 分支、Aster context compaction no-op stub、Aster execution manager stub、`mcp_utils` 历史别名模块与 root `utils` 垃圾桶模块、Aster session fork / summary resume / worktree extension public API、Aster provider test / API-key auto-detect helpers、Aster tool hook framework、Aster file diff summary helper 与 vendored ripgrep helper，并把无外部生产消费者的 `agents` 子模块、`config` 内部模块、最小 `permission` 子模块、`tools` / `tools/file` / `tools/search` / `session` 实现子模块、`conversation::message` 子模块、`model` / `recipe` / `tool_inspection` 顶层模块和 concrete provider implementation / wire-format 子模块 public surface 收缩为 crate-private staging；Aster prompt snapshot `.snap.new` 产物、`prompt_manager` snapshot 测试、`insta` 依赖、空 `agents/snapshots` 目录以及 `agent-compat/src` 内联 `#[cfg(test)] mod tests` 正向测试面已删除并禁止恢复；无 Lime 外部生产调用的 `Agent::reply(...)` wrapper 已删除。`Recipe` / `SubRecipe` 仅作为 session metadata / reply loop 未迁完前的最小 DTO blocker 留存。

本轮校准的关键变化是：`agent_tools/tool_orchestrator/aster_registry_adapter.rs` 已删除，`tool_orchestrator` 工具批执行不再依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`；WebFetch/WebSearch/apply_patch/skill_search/memory_store/image_task/sleep/view_image/update_plan 的 Lime 侧 Aster adapter 已统一委托 `tool-runtime::native_dispatch` 或 gateway-aware dispatch builder；`request_user_input` 的 DTO/schema/parse/validation/normalization 已迁到 `tool-runtime::request_user_input`，`agent-runtime::ask` 保留 Turn-side runner，Aster `AskTool` 只剩 callback / timeout / Tool trait 外壳；reply loop 对 SendMessage / TeamCreate / TeamDelete / ListPeers 已在 Aster registry fallback 前优先调用 `tool-runtime::collab_agent::execution` current executor，Agent / SendMessage / TeamCreate / TeamDelete / ListPeers 的 canonical lookup 与 model-visible definitions 也已归 `tool-runtime::collab_agent`，不再注册协作 Aster `Tool` trait 壳；对标准 native dispatch 工具只把 Aster context 适配成 `tool-runtime::native_dispatch_execution` request，由 current owner 执行 permission preflight、cancel fail-fast、dispatcher 调用和结果投影，Bash / PowerShell 前台执行已迁到 `tool-runtime::shell_execution`，Read 文件读取已迁到 `tool-runtime::file_read_execution`，Glob/Grep 文件搜索已迁到 `tool-runtime::file_search_execution`，并按 `approval_policy=never`、`sandbox_policy=danger-full-access` 或 `accessMode=full-access` 避免完全授权场景弹确认，工具并发安全和相邻安全请求合批策略已由 `tool-runtime::tool_batch` 承接，tool exposure / resource gate / PowerShell registration gate 也已由 `tool-runtime::turn_tool_surface` 承接，只把 Agent 特殊 nested subagent 分支、background shell、workspace sandbox、Ask/Skill/gateway-backed/MCP 执行壳留给临时 Aster registry fallback；`Agent::reply(...)` wrapper 已删除，subagent staging adapter 直接调用 pinned-provider `reply_with_provider(...)`。但 root workspace 仍有 vendored `aster` dependency，`lime-agent` 仍有 `aster.workspace = true`；provider/reply loop、Aster internal reply loop / `Message` / provider trait、`reply_with_provider(...)` 最后一跳、session store / subagent adapter、Aster reply loop 内 registry fallback 与剩余 Aster `Tool` trait 注册壳仍是 Phase 6 blocker。详见 [2026-07-05-progress-reality-check.md](./2026-07-05-progress-reality-check.md)。

## 结论

`lime-rs/crates/aster-rust` 已从 current crate 区移出，当前 `dead / forbidden-to-restore`；`vendor/aster-rust/crates/aster` 已被移入 `lime-rs/crates/agent-compat`，但这不是新的 current owner。`agent-compat` 的唯一身份是待迁出 staging / compat blocker：仍被 `lime-agent` 生产 `use aster::...` 命中的文件必须继续迁到 `agent-runtime`、`agent-protocol`、`model-provider`、`tool-runtime`、`thread-store`、`lime-mcp`、`lime-skills`、`media-runtime` 或 App Server；Codex 无对应能力时直接删除。`agent-compat` 不是“暂时不动”的保护目录，允许改动只包括迁出生产调用、删除 Aster-only surface、减少 burn-down 依赖。`agent-compat` 现存指向 Lime current owner 的依赖只是 burn-down allowlist，退出条件是迁出对应调用并删除依赖，不能继续扩张成反向承接层。`vendor/aster-rust/crates/aster-models` 曾临时落到 `lime-rs/crates/agent-compat-models`，现已由 `agent-protocol::{openai, anthropic}` 承接并删除重复 crate。2026-07-09 起迁移策略纠偏为：不得把 `agent-compat` 作为迁移完成态，并在 Phase 6 删除 root `aster` alias 与 `crates/agent-compat*`。

后续固定方向是：**学习 Codex 的 crate 存放和依赖方式，把 Lime 自己的 runtime 能力拆成平铺的一等 workspace crate；Aster 只作为 `compat vendor / deprecated migration reference`，不再是 current 主链。**

具体文件移动计划见 [./owner-file-move-skeleton-plan.md](./owner-file-move-skeleton-plan.md)。第一批已把 `plan/**`、`rules/**`、`streaming/**` 从 `agent-compat` 移到对应 owner 的 `compat/aster_reference`，并从 `agent-compat/src/lib.rs` 删除 public module surface；`agent-compat-models` 已清理为 `dead / deleted / forbidden-to-restore`，`agent-compat/tests/**` 与 `agent-compat/src` 下独立旧测试文件也已清理，不能继续作为 current 迁移证据。

2026-07-10 快通道补充：`agent-compat/src/agents/mod.rs` 只继续对外暴露现存生产 compat 必需的 `Agent` / `AgentEvent`、`ExtensionConfig` / `McpClientTrait`、`AgentIdentity`、`SessionConfig`、provider trace event、`ToolCallResult` 等边界；`ProviderTraceStage` root re-export 已下线，current stage owner 是 `agent-protocol::provider_trace`。`execute_commands`、`extension_malware_check`、`extension_manager_extension`、`final_output_tool`、`moim`、`prompt_manager`、`retry`、`subagent_handler`、`subagent_tool` 等没有外部 `aster::agents::*` 生产消费者的模块只允许作为 crate-private staging，后续随 R2/R4/R7 迁出或删除，不得恢复 public API、snapshot 更新产物、`assert_snapshot!` 测试或 `insta` 依赖。

2026-07-10 provider 快通道补充：`agent-compat/src/providers/mod.rs` 不再对外暴露 concrete provider implementation / helper modules，`providers/formats/mod.rs` 也不再对外暴露 provider-specific wire-format helper；对外只保留 R2/R3 未迁完前必需的 `providers::base`、`providers::errors`、`providers::formats::openai_responses` 与 factory exports。后续 provider backend / connection test / stream execution 必须进入 `model-provider` / App Server current 主链，不能恢复 `aster::providers::<provider>` public API。

2026-07-10 provider 追加收缩：`agent-compat/src/lib.rs` 不再对外暴露 `pub mod providers;`；`providers::{base,errors,formats}` 与 `formats::openai_responses` 均降为 crate-private staging。外部生产引用已改为 root `aster::{Provider, ProviderError, MessageStream, RetryConfig, create_provider, ...}` 过渡面，`aster::providers::*` 路径扫描已清零并由治理测试禁止恢复。provider trait object / `reply_with_provider(...)` 仍是 R2/R3 blocker，不是迁移完成态。

2026-07-10 config 快通道补充：`agent-compat/src/config/mod.rs` 除 `paths` 外不再对外暴露 Aster config module 或 re-export；`Config`、`AsterMode`、`PermissionManager`、extension config helper 等只允许作为 crate-private staging。当前唯一外部生产引用是 `aster::config::paths::initialized_path_root()`，后续随 R5/R6 session/runtime store adapter 迁出后删除。

2026-07-10 config 追加收缩：`agent-compat/src/lib.rs` 不再对外暴露 `pub mod config;`；唯一 path root 调用已改为 root `aster::initialized_path_root()` 过渡 helper，`aster::config::*` 路径扫描已清零并由治理测试禁止恢复。该 helper 仍只是 R5/R6 runtime store adapter blocker，不是 current config owner。

2026-07-10 permission 快通道补充：`agent-compat/src/permission/mod.rs` 不再对外暴露 `permission_confirmation`、`permission_inspector`、`permission_judge`、`permission_store` 子模块；外部只保留 `Permission` / `PermissionConfirmation` / `PrincipalType` 等 root 最小 re-export。真正 approval / HITL current owner 仍是 App Server RuntimeCore pending action、`agentSession/action/respond` 与 `tool-runtime::execution_approval`，不得恢复 `aster::permission::permission_*` public API。

2026-07-10 tools/session 快通道补充：`agent-compat/src/tools/mod.rs`、`tools/file/mod.rs`、`tools/search/mod.rs` 和 `session/mod.rs` 不再对外暴露实现子模块；当时的过渡面只保留尚未迁完的 `Tool` / `ToolRegistry` / `ToolContext` / `SessionStore` / `ExtensionData` 等 blocker 类型，后续已继续收缩为 root allowlist 与 crate-private 实现 fallback。零引用 `tools/file/diff_summary.rs` 与 `tools/search/ripgrep.rs` 已删除；文件改动摘要、搜索执行和工具生命周期必须继续向 `tool-runtime` / apply_patch / App Server current 主链收敛。

2026-07-10 conversation/model/recipe/tool inspection 快通道补充：`agent-compat/src/conversation/mod.rs` 不再对外暴露 `message` 子模块；`agent-compat/src/lib.rs` 不再对外暴露 `model`、`recipe`、`tool_inspection` 顶层模块。外部生产只允许通过 `aster::conversation::{Message, MessageContent, ToolRequest, ...}`、`aster::ModelConfig`、`aster::Recipe`、`aster::{InspectionAction, InspectionResult, ToolInspector}` 等最小过渡 re-export 访问尚未迁完的 blocker 类型；这些 re-export 不是 current owner，最终随 R2/R5/R6/R4 迁出后删除。

2026-07-10 conversation/session/tools 顶层追加收缩：`agent-compat/src/lib.rs` 不再对外暴露 `pub mod conversation;`、`pub mod session;`、`pub mod tools;`；`lime-agent` 外部生产引用已批量改为 root `aster::{Message, Conversation, SessionStore, Tool, ToolContext, ...}` 过渡面，`aster::conversation::*` / `aster::session::*` / `aster::tools::*` 路径扫描已清零并由治理测试禁止恢复。Aster `Message` / `Conversation`、`SessionStore` / `ThreadRuntimeStore`、`ToolRegistry` / `Tool` / `ToolContext` 仍分别是 R2/R6、R5/R6、R4 blocker，不进入 current owner。

2026-07-10 session/tools root wildcard 追加下线：`agent-compat/src/lib.rs` 不再使用 `pub use session::*;` 或 `pub use tools::*;`，改为显式 allowlist 暂留 `ThreadRuntimeStore` / `SessionRuntimeSnapshot` / `QueuedTurnRuntime` 与 `Tool` / `ToolContext` / `ToolRegistry` 等当前仍被 `lime-agent` adapter 命中的 blocker 类型；`session/mod.rs`、`tools/mod.rs` 和 `tools/search/mod.rs` 同步删除已无消费者的 private re-export 与过期 vendored ripgrep 说明。该改动只是把 compat 面可见化，后续仍要继续迁出 R4/R5/R6，不能作为完成态。

2026-07-10 BashTool root surface 下线：`lime-agent` 的 Windows shell runtime 验证改为直接调用 `tool-runtime::shell_runtime::build_platform_shell_command(...)`，`agent-compat/src/lib.rs` 不再 root re-export `BashTool`，治理测试禁止 `agent/src` / `agent/tests` 恢复 `aster::BashTool`。Aster 内部 `BashTool` 仍作为 reply loop registry fallback 的 R4 blocker 暂留，退出条件是 shell execution 全部进入 `tool-runtime` / current tool router 后删除内部 registry 壳。

2026-07-10 Bash / PowerShell 前台执行壳迁出：`tool-runtime::shell_execution` 承接前台 Bash / PowerShell 参数解析、current shell permission、preflight、embedded process execution、output decode 和 result projection；reply loop native branch 在 live-execution hook 后先尝试 current shell executor，再尝试 current native dispatch executor，最后才 fallback 到 Aster `registry.execute(...)`。完全授权语义固定为 `approval_policy=never`、`sandbox_policy=danger-full-access` 或 `accessMode=full-access` 时不弹确认；非 full-access warning、background shell 和 workspace sandbox 仍暂时 fallback。该刀只减少 R4 registry fallback，不代表 R4 完成。

2026-07-10 GUI Gate A/B 复验：R4 shell/full-access 链路已通过 Gate B Electron CDP `approval-request-full-access`，summary 为 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-full-access-shell-r4-after-input-helper-summary.json`，证明完全授权下不出现确认框；Gate A `smoke:agent-runtime-current-fixture` 完整通过并覆盖 approval resume/decline/cancel/full-access、inputbar restore/pending steer、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference 与 Content Factory Article Editor，`liveProviderUsed=false`。Claw fixture 输入 helper 的 controlled setter / `InputEvent("input")` 只用于稳定 Electron evidence，不是 production fallback；R4 remaining registry fallback、R2/R3 provider reply exit source 和 R5/R6 session/runtime store 仍阻塞 Phase 6 完成。

2026-07-10 Read / Glob / Grep 前台执行壳迁出：`tool-runtime::file_read_execution` 承接 Read 的文本行号读取、文档预览、SVG / Notebook 文本读取、图片 / PDF retired fail-closed 与 metadata projection；`tool-runtime::file_search_execution` 承接 Glob 的 mtime 排序 / exclude / truncation 与 Grep 的 content / files_with_matches / count 模式、regex parse、hidden / binary 策略和 metadata projection。reply loop 顺序固定为 live hook -> collab -> shell -> file read -> file search -> native dispatch -> Aster registry fallback；`agent-compat` 只适配 cwd / cancel token，不再拥有文件读取或搜索执行。R4 仍未完成，Ask/Skill/gateway-backed/MCP、background / sandbox shell、R2/R3 provider reply exit source 与 R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

2026-07-10 具体工具实现 public surface 追加下线：`agent-compat/src/tools/mod.rs`、`tools/file/mod.rs` 和 `tools/search/mod.rs` 不再公开 re-export `BashTool` / `PowerShellTool` / `ReadTool` / `GlobTool` / `GrepTool` / `AskTool` / `SharedFileReadHistory` 等实现类型；`register_all_tools(...)` / `register_default_tools(...)` 也只保留 crate-private。公开面仅保留 `Tool` / `ToolRegistry` / `ToolContext`、`ToolRegistrationConfig` 与仍被 bridge 使用的 `AskCallback` 等最小 blocker；`agent-compat/src/lib.rs` 与 `tools/mod.rs` 不再 re-export `AskRequest` / `AskOption` / `AskQuestion`，`lime-agent/src/ask_bridge.rs` 直接消费 current `agent-runtime::ask` DTO。Aster 具体工具实现只能作为 R4 reply-loop registry fallback staging，退出条件是 Bash/PowerShell/Read/Search/Ask/Skill/gateway-backed/MCP 执行壳迁到 `tool-runtime` / current gateway executor 后删除。

2026-07-10 team tool public surface 追加下线：`agent-compat/src/tools/mod.rs` 不再公开 re-export `TeamCreateTool` / `TeamDeleteTool` / `ListPeersTool`，后续具体类型与 `Tool` trait 实现也已删除；`tools/team_tools.rs` 只保留 `execute_team_runtime_tool(...)` 和 session/team storage adapter。`TeamCreate` / `TeamDelete` / `ListPeers` 的定义、canonical lookup 和执行 owner 均归 `tool-runtime::collab_agent`；不得恢复外部 `aster::TeamCreateTool` / `aster::TeamDeleteTool` / `aster::ListPeersTool` surface。

2026-07-10 collab agent surface / execution 追加收敛：Agent / SendMessage / Team / ListPeers 的工具名、描述、DTO、schema、canonical lookup、model-visible definitions、结构化消息 helper、peer address parse / scheme contract、Agent spawn request/projection、SendMessage validation、Agent spawn / SendMessage 执行编排与结果 projection，以及 TeamCreate / TeamDelete / ListPeers mutation executor 已归 `tool-runtime::collab_agent`；reply loop 已在 Aster `registry.execute(...)` 前优先执行 SendMessage / TeamCreate / TeamDelete / ListPeers 的 current executor，`list_tools` 也从 current definitions 注入协作工具。`agent-compat` 不再经 `agent_control.rs` / `tools/mod.rs` 二次导出 `SpawnAgentRequest` / `SpawnAgentResponse`，也不再注册或保留 `SpawnAgentTool` / `SendInputTool` / `TeamCreateTool` / `TeamDeleteTool` / `ListPeersTool` Aster `Tool` trait 壳，只保留 callback adapter、session/team resolver 与 session/team storage adapter。不得在 `agent-compat` 恢复本地 `AgentInput` / `SendMessageInput` / `TeamCreateInput` / `ListPeersInput`、schema builder、canonical lookup、Agent spawn request/projection、SendMessage validation/execution owner、Team mutation owner、peer address re-export helper、current DTO 代理出口、公开具体工具实现类型，或重新构造 Agent / SendMessage / Team 输出 metadata。后续 R4 继续迁出 Ask/Skill/gateway-backed/MCP 等剩余 Aster `Tool` trait 壳和 registry fallback；session/team storage adapter 的最终删除仍取决于 R5/R6 session/runtime store 迁出。

2026-07-10 agents 快通道补充：`agent-compat/src/lib.rs` 不再对外暴露 `pub mod agents;`；外部生产引用已改为 root `aster::{Agent, AgentEvent, AgentIdentity, ExtensionConfig, McpClientTrait, SessionConfig, ...}` 最小过渡 re-export，`aster::agents::*` 路径扫描已清零并由治理测试禁止恢复。Aster `Agent` / `AgentEvent` / MCP extension bridge / live execution hook / tool call result 仍是 R2/R4/R7 blocker，不进入 current owner。

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
- `model-provider::provider_stream::{source_execution,poll,sampling,response_event,response_content}` 等 provider owner 子模块；`agent-compat` 只能适配 Aster `MessageContent`，不能重新拥有 provider response content 规则。

### compat

- 迁移期的 `lime-agent` facade。
- 迁移期的 Aster event -> Lime runtime event 转换器。
- 迁移期的 Aster session / conversation 读取 adapter。
- `lime-rs/crates/agent-compat` 中仍被生产 `use aster::...` 命中的最小 staging blocker；它不是 owner，退出条件是迁出到 Lime current owner 或删除。
- Aster config 顶层模块只允许作为 private staging；public API 只保留 root `initialized_path_root()` 过渡 helper，服务尚未迁出的 session/runtime store path root adapter。
- Aster permission 子模块只允许作为 crate-private staging；public API 只保留 root 最小 re-export，服务未迁出的 reply loop permission bridge。
- Aster provider 顶层模块、base/error/format 子模块和 provider-specific wire-format helper 只允许作为 private / crate-private staging；public API 只保留 root provider 最小 re-export，服务 R2/R3 未迁完 blocker。
- Aster tools / session 实现子模块只允许作为 crate-private staging；public API 只保留 root 最小 re-export，服务尚未迁出的 reply loop native tool registry、read/search 工具壳和 session/runtime store adapter。
- Aster conversation / session / tools 顶层模块只允许作为 private staging；public API 只保留 root 最小 re-export，服务 R2/R4/R5/R6 未迁完 blocker，不得恢复 `aster::conversation::*` / `aster::session::*` / `aster::tools::*` 外部 module path。
- Aster agents 顶层模块只允许作为 private staging；public API 只保留 root 最小 re-export，服务尚未迁出的 reply/event source、MCP extension bridge、live execution hook 和 session config adapter。
- Aster internal reply loop 内的 native tool registry，以及 WebFetch / WebSearch / apply_patch / skill_search / memory_store / image_task / sleep / view_image / update_plan 的临时 Aster `Tool` trait adapter，只服务尚未迁出的 reply loop 工具调用面。

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
- `lime-rs/crates/agent-compat/src/**/{tests.rs,*_tests.rs,*_property_tests.rs}` 与 `agent-compat/src/**` 内联 `#[cfg(test)] mod tests`：Aster compat staging crate 的旧源码内正向测试面已删除；必要回归必须迁到 `agent-runtime`、`agent-protocol`、`model-provider`、`tool-runtime`、`thread-store` 或 App Server。
- `lime-rs/crates/agent-compat/src/config/signup_{openrouter,tetrate}/**`：Aster-only 本地浏览器 signup 向导已删除；Codex 无对应 current 面，Lime provider credential onboarding 若需要必须进入 current provider/settings 主链。
- `lime-rs/crates/agent-compat/src/config/{agents_md_parser,config_command,config_manager,experiments,watcher}.rs`：Aster-only config CLI / multi-source manager / watcher / experiment manager staging 面已删除；Codex 无对应 current 工具面，Lime 配置能力后续只能进入 provider/settings current 主链。
- `aster::config::*` 外部 public module path：已收缩为 root `initialized_path_root()` 最小 helper，生产路径不得恢复 `aster::config::paths` 或其他 config 子路径；剩余 helper 最终随 R5/R6 session/runtime store adapter 删除。
- `lime-rs/crates/agent-compat/src/context/**`：Aster root context public surface 已删除；Codex 有 AGENTS.md / context owner，但不采用这套 Aster 自研 public API，也没有 `aster://` context storage API。`ContextTraceStep` 的 current DTO 归 `agent-protocol::context_trace`，Aster reply loop 未迁完前只在 `agents` 事件边界保留最小 compat 字段类型；tool I/O / token / truncation 规则归属 `tool-runtime::tool_io` current owner。
- `lime-rs/crates/agent-compat/src/session/{fork,resume,worktree}.rs`：Aster session fork/merge、summary cache resume 和 worktree extension public API 已删除；Codex-first Thread/App Server 主链不采用这套 `aster::session` public surface。后续若需要 branch、resume 或 worktree 产品能力，必须进入 Thread / App Server / project_git current owner。
- `lime-rs/crates/agent-compat/src/session/plan.rs`：Aster session plan-mode extension 已删除；Codex-style plan / checklist 能力归 `tool-runtime::update_plan` 与 App Server / 前端计划轨，不得恢复 `SessionPlanModeState`、`session_plan_mode` extension 或 `mod plan;`。
- `lime-rs/crates/agent-compat/src/providers/{auto_detect,provider_test,testprovider}.rs`：Aster provider API-key auto-detect、weather sample live test 和 record/replay `TestProvider` 已删除；provider testing / connection check 只能走 App Server / `model-provider` current 主链，不得恢复为 Aster public helper。
- `aster::providers::*` 外部 public module path：已收缩为 root provider 最小 re-export，生产路径不得恢复 `aster::providers::base`、`aster::providers::errors`、`aster::providers::formats` 或 concrete provider 子路径；剩余 provider root re-export 最终随 R2/R3 provider backend 迁出后删除。
- `aster::conversation::*` / `aster::session::*` / `aster::tools::*` 外部 public module path：已收缩为 root 最小 re-export，生产路径不得恢复 conversation / session / tools 顶层模块穿透；剩余 root re-export 最终随 R2/R4/R5/R6 迁出后删除。
- `lime-rs/crates/agent-compat/src/mcp/**`：Aster root MCP manager 已删除；外部生产引用为 0，Lime current MCP owner 是 `lime-mcp` / App Server MCP gateway / `tool-runtime::mcp_notification`、`mcp_resource`、`tool_search`。R7 剩余 blocker 只指 `agents/mcp_client.rs`、Aster extension manager / built-in extension clients 的 reply loop adapter。
- `lime-rs/crates/agent-compat/src/skills/**` 与 `lime-rs/crates/agent-compat/src/agents/skills_extension.rs`：Aster skills registry / loader / executor / workflow helper 和 `loadSkill` platform extension 已删除；Skill current owner 是 `lime-skills`、`tool-runtime::skill_execute` / `skill_gate` / `skill_result` 与 App Server skill 数据源。`LimeSkillTool` 仅作为 R4 未迁完前的临时 Aster `Tool` trait 外壳。
- `lime-rs/crates/agent-compat/src/agents/{context,parallel,resume}/**`：Aster-only agent context inheritance / isolation、parallel agent executor / pool、checkpoint resume framework 已删除；外部 `aster::agents::*` 生产引用为 0，Codex / Lime current 对应能力归 Thread / Turn / Item、App Server task orchestration、file checkpoint API 和 `agent-runtime`，不得恢复 `AgentContextManager`、`ParallelAgentExecutor`、`AgentPool`、`AgentResumer`、`AgentStateManager`、`Checkpoint` 或相关 public re-export。
- `aster::agents::*` 外部 public module path：已收缩为 root 最小 re-export，生产路径不得恢复 `aster::agents::Agent`、`aster::agents::extension::*` 或 `aster::agents::mcp_client::*`；剩余 `Agent` / `AgentEvent` / extension / hook 类型只是 root compat blocker，最终随 R2/R4/R7 迁出后删除。
- `lime-rs/crates/agent-compat/src/{context_mgmt,mcp_utils,posthog,prompt_template,security,slash_commands,tool_monitor,user_message_manager,utils}.rs`、`lime-rs/crates/agent-compat/src/{execution,hints,hooks,network}/**`、`lime-rs/crates/agent-compat/src/{oauth,token_counter}.rs`、`lime-rs/crates/agent-compat/src/tools/hooks.rs`、`lime-rs/crates/agent-compat/src/prompts/**`：Fast A1 no-op / empty queue / custom slash recipe / prompt template / dummy helper stubs、历史别名模块、root helper 垃圾桶和 Aster-only tool hook framework 已删除或迁出；Codex 有 TUI slash command、AGENTS.md 和 context compaction current owner，但没有 Aster 任意 `/xxx` 绑定本地 recipe 文件并注入 prompt 的 runtime 语义，也不需要 Aster empty hints loader、root OAuth bail stub、dummy token counter、`mcp_utils::ToolResult` 历史别名、root `utils::sanitize_unicode_tags` / `is_token_cancelled`、root `hooks::FrontmatterHooks` public stub、`tools::hooks::ToolHookManager`、`render_global_file` 空模板系统、返回原 conversation 的 context compaction 假实现或只缓存 `Agent::new()` 的 execution manager。Posthog telemetry、security inspector、repetition inspector、user message queue 均为空实现，不得恢复为 compat 壳。`network` 的 localhost proxy bypass 规则已迁到 `model-provider::http`，token fallback 已改用 `tool-runtime::tool_io`，`FrontmatterHooks` 已限制在 `tools::agent_control` 唯一 DTO 消费点；`/compact` 在 Aster staging 内只允许明确退役，不得写空 summary 假成功。
- `lime-rs/crates/agent-compat/src/permission/{audit,condition,integration,manager,merger,migration,pattern,policy,restriction,templates,types}*`：Aster integrated permission / policy / audit framework 已删除；Codex / Lime current approval owner 是 App Server RuntimeCore pending action、`agentSession/action/respond`、`tool-runtime::execution_approval` 与最小 Aster `PermissionInspector` 适配。不得恢复 `ToolPermissionManager` / `ToolPolicyManager` / `PermissionContext` / `AuditLogger` 作为 staging crate 权限事实源。
- `lime-rs/crates/agent-compat/src/scheduler.rs`、`lime-rs/crates/agent-compat/src/scheduler_trait.rs`、`lime-rs/crates/agent-compat/src/recipe/{build_recipe,local_recipes,read_recipe_file_content,template_recipe,validate_recipe,yaml_format_utils}.rs`：Aster 本地 recipe 文件 loader / template renderer / validator / YAML formatter 与 recipe scheduler 已删除；Codex 无 Aster 任意本地 recipe 文件注入和 cron recipe runner 语义，Lime 前端 automation / scheduler 属于独立 current 主链。`Agent::create_recipe(...)`、`Recipe::from_content(...)`、`Author`、`Settings`、`RecipeParameter*` 和 recipe builder 的 `author/settings/parameters` 入口已删除；`Recipe` / `SubRecipe` DTO 暂留 session metadata / subagent staging blocker，不能恢复 recipe runtime helper、recipe generation/parser、旧 metadata DTO、`SchedulerTrait`、`Agent::set_scheduler` 或相关依赖。
- `lime-rs/crates/agent-compat/src/media/**` 与 `agent-compat/src/tools/file/read.rs` 中的 image/PDF base64 分支：Aster `Read` 旧 multimodal helper 已删除 / fail-closed；Codex current 图片查看走 `tool-runtime::view_image`，PDF 文本走 current document preview / ingestion，不得恢复 `read_image_file_enhanced`、`estimate_image_tokens`、`Base64 Data` 或 PDF base64 payload。
- `lime-rs/crates/agent-compat/src/tools/file/diff_summary.rs` 与 `lime-rs/crates/agent-compat/src/tools/search/ripgrep.rs`：零引用 Aster helper 已删除；文件改动摘要属于 current apply_patch / GUI file-change projection，搜索执行不得恢复 `.aster/bin` vendored ripgrep helper。
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
