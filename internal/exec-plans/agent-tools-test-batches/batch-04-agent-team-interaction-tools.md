# Batch 04: Agent / Team / 用户交互工具测试计划

## 独立背景

本批次覆盖会创建子代理、向子代理发消息、向用户提问、发送用户消息、进入/退出计划模式、创建/删除 team 的工具。这些工具的结果不是普通 stdout，也不是网页来源；它们更像交互状态和运行时控制事件。测试重点是：状态卡、action_required、A2UI/DecisionPanel、timeline 和最终正文不要互相错位或重复。

当前主线曾出现过程与最终正文错序，本批次要验证交互类工具在“用户确认前、确认后、历史恢复后”都能保持顺序。

## 参考与交接约束

- 外部参考优先级：先看 `/Users/coso/Documents/dev/rust/codex`，再看 `/Users/coso/Documents/dev/js/claudecode`。
- 不确定子代理、用户确认、计划模式、team timeline 或只读历史回显口径时，以 Codex current 行为为准；Codex 与 Claude Code 冲突时默认取 Codex。
- 只参考架构和行为，禁止把具体 session、path、provider、model、tool name 特例硬编码进 Lime。
- 如果需要真实创建 Agent / Team，必须使用安全 fixture，并把创建与清理证据记录到本文件的交付记录里。

## 覆盖工具

- `Agent`
- `SendMessage`
- `AskUserQuestion`
- `SendUserMessage`
- `TeamCreate`
- `TeamDelete`
- `ListPeers`
- `EnterPlanMode`
- `ExitPlanMode`

alias：

- `AgentTool`
- `SendMessageTool`
- `SendInput`
- `SendInputTool`
- `BriefTool`
- `TeamCreateTool`
- `TeamDeleteTool`
- `ListPeersTool`
- `EnterPlanModeTool`
- `ExitPlanModeTool`

## 认领边界

建议认领：

- `src/components/agent/chat/components/MessageList.test.tsx`
- `src/components/agent/chat/components/StreamingRenderer.test.tsx`
- `src/components/agent/chat/components/DecisionPanel.test.tsx`
- `src/components/agent/chat/components/A2UITaskCard*`
- `src/components/agent/chat/projection/agentUiEventProjection.test.ts`
- `src/components/agent/chat/team-workspace-runtime/*.test.ts`

不要修改：

- Web search 来源引用。
- 文件改动卡撤销。

## 必测场景

1. `Agent`：
   - 创建子代理时显示“子任务/Agent launched”过程。
   - metadata 中 agentId / name / description 不丢。
   - 最终正文不应被 Agent 工具结果替换。

2. `SendMessage` / `SendUserMessage`：
   - 消息投递过程可见。
   - 不把被投递的长消息直接混进 assistant 最终正文。
   - 失败时保留错误状态。

3. `AskUserQuestion`：
   - pending 时显示交互卡。
   - 用户提交后变只读回显。
   - 历史会话中不允许再次提交旧 ask。

4. `EnterPlanMode` / `ExitPlanMode`：
   - 计划模式过程不与最终正文重复。
   - ExitPlanMode 之后若产生最终答复，顺序正确。

5. Team 工具：
   - `TeamCreate` 创建状态可见。
   - `ListPeers` 列表结果摘要可见。
   - `TeamDelete` 成功/失败都清晰展示。

## 建议测试入口

```bash
npm test -- "src/components/agent/chat/components/MessageList.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npm test -- "src/components/agent/chat/components/DecisionPanel.test.tsx"
npm test -- "src/components/agent/chat/projection/agentUiEventProjection.test.ts"
npm test -- "src/components/agent/chat/team-workspace-runtime/liveRuntimeProjector.test.ts" "src/components/agent/chat/team-workspace-runtime/runtimeEventSubscriptions.test.ts"
```

Rust 定向：

```bash
cargo test --manifest-path "src-tauri/Cargo.toml" tools::agent_control -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" tools::team_tools -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" tools::ask -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" tools::plan_mode_tool -- --nocapture
```

## GUI 验证

优先用安全的 mock / fixture 对话，不要真实创建大量子代理。若必须真实验证：

1. 新建会话。
2. 触发一个需要用户确认的任务。
3. 验证 ask/decision 卡显示、提交、只读回显。
4. 如有 Agent/Team 工具调用，验证过程卡与最终正文顺序。
5. 检查控制台 error / warning。

## 交付记录模板

```md
## Batch 04 结果

- 进程/认领人：
- 覆盖工具：
- 交互卡证据：
- Agent / Team 证据：
- 历史只读回显证据：
- 控制台状态：
- 发现问题：
- 下一刀：
```
