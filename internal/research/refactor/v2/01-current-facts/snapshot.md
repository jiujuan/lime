# 当前事实快照

> status: current snapshot (working-tree based)
> owner: runtime-architecture
> last_verified: 2026-07-18
> lime_snapshot: current working tree, not a clean release commit
> codex_commit: `2e4f55608b4ad26d9c48ea45a6fcd20bfd5e9fe8` (2026-07-18)
> opencode_commit: `08fb47373509ba64b13441061314eeacf4264f51` (2026-07-18)

## 事实源和限制

本快照直接读取当前 Lime 工作树、Codex `main` 和 OpenCode `dev`。Lime 工作树存在并行开发改动；因此本页只记录可由路径和命令复核的结构事实，不声称所有改动已经合并或测试通过。v1 的 2026-07-07 checkpoint 不再有效。

## Lime 当前主链

```text
src/components / features
  -> src/lib/api/* / packages/app-server-client
  -> electron/preload + app_server_handle_json_lines
  -> lime-rs/crates/app-server JSON-RPC
  -> agent-runtime / agent / runtime-core
  -> model-provider + tool-runtime + mcp + skills
  -> RuntimeEvent / Item projection
  -> ProjectionStore / thread-store / read_model / evidence
  -> GUI timeline / message / workbench
```

证据路径：

| 事实                                      | 路径                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| App Server method 与 scope catalog 已存在 | `lime-rs/crates/app-server-protocol/src/protocol/v0/catalog.rs:1-39,1306-2698`                                          |
| schema fixture 消费 scope                 | `lime-rs/crates/app-server-protocol/src/schema_fixtures.rs:1-72`                                                        |
| Desktop Host 只承接 sidecar/IPC           | `electron/appServerHost.ts`、`electron/preload.ts`、`src/lib/dev-bridge/safeInvoke.ts`                                  |
| runtime owner 已拆分                      | `lime-rs/crates/agent-runtime/src/**`、`lime-rs/crates/runtime-core/src/**`、`lime-rs/crates/app-server/src/runtime/**` |
| projection/read model 已成形              | `lime-rs/crates/app-server/src/runtime/projection_store.rs`、`read_model/**`、`thread_item_projection/**`               |
| GUI projection 已有独立目录               | `src/components/agent/chat/projection/**`、`components/**/timeline-utils/**`                                            |
| provider-neutral content/event 已存在     | `lime-rs/crates/runtime-core/src/llm_protocol/**`、`runtime_content.rs`                                                 |

## 体量与聚合风险

| 文件                                                            | 当前行数 | v2 判断                                                                                                                               |
| --------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| `lime-rs/crates/app-server-protocol/src/protocol/v0/catalog.rs` |     2846 | 已集中 method/scope，但仍是巨型事实源；拆成按 domain 的声明文件并派生总 catalog                                                       |
| `lime-rs/crates/app-server/src/runtime.rs`                      |      669 | 接近 800 行门槛；只保留组装和 re-export                                                                                               |
| `lime-rs/crates/app-server/src/processor/dispatch.rs`           |      730 | 只允许薄分派；新增 handler 不得继续堆叠                                                                                               |
| `src/components/agent/chat/AgentChatWorkspace.tsx`              |       13 | 公共入口只委托 `useAgentChatWorkspaceRuntime`；不承接业务逻辑 |
| `src/components/agent/chat/useAgentChatWorkspaceRuntime.tsx`    |       41 | current composition owner；只按 `Entry -> Setup -> Command -> Scene` 无条件编排 |
| `src/components/agent/chat/workspace/useAgentChatWorkspaceEntryRuntime.ts` | 624 | current entry/bootstrap owner；项目、内容、技能和入口状态 |
| `src/components/agent/chat/workspace/useAgentChatWorkspaceSetupRuntime.ts` | 782 | current runtime/read-model setup owner；Agent Chat、Thread/Turn/Item read model 与 workspace runtime |
| `src/components/agent/chat/workspace/useAgentChatWorkspaceCommandRuntime.ts` | 653 | current command/side-effect owner；send、queue、approval、artifact、shell command wiring |
| `src/components/agent/chat/workspace/useAgentChatWorkspaceSceneRuntime.tsx` | 684 | current scene projection owner；inputbar、canvas、task center、right surface 和 JSX composition |
| `src/components/agent/chat/components/MessageList.tsx`          |      456 | 只消费 projection，不解释 runtime 语义                                                                                                |
| `src/components/agent/chat/components/AgentThreadTimeline.tsx`  |      521 | 只消费 Item/TL projection，不建立第二状态机                                                                                           |

## 当前分类

| 分类         | 当前事实                                                                                                      | v2 处理                        |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `current`    | `lime-rs/crates/**`、`packages/app-server-client`、`src/lib/api/*`、`electron/**`、ProjectionStore/read model | 继续收敛，不新增平级 owner     |
| `compat`     | 少量 barrel、受控 policy、未完成迁移适配                                                                      | 在同一切片内迁出并删除；不扩展 |
| `deprecated` | 数据迁移、旧 settings key、旧 direct DAO 或旧 facade 的受控残留                                               | 只允许迁出；完成后删除         |
| `dead`       | 旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` 生产命令、生产 mock fallback                      | 删除并加负向 guard；禁止恢复   |
| `test-only`  | 旧命令字符串、负向 contract、退役路径扫描                                                                     | 仅保留负向证明，不作为生产 API |

## v1 已失效的事实

1. v1 仍把 method registry/scope 写成缺口，但当前 `catalog.rs` 已提供两者。
2. v1 的 upstream checkpoint 停在 Codex `8268cbfb`、OpenCode `eb6ff0c`，与当前 checkout 不同。
3. v1 README、roadmap、follow-up 和 provider audit 仍引用已删除的 11 个文件；v2 不复制这些断链。
4. v1 将研究、实施日志和完成审计混在同一目录；v2 将事实、决策、计划和 evidence 分离。
5. v1 默认保留 `agentSession/*` 和 vendor adapter；这与研发期直接替换的治理要求冲突。

## 可重复快照命令

```bash
git -C "/Users/coso/Documents/dev/rust/codex" rev-parse HEAD
git -C "/Users/coso/Documents/dev/js/opencode" rev-parse HEAD
wc -l "lime-rs/crates/app-server-protocol/src/protocol/v0/catalog.rs" \
  "lime-rs/crates/app-server/src/runtime.rs" \
  "lime-rs/crates/app-server/src/processor/dispatch.rs" \
  "src/components/agent/chat/AgentChatWorkspace.tsx"
npm run governance:legacy-report
```

快照更新必须同时更新 commit、日期、体量、分类和受影响链接；不能只改结论文字。
