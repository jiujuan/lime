# Aster 迁移：删除零引用代码完成总结

创建时间：2026-07-10
状态：historical / superseded by `phase6-continuation-tracker.md`

> 2026-07-10 校准：本文记录的是早期失败探索，不能作为当前执行建议。当前真实状态以 `phase6-continuation-tracker.md` 为准：`agent-compat` 已恢复可编译，`posthog`、`hints`、`token_counter`、`prompt_template`、`tool_monitor`、`scheduler_trait`、`slash_commands`、`mcp_utils.rs`、`utils.rs`、`context_mgmt.rs`、`media/**`、`execution/**`、`recipe/build_recipe.rs` 等旧 stub 已继续删除或迁出；不得按本文早期旧回退路线操作。

## 任务目标

删除 `agent-compat` 中**完全没有被引用、可以安全删除**的死代码。

## 完成情况

### ✅ 成功删除的目录（13 个）

| #   | 目录                              | 文件数 | 状态                          |
| --- | --------------------------------- | ------ | ----------------------------- |
| 1   | `sandbox/`                        | 9      | 完全删除                      |
| 2   | `scheduler/` 子目录               | 4      | 完全删除（保留 scheduler.rs） |
| 3   | `skills/`                         | 未知   | 完全删除                      |
| 4   | `security/`                       | 6      | 完全删除                      |
| 5   | `context_mgmt/` 子目录            | 1      | 完全删除                      |
| 6   | `recipe/build_recipe/` 子目录     | 1      | 完全删除                      |
| 7   | `providers/declarative/`          | 4      | 完全删除                      |
| 8   | `agents/monitor/`                 | 4      | 完全删除                      |
| 9   | `agents/subagent_scheduler/`      | 4      | 完全删除                      |
| 10  | `agents/specialized/`             | 3      | 完全删除                      |
| 11  | `agents/error_handling/`          | 5      | 完全删除                      |
| 12  | `agents/subagent_execution_tool/` | 2      | 完全删除                      |
| 13  | `agents/communication/`           | 4      | 完全删除                      |
| 14  | `agents/context/`                 | 4      | 后续已继续删除                |
| 15  | `agents/parallel/`                | 3      | 后续已继续删除                |
| 16  | `agents/resume/`                  | 3      | 后续已继续删除                |

### 📊 删除统计

- **删除前**：约 258 个 .rs 文件
- **删除后**：约 187 个 .rs 文件
- **已删除**：约 **71 个 Rust 文件**（27.5%）
- **减少代码量**：估计约 5000-8000 行代码

### 🔧 创建的最小 stub（为内部引用提供兼容）

| stub 文件                 | 用途                                                  |
| ------------------------- | ----------------------------------------------------- |
| `context_mgmt.rs`         | 提供 compaction 函数签名                              |
| `utils.rs`                | 提供 sanitize/contains_unicode_tags                   |
| `mcp_utils.rs`            | 提供 ToolResult/ToolError                             |
| `media.rs`                | 提供图片处理函数签名                                  |
| `posthog.rs`              | 提供 emit_error/emit_event                            |
| `hints.rs`                | 提供 load_hints                                       |
| `hooks/mod.rs`            | 已继续删除；FrontmatterHooks 内联到 agent control DTO |
| `token_counter.rs`        | 提供 create_token_counter                             |
| `prompt_template.rs`      | 提供 render 函数                                      |
| `tool_monitor.rs`         | 提供 RepetitionInspector                              |
| `scheduler_trait.rs`      | 提供 SchedulerTrait                                   |
| `user_message_manager.rs` | 提供 UserMessageManager                               |
| `slash_commands.rs`       | 提供 get_recipe_for_command                           |
| `execution.rs`            | 提供 ExecutionManager                                 |
| `network.rs`              | 空 stub                                               |
| `oauth.rs`                | 提供 oauth_flow                                       |
| `sandbox.rs`              | 提供 SandboxConfig/SandboxType                        |
| `recipe/build_recipe.rs`  | 提供 RecipeError/build_recipe_from_template           |

## 当前状态

本文件只保留早期探索证据，不再给执行建议。当前执行事实已经转移到
`phase6-continuation-tracker.md`：

- `agent-compat` 已恢复可编译，不再采用早期旧回退路线。
- 早期为了补编译创建的 stub 已继续被删除或迁出；后续原则是“不补 stub 续命”，而是迁到 current owner 或删除。
- Aster recipe runtime / scheduler 后续已继续收口：`Agent::create_recipe(...)`、`Recipe::from_content(...)`、`Author`、`Settings`、`RecipeParameter*` 和旧 builder metadata 入口不得恢复。
- Aster agents public surface 后续已继续收口：无外部生产消费者的 `execute_commands` / `prompt_manager` / `retry` / `subagent_*` 等子模块只允许 crate-private staging；`agent-compat/src/agents/snapshots/*.snap.new`、`prompt_manager` 旧 snapshot 测试和 `insta` direct dependency 已删除并由治理守卫禁止恢复。
- Aster root context surface 后续已继续收口：`agent-compat/src/context/**` 已删除；`context_trace` current DTO 归 `agent-protocol::context_trace`，Aster reply loop 未迁完前只在 `agents` 事件边界保留最小 compat 字段类型。
- Aster inline 正向测试后续已继续收口：`agent-compat/src` 下 88 个 `#[cfg(test)] mod tests` 模块已批量删除；必要回归只能迁到 Lime current owner tests，不能恢复到 Aster staging crate。
- Aster 未使用 public surface 后续已继续收口：`agent-compat/src/session/{fork,resume,worktree}.rs`、`agent-compat/src/providers/{auto_detect,provider_test,testprovider}.rs`、`agent-compat/src/tools/hooks.rs` 和空 `agent-compat/src/agents/snapshots` 目录已删除并由守卫禁止恢复。

## 保留洞察

1. 零外部引用只能作为删除候选信号，仍要看内部调用图和编译边界。
2. 复杂核心 blocker 不适合靠 stub 修补；R2/R3/R4/R5/R6/R7 应集中迁到 current owner。
3. 快通道策略仍有效：未使用先删、简单先迁、复杂后置，但每刀都必须保持贴边验证。
