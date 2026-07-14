# S6b 默认 Playwright MCP Seed 删除证据

> date: 2026-07-14
> slice: S6b-dead-default-playwright-mcp-seed
> owner: root

## 事实源

Codex 在未配置时 MCP server 集合为空。Lime 因此仅在用户通过 current 管理入口显式创建、导入或启用 MCP server 时，才将它视为 `current`。历史 `migration_v3` 不是 schema 版本升级：它无条件使用已退役的 `@modelcontextprotocol/server-playwright` 包插入一条已启用的 `playwright` 记录。

## 已删除

- Deleted `lime-rs/crates/core/src/database/migration_v3.rs`.
- Removed its module export from `database/mod.rs`.
- Removed its startup dispatch from `startup_migrations.rs`.

新数据库初始化不再创建默认 Playwright MCP 记录。没有为已有本地数据库增加 cleanup migration：按 `name = 'playwright'` 删除并不安全，因为用户可能显式配置了 current Playwright MCP 包。开发和 fixture 数据库可直接重建；任何未来的显式清理必须精确匹配已退役包 fingerprint，并单独界定范围。

## 守卫与回归

- `fresh_database_does_not_seed_a_default_playwright_mcp_server` 初始化真实临时 SQLite 数据库，并断言 `mcp_servers` 没有默认记录。
- `rust-retired-default-playwright-mcp-seed` 是针对已退役包、migration marker、module 声明和调度调用的 `dead` legacy catalog 守卫。
- 守卫测试断言其分类、Rust 扫描范围、空 allow-list 与必要的禁止模式。

## 验证

- `rustfmt --edition 2021 --check lime-rs/crates/core/src/database/mod.rs lime-rs/crates/core/src/database/startup_migrations.rs`：通过。
- `git diff --check -- lime-rs/crates/core/src/database/mod.rs lime-rs/crates/core/src/database/startup_migrations.rs lime-rs/crates/core/src/database/migration_v3.rs src/lib/governance/legacySurfaceCatalog.json src/lib/governance/legacySurfaceCatalog.test.ts`：通过。
- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-core`：通过。
- `npm run test:rust:related -- lime-rs/crates/core/src/database/mod.rs lime-rs/crates/core/src/database/startup_migrations.rs lime-rs/crates/core/src/database/migration_v3.rs`：通过。
- `npx vitest run src/lib/governance/legacySurfaceCatalog.test.ts`：通过，200 tests。
- `npm run governance:legacy-report`：通过，零引用候选 0、分类漂移 0、边界违规 0。

## 分类

- `current`：用户显式管理的 MCP server 配置和既有 MCP management/runtime owner。
- `compat` / `deprecated`：未引入。
- `dead / deleted / forbidden-to-restore`：默认 Playwright seed、已退役 npm 包、migration marker、module export 与 startup dispatch。

本 slice 不改变 Electron、App Server JSON-RPC、runtime ownership 或 GUI wire。因此 GUI smoke 和 Gate B 不适用于这项删除证据。
