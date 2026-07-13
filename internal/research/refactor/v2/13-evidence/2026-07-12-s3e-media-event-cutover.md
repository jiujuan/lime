# S3e Media Event Cutover Evidence

> date: 2026-07-12
> slice: S3e media event cutover
> owner: coordinator-media-event-cutover
> workspace_commit: `56e4e7d9a9e59189a39021e461e7ba3431924a23`（工作树含并行改动）

## Change

- `media-runtime` 不再调用 `runtime_core::runtime_event_from_llm_event`，也不再构造旧 `LlmEvent/LlmOutputPart/LlmRole/LlmRuntimeEvent`。
- 本地媒体任务直接生成其拥有的 RuntimeEvent JSON；完成、失败与文本增量的 `runtimeEvent` 嵌入 canonical `LlmEvent`，媒体结果计数使用明确的 `media_task_output` domain payload。
- provider diagnostics 将 `runtimeCoreMapper: true` 替换为 `eventOwner: media_runtime`，避免继续声明错误 owner。

## Verification

- `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-verify-target cargo test --manifest-path lime-rs/Cargo.toml -p lime-media-runtime --lib`
  - result: pass
  - 50 passed
- `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-verify-target cargo test --manifest-path lime-rs/Cargo.toml -p lime-media-runtime --test model_route_execution`
  - result: pass
  - 9 passed
- `git diff --check`
  - result: pass

## Dead Surface Proof

`runtime_event_from_llm_event`、`LlmRuntimeEvent` 和旧 `LlmEvent/LlmOutputPart` 当前只出现在：

- `runtime-core/src/llm_protocol/events.rs`
- `runtime-core/src/llm_protocol/tests.rs`
- `runtime-core/src/llm_protocol.rs` 与 `runtime-core/src/lib.rs` 的自导出
- `runtime-core/src/llm_protocol/types.rs` 的旧类型定义

生产 crate 引用为零，因此分类为 `dead / forbidden-to-restore`。物理删除尚未执行，因为删除文件和批量移除类型需要用户明确确认。

## Remaining S3 Work

旧 request mapper/lowering 仍由媒体请求生产路径使用 `LlmRequest/LlmInputPart`，不能随 event mapper 一并删除。下一阶段应先把 `model-provider/src/lowering/**` 的媒体协议 lowering 迁到 canonical `Request/ContentPart`，再删除旧 request mapper/type。
