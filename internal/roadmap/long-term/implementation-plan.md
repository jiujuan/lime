# Lime 长期治理实施计划

状态：active  
创建时间：2026-07-06  
主路线图：[lime-long-term-governance.md](./lime-long-term-governance.md)  
目标：把长期治理路线图拆成可执行、可验证、可持续更新的实施计划。

## 1. 实施原则

本计划不是第二套治理事实源。

治理判断仍以这些文件为准：

- `internal/aiprompts/governance.md`
- `internal/aiprompts/commands.md`
- `internal/aiprompts/harness-engine-governance.md`
- `internal/aiprompts/state-history-telemetry.md`
- `internal/exec-plans/tech-debt-tracker.md`
- `internal/roadmap/astermigration/*`

本计划只负责三件事：

1. 把长期治理路线图拆成执行批次。
2. 给每一批写清退出条件和验证入口。
3. 持续记录当前阶段的真实完成度。

## 2. 当前基线

截至本计划创建时，长期治理路线图给出的基线是：

- `governance:legacy-report` 边界违规：`1`
- `governance:legacy-report` 分类漂移候选：`6`
- 违规项：`rust-agent-subagent-metadata-direct-read`
- 违规文件：`lime-rs/crates/agent/src/session_store_subagent_aster_adapter.rs`
- root `aster` dependency：仍存在
- `lime-agent` direct Aster dependency：仍存在
- `lime-rs/vendor/aster-rust`：仍存在，约 `671` 个文件
- DevBridge current renderer bridge：仍是 current，不得整目录删除
- `mockPriorityCommands`：空集合，应继续保持
- 长期治理整体完成度：约 `65%`

当前验证状态：

- `2026-07-06`：`governance:legacy-report` 边界违规 `0`，分类漂移候选 `0`。
- `2026-07-06`：P0 已完成，长期治理整体完成度调整为约 `66%`。

## 3. 阶段拆解

### P0：恢复治理扫描可信基线

状态：done  
目标：把当前 `governance:legacy-report` 红灯收掉。

#### P0.1 修复 subagent metadata 边界违规

状态：done

问题：

- `rust-agent-subagent-metadata-direct-read` 报错。
- `session_store_subagent_aster_adapter.rs` 直接调用 `resolve_subagent_session_metadata(...)`。

执行步骤：

1. 读取：
   - `lime-rs/crates/agent/src/session_store_subagent_aster_adapter.rs`
   - `lime-rs/crates/agent/src/session_store_subagent_context.rs`
   - `lime-rs/crates/agent/src/session_query.rs`
   - `src/lib/governance/legacySurfaceCatalog.json`
2. 判断 metadata 解析当前应归属：
   - `session_store_subagent_context`
   - `session_query`
   - `thread-store`
   - 或临时保留在唯一 Aster compat adapter
3. 若能迁出 adapter，迁出并收缩 adapter。
4. 若短期必须保留 adapter，更新治理目录册允许路径，并写清退出条件。

退出条件：

- `npm run governance:legacy-report` 不再报该违规。
- 该项分类不再在 `legacySurfaceCatalog` 与代码事实之间漂移。
- 本轮结论能明确说明该路径属于 `current / compat / deprecated / dead` 哪一类。

验证入口：

```bash
npm run governance:legacy-report
```

如触碰 Rust session / subagent 投影，再补定向 Rust 测试；无法确定测试入口时，至少运行受影响 crate 的最小 `cargo test` 或 `cargo check`。

#### P0.2 收敛零引用 deprecated 分类漂移

状态：done

问题：

- `governance:legacy-report` 当前报告 `6` 个分类漂移候选。
- 这些候选都属于 Rust session 直读 / 直写入口，当前扫描结果为 `deprecated / 零引用`。
- `dead-candidate` 不能自动等于 `dead`，但零引用 deprecated 长期留在目录册里会降低扫描信号质量。

当前候选：

- `rust-agent-session-get-direct-read`
- `rust-agent-subagent-child-session-direct-read`
- `rust-agent-subagent-session-list-direct-read`
- `rust-agent-session-update-direct-call`
- `rust-agent-session-replace-conversation-direct-update`
- `rust-agent-session-create-direct-update`

执行步骤：

1. 读取 `src/lib/governance/legacySurfaceCatalog.json` 中这 6 个条目。
2. 确认对应关键词在生产路径和测试路径都仍为零引用。
3. 判断每个条目应转为：
   - `dead` / `dead-candidate`
   - 或继续 `deprecated`，但必须写清仍需保留的受控原因。
4. 如果转为 `dead`，补防回流描述，防止 session direct read / update 重新绕过 `session_query` / `session_update`。

退出条件：

- `governance:legacy-report` 不再报告这 6 个分类漂移候选。
- `legacySurfaceCatalog` 中 session read / update 的分类与实际引用状态一致。
- 仍保留的 `deprecated` 项必须有明确 current owner 和退出条件。

### P1：Aster dependency 删除链路

状态：pending  
目标：把 Aster residual 从“集中 compat”推进到“可删除 dependency”。

#### P1.1 Provider / reply loop 退场

候选路径：

- `lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`
- `lime-rs/crates/agent/src/credential_bridge/runtime_provider_adapter.rs`

执行步骤：

1. 盘点 Aster provider / reply loop 仍承担哪些生产语义。
2. 判断 current owner 是否已在 `model-provider`、`agent-runtime` 或 `lime-agent` 非 Aster facade 中具备承接条件。
3. 先迁出 stream / provider DTO，再删除 Aster adapter 中可删部分。
4. 补 import guard，防止 provider loop 回流到 Aster。

退出条件：

- 相关 provider / reply loop 不再要求 App Server 或 current runtime 直接理解 Aster provider 类型。
- Aster adapter 只剩一个明确退场点，且不再增长新逻辑。

#### P1.2 Tool registry / batch execution 退场

候选路径：

- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/aster_registry_adapter.rs`
- `lime-rs/crates/tool-runtime/**`

执行步骤：

1. 确认 `tool-runtime` 已承接哪些 current tool DTO、permission、shell analysis、command semantics、process helper。
2. 把仍留在 Aster registry adapter 的 batch execution read-model 语义迁到 current owner。
3. 删除已无生产消费者的 Aster `ToolRegistry / ToolContext / ToolError` 映射。

退出条件：

- `tool_orchestrator` 主路径不再需要 Aster registry execution adapter。
- 已迁出的 shell / path / command / process runtime 逻辑不回流 vendored Aster。

#### P1.3 Session / subagent adapter 退场

候选路径：

- `lime-rs/crates/agent/src/session_store_subagent_aster_adapter.rs`
- `lime-rs/crates/agent/src/session_store.rs`
- `lime-rs/crates/thread-store/**`

执行步骤：

1. 先解决 P0 的 metadata direct read 红灯。
2. 盘点 session projection、subagent metadata、extension state 当前由谁持有。
3. 把可持久化 read model 迁向 `thread-store` current schema。
4. 把 Aster session adapter 缩小到唯一历史读取边界。

退出条件：

- `lime-agent` 不再为了 current session / subagent read model 依赖 Aster session trait。
- Aster session adapter 可删除或明确只服务 migration-only history。

#### P1 总退出条件

- `lime-rs/crates/agent/Cargo.toml` 删除 `aster.workspace = true`。
- 根 `lime-rs/Cargo.toml` 删除 vendored `aster`。
- `lime-rs/vendor/aster-rust` 可删除或降为历史只读引用。
- `rg "aster::|use aster" lime-rs/crates` 不再命中生产 current 路径。

### P2：DevBridge residual 收缩

状态：pending  
目标：保留 current renderer bridge，清掉旧命令 residual 的生产幻觉。

当前事实：

- `src/lib/dev-bridge/safeInvoke.ts` 是 current renderer bridge。
- `app_server_handle_json_lines` 是 App Server JSON-RPC current 传输命令。
- `commandPolicy.ts` 中的旧命令 policy / no-mock compat 才是持续治理对象。

执行步骤：

1. 盘点 `commandPolicy.ts` 中仍保留的 compat 命令。
2. 对每个命令写清：
   - 当前分类
   - current owner
   - 阻塞文件
   - 退出条件
   - 验证入口
3. 对跨命令组长期 residual，回挂 `internal/exec-plans/tech-debt-tracker.md` 的 `CCD-012`。
4. 保持 `mockPriorityCommands` 为空集合，除非显式测试夹具。

退出条件：

- 旧命令字符串只存在于 `dead / retired guard-only` 或 `test-only`。
- `safeInvoke` / HTTP client / `app_server_handle_json_lines` current 传输链不被误删。

验证入口：

```bash
npm run test:contracts
npm run governance:legacy-report
```

### P3：Harness verification 驱动动作

状态：pending  
目标：让 verification outcome 不只被展示，而是能控制 review / cleanup / promote / continuation 默认动作。

执行步骤：

1. 读取：
   - `internal/aiprompts/harness-engine-governance.md`
   - `internal/roadmap/harness-engine/README.md`
   - `scripts/lib/harness-verification-facts.mjs`
2. 盘点 outcome 是否仍在 cleanup / review / dashboard 中重复解释。
3. 将重复解释收回 shared verification facts。
4. 固定失败后的默认动作链：

```text
verification failure
  -> 补证据 / 补 replay / 修复
  -> 再跑最近验证
  -> 更新 evidence
  -> review / promote
```

退出条件：

- 同一线程的 `blocking_failure / advisory_failure / recovered / not_applicable` 在 evidence、review、cleanup、UI 中不再漂移。
- cleanup / review / dashboard 不再各自维护第二套 outcome 解释。

验证入口：

```bash
npm run harness:cleanup-report:check
```

如触碰 GUI 面板，再补相关 `*.test.tsx` 与必要的 `verify:gui-smoke`。

### P4：长任务完成纪律

状态：pending  
目标：让 Lime 不只是支持长任务，而是能解释长任务为什么继续、何时结束、如何恢复。

执行步骤：

1. 为复杂任务引入或复用：
   - completion goal
   - done criteria
   - blocked criteria
   - verification requirements
2. 统一解释：
   - auto continue
   - provider continuation
   - queue resume
   - subagent handoff
   - context compaction
   - evidence export
3. 确认 Managed Objective 只消费 AgentRuntime / Evidence facts，不新增第四套 runtime。

退出条件：

- 长任务暂停、压缩、恢复、交接后，仍能在同一 session 语义内说明剩余工作和结束条件。
- GUI 展示不从页面状态反推完成真相。

### P5：GUI / CDP 证据分级

状态：pending  
目标：把 CDP 作为高风险 GUI 主路径的 Gate B 证据，而不是日常默认高成本验证。

执行步骤：

1. 将 GUI 验证结论固定写 proof level：
   - Gate A：browser projection / 普通 Chrome / fixture
   - Gate B：真实 Electron CDP / Electron fixture
2. Gate B 必须验证：
   - `window.__LIME_ELECTRON__ === true`
   - `Boolean(window.electronAPI?.invoke) === true`
   - `transport: "electron-ipc"`
   - `command: "app_server_handle_json_lines"`
   - 本轮 JSON-RPC method
3. CDP evidence 只保存 method、transport、status、必要 marker，不保存 secret、API key、完整 prompt。

退出条件：

- 高风险 GUI 改动能说清证据等级和不能证明的边界。
- 普通 Chrome 证据不再被写成真实 Electron 产品链路通过。

## 4. 周期性节奏

### 每周

- 运行 `npm run governance:legacy-report`。
- 只处理：
  - 边界违规
  - 分类漂移候选
  - 当前主线相关 residual

### 每两周

- 复核 `CCD-012`。
- 确认 DevBridge residual 是否仍有退出条件。
- 把已零引用且无兼容需求的条目转为 `dead`。

### 每月

- 复核 Aster 退场指标：
  - root `aster` dependency
  - `lime-agent` direct Aster dependency
  - `rg "aster::|use aster"` 命中数
  - vendor 文件数
- 复核 Harness verification 是否仍同源。
- 复核巨型文件是否又被追加新业务逻辑。

## 5. 进度日志

- 2026-07-06：创建实施计划。当前第一刀固定为 P0.1，先修 `governance:legacy-report` 中的 `rust-agent-subagent-metadata-direct-read` 边界违规；不先扩展新治理面。
- 2026-07-06：完成 P0.1。`session_store_subagent_aster_adapter.rs` 不再直接调用 `resolve_subagent_session_metadata(...)`，metadata presentation 解析收回 `session_store_subagent_context.rs` 投影边界。验证：`npm run governance:legacy-report` 边界违规 `0`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent -- --nocapture` 通过，14 个相关测试通过。
- 2026-07-06：完成 P0.2。将 6 个零引用的 Rust SessionManager 直读 / 直写条目从 `deprecated` 转为 `dead-candidate`，`allowedPaths` 清空以防回流。验证：`governance:legacy-report` 分类漂移候选 `0`。

## 6. 当前完成度

本实施计划完成度：`15%`。

口径：

- P0 已完成，治理扫描恢复为可信绿灯。
- 长期治理路线图整体完成度沿主路线图估算：约 `66%`。
- P1 到 P5 尚未完成，Aster dependency、DevBridge residual、Harness verification 驱动动作、长任务纪律与 CDP 证据分级仍需继续推进。
- 下一次更新完成度时，必须以阶段退出条件为依据，不以“写了多少文档”计分。
