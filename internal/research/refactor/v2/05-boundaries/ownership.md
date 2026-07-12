# Owner 与依赖边界

> status: current boundary contract
> owner: runtime-architecture
> last_verified: 2026-07-12

## Owner 表

| 能力 | 唯一 current owner | 可以复制的 Codex 原点 | 禁止进入 |
| --- | --- | --- | --- |
| JSON-RPC method/schema/notification | `lime-rs/crates/app-server-protocol` | `app-server-protocol/src/protocol/common.rs`、`v2/*` | Electron、React、provider wire |
| 请求分派 | `lime-rs/crates/app-server/src/processor/**` | `app-server/src/message_processor.rs`、`request_processors/*` | 巨型 `dispatch.rs` 业务逻辑 |
| Thread/Turn 执行 | `lime-rs/crates/agent-runtime` + `agent` | `core/src/session/**`、`core/src/tasks/**` | App Server handler、Renderer |
| canonical content/event/context | `lime-rs/crates/runtime-core` | `core/context`、OpenCode `packages/llm/src/schema/**` | provider body、GUI JSX |
| provider route/lowering/stream | `lime-rs/crates/model-provider` | OpenCode `packages/llm/src/route/**`、`protocols/**` | RuntimeCore mapper、Renderer |
| tool/approval/sandbox/dispatch | `lime-rs/crates/tool-runtime` | Codex `tools/**`、`core/src/tools/**` | UI 文案、Electron 业务命令 |
| MCP connection/catalog | `lime-rs/crates/mcp` | Codex `codex-mcp/connection_manager.rs` | Renderer 直连、provider lowering |
| skills metadata/selection | `lime-rs/crates/skills` | Codex `core-skills`、`ext/skills` | GUI 私有文本和 path ID |
| Thread/Turn/Item storage | `lime-rs/crates/thread-store` + App Server repository | Codex `thread-store/**` | rollout 文件成为 runtime truth |
| materialization/read model | App Server `runtime/thread_item_projection/**`、`read_model/**` | Codex `thread_history*`、`item_builders.rs` | React 临时分类、重复 transcript store |
| typed client/gateway | `packages/app-server-client` + `src/lib/api/**` | Codex `app-server-client`、TUI facade | 直接 `safeInvoke` 业务调用 |
| Electron host | `electron/**` | Codex transport/daemon 仅作生命周期参考 | Agent loop、provider/tool/model state |
| GUI rendering | `src/components/agent/chat/**`、`src/features/**` | 只借 TUI facade/projection | OpenCode Solid UI、TUI widget |

## Copy/adapt/delete 规则

### `copy`

复制完整契约和测试，改动只限 crate 名、路径、Lime 类型和平台 API。复制后的源文件顶部记录 `upstream=<path>@<commit>`，并保留 Apache-2.0/MIT 许可要求。

### `adapt`

必须先写输入/输出差异表；适配代码只能位于目标 owner 内。适配完成后删除旧 mapper、旧 facade 或旧状态机，不保留“新旧都能用”的入口。

### `delete`

删除实现、导出、catalog、正向 fixture、文档导航和 i18n key。只留下负向 guard，且 guard 不得被业务 import。

## 禁止依赖清单

```text
src/components -> model-provider implementation      forbidden
src/components -> electron main private API          forbidden
electron -> agent-runtime / thread-store              forbidden
app-server handler -> provider-specific JSON body     forbidden
runtime-core -> React / Electron                      forbidden
model-provider -> App Server / GUI                    forbidden
tool-runtime -> UI text or UI state                   forbidden
thread-store -> rollout as live write authority       forbidden
```

## 文件体量门槛

- 新增非生成文件达到 800 行前必须拆分。
- 超过 1000 行不得继续添加业务逻辑；必须在同一切片拆分或删除。
- `catalog.rs`、`runtime.rs`、`dispatch.rs`、`AgentChatWorkspace.tsx` 是 v2 首批拆分对象。

## 分类收口

| 分类 | 允许行为 |
| --- | --- |
| `current` | 唯一 owner，可扩展 |
| `compat` | 同一切片内委托、迁出、删除；不新增逻辑 |
| `deprecated` | 只迁出和删除 |
| `dead` | 删除并加回流 guard |
| `test-only` | 只负向断言和历史证据索引 |
