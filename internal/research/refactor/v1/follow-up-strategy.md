# Codex / opencode 限定上游跟进策略

> 状态：current research baseline
> 更新时间：2026-07-05
> Codex 仓库：`/Users/coso/Documents/dev/rust/codex`
> opencode 仓库：`/Users/coso/Documents/dev/js/opencode`
> Lime current-state 基线：[lime-current-state.md](./lime-current-state.md)

## 1. 目标

Codex 和 opencode 都在快速演进，Lime 不能每天被动追全量变化。Codex 覆盖 Agent 工程主线；opencode 只覆盖多模型、多模态能力变化。

本策略的硬边界：

```text
Codex 可以进入 Agent 工程主链评估；
opencode 只能进入 Provider / Model / Capability / ContentPart / LLMEvent / provider lowering 评估；
opencode 其他变化不进入 Lime backlog。
```

```text
高频观察
  -> 低噪音过滤
  -> 明确分类
  -> 进入 Lime current backlog
  -> 用验证守住落地质量
```

## 2. Codex 固定高价值路径

Codex 上游 diff 优先看：

| 路径 | 关注点 |
| --- | --- |
| `codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs` | `Thread / Turn` 原语字段、status、history view、session tree |
| `codex-rs/app-server-protocol/src/protocol/v2/item.rs` | `ThreadItem` 类型族、item id、tool/message/reasoning/file/web/image 投影单元 |
| `codex-rs/app-server-protocol/src/protocol/v2/turn.rs` | `turn/start`、`turn/steer`、`turn/interrupt`、turn terminal notification |
| `codex-rs/app-server-protocol/src/protocol/event_mapping.rs`、`thread_history.rs` | core event 到 ThreadItem / turn history 的 materialization |
| `codex-rs/app-server-protocol/src/protocol/common.rs` | method registry、params、response、notification、`ClientRequestSerializationScope` |
| `codex-rs/app-server-protocol/src/schema_fixtures.rs`、`codex-rs/app-server-protocol/src/export.rs` | schema fixture、JSON Schema / TypeScript 导出、防漂移策略 |
| `codex-rs/app-server` | request processor、thread/turn、tool、config、mcp、plugin |
| `codex-rs/core/src/session/*` | session lifecycle、turn context、input queue、model stream 接线 |
| `codex-rs/core/src/tasks/*` | task lifecycle、异步任务边界、turn 内任务编排 |
| `codex-rs/core/src/context/*`、`codex-rs/core/src/context_manager/*` | context fragment、token 边界、模型可见内容、world state |
| `codex-rs/core/src/compact*`、`codex-rs/core/src/context_window*` | compaction、context window、token budget |
| `codex-rs/protocol` | core event、ResponseItem、rollout event |
| `codex-rs/tools`、`codex-rs/core/src/tools/*`、`codex-rs/exec` | tool lifecycle、ToolCall、handler、command execution |
| `codex-rs/execpolicy`、`codex-rs/sandboxing` | approval、sandbox、安全策略 |
| `codex-rs/plugin/src/manifest.rs` | plugin manifest、capability metadata、分发边界 |
| `codex-rs/core-skills/src/model.rs`、`codex-rs/skills` | skill metadata、policy、dependency、注入语义 |
| `codex-rs/tui/src/app_server_session.rs` | typed UI facade |
| `codex-rs/tui/src/chatwidget.rs` | orchestration 债和 UI 状态机变化 |
| `codex-rs/tui/src/markdown_stream.rs` | streaming markdown 和 incremental render |
| `codex-rs/state`、`codex-rs/rollout`、`codex-rs/thread-store`、`codex-rs/message-history` | persistence、migration、thread history、replay |
| `codex-rs/rollout-trace/src/*` | trace reducer、runtime trace model、request/turn 关联 |
| `codex-rs/realtime-*`、`codex-rs/core/src/realtime_*`、`codex-rs/app-server-protocol/src/protocol/v2/realtime.rs` | realtime、media item、collaboration 类 notification |
| `codex-rs/app-server-test-client`、`codex-rs/tui/tests` | fixture 和 integration test 模式 |

非高价值路径默认不进入本轮分析，除非 commit message 明确影响 app-server / protocol / agent runtime。

## 3. opencode 固定高价值路径

opencode 上游 diff 只看：

| 路径 | 关注点 |
| --- | --- |
| `specs/v2/provider-model.md` | Provider / Model / Capabilities / Cost / Limit / Variant |
| `packages/llm/src/schema/*` | provider-neutral message/event/options/errors |
| `packages/llm/src/protocols/*` | OpenAI、Anthropic、Gemini、Bedrock 等 lowering |
| `packages/llm/src/providers/*` | 只看 provider capability / media support / lowering 差异，不参考 runtime 组织 |
| `packages/core/src/provider.ts`、`model.ts` | core provider/model catalog |

不在上表内的 opencode 变化不进入本轮分析。尤其是 `specs/v2/session.md`、`specs/v2/tools.md`、`packages/app/src/**`、`packages/protocol/src/**`、`packages/client/src/**`、Effect / Bun runtime 变化，默认记录为无行动或 `reject-for-lime`。

## 4. 分类规则

| 分类 | 判断条件 | Lime 动作 |
| --- | --- | --- |
| `adopt-now` | 与 Lime current 主链同构，能减少分叉或稳定 runtime | 进入 P0/P1 backlog，绑定 owner 和验证 |
| `adapt-for-desktop` | Codex 思路正确，但 Lime 需要 GUI、Electron、i18n、artifact 改造 | 写明桌面化边界后进入模块计划 |
| `watch` | 方向有价值，但上游尚不稳定或 Lime 当前未到该阶段 | 记录触发条件和上游路径 |
| `reject-for-lime` | 只适合 CLI/TUI 或会制造 Lime 双轨 | 记录拒绝原因，防止重复讨论 |

opencode 的分类额外受限：

1. 只有命中第 3 节 allowlist，且确实影响多模型 / 多模态能力表达时，才允许进入 `adopt-now` 或 `adapt-for-desktop`。
2. opencode 的 Session、Tool、UI、protocol generated client、Effect / Bun runtime 即使命中上游热点，也不能进入 `adopt-now`。
3. 如果某个 opencode 变化同时包含能力字段和 UI / runtime 改造，只摘取能力字段，UI / runtime 部分按 `reject-for-lime` 处理。

## 5. 每周跟进流程

1. 记录当前 Codex HEAD。
2. 拉取或更新本地 Codex 和 opencode。
3. 计算 commit range。
4. 过滤 Codex 高价值路径和 opencode allowlist 路径。
5. 对每条变化写：
   - Codex commit / 文件路径。
   - 变化摘要。
   - Lime 对应 owner，先对照 [lime-current-state.md](./lime-current-state.md) 的 current 主链和分类。
   - 分类。
   - 推荐动作。
   - 验证入口。
6. `adopt-now` 和高价值 `adapt-for-desktop` 回挂到 roadmap 或 exec-plan。
7. 若变化进入 P1/P2 推进队列，同步写入 [priority-tracking-plan.md](./priority-tracking-plan.md)。

建议记录模板：

```markdown
## YYYY-MM-DD Codex upstream diff

Codex range: `<old>..<new>`
opencode allowlist range: `<old>..<new>`

| Upstream | Change | Path | Lime owner | Classification | Action | Verification |
| --- | --- | --- | --- | --- | --- |
| codex | ... | ... | ... | adopt-now | ... | ... |
| opencode | ... | ... | ... | adapt-for-desktop | ... | ... |
```

当前本地 checkpoint 见 [upstream-checkpoint.md](./upstream-checkpoint.md)。后续 diff 必须从该文件记录的 Codex / opencode HEAD 起算，避免重复评估已经分类过的上游信号。

## 6. 禁止事项

1. 不做全仓无目标阅读。
2. 不把上游变化直接等同于 Lime 必须实现。
3. 不在 Lime 新增平级第二套 runtime。
4. 不把 Codex TUI 形态当作 Lime GUI 目标。
5. 不把 Codex rollout JSONL 接成 Lime runtime store。
6. 不用 mock fallback 伪造上游能力。
7. 不把结论只留在聊天上下文。
8. 不把 opencode 的 Effect/Bun 技术栈当成 Lime 迁移目标。
9. 不用 opencode 的 Session、Tool、UI 或协议设计替代 Lime 现有主链。
10. 不把 opencode 非 allowlist 变化写入 Lime P0/P1 backlog。

## 7. 进入实施的条件

一个 Codex 上游变化只有同时满足以下条件，才能进入 Lime 实施：

1. 分类为 `adopt-now` 或高价值 `adapt-for-desktop`。
2. 已在 [lime-current-state.md](./lime-current-state.md) 或当前代码中找到 Lime current owner。
3. 不需要恢复 legacy / dead 路径。
4. 已明确最小验证命令。
5. 已能说明它如何提升当前主线完成度。

## 8. owner 绑定规则

| Codex 变化 | Lime owner |
| --- | --- |
| app-server protocol | `lime-rs/crates/app-server-protocol`、`packages/app-server-client` |
| method serialization scope | `lime-rs/crates/app-server-protocol`、App Server processor、`packages/app-server-client` |
| schema fixtures / export | `lime-rs/crates/app-server-protocol/src/schema_export.rs`、protocol type generation、contract tests |
| app-server processor | `lime-rs/crates/app-server/src/processor/*` |
| core session / task runtime | `lime-rs/crates/app-server/src/runtime/*`、`lime-rs/crates/agent/src/*`、RuntimeCore |
| runtime / turn | `runtime/turn_execution.rs`、`agent/src/turn_execution.rs`、front-end active stream controller |
| event materialization | `runtime/projection_*`、ProjectionStore、timeline selectors、Evidence/export |
| context / compaction | `turn_input_envelope.rs`、`protocol_context_projection.rs`、memory prompt、SidecarStore |
| tool / MCP | `tool-runtime`、`mcp`、`runtime_backend/*` |
| approval / sandbox | `tool_permissions.rs`、`action_required.rs`、Desktop Host permission bridge、runtime exec policy |
| TUI facade | `src/lib/api/*`、front-end runtime hooks |
| chat rendering | `MessageList`、`StreamingRenderer`、`AgentThreadTimeline`、Workbench |
| rollout/state/trace | `ProjectionStore`、`EventLogWriter`、`SidecarStore`、import adapters、Evidence/export、requestTelemetry |
| plugin / skills | `plugin_packages`、`skills`、`skill_registry.rs`、应用中心 |
| realtime / media | ModelCapability、ContentPart、media workbench、artifact projection |
| tests/fixtures | contracts、Rust tests、Vitest、Electron smoke、GUI fixture |
| opencode Provider/Model | `modelProvider/*`、`model-provider` crate、model settings UI |
| opencode LLM schema/events | `agent-protocol`、runtime event mapper、front-end ContentPart projection |

## 9. 验证选择

| 变化类型 | 验证 |
| --- | --- |
| method / protocol | `npm run test:contracts` |
| Rust runtime | `npm run test:rust:related -- <paths>` |
| frontend projection | 定向 `npx vitest run ...` + `eslint` |
| Agent streaming | `npm run smoke:agent-runtime-current-fixture` |
| GUI shell / Workspace | `npm run verify:gui-smoke` |
| i18n 文案 | `npm run i18n:check:json` |
| governance / dead path | `npm run governance:legacy-report` |

## 10. 快速判断示例

| Codex 变化 | 分类 | 说明 |
| --- | --- | --- |
| 新增 app-server method 并补 typed response | `adopt-now` | Lime 应同步 protocol discipline |
| method 增加 serialization scope | `adopt-now` | Lime method registry 应补相同并发语义 |
| event_mapping 新增 ThreadItem materialization | `adopt-now` | Lime projection / Evidence 要评估同构 item |
| core session input queue 或 task lifecycle 调整 | `adapt-for-desktop` | 保留 runtime 纪律，按 Lime RuntimeCore 落地 |
| context compaction / token budget 策略变化 | `adapt-for-desktop` | 需要结合 Lime 多模态 sidecar 和 Evidence |
| TUI 新增视觉组件 | `adapt-for-desktop` | 只参考状态机和信息架构，不照搬 UI |
| CLI 参数变更 | `watch` | 除非影响 app-server 或 session model |
| Codex 专属 ChatGPT auth UI | `reject-for-lime` | Lime 多 provider 产品语义不同 |
| rollout schema 或 rollout-trace 新增 event | `adapt-for-desktop` | 先判断 import / evidence / requestTelemetry 是否需要映射 |
| plugin manifest 或 core-skill metadata 调整 | `adapt-for-desktop` | 只吸收 manifest / policy / dependency 纪律，UI 安装按 Lime |
| opencode 新增 provider capability 字段 | `adopt-now` | Lime 多模型能力矩阵应评估同步 |
| opencode prompt input UI 变化 | `reject-for-lime` | opencode UI 不参与，本轮只看多模态能力表达 |
| opencode Effect runtime 重构 | `reject-for-lime` | 技术栈不参与 |
