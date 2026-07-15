# S4i4 Canonical Media Reference Fixture Lifecycle Evidence

## 结论

media-reference external fixture 使用同一 AgentMessage Item ID 发出 `item.started` 与
`item.completed`，不再从 `Unknown` lifecycle 直接完成。该 fixture 经过 current Electron、App
Server、canonical materializer/read model 与 GUI media card 链路，未引入 raw message fallback、
production mock 或第二 read model。

## 验证

- `claw-chat-current-fixture-smoke.test.mjs` focused/aggregate guard：55/55。
- `npm run governance:scripts`：通过。
- `npm run smoke:claw-chat-current-fixture -- --scenario media-reference`：Gate B 通过。
- 持久证据：
  `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-media-reference-regression-summary.json`
  记录 `ok=true`、`proofLevel=Gate B controlled fixture`、`backendMode=external`、
  `liveProviderNotUsed=true`，并证明 stable session/item lifecycle、media reference/read-model
  观察、GUI card/preview、no-inline-payload 与 console/invoke clean。
- `npm run smoke:agent-runtime-current-fixture` 在该 media 场景通过；后序 Content Factory
  workflow/respond 的独立 `action_not_found` 失败不属于本 fixture lifecycle。

## 分类

- `current`：external fixture -> canonical `item.started/item.completed` -> ThreadStore/read model -> GUI。
- `test-only`：external fixture backend 与 `.lime/qc` evidence。
- `compat / deprecated`：无新增。
- `dead / forbidden-to-restore`：raw AgentMessage completion、production mock fallback、并行
  media read model。

## 路线图关系

S4i4 关闭 media fixture 的 canonical lifecycle blocker，使 S2s content-part owner 能在真实
Electron Gate B 被验证；下一刀回到 aggregate 后序 workflow blocker。
