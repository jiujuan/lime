# Phase 2 阻塞点分析

生成时间：2026-07-04  
状态：blocking_analysis

## 当前状态

**✅ Phase 1 完成**：三个 Lime-owned trait 已定义（SessionRepository, TurnExecutor, ProviderRouter）

**🔄 Phase 2 进行中**：`lime-agent` 仍有 185 行 Aster import（非 adapter 文件）

## 剩余 Aster 依赖分类

### 类别 1：核心执行引擎（高优先级，需要重构）

**`runtime_facade.rs`**（7 个 import）
- 暴露 `aster::agents::NativeToolExecutionHook` 等公共接口
- 暴露 `aster::tools::*` 类型
- `current_turn_context()` / `with_turn_context()` 调用 Aster session_context
- **解决方案**：实现 `agent-runtime::TurnExecutor` trait，Aster 调用下沉到内部

**`turn_execution.rs`**
- 核心 turn 执行逻辑
- **解决方案**：改为使用 `agent-runtime::TurnExecutor` trait

**`runtime_queue.rs`**
- 依赖 Aster queue 机制
- **解决方案**：改为使用 `agent-runtime` 的 queue 抽象

### 类别 2：Provider 相关（中优先级）

**`provider_safety.rs`**（12 个 import）
- 实现 Aster `Provider` trait
- 依赖 `aster::model::ModelConfig`
- 依赖 `aster::conversation::Conversation`
- **解决方案**：实现 `model-provider::ProviderRouter` trait

**`credential_bridge.rs`**（3 个 import）
- 调用 `aster::providers::create`
- 依赖 `aster::model::ModelConfig`
- **解决方案**：改为调用 `model-provider` 的 provider factory

### 类别 3：Tool 相关（中优先级）

**`agent_tools/tool_orchestrator.rs`**
**`agent_tools/tool_policy_inspector.rs`**
**`agent_tools/inventory.rs`**
- 依赖 Aster tool 类型和 execution hook
- **解决方案**：改为使用 `tool-runtime` 的 tool 抽象

**`lsp_bridge.rs`**（2 个 import）
- 依赖 `aster::tools::lsp::Location`
- **解决方案**：迁移到 `tool-runtime` 或定义 Lime-owned LSP DTO

**`mcp_bridge.rs`**
- 依赖 Aster MCP 类型
- **解决方案**：改为使用 `tool-runtime::mcp_notification` 等

### 类别 4：Session 相关（已部分迁移）

**`session_configuration.rs`**
- 依赖 `aster::agents::SessionConfig`
- **解决方案**：定义 Lime-owned SessionConfig DTO

**`session_store.rs`**
**`session_store_runtime_detail.rs`**
**`session_store_subagent_context.rs`**
**`session_query.rs`**
- 已有 `thread-store::SessionRepository`，但仍调用 Aster session API
- **解决方案**：改为使用 `thread-store` 接口

**`aster_session_store/**` 子模块（5 个文件）
- `history_search.rs`, `legacy_conversation.rs`, `memory_stub.rs`, `runtime_conversation.rs`, `session_projection.rs`
- 这些是 compat adapter，允许保留 Aster import
- **分类**：`compat`，不阻塞 Phase 2

### 类别 5：Subagent 相关（低优先级）

**`subagent_scheduler.rs`**（3 个 import）
- 依赖 `aster::agents::subagent_scheduler`
- **解决方案**：改为使用 `agent-runtime::TurnExecutor::queue_subagent`

**`subagent_profiles.rs`**（3 个 import）
- 依赖 Aster session extension data
- **解决方案**：改为使用 `thread-store` 的 metadata

**`subagent_control.rs`**
- 已有投影逻辑，但仍依赖 Aster
- **解决方案**：进一步收敛到 adapter

### 类别 6：Skill 相关（低优先级）

**`skill_execution.rs`**（2 个 import）
**`tools/skill_search_tool.rs`**
**`tools/skill_tool_gate.rs`**
- 依赖 Aster skill 类型
- **解决方案**：定义 Lime-owned skill DTO

### 类别 7：其他工具（低优先级）

**`tools/apply_patch_tool.rs`**
**`tools/browser_tool.rs`**
**`native_tools/image_tasks.rs`**
**`native_tools/memory_store.rs`**
- 特定工具实现依赖 Aster
- **解决方案**：改为使用 `tool-runtime` 接口

**`ask_bridge.rs`**
- 依赖 Aster `AskCallback`
- **解决方案**：定义 Lime-owned callback trait（`agent-runtime::ask` 已有部分）

**`direct_text_generation.rs`**
**`turn_context_configuration.rs`**
- 依赖 Aster turn context
- **解决方案**：已有 `agent-protocol::turn_context`，继续迁移

### 类别 8：测试文件（允许保留）

**`agent_tools/execution/tests.rs`**
**`agent_tools/tool_orchestrator/tests.rs`**
**`request_tool_policy/tests/**`**
**`session_store_tests.rs`**
- 测试 fixture 可以继续使用 Aster 构造
- **分类**：`test-only`，不阻塞 Phase 2

## Phase 2 快速收口策略

### 优先级 1：移除 public API 的 Aster 暴露（必须）

**目标文件**：
1. `runtime_facade.rs` → 删除 `pub use aster::*` 导出
2. `provider_safety.rs` → 改为内部 adapter
3. `credential_bridge.rs` → 改为调用 `model-provider`

**预期结果**：App Server 和其他 current crate 不再看到 Aster 公共类型

### 优先级 2：核心执行引擎下沉（阻塞依赖移除）

**目标文件**：
1. `turn_execution.rs` → 改为使用 `TurnExecutor` trait
2. `runtime_queue.rs` → 改为使用 `agent-runtime` queue
3. `session_configuration.rs` → 定义 Lime SessionConfig

**预期结果**：execution 逻辑不再直接调用 Aster API

### 优先级 3：允许的 compat adapter（不阻塞）

**允许保留 Aster import 的文件**：
- `aster_session_store/**`（已是 compat adapter）
- `*adapter*.rs`（显式标记的 adapter）
- `event_converter.rs`（compat 大文件，已瘦身）
- `*tests.rs`（测试 fixture）

**条件**：这些文件不得暴露 Aster 类型到 public API

## 可执行的下一步

### 方案 A：快速收口（推荐）

**目标**：在不删除所有 Aster import 的情况下，移除 `lime-agent/Cargo.toml` 的 `aster.workspace = true`

**步骤**：
1. 将 `runtime_facade.rs` 的 `pub use aster::*` 改为内部 import
2. 将 `provider_safety.rs` / `credential_bridge.rs` 标记为 internal module
3. 在 `lime-agent/Cargo.toml` 中把 `aster.workspace = true` 改为 `aster = { workspace = true, optional = true }`
4. 为需要 Aster 的内部模块启用 feature gate
5. 验证编译通过

**优势**：
- 快速阻断 Aster 类型继续扩散
- 为后续逐步清理创造条件
- 不需要一次性重构所有文件

### 方案 B：完整重构（耗时）

**目标**：完全移除 `lime-agent` 对 Aster 的依赖

**步骤**：
1. 实现所有 Lime-owned trait（TurnExecutor, ProviderRouter, 等）
2. 逐个重构 45 个文件
3. 删除所有非 adapter 文件的 Aster import
4. 移除 `aster.workspace = true`

**劣势**：
- 需要重构 45+ 文件，约 185 行 import
- 高风险，可能引入大量回归
- 阻塞后续 Phase 3-6

## 推荐方案

**采用方案 A（快速收口）**：
1. 本轮重点：移除 `runtime_facade` 的公共 Aster 暴露
2. 标记剩余 internal 模块为 compat
3. 使用 feature gate 隔离 Aster 依赖
4. Phase 3 改为"optional aster feature gate"而不是"完全移除"

**理由**：
- 快速推进到 Phase 5（vendor 降级）和 Phase 6（adapter 删除）
- 降低回归风险
- 为后续逐步清理留出空间

## 验证入口

```bash
# 检查 public API 是否还暴露 Aster
rg "pub use aster::" lime-rs/crates/agent/src/lib.rs lime-rs/crates/agent/src/runtime_facade.rs

# 统计非 adapter 文件的 Aster import
rg -c "use aster::|aster::" lime-rs/crates/agent/src --glob "*.rs" --glob "!*adapter*.rs" --glob "!aster_*.rs" | wc -l

# 尝试编译移除 aster.workspace = true 后的状态
# （先不执行，等待方案确认）
```
