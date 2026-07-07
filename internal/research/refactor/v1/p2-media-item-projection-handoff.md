# P2 Media Item Projection Handoff

> 状态：app-server-agent-message-skeleton-validated / protocol-generated-skeleton-validated / projection-hydrate-skeleton-done / message-list-renderer-skeleton-validated / media-preview-target-skeleton-validated / media-source-owner-preview-skeleton-validated / binary-sidecar-read-app-server-skeleton-wired / binary-sidecar-read-runtime-test-sigterm / full-binary-preview-pending / broad-related-test-noise
> 更新时间：2026-07-07
> 目标：把 RuntimeCore `message.delta.contentPart/contentParts` payload 接到 App Server Item/read model、projection package 和 Workbench/GUI，不再让 GUI 或 provider wire event 旁路解释媒体。

## 1. 结论

`RuntimeMessageDeltaContent::from_payload(...)` 已经是 `message.delta` 内容 payload 的 current parser owner；App Server `thread_item_projection/agent_message.rs` 已完成并验证第一层 skeleton，能把 media-only `message.delta.contentPart/contentParts` materialize 成 `agent_message.contentParts`，并按同一 `itemId` 与文本 delta 合并。本轮继续补上协议 generated type、projection package 摘要、GUI history hydrate、streaming sync、MessageList / StreamingRenderer media reference skeleton、preview target skeleton、source owner facts 贯通和 current Electron media-reference fixture；`agentSession/media/read` App Server JSON-RPC skeleton、schema fixture、generated TS type 与 `@limecloud/app-server-client` `readAgentSessionMedia(...)` 已接上 `SidecarStore::read_bytes_verified(...)` / digest 读取链。当前缺口不是 provider media event 是否能发出，也不是 GUI provider wire 解析，而是 Rust app-server 定向测试在当前环境被 SIGTERM 中断、GUI full binary preview consumer、sidecar media store 和更多 media source owner 类型尚未完成：

```text
RuntimeCore message.delta payload
  -> App Server agent_message ThreadItem.contentParts
  -> protocol / generated TS AgentThreadItem
  -> packages/agent-runtime-projection media-capable item projection
  -> AgentChat history / streaming contentParts
  -> MessageList render
  -> Workbench preview target skeleton
```

下一刀必须先补 `agentSession/media/read` Rust 定向测试可重复通过，再接 GUI full binary preview / sidecar media store；不要在 `src/components/agent/chat/**` 继续补 provider wire 媒体识别，也不要在 Aster vendor 或 provider wire 里加 UI 字段。

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
| Workbench preview target | `src/components/agent/chat/components/MessageAssistantBody.tsx`、`AgentChatWorkspace.tsx`、`workspace/agentChatWorkspaceHelpers.ts`、`src/lib/api/fileSystem.ts`、`electron/main.ts` | `media_reference` 卡片可发出 `MessagePreviewTarget.kind = "media_reference"`；workspace helper 会把 direct media URI、`previewUrl`、绝对 `sourcePath`、`sourceUri` 变成 media artifact，把没有 source owner 的 `sidecar://` 引用 fail-closed 成 markdown metadata artifact；Electron `asset://` 只读协议已支撑 dev renderer 加载本地 sourcePath 图片，不展开 inline payload；App Server `agentSession/media/read` skeleton 已能按 session 已知 sidecar ref 读取 base64 bytes 并校验 digest | 后续补 Rust 定向测试稳定通过、GUI full binary preview、sidecar media store |

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
   - Message preview target 已能打开 media reference artifact：direct media URI、`previewUrl`、绝对 `sourcePath`、`sourceUri` 走 media preview，没有 source owner 的 `sidecar://` 走 metadata fallback；current Electron fixture 已验证 `agent_message.contentParts.media -> GUI media card -> Canvas Workbench sourcePath image preview` 骨架；`agentSession/media/read` App Server/client skeleton 已接通，Rust 定向测试因当前环境 SIGTERM 未跑到测试体，GUI full binary preview、sidecar media store 后续补。

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

结果：schema fixture / generated TS 已包含 `AgentSessionMediaReadParams`、`AgentSessionMediaReadResponse` 与 `agentSession/media/read`；`@limecloud/app-server-client` 已新增 `readAgentSessionMedia(...)` request / connection method；`check:protocol-types` 通过，app-server-client 2 files / 56 tests 通过，app-server-client contract 287 checks 通过，rustfmt 与 diff check 通过。`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --lib session_media_reader -- --nocapture` 已用 `/tmp` cache / target 多次续跑，但在 cold compile 阶段被 SIGTERM 中断，尚未跑到测试体；不能把 RuntimeCore media read 单测标为通过。

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

结果：3 test files / 73 tests passed；i18n loader 1 file / 9 tests passed；renderer typecheck 通过且无输出。覆盖 `media_reference` 卡片点击到 `MessagePreviewTarget.kind = "media_reference"` 的 UI target 链，以及 direct URI media artifact / sidecar metadata fallback 两种 Workbench artifact skeleton。本轮后续已补 source owner facts 和 sourcePath-backed media preview；通用 binary sidecar read 仍未完成。

Current Electron media source owner fixture skeleton 验证：

```bash
node --check "scripts/agent-runtime/claw-chat-current-fixture-media-reference.mjs"
node --check "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs"
npm exec vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/current-fixture-regression-smoke.test.mjs"
node "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs" --scenario media-reference --prefix claw-chat-current-fixture-media-reference-source-owner-regression-minimal-asset --timeout-ms 180000 --app-url http://127.0.0.1:1421/
```

结果：fixture guard 2 files / 42 tests passed；真实 Electron current fixture 通过，summary 位于 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-media-reference-source-owner-regression-minimal-asset-summary.json`。证据显示 `electronPreloadBridge=true`、`appServerJsonRpcUsed=true`、`mediaReferencePromptReachedBackend=true`、`guiMediaReferenceCardVisible=true`、`guiMediaReferenceDoesNotExposeInlinePayload=true`、`guiMediaReferencePreviewOpened=true`、`readModelMediaReferenceObserved=true`、`readModelMediaReferenceCompleted.hasSourceOwner=true`；Workbench 侧 `layoutMode="chat-canvas"`、`canvasWorkbenchVisible=true`、`workbenchPreviewVisible=true`、`previewImageVisible=true`、`previewImageSrc=asset://...fixture-media-reference.png`、`previewTextIncludesSidecarSource=false`、`bodyTextIncludesInlinePayload=false`，且 `consoleErrors=[]`。该证据只声明 `agent_message.contentParts.media -> source owner facts -> GUI media card -> Canvas Workbench sourcePath image preview` 骨架完成，不声明通用 binary sidecar read、sidecar media store 或 digest 校验完成。

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

- `current`：RuntimeCore `RuntimeMessageDeltaContent`、App Server `ThreadItem.agent_message.contentParts` skeleton、protocol/generated `AgentThreadMessageContentPart`、local protocol `AgentThreadMessageContentPart`、source owner facts、projection package contentParts summary、GUI history / streaming media reference skeleton、MessageList / StreamingRenderer media reference card skeleton、media reference preview target skeleton、Electron `asset://` 本地只读 preview protocol、sourcePath-backed current Electron media-reference fixture skeleton、App Server `agentSession/media/read` skeleton、schema/generated TS `AgentSessionMediaRead*`、`@limecloud/app-server-client` `readAgentSessionMedia(...)`。
- `current-pending-consumer`：`session_media_reader` Rust 定向测试稳定通过、GUI full binary preview、sidecar media store、非 sourcePath owner 的完整媒体读取；必须在后续代码刀接通并验证后才能改成完成态。
- `compat`：Aster vendor provider/executor 只作为事件来源和兼容执行面，不承接 media item truth。
- `deprecated`：旧 `agent_runtime_*` production surface、GUI provider-wire media parsing、把有 `itemId` 的 delta 退化成 active item 猜测。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 media payload 直接塞进 inline `data:` Item 的路径。

## 9. 上游回滚说明

2026-07-07 P3 fifth range check 已确认 Codex commit `7b4e70d567` 回滚了第四次记录的 `[core] Support interleaved response items`。因此：

1. 本 handoff 不能再把 Codex interleaved item 行为写成上游 current 采纳依据。
2. Lime 仍应实现自己的 `Thread / Turn / Item` 稳定归属：有 `itemId` 时按 item id 合并；没有 `itemId` 时只能在当前 turn 内 fail-closed 或明确 fallback。
3. 后续测试命名应表达 Lime invariant，如 `different_item_ids_do_not_merge_content_parts`，不要写成 `codex_interleaved_items_are_supported`。
