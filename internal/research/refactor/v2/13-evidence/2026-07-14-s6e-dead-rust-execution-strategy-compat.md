# S6e 无调用 Rust Execution Strategy Compat 删除证据

> date: 2026-07-14
> slice: S6e-dead-rust-execution-strategy-compat
> owner: root

## 事实源

产品策略已在 typed request/lowering 边界收敛为 React-only。`lime-agent` 的
`execution_strategy_compat` 只接受旧字符串并无条件返回 `"react"`，不属于 current
provider、App Server 或 GUI 链路。

全 Rust 仓库搜索证明 `normalize_execution_strategy_to_react` 没有 caller；唯一命中是其自身
定义、单元测试和 `agent/src/lib.rs` 的 module declaration。删除后，Rust 没有另一个 execution
strategy normalizer。

## 已删除

- 删除 `lime-rs/crates/agent/src/execution_strategy_compat.rs` 及其 32 行测试；
- 删除 `lime-rs/crates/agent/src/lib.rs` 的 module declaration；
- `agentMigrationBoundary` 记录物理删除路径；
- `rust-retired-execution-strategy-compat` dead guard 禁止模块和函数符号回流。

`src/lib/api/agentRuntime/executionStrategyCompat.ts` 未删除。它仍由
`agentProtocolRuntimeParsers`、runtime input catalog 和 `useWorkspaceSendActions` 三个生产边界
消费，属于待这些 GUI caller 迁完后再删除的 `compat`，不能与 Rust 零调用模块混删。

## 验证

- `rg --glob '*.rs' "execution_strategy_compat|normalize_execution_strategy_to_react" lime-rs`：删除后零命中；
- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent --lib -q`：通过；
- `cargo check --manifest-path lime-rs/Cargo.toml -p lime-agent`：通过；
- `npx vitest run src/lib/governance/legacySurfaceCatalog.test.ts --silent=passed-only`：201 tests 通过；
- `npx vitest run src/lib/governance/agentMigrationBoundary.test.ts --testNamePattern "已删除的 lime-agent Agent adapter 不得恢复" --silent=passed-only`：通过；
- `npm run governance:legacy-report`：零引用候选 0、分类漂移 0、边界违规 0；
- S6e 精确写集 `git diff --check` 与 catalog JSON parse：通过。

`lime-agent` 编译仍输出既有 `session_execution_runtime` 与 `subagent_control` 未使用警告；它们不依赖
本模块，也未作为本 slice 的删除依据。

## 分类

- `current`：typed React-only request/lowering 与 App Server RuntimeCore 主链；
- `compat`：仍有三个 production caller 的 TypeScript `executionStrategyCompat.ts`；
- `deprecated`：本 slice 无；
- `dead / deleted / forbidden-to-restore`：Rust `execution_strategy_compat` 模块、函数和内嵌测试。

本 slice 不改变 Electron、App Server JSON-RPC、Renderer UI 或协议 wire，GUI smoke 与 Gate B 不适用。
