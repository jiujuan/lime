## Lime v1.71.0

### 新功能
- 新增 Codex 对话导入主链：侧边栏可扫描 Codex 会话、预览 rollout 内容、经用户确认后导入为 Lime 会话，并保留 source provenance。
- 新增 `conversationImport/thread/preview` 与 `conversationImport/thread/commit` App Server JSON-RPC 能力，导入前可 dry-run 估算将写入的消息、turn、附件和 timeline item。
- Codex 导入支持当前 `state_*.sqlite` metadata、archived sessions、stale rollout path 修复、`.jsonl.zst` 压缩 rollout 读取，以及 Codex 图片附件映射。
- 导入后的会话进入 `agentSession/read` / `evidence/export` current 主链，并可在同一 Lime session 中继续发起新 turn。

### 修复
- 修复 Codex 导入重复提交会重复创建 Lime 会话的问题；同一 source thread 在同一 RuntimeCore 进程内会复用既有导入 session。
- 修复导入成功后会话页只能看到正文、无法还原工具 / 命令 / 补丁 / 审批 / web search 细节的问题。
- 修复导入续聊时 runtime options 丢失源项目 cwd、model、reasoning、approval、sandbox、memory 等上下文的问题。
- 修复侧边栏项目范围会话列表和导入入口在 remembered project 场景下无法稳定归属的问题。

### 优化与重构
- `conversation_import` runtime 拆分为 Codex parser、路径修复、media、dry-run、commit events、import status 等子模块，避免中心文件继续膨胀。
- RuntimeCore 新增 imported session timeline projection，把导入 runtime events 聚合为 GUI 可消费的 `detail.items`。
- App Sidebar 导入流程抽到独立弹窗和空态组件，侧边栏只保留薄接线。
- Conversation import 协议、schema、npm client、前端 API shape guard 与治理脚本同步收敛到 current App Server 事实源。

### 测试与质量
- 新增真实 Codex content-studio dogfood smoke，覆盖未确认 commit 拒绝、preview / confirmed commit、重复导入复用、dry-run summary、附件和 provenance。
- 新增 Electron continuation fixture，验证导入 session 经真实 preload bridge 读取、展示 imported timeline，并在同一 session 续聊。
- 新增 Electron click-through fixture，从侧边栏导入弹窗开始，确认导入、进入会话页、检查导入细节，再通过真实输入框发送 follow-up。
- 扩展 Rust conversation import、evidence export、runtime item projection、App Server protocol schema、app-server-client、侧边栏和 Agent Chat 历史恢复回归。
- 根应用、Rust workspace、CLI npm package、App Server client package、Agent Runtime client 依赖、pnpm lock 与 Cargo lock 版本统一更新到 `1.71.0`。

### 文档
- 新增 Codex 对话导入 PRD，明确 Codex-first、Claude Code importer 扩展点、canonical import bundle、dry-run、fidelity summary 和 provenance 口径。
- 新增 Codex 对话导入实施问题跟踪，记录从 scan / preview 到 commit / evidence / 续聊 / 点击式 GUI fixture 的闭环状态。
- 更新 Agent Workspace roadmap，补充 artifacts evidence 与 run observability 对导入 timeline / provenance 的后续使用口径。

### 其他
- 本版继续把外部 Agent 客户端历史资产收敛到 Lime `SessionDetail`、Agent Runtime events、Evidence Export 和 Electron Desktop Host current 链路；Codex 原始目录保持只读，不新增 renderer 本地扫描或第二套 transcript store。

**完整变更**: `v1.70.0` -> `v1.71.0`
