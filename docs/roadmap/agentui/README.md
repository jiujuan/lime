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

| 文档 | 作用 |
| --- | --- |
| [agent-ui-research-and-lime-direction.md](agent-ui-research-and-lime-direction.md) | 竞品与本地参考调研，说明为什么 Lime 要走“对话 + 过程 + 任务 + 产物 + 证据”路线。 |
| [lime-agentui-target-architecture.md](lime-agentui-target-architecture.md) | 目标 UI 架构图与五层模型，是后续 UI 改造的总图。 |
| [lime-agentui-code-map.md](lime-agentui-code-map.md) | Lime 当前代码层级地图，标出前端、协议、后端、服务和测试入口。 |
| [lime-agentui-event-flow.md](lime-agentui-event-flow.md) | 关键流程图，包括发送消息、旧会话恢复、queue/steer、权限、artifact、evidence。 |
| [lime-agentui-sequence-diagrams.md](lime-agentui-sequence-diagrams.md) | 端到端时序图，适合实现和排查首字慢、恢复慢、流式错乱。 |
| [lime-agentui-backend-coordination.md](lime-agentui-backend-coordination.md) | 后端配合代码架构，定义 UI 需要后端继续补齐的投影、分页、指标与批量接口。 |
| [lime-agentui-implementation-roadmap.md](lime-agentui-implementation-roadmap.md) | P0/P1/P2/P3 落地顺序、验收标准和验证命令。 |
| [conversation-projection-architecture.md](conversation-projection-architecture.md) | Warp 对齐的对话投影架构，声明 AgentUI 只做 UI projection，不新增 runtime fact source。 |
| [conversation-projection-fact-map.md](conversation-projection-fact-map.md) | 对话状态事实源地图，标明 owner、writer、readers、persistence、runtime fact source 与 projection-only 边界。 |
| [conversation-projection-implementation-plan.md](conversation-projection-implementation-plan.md) | 对话主链瘦身的分阶段实施计划，顺序为事实源盘点、Projection Store、controller、selector、UI。 |
| [conversation-projection-acceptance.md](conversation-projection-acceptance.md) | 对话投影改造的固定验收场景、性能指标、Playwright 续测口径和完成判定。 |
| [lime-agentui-standard-alignment.md](lime-agentui-standard-alignment.md) | AgentUI 标准全流程 taxonomy 与 Lime 当前实现差距，固定 current / compat / deprecated / dead 分类和下一刀。 |
| [responsive-chat-ttft-sample-matrix-20260512.md](responsive-chat-ttft-sample-matrix-20260512.md) | `responsive_chat_auto` 的真实 TTFT 样本矩阵、completion gate 与 fallback-only 证据。 |
| [completion-audit-20260512.md](completion-audit-20260512.md) | AgentUI TTFT 完整目标 completion audit，逐项映射 prompt 要求、artifact、验证证据与可选优化。 |

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
- **编程底座自然触发**：普通自然语言编程请求应直接进入 `code_orchestrated` runtime；`@代码` 只是 catalog 快捷入口，不拥有独立 parser、protocol 或 workspace。2026-05-26 已用 `smoke:agent-runtime-tool-surface-page` 与 `verify:gui-smoke` 验证自然语言输入会提交 `agent_runtime_submit_turn`，并在 Harness 中展示编程底座、流式文件写入、测试输出、权限确认、代码 diff 概览、文件活动和本轮文件变更处理；同一 smoke 已覆盖 GUI 点击“允许并继续”并断言回写统一 `agent_runtime_respond_action`，也覆盖“全选变更 -> 标记已应用”的文件处理状态更新，以及从文件变更处理区打开文件快照、查看快照 diff、点击“恢复此快照 -> 确认恢复”并断言回写 `agent_runtime_restore_file_checkpoint`。页面 smoke 还断言普通自然语言编程请求创建新会话时提交 `executionStrategy: code_orchestrated`，请求正文不带 `@代码`，且 request metadata 不写 `harness.code_command`；运行中继续输入第二条自然语言时，仍提交到同一 `code_orchestrated` session，带 `queue_if_busy: true`，并在输入区队列面板投影后续需求。页面 smoke 现在还要求 Runtime 能力摘要显示 WebSearch、子任务、Team 与 Task current surface 全部已接通，不再把这些缺口当成功标准。
- **联网不降级底座**：输入层只透传用户选择的 `webSearch` 偏好，不再因为联网搜索开启就把 `auto` / `code_orchestrated` 执行策略改写成 `react`；联网能力由 runtime tool policy 决定，避免“带搜索的编程任务”绕开编程底座。
- **GUI gate 状态**：2026-05-27 复跑 `npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 时，现有前端进程存在但 `127.0.0.1:3030` 无 DevBridge 监听，健康检查超时；随后复跑 `npm run verify:gui-smoke -- --timeout-ms 600000`，脚本从空端口重新拉起 headless Tauri，前置依赖下载和独立 target 冷构建持续约 40 分钟，期间多条并行 `cargo test` / `tauri dev` 争用 package cache 与编译资源，最终仍在 DevBridge 健康检查阶段超时，未进入页面断言阶段。2026-05-27 继续复测时，`127.0.0.1:1420` 与 `127.0.0.1:3030` 均无监听，`npm run bridge:health -- --timeout-ms 120000` 与 `npm run bridge:health -- --timeout-ms 300000` 均以 `fetch failed` 超时；同时仍有旧 `tauri.js dev` 的 `cargo run` 和并行 Rust 定向测试在编译。当前本轮已复验 `node --check "scripts/agent-runtime-tool-surface-page-smoke.mjs"`、目标 `git diff --check`、`npm test -- "src/components/agent/chat/components/Inputbar/index.test.tsx"` 通过；完整 GUI gate 仍不能宣称通过，需在无并行 Cargo / Tauri 编译干扰、DevBridge 可监听 3030 后重跑。

## 设计约束

1. 不复制 Claude Code、Warp、CodexMonitor 或 Codex TUI 的表面视觉，只借鉴结构模式。
2. 不把过程日志塞回最终回答正文。
3. 不让旧会话恢复阻塞 UI 挂载。
4. 不让 sidebar list、session detail、timeline build、artifact preview 在同一时刻抢主线程和 invoke 通道。
5. 不新增 parallel runtime/event 协议；新增 UI 只消费现有 AgentEvent、timeline、thread_read、artifact、evidence 投影。
