# Lime AgentRuntime Profile 路线图

> 状态：proposal
> 更新时间：2026-05-12
> 目标：把 Lime 已有的运行时、任务、模型路由、权限、证据、GUI read model 与 AgentRuntime 标准收敛成一条可执行、可测试、可回放的 current 主链。
> 上游标准草案：`/Users/coso/Documents/dev/ai/limecloud/agentruntime`，当前对齐 `Agent Runtime v0.4.0` 与 `Lime AgentRuntime Profile`。

依赖文档：

- `docs/aiprompts/query-loop.md`
- `docs/aiprompts/task-agent-taxonomy.md`
- `docs/aiprompts/state-history-telemetry.md`
- `docs/aiprompts/harness-engine-governance.md`
- `docs/roadmap/task/README.md`
- `docs/roadmap/agentui/README.md`
- `docs/roadmap/reliability/README.md`

配套文档：

- [./prd.md](./prd.md)：背景、目标、收益、用户故事、范围、验收口径
- [./architecture.md](./architecture.md)：分层、事实源、接口与 profile 映射
- [./adjacent-protocols.md](./adjacent-protocols.md)：`agentcontext`、`agentevidence`、`agentpolicy`、`agentui` 的 owner 边界与连接合同
- [./diagrams.md](./diagrams.md)：架构图、流程图、时序图
- [./implementation-plan.md](./implementation-plan.md)：分阶段落地计划、风险和测试策略
- [./test-cases.md](./test-cases.md)：结构测试、契约测试、回放测试、证据一致性和 GUI smoke 用例

## 1. 这套路线图回答什么

Lime 当前最大问题不是功能不足，而是功能已经很多，却缺少统一运行事实源，导致：

1. 任务、会话、子代理、自动化 job、模型路由、证据导出各自有局部真相。
2. GUI、review、analysis、dashboard 会二次拼状态。
3. 测试只能验证局部函数，难以证明一次 agent turn 从提交到证据导出的完整闭环。
4. 标准协议很多，但没有一条强制绑定 Lime current 主链的 profile。

本路线图回答：

**Lime 如何用 AgentRuntime Profile 把 Objective / Session / Thread / Turn / Task / Tool / Action / Evidence 收敛成一条主链，并让 GUI、review、replay、analysis 只消费这条主链。**

## 2. 固定结论

1. **AgentRuntime 是运行事实主链，不是第十个平行协议。**
   `agentcontext`、`agentpolicy`、`agentevidence`、`agentui`、`agentartifact`、`agenttool` 都是相邻 owner；AgentRuntime 负责把它们串成可恢复、可审计的执行事实，边界见 [./adjacent-protocols.md](./adjacent-protocols.md)。

2. **Lime 先实现 Lime Profile，不直接追完整公开标准。**
   公开 AgentRuntime 保持跨产品通用；Lime Profile 收紧 required ids、event families、snapshot、fixtures 和验收场景。

3. **GUI 只能投影 runtime facts。**
   Workspace、Harness、review、analysis、dashboard 不再重新判断 task status、routing state、permission state、known gaps 或 evidence summary。

4. **Evidence pack 是运行事实导出，不是后处理报表。**
   replay、review、analysis handoff 与 UI diagnostics 必须和 evidence pack 消费同一组 runtime facts。

5. **落地顺序先主链，再扩展面。**
   先保证 submit turn -> runtime events -> thread read -> evidence pack -> UI projection 的闭环，再扩展子代理、job、remote channel、历史修复等高级能力。

6. **全球本地化不进入运行事实源。**
   `type/status/taskKind/source/failureCategory/reasonCode` 等 profile 字段必须是稳定协议值，不能按语言环境变化；用户可见标题、说明、错误提示、按钮和空态只能在 AgentUI / GUI projection 层通过 key-based i18n 渲染。Runtime 可以携带 `message` 作为诊断事实，但不能把中文或英文展示文案当成状态机、测试断言或跨模块 join 条件。

## 3. 固定主链

后续所有实现必须收敛到下面这条链：

```text
Objective / User Input
  -> Session
  -> Thread
  -> Turn
  -> Step / Item
  -> ToolCall / Action / Process / Subagent
  -> RuntimeEvent
  -> Snapshot / ThreadReadModel / TaskSnapshot
  -> EvidencePack / Replay / Review / UI projection
```

这条链意味着：

1. `Session / Thread / Turn` 负责执行上下文。
2. `Task / Run / Attempt` 负责目标工作与重试历史。
3. `Step / Item` 负责有序运行项。
4. `ToolCall / Action / Process / Subagent` 负责可审计副作用与等待点。
5. `RuntimeEvent` 是 canonical event stream。
6. `Snapshot / ThreadReadModel` 是 GUI 和恢复入口。
7. `EvidencePack` 是 replay / review / analysis 的共同事实源。

## 4. current / compat / deprecated / dead 分类

### current

后续继续强化的主路径：

1. `agent_runtime_submit_turn -> runtime_turn -> runtime_queue -> stream_reply_once`。
2. `AgentRuntimeThreadReadModel` 与 current runtime event 链。
3. `agent_runtime_export_evidence_pack` 及其 replay / analysis / review 派生物。
4. `TaskProfile / RoutingDecision / LimitState` 已接入的模型路由事实。
5. Workspace / Harness GUI 对 runtime read model 的只读投影。

### compat

允许短期存在但只能委托的路径：

1. 旧字段映射为 AgentRuntime profile ids。
2. 旧 GUI 状态卡读取新 read model 后继续展示。
3. 旧 evidence/replay 命令通过 `agent_runtime_export_*` 导出。

退出条件：一旦调用方能直接读取 profile read model 或 evidence pack，就删除 compat 映射。

### deprecated

禁止继续扩展的方向：

1. GUI 自己拼 task status / route status / known gaps。
2. analysis/review 各自重建 observability summary。
3. 子代理、automation job、task center 各自维护完成真相。
4. 只靠文本消息推断 tool success、permission denial 或 completion。

### dead

可以直接否定的方向：

1. `agentruntime_ui_state` 作为 UI 专用事实源。
2. `objective_runtime` 作为第四类 runtime taxonomy。
3. `evidence_summary_builder_v2` 作为 evidence pack 平行导出链。
4. 没有 `session/thread/turn` 关联键的 request telemetry 被当作会话级证据。

## 5. 先读顺序

1. [./prd.md](./prd.md)
2. [./architecture.md](./architecture.md)
3. [./diagrams.md](./diagrams.md)
4. [./adjacent-protocols.md](./adjacent-protocols.md)
5. [./implementation-plan.md](./implementation-plan.md)
6. [./test-cases.md](./test-cases.md)
7. `docs/aiprompts/harness-engine-governance.md`
8. `docs/roadmap/task/README.md`

## 6. 完成判定

本路线图完成时，Lime 至少应该能做到：

1. 任意 agent turn 都能导出符合 Lime AgentRuntime Profile 的核心事件和 thread read snapshot。
2. GUI、evidence、review、replay、analysis 读取同一组 runtime facts。
3. tool approval、model routing、task retry、evidence export 都有 fixture 或结构测试覆盖。
4. 旧旁路状态源被分类为 `compat / deprecated / dead`，并有退出条件。
5. 主路径 GUI 冒烟能证明用户真实看到的是 profile read model 投影。
