---
title: Codex 对话兼容 PRD
status: active
owner: app-server-runtime
updated: 2026-07-15
---

# Codex 对话兼容 PRD

## 用户问题

用户在 Codex 中已经积累真实工程对话。Lime 需要完整读取这些历史，并允许用户在同一
会话上下文里继续工作。当前实现把历史工具先转成 imported runtime event，再映射成
generic tool 卡，导致命令名称、参数、输出和 Item 类型失真；“导入的命令记录”也把历史
与实时工具割裂成两套产品语义。

## 产品目标

1. 自动发现或手动选择 Codex home，按项目、时间、归档状态筛选对话。
2. 导入前预览用户/助手消息、reasoning、command、file change、tool、MCP、web search、
   plan、approval、subagent 与附件。
3. 用户确认后，把来源 rollout 重建为 Lime canonical Thread / Turn / Item 历史。
4. 导入会话可以立即继续；新 turn 使用 Lime 当前模型与权限，但继承有效 cwd/workspace。
5. 新 turn 的 tool call 使用普通会话同一执行器、审批、sandbox、持久化和 GUI。
6. evidence/replay/read model 从 canonical history 读取，不依赖外部 source 继续存在。

## 非目标

1. 不写回、移动、归档或删除 Codex source。
2. 不重新执行历史 command、patch、MCP 或其他 tool。
3. 不维护与 Codex 双向同步。
4. 不为未知来源预建 importer 抽象；当前只实现 Codex。
5. 不复刻 Codex TUI 布局；只复用其数据语义和生命周期。

## 核心体验

### 发现与预览

- 入口位于现有会话侧栏。
- 列表显示用户可理解的标题、时间、cwd 和归档状态。
- 预览明确列出将导入的 Thread/Turn/Item 数量及 unsupported item。
- source path、raw payload 和 thread id 只在诊断层展示，不进入普通消息正文。

### 导入与阅读

- 导入成功后直接打开新会话。
- 历史消息、命令、工具、patch、搜索、reasoning 按真实时序出现。
- command/tool 卡与 Lime 新对话中的 command/tool 卡完全一致，不显示“导入的命令记录”。
- 来源只作为会话 provenance，不改变工具卡名称、状态、分组或默认展开逻辑。

### 继续工作

- 输入框立即可用。
- follow-up 进入 `agentSession/turn/start`。
- 当模型调用 shell、patch、MCP 或其他工具时，用户看到普通的审批和执行过程。
- 历史 tool id 不与新 turn tool id 冲突；历史 item 永不进入 pending approval/execution queue。

## 安全与数据边界

- Source reader 只允许 state DB、session index、sessions 和 archived sessions 下的 rollout。
- 明确拒绝 auth、credentials、config secret、任意 source-root escape 和 symlink escape。
- 大输出写入 Lime session-scoped sidecar，read model 只返回 bounded preview + output ref。
- 导入删除只删除 Lime session 数据；外部 Codex 文件保持不变。
- 生产 renderer、Electron 与 App Server 不允许 mock fallback。

## 验收

1. 真实 Codex 小样本和大样本导入后，canonical item 类型、顺序、id、状态与内容正确。
2. 历史 command 的 command/cwd/output/exit code 可见，且没有重新执行痕迹。
3. 导入后 follow-up 可触发真实 tool-runtime command/tool，并得到 terminal item。
4. 同一 source 重复导入幂等，replace 后无旧数据残留。
5. Gate B trace 包含 Electron IPC 与 `conversationImport/*`、`agentSession/read`、
   `agentSession/turn/start`；console error 与未知 method 为零。
6. macOS 和 Windows 路径规则有定向测试；用户可见文案覆盖五语言。
