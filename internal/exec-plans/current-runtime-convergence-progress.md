# Current Runtime 收敛进度

> 状态：进行中
> 更新时间：2026-07-12
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
