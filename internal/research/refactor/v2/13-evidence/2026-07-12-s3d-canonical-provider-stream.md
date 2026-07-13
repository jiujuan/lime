# S3d Canonical Provider Stream Evidence

> date: 2026-07-12
> slice: S3d provider stream cutover
> owner: coordinator-s3d-recovery
> workspace_commit: `56e4e7d9a9e59189a39021e461e7ba3431924a23`（工作树含并行改动）
> codex_commit: `5c19155cbd93bfa099016e7487259f61669823ff`
> opencode_commit: `9976269ab1accfc9f9dc98a4a688c516934de422`

## Current Surface

- `model-provider::current_client` 将 transcript 一次转换为 canonical `Request/ContentPart`，provider-specific lowering 只消费 canonical request。
- OpenAI Chat、OpenAI Responses 与 Anthropic SSE parser 直接生成 canonical `LlmEvent`。
- `agent-runtime::provider_turn` 直接消费 canonical text/reasoning/tool/usage/finish/error event。
- `CurrentProviderEvent`、`CurrentProviderCanonicalStream` 和 `project_canonical_stream` 已删除，App Server 中测试专用的旧 `runtime-core::LlmEvent` 委托也已删除。
- 截断 stream、非法工具 JSON、缺失工具名和不支持的 Anthropic output block 均 fail-closed；finish reason 保留 stop/tool/length/content-filter 语义。

## Verification

- `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-verify-target cargo test --manifest-path lime-rs/Cargo.toml -p runtime-core -p model-provider --lib`
  - result: pass
  - `model-provider`: 115 passed（consumer cutover 前编译基线）
  - `runtime-core`: 65 passed
- `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-verify-target cargo test --manifest-path lime-rs/Cargo.toml -p model-provider --lib`
  - result: pass
  - 118 passed，新增 finish reason、truncated stream 和 invalid tool JSON 回归。
- `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-verify-target cargo test --manifest-path lime-rs/Cargo.toml -p agent-runtime provider_turn`
  - result: pass
  - 3 passed，覆盖工具续轮、并行工具调用和 canonical provider error。
- `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-verify-target cargo check --manifest-path lime-rs/Cargo.toml -p lime-agent`
  - result: pass
- `git diff --check`
  - result: pass

## Blocked Verification

- `cargo check -p lime-agent -p app-server` 在 `lime-agent` 编译后被并行 S2 的 `app-server/src/runtime/event_log.rs` 阻断：`EventLogReplay` 派生 `Eq`，但 `EventLogRecord` 未实现 `Eq`。
- 因同一编译基线错误，`app-server provider_history` 与 `app-server tool_events` 定向测试未进入执行；S2 owner 修复后必须复跑。

## Governance

- `current`: canonical request、provider lowering、canonical SSE parser、`agent-runtime` canonical consumer。
- `dead`: `CurrentProviderEvent` 投影和 App Server 测试专用旧 mapper 委托，已删除。
- `deprecated`: `runtime-core::LlmEvent`、`LlmRuntimeEvent` 与 mapper；当前唯一生产 consumer 是 `media-runtime/src/llm_events.rs`。
- `compat`: `CurrentProviderMessage/Request/Usage` 仍服务现有 transcript 与 `lime-agent` adapter，不允许新增 provider wire 逻辑；退出条件是 App Server/agent transcript 全量迁到 canonical message/request。

## Remaining Blocker

S3 还不能标记完成。下一刀必须迁移 `media-runtime/src/llm_events.rs`，随后删除 `runtime-core` 旧 event mapper；之后继续收敛 `model-provider/src/lowering/**` 中仍使用旧 `LlmRequest` 的媒体协议 lowering。
