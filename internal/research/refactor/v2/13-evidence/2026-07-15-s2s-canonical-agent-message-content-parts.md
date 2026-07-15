# S2s Canonical AgentMessage Content Parts Evidence

## 结论

canonical `ThreadItemPayload::AgentMessage` 现在持有 typed `content_parts`，其中只允许 Text
和 reference-only Media。ThreadStore、`thread/read`、`agentSession/read`、canonical live event
以及 Renderer live reader 使用同一份 content-part 数据；inline `data:` URI、malformed part 和
provider raw payload 不会进入 canonical history。

## 实现边界

- `agent-protocol` 新增 `MessageContentPart` 与 `MessageContentReference`，并将其作为
  `ThreadItemPayload::AgentMessage.content_parts` 的唯一 durable owner。
- App Server materializer 同时读取既有 event aliases `contentPart/contentParts` 与其
  snake_case 输入，但在 canonical payload 中只输出 serde 的 `content_parts`。
- malformed、unsafe inline media 或不一致 aliases 整项 fail closed；同一 Text part 按流式
  累积合并，同 URI Media 以最新 snapshot 覆盖，避免重复卡片。
- read model 只把 canonical parts 映射为既有 presentation `contentParts`，没有第二 read
  model、metadata escape hatch 或 Renderer fallback。
- schema 与 generated client 已由仓库生成器同步，新增字段保持 snake_case wire contract。

## 分类

- `current`：canonical AgentMessage typed text/media parts、ThreadStore/read model 与
  App Server JSON-RPC schema/client。
- `compat`：无新增；event lowering 仅接受既有 camel/snake 输入 aliases。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：raw provider content、inline data URI、presentation fallback、
  第二 transcript/read model。

## 验证

```text
agent-protocol focused suite: 29/29
app-server thread_item_projection: 39/39
app-server read_model: 47/47
app-server canonical_thread_store: 21/21
app-server canonical thread read: 1/1
schema fixture comparison: 1/1
app-server-client package: 63/63
Renderer canonical reader Vitest: 16/16
npm run test:contracts: pass (App Server client 288 checks and all governance stages)
npm run check:protocol-types: pass
npm run typecheck: pass (renderer + node)
exact ESLint / Prettier / git diff --check: pass
```

真实 Gate B summary：
`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-media-reference-regression-summary.json`
记录 `ok=true`、`proofLevel=Gate B controlled fixture`、`backendMode=external`、
`liveProviderNotUsed=true`，并证明 GUI media card、preview、URI/MIME/source owner、canonical
read model 与 no-inline-payload 断言全部通过。

完整 `npm run smoke:agent-runtime-current-fixture` 已通过所有前序 Agent/Plan/Skills/Multi-Agent/
MCP/media 场景，但在后序 Content Factory workflow fixture 的 `workflow/respond` 以
`action_not_found` 失败；该 blocker 不触及 AgentMessage content-part 路径，已单独记录，不作为
本 slice 的成功证据。

## 路线图关系

S2s 把多模态消息从 presentation residual 收回 canonical Thread/Turn/Item 主链；下一刀是处理
后序 aggregate 的 Content Factory action identity，并保持 S4l 已释放的 visible-DOM 证据不回退。
