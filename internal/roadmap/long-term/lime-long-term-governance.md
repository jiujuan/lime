# Lime 长期治理路线图

状态：active-planning  
创建时间：2026-07-05  
目录：`internal/roadmap/long-term/`  
主目标：把 Lime 的治理从“发现问题后补规则”升级为“每轮迭代默认减少系统熵”，让 AI、人和自动化验证都只能沿 current 事实源继续推进。

## 1. 这份文档回答什么

Lime 已经不是早期 Demo，也不是一个单点功能项目。

它现在同时包含：

- Electron Desktop Host
- App Server JSON-RPC
- AgentRuntime / RuntimeCore / read model
- Aster 迁移残留
- Plugin / Skill / Claw 能力目录
- Harness / evidence / replay / review
- State / History / Telemetry
- GUI smoke / Playwright / CDP 续测
- 多语言、发布、脚本、技术债守卫

真正的治理问题已经不是“有没有规则”，而是：

**这么多规则、路线图、守卫和执行计划，如何长期形成一个可执行的治理系统。**

本文件不替代各领域路线图。它只回答：

1. Lime 当前治理资产和现实缺口是什么。
2. 哪些治理工作优先级最高。
3. 后续每一刀应该如何选择、验证和收口。
4. 如何避免治理本身变成新的文档包袱。

## 2. 已读取的事实源

本路线图基于以下 current 文档和轻量扫描结果，不基于聊天记忆：

- `internal/aiprompts/governance.md`
- `internal/aiprompts/commands.md`
- `internal/aiprompts/quality-workflow.md`
- `internal/aiprompts/harness-engine-governance.md`
- `internal/aiprompts/state-history-telemetry.md`
- `internal/exec-plans/tech-debt-tracker.md`
- `internal/exec-plans/production-command-current-migration-plan.md`
- `internal/roadmap/appserver/README.md`
- `internal/roadmap/appserver/app-server-aster-runtime-boundary-governance.md`
- `internal/roadmap/agentruntime/README.md`
- `internal/roadmap/astermigration/README.md`
- `internal/roadmap/astermigration/2026-07-05-progress-reality-check.md`
- `internal/roadmap/harness-engine/README.md`
- `internal/roadmap/reliability/README.md`

近期轻量扫描补充了三个事实：

1. `2026-07-06` P0 已收口：`npm run governance:legacy-report` 当前为绿，边界违规 `0`，分类漂移候选 `0`。`rust-agent-subagent-metadata-direct-read` 已从 `session_store_subagent_aster_adapter.rs` 收回到 `session_store_subagent_context.rs` 投影边界，6 个零引用 SessionManager 直读 / 直写条目已转为 `dead-candidate` 防回流。
2. Aster 仍未退出：根 `lime-rs/Cargo.toml` 仍暴露 vendored `aster`，`lime-rs/crates/agent/Cargo.toml` 仍有 `aster.workspace = true`，`lime-rs/vendor/aster-rust` 当前约 `671` 个文件；本轮 `rg` 仍能在 `lime-rs/Cargo.toml` 与 `lime-rs/crates` 中找到约 `216` 行 Aster 相关命中。
3. `src/lib/dev-bridge/**` 当前不是整体旧物：`safeInvoke`、HTTP client、`app_server_handle_json_lines`、trace / error buffer 仍是 current renderer bridge；`commandPolicy.ts` 中的旧命令 policy / no-mock compat 才是持续治理对象。

## 3. 当前治理资产

### 3.1 已经形成的强资产

Lime 已经有一套相对成熟的治理语言：

- `current`
- `compat`
- `deprecated`
- `dead`

它的价值在于：后续讨论不再停留在“这个还能不能用”，而是直接问：

**它还是否允许继续演进。**

当前强资产包括：

1. **事实源规则清楚**
   - 新 Agent / runtime / 后端能力默认走 App Server JSON-RPC。
   - Electron 只做 Desktop Host bridge 和壳能力。
   - GUI / replay / review / analysis 只能消费 runtime facts 和 evidence，不再反向定义事实。

2. **旧 Tauri wrapper 已经物理删除**
   - `lime-rs/src/**` 已删除。
   - `lime-rs/src/commands/**` 不再是任何新增 Rust 后端能力落点。
   - `rustCommandsCurrentBoundary.test.ts` 已经守住不可恢复边界。

3. **生产 mock 已经被定为硬红线**
   - `mockPriorityCommands` 当前为空集合。
   - mock 只能存在于测试夹具、契约守卫或明确 fixture。
   - 生产路径缺真实 bridge 时应 fail closed。

4. **Harness / Evidence 主链已经成形**
   - `evidence/export`
   - `agentSession/replayCase/export`
   - `agentSession/analysisHandoff/export`
   - `agentSession/reviewDecisionTemplate/export`
   - `agentSession/reviewDecision/save`

5. **State / History / Telemetry 主链已经明确**
   - `SessionDetail`
   - `AgentRuntimeThreadReadModel`
   - 带关联键的 `RequestLog`
   - App Server export / history-record / cleanup / dashboard 下游派生

6. **GUI 验证能力正在升级**
   - `verify:gui-smoke` 证明 source-tree GUI 主链。
   - Playwright / Electron CDP 可以连接真实 Electron 窗口，证明 Gate B 产品链路。
   - CDP 不是默认全部使用，而是高风险 GUI 主路径证据。

### 3.2 当前最真实的弱点

Lime 现在的治理弱点不是没有规则，而是：

1. **规则分散**
   - `AGENTS.md`
   - `internal/aiprompts/*`
   - `internal/roadmap/*`
   - `internal/exec-plans/*`
   - `src/lib/governance/*`
   - 脚本和测试守卫

   这些东西都对，但如果没有统一优先级，AI 很容易“每个都读了一点”，最后还是选错下一刀。

2. **Aster 迁移仍是最大技术治理债**
   - Aster 已从 current runtime 事实源降级，但仍在 `lime-agent` 和 vendor 里保留执行事实。
   - App Server 直接 Aster 依赖基本收口，但 root dependency 和 `lime-agent` dependency 仍未删除。
   - 这意味着“无 Aster 依赖完成态”仍不能宣布。

3. **DevBridge residual 容易被误判**
   - 整个 `src/lib/dev-bridge/**` 不能删。
   - 但其中 `commandPolicy.ts` 的旧命令 policy / no-mock compat 又不能长期膨胀。
   - 每个命令组 current 化后，如果不回头收 policy / mock / retired guard，就会形成新的假 current。

4. **Harness 证据还没有完全控制后续动作**
   - Evidence / replay / analysis / review 已成链。
   - 但 verification outcome 还没有完全成为 review / promote / cleanup / continuation 的硬调度事实。
   - Lime 已经能“看见问题”，但还没完全做到“看见问题后所有动作都按同一事实推进”。

5. **长任务完成纪律不够硬**
   - queue / resume / auto continue / provider continuation / subagent 都存在。
   - 但 completion goal、done criteria、未完成不得退出的统一纪律还不够强。

6. **巨型文件仍在制造局部治理风险**
   - `tech-debt-tracker.md` 已登记多个超过 `1000` 行的热点。
   - 这些文件不是马上全删的问题，而是后续每次触碰都可能让写集扩大，影响 AI 长期迭代质量。

## 4. 总体治理原则

### 4.1 治理不是新增一层

后续长期治理不能再造一个“治理平台真相”。

本文件只做排序和节奏控制。具体事实源仍回到：

- 命令边界：`internal/aiprompts/commands.md`
- 旧路分类：`internal/aiprompts/governance.md`
- 状态历史：`internal/aiprompts/state-history-telemetry.md`
- Harness：`internal/aiprompts/harness-engine-governance.md`
- Aster 退场：`internal/roadmap/astermigration/*`
- 技术债：`internal/exec-plans/tech-debt-tracker.md`

### 4.2 每轮治理必须减少一个可验证风险

治理任务不能只写“继续清理”“继续收敛”。

每一刀必须落到下面至少一类结果：

1. 删除一个 `dead` surface。
2. 把一个 `compat` 降为 `deprecated` 或 `dead`。
3. 让一个 current 事实源更窄、更可测试。
4. 让一个守卫从“文档约束”变成“失败即阻断”。
5. 把一个高成本人工验证转成可复跑证据。

如果做不到其中任一项，就不应列为治理优先级。

### 4.3 不为治理牺牲主线

治理必须服务 Lime 主线：

- AgentRuntime facts
- App Server JSON-RPC
- Harness evidence
- Plugin / Skill runtime
- GUI 产品主路径

如果某个清理项和主线没有直接关系，只能登记，不要抢当前主线资源。

### 4.4 模型能力是变量，不是前提

未来模型会更强，也会更能处理长任务和复杂工程。

但 Lime 不能把治理押注在“下一个模型自然会懂”上。

长期项目必须假设：

- 有时会用最强模型
- 有时会因为成本、速度、隐私或稳定性选择较弱模型
- 有时 AI 会读到旧文档、旧测试、旧命令

所以治理目标不是“限制 AI”，而是给 AI 一张不会误导它的地图。

## 5. 分阶段计划

### Phase 0：把当前红灯收掉

状态：done  
目标：让现有治理扫描回到可信基线。

#### P0.1 修掉当前 `governance:legacy-report` 边界违规

完成结果：

- `rust-agent-subagent-metadata-direct-read`
- 原违规文件：`lime-rs/crates/agent/src/session_store_subagent_aster_adapter.rs`
- 当前归属：`lime-rs/crates/agent/src/session_store_subagent_context.rs`
- 处理方式：Aster adapter 只做 Aster session 字段适配，subagent presentation metadata 解析收回 session store 投影边界。

已完成动作：

1. 保留该 adapter 为剩余 Aster compat adapter。
2. 将 metadata 解析收回 `session_store_subagent_context`。
3. 用 `governance:legacy-report` 确认边界违规归零。

退出条件：

- `npm run governance:legacy-report` 不再报该违规。
- `legacySurfaceCatalog.json` 中该条分类与允许路径不再漂移。

#### P0.2 建立治理报告的固定阅读口径

完成结果：

- `governance:legacy-report` 输出很长，AI 容易只看开头或只看摘要。
- 本轮已把 6 个 `deprecated / 零引用` 分类漂移候选转为 `dead-candidate`，让报告摘要重新变成可行动信号。

最低动作：

- 每次治理任务只摘录三类信息：
  - 边界违规
  - 分类漂移候选
  - 本轮命令组相关 residual

退出条件：

- 新执行计划里不再粘贴整份长报告。
- 每个 residual 都能回挂到具体路线图或 `tech-debt-tracker.md`。

### Phase 1：Aster 退场从“集中 residual”推进到“可删除 dependency”

状态：当前最大治理主线  
目标：删除 root workspace 与 `lime-agent` 对 Aster 的直接依赖。

当前事实：

- Aster 迁移现实口径约 `78%`。
- `lime-rs/Cargo.toml` 仍有 vendored `aster`。
- `lime-rs/crates/agent/Cargo.toml` 仍有 `aster.workspace = true`。
- `lime-rs/vendor/aster-rust` 仍存在。
- `lime-agent` 生产路径仍有大量 Aster residual。

优先顺序：

1. **Provider / reply loop**
   - 当前阻塞点：`request_tool_policy/aster_reply_adapter.rs`、`credential_bridge/runtime_provider_adapter.rs`。
   - 目标：current provider stream / turn executor 接管后删除 Aster provider / reply loop。

2. **Tool registry / batch execution**
   - 当前阻塞点：`tool_orchestrator/aster_registry_adapter.rs`。
   - 目标：让 `tool-runtime` 接管 registry / batch execution read model，删除 Aster `ToolRegistry / ToolContext / ToolError` 执行边界。

3. **Session / subagent adapter**
   - 当前阻塞点：Aster session store / subagent metadata adapter。
   - 目标：session repository / metadata / extension state 迁入 `thread-store` current schema。

退出条件：

- `lime-rs/crates/agent/Cargo.toml` 删除 `aster.workspace = true`。
- 根 `lime-rs/Cargo.toml` 删除 vendored `aster`。
- `lime-rs/vendor/aster-rust` 可物理删除或转入只读历史引用。
- `rg "aster::|use aster" lime-rs/crates` 只剩历史测试或为 0。
- Aster 相关守卫从允许 residual 改为禁止回流。

### Phase 2：DevBridge residual 按命令组持续收缩

状态：进行中  
目标：保留 current renderer bridge，持续删除旧命令 policy / mock / retired guard 的生产幻觉。

当前分类：

- `current`
  - `safeInvoke`
  - `http-client`
  - `app_server_handle_json_lines`
  - trace / error buffer
  - bridge availability / event listener

- `compat / deprecated`
  - `commandPolicy.ts` 中的旧命令 truth / no-mock fallback
  - `plugin_runtime_*` 这类仍未完全退出的 compat 命令

- `test-only`
  - retired guard
  - negative test
  - explicit fixture

最低动作：

1. 每个命令组迁完 current 后，同轮检查：
   - `commandPolicy.ts`
   - `mockPriorityCommands.ts`
   - `src/lib/desktop-host/*Mocks.ts`
   - `agentCommandCatalog.json`
   - `legacySurfaceCatalog.json`
   - 旧 smoke / retired guard

2. 跨命令组长期 residual 必须回挂 `CCD-012`。

退出条件：

- 旧命令字符串只存在于 `dead / retired guard-only` 或 `test-only`。
- `mockPriorityCommands` 保持空集合，除非显式测试夹具。
- `safeInvoke` current 传输链仍保留，不被误删。

### Phase 3：Harness verification 从“可见”升级为“能调度”

状态：进行中  
目标：verification outcome 成为 review / promote / cleanup / continuation 的一级事实。

当前事实：

- Evidence / replay / analysis / review 已经开始共享 verification facts。
- `HarnessStatusPanel`、review template、analysis brief 已经消费 structured verification summary。
- 但 verification outcome 尚未完全控制后续动作。

最低动作：

1. 统一 outcome 字段：
   - `blocking_failure`
   - `advisory_failure`
   - `recovered`
   - `not_applicable`
   - `degraded`

2. cleanup / review / dashboard 只允许从 shared verification facts 计算动作。

3. 失败后的默认动作链固定为：

```text
verification failure
  -> 补证据 / 补 replay / 修复
  -> 再跑最近验证
  -> 更新 evidence
  -> review / promote
```

退出条件：

- 同一线程的 failure / recovered / advisory 状态，在 evidence、review、cleanup、UI 中不再语义漂移。
- `npm run harness:cleanup-report:check` 能守住主要派生链。

### Phase 4：长任务完成纪律产品化

状态：未完成  
目标：让 Lime 不只是支持长任务，而是默认推进到 completion criteria。

最低动作：

1. 为复杂任务记录：
   - completion goal
   - done criteria
   - blocked criteria
   - verification requirements

2. 把以下能力接成同一条 runtime 纪律：
   - auto continue
   - provider continuation
   - queue resume
   - subagent handoff
   - context compaction
   - evidence export

3. 用户可见层只展示同一条事实链：
   - 当前目标
   - 完成到哪
   - 为什么继续
   - 为什么停下
   - 下一次从哪里恢复

退出条件：

- 长任务暂停、压缩、恢复、交接后，仍能在同一 session 语义内解释“还差什么、为什么继续、何时结束”。
- Managed Objective 只消费 AgentRuntime / Evidence facts，不成为第四套 runtime。

### Phase 5：GUI / CDP 证据进入风险分级

状态：进行中  
目标：把 GUI 验证从手动经验变成预算可控的可复跑证据。

分级：

- Gate A：browser projection / 普通 Chrome / fixture，只证明投影稳定。
- Gate B：真实 Electron CDP / Electron fixture，证明 Desktop Host、IPC、App Server JSON-RPC 与用户可见状态。

最低动作：

1. 普通模块变更默认走 C0 / C1：
   - 静态检查
   - 单测
   - contract
   - fixture smoke

2. GUI 主路径或 bridge 变更进入 C2：
   - `verify:gui-smoke`
   - Playwright / Electron CDP

3. Gate B 证据必须包含：
   - `window.__LIME_ELECTRON__ === true`
   - `window.electronAPI.invoke` 存在
   - trace 有 `transport: "electron-ipc"`
   - command 为 `app_server_handle_json_lines`
   - JSON-RPC method 能对应本轮动作

退出条件：

- 每个高风险 GUI 改动都能说明 proof level。
- 不再把普通浏览器镜像证据误报成真实 Electron 产品链路通过。

### Phase 6：巨型文件治理嵌入每次触碰

状态：持续  
目标：不做一次性“大重构”，而是在每次触碰时缩小风险面。

当前已登记热点包括：

- Aster `reply_parts.rs`
- App Server `runtime_backend/tests.rs`
- `CharacterMention.tsx`
- `inputCapabilitySections.ts`
- `useWorkspaceSendActions.ts`
- `AgentChatWorkspace.tsx`
- `MessageList.test.tsx`
- `request_tool_policy.rs`
- `codex/events.rs`
- `StreamingRenderer.test.tsx`

规则：

1. 触碰超过 `1000` 行的文件，优先拆边界。
2. 本轮无法拆时，必须登记：
   - 为什么不能拆
   - 影响
   - 下一次拆分入口
   - 退出条件

退出条件：

- 新业务逻辑不再继续进入中心巨型文件。
- 相关测试逐步迁到 view model / selector / projection / focused fixture。

## 6. 每轮治理任务的固定流程

### 6.1 开工前

1. 明确本轮服务哪条主线：
   - Aster 退场
   - App Server current
   - Harness evidence
   - State / History / Telemetry
   - GUI 主路径
   - Plugin / Skill runtime

2. 用一句话写事实源声明：

```text
这个能力以后只允许向 <current owner> 收敛。
```

3. 盘点四层：
   - 入口层
   - 服务层
   - 存储层
   - 旁路层

### 6.2 实施中

必须先分类，再动刀：

- `current`：继续强化
- `compat`：只允许委托
- `deprecated`：只允许迁移和下线
- `dead`：删除或守卫

禁止行为：

- 为旧实现补新功能
- 为了少改文件新增 compat 包装层
- 主链迁了但旁路继续读旧表 / 旧命令
- mock 进入生产 fallback
- 把 GUI 截图当成 runtime / evidence 证据

### 6.3 收尾时

必须回答：

1. 本轮收掉了什么 surface。
2. 哪些对象仍是 `compat / deprecated`。
3. 退出条件是什么。
4. 跑了哪些验证。
5. 哪些高风险验证没跑，为什么。
6. 下一刀最该打哪里。

## 7. 周期性治理节奏

### 每周

1. 跑一次：

```bash
npm run governance:legacy-report
```

2. 只看：
   - 边界违规
   - 分类漂移候选
   - 与当前主线相关 residual

3. 如果出现边界违规，优先修掉，不进入新的大功能治理。

### 每两周

1. 复核 `CCD-012`。
2. 确认每个跨命令组 residual 是否仍有退出条件。
3. 清掉已零引用但仍标 `deprecated` 的条目，能转 `dead` 就转。

### 每月

1. 复核 Aster 退场指标：
   - root `aster` dependency
   - `lime-agent` direct dependency
   - `rg "aster::|use aster"` 命中数
   - vendor 文件数

2. 复核 Harness 指标：
   - verification outcome 是否仍同源
   - cleanup / review / dashboard 是否出现语义漂移
   - GUI smoke / CDP 证据是否有 proof level

3. 复核巨型文件：
   - 新增业务逻辑是否进入超过 `1000` 行文件
   - 已登记债务是否至少减少一个

### 每季度

1. 判断是否减少了事实源数量。
2. 判断是否减少了 compat / deprecated 数量。
3. 判断 AI 新进项目时是否更不容易走错路。
4. 判断文档是否有过期 current 声明。

季度治理结论只允许三类：

- `收敛`
- `持平`
- `发散`

如果是 `持平` 或 `发散`，下一季度优先做治理减法，不扩新面。

## 8. 指标

### 8.1 主要指标

| 指标 | 当前基线 | 目标 |
| --- | --- | --- |
| `governance:legacy-report` 边界违规 | 0 | 0 |
| root `aster` dependency | 存在 | 删除 |
| `lime-agent` direct Aster dependency | 存在 | 删除 |
| `lime-rs/vendor/aster-rust` 文件数 | 约 671 | 0 或历史只读引用 |
| `mockPriorityCommands` | 空集合 | 保持空集合 |
| DevBridge current 传输链 | 存在 | 保留，不误删 |
| CCD-012 residual | 进行中 | 每个 residual 有退出条件 |
| Gate B GUI 证据 | 可用但高成本 | 只用于高风险 GUI 主路径 |

### 8.2 不追求的指标

不要追求：

- 一次性删最多文件
- 文档数量最多
- 每轮都跑最重验证
- 所有路线图都同步到最新叙事

应该追求：

- 事实源更少
- 旧路更难回流
- 验证证据更准
- AI 更不容易沿旧路径生成

## 9. 近期建议下一刀

### 第一刀：Aster session / subagent adapter 缩边界

目标：

继续把 subagent metadata、session projection 和 Aster adapter 的职责重新分层，为后续 `thread-store` 接管做准备。

推荐处理对象：

- `lime-rs/crates/agent/src/session_store_subagent_aster_adapter.rs`
- `lime-rs/crates/agent/src/session_store_subagent_context.rs`
- `lime-rs/crates/thread-store/**`

理由：

P0 已把治理扫描恢复为绿；下一步应沿同一条高杠杆主线，把 Aster session / subagent compat adapter 缩到可删除边界，而不是继续做零散 dead surface 清理。

### 第二刀：Aster provider / reply loop 退场

目标：

让 current provider stream / turn executor 接管后，删除 Aster provider / reply loop。

理由：

这条线同时连接：

- Aster 退场
- provider runtime
- turn executor
- request tool policy

收益高于继续做零散 dead surface 清理。

### 第三刀：CCD-012 residual 复核

目标：

把 `plugin_runtime_*` 这组 no-mock compat 命令重新确认分类、退出条件和 current owner。

理由：

DevBridge residual 是长期容易误判的地方。如果不定期复核，后续 AI 很容易把 compat policy 当成 current 命令事实。

## 10. 完成判定

本路线图不是一次性完成。

它的阶段性完成标准是：

1. 当前 `governance:legacy-report` 为绿。
2. Aster root dependency 和 `lime-agent` direct dependency 删除。
3. DevBridge 只剩 current renderer bridge 与明确 test-only guard，不再有无退出条件的 compat residual。
4. Harness verification outcome 能控制 review / cleanup / promote 的默认动作。
5. 高风险 GUI 改动都能给出 Gate A / Gate B 证据边界。
6. 技术债追踪不再只增加条目，每月至少关闭一个高杠杆治理债。

整体目标完成度口径：

- `40%`：文档规则与守卫已经存在，旧 Tauri wrapper 已删除。
- `60%`：命令 current 主迁移完成，DevBridge / Aster / Harness residual 均有事实源。
- `80%`：Aster dependency 删除，governance report 持续绿，Harness verification 驱动动作。
- `100%`：长期任务、GUI、Harness、State、Plugin / Skill runtime 都能默认沿 current 事实源闭环，AI 新进项目时基本不会因旧文档 / 旧命令 / 旧测试走偏。

按当前状态估算，Lime 长期治理整体完成度约 `66%`。

这个估算不是功能完成度，而是治理闭环完成度：规则很多、守卫不少、主链已经清楚，当前治理扫描已恢复为绿，但 Aster dependency、DevBridge residual 和长任务闭环仍未完全收口。

## 11. 红线

后续出现以下任一情况，视为治理倒退：

1. 恢复 `lime-rs/src/**` 或 `lime-rs/src/commands/**`。
2. 为 Aster 新增 current 业务能力。
3. 在 `src/lib/dev-bridge/**` 中把旧命令重新放进 production truth 或 mock fallback。
4. 生产路径依赖 `mockPriorityCommands`、`defaultMocks`、`invokeMockOnly` 或 App Server mock backend。
5. GUI / review / analysis / dashboard 各自重新拼 runtime 真相。
6. 普通 Chrome Gate A 证据被写成真实 Electron Gate B 证据。
7. 新增超过 `1000` 行中心文件里的业务逻辑而没有拆分计划。
8. 文档里继续宣称已经无 Aster 依赖或 Aster 迁移 `99%` 完成。

## 12. 一句话总结

Lime 的长期治理目标，不是让仓库看起来更干净。

而是让每一次 AI 或人工迭代之后，系统都更清楚：

- 当前事实源是谁
- 旧路为什么不能走
- 验证证据在哪里
- 下一刀为什么值得做

只要这四件事越来越清楚，Lime 才能长期承接更强的模型、更复杂的任务和更快的迭代速度。
