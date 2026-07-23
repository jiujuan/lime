# Codex V1 Tool Turn Snapshot 进度

> status: metadata-projection-skeleton / execution-chain-not-wired
> owner: tool-runtime cold slice
> date: 2026-07-23
> roadmap: `internal/refactor/v1/04-execution-plan.md#v1-05-tool-hooksexposurelifecycle`
> upstream: `/Users/coso/Documents/dev/rust/codex`
> upstream revision audited: `9fc715c0861c956c894a91890b78dc05b304ba29`

## 主目标与本轮边界

V1-05 的目标链固定为：

```text
ToolSnapshot + HookSnapshot
  -> repaired typed ToolCall
  -> execute_call
  -> NormalizedToolOutput
  -> canonical Thread / Turn / Item
```

本轮只建立 `tool-runtime` 内不可变的 turn metadata projection 合同，不接入正在并行修改的
provider/tool lifecycle 热区，也不宣称 Hook injection、block、abort、rewrite 或 permission
lifecycle 已完成。

Codex 当前没有同名的统一 `ToolSnapshot` / `HookSnapshot` 类型：每个 sampling step 冻结
`ToolRouter { registry, model_visible_specs }`，Hook 则由独立 discovery/engine 持有。本模块
只为 Lime 的 V1-05 接线提供结构化投影，不能替代这两个 upstream owner。

`internal/refactor/v1/README.md` 仍把参考快照锁在 `2e4f556...`；本切片按上述 current HEAD
只读审计。是否整体升级 v1 reference lock 由协调进程统一裁决，本车道不夹写总路线图。

## 写集与协调

本轮认领：

- `lime-rs/crates/tool-runtime/src/turn_snapshot.rs`
- `lime-rs/crates/tool-runtime/src/lib.rs`
- `internal/refactor/v1/09-tool-turn-snapshot-progress.md`

本轮只读：

- `internal/refactor/v1/04-execution-plan.md`
- `/Users/coso/Documents/dev/rust/codex` 中的 tool/hook snapshot 参考实现

本轮避让：

- `lime-rs/crates/agent-runtime/src/provider_turn.rs`
- `lime-rs/crates/agent-runtime/src/reply_stream.rs`
- App Server projection/runtime/protocol
- `packages/agent-runtime-client/src/eventVerifier.ts`
- `lime-rs/crates/tool-runtime/src/tool_call_surface.rs`
- `lime-rs/crates/tool-runtime/src/turn_tool_surface.rs`

上述文件属于共享工作树并行热区。snapshot 接线必须由持有 provider/tool lifecycle
写集的进程完成，禁止在本记录对应车道夹写。

## 已实现骨架

- `RuntimeToolSnapshot` 固化大小写敏感的 `namespace + name` identity、definition、
  Direct/DirectModelOnly/Deferred/Hidden exposure、逐工具 `supports_parallel` 和当前 sampling
  step 的最终 `model_visible` 选择。
- `RuntimeHookSnapshot` 固化稳定配置 key、event、handler type、sync/async mode、matcher、
  timeout、source、trust、enabled、绝对 source path 和全局 display order；scope 只由 event
  派生，不能构造 `SessionStart + Turn` 等不可能状态。
- `RuntimeTurnSnapshot::try_new` 对精确工具 identity、Hook key 和 display order 重复
  fail closed；拒绝空 namespace、definition identity 漂移、Hidden 工具并行声明和相对
  Hook source path。
- 提供显式 step visibility、deferred、exact identity lookup 和按全局 display order 排序的
  Hook event 读取。
- serde round-trip 保留 tool/hook snapshot 合同，反序列化重新执行同一 fail-closed 校验，
  不能绕过 `try_new` 注入无效状态。

当前只表示“turn snapshot 可被构造和验证”，不表示 snapshot 已成为 sampling step 或
tool execution 的事实源。

## Agent Verification Contract

```text
改动名称：V1-05 Tool/Hook turn snapshot 骨架
执行计划文件：internal/refactor/v1/09-tool-turn-snapshot-progress.md
负责人：tool-runtime cold slice
预算标签：budget:tight
风险等级：P1
影响模块：tool-runtime
不做范围：provider loop、App Server、协议、GUI、Hook 执行、approval/sandbox
```

Current 主链：

```text
前端入口：不适用；本轮无用户入口
前端网关：不适用；本轮无协议变更
Electron Desktop Host bridge：不适用；本轮无 bridge 变更
App Server method：不适用；snapshot 尚未接线
RuntimeCore / service owner：tool-runtime
read model：不适用；尚未投影 canonical Item
runtime event：不适用；尚未产生 lifecycle event
Evidence Pack 字段：不适用；本轮仅 crate deterministic evidence
GUI surface：不适用；本轮无用户可见变更
```

Happy Path：

```text
Agent 输入：同一 turn 的工具和 Hook 注册快照
预期 runtime events：本轮不产生
预期 tool calls：本轮不执行
预期 approval / sandbox：本轮不处理
预期 artifact：validated RuntimeTurnSnapshot metadata projection
预期 evidence：tool-runtime unit + crate test
预期 GUI 状态：无变化
失败时应停在哪一层：tool-runtime snapshot construction
```

Evidence Layers：

| Layer | 本次是否需要 | 证据路径 / 计划路径 | 不需要的原因 |
| --- | --- | --- | --- |
| deterministic-smoke | 是 | `tool-runtime` unit/crate test | 验证结构、分类、重复拒绝和 serde |
| gui-trace | 否 | 无 | snapshot 尚未接线，无 GUI 行为 |
| runtime-transcript | 否 | 后续 provider/tool lifecycle 接线补 | 本轮不执行 tool call |
| release-artifact | 否 | 无 | 骨架不可进入 release evidence |

Agent QC 场景映射：

```text
P0：无
P1：tool snapshot construction and rejection
P2：无
为什么需要：V1-05 的 execution contract 必须先有稳定输入快照
为什么不需要其它 P0：本轮未触达 App Server、read model 或 GUI
是否允许单场景 sidecar：否；尚无可验证接线
是否允许进入 official evidence：否
```

Supervisor：不需要。确定性 Rust 合同不使用 LLM judge。

## 验证

已通过：

```bash
CARGO_TARGET_DIR="/tmp/lime-tool-snapshot-target" \
  cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime turn_snapshot
# 5 passed; 0 failed

CARGO_TARGET_DIR="/tmp/lime-tool-snapshot-target" \
  cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime
# 268 passed; 0 failed

git diff --check -- \
  "lime-rs/crates/tool-runtime/src/lib.rs" \
  "lime-rs/crates/tool-runtime/src/turn_snapshot.rs"
```

未跑：

```text
npm run smoke:agent-runtime-current-fixture
npm run verify:gui-smoke
Gate B / live Provider
```

原因：snapshot 尚未接入 sampling、tool execution、canonical Item 或 GUI；运行跨层门禁无法
证明该骨架的接线行为。风险是当前只具备 Unit 级证据，不能标记 V1-05 完成。

共享工作树未通过：

```bash
npm run test:rust:related -- \
  "lime-rs/crates/tool-runtime/src/lib.rs" \
  "lime-rs/crates/tool-runtime/src/turn_snapshot.rs"
```

该入口正确扩展到 `agent-runtime`、App Server、`lime-agent`、`lime-mcp`、scheduler、server
和 `tool-runtime`，但 `lime-server` 的 provider handler 仍匹配已不存在的
`CanonicalLlmEvent::ReasoningDelta`，在两份并行热区文件产生 5 个 `E0599`，因此退出码为
101。该 blocker 不属于 snapshot 写集；本车道不修改 server/provider consumer。

## 下一刀与退出条件

热区 owner 接线时必须完成：

1. turn/step owner 在构建 Codex-style `ToolRouter` 后捕获唯一 `RuntimeTurnSnapshot`，同一
   sampling step 的所有 tool calls 保留同一 router；后续 registry 变化只影响下一 step。
2. typed repair 从 snapshot 解析 canonical tool identity，`execute_call` 只消费已修复调用。
3. `NormalizedToolOutput` 保持 call/thread/turn identity，并投影 canonical lifecycle Item。
4. Hook discovery/runtime 成为 matcher、enabled/trust、handler 与 lifecycle outcome 的唯一
   owner；实现 injection/block/abort/rewrite/permission，覆盖失败、取消、重启恢复和 late
   terminal 拒绝。Prompt/Agent/Async 在 upstream 未形成真实执行能力前不得标成 supported。
5. 增加 owner integration test、current runtime fixture；触达 GUI 后再补 Gate B。

完成标准：上述接线与跨层 evidence 全部闭环后，才能把 V1-05 从
`alignment-open` 改为 `completed`。

## 架构确认

本轮为非重大架构变更：只在既有 `tool-runtime` owner 内增加 V1-05 已规划的 snapshot
合同，没有改变 crate、跨层依赖、协议、read model、Provider owner 或 Electron 数据流，
因此不更新 `internal/aiprompts/architecture.md`。
