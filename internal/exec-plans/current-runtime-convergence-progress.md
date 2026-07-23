# Current Runtime 收敛进度

> 状态：进行中
> 更新时间：2026-07-20
> 主线收益：删除已失效的 runtime/compat 事实源，避免运行时和文档重新长出双轨路径。

## Current owner

```text
Electron Desktop Host
  -> App Server JSON-RPC
  -> lime-agent current_provider_turn
  -> agent-runtime provider_turn
  -> model-provider current_client
  -> tool-runtime / Thread / Turn / Item projection
```

Codex 是 Agent runtime、状态机、工具与 GUI 护栏的参考原点；opencode 只用于 provider、capability、media part 与 lowering。已删除的 compat crate、vendor/workspace crate、迁移目录与旧 Tauri 路径均为 `dead / deleted / forbidden-to-restore`。

## 2026-07-19 v2 快速骨架

目标：先让 `thread/start` 具备 Codex v2 的最小公开形态，再由 RuntimeCore canonical owner 补齐 route、持久化和 direct lifecycle 细节。

- [x] `thread/start` 返回 `{ thread, model, modelProvider, ... }`，不再返回旧 `{ session }`。
- [x] `thread/start` 同一请求发出 `thread/started`，notification 与 response 使用同一 thread identity。
- [x] handler 从通用 `processor/mod.rs` 收回 `processor/thread.rs`，Thread read/list/turns/items/start 的边界集中到同一领域模块。
- [x] `agentSession/start` production method 保持 `METHOD_NOT_FOUND`，不恢复 compat 包装。
- [x] App Server 公共 JSON-RPC 集成测试 `thread_v2_jsonrpc` 2/2；`npm run test:contracts` 与 `npm run governance:legacy-report` 通过。
- [ ] 新增 RuntimeCore canonical `start_thread` owner：同一原子操作创建 ThreadStore row 与 live runtime cache；handler 删除本地 Thread 构造和 v0 `start_session` 调用。
- [ ] 删除 `unknown` model/provider；未接入 config/route resolver 前必须 fail closed，接入后由统一 route owner 返回 effective facts。
- [ ] 将 `turn/started`、`turn/completed`、`item/started`、`item/completed`、`item/agentMessage/delta` 切为 direct v2 production notification，再删除 `agentSession/event` Thread lifecycle bridge。
- [ ] schema/export 必须解决 v0/v2 同名 `$defs` 和悬空引用；当前隔壁进程持有该写集，本轮不夹写。

本轮写集：`lime-rs/crates/app-server/src/processor/{mod,thread}.rs`、`lime-rs/crates/app-server/tests/thread_v2_jsonrpc.rs`。避让：`internal/refactor/v1/**`、`app-server-protocol/**`、Electron Host 与 Workspace 热区。

Current fixture 已通过历史恢复 31、流式终态 32、Electron fixture guards 75；后续 Electron host rebuild 被并行 v2 字段迁移的 16 个 typecheck 诊断阻塞，未冒充 Gate B 完成。

## 2026-07-20 ThreadGoal usage accounting 骨架

- [x] canonical ThreadGoal 已由 `turn.accepted` 绑定 exact goal、Plan/default mode、累计 usage baseline 和 source watermark；terminal 事件在同一 SQLite 事务推进 usage、预算状态与 durable outbox。
- [x] provider 中间 usage 收敛到独立 `provider.usage` current event；同 attempt 按最新 snapshot 替换，不同 attempt 累加，`provider.step` 不再作为 canonical usage source；正常 `turn.completed` 不与中间 usage 双计。
- [x] per-thread listener 按 outbox id FIFO 发送 `thread/goal/updated`，resume 先捕获 outbox watermark，再发 goal snapshot，成功后只确认 captured watermark；新增顺序和并发 watermark 低层回归。
- [x] RuntimeCore failed reason 已结构化贯通 session loop 与 EventLog：普通 `turn_error` 把 Active goal 转为 `blocked`，provider `usage_limit_exceeded` 把 Active/BudgetLimited goal 转为 `usage_limited`；Plan turn、cancel 和零事件 rejection 不误改 goal。
- [x] Turn 中途首次创建 Active Goal 时，RuntimeCore 在 state 锁内提取当前 active Turn、Plan mode、canonical cumulative usage 与 source watermark，并与 Goal 写入同一 SQLite Immediate 事务完成 late-bind；accepted replay 和重复 set 不重置 baseline，创建前 token 不计入新 Goal。
- [x] 已有 Goal external mutation 在 RuntimeCore state 锁和同一 SQLite Immediate 事务内完成旧增量 flush、set/clear 与 baseline reset/rebind；active patch 返回已计 usage，pause/resume 排除 paused 区间，clear/recreate 改绑新 goal id，mutation 不生成陈旧 outbox，同 sequence 可推进 mutation wall time，过期或 terminal rebind fail closed。
- [x] idle Goal wall-time 已由 canonical `goal_idle` owner 收口：进程内 `Instant` baseline、permit 串行化与 SQLite 事务保证 admission/mutation/fork exactly-once；live resume 保留本进程 baseline，cold restart 从恢复时刻重新计时，不回填离线 wall clock。fork 同事务 flush source usage、复制 Goal 并写 durable continuation deferral，显式 Turn admission 后消费。`goal_projection` 15/15、公共 JSON-RPC fork/restart 1/1 通过。
- [x] Goal continuation 的公共 resume/reconnect 证据已关闭：cold restart 从 canonical EventLog/Projection hydration，同一 `thread/resume` transport barrier 保证 response 与 Goal snapshot 先于 `turn/started`；后续仅启动一个读取 durable objective 的 agent-only continuation，pause 后不再续跑。公共 JSONL 2/2、continuation 模块 8/8 通过。
- [x] 验证：`cargo check -p app-server --tests`、scoped diff check、agent-runtime provider turn 19/19、session loop 37/37、lime-agent 21/21、thread usage 8/8、tool event lowering 15/15、goal projection 8/8、goal accounting 10/10、RuntimeCore Goal mutation 3/3、GoalStore 2/2、thread listener 7/7、failed/read-model 7/7、turn lifecycle 27/27 与治理 0/0/0 通过。
- [ ] 当前仍不是完整 Codex v1 对齐：provider/tool-finish/abort usage flush、idle wall-time、fork deferral、自动 continuation、resume/reconnect 与 startup outbox parity 判断已关闭；approval-cancel 独立 Gate B 和 GUI structured terminal reason owner 保持 `OPEN_REF`。current fixture 前置 31/31、32/32、76/76 通过，真实 Electron 热路径完成 backend、GUI/read model 与 Gate B trace，但性能 trace 未捕获 pre-turn `turnStartAt`，在 `homeHotpathPreTurnTraceWindowAvailable` 退出 1；console/invoke/page error 为 0，本轮未夹写共享 GUI harness。

## 已完成

- [x] compat crate/vendor、迁移目录、专属 skill 与迁移计划已从工作树删除。
- [x] `cargo metadata --manifest-path "lime-rs/Cargo.toml" --no-deps`：34 个 workspace package，未发现已退役 runtime 或 compat package。
- [x] `npx vitest run "src/lib/governance/agentMigrationBoundary.test.ts" "src/lib/governance/agentContextPolicyBoundary.test.ts"`：2 files / 13 tests passed。
- [x] Gate B controlled fixture：真实 Electron/preload/IPC、App Server JSON-RPC、`agentSession/turn/start`、reload 后 `thread/resume`、同一 Turn read model/GUI、取消和多 running session 隔离均通过；证据已归档到受控 `.lime/cdp-evidence/`。
- [x] 前端 read-model 回归：`agentSessionTimelineMergePolicy`、`agentSessionState.runtimeSync`、`useAgentRuntimeSyncEffects`、current session client 与 Gate B guard 共 6 files / 70 tests passed；覆盖 hydrate、取消/失败终态、旧 terminal 不误停新 turn 与 UI stream 收口。
- [x] 移除把已删除 runtime 或虚构 vendor 当作 current runtime owner 的 Harness 专题文档。

## 未完成

- [ ] 清理并行写集内仍指向已删除路径的文档、catalog 与 retired guard。目标是删除引用，不能用 `Agent` 或 `agent-rust` 机械替名。
- [ ] 收口 `agent_init`：它当前只探测 provider/model 配置，真实 runtime 初始化已在 App Server `agentSession/turn/start` 完成；必须从 Electron/DevBridge/runtime truth 归类中移除或改为明确的 host configuration read，且同步 frontend adapter、catalog、IPC 与 contract guard。当前文件由并行线程持有，不夹写。
- [ ] 将 A2UI parser/types/README 中的 `agent-rust` 历史注释改为协议中立描述；这些前端文件当前由并行线程持有，不夹写。
- [x] `CARGO_TARGET_DIR="/tmp/lime-current-runtime-check" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent`：通过；当前 runtime owner 可独立编译。
- [x] `CARGO_TARGET_DIR="/tmp/lime-current-app-server-check" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server`：通过；`RuntimeRequest` 已替代 host JSON 中的 provider/model/turn 配置。
- [x] `RuntimeOptions` 已收口为传输/展示控制；provider/model/metadata 与执行策略仅由嵌套 `RuntimeRequest` 承载。Rust schema fixture、`packages/app-server-client` generated types、Renderer request builder、`threadClient` 测试夹具和 App Server 测试 fixture 已同步。
- [x] Renderer current 提交入口保持为 `AgentUserInputOp -> createAgentSessionTurnStartParamsFromUserInputOp -> threadClient -> App Server JSON-RPC`；Chat UI 只消费 App Server Thread/Turn/Item read model 与 notification，不从 host payload 恢复运行时状态。
- [x] 本轮定向证据：`threadClient` 44 tests、`agentProtocol/themeContextSearch/buildUserInputSubmitOp` 51 tests、`npm run check:protocol-types` 均通过；App Server lib test target 已完成编译校验。
- [x] renderer / Plugin runtime / Electron Host typed request 回归：`threadClient`、Plugin runtime client/capability host、`PluginRuntimeTaskHost` 共 4 files / 65 tests passed。用户输入由 `agentProtocolOps` 单一映射为 `AppServerAgentSessionTurnStartParams`，`eventName`、附件与 `RuntimeRequest` 均保留，Turn / Item 流事件继续投影到 GUI。
- [x] Chat UI 的 Provider 预热已改为 `get_runtime_provider_selection`：它只读取 Desktop Host 的 provider/model 选择并修复模型选择器状态；实际 runtime 仅由 App Server `agentSession/turn/start` 创建。`useAgentChat`、adapter、模型选择集成测试和提交断言均已改用 typed `input/sessionId/runtimeOptions`，不再保留扁平初始化或提交 payload。
- [x] 本轮 UI/协议证据：聊天 Hook/模型选择/adapter `203` tests、agent client/thread client `47` tests、`npm run typecheck`、`npm run typecheck:electron`、`npm run docs:boundary`、`npm run smoke:agent-runtime-current-fixture`（31 history tests + 32 streaming tests）均通过；`node scripts/check-app-server-client-contract.mjs`（286 checks）与 `node scripts/check-command-contracts.mjs` 通过。
- [ ] 对 Plugin runtime 与 Electron Host 继续盘点 typed `runtimeRequest` 透传，禁止新增 host payload 运行时配置或第二套 Turn request builder。
- [ ] 收回 `scripts/check-command-contracts.mjs` 中把已删除 `lime-rs/src/commands/**` 机械改名为虚构 `agent_cmd.rs` 的 guard；改为对已删除路径的负向存在性与 App Server current owner 守卫。当前文件由并行线程持有，不夹写。
- [ ] 为 current 进度与 Harness 文档加入 `.gitignore` 的精确跟踪白名单，不能放开整个 `internal/exec-plans/` 或 `internal/tech/`；之后复跑 `npm run docs:boundary`、current runtime guard 与 `npm run test:contracts`。

## 退出条件

1. current 文档、workspace manifest 和生产源码不再把已删除 runtime、compat 或虚构 vendor 作为 owner。
2. App Server 到 provider 的 current crate 主链可编译并通过定向检查。
3. Gate B Electron current 主链保持通过，且不使用 mock backend。

## 本轮架构确认（待责任开发者填写）

- 架构影响：`RuntimeOptions` 的 provider/model/metadata owner 收口至 `RuntimeRequest`；Renderer Turn 请求与 GUI read model 统一为 App Server current 主链。
- 架构图更新章节：`internal/aiprompts/architecture.md` § 8.1、§ 11。
- 责任开发者确认：待填写。
- [ ] 已核对目录归属、数据流、依赖方向、协议边界和验证门禁。

未完成责任开发者确认前，本轮不能作为 release evidence 或 current 架构变更的最终合并结论。

## 2026-07-22 Reasoning summary/raw typed stream 骨架

目标：按 Codex 语义拆开 reasoning summary 与 raw content，删除 Lime Rust 内部旧单一 delta / thinking 事件，不增加兼容 alias。

- [x] `runtime-core`、`model-provider`、`agent-runtime` 与 `lime-agent` 已使用 indexed `ReasoningSummaryDelta` / `ReasoningContentDelta` 与 `ReasoningSummaryPartAdded`；OpenAI Chat 与 Anthropic thinking 归 raw content/index 0，Responses summary/raw 分流。
- [x] summary/content 共用同一 reasoning Item identity；只有 raw content 进入 provider history。App Server `reasoning.final` 同时保存 `summary` 与 `content`，展示 `text` 优先 summary。
- [x] 同一 index 的 reasoning delta 严格按到达顺序追加，合法重复片段不再被重叠去重；不同 summary/content index 在 final 按 index 稳定排序。Responses EOF 缺少 `response.completed` 时只输出一次 transport `ProviderError`，不合成 `Finish`。
- [x] Responses `summary_part.added`、summary delta 与 raw delta 使用 `output_item.added.item.id` 作为无顶层 `item_id` 时的 active reasoning identity；缺少对应 index 的 delta 按 Codex 语义忽略，不伪造 index。
- [x] Rust owner 范围内旧 `ReasoningDelta`、`ThinkingStart`、`ThinkingDelta`、`ThinkingEnd` 已清零；唯一残留是 Anthropic 外部 wire `ThinkingDelta/thinking_delta`。
- [x] 定向证据：四个受影响 crate `cargo check` 通过；model-provider stream 9/9、agent-runtime reasoning 5/5、App Server summary/content lifecycle 1/1、reasoning state 5/5、reasoning runtime payload 3/3、coding event sequence 1/1、lime-agent protocol 22/22 通过；`npm run smoke:agent-runtime-current-fixture` 通过 history 31/31、streaming 32/32、Electron fixture guard 85/85 和全部 current Electron 场景（`liveProviderUsed=false`）；共享工作树 `git diff --check` 与 `npm run governance:legacy-report`（零引用候选 0、分类漂移 0、边界违规 0）通过。
- [ ] App Server v2 protocol/catalog/schema/client 仍需由当前热区 owner 将内部 indexed summary/raw/part event 投影为 `item/reasoning/summaryTextDelta`、`item/reasoning/summaryPartAdded`、`item/reasoning/textDelta`；前端历史 `thinking_delta` adapter 后续直接迁移删除，不恢复旧单一 delta 或新增 alias。

本轮 Rust 写集：`runtime-core/src/llm_protocol/canonical.rs`、`model-provider/src/{current_client/stream.rs,current_client/stream_tests.rs,provider_stream/response_event.rs}`、`agent-runtime/src/{provider_turn.rs,provider_turn/tests.rs,reply_stream.rs}`、`agent/src/{current_provider_turn.rs,protocol.rs}`、`app-server/src/runtime_backend/{event_mapper.rs,reasoning_events.rs}`。`provider_turn.rs/tests.rs` 中并存的 first-visible-output timeout 属于隔壁写入，完整保留。

避让写集：`internal/refactor/v1/**`、`thread_item_projection/**`、`thread-store/**`、`provider_history*`、`thread_fork*`、App Server credential route 与共享 GUI/bridge 热区。当前改动保持既有 owner 和依赖方向，未改变仓库架构图。
