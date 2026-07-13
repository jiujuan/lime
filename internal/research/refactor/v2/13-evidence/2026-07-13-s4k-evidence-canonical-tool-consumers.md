# S4k Evidence Canonical Tool Consumers

## Fact source

Provider history、context compaction 与 evidence/export 只消费 nested canonical
`ThreadItemPayload::{Tool,McpToolCall,CollabAgentToolCall}`。raw
`tool.started/result/failed/completed` 已无 current production producer，属于
`dead / forbidden-to-restore`；只允许保留在入口拒绝、负向测试和历史 evidence。

## Changes

- Provider history 删除 raw call/result parser，只从 typed Tool arguments、output、error
  与 output ref 恢复第二轮 transcript；outer event output ref 不再是 fallback。
- Context compaction 只从 nested Tool Item 生成摘要，并按 typed `ItemStatus`
  区分 completed、failed、interrupted 与 cancelled。
- Evidence provider 新增共享 canonical Tool view，统一 payload call ID、MCP server、
  arguments、item metadata、structured output 与 terminal status。
- Coding、Skills/MCP、browser action/file 与 snapshot artifact 收集均切到共享 view；
  `tool.output.delta` 等非 lifecycle side-channel 保持原有受控行为。
- 旧 raw 正向 evidence fixtures 改为完整 canonical ThreadItem；负向测试证明 raw
  lifecycle 无法改变 transcript、summary、statistics 或 artifact。
- Contract guard 扫描 production consumer 区，阻止 raw lifecycle parser 回流，且不误伤
  明确的负向 fixture。
- `browser/action_index.rs` 从 999 行按 extraction 与 presentation 职责拆为
  528/390/100 行，继续复用唯一 canonical Tool parser，不新增平级实现。

## Validation

- `cargo check -p app-server`: pass。
- `cargo test -p app-server runtime::provider_history`: `6/6`。
- `cargo test -p app-server runtime::context_compaction`: `3/3`。
- `cargo test -p app-server evidence_provider::`: `8/8`。
- Evidence export focused integration：coding snapshot、browser session/snapshot、browser
  pending confirmation、Skills/MCP observability、workspace-skill completion，`5/5`。
- `cargo test -p app-server evidence_provider::browser`: `1/1`（结构拆分复核）。
- `npm run test:contracts`: pass，`290 checks`。
- `npm run governance:legacy-report`: pass，边界违规 `0`。
- `git diff --check`: pass。

本 slice 不改变 Electron、App Server JSON-RPC 或 Renderer wire，因此没有重跑 GUI
Gate B；真实 GUI 继续消费 S1j/S4i 已验证的 canonical Item projection。

## Classification

- `current`: canonical nested Tool provider/compaction/evidence consumers。
- `compat`: none。
- `deprecated`: none。
- `dead`: production raw Tool lifecycle interpretation and old positive evidence fixtures。
- `test-only`: explicit raw lifecycle rejection/ignore fixtures。

## Next cut

继续审计不属于本 slice 的 raw consumer：`output_refs.rs`、
`thread_item_projection.rs` 与 `thread_item_projection/media_result.rs`。先区分 current
domain side-channel、入口拒绝守卫与真正的 dead compatibility，再单独认领删除，禁止把
S4k 扩成跨投影热区夹写。
