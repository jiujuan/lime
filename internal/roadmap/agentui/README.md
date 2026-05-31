# Lime AgentUI 路线图文档

> 状态：路线图与架构设计
> 更新时间：2026-05-27
> 范围：Lime 对话工作区下一阶段 AgentUI，包括 UI 架构、代码层级、事件流程、时序图、后端协作与落地顺序。

## 目标

AgentUI 不是再做一个聊天页面，而是把 Lime 已有的 runtime、timeline、artifact、task、team、harness、evidence 能力收束成一个可观察、可控制、可交付的工作台。

本目录回答四类问题：

1. **产品结构**：Lime 的 AgentUI 应该由哪些层组成，哪些信息应该出现在首屏，哪些应该进入展开详情。
2. **代码结构**：现有前端、协议、Tauri command、Rust runtime、service、持久化层分别负责什么。
3. **运行流程**：发送消息、打开旧会话、排队输入、权限确认、产物生成、证据导出如何流动。
4. **落地顺序**：哪些改动先解决体感慢、卡顿、重复吐字和多任务管理，哪些进入中长期演进。

## 阅读顺序

| 文档                                                                                             | 作用                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [agent-ui-research-and-lime-direction.md](agent-ui-research-and-lime-direction.md)               | 竞品与本地参考调研，说明为什么 Lime 要走“对话 + 过程 + 任务 + 产物 + 证据”路线。                            |
| [lime-agentui-target-architecture.md](lime-agentui-target-architecture.md)                       | 目标 UI 架构图与五层模型，是后续 UI 改造的总图。                                                            |
| [lime-agentui-code-map.md](lime-agentui-code-map.md)                                             | Lime 当前代码层级地图，标出前端、协议、后端、服务和测试入口。                                               |
| [lime-agentui-event-flow.md](lime-agentui-event-flow.md)                                         | 关键流程图，包括发送消息、旧会话恢复、queue/steer、权限、artifact、evidence。                               |
| [lime-agentui-sequence-diagrams.md](lime-agentui-sequence-diagrams.md)                           | 端到端时序图，适合实现和排查首字慢、恢复慢、流式错乱。                                                      |
| [lime-agentui-backend-coordination.md](lime-agentui-backend-coordination.md)                     | 后端配合代码架构，定义 UI 需要后端继续补齐的投影、分页、指标与批量接口。                                    |
| [lime-agentui-implementation-roadmap.md](lime-agentui-implementation-roadmap.md)                 | P0/P1/P2/P3 落地顺序、验收标准和验证命令。                                                                  |
| [conversation-projection-architecture.md](conversation-projection-architecture.md)               | Warp 对齐的对话投影架构，声明 AgentUI 只做 UI projection，不新增 runtime fact source。                      |
| [conversation-projection-fact-map.md](conversation-projection-fact-map.md)                       | 对话状态事实源地图，标明 owner、writer、readers、persistence、runtime fact source 与 projection-only 边界。 |
| [conversation-projection-implementation-plan.md](conversation-projection-implementation-plan.md) | 对话主链瘦身的分阶段实施计划，顺序为事实源盘点、Projection Store、controller、selector、UI。                |
| [conversation-projection-acceptance.md](conversation-projection-acceptance.md)                   | 对话投影改造的固定验收场景、性能指标、Playwright 续测口径和完成判定。                                       |
| [lime-agentui-standard-alignment.md](lime-agentui-standard-alignment.md)                         | AgentUI 标准全流程 taxonomy 与 Lime 当前实现差距，固定 current / compat / deprecated / dead 分类和下一刀。  |
| [responsive-chat-ttft-sample-matrix-20260512.md](responsive-chat-ttft-sample-matrix-20260512.md) | `responsive_chat_auto` 的真实 TTFT 样本矩阵、completion gate 与 fallback-only 证据。                        |
| [completion-audit-20260512.md](completion-audit-20260512.md)                                     | AgentUI TTFT 完整目标 completion audit，逐项映射 prompt 要求、artifact、验证证据与可选优化。                |

## 当前结论

Lime AgentUI 的主线应保持一个事实源，不新增第二套事件系统：

```text
Agent runtime event
  -> session / timeline / thread_read / artifact / evidence projection
  -> frontend state
  -> Conversation / Process / Task / Artifact / Evidence UI
```

对话层结构瘦身进一步固定为 Warp 对齐的 projection 子计划：

```text
Warp runtime fact sources
  -> Conversation Projection Store
  -> controllers
  -> selectors
  -> UI
```

其中 Warp 继续拥有 `Agent runtime identity`、`ModalityRuntimeContract`、`Execution Profile`、`Artifact Graph`、`Evidence / Replay / Task Index` 等事实源；AgentUI 只消费这些事实源生成对话 UI 需要的轻量投影。

下一阶段 UI 的关键词不是“更像某个竞品”，而是：

- **首屏轻**：旧会话打开先展示 shell、缓存快照、最近消息，再渐进补 timeline / tool / artifact。
- **流式稳**：text、thinking、tool、artifact、runtime status 分型渲染，防止重复吐字和正文污染。
- **任务可压缩**：运行中、排队、needs input、plan ready、failed 统一进入 capsule / task strip。
- **产物离开正文**：最终交付进入 Artifact / Canvas / Workbench，聊天正文负责解释和协作。
- **证据可追溯**：harness、evidence、review、replay 消费同一条 runtime/timeline 事实链。
- **编程底座自然触发**：普通自然语言编程请求应直接进入 `code_orchestrated` runtime；`@代码` 只是 catalog 快捷入口，不拥有独立 parser、protocol 或 workspace。2026-05-26 已用 `smoke:agent-runtime-tool-surface-page` 与 `verify:gui-smoke` 验证自然语言输入会提交 `agent_runtime_submit_turn`，并在 Harness 中展示编程底座、流式文件写入、测试输出、权限确认、代码 diff 概览、文件活动和本轮文件变更处理；同一 smoke 已覆盖 GUI 点击“允许并继续”并断言回写统一 `agent_runtime_respond_action`，也覆盖“全选变更 -> 标记已应用”的文件处理状态更新，以及从文件变更处理区打开文件快照、查看快照 diff、点击“恢复此快照 -> 确认恢复”并断言回写 `agent_runtime_restore_file_checkpoint`。页面 smoke 还断言普通自然语言编程请求创建新会话时提交 `executionStrategy: code_orchestrated`，请求正文不带 `@代码`，且 request metadata 不写 `harness.code_command`；运行中继续输入第二条自然语言时，仍提交到同一 `code_orchestrated` session，带 `queue_if_busy: true`，并在输入区队列面板投影后续需求。2026-05-27 新增 `smoke:code-runtime-fixture`，用 localhost OpenAI-compatible fixture 驱动真实 `agent_runtime_create_session -> agent_runtime_submit_turn`，不显式传 `executionStrategy` 时 session 默认持久化为 `auto`，实际 runtime 仍按 `code_orchestrated` 生效；fixture 依次触发 `Read -> Write -> Bash -> final text`，验证工作区文件真实改写、`agent_runtime_list_file_checkpoints` 有快照、`agent_runtime_diff_file_checkpoint` 返回结构化 `diff`，`agent_runtime_export_evidence_pack` 能回看该代码文件，并断言请求正文不含 `@代码`、metadata 不写 `harness.code_command`。页面 smoke 现在还要求 Runtime 能力摘要显示 WebSearch、子任务、Team 与 Task current surface 全部已接通，不再把这些缺口当成功标准。
- **联网不降级底座**：输入层只透传用户选择的 `webSearch` 偏好，不再因为联网搜索开启就把 `auto` / `code_orchestrated` 执行策略改写成 `react`；联网能力由 runtime tool policy 决定，避免“带搜索的编程任务”绕开编程底座。
- **GUI gate 状态**：2026-05-27 在清理旧 headless Tauri / DevBridge 后复跑 `npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 并通过，确认 `127.0.0.1:1420` 前端壳与 `127.0.0.1:3030` DevBridge 就绪，并串联通过 `smoke:workspace-ready`、`smoke:browser-runtime`、`smoke:site-adapters`、`smoke:agent-service-skill-entry`、`smoke:agent-runtime-tool-surface`、`smoke:agent-runtime-tool-surface-page`、`smoke:code-runtime-fixture`、`smoke:agent-runtime-approval-sandbox`、`smoke:at-command-registry`、`smoke:agent-apps`、`smoke:knowledge-gui`、`i18n:patch-retirement-gate` 与 `smoke:design-canvas`。其中 `smoke:agent-runtime-tool-surface-page` 明确覆盖自然语言编程底座 GUI 主路径；`smoke:code-runtime-fixture` 覆盖离线真实 runtime 编程闭环；`smoke:agent-runtime-approval-sandbox` 在真实 DevBridge 中采集 denied-only permission confirmation transcript，证明 `agent_runtime_create_session -> agent_runtime_submit_turn -> agent_runtime_get_thread_read -> agent_runtime_respond_action` 可在 `code_orchestrated` 下阻断到权限确认并拒绝回写，不继续模型执行、不消耗真实 Provider。`smoke:knowledge-gui` 已在 Playwright 页面层为 `knowledge_compile_pack` 注入 `builderRuntime.enabled=false`，本轮 full gate 输出 `offline builder runtime enforced for 2 knowledge_compile_pack request(s)`，明确阻断默认 GUI gate 误调用真实 Builder Skill / Provider；真实 Provider 的 `smoke:claw-chat-ready-streaming` 与 approval sandbox resolved/live transcript 仍默认按 live-provider gate 跳过，不计入本轮离线可交付门槛。
- **Rust 边界复验**：2026-05-27 继续复跑 `cargo test --manifest-path "src-tauri/Cargo.toml" -p lime thread_read_should_project_runtime_permission -- --test-threads=1`、`cargo test --manifest-path "src-tauri/Cargo.toml" -p lime commands::aster_agent_cmd::runtime_turn::tests::request_permission -- --test-threads=1` 与 `cargo test --manifest-path "src-tauri/Cargo.toml" -p lime commands::aster_agent_cmd::runtime_turn::tests::routing::should_prewarm_mcp_runtime_should_skip_pending_runtime_permission_confirmation -- --test-threads=1` 并通过，确认 runtime permission confirmation 的 pending / denied DTO 投影、turn gating 与 prewarm skip 仍由 Rust 主链约束；随后补跑 `create_runtime_session_internal_without_strategy_should_default_to_auto`、`create_session_record_sync_without_strategy_should_default_to_auto` 与 `tool_end_preserves_embedded_checkpoint_metadata`，确认无策略会话默认进入 `auto`，且 Write 工具嵌入的 checkpoint diff metadata 不会在 tool end 快照丢失；该复验不替代真实 Provider 长编程任务证据。
- **编程 GUI 导轨**：2026-05-27 在 Workspace Harness 弹窗的 lead content 接入 `CodeWorkbenchGuide`，只在 `code_orchestrated` current runtime 下显示，不读取 `@代码` 命令或 assistant 正文关键词。导轨把权限确认、文件写入、失败输出、工具输出、文件变更审阅和快照回滚状态聚合成一个“下一步”入口，优先级为权限确认 -> 正在写入 -> 失败输出处理 -> 文件变更处理 -> 输出查看 -> 运行状态，避免用户在多个分区间寻找当前阻塞点。权限阶段现在展示允许 / 拒绝后的用户可理解结果说明，并复用现有 runtime approval facts，不新增协议或正文 parser。失败输出判断复用 Harness output signal 的 `exitCode` / 文本事实源，不新增 runtime 协议或命令 metadata。
- **代码审阅摘要**：2026-05-27 在同一 Workspace Harness lead content 接入 `CodeReviewSummaryPanel`，只消费现有 `HarnessSessionState` 与 `threadRead.file_checkpoint_summary`，不新增命令、协议或正文 parser。摘要保持轻量，只把本轮文件变更、测试/工具输出和快照回滚入口集中展示，并跳转到现有 `file_review`、`outputs` 与文件快照弹窗；多文件任务只展示前三个文件名并提示剩余数量，避免摘要区域膨胀成 IDE 文件树；当测试 / 工具输出失败时，主按钮优先显示并打开失败输出，只有输出或只有快照时也直接指向对应入口。2026-05-27 继续补轻量状态标签，区分“先处理失败输出 / 待审阅变更 / 输出可查看 / 快照可回滚”，并给输出卡保留 `danger / success / muted` 语义，方便用户和回归测试都能判断当前下一步。2026-05-27 再补输出短预览：摘要卡会展示当前优先输出的前几行，失败输出用失败片段提示，长输出裁剪在卡内，详细内容仍跳转现有工具输出区。2026-05-27 参考 `/Users/coso/Documents/dev/js/OpenVibeCoding` 的 Fix preview errors 模式，在失败输出状态补“继续修复”入口：它从失败 `HarnessOutputSignal`、本轮文件变更和最近 `file_checkpoint_summary` 生成结构化修复 prompt，经现有 `agent_runtime_submit_turn` 发送，并在 request metadata 只写入 `harness.code_fix.source=failed_output`；prompt presentation copy 必须由 `zh-CN / zh-TW / en-US / ja-JP / ko-KR` 的 agent i18n 资源传入，工具层不保留中文默认文案；不新增预览命令、dev-server 协议或第二套 runtime。2026-05-27 继续补轻量“当前审阅焦点”条，把失败输出、相关文件和快照入口聚合成一条可点击的下一步路径，仍跳转现有 outputs / file_review / snapshots，不引入完整 IDE 面板；当失败输出文本提到某个变更文件时，该文件会在摘要列表和继续修复 prompt 中置顶，减少多文件任务里靠人工猜测定位失败原因。2026-05-27 再补最小输出/文件审阅 pair：在同一摘要内并列展示当前输出片段与最相关文件，点击仍打开现有输出区和文件变更区；文件侧会说明该文件是否因为失败输出提到而成为当前焦点，仍只消费现有 output / file facts。更完整的 diff / 输出并排审阅和接受 / 回退闭环留到后续按需求迭代。
- **OpenVibeCoding 编程工作台对齐**：2026-05-27 用户复盘指出当前编程界面仍是诊断卡、文件正文、输出与对话混排，尚未解决“编程工作台应该先看可视预览、再从右侧继续对话和修复”的核心问题。后续 UI 主线以 `internal/roadmap/agentui/openvibecoding-code-workbench-alignment.md` 为准：先冻结继续叠卡方向，再把编程模式收敛为中央预览 / 文件 / 变更 / 输出标签 + 右侧对话与可折叠任务进度；Harness 诊断、evidence、inventory、replay 默认进入显式诊断抽屉，不再作为编程首屏主体验。

## 设计约束

1. 不复制 Claude Code、Warp、CodexMonitor 或 Codex TUI 的表面视觉，只借鉴结构模式。
2. 不把过程日志塞回最终回答正文。
3. 不让旧会话恢复阻塞 UI 挂载。
4. 不让 sidebar list、session detail、timeline build、artifact preview 在同一时刻抢主线程和 invoke 通道。
5. 不新增 parallel runtime/event 协议；新增 UI 只消费现有 AgentEvent、timeline、thread_read、artifact、evidence 投影。
