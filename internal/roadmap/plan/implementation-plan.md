# Lime Plan Implementation Plan

> 状态：skeleton-first implementation plan
> 更新时间：2026-06-23
> PRD：`internal/roadmap/plan/prd.md`
> 执行记录：`internal/exec-plans/plan-runtime-implementation-progress.md`

## 1. 目标

先把 Lime Plan 能力的工程骨架搭完整，再按阶段填充实现细节。

本计划只负责实施拆分与退出条件；产品背景、用户故事、架构图、流程图、时序图、数据协议和完整验收标准以 PRD 为准。

## 2. 主线边界

实现只进入 current 主链：

- App Server / RuntimeCore / RuntimeBackend。
- AgentEvent / ThreadReadModel。
- AgentUI / PlanRail / TaskRail。
- current model registry / provider capability。

明确不做：

- 不新增独立 Planner 服务。
- 不恢复 `lime-rs/src/**`、旧 Tauri wrapper 或旧 `agent_runtime_*` 生产事实源。
- 不让生产路径依赖 mock fallback。
- 不把 opencode 的 plan file / plan_exit 工作流搬进 Lime。
- 不在骨架阶段深改 right-surface 或 GUI 大组件。

## 3. 分阶段骨架

### P0：骨架完成

目标：

- 路线图目录、PRD、实施计划和执行记录落库。
- 后端建立 plan / reasoning / model capability 的最小模块边界。
- 前端建立 PlanState / ModelReasoningState 的最小 selector。
- 骨架层定向测试通过。

当前文件：

```text
internal/roadmap/plan/
  README.md
  prd.md
  implementation-plan.md

internal/exec-plans/
  plan-runtime-implementation-progress.md

lime-rs/crates/app-server/src/runtime_backend/
  model_capability.rs
  plan_events.rs
  reasoning_events.rs

src/components/agent/chat/utils/
  planState.ts
  planState.unit.test.ts
  modelReasoningState.ts
  modelReasoningState.unit.test.ts
```

退出条件：

- 骨架文件存在，职责边界清楚。
- 新增代码只做保守结构定义、事件 builder 或 selector，不接复杂 runtime 状态机。
- 定向测试覆盖基础转换，不宣称 GUI 产品闭环完成。

### P1：后端事件主链

目标：

- `<proposed_plan>` 流式 parser 输出 `plan.delta / plan.final`。
- `update_plan` 工具结果投影为 `plan.final`。
- thinking / reasoning 归一为标准 reasoning events。
- 本轮模型与 reasoning 能力输出 `model.effective`。

退出条件：

- Rust 定向测试覆盖 proposed plan、update_plan metadata、reasoning event、model effective。
- 不新增 App Server 平行 method，除非 PRD 中的 plan confirmation 进入单独阶段。

### P2：前端协议与状态

目标：

- `AgentEvent` 一等支持 `plan_delta / plan_final / reasoning_delta / reasoning_final / model_effective`。
- live event 与 ThreadReadModel 共用 PlanState / ReasoningState hydrator。
- stream handler 将 plan event upsert 到统一 thread item / plan state。

退出条件：

- 前端单元测试覆盖 event parser、PlanState、reasoning state。
- UI 仍可从历史 thread items 恢复计划。

### P3：UI 对齐 Codex

目标：

- PlanRail / TaskRail 显示 live updated plan。
- MessageList 内联计划块去重。
- Plan Mode 状态、模型标签、reasoning 档位和实施确认形成闭环。
- 用户可见文案覆盖五语言。

退出条件：

- 组件回归覆盖计划轨、实施确认、模型 / reasoning 状态。
- `npm run smoke:agent-runtime-current-fixture` 与 GUI smoke 按风险通过。

### P4：多模型验证

目标：

- Codex/OpenAI、Anthropic、Gemini、OpenAI-compatible、无 reasoning 模型分别有 fixture 或定向用例。
- 不支持 reasoning 的模型不伪造 thinking。
- 支持 reasoning 的模型保留过程事件，但 PlanRail 只消费 plan facts。

退出条件：

- 多模型能力矩阵稳定。
- `model.effective`、`reasoning.delta/final`、`plan.delta/final` 可 live 展示并可历史恢复。

## 4. 下一刀规则

每一刀只推进一个主缺口：

1. 优先补 P1 后端 plan event 主链。
2. 再补 P2 前端协议和状态。
3. 后端和协议稳定后再做 P3 UI。
4. 多模型细节放到 P4，不在 P0/P1 提前展开。

如果发现旁支问题，只在阻塞当前阶段时处理；否则登记到执行计划，不顺手扩范围。

## 5. 验证策略

P0 骨架：

```bash
npx vitest run "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" --silent=passed-only --disableConsoleIntercept
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_capability
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server plan_events
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server reasoning_events
```

P1/P2 起步后：

```bash
npm run test:contracts
npm run smoke:agent-runtime-current-fixture
```

P3 用户可见 UI 后：

```bash
npm run verify:gui-smoke
```
