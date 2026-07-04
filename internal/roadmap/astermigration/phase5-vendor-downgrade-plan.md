# Phase 5: Aster Vendor 降级执行计划

执行时间：2026-07-04  
前置条件：Phase 1-2 已完成  
状态：compile_verified_guarded

## 目标

将 Aster 从 workspace current crate 区域移动到 vendor 区，明确其作为外部依赖的定位，为最终移除做准备。

## 当前状态分析

**Aster 位置**：
- 原路径：`lime-rs/crates/aster-rust`
- 当前路径：`lime-rs/vendor/aster-rust`
- Workspace exclude：`vendor/aster-rust`
- Workspace dependency：`aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }`

**依赖情况**：
- `lime-agent`：通过 `aster.workspace = true` 直接依赖；这是待清退的真实主链阻塞，不再用假 optional feature 包装
- 其他 crate：通过 adapter 间接依赖

## 执行方案

### 方案 A：移动到 vendor 目录（推荐）

**优势**：
- 明确表达 Aster 是外部依赖
- 为最终移除创造条件
- vendor 目录统一管理外部 fork

**步骤**：
1. 创建 vendor 目录
2. 移动 aster-rust
3. 更新 workspace Cargo.toml
4. 验证编译

### 方案 B：保持在 crates 但改为 git dependency

**优势**：
- 不改变目录结构
- 减少 workspace 管理复杂度

**劣势**：
- 仍在 crates 目录，语义不清晰
- 不利于最终移除

## 方案 A 详细步骤

### Step 1：创建 vendor 目录结构

```bash
mkdir -p lime-rs/vendor
```

### Step 2：移动 aster-rust

```bash
git mv lime-rs/crates/aster-rust lime-rs/vendor/aster-rust
```

**或者**（如果 git mv 有问题）：
```bash
mv lime-rs/crates/aster-rust lime-rs/vendor/aster-rust
```

### Step 3：更新 workspace Cargo.toml

**当前**：
```toml
[workspace]
members = ["crates/*"]
exclude = [
  "crates/aster",
  "crates/aster-models",
  "crates/aster-rust",
  ...
]

[workspace.dependencies]
aster = { package = "aster-core", path = "crates/aster-rust/crates/aster" }
```

**修改为**：
```toml
[workspace]
members = ["crates/*"]
exclude = [
  "crates/aster",
  "crates/aster-models",
  # "crates/aster-rust",  # 已移动到 vendor/
  ...
]

[workspace.dependencies]
# Aster runtime - vendor dependency
# 退出条件：Phase 6 完成后移除
aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }
```

### Step 4：验证编译

```bash
cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib
cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server
cargo test --manifest-path "lime-rs/Cargo.toml" --workspace --lib --no-fail-fast
```

### Step 5：更新文档

在 `vendor/aster-rust/README.md` 添加说明：
```markdown
# Aster Runtime (Vendored)

此目录包含 Aster runtime 的 fork 版本，作为 Lime 迁移期的临时依赖。

## 状态

- **当前**：vendor dependency，服务 `lime-agent` 剩余 compat adapter
- **目标**：Phase 6 完成后完全移除
- **退出条件**：
  1. 所有 compat adapter 已删除
  2. `lime-agent` 的假 optional feature 已移除
  3. 所有 production 路径使用 Lime-owned trait

## 使用限制

- ⚠️ 不应添加新的 Aster 依赖
- ⚠️ 不应扩展 Aster API 使用范围
- ✅ 仅用于现有 compat adapter

## 迁移进度

参考：`internal/roadmap/astermigration/`
```

## 验证清单

- [x] vendor 目录已创建
- [x] aster-rust 已移动到 vendor/
- [x] workspace Cargo.toml 已更新
- [x] exclude 列表已更新
- [x] vendor 内 `document-preview` 相对路径已修正到 root `crates/document-preview`
- [x] cargo metadata 通过
- [x] cargo check -p lime-agent --lib 通过
- [x] cargo check -p app-server 通过
- [ ] cargo test --workspace --lib 通过
- [x] vendor/aster-rust/README.md 已更新
- [x] 迁移计划已更新
- [x] vendor 路径回流守卫已更新

## 2026-07-04 执行记录

- `completed`：`lime-rs/crates/aster-rust` 已移动到 `lime-rs/vendor/aster-rust`，从 Lime current crate 区降级为 vendor 依赖。
- `completed`：`lime-rs/Cargo.toml` 的 workspace dependency 已改为 `vendor/aster-rust/crates/aster`，并将 `vendor/aster-rust` 加入 root workspace `exclude`，避免 vendored Aster 继承 Lime root workspace metadata。
- `completed`：`lime-rs/vendor/aster-rust/crates/aster/Cargo.toml` 中 `document-preview` 从旧相对路径 `../../../document-preview` 修正为 `../../../../crates/document-preview`，解除 vendor 移动后的 manifest 断点。
- `verified`：`cargo metadata --manifest-path "lime-rs/Cargo.toml" --format-version 1 --no-deps` 通过，root workspace 能解析 vendored Aster path dependency。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，用时 7m47s。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `not-run`：本轮未跑 `cargo test --workspace --lib --no-fail-fast`，因为当前目标是解除 Phase 5 vendor path 编译断点并封住 vendor 回流守卫，且工作树存在大量并行热区。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `Aster vendor dependency 只能停留在 vendor compat 路径`，要求 `lime-rs/crates/aster-rust` 保持 `dead / forbidden-to-restore`，`lime-rs/vendor/aster-rust` 存在，且 root workspace dependency 只指向 vendor 路径。
- `current`：`lime-rs/crates/**` 继续作为 Lime-owned runtime / service / protocol crate 区。
- `compat`：`lime-rs/vendor/aster-rust` 只服务 `lime-agent` 剩余 Aster compat adapter；Phase 6 删除 compat adapter 后必须移除该 vendor dependency。

## 风险评估

**低风险**：
- 只改变路径，不改变代码
- 编译器会自动验证依赖路径
- 可以轻易回滚（git mv 反向操作）

**潜在问题**：
- CI/CD 脚本可能硬编码了路径
- 文档可能引用了旧路径
- IDE 可能需要重新索引

**回滚方案**：
```bash
git mv lime-rs/vendor/aster-rust lime-rs/crates/aster-rust
# 恢复 Cargo.toml 改动
git checkout lime-rs/Cargo.toml
```

## 后续工作

完成 Phase 5 后：
1. Phase 3-4：继续清理内部 compat
2. Phase 6：删除 compat adapter 和 vendor/aster-rust

## 预期结果

**目录结构**：
```
lime-rs/
├── crates/           # Lime current runtime
│   ├── agent/
│   ├── agent-runtime/
│   ├── model-provider/
│   ├── thread-store/
│   └── ...
├── vendor/           # External dependencies
│   └── aster-rust/   # Aster runtime (临时)
└── Cargo.toml
```

**语义表达**：
- `crates/*`：Lime 拥有的 current runtime
- `vendor/*`：外部依赖，迁移期临时使用

**下一步里程碑**：
- Phase 5 完成 → Aster 明确定位为 vendor
- Phase 6 完成 → vendor/aster-rust 完全删除

---

**执行状态：compile_verified_guarded**  
**预估耗时：5-10 分钟**  
**风险等级：低（可快速回滚）**
