# P2 Media Item Projection Handoff

> 状态：app-server-agent-message-skeleton-validated / protocol-generated-skeleton-validated / projection-hydrate-skeleton-done / message-list-renderer-skeleton-validated / media-preview-target-skeleton-validated / media-source-owner-preview-skeleton-validated / binary-sidecar-read-app-server-skeleton-validated / full-binary-preview-consumer-skeleton-validated / media-task-sidecar-write-skeleton-validated / media-worker-sidecar-write-skeleton-validated / media-task-result-owner-projection-skeleton-validated / media-task-store-read-model-enrich-skeleton-validated / remote-url-sidecar-cache-skeleton-validated / range-read-object-url-skeleton-validated / chunked-read-assembly-skeleton-validated / media-preview-helper-owner-split / media-preview-runtime-hook-owner-split / media-preview-cancel-memory-skeleton-validated / media-client-abort-detach-skeleton-validated / media-preview-progress-artifact-skeleton-validated / broad-related-test-noise
> 更新时间：2026-07-08
> 目标：把 RuntimeCore `message.delta.contentPart/contentParts` payload 接到 App Server Item/read model、projection package 和 Workbench/GUI，不再让 GUI 或 provider wire event 旁路解释媒体。

## 1. 结论

`RuntimeMessageDeltaContent::from_payload(...)` 已经是 `message.delta` 内容 payload 的 current parser owner；App Server `thread_item_projection/agent_message.rs` 已完成并验证第一层 skeleton，能把 media-only `message.delta.contentPart/contentParts` materialize 成 `agent_message.contentParts`，并按同一 `itemId` 与文本 delta 合并。本轮继续补上协议 generated type、projection package 摘要、GUI history hydrate、streaming sync、MessageList / StreamingRenderer media reference skeleton、preview target skeleton、source owner facts 贯通和 current Electron media-reference fixture；`agentSession/media/read` App Server JSON-RPC skeleton、schema fixture、generated TS type、`@limecloud/app-server-client` `readAgentSessionMedia(...)` 与前端 `AppServerClient.readAgentSessionMedia(...)` 已接上 `SidecarStore::read_bytes_verified(...)` / digest 读取链，并通过 RuntimeCore / App Server 定向测试验证；GUI full binary preview consumer 已能在点击 media reference 时读取 bounded base64 bytes 并生成 media preview artifact。App Server `mediaTaskArtifact/image|audio/complete` 已经能把当前 session 的 `data:` / `file://` / workspace-local 媒体输出写入 `SidecarStore`，并把 `sidecarRef`、MIME、bytes、sha256 owner facts 写回 task record；图片 worker 直接执行 provider 返回 `data:` 输出时也已能经同一 `SidecarStore` 写入 sidecar，并刷新 task result / attempt snapshot 的 `sidecarRef` owner facts。App Server read model 已新增 `media_result` synthetic projection skeleton，能把 `tool.result` / current `item.completed(tool_call)` 中携带 completed media task `record.result.images[].sidecarRef` 的 owner facts 投影为 `agent_message.contentParts.media`；`RuntimeCore::load_session_current(...)` 也已在 session read detail 返回前消费同 workspace media task store，按 `sessionId/threadId/turnId` owner facts fail-closed 过滤已完成 / partial `image_generate` task，把 `record.result.images[].sidecarRef` 自动 enrich 为 synthetic `agent_message.contentParts.media`。远程 URL 输出已进入 App Server sidecar cache skeleton：完成图片任务或 worker 补 owner facts 时，`https` 图片 URL 和 loopback `http` 图片 URL 会在 App Server 受控下载、校验 content-type / size / timeout 后写入 session-scoped media sidecar；非图片、超限、下载失败、无 session id 或无 sidecar store 均 fail closed，不把远程 URL 交给 GUI 直显。`agentSession/media/read` 已补 `offset/length` range window、`totalBytes/contentRange/hasMore` response contract、GUI object URL lifecycle 和前端 bounded 分片组装骨架：`workspace/mediaReferencePreviewArtifacts.ts` 按 range window 读取同一已知 sidecar media，校验 offset 连续、chunk length、full-file sha256、MIME、totalBytes 和总上限后合成 `Blob` object URL；partial / 不连续 / digest 漂移 / 超限均 fail closed 到 metadata fallback；`workspace/useWorkspaceMediaReferencePreviewRuntime.ts` 负责 App Server client lazy read、同一 preview artifact 替换时释放旧 object URL、组件卸载清理、request token、迟到读取 fail-closed、object URL 数量 / bytes 预算、progress artifact、`AbortController` 接线和 Canvas Workbench preview 接线；chunked sidecar read 首段有效 range 后会用同一 artifact id 先写入 loading/progress markdown artifact，完整 object URL 组装成功后再替换为 media artifact；App Server client / renderer client 已补 `AbortSignal` wait-detach skeleton，abort 后会丢弃已发送 request 的迟到 response。media reference fallback artifact、sidecar read params、range / chunked object URL assembly 与 progress artifact 已从 `agentChatWorkspaceHelpers.ts` 拆到 `mediaReferencePreviewArtifacts.ts`，preview runtime 生命周期和前端取消 / 内存策略骨架已从 `AgentChatWorkspace.tsx` 拆到 `useWorkspaceMediaReferencePreviewRuntime.ts`，后续 media preview 扩展必须继续在这些 owner 上推进。当前缺口不是 provider media event 是否能发出，也不是 GUI provider wire 解析，而是真正 streaming transport、其它非 sidecar/sourcePath owner 完整读取链、server-side cancellation / transport kill 和大型媒体分页策略尚未完成：

```text
RuntimeCore message.delta payload
  -> App Server agent_message ThreadItem.contentParts
  -> protocol / generated TS AgentThreadItem
  -> packages/agent-runtime-projection media-capable item projection
  -> AgentChat history / streaming contentParts
  -> MessageList render
  -> Workbench preview target skeleton
```

下一刀应补真正 streaming transport、其它非 sidecar/sourcePath owner 的完整读取链、server-side cancellation / transport kill 和大型媒体分页策略；不要在 `src/components/agent/chat/**` 继续补 provider wire 媒体识别，也不要在 Aster vendor 或 provider wire 里加 UI 字段。

当前工作树仍有并行热区：

- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/agent/src/**`
- `packages/agent-runtime-projection/**`（本轮只接管 `src/threadItems.ts` 与 `tests/projection.test.mjs`）
- `src/components/agent/chat/**`（本轮只接管 `hooks/agentThreadMessageContentParts.ts`、`agentChatHistoryThreadItems.ts`、`agentStreamAgentMessageContentSync.ts`、`components/StreamingRenderer.tsx`、`components/StreamingMediaReferenceCard.tsx` 及对应窄测试）
- `lime-rs/vendor/aster-rust/**`
- `src/lib/governance/**`

本轮只接管了干净的 App Server owner 子模块、protocol/generated type、projection package 和 GUI hydrate/sync/render 窄写集；其余 App Server read model 大文件、完整 Workbench preview 与 GUI smoke 大热区仍不夹写。

## 2. Thread / Turn / Item 归属

| 对象 | 归属 | 要求 |
| --- | --- | --- |
| `message.delta.contentPart/contentParts` | Turn 内 agent message item delta | 必须有 `turn_id`；有 `itemId` 时按 item id 合并，没有 `itemId` 时只能按 turn fallback，不能跨 turn 合并 |
| media reference | Item content part | 只保存 reference 元数据：`uri`、`mime_type`、kind、title、caption、sha256、byte_size；不保存 inline `data:` payload |
| text delta | Item content part | 继续支持 `text`，并和 media parts 按事件 sequence 稳定追加 |
| reasoning / media interleave | Item / reasoning item | Codex 第五次 range check 已回滚 `interleaved response items`，因此不能把它当上游 current 依据；但 Lime 自身 invariant 仍要求有 `itemId` 时按 item id 归属，不得跨 turn / item 合并 |
| Workbench render | GUI projection | 只消费 read model / projection 的 contentParts，不从 provider event 或 Aster event 重新推断 |

## 3. Current Owner Map

| 层 | current owner | 当前事实 | 下一刀动作 |
| --- | --- | --- | --- |
| RuntimeCore payload | `lime-rs/crates/runtime-core/src/runtime_content.rs` | `RuntimeContentPart`、`RuntimeMessageDeltaContent`、`from_payload(...)` 已完成 | 只复用，不再重写 parser |
| LLM event lowering | `lime-rs/crates/runtime-core/src/llm_protocol/events.rs` | text/image/audio 已能发 `message.delta` + `contentPart/contentParts` | 不在 provider wire 追加 GUI shape |
| App Server Item projection | `lime-rs/crates/app-server/src/runtime/thread_item_projection/agent_message.rs` | `item_from_delta(...)` 已消费 RuntimeCore parser，media-only delta 可生成 `agent_message.contentParts`；同一 item 的 text + media delta 可合并；`contentPart/contentParts` alias 不一致和 inline `data:` media fail closed | 继续把 `contentParts` 输出接到协议 / read model / projection package / GUI hydrate |
| App Server read model | `lime-rs/crates/app-server/src/runtime/read_model/messages.rs` | read model 大文件仍在并行热区，本轮未接管 | read model 输出 content parts 或至少保留 thread item content parts |
| Protocol / client type | `lime-rs/crates/app-server-protocol/src/protocol/v0/agent_session.rs`、`packages/app-server-client/src/generated/protocol-types.ts`、`src/lib/api/agentProtocol.ts`、`src/lib/api/agentProtocol.d.ts` | Rust protocol 已导出 `AgentThreadContentReference` / `AgentThreadMessageContentPart` schema，generated TS 已生成同名类型；`AgentThreadContentReference` 已携带 `source_uri/source_path/preview_url` owner facts；手写 AgentProtocol 的 `AgentThreadAgentMessageItem.contentParts` shape 与 RuntimeCore `text/media/reference` 对齐 | 后续若把 `detail.items` 收紧成 typed read model response，继续复用 generated DTO；不得塞 GUI 专用 shape |
| Projection package | `packages/agent-runtime-projection/src/threadItems.ts` | `AgentUiThreadItemProjectionInput.contentParts` 已输出 `contentPartCount`、`mediaKinds`、`referenceUris` 摘要，并跳过 inline `data:` URI | 后续接 Workbench / diagnostics 时继续消费 projection payload，不解析 provider wire |
| GUI history hydrate | `src/components/agent/chat/hooks/agentChatHistoryThreadItems.ts` | 已优先消费 item.contentParts；media reference 进入 `Message.contentParts`，media-only final item 不再被空 text 丢掉；current Electron fixture 已验证 live `item.completed(agent_message.contentParts)` 同步到 assistant message；source owner facts 会随 read model/hydrate 进入 GUI projection，inline `data:` owner fail closed | 后续接通用 binary sidecar read / digest 校验 |
| GUI streaming sync | `src/components/agent/chat/hooks/agentStreamAgentMessageContentSync.ts` | 已支持 agent_message media content parts，按 item id 替换同源 text/media part 后按 sequence 插入 | 后续补更完整重复事件等价判断和 GUI smoke |
| GUI MessageList render | `src/components/agent/chat/components/StreamingRenderer.tsx`、`StreamingMediaReferenceCard.tsx` | 已渲染 `media_reference` 为引用卡片，五语言 media kind/title/open 文案已接入；projection helper 单测覆盖 sidecar reference 转换、source owner 透传与 inline `data:` fail-closed；current Electron fixture 已验证 GUI 卡片可见且不暴露 inline payload | 后续补完整 sidecar store / digest |
| Workbench preview target | `src/components/agent/chat/components/MessageAssistantBody.tsx`、`AgentChatWorkspace.tsx`、`workspace/mediaReferencePreviewArtifacts.ts`、`workspace/useWorkspaceMediaReferencePreviewRuntime.ts`、`src/lib/api/fileSystem.ts`、`electron/main.ts` | `media_reference` 卡片可发出 `MessagePreviewTarget.kind = "media_reference"`；`mediaReferencePreviewArtifacts.ts` 会把 direct media URI、`previewUrl`、绝对 `sourcePath`、`sourceUri` 变成 media artifact，并负责 sidecar read params、range / chunked object URL assembly、progress artifact、`shouldContinue` 中断钩子与 metadata fallback；`useWorkspaceMediaReferencePreviewRuntime.ts` 负责 App Server client lazy read、object URL registry、同一 preview artifact 替换时释放旧 URL、组件卸载清理、request token、迟到 sidecar read fail-closed、object URL 数量 / bytes 预算、progress artifact、`AbortSignal` 接线和 Canvas Workbench preview 接线；Electron `asset://` 只读协议已支撑 dev renderer 加载本地 sourcePath 图片，不展开 inline payload；App Server `agentSession/media/read` skeleton 已能按 session 已知 sidecar ref 读取 base64 bytes / range window 并校验 full-file digest，前端 AppServerClient 网关已接入；没有 direct/source owner 但可读的 `sidecar://` media reference 会按 bounded range window 分片读取并组装 object URL media preview artifact，首段有效 range 后先写 loading/progress markdown artifact，读取失败、partial range、不连续 offset、digest 漂移、超限、并发过期或组件卸载时 fail-closed 到 markdown metadata fallback / no-op；`AgentChatWorkspace.tsx` 只做 hook 接线；App Server `mediaTaskArtifact/image|audio/complete` 已能把当前 session 的 data/file/workspace-local/受控远程 URL 输出写成 media sidecar owner facts；图片 worker 直写 data URL 或 remote URL 输出已能补 sidecar owner facts | 后续补真正 streaming transport、其它非 sidecar/sourcePath owner 完整读取链、server-side cancellation / transport kill 和大型媒体分页策略 |

## 4. 最小源码切片

推荐只接一个垂直切片，不同时重构 GUI 大面：

1. App Server `agent_message.rs`（本轮 skeleton done）
   - 从 `event.payload` 调用 `RuntimeMessageDeltaContent::from_payload(...)`。
   - `text` 为空但 `contentParts` 非空时仍生成 `agent_message` item。
   - item JSON 增加 `contentParts`，保留 `text` 作为向后兼容聚合字段。
   - `merge_item(...)` 追加 / 去重 contentParts；`item.completed` 的完整 contentParts 可替换 delta 累积，`item.updated` 可按 cumulative 语义替换。

2. App Server projection tests（owner 子模块单测 done）
   - `message.delta` 只有 image/audio contentPart 时能生成 `agent_message`。
   - 同一 `itemId` 的 text + media delta 合并为一个 item。
   - 两个不同 `itemId` 的 delta 不互相吞并 contentParts。
   - `contentPart` 与 `contentParts` alias 不一致时 fail closed，不生成错误 media item。

3. Protocol / client type（generated skeleton validated）
   - 给 generated protocol 增加 `AgentThreadContentReference` / `AgentThreadMessageContentPart`，并让 local `AgentThreadAgentMessageItem` 保持 `contentParts?: AgentThreadMessageContentPart[]`。
   - 类型字段使用 RuntimeCore JSON shape：`{ type: "text", text }`、`{ type: "media", kind, reference, caption? }`。
   - 禁止把 GUI 专用 `imageWorkbenchPreview`、`tool_use`、`thinking` 塞进 App Server content part 协议。

4. Projection package（skeleton done）
   - `AgentUiThreadItemProjectionInput` 增加 `contentParts?: readonly unknown[]`。
   - `agent_message` event payload 输出 `contentPartCount`、`mediaKinds`、`referenceUris` 的受控摘要，供 UI state / diagnostics 消费。
   - 不在 package 内解析 file path、data URL 或 provider-specific payload。

5. GUI hydrate / streaming sync / MessageList render（skeleton done / current Electron fixture skeleton validated）
   - `agentChatHistoryThreadItems.ts` 先把 item.contentParts 转成 `Message.contentParts`。
   - `agentStreamAgentMessageContentSync.ts` 按 item id / content sequence upsert media part；text fallback 仍保留。
   - `StreamingRenderer` 显示 reference card，不展开 inline payload，不丢 item。
   - Message preview target 已能打开 media reference artifact：direct media URI、`previewUrl`、绝对 `sourcePath`、`sourceUri` 走 `mediaReferencePreviewArtifacts.ts` media preview；没有 source owner 的 `sidecar://` 若可由当前 session `agentSession/media/read` 读取，则按 bounded range window 分片组装 object URL media preview artifact，否则走 metadata fallback；chunked sidecar read 首段有效 range 后先写 loading/progress artifact，完整 object URL 成功后用同一 artifact id 替换；current Electron fixture 已验证 `agent_message.contentParts.media -> GUI media card -> Canvas Workbench sourcePath image preview` 骨架；media task completion data/file/remote URL sidecar 写入骨架、worker data URL / remote URL 输出 sidecar 写入骨架、tool result carried owner facts synthetic projection 骨架、worker task store -> session read model enrich 骨架、range/object URL lifecycle、chunked read assembly 骨架、helper owner split、preview runtime hook owner split、preview runtime 取消 / object URL 预算骨架、progress artifact 骨架和 App Server client / renderer client AbortSignal wait-detach 骨架已补，真正 streaming transport、server-side cancellation / transport kill 与大型媒体分页策略后续补。

## 5. 不做

- 不改 `lime-rs/vendor/aster-rust/**` 来承接媒体 Item truth。
- 不在 `src/components/agent/chat/**` 直接识别 provider payload 或 MIME，GUI 只消费 read model。
- 不把 inline `data:` media payload 放进 Item/read model；高容量内容必须走 reference / sidecar。
- 不引入 opencode Session / Tool / UI；opencode 只保留 MIME / provider lowering 参考。
- 不把 `message.delta` media output 转成 artifact，除非后续有明确 artifact sidecar owner。

## 6. 验证门槛

本轮已完成：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/thread_item_projection/agent_message.rs"
git diff --check -- "lime-rs/crates/app-server/src/runtime/thread_item_projection/agent_message.rs"
TMPDIR="/tmp" XDG_CACHE_HOME="/tmp/lime-codex-xdg-cache" npm_config_cache="/tmp/lime-codex-npm-cache" CARGO_HOME="/tmp/lime-codex-cargo-home-media-item" CARGO_TARGET_DIR="/tmp/lime-codex-media-item-target" CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_PROFILE_TEST_STRIP=none CARGO_BUILD_JOBS=1 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server media_only_delta_creates_agent_message_content_parts -- --nocapture
```

结果：`media_only_delta_creates_agent_message_content_parts` 1 passed，849 filtered out；同一命令还列出 main / integration test targets 的 0-test filtered runs，全部通过。Cargo home 与 target 均在 `/tmp` 下，没有使用 `/Users/coso/Library/Caches`。

App Server projection：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server agent_message_delta -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server thread_item_projection -- --nocapture
```

App Server media read skeleton：

```bash
TMPDIR="/tmp" XDG_CACHE_HOME="/tmp/lime-codex-xdg-cache" npm_config_cache="/tmp/lime-codex-npm-cache" CARGO_HOME="/tmp/lime-codex-cargo-home-schema-write" CARGO_TARGET_DIR="/tmp/lime-codex-schema-write-target" CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 CARGO_BUILD_JOBS=2 cargo run --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol --bin write_schema_fixtures
TMPDIR="/tmp" XDG_CACHE_HOME="/tmp/lime-codex-xdg-cache" npm_config_cache="/tmp/lime-codex-npm-cache" npm run generate:protocol-types
TMPDIR="/tmp" XDG_CACHE_HOME="/tmp/lime-codex-xdg-cache" npm_config_cache="/tmp/lime-codex-npm-cache" npm run check:protocol-types
TMPDIR="/tmp" XDG_CACHE_HOME="/tmp/lime-codex-xdg-cache" npm_config_cache="/tmp/lime-codex-npm-cache" npm --workspace "@limecloud/app-server-client" test
TMPDIR="/tmp" XDG_CACHE_HOME="/tmp/lime-codex-xdg-cache" npm_config_cache="/tmp/lime-codex-npm-cache" node scripts/check-app-server-client-contract.mjs
rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/session_media_reader.rs" "lime-rs/crates/app-server/src/runtime/sidecar_store.rs"
git diff --check -- "lime-rs/crates/app-server/src/runtime/session_media_reader.rs" "lime-rs/crates/app-server/src/runtime/sidecar_store.rs" "lime-rs/crates/app-server-protocol/schema/json" "packages/app-server-client/src" "packages/app-server-client/tests/client.test.mjs"
```

历史结果：schema fixture / generated TS 已包含 `AgentSessionMediaReadParams`、`AgentSessionMediaReadResponse` 与 `agentSession/media/read`；`@limecloud/app-server-client` 已新增 `readAgentSessionMedia(...)` request / connection method；`check:protocol-types`、app-server-client contract 与 rustfmt / diff check 曾先行通过。此前 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --lib session_media_reader -- --nocapture` 在 cold compile 阶段被 SIGTERM 中断；该阻塞已由下方补充验证收口。

本轮补充验证后更新结果：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core runtime_content
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_registry_matches_declared_type_names
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --lib session_media_reader -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --lib sidecar_store -- --nocapture
npm run check:protocol-types
npx vitest run "src/lib/api/appServer.test.ts"
npx vitest run "packages/app-server-client/tests/client.test.mjs"
npm run test:contracts
```

结果：RuntimeCore `runtime_content` 15 tests passed；app-server-protocol schema registry 1 test passed；App Server `session_media_reader` 3 tests passed；App Server `sidecar_store` 4 tests passed；`check:protocol-types` 无漂移；前端 AppServerClient 网关 31 tests passed；`@limecloud/app-server-client` 54 tests passed；`test:contracts` 全链路通过。`agentSession/media/read` skeleton 现在可标记为 App Server current 骨架已验证；当时仍不声明 GUI full binary preview、sidecar write/store 或 streaming / range read 完成；后续已补 GUI bounded data URL consumer、media task completion data/file sidecar write skeleton、worker data URL sidecar write skeleton 和 remote URL sidecar cache skeleton，仍不声明 streaming / range read 或大型二进制 object URL 生命周期完成。

GUI full binary preview consumer skeleton 验证：

```bash
npx vitest run "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/hooks/agentThreadMessageContentParts.unit.test.ts" "src/lib/api/appServer.test.ts"
npx eslint "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/hooks/agentThreadMessageContentParts.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" --max-warnings 0
npm exec tsc -- --noEmit --project "tsconfig.renderer.json" --pretty false
npm run test:contracts
npm run verify:gui-smoke
```

结果：3 files / 67 tests passed；ESLint 通过；renderer typecheck 通过；`test:contracts` 通过；`verify:gui-smoke` 通过。该步证明 UI read model 透传 `sidecarRef`、Workspace 能构造 App Server media read params，并把 `agentSession/media/read` 返回的 bounded base64 bytes 转成 media preview artifact；当时仍不声明 worker/provider 输出写入 sidecar、streaming / range read 或大型二进制 object URL 管理完成；后续已补 media task completion data/file sidecar write skeleton 和 worker data URL sidecar write skeleton。

Media task sidecar write/store skeleton 验证：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server media_task -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --test media_task_jsonrpc -- --nocapture
```

结果：app-server `media_task` filter 30 tests passed；`media_task_jsonrpc` 6 tests passed。该步证明 App Server current `mediaTaskArtifact/image|audio/complete` completion 边界会把当前 session 的 `data:`、`file://` 或 workspace-local 媒体输出写入 `SidecarStore`，并把 `sidecarRef`、MIME、bytes、sha256 owner facts 写回 task record；无 sidecar store、无 session id、远程 URL 或不可读本地文件时保持原结果，不做 provider wire / GUI 旁路解析。当时仍不声明 worker 直写输出、远程 URL 下载/缓存、streaming / range read、大型二进制 object URL 生命周期或 `agent_message.contentParts.media` 自动生成 owner facts 完成；后续已补 worker data URL sidecar write skeleton、tool result carried owner facts synthetic projection skeleton 和 remote URL sidecar cache skeleton。

Media task worker sidecar write skeleton 验证：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server execute_image_task_writes_worker_output_to_media_sidecar -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server media_task -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --test media_task_jsonrpc -- --nocapture
git diff --check
```

结果：新增 worker sidecar 定向测试 1 test passed；app-server `media_task` filter 31 tests passed；`media_task_jsonrpc` 6 tests passed；`git diff --check` 通过。该步证明 App Server main / LocalAppDataSource / worker scheduler 共用当前 `SidecarStore`，图片 worker 直接执行 provider 返回 `data:` 输出后，会复用 media task sidecar owner 把 bytes 写入 session-scoped media sidecar，并刷新 task `result.images[].sidecarRef` 与当前 attempt `result_snapshot.images[].sidecarRef`；同时 current JSON-RPC completion 路径仍能写入 data URL sidecar。`npm run test:contracts` 当前失败在并行 Plugin runtime projection 契约热区（`src/features/plugin/runtime/*` 缺 App Server replay labels / tool call replay helper 断言），不属于本 slice 写集；后续已补 tool result carried owner facts synthetic projection skeleton、worker task store enrich skeleton 和 remote URL sidecar cache skeleton；仍不声明 streaming / range read 或大型二进制 object URL 生命周期完成。

Media task result owner facts -> contentParts synthetic projection 骨架验证：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server media_result -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server thread_item_projection -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --test media_task_jsonrpc -- --nocapture
git diff --check
```

结果：`media_result` 2 tests passed；`thread_item_projection` 15 tests passed；`media_task_jsonrpc` 6 tests passed；`git diff --check` 通过。该步只声明 `tool.result` / current `item.completed(tool_call)` 已携带 completed media task `record.result.images[].sidecarRef` 时，App Server read model 可生成 synthetic `agent_message.contentParts.media`；当时不声明 worker 异步完成后的 task store enrich。后续已补 task store enrich skeleton 和 remote URL sidecar cache skeleton，仍不声明 streaming / range read 或大型二进制 object URL 生命周期完成。

Media task store -> session read model enrich 骨架验证：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server load_session_current_enriches_completed_media_task_store_results -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server media_result -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server thread_item_projection -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --test media_task_jsonrpc -- --nocapture
```

结果：新增 read model enrich 测试 1 test passed；`media_result` 2 tests passed；`thread_item_projection` 15 tests passed；`media_task_jsonrpc` 6 tests passed。该步声明 worker 异步完成后的 media task store 已可在 `RuntimeCore::load_session_current(...)` 返回前，按 workspace + `sessionId/threadId/turnId` owner facts 过滤 completed / partial `image_generate` task，并把 `record.result.images[].sidecarRef` enrich 成 synthetic `agent_message.contentParts.media`；后续已补远程 URL sidecar cache skeleton，仍不声明 streaming / range read 或大型二进制 object URL 生命周期完成。

Remote URL sidecar cache skeleton 验证：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server media_task -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --test media_task_jsonrpc -- --nocapture
```

结果：app-server `media_task` filter 34 tests passed；`media_task_jsonrpc` 6 tests passed。该步声明 App Server media task completion 与 worker sidecar owner 复用路径已能把 provider remote URL 输出缓存为 session-scoped media sidecar：`https` 图片 URL 与 loopback `http` 图片 URL 通过 App Server 受控下载，校验 content-type / size / timeout 后写入 `SidecarStore` 并回写 `sidecarRef` owner facts；非图片 MIME、超限、下载失败、无 session id 或无 sidecar store 均 fail closed，不让 GUI/provider wire 直显远程 URL。仍不声明 streaming / range read、大型二进制 object URL 生命周期或其它非 sourcePath owner 完整读取链完成。

Range read + object URL lifecycle skeleton 验证：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server -p app-server-protocol
npm run check:protocol-types
npx vitest run "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/lib/api/appServer.test.ts"
npm exec tsc -- --noEmit --project "tsconfig.renderer.json" --pretty false
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_registry_matches_declared_type_names -- --nocapture
CARGO_TARGET_DIR="/tmp/lime-soul-media-range-target" CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=1 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --lib sidecar -- --nocapture
npm exec eslint -- "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" "src/lib/api/appServer.test.ts" --max-warnings 0
git diff --check
```

结果：`cargo fmt` 通过；`check:protocol-types` 无漂移；前端 media helper / AppServerClient gateway 2 files / 66 tests passed；renderer typecheck 通过；app-server-protocol schema registry 1 test passed；App Server 独立 target `sidecar` filter 19 tests passed；scoped ESLint 通过；scoped `git diff --check` 通过。该步声明 `agentSession/media/read` 已具备 `offset/length` window request、`totalBytes/contentRange/hasMore` response contract，GUI 完整窗口响应已走 `Blob + URL.createObjectURL` preview，并在同一 preview artifact 替换与组件卸载时释放本组件创建的 object URL；partial range 不伪装成完整媒体预览。仍不声明 streaming read、其它非 sourcePath owner 完整读取链或大型二进制分片预览完成。

Chunked read assembly skeleton 验证：

```bash
npx vitest run "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/lib/api/appServer.test.ts"
npm exec eslint -- "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" "src/lib/api/appServer.test.ts" --max-warnings 0
git diff --check -- "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" "src/lib/api/appServer.test.ts"
./node_modules/.bin/tsc --noEmit --project "tsconfig.renderer.json" --pretty false
```

结果：前端 media helper / AppServerClient gateway 2 files / 70 tests passed；scoped ESLint 通过；scoped `git diff --check` 通过；renderer typecheck 会话耗时较长但最终无诊断、exit code 0。该步声明 GUI 已能用 `agentSession/media/read` range window 多次读取同一 bounded sidecar media，并在 offset 连续、chunk length、full-file sha256、MIME、totalBytes 和总上限均一致时组装 `Blob` object URL；不连续、digest 漂移或超出前端预览上限均 fail closed 且不创建 object URL。当时仍不声明真正 streaming transport、front-end progress artifact、其它非 sidecar/sourcePath owner 完整读取链，或大型媒体取消 / 分页 / 内存策略完成。

Media preview helper owner split 验证：

```bash
npx vitest run "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/lib/api/appServer.test.ts"
npm exec eslint -- "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.ts" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" "src/lib/api/appServer.test.ts" --max-warnings 0
./node_modules/.bin/tsc --noEmit --project "tsconfig.renderer.json" --pretty false
git diff --check -- "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.ts" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" "src/lib/api/appServer.test.ts" "internal/exec-plans/soul-style-output-surface-convergence-plan.md" "internal/research/refactor/v1/p2-media-item-projection-handoff.md" "internal/roadmap/soul/README.md" "internal/roadmap/soul/personal-style-output-surfaces.md"
npm run verify:gui-smoke
```

结果：media owner / workspace helper / AppServerClient gateway 3 files / 70 tests passed；scoped ESLint 通过；renderer typecheck 通过；scoped `git diff --check` 通过；GUI smoke 通过，Electron 输出 `renderer loaded`、`app-server initialized protocol=appserver.v0 version=1.94.0`、`claw workbench shell ready`、`memory settings ready`。该步声明 `mediaReferencePreviewArtifacts.ts` 已成为 media reference preview helper current owner，原 `agentChatWorkspaceHelpers.ts` 不再承接 sidecar read / range assembly 逻辑；当时仍不声明 front-end progress artifact、streaming transport 或大型媒体策略完成。

Media preview runtime hook owner split 验证：

```bash
npx vitest run "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.test.tsx" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/lib/api/appServer.test.ts"
npm exec eslint -- "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.ts" "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.test.tsx" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.ts" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" "src/lib/api/appServer.test.ts" --max-warnings 0
./node_modules/.bin/tsc --noEmit --project "tsconfig.renderer.json" --pretty false
git diff --check -- "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.ts" "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.test.tsx" "src/components/agent/chat/AgentChatWorkspace.tsx" "internal/exec-plans/soul-style-output-surface-convergence-plan.md" "internal/research/refactor/v1/p2-media-item-projection-handoff.md" "internal/roadmap/soul/README.md" "internal/roadmap/soul/personal-style-output-surfaces.md"
npm run verify:gui-smoke
```

结果：Vitest 4 files / 72 tests passed；scoped ESLint 通过；renderer typecheck 通过；scoped `git diff --check` 通过；GUI smoke 通过，Electron 输出 `renderer loaded`、`app-server initialized protocol=appserver.v0 version=1.94.0`、`claw workbench shell ready`、`memory settings ready`。该步声明 `useWorkspaceMediaReferencePreviewRuntime.ts` 已成为 media preview runtime 生命周期 current owner，覆盖 direct URI 不实例化 App Server client、sidecar read 生成 object URL、同一 preview artifact 替换释放旧 URL、组件卸载释放当前 URL；当时仍不声明 front-end progress artifact、streaming transport、其它非 sidecar/sourcePath owner 完整读取链或大型媒体取消 / 分页 / 内存策略完成。

Media preview runtime cancel / memory policy skeleton 验证：

```bash
npx vitest run "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.test.tsx" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/lib/api/appServer.test.ts"
npm exec eslint -- "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.ts" "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.test.tsx" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.ts" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" "src/lib/api/appServer.test.ts" --max-warnings 0
./node_modules/.bin/tsc --noEmit --project "tsconfig.renderer.json" --pretty false
git diff --check -- "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.ts" "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.test.tsx" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.ts" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "internal/exec-plans/soul-style-output-surface-convergence-plan.md" "internal/research/refactor/v1/p2-media-item-projection-handoff.md" "internal/roadmap/soul/README.md" "internal/roadmap/soul/personal-style-output-surfaces.md"
npm run verify:gui-smoke
```

结果：Vitest 4 files / 76 tests passed；scoped ESLint 通过；renderer typecheck 通过；scoped `git diff --check` 通过；`npm run verify:gui-smoke` 第二轮通过，Electron smoke 输出 `renderer loaded`、`app-server initialized protocol=appserver.v0 version=1.94.0`、`claw workbench shell ready`、`memory settings ready`。第一轮 GUI smoke 曾被并行 Rust 热区 `lime-rs/crates/agent/src/tools/skill_tool_gate.rs` 缺 `std::sync::OnceLock` import 阻塞，已用最小 import 解开，不改变 Skill gate 逻辑。该步只声明前端 preview runtime 的 request token、迟到读取 fail-closed、unmount no-op、object URL budget 和 helper `shouldContinue` 中断骨架；后续已补 App Server client / renderer client AbortSignal wait-detach skeleton 和 front-end progress artifact skeleton，但仍不声明 server-side cancellation、streaming transport、其它非 sidecar/sourcePath owner 完整读取链或大型媒体分页策略完成。

Media client AbortSignal wait-detach skeleton 验证：

```bash
npm --prefix "packages/app-server-client" run build
./node_modules/.bin/tsc --noEmit --project "tsconfig.renderer.json" --pretty false
npm --prefix "packages/app-server-client" test
npx vitest run "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.test.tsx" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/lib/api/appServer.test.ts"
npm exec eslint -- "packages/app-server-client/src/connection.ts" "packages/app-server-client/tests/client.test.mjs" "src/lib/api/appServerClient.ts" "src/lib/api/appServerClientMethods.ts" "src/lib/api/appServerTypes.ts" "src/lib/api/appServer.test.ts" "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.ts" "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.test.tsx" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.ts" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" --max-warnings 0
npm run test:contracts
```

结果：`@limecloud/app-server-client` build 通过；renderer typecheck 通过；`@limecloud/app-server-client` tests 2 files / 58 tests passed；前端 media runtime / helper / AppServerClient gateway 4 files / 77 tests passed；scoped ESLint 通过；`npm run test:contracts` 通过。该步声明 App Server client wait loop 和 renderer AppServerClient 已支持 `AbortSignal`，已发送 request abort 后会 detach 并丢弃 late response；GUI media preview supersede / unmount 会 abort 当前 media read。该步不是 Rust App Server / Electron IPC / sidecar I/O 的 server-side cancellation。

Media preview progress artifact skeleton 验证：

```bash
node -e 'const fs=require("fs"); for (const locale of ["zh-CN","zh-TW","en-US","ja-JP","ko-KR"]) JSON.parse(fs.readFileSync(`src/i18n/resources/${locale}/agent.json`, "utf8"));'
npx vitest run "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.test.tsx"
npm exec eslint -- "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.ts" "src/components/agent/chat/workspace/mediaReferencePreviewArtifacts.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.ts" "src/components/agent/chat/workspace/useWorkspaceMediaReferencePreviewRuntime.test.tsx" --max-warnings 0
```

结果：五语言 `agent.json` JSON 解析通过；media preview artifacts / runtime hook 2 files / 21 tests passed；scoped ESLint 通过。该步声明 front-end progress artifact 骨架完成：chunked sidecar read 首段有效 range 后先写 loading/progress markdown artifact，完整 object URL 成功后用同一 artifact id 替换。该步不是真正 streaming transport、不是 server-side cancellation，也不是大型媒体分页策略。

RuntimeCore owner 回归：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core runtime_content -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core llm_ -- --nocapture
```

Projection / GUI：

```bash
npx vitest run "packages/agent-runtime-projection/tests/projection.test.mjs"
npx vitest run "src/components/agent/chat/hooks/agentChatHistory.timeline.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.test.ts" "src/components/agent/chat/hooks/agentStreamAgentMessageContentSync.unit.test.ts"
```

本轮补充验证：

```bash
npm --prefix "packages/agent-runtime-projection" run build
npm --prefix "packages/agent-runtime-projection" test -- --test-name-pattern "thread item helpers"
npx vitest run "src/components/agent/chat/hooks/agentStreamAgentMessageContentSync.unit.test.ts" "src/components/agent/chat/hooks/agentChatHistory.timeline.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
git diff --check -- "src/lib/api/agentProtocol.ts" "src/lib/api/agentProtocol.d.ts" "src/components/agent/chat/hooks/agentThreadMessageContentParts.ts" "src/components/agent/chat/hooks/agentChatHistoryThreadItems.ts" "src/components/agent/chat/hooks/agentStreamAgentMessageContentSync.ts" "src/components/agent/chat/hooks/agentStreamAgentMessageContentSync.unit.test.ts" "src/components/agent/chat/hooks/agentChatHistory.timeline.test.ts" "packages/agent-runtime-projection/src/threadItems.ts" "packages/agent-runtime-projection/tests/projection.test.mjs"
```

结果：projection package build 通过；thread item helpers 所在 package 测试通过 95 tests；GUI history / stream 两个定向 Vitest 通过 16 tests；scoped `git diff --check` 通过。`npm run test:related -- ...` 扩面到 `AgentChatPage`、`TaskCenterUtilityToolbar`、web retrieval 等既有 GUI / i18n 热区，出现与本轮写集无关的失败后按骨架优先中断，退出码 130，不作为本 slice blocker。

MessageList renderer 骨架补充验证：

```bash
TMPDIR="/tmp" XDG_CACHE_HOME="/tmp/lime-codex-xdg-cache" npm_config_cache="/tmp/lime-codex-npm-cache" npm exec vitest run "src/components/agent/chat/hooks/agentThreadMessageContentParts.unit.test.ts" "src/components/agent/chat/hooks/agentStreamAgentMessageContentSync.unit.test.ts" "src/components/agent/chat/hooks/agentChatHistory.timeline.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/messageListItemProjection.contentParts.unit.test.ts"
npm exec vitest run "src/i18n/__tests__/loadNamespace.test.ts"
npm exec tsc -- --noEmit --project "tsconfig.renderer.json" --pretty false
```

结果：media renderer 骨架 5 test files / 50 tests passed；i18n loader 1 file / 9 tests passed；renderer typecheck 通过且无输出。新增 `agentThreadMessageContentParts.unit.test.ts` 直接覆盖 App Server `media` content part 到 GUI `media_reference` 的 sidecar metadata 转换，以及 inline `data:` URI fail closed。后续 `media-reference` current Electron fixture 已补真实 GUI 骨架验证，见下方记录。

Media preview target 骨架补充验证：

```bash
npm exec vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/MessageList.mediaTasks.test.tsx" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts"
npm exec vitest run "src/i18n/__tests__/loadNamespace.test.ts"
npm exec tsc -- --noEmit --project "tsconfig.renderer.json" --pretty false
```

结果：3 test files / 73 tests passed；i18n loader 1 file / 9 tests passed；renderer typecheck 通过且无输出。覆盖 `media_reference` 卡片点击到 `MessagePreviewTarget.kind = "media_reference"` 的 UI target 链，以及 direct URI media artifact / sidecar metadata fallback 两种 Workbench artifact skeleton。当时通用 binary sidecar read 仍未完成；后续已补 App Server `agentSession/media/read` 已知 session sidecar bytes 读取与 digest / size 校验骨架、GUI bounded data URL preview consumer、media task completion data/file sidecar write skeleton、worker data URL sidecar write skeleton、tool result carried owner facts synthetic projection skeleton、worker task store enrich skeleton 和 remote URL sidecar cache skeleton。仍待做的是 streaming / range read 和大型二进制 object URL 生命周期。

Current Electron media source owner fixture skeleton 验证：

```bash
node --check "scripts/agent-runtime/claw-chat-current-fixture-media-reference.mjs"
node --check "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs"
npm exec vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/current-fixture-regression-smoke.test.mjs"
node "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs" --scenario media-reference --prefix claw-chat-current-fixture-media-reference-source-owner-regression-minimal-asset --timeout-ms 180000 --app-url http://127.0.0.1:1421/
```

结果：fixture guard 2 files / 42 tests passed；真实 Electron current fixture 通过，summary 位于 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-media-reference-source-owner-regression-minimal-asset-summary.json`。证据显示 `electronPreloadBridge=true`、`appServerJsonRpcUsed=true`、`mediaReferencePromptReachedBackend=true`、`guiMediaReferenceCardVisible=true`、`guiMediaReferenceDoesNotExposeInlinePayload=true`、`guiMediaReferencePreviewOpened=true`、`readModelMediaReferenceObserved=true`、`readModelMediaReferenceCompleted.hasSourceOwner=true`；Workbench 侧 `layoutMode="chat-canvas"`、`canvasWorkbenchVisible=true`、`workbenchPreviewVisible=true`、`previewImageVisible=true`、`previewImageSrc=asset://...fixture-media-reference.png`、`previewTextIncludesSidecarSource=false`、`bodyTextIncludesInlinePayload=false`，且 `consoleErrors=[]`。该证据只声明 `agent_message.contentParts.media -> source owner facts -> GUI media card -> Canvas Workbench sourcePath image preview` 骨架完成；后续 App Server `agentSession/media/read` 已补读取 / digest 骨架，GUI bounded data URL preview consumer、media task completion data/file sidecar write skeleton、worker data URL sidecar write skeleton、tool result carried owner facts synthetic projection skeleton、worker task store enrich skeleton 和 remote URL sidecar cache skeleton 也已补上；仍不声明 streaming / range read 或大型二进制 object URL 生命周期完成。

本轮新增 source owner / asset protocol 补充验证：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/runtime-core/src/runtime_content.rs" "lime-rs/crates/runtime-core/src/llm_protocol/events.rs" "lime-rs/crates/app-server-protocol/src/protocol/v0/agent_session.rs" "lime-rs/crates/app-server/src/runtime/thread_item_projection/agent_message.rs"
npm run check:protocol-types
npm exec vitest run "src/components/agent/chat/hooks/agentThreadMessageContentParts.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.test.ts"
npm exec vitest run "src/lib/api/fileSystem.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts"
npm exec vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/current-fixture-regression-smoke.test.mjs"
CARGO_TARGET_DIR="/tmp/lime-codex-media-source-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core runtime_content -- --nocapture
CARGO_TARGET_DIR="/tmp/lime-codex-media-source-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server media_only_delta_creates_agent_message_content_parts -- --nocapture
CARGO_TARGET_DIR="/tmp/lime-codex-media-source-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server inline_media_source_owner_is_fail_closed -- --nocapture
npm run typecheck:electron
npm exec tsc -- --noEmit --project "tsconfig.renderer.json" --pretty false
node "scripts/electron/build-host.mjs"
```

结果：协议类型无漂移；相关 Vitest 5 files / 84 tests passed；fixture guard 2 files / 42 tests passed；RuntimeCore `runtime_content` 15 tests passed；App Server source owner 正向与 inline owner fail-closed 两条定向测试通过；Electron typecheck / renderer typecheck / host build 通过。

Contract / GUI smoke：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_fixtures_match_generated_output -- --nocapture
npm run check:protocol-types
npm run test:contracts
npm run smoke:agent-runtime-current-fixture
```

如果触碰可见 media render 或 Workbench 主路径，再补：

```bash
npm run verify:gui-smoke
```

## 7. 接管条件

满足任一条件后可开源码刀：

1. `git status --short -- "lime-rs/crates/app-server/src/runtime" "packages/agent-runtime-projection" "src/components/agent/chat"` 显示目标窄写集干净。
2. 隔壁进程在 [priority-tracking-plan.md](./priority-tracking-plan.md) 标注移交 App Server Item/read model、projection package、GUI contentParts 写集。
3. 用户明确授权当前进程接管上述脏热区。

未满足前，只允许继续只读审计、P3 upstream loop 或文档化 handoff。

## 8. 治理分类

- `current`：RuntimeCore `RuntimeMessageDeltaContent`、App Server `ThreadItem.agent_message.contentParts` skeleton、protocol/generated `AgentThreadMessageContentPart`、local protocol `AgentThreadMessageContentPart`、source owner facts、projection package contentParts summary、GUI history / streaming media reference skeleton、MessageList / StreamingRenderer media reference card skeleton、media reference preview target skeleton、Electron `asset://` 本地只读 preview protocol、sourcePath-backed current Electron media-reference fixture skeleton、App Server `agentSession/media/read` skeleton、schema/generated TS `AgentSessionMediaRead*`、`@limecloud/app-server-client` `readAgentSessionMedia(...)`、前端 `AppServerClient.readAgentSessionMedia(...)` 网关、digest checked known-session sidecar read、range window read contract、GUI bounded data URL full binary preview consumer skeleton、GUI object URL lifecycle skeleton、GUI chunked read assembly skeleton、front-end progress artifact skeleton、media preview helper owner split、media preview runtime hook owner split、preview runtime request token / stale result fail-closed / object URL budget skeleton、App Server client / renderer client `AbortSignal` wait-detach skeleton、App Server `mediaTaskArtifact/image|audio/complete` data/file/workspace-local/remote URL media sidecar write skeleton、image task worker data URL / remote URL sidecar write skeleton、media task result owner facts -> `agent_message.contentParts.media` 自动投影、media task store -> session read model enrich skeleton。
- `current-pending-consumer`：真正 streaming transport、其它非 sidecar/sourcePath owner 完整媒体读取、server-side cancellation / transport kill、大型媒体分页策略；必须在后续代码刀接通并验证后才能改成完成态。
- `compat`：Aster vendor provider/executor 只作为事件来源和兼容执行面，不承接 media item truth。
- `deprecated`：旧 `agent_runtime_*` production surface、GUI provider-wire media parsing、把有 `itemId` 的 delta 退化成 active item 猜测。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 media payload 直接塞进 inline `data:` Item 的路径。

## 9. 上游回滚说明

2026-07-07 P3 fifth range check 已确认 Codex commit `7b4e70d567` 回滚了第四次记录的 `[core] Support interleaved response items`。因此：

1. 本 handoff 不能再把 Codex interleaved item 行为写成上游 current 采纳依据。
2. Lime 仍应实现自己的 `Thread / Turn / Item` 稳定归属：有 `itemId` 时按 item id 合并；没有 `itemId` 时只能在当前 turn 内 fail-closed 或明确 fallback。
3. 后续测试命名应表达 Lime invariant，如 `different_item_ids_do_not_merge_content_parts`，不要写成 `codex_interleaved_items_are_supported`。
