# S3h Model Provider Generic Lowering Retirement Evidence

> date: 2026-07-15
> slice: S3h-model-provider-generic-lowering-retirement
> owner: provider-lowering-cleanup
> status: focused-validated / shared-cargo-pending-root

## Objective

删除 S3 spike 从 runtime-core 搬入 model-provider 后遗留的第二套
`LlmRequest -> ProviderWireRequest` lowering。provider request 的 current 事实源继续是
`CanonicalRequest`；本 slice 不修改 current client、runtime-core 或 media-runtime。

## Changes

- 物理删除零生产消费者的 `anthropic_messages.rs`、`gemini.rs`、
  `ollama_chat.rs`、`openai_chat.rs`、`openai_responses.rs`。
- 从 `lowering/mod.rs` 删除 `build_provider_wire_request` 和
  `build_responses_image_generation_wire_request`，并删除五个旧 module declaration。
- 从 `common.rs` 删除全部 `LlmRequest`、`LlmInputPart`、`LlmToolDefinition`、
  `ProviderWireRequest` helper，以及只服务旧 route mapper 的
  `UnsupportedProtocol` error variant。
- 从 `openai_images.rs` 和 `openai_responses_image_generation.rs` 删除旧 request/wire
  分支及其私有 helper。
- 保留 `ProtocolMappingError`、Responses image options/input shape，以及三个生产
  canonical media body builder：OpenAI Images、Responses image generation、Fal video。

净变化为 9 个源码文件、约 1000 行旧实现删除；没有增加 compat wrapper。

## Consumer Proof

- `model-provider/src/lowering/**` 中 `LlmRequest`、`ProviderWireRequest`、旧输入类型、
  两个旧 public mapper 和旧 wire helper 的 fresh scan 为 `0`。
- `media-runtime/src/image_request/openai_images.rs` 继续以 `CanonicalRequest` 调用
  `build_openai_images_generation_body`。
- `media-runtime/src/image_request/responses.rs` 继续调用
  `build_responses_image_generation_body`，其 request 来自同一 canonical image builder。
- `media-runtime/src/video_worker.rs` 继续以 `CanonicalRequest` 调用
  `build_fal_video_generation_body`。
- current chat/responses/anthropic provider lowering 仍由
  `model-provider/src/current_client/lowering.rs` 唯一承接，本 slice 未触碰。

## Governance Classification

- `current`: `CanonicalRequest`、current client lowering、三个 canonical media body builder。
- `compat`: 无。
- `deprecated`: 无。
- `dead / deleted / forbidden-to-restore`: 五个 generic lowering modules、
  `LlmRequest -> ProviderWireRequest` public mapper 和相关 helper。

## Focused Validation

- exact `rustfmt --edition 2021 --check`：通过。
- lowering old-symbol scan：`0`。
- pure-old module deletion scan：`5/5` absent。
- canonical media builder 与 media-runtime consumer positive scan：通过。
- claimed source `git diff --check`：通过。

按协调要求未运行共享 Cargo tests。root 在 S3g 合并后统一运行 runtime-core、
model-provider、media-runtime 相关测试与 contract guard，避免基于半合并工作树重复构建。

## Coordinator Shared Validation

- `model-provider --lib`：`126/126`。
- `lime-media-runtime --lib`：`51/51`。
- `lime-media-runtime --test model_route_execution`：`9/9`。
- App Server client contract：`288` checks。
- combined old-symbol/path scan、exact rustfmt 与 diff check：通过。

## Coordination

- 本轮认领写集仅为中央计划登记的 S3h lowering 文件及本 evidence/claim/handoff。
- 避让 runtime-core S3g、media-runtime、current client、contract script、中央计划，
  以及 active S2o/S7ab 写集。
- 未修改架构事实源；本 slice 只物理落实既有 canonical provider 边界。
