# Batch 02: Shell 与后台任务工具测试计划

## 独立背景

本批次覆盖会产生命令输出、后台任务、长时间运行和进程控制的工具。它们最容易把 stdout / stderr / status update 与最终正文串在一起，因此必须单独验证过程折叠、输出摘要和正文顺序。

当前主线问题是 Agent Chat 对 `contentParts` 的合并和完成态 reconcile 曾改变工具过程相对正文的位置。本批次要证明 shell / background 工具不会再次出现“最终正文在命令过程前面”或“命令输出切碎最终回答”的问题。

## 参考与交接约束

- 外部参考优先级：先看 `/Users/coso/Documents/dev/rust/codex`，再看 `/Users/coso/Documents/dev/js/claudecode`。
- 不确定命令过程、后台任务输出、运行中状态或折叠摘要口径时，以 Codex current 行为为准；Codex 与 Claude Code 冲突时默认取 Codex。
- 只参考架构和行为，禁止把具体 session、path、provider、model、tool name 特例硬编码进 Lime。
- 本批次只覆盖后台执行输出控制；结构化任务板 `TaskCreate/List/Get/Update` 归 Batch 07，不在这里夹写。

## 覆盖工具

- `Bash`
- `PowerShell`
- `TaskOutput`
- `TaskStop`
- `Sleep`

兼容 alias：

- `Shell`
- `exec_command`
- `shell_command`
- `local_shell_call`
- `developer__shell`
- `mcp__system__shell`
- `TaskOutputTool`
- `AgentOutputTool`
- `BashOutputTool`
- `TaskStopTool`
- `KillShell`
- `PowerShellTool`
- `SleepTool`

## 认领边界

建议认领：

- `src/components/agent/chat/components/StreamingRenderer.test.tsx`
- `src/components/agent/chat/components/MessageList.test.tsx`
- `src/components/agent/chat/utils/toolBatchGrouping.ts`
- `src/components/agent/chat/utils/toolBatchGrouping.test.ts`
- `src/components/agent/chat/utils/toolProcessSummary.ts`

不要修改：

- 文件变更卡逻辑，除非命令输出里带 file change metadata 并直接阻塞本批次。
- web search / browser 来源引用逻辑。

## 必测场景

1. 单条 `Bash`：
   - `text -> Bash(completed) -> text`
   - 展示为“已运行 1 条命令”或等价过程摘要。
   - 展开后保留 command、cwd、exit_code、stdout/stderr 摘要。

2. 连续多条 `Bash`：
   - 相邻命令折叠为同一过程组。
   - 中间出现正文时必须 flush，不跨正文合并。

3. `Bash` 失败：
   - 失败状态可见。
   - 错误摘要不把大段 stderr 当作最终正文。
   - 后续最终正文仍显示在失败过程之后。

4. 后台任务：
   - `Bash` 返回 `task_id/output_file` 后，`TaskOutput` 查询状态应展示为同一运行过程或清晰后续过程。
   - `TaskStop` 成功/失败都要有明确状态。

5. `PowerShell`：
   - 非 Windows 环境可只测分类和历史渲染 fixture。
   - Windows 环境补实际执行 smoke。

6. `Sleep`：
   - 运行中状态不应长期占据最终正文区域。
   - 完成后不留下空过程块。

## 建议测试入口

```bash
npm test -- "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npm test -- "src/components/agent/chat/components/MessageList.test.tsx"
npm test -- "src/components/agent/chat/utils/toolBatchGrouping.test.ts"
```

Rust 定向：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" tools::bash -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" tools::task_output_tool -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" tools::task_stop_tool -- --nocapture
```

## GUI 验证

优先验证已有 code runtime 会话或新建安全 fixture：

1. 运行只读命令，例如 `pwd`、`ls`、`rg --files | head`。
2. 确认页面展示命令过程摘要。
3. 确认最终回答位于命令过程之后。
4. 展开过程组，检查命令参数和输出摘要。
5. 检查控制台 error / warning。

不要在真实项目里跑 destructive 命令。

## 交付记录模板

```md
## Batch 02 结果

- 进程/认领人：
- 覆盖工具：
- 命令输出顺序证据：
- 后台任务证据：
- GUI 证据：
- 控制台状态：
- 发现问题：
- 下一刀：
```
