# S7p Stream Binding Canonical Lifecycle Fixture Evidence

## 结论

stream binding 的生产 projector 已对 Thread/Turn/Item lifecycle fail closed：没有
`canonicalEvent` 的 raw lifecycle notification 不再进入 Renderer。batch 70 的测试仍用 raw
message/tool/reasoning/turn fixture，失败来自 fixture 漂移，不是 production binding 回归。

S7p 将 stream binding 与 tail recovery fixture 补成 canonical `item/updated` 和
`turn/updated` envelope，并直接使用 current `appServerEventPayloadProjection` owner。生产
projector、binding、协议与 Electron 均未修改，也没有使用 test-only raw projector绕过门禁。

## 分类

- `current`：canonical Item/Turn notification -> production projector -> stream binding。
- `test-only`：canonical agent message、tool call、reasoning 与 terminal Turn fixture builder。
- `compat / deprecated`：无新增。
- `dead / forbidden-to-restore`：raw lifecycle fixture 作为 current-chain 正向证据。

## 验证

- stream binding：14/14 passed。
- tail recovery：2/2 passed。
- S7l-S7q current-tree 聚合 Vitest：9 files / 86 tests passed。
- claimed files exact ESLint、Prettier 与 `git diff --check` passed。
- smart Vitest resume 已完成 batch 110，`failed_batch: null`。
- `npm run typecheck` passed；`npm run governance:legacy-report` 为 0/0/0。

测试 stderr 中的 inactivity/tail-recovery 日志为覆盖对应恢复分支的预期诊断。
