# S3f Canonical Media Request Evidence

> date: 2026-07-12
> slice: S3f provider request cutover
> owner: coordinator-provider-request-cutover
> workspace_commit: `56e4e7d9a9e59189a39021e461e7ba3431924a23`（工作树含并行改动）

## Current Production Path

- OpenAI Images、Responses image generation 与 FAL video 的生产 request builder 统一接收 `CanonicalRequest`。
- 媒体 prompt 从 canonical `ContentPart::Text` 读取；OpenAI/Responses reference image 从 `ContentPart::Media` 读取；provider-specific generation 参数从 `provider_options` 读取。
- `ResponsesImageGenerationInputShape/Options` 已迁到 `model-provider::lowering` owner，`media-runtime` 不再从 `runtime-core` 导入旧媒体 lowering 或 options。
- OpenAI/Responses canonical builder 对 inline `data:` reference fail-closed；其他尚未迁移的 Gemini/DashScope provider 仍维持各自现有短生命周期传输，不在本 slice 扩大策略。

## Verification

- `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-verify-target cargo test --manifest-path lime-rs/Cargo.toml -p lime-media-runtime --lib`
  - result: pass
  - 51 passed
- `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-verify-target cargo test --manifest-path lime-rs/Cargo.toml -p lime-media-runtime --test model_route_execution`
  - result: pass
  - 9 passed
- `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-verify-target cargo test --manifest-path lime-rs/Cargo.toml -p model-provider --lib`
  - result: pass
  - 118 passed
- `git diff --check`
  - result: pass

## Dead Surface Proof

生产 crate 已无 `runtime-core::build_openai_images_generation_body`、`build_responses_image_generation_body`、`build_fal_video_generation_body`、旧 `ResponsesImageGenerationOptions` 或旧 `LlmRequest` 调用。剩余引用位于：

- `runtime-core` 旧 mapper/types/自测/导出。
- `model-provider/src/lowering/**` 中 S3 spike 复制的无生产调用 generic chat/gemini/ollama lowering。

这些 surface 分类为 `dead / forbidden-to-restore`，但物理删除需用户明确确认。

## Remaining S3 Work

- 删除 `runtime-core/src/llm_protocol/{events.rs,mapper/**}` 及旧 event/request/output types、导出和对应旧测试。
- 删除 `model-provider/src/lowering/**` 中无生产调用的 generic old-request modules，仅保留 canonical media lowering 与 current client canonical lowering，或进一步合并为每 protocol 唯一模块。
- 删除前必须避让当前脏的 `runtime-core/src/{lib.rs,llm_protocol.rs}` 并在确认后建立单 owner 删除 claim。
