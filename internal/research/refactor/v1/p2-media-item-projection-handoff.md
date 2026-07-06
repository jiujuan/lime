# P2 Media Item Projection Handoff

> 状态：item-projection-pending / blocked-by-parallel-write / handoff-ready
> 更新时间：2026-07-07
> 目标：把 RuntimeCore `message.delta.contentPart/contentParts` payload 接到 App Server Item/read model、projection package 和 Workbench/GUI，不再让 GUI 或 provider wire event 旁路解释媒体。

## 1. 结论

`RuntimeMessageDeltaContent::from_payload(...)` 已经是 `message.delta` 内容 payload 的 current parser owner，但它还没有被 App Server Item/read model 消费。当前缺口不是 provider media event 是否能发出，而是：

```text
RuntimeCore message.delta payload
  -> App Server agent_message ThreadItem.contentParts
  -> protocol / generated TS AgentThreadItem
  -> packages/agent-runtime-projection media-capable item projection
  -> AgentChat history / streaming contentParts
  -> Workbench / MessageList render
```

下一刀必须从 App Server Item/read model 接 owner-backed parser 开始，而不是在 `src/components/agent/chat/**` 继续补媒体识别，也不是在 Aster vendor 或 provider wire 里加 UI 字段。

当前工作树仍有并行热区：

- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/agent/src/**`
- `packages/agent-runtime-projection/**`
- `src/components/agent/chat/**`
- `lime-rs/vendor/aster-rust/**`
- `src/lib/governance/**`

未满足接管条件前，当前进程只做本 handoff，不夹写源码。

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
| App Server Item projection | `lime-rs/crates/app-server/src/runtime/thread_item_projection/agent_message.rs` | 当前 `item_from_delta(...)` 只要求 text，`merge_item(...)` 只合并 text/status/timestamps | 引入 RuntimeCore parser，允许 media-only delta 生成 `agent_message` item，并合并 `contentParts` |
| App Server read model | `lime-rs/crates/app-server/src/runtime/read_model/messages.rs` | assistant message text extraction 仍以字符串字段为主 | read model 输出 content parts 或至少保留 thread item content parts |
| Protocol / client type | `src/lib/api/agentProtocol.ts`、`src/lib/api/agentProtocol.d.ts` | `AgentThreadAgentMessageItem` 只有 `text` / `phase` | 增加 `contentParts?: RuntimeContentPart[]` 对应的 typed surface；同步 generated/contract 路径 |
| Projection package | `packages/agent-runtime-projection/src/threadItems.ts` | `AgentUiThreadItemProjectionInput` 没有 content parts 字段，`agent_message` 只投 text preview | 增加 media-aware item projection 和 refs/preview metadata |
| GUI history hydrate | `src/components/agent/chat/hooks/agentChatHistoryThreadItems.ts` | 只把 `agent_message.text` 变成 text content part | 优先消费 item.contentParts；没有 contentParts 时保留 text fallback |
| GUI streaming sync | `src/components/agent/chat/hooks/agentStreamAgentMessageContentSync.ts` | 只同步 text part | 支持 agent_message media content parts，且按 sequence / item id 去重 |

## 4. 最小源码切片

推荐只接一个垂直切片，不同时重构 GUI 大面：

1. App Server `agent_message.rs`
   - 从 `event.payload` 调用 `RuntimeMessageDeltaContent::from_payload(...)`。
   - `text` 为空但 `contentParts` 非空时仍生成 `agent_message` item。
   - item JSON 增加 `contentParts`，保留 `text` 作为向后兼容聚合字段。
   - `merge_item(...)` 追加 / 去重 contentParts；`item.completed` 的完整 contentParts 可替换 delta 累积，`item.updated` 可按 cumulative 语义替换。

2. App Server projection tests
   - `message.delta` 只有 image/audio contentPart 时能生成 `agent_message`。
   - 同一 `itemId` 的 text + media delta 合并为一个 item。
   - 两个不同 `itemId` 的 delta 不互相吞并 contentParts。
   - `contentPart` 与 `contentParts` alias 不一致时 fail closed，不生成错误 media item。

3. Protocol / client type
   - 给 `AgentThreadAgentMessageItem` 增加 `contentParts?: AgentThreadMessageContentPart[]`。
   - 类型字段使用 RuntimeCore JSON shape：`{ type: "text", text }`、`{ type: "media", kind, reference, caption? }`。
   - 禁止把 GUI 专用 `imageWorkbenchPreview`、`tool_use`、`thinking` 塞进 App Server content part 协议。

4. Projection package
   - `AgentUiThreadItemProjectionInput` 增加 `contentParts?: readonly unknown[]`。
   - `agent_message` event payload 输出 `contentPartCount`、`mediaKinds`、`referenceUris` 的受控摘要，供 UI state / diagnostics 消费。
   - 不在 package 内解析 file path、data URL 或 provider-specific payload。

5. GUI hydrate / streaming sync
   - `agentChatHistoryThreadItems.ts` 先把 item.contentParts 转成 `Message.contentParts`。
   - `agentStreamAgentMessageContentSync.ts` 按 item id / content sequence upsert media part；text fallback 仍保留。
   - MessageList / Workbench 若暂未支持新 media part，应先显示 reference preview / unsupported media placeholder，不丢 item。

## 5. 不做

- 不改 `lime-rs/vendor/aster-rust/**` 来承接媒体 Item truth。
- 不在 `src/components/agent/chat/**` 直接识别 provider payload 或 MIME，GUI 只消费 read model。
- 不把 inline `data:` media payload 放进 Item/read model；高容量内容必须走 reference / sidecar。
- 不引入 opencode Session / Tool / UI；opencode 只保留 MIME / provider lowering 参考。
- 不把 `message.delta` media output 转成 artifact，除非后续有明确 artifact sidecar owner。

## 6. 验证门槛

App Server projection：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server agent_message_delta -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server thread_item_projection -- --nocapture
```

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

Contract / GUI smoke：

```bash
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

- `current`：RuntimeCore `RuntimeMessageDeltaContent`、App Server `ThreadItem.agent_message.contentParts`、projection package media-aware item projection、GUI read-model consumer。
- `compat`：Aster vendor provider/executor 只作为事件来源和兼容执行面，不承接 media item truth。
- `deprecated`：旧 `agent_runtime_*` production surface、GUI provider-wire media parsing、把有 `itemId` 的 delta 退化成 active item 猜测。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 media payload 直接塞进 inline `data:` Item 的路径。

## 9. 上游回滚说明

2026-07-07 P3 fifth range check 已确认 Codex commit `7b4e70d567` 回滚了第四次记录的 `[core] Support interleaved response items`。因此：

1. 本 handoff 不能再把 Codex interleaved item 行为写成上游 current 采纳依据。
2. Lime 仍应实现自己的 `Thread / Turn / Item` 稳定归属：有 `itemId` 时按 item id 合并；没有 `itemId` 时只能在当前 turn 内 fail-closed 或明确 fallback。
3. 后续测试命名应表达 Lime invariant，如 `different_item_ids_do_not_merge_content_parts`，不要写成 `codex_interleaved_items_are_supported`。
