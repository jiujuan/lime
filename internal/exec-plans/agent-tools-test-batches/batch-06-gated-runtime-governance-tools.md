# Batch 06: Gated Runtime / Governance 工具测试计划

## 独立背景

本批次覆盖受环境变量、平台、callback 或运行时状态控制的工具。它们不一定在所有机器上注册，但仍可能进入历史 timeline 或 MCP / provider 输出。测试重点不是强行启用所有高风险能力，而是证明 gated 工具注册、缺席、历史显示、错误提示和 GUI 展示都可解释。

这些工具如果只按默认环境测试，很容易漏掉；如果盲目真实执行，又可能造成高风险操作。因此本批次必须以“注册事实源 + 结构化 fixture + 最小安全 smoke”为主。

## 参考与交接约束

- 外部参考优先级：先看 `/Users/coso/Documents/dev/rust/codex`，再看 `/Users/coso/Documents/dev/js/claudecode`。
- 不确定 gate、权限、环境变量、callback 缺席、历史 unknown tool 展示或治理口径时，以 Codex current 行为为准；Codex 与 Claude Code 冲突时默认取 Codex。
- 只参考架构和行为，禁止把具体 session、path、provider、model、tool name 特例硬编码进 Lime。
- 高风险能力只测注册、缺席、fixture 和错误展示；不要为了 GUI 证据真实触发危险 side effect。

## 覆盖工具

gated native：

- `Config`
- `CronCreate`
- `CronList`
- `CronDelete`
- `RemoteTrigger`
- `Sleep`
- `PowerShell`

runtime / platform / callback：

- `EnterWorktree`
- `ExitWorktree`
- `LSP`

注意：`Sleep` 与 `PowerShell` 也在 Batch 02 覆盖运行展示；本批次只覆盖 gate / 注册 / 缺席路径。

## 认领边界

建议认领：

- `src-tauri/crates/aster-rust/crates/aster/src/tools/mod.rs`
- `src-tauri/crates/aster-rust/crates/aster/src/tools/registry.rs`
- `src-tauri/crates/aster-rust/crates/aster/src/tools/config_tool.rs`
- `src-tauri/crates/aster-rust/crates/aster/src/tools/cron_tools.rs`
- `src-tauri/crates/aster-rust/crates/aster/src/tools/remote_trigger_tool.rs`
- `src-tauri/crates/aster-rust/crates/aster/src/tools/worktree_tools.rs`
- `src-tauri/crates/aster-rust/crates/aster/src/tools/lsp.rs`
- `src/components/agent/chat/utils/toolDisplayInfo.ts`
- `src/components/agent/chat/components/MessageList.test.tsx`

不要修改：

- GUI 视觉细节。
- Web search 源引用。
- 文件撤销链路。

## 必测场景

1. 注册 gate：
   - 默认环境下哪些工具不注册。
   - 设置对应 env 后哪些工具注册。
   - Windows-only `PowerShell` 在非 Windows 的缺席行为明确。

2. 历史 timeline：
   - 即使当前环境未注册，历史里出现 `Config/Cron/RemoteTrigger/LSP/EnterWorktree` 也能展示为 generic 或明确工具过程。
   - 不应因为 unknown tool name 崩溃或丢失最终正文。

3. `Config`：
   - 只用 fixture 或 Rust 单测，不在真实用户配置上写入。
   - 参数和结果摘要可读。

4. `Cron*`：
   - `CronList` 只读优先。
   - `CronCreate/Delete` 使用 mock scheduler。
   - GUI 不显示危险操作已真实执行，除非后端确实返回成功。

5. `RemoteTrigger`：
   - gate 关闭时不出现可调用工具。
   - 历史失败结果有清晰错误。

6. `EnterWorktree/ExitWorktree`：
   - worktree 状态切换过程可见。
   - 不把路径状态混入最终正文。

7. `LSP`：
   - callback 缺失时不注册。
   - 历史 LSP hover/definition/diagnostic 结果可读。

## 建议测试入口

```bash
cargo test --manifest-path "src-tauri/Cargo.toml" tools:: -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" current_surface_tool_gates -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" tools::cron_tools -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" tools::remote_trigger_tool -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" tools::worktree_tools -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" tools::lsp -- --nocapture
```

前端：

```bash
npm test -- "src/components/agent/chat/components/MessageList.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npm test -- "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts"
```

## GUI 验证

不建议真实创建 cron 或 remote trigger。GUI 验证以历史 fixture 或 mock timeline 为主：

1. 构造或打开包含 gated tool 的历史会话。
2. 验证工具过程显示、最终正文顺序和错误摘要。
3. 检查控制台 error / warning。

## 交付记录模板

```md
## Batch 06 结果

- 进程/认领人：
- 覆盖工具：
- gate 注册证据：
- 历史展示证据：
- GUI 证据：
- 控制台状态：
- 发现问题：
- 下一刀：
```

## Batch 06 结果

- 进程/认领人：当前 Codex 进程，窄写集限定在 gated runtime/governance 工具注册测试、历史展示测试与本批次文档。
- 覆盖工具：`ConfigTool`、`CronCreateTool`、`CronDeleteTool`、`RemoteTriggerTool`、`EnterWorktreeTool`、`ExitWorktreeTool`、`LSPTool`，Rust gate 矩阵覆盖 `Config`、`Sleep`、`Cron`、`RemoteTrigger`、`Workflow`、`PowerShell`。
- 参考查证：Codex current 路径确认 gated 工具是否暴露由统一 tool spec / plan 决定，历史 item 渲染不能依赖当前工具仍注册；Claude Code 参考确认应按真实 `tool_result` / block shape 渲染，不能把 summary 当事实源。
- gate 注册证据：
  - `current_surface_tool_gates_from_env_map` 新增完整 env-map 矩阵，默认关闭高风险 gated 工具。
  - `USER_TYPE=ant` 只打开 `Config`；`PROACTIVE=true` 或 `KAIROS=true` 打开 `Sleep`；`AGENT_TRIGGERS=true` 打开 Cron gate；`AGENT_TRIGGERS_REMOTE=true` 打开 `RemoteTrigger`；`WORKFLOW_SCRIPTS=true` 打开 `Workflow`。
  - `PowerShell` 只在 Windows gate 下默认打开，`0/false/no/off` 明确关闭；非 Windows 即使 env truthy 也不打开。
  - Cron 注册新增“gate 已开但 scheduler 缺席仍不注册”的保护，避免把高风险触发器暴露成假入口。
- 历史展示证据：
  - `toolProcessSummary.test.ts` 新增 gated runtime 历史摘要测试，证明 `CronCreate/CronDelete` 主体不丢，`RemoteTrigger/LSP` 协议错误会去掉 `-32603/-32002`。
  - `ToolCallDisplay.toolSearchActions.test.tsx` 新增历史 gated runtime 工具列表 fixture，证明当前环境即使未注册这些工具，历史 timeline 仍显示可读紧凑行，不泄露 `trigger_id/operation` raw JSON。
- GUI 证据：本轮未做真实 GUI / Playwright 续测。原因是本批次主要验证高风险 gated 工具的注册事实源与历史 fixture，不应真实创建 cron、remote trigger 或写用户配置；此前环境仍存在 DevBridge / 端口 / profile 阻塞，待后续统一 GUI smoke。
- 控制台状态：未进入浏览器页面，因此无新增控制台证据。
- 已执行验证：
  - `npm test -- "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/components/ToolCallDisplay.toolSearchActions.test.tsx" "src/components/agent/chat/utils/toolDisplayInfo.test.ts"`：3 files / 31 tests passed。
  - `npx eslint "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/components/ToolCallDisplay.toolSearchActions.test.tsx"`：passed。
- Rust 验证状态：
  - `cargo test --manifest-path "src-tauri/Cargo.toml" current_surface_tool_gates -- --nocapture`：退出码 0，但输出为 `running 0 tests`，筛选未命中有效测试，不能记为 Rust 通过证据。
  - `cargo test --manifest-path "src-tauri/Cargo.toml" register_all_tools_with_cron_gate_without_scheduler -- --nocapture`：退出码 0，但输出为 `running 0 tests`，筛选未命中有效测试，不能记为 Rust 通过证据。
  - 后续若要补有效 Rust 证据，应先确认目标测试所在 workspace / package，再使用能命中的 `-p ... <filter>` 入口；不要把 `0 tests` 当成通过。
- 发现问题：
  - 组件列表层使用紧凑 headline，如 `已调整配置`、`已创建 daily-summary`，而 helper 层使用完整过程摘要，如 `已更新运行配置`；两层属于不同展示职责，测试已分别固定。
  - 当前 Rust 定向测试不适合并行启动，后续批次应串行执行 Cargo 测试，避免在已有外部构建时放大锁等待。
- 下一刀：
  - 等 Rust 定向测试返回后补记结果。
  - 下一批继续覆盖非 gated 的长尾工具，但仍按“注册事实源 + 历史 fixture + 定向单测”推进，避免真实执行高风险 side effect。
