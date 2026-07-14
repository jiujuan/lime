# S4r6a `serverRequest/resolved` 与 App Server terminal lifecycle

日期：2026-07-13  
状态：Rust / protocol foundation completed；Codex current request contract aligned；普通全局 MCP owner 与 Gate B blocked

## 结论

App Server protocol 新增 typed `serverRequest/resolved` notification，payload 只包含 App Server outer `requestId`。MCP 私有 R1 token、raw MCP request id 和 scope token 均不进入该 notification。

`PendingServerRequest` 在注册时固化 `ServerRequestOwner`。terminal notification 复用原 owner；Transport 只向原 `ConnectionId` 发送，不在 terminal 时重新选择客户端，不扫描 waiter，不回退其他 connection 或 production mock。

## Terminal 顺序

| 路径 | resolved 次数与顺序 | domain / R1 处理 |
| --- | --- | --- |
| normal JSON-RPC result | 原 owner 发送一次 resolved，然后返回 typed response | `forward_request` 随后调用 exact R1 resolver |
| malformed result | 原 owner 发送一次 resolved，然后返回 Decline | 随后 exact resolve，不能命中其他 waiter |
| JSON-RPC error | 原 owner 发送一次 resolved，然后返回 Decline 或 Cancel | 随后 exact resolve |
| request-cancel error | 原 owner 发送一次 resolved，然后返回 Cancel | 随后 exact resolve |
| RMCP closed / parent cancellation | domain 已由 R1 cancellation 进入 terminal；立即向原 owner 发送一次 resolved | drop exact outer pending，不再调用 domain resolver |
| pump shutdown | `router.cancel_all()` 关闭所有 R1 token；每个 adapter task进入同一个 closed 分支，pump 等待 JoinSet 完成 | 每个已发 outer request最多一次 resolved |
| connection disconnect | `cancel_owner` 只取消该 `ConnectionId` 的 pending；adapter 尝试向原 owner 发送一次 resolved | 原连接已关闭时发送失败并记录 warning；禁止转发给新 connection，GUI connection reset负责本地清理 |

normal、error 与 cancel 回归都先消费 resolved，再等待 domain response；这保持 Codex 的 terminal ordering，避免 runtime continuation 先于 GUI 撤销继续运行。closed 分支的 domain terminal 来自外部 cancellation，因此 resolved 是对既成 terminal 的即时投影。

## 协议

- method：`serverRequest/resolved`
- params：`ServerRequestResolvedNotification { requestId: RequestId }`
- catalog kind：`notification`
- `ServerNotification` 与 `AppServerNotificationMethod` 均为 typed current owner
- `McpServerElicitationResponse._meta`：可选 object；非 object 在协议反序列化边界失败
- `McpServerElicitationRequestParams`：必填非空 `threadId`、nullable `turnId`、必填非空 `serverName`，以及 flattened typed `mode: "form"` request
- `sessionId` 与 `parentToolCallId` 不属于该协议。内部 `McpCallScope` 可以携带更多执行身份，但 adapter 只 lower Codex 已定义的 thread owner 与 turn correlation
- JSON schema bundle、manifest 和独立 DTO schema 已更新

## Codex cycle 2 对照

对照仓库：`/Users/coso/Documents/dev/rust/codex`，commit `5c19155cbd93bfa099016e7487259f61669823ff`。

- `codex-rs/app-server-protocol/src/protocol/v2/mcp.rs` 的 current params 只有 required `thread_id`、optional `turn_id`、`server_name` 与 flattened typed request。
- 同文件 TODO 明确：core 尚不能关联 MCP elicitation 与具体 MCP tool-call Item，因此不得提前加入 `parentToolCallId`。
- `codex-rs/app-server/tests/suite/v2/mcp_server_elicitation.rs` 覆盖 turn 内 elicitation：thread 来自 conversation owner，turn 是可用时的 correlation。
- `codex-rs/app-server/tests/suite/v2/mcp_tool.rs` 覆盖普通 `mcpServer/toolCall` nested elicitation：thread 来自 App Server Session owner，`turnId = None`；普通 MCP server 无需回传 parent/private metadata。

Lime 当前 manager 是全局 owner，不是 Codex 的 per Session manager。S4r6d 的 exact private token只能验证已有 Agent `McpCallScope`，不能让普通管理面 MCP server凭空获得 thread owner。无 exact scope 的请求由 MCP client service直接 Decline；adapter 不创建缺少 thread 的 outer request，也不使用 singleton、active turn、private token或 parent call id猜测 owner。

## 验证

- `cargo test --manifest-path lime-rs/Cargo.toml -p app-server-protocol`
  - protocol unit 48/48
  - schema fixture 1/1
- `cargo test --manifest-path lime-rs/Cargo.toml -p app-server server_request --lib`
  - 9/9
  - 包含 wrong connection、disconnect exact cleanup、abort cleanup、duplicate/late response、exact resolved connection owner
- `cargo test --manifest-path lime-rs/Cargo.toml -p app-server mcp_elicitation --lib`
  - 7/7（含既有 canonical lifecycle filter）
  - normal / JSON-RPC error / request cancel / R1 closed 均为 resolved at-most-once
  - Codex thread owner wire regression证明无 `sessionId`、`parentToolCallId` 或私有 scope key
- `cargo check --manifest-path lime-rs/Cargo.toml -p app-server-protocol -p app-server`
  - pass，warning-free
- `npm run governance:legacy-report`
  - zero-reference 0 / classification drift 0 / boundary violations 0
- scoped rustfmt 与 `git diff --check`
  - pass

## 未完成与 blocker

1. `packages/app-server-client/src/generated/protocol-types.ts` 由 root / TS owner 统一生成；本 slice 未越界修改。`npm run check:protocol-types` 在整合前按预期报告 generated drift，因此本 slice 未单独宣称 `npm run test:contracts` 通过。
2. S4r6d 独立写集负责把 Agent-scoped attribution移到非 RMCP 标准字段、执行 exact lookup并在公开 `_meta` 前移除。本 slice 不修改或暴露该 private key。
3. Lime 全局 MCP manager 对普通管理面 `mcpTool/call` 没有 Codex per Session thread owner。当前必须 fail closed。若要覆盖 Codex 普通 server nested elicitation，应先把 manager/connection 归属收敛到可验证 thread owner；不得使用 single active turn、singleton 或让普通 MCP server回传 Lime 私有 token。
4. capability 必须继续 absent，直到普通/Agent owner边界、TS generation、GUI resolved race、canonical projection 与真实 Electron Gate B 全部通过。

## 治理分类

- `current`：typed resolved notification、captured owner、remove-once outer waiter、Codex thread-owned typed form request、response `_meta` object contract。
- `compat`：无。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：nullable/missing thread owner、invented `sessionId` / `parentToolCallId` product fields、raw MCP id 暴露、waiter scanning、terminal 时重新选 client、cross-connection fallback、broadcast transport broker、missing-token scope guessing、生产 mock fallback。
