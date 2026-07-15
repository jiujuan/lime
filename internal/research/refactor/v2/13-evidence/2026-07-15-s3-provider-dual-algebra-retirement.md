# S3 Provider Dual Algebra Retirement

## 结论

S3f 的 canonical provider cutover 现已完成物理收口。14 个文件合计 `12+ / 1573-`，净删除
1561 行；8 个 pure-old source/test 文件物理删除，存活 lowering 只接受
`CanonicalRequest`。

current 链固定为：

```text
runtime-core canonical Request / ContentPart / LlmEvent
  -> model-provider current client lowering (chat/responses/anthropic)
  -> model-provider canonical media body builders (image/video)
  -> normalized provider stream event
```

## 删除面

- runtime-core：旧 `types.rs`、`events.rs`、`tests.rs` 和 crate exports。
- model-provider：generic anthropic/gemini/ollama/openai chat/responses old-request modules。
- model-provider 存活文件：删除全部 `LlmRequest`、`ProviderWireRequest`、两个旧 public mapper 与
  old-only helpers；保留 Responses image options、error、canonical prompt/media helpers 和三个
  media body builders。

## 守卫与架构

- `checkRetiredRuntimeCoreMapperSurface` 禁止 8 个 dead 文件/目录恢复。
- current lowering 扫描禁止 `LlmRequest`、`ProviderWireRequest`、
  `build_provider_wire_request` 与 `build_responses_image_generation_wire_request`。
- `internal/aiprompts/architecture.md` 已确认 provider-neutral 单代数与 current/canonical lowering
  owner；GUI 不承担 provider wire。

## 验证

- `runtime-core --lib`：`43/43`。
- `model-provider --lib`：`126/126`。
- `lime-media-runtime --lib`：`51/51`。
- `lime-media-runtime --test model_route_execution`：`9/9`。
- App Server client contract：`288` checks。
- deleted path、old symbol scan：`0`；canonical media consumer positive scan：通过。
- exact claimed Rust rustfmt、contract script Prettier/Node syntax 与 diff check：通过。

全 workspace `cargo fmt --all --check` 另被 active MCP slice 的
`agent/src/mcp_bridge.rs`、`mcp/src/**` 格式差异阻断；`architecture.md` 全文件 Prettier 另命中已释放
S2q 的既有段落格式。这些非 S3 patch 未被全文件重排；S3 claimed Rust 与 contract script exact
format、全写集 `git diff --check` 均通过。

## 分类

- `current`：runtime-core canonical algebra、model-provider current client lowering、canonical
  media builders。
- `compat`：无。
- `deprecated`：无。
- `dead / deleted / forbidden-to-restore`：旧 request/wire/event algebra 与 generic mapper。
