# Aster Optional Feature Gate 实施计划

生成时间：2026-07-04  
状态：ready_to_execute  
前置：Phase 2 公共 API 清理已完成

## 目标

将 `lime-agent` 对 Aster 的依赖从强制改为 optional feature，为逐步清理创造条件，同时不阻塞 Phase 5-6 推进。

## 改动方案

### 1. Cargo.toml 改动

```toml
# Before
[dependencies]
aster.workspace = true

# After
[dependencies]
aster = { workspace = true, optional = true }

[features]
# Compat feature：启用 Aster runtime 兼容层
# 退出条件：aster_runtime_support 迁移到不依赖 Aster 后删除
compat-aster = ["aster"]

# Default features：当前保留 compat-aster，确保向后兼容
default = ["compat-aster"]
```

### 2. 条件编译标记

**需要标记的文件**（启用 Aster 时才编译）：
- `aster_session_store.rs` - Aster SessionStore trait 实现部分
- `aster_session_store_adapter.rs` - Aster compat adapter
- `aster_runtime_support.rs` - Aster runtime 初始化
- `aster_state.rs` - Aster execution wrapper
- `aster_runtime_projection.rs` - Aster runtime projection

**示例**：
```rust
#[cfg(feature = "compat-aster")]
impl aster::session::SessionStore for LimeSessionStore {
    // ... compat 实现
}
```

### 3. 验证策略

**编译验证**：
```bash
# 启用 compat feature（当前默认）
cargo check -p lime-agent

# 禁用 compat feature（未来目标）
cargo check -p lime-agent --no-default-features

# App Server 不应依赖 compat feature
cargo check -p app-server
```

**预期结果**：
- ✅ 默认启用 compat-aster，现有代码正常编译
- ⚠️ 禁用 compat-aster 时编译失败（预期，因为 aster_runtime_support 仍在使用）
- ✅ App Server 不依赖 compat-aster feature

## 实施步骤

### Step 1：修改 Cargo.toml（立即执行）

```bash
# 修改 lime-rs/crates/agent/Cargo.toml
# 添加 optional = true 和 features 部分
```

### Step 2：验证默认编译（立即执行）

```bash
cargo check -p lime-agent
cargo check -p app-server
```

### Step 3：标记 compat 文件（后续批次）

分批标记文件，每批验证编译通过：
- Batch 1：`aster_session_store.rs` 的 Aster trait impl
- Batch 2：`aster_runtime_support.rs`
- Batch 3：其他 compat 文件

### Step 4：文档更新

在每个 compat 文件顶部添加退出条件：
```rust
//! Compat: Aster runtime 兼容层
//! 
//! 退出条件：
//! - aster_runtime_support 迁移到不依赖 Aster runtime
//! - App Server 改为使用 agent-runtime::TurnExecutor
//! - 验证 cargo check -p lime-agent --no-default-features 通过
```

## 优势

1. **快速推进**：不阻塞 Phase 5-6
2. **降低风险**：渐进式清理，不是一次性重构
3. **清晰边界**：feature gate 明确标记 compat 范围
4. **向后兼容**：default feature 保持现有行为
5. **可测试**：可以验证禁用 compat 后的编译状态

## 退出条件

**最终目标**：移除 compat-aster feature

**前置条件**：
1. `aster_runtime_support` 迁移到 `agent-runtime::TurnExecutor`
2. App Server 不调用 Aster runtime 初始化
3. 所有 production 路径使用 Lime-owned trait
4. `cargo check -p lime-agent --no-default-features` 通过

**删除时机**：Phase 6（删除迁移 adapter）

## 下一步

**立即执行**：
1. 修改 `Cargo.toml` 添加 optional feature
2. 验证默认编译通过
3. 更新迁移计划

**后续批次**：
1. 标记 compat 文件
2. 添加退出条件文档
3. 验证 App Server 不启用 compat feature

## 验证清单

- [ ] `Cargo.toml` 添加 `optional = true`
- [ ] `Cargo.toml` 添加 `[features]` 部分
- [ ] `cargo check -p lime-agent` 通过
- [ ] `cargo check -p app-server` 通过
- [ ] 迁移计划已更新
- [ ] 后续批次计划已制定
