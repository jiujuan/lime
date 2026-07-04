# Aster Trait 骨架快速迁移计划

状态：in_progress  
创建时间：2026-07-04  
父计划：`./aster-runtime-codex-style-migration-plan.md`  
目标：建立 Lime-owned trait 边界，让 `lime-agent` 可以移除 `aster.workspace = true`

## 执行策略

**先骨架后细节**：优先定义 Lime-owned trait 和核心 DTO，推迟具体实现搬运。目标是快速建立类型边界，阻断 Aster 类型继续扩散。

## Phase 1: Lime-owned Trait 骨架（并行）

### 1.1 thread-store::SessionRepository

**目标**：取代 Aster `SessionStore` trait，成为 session/conversation persistence 的 current 边界。

**核心 trait**：
```rust
pub trait SessionRepository {
    async fn get_session(&self, session_id: &str) -> Result<SessionRecord>;
    async fn list_sessions(&self, filter: SessionFilter) -> Result<Vec<SessionRecord>>;
    async fn update_metadata(&self, session_id: &str, metadata: SessionMetadata) -> Result<()>;
    async fn save_conversation(&self, session_id: &str, conversation: ConversationTranscript) -> Result<()>;
    async fn load_conversation(&self, session_id: &str) -> Result<Option<ConversationTranscript>>;
    async fn search_history(&self, session_id: &str, query: &str) -> Result<Vec<MessageMatch>>;
}
```

**核心 DTO**（无 direct Aster dependency）：
- `SessionRecord`：session metadata + type + timestamps
- `SessionMetadata`：title, model, custom fields
- `ConversationTranscript`：turns + messages + checkpoints
- `SessionFilter`：type filter, time range, limit

**依赖**：
- `agent-protocol`（turn context, session type）
- `chrono`（timestamp）
- 不依赖 `aster`

**迁移路径**：
1. 定义 trait 和 DTO 骨架（不实现）
2. `lime-agent::aster_session_store` 改为实现新 trait
3. Aster `Session` / `Conversation` 只在 adapter 内部转换
4. 删除 `lime-agent` 对 `aster.workspace = true` 的依赖

### 1.2 agent-runtime::TurnExecutor

**目标**：取代 Aster turn loop / queue / subagent，成为 execution orchestration 的 current 边界。

**核心 trait**：
```rust
pub trait TurnExecutor {
    async fn execute_turn(&self, request: TurnRequest) -> Result<TurnStream>;
    async fn queue_subagent(&self, parent_id: &str, config: SubagentConfig) -> Result<String>;
    async fn handle_action_response(&self, turn_id: &str, response: ActionResponse) -> Result<()>;
    async fn abort_turn(&self, turn_id: &str) -> Result<()>;
}

pub trait TurnStream {
    async fn next_event(&mut self) -> Option<TurnEvent>;
}
```

**核心 DTO**（无 direct Aster dependency）：
- `TurnRequest`：session_id, input, turn_context, tools
- `TurnEvent`：runtime event stream（复用 `agent-protocol`）
- `SubagentConfig`：parent context + delegation
- `ActionResponse`：ask response, tool approval, etc.

**依赖**：
- `agent-protocol`（turn context, event DTO）
- `tool-runtime`（tool registry）
- `model-provider`（provider router）
- 不依赖 `aster`

**迁移路径**：
1. 定义 trait 和 DTO 骨架（不实现）
2. `lime-agent::aster_state` 改为实现新 trait
3. Aster `execute_agent` / `QueuedTurnRuntime` 只在 adapter 内部
4. `app-server::runtime_backend` 改为调用新 trait

### 1.3 model-provider::ProviderRouter

**目标**：取代 Aster `Provider` trait，成为 model request/response 的 current 边界。

**核心 trait**：
```rust
pub trait ProviderRouter {
    async fn route_request(&self, request: ModelRequest) -> Result<Box<dyn ResponseStream>>;
    fn get_capability(&self, model: &str) -> Option<ModelCapability>;
}

pub trait ResponseStream {
    async fn next_chunk(&mut self) -> Option<Result<ResponseChunk>>;
}
```

**核心 DTO**（无 direct Aster dependency）：
- `ModelRequest`：model, messages, tools, config
- `ResponseChunk`：delta content / tool calls / usage
- `ModelCapability`：context window, features

**依赖**：
- `agent-protocol`（message content, tool schema）
- 不依赖 `aster`

**迁移路径**：
1. 定义 trait 和 DTO 骨架（不实现）
2. `lime-agent::provider_safety` 改为实现新 trait
3. Aster `Provider` / `ModelConfig` 只在 adapter 内部
4. 删除 `lime-agent::runtime_facade` 对 Aster provider 的依赖

## Phase 2: Adapter 重构（串行，依赖 Phase 1）

### 2.1 重构 aster_session_store

**当前状态**：
- 实现 Aster `SessionStore` trait
- 直接返回 Aster `Session` / `Conversation`
- 约 969 行，已拆分子模块

**目标状态**：
- 实现 `thread-store::SessionRepository` trait
- 返回 Lime `SessionRecord` / `ConversationTranscript`
- Aster query 只在内部 `session_projection` adapter

**改动范围**：
- `lime-rs/crates/agent/src/aster_session_store.rs`（主文件）
- `lime-rs/crates/agent/src/aster_session_store/session_projection.rs`（增强 adapter）
- `lime-rs/crates/thread-store/src/repository.rs`（新增 trait）

**避让**：
- 不碰 `runtime_conversation.rs`（有并行改动）
- 不碰测试文件（先保持编译通过）

### 2.2 盘点 aster_state execution adapter

**当前状态**：
- `aster_state::execute_with_aster_runtime` 是主入口
- `runtime_facade` 暴露多个 Aster execution helper
- `app-server::runtime_backend` 通过 facade 调用 Aster

**调查清单**：
1. 列出所有 `aster_state` 的 Aster execution 调用点
2. 列出所有 `runtime_facade` 暴露的 Aster 类型
3. 列出 `app-server` 对 `runtime_facade` 的依赖边界
4. 设计迁移到 `agent-runtime::TurnExecutor` 的 adapter 边界

**产出**：
- 调用点清单（文件:行号:函数）
- 迁移策略文档
- 阻塞点列表（如果有）

### 2.3 provider_safety adapter 边界设计

**当前状态**：
- 实现 Aster `Provider` trait
- `model-provider::safety` 已迁出纯策略
- 仍依赖 Aster `ModelConfig` / message DTO

**目标**：
- 改为实现 `model-provider::ProviderRouter` trait
- Aster `Provider` / `ModelConfig` 只在 adapter 内部
- 删除 `lime-agent` 最后的 Aster provider 依赖

**改动范围**：
- `lime-rs/crates/agent/src/provider_safety.rs`（降级为 adapter）
- `lime-rs/crates/model-provider/src/router.rs`（新增 trait）

## Phase 3: 依赖验证与收口

### 3.1 移除 lime-agent 的 aster.workspace = true

**前置条件**：
- `aster_session_store` 已改为实现 `SessionRepository`
- `aster_state` / `runtime_facade` 已改为实现 `TurnExecutor`
- `provider_safety` 已改为实现 `ProviderRouter`
- 所有 adapter 内部的 Aster 转换已完成

**验证**：
```bash
rg -n "use aster::|aster::" "lime-rs/crates/agent/src" --glob "*.rs" | wc -l
# 应该只剩 adapter 文件内部，production 文件为 0

cargo metadata --manifest-path "lime-rs/Cargo.toml" --format-version 1 --no-deps | jq '.packages[] | select(.name == "lime-agent") | .dependencies[] | select(.name == "aster")'
# 应该为空
```

**操作**：
1. 从 `lime-rs/crates/agent/Cargo.toml` 移除 `aster.workspace = true`
2. 编译验证：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent`
3. 测试验证：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent`
4. 守卫验证：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts"`

### 3.2 更新守卫规则

**新增守卫**：
- `lime-agent` 必须不依赖 `aster.workspace = true`
- adapter 文件可以 import Aster，但不能暴露 Aster 类型到 public API
- 新增文件默认禁止 Aster import

**守卫文件**：
- `src/lib/governance/asterMigrationBoundary.test.ts`

## Phase 4: App Server 切换（延后，避让并行改动）

**当前避让原因**：
- `app-server/src/runtime/**` 有 workflow 相关并行改动
- `runtime_backend` 多个文件被其他进程修改

**后续策略**：
1. 等待并行 workflow 改动完成
2. `runtime_backend` 从调用 `runtime_facade` 改为调用 `agent-runtime::TurnExecutor`
3. 删除 `runtime_facade` 中暴露 Aster 类型的 helper

## Phase 1 完成状态（2026-07-04）

**✅ 三个核心 trait 骨架已完成**：

1. **`thread-store::SessionRepository`** (lime-rs/crates/thread-store/src/session_repository.rs)
   - ✅ 核心方法：get_session, list_sessions, update_metadata, save_conversation, get_conversation, delete_session
   - ✅ Lime-owned DTO：SessionMetadata, SessionDetail, ConversationMessage, SessionListQuery
   - ✅ 不依赖 Aster
   - ✅ 包含 4 个单测

2. **`agent-runtime::TurnExecutor`** (lime-rs/crates/agent-runtime/src/turn_executor.rs)
   - ✅ 核心方法：execute_turn, queue_subagent, handle_action_response
   - ✅ Lime-owned DTO：ExecuteTurnRequest, ExecuteTurnResult, QueueSubagentRequest, HandleActionRequest
   - ✅ 不依赖 Aster
   - ✅ 包含 3 个单测

3. **`model-provider::ProviderRouter`** (lime-rs/crates/model-provider/src/router.rs)
   - ✅ 核心方法：route_request, stream_response, get_capability, get_context_window
   - ✅ Lime-owned DTO：ProviderRequest, ProviderResponse, StreamChunk, Message, ContentBlock
   - ✅ 不依赖 Aster
   - ✅ 包含 5 个单测

**验证结果**：
```bash
✅ cargo check --manifest-path "lime-rs/Cargo.toml" -p thread-store -p agent-runtime -p model-provider
✅ 三个 crate 编译通过，无 Aster 依赖
```

## Phase 2 进行中：Adapter 重构

### 当前阻塞点分析

通过代码审查发现，`lime-agent` 移除 `aster.workspace = true` 的主要阻塞点：

1. **`aster_session_store.rs`** (969 行)
   - 当前实现 Aster `SessionStore` trait
   - 需要改为实现 `thread-store::SessionRepository` trait
   - 保留 SQL 查询逻辑，只改 trait 边界

2. **`aster_state.rs`** + **`runtime_facade.rs`**
   - 暴露 Aster `execute_agent` 等执行函数
   - 需要改为实现 `agent-runtime::TurnExecutor` trait
   - 保留 Aster 内部调用，只改公共接口

3. **`provider_safety.rs`**
   - 实现 Aster `Provider` trait
   - 需要改为实现 `model-provider::ProviderRouter` trait
   - `model-provider::safety` 已迁出纯策略

4. **`ask_bridge.rs`**
   - 依赖 Aster `AskCallback` trait
   - 需要定义 Lime-owned callback trait
   - `agent-runtime::ask` 已迁出 schema/response 逻辑

5. **adapter 文件清单**
   - `aster_runtime_projection.rs` (65 行，已瘦身)
   - `runtime_snapshot_adapter.rs`
   - `runtime_timeline_adapter.rs`
   - `session_execution_runtime_adapter.rs`
   - `subagent_runtime_adapter.rs`
   - `message_content_adapter.rs`
   - 这些都是 compat adapter，trait 切换后可以保留

## 完成标准（更新）

**Phase 1（已完成）**：
- [x] `thread-store::SessionRepository` trait 已定义
- [x] `agent-runtime::TurnExecutor` trait 已定义
- [x] `model-provider::ProviderRouter` trait 已定义

**Phase 2（进行中）**：
- [ ] `aster_session_store` 已实现新 `SessionRepository` trait
- [ ] `aster_state` + `runtime_facade` 已实现新 `TurnExecutor` trait
- [ ] `provider_safety` 已实现新 `ProviderRouter` trait
- [ ] `ask_bridge` 已切换到 Lime-owned callback trait

**Phase 3（待开始）**：
- [ ] `lime-agent/Cargo.toml` 已移除 `aster.workspace = true`
- [ ] 守卫测试通过
- [ ] `cargo check -p lime-agent` 通过
- [ ] `cargo test -p lime-agent` 通过

## 并行协作写集声明

**本轮认领**：
- `lime-rs/crates/thread-store/src/repository.rs`（新增）
- `lime-rs/crates/agent-runtime/src/executor.rs`（新增）
- `lime-rs/crates/model-provider/src/router.rs`（新增）
- `lime-rs/crates/agent/src/aster_session_store.rs`（重构 trait 实现）
- `lime-rs/crates/agent/Cargo.toml`（移除 aster dependency）
- `internal/roadmap/astermigration/*.md`（进度更新）

**避让写集**：
- `lime-rs/crates/app-server/src/runtime/**`（workflow 改动）
- `lime-rs/crates/app-server/src/runtime_backend/**`（image command 改动）
- `src/components/agent/chat/workspace/**`（前端改动）
- `scripts/agent-runtime/claw-chat-*`（fixture 改动）

**只读审阅**：
- `lime-rs/crates/agent/src/event_converter.rs`（已瘦身，本轮不改）
- `lime-rs/crates/agent/src/aster_state.rs`（本轮只盘点调用点）

## 风险与退出条件

**风险**：
1. `aster_session_store` 约 969 行，trait 切换可能引入回归
2. `aster_state` 执行链复杂，盘点可能发现未知依赖
3. 并行改动可能阻塞 App Server 最终切换

**退出条件**：
1. 如果 trait 切换导致超过 10 个测试失败，回退到只做盘点
2. 如果发现 Aster 依赖无法在本轮移除，登记阻塞点并延后 Phase 3
3. 如果并行冲突超过 5 个文件，停止并等待对方完成

## 验证入口

```bash
# Trait 编译验证
CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p thread-store -p agent-runtime -p model-provider

# Adapter 重构验证
CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_session_store --lib

# 依赖移除验证
cargo metadata --manifest-path "lime-rs/Cargo.toml" --format-version 1 --no-deps | jq '.packages[] | select(.name == "lime-agent") | .dependencies'

# 守卫验证
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000

# Aster import 残留扫描
rg -n "use aster::|aster::" "lime-rs/crates/agent/src" --glob "*.rs" --glob "!*adapter*.rs" | wc -l
```

## 下一刀（workflow 完成后）

1. 如果 Phase 1 完成：继续 Phase 2.1 重构 `aster_session_store`
2. 如果 Phase 2 完成：继续 Phase 3.1 移除 `aster.workspace = true`
3. 如果遇到阻塞：更新阻塞点到本文档并通知用户
