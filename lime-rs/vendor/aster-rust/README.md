# Aster Runtime (Vendored)

此目录包含 Aster runtime 的 fork 版本，作为 Lime 迁移期的临时依赖。

## 状态

- **当前角色**：vendor dependency，通过 optional feature 隔离
- **迁移目标**：Phase 6 完成后完全移除
- **定位**：外部依赖，非 Lime current runtime

## 退出条件

Phase 6 完成后删除此目录，前置条件：

1. ✅ 所有 compat adapter 已删除
2. ✅ `lime-agent` 的 `compat-aster` feature 已移除
3. ✅ 所有 production 路径使用 Lime-owned trait（SessionRepository, TurnExecutor, ProviderRouter）
4. ✅ `cargo check -p lime-agent --no-default-features` 通过
5. ✅ App Server 不依赖 Aster runtime

## 使用限制

**禁止**：
- ⚠️ 不应添加新的 Aster 依赖
- ⚠️ 不应扩展 Aster API 使用范围
- ⚠️ 不应在新代码中使用 Aster 类型

**允许**：
- ✅ 现有 compat adapter 继续使用
- ✅ Bug 修复和安全补丁
- ✅ 维护现有功能

## 依赖方式

**Workspace Cargo.toml**：
```toml
[workspace.dependencies]
# Aster runtime - vendor dependency
# 退出条件：Phase 6 完成后移除
aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }
```

**lime-agent Cargo.toml**：
```toml
[dependencies]
aster = { workspace = true, optional = true }

[features]
compat-aster = ["aster"]
default = ["compat-aster"]
```

## 迁移进度

**Phase 1-2**（已完成）：
- ✅ Lime-owned trait 已定义（SessionRepository, TurnExecutor, ProviderRouter）
- ✅ 公共 API 不再暴露 Aster 类型
- ✅ Optional feature gate 已实施

**Phase 3-4**（进行中）：
- 🔄 逐步迁移 54 个文件到 Lime-owned trait
- 🔄 收缩 compat-aster feature 范围

**Phase 5**（当前）：
- ✅ Aster 已移动到 vendor 区

**Phase 6**（待开始）：
- ⏸️ 删除所有 compat adapter
- ⏸️ 移除 compat-aster feature
- ⏸️ 删除此 vendor 目录

详细进度参考：`../../internal/roadmap/astermigration/`

## 目录结构

```
vendor/aster-rust/
├── crates/
│   ├── aster/              # aster-core package
│   ├── aster-models/
│   └── ...
├── Cargo.toml
└── README.md               # 本文件
```

## 维护策略

1. **冻结功能**：不添加新功能
2. **安全优先**：安全补丁可以合并
3. **最小改动**：只做必要的 bug 修复
4. **定期检查**：每月检查迁移进度，评估删除时机

## 联系方式

- 迁移计划：`internal/roadmap/astermigration/`
- 问题反馈：GitHub Issues
- 技术讨论：团队技术会议

---

**最后更新**：2026-07-04  
**当前状态**：vendor dependency  
**预计删除时间**：Phase 6 完成后（约 1-2 个月）
