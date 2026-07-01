# Managed Objective 场景草案：先把控制层验清楚，再决定是否进 Agent QC

> 状态：in-progress
> 更新时间：2026-07-02
> 目标：把 `Managed Objective` 从路线图收敛成一个低 token、可重复、可审计的 P1 / P2 场景草案，优先复用现有 `objective-checklist`、`managed-objective-continuation`、`managed-objective-automation` 入口。

## 0. 先给结论

Managed Objective 不是“还没开始做”的概念。

Lime 现在已经有这些 current 事实源：

- `agent-qc:objective-checklist`
- `smoke:managed-objective-continuation`
- `smoke:managed-objective-automation`
- `internal/roadmap/managed-objective/*`
- 现有 `objective state / evidence audit / automation owner binding / controlled auto continuation` 主链

所以接下来不该再扩一个平行 runtime，也不该直接上 full qcloop。

正确顺序是：

```text
objective checklist
  -> single-turn continuation smoke
  -> automation owner smoke
  -> projection-only GUI smoke
  -> 决定是否纳入 Agent QC
```

默认预算：`budget:tight`。  
默认验证层：C0 / C1。  
只有当 projection 变化真的需要人看时，才上 C2。

## 1. 已有入口和它们分别证明什么

| 入口 | 证明什么 | 成本 | 当前用法 |
| --- | --- | --- | --- |
| `npm run agent-qc:objective-checklist -- --check` | objective state、owner gate、audit summary、process owner 是否能形成可判定 checklist | C0 | 第一层门禁 |
| `npm run smoke:managed-objective-continuation` | 手动 continue 仍然走 Query Loop，且能从 objective snapshot 推出下一轮行为 | C1 | 单轮 continuation smoke |
| `npm run smoke:managed-objective-automation` | automation job 仍是 durable owner，objective 只是控制层 | C1 | 离线 automation owner smoke |
| `npm run verify:gui-smoke -- --reuse-running` | Workspace / projection 能看到后端状态，但不能反过来定义真相 | C2 | 仅在 UI 投影变更时使用 |

## 2. P1：Objective state scaffold

这一刀只回答“状态能不能被保存和读取”。

必须有：

1. `owner_kind / owner_id` 绑定。
2. `success_criteria / budget_policy / risk_policy` 持久化。
3. create / read / pause / resume / clear。
4. restart 后仍能恢复。

不要做：

1. 不启动下一轮 turn。
2. 不创建 automation job。
3. 不执行任何工具。
4. 不新增 objective scheduler / queue。

验证重点：

- 没有 owner 的 objective 不能进入 active。
- paused objective 不能自动恢复运行。
- projection 只读后端状态，不自算完成。

## 3. P2：Manual continuation turn

这一刀只回答“用户点继续时，系统是否还走原有 Query Loop”。

必须有：

1. objective snapshot 写入 continuation metadata。
2. `agent_runtime_submit_turn` 只产生一轮标准 turn。
3. `TurnInputEnvelope` 带上目标上下文。
4. paused / needs_input / budget_limited 时拒绝继续。

不要做：

1. 不做自动 idle continuation。
2. 不做定时后台任务。
3. 不做模型自报完成。
4. 不把 `auto_continue` 文稿语义误当 objective 续跑。

验证重点：

- 一轮 continue 只产生一轮 turn。
- turn 的 runtime evidence 能回到 objective id。
- pending request 存在时，continue 要被挡住。

## 4. P3：Evidence-based audit

这一刀只回答“完成与否由什么决定”。

必须有：

1. `SessionDetail / AgentRuntimeThreadReadModel`。
2. artifact refs。
3. `agent_runtime_export_evidence_pack`。
4. `ObjectiveAuditResult`。

规则：

- 没有 evidence refs 不能 `completed`。
- `criteria=unknown` 不能 `completed`。
- 有 pending user request 时进入 `needs_input`。
- 外部依赖失败时进入 `blocked` 或 `failed`。

这一步是 Managed Objective 能否进入 Agent QC 的分水岭。  
如果 audit 仍然靠模型自报，就不要继续扩大范围。

## 5. P4：Automation owner binding

这一刀只回答“durable 后台任务怎么挂目标，但不让目标变 scheduler”。

必须有：

1. automation job payload 引用 objective id。
2. due job 触发 continuation policy。
3. job run 和 objective audit 互相引用，但不复制事实。
4. pause / resume 行为一致。

不要做：

1. 不新增 objective scheduler。
2. 不新增 objective queue。
3. 不新增 objective run history。
4. 不允许 objective 绕过 automation service。

## 6. 我们还应该如何做

比“再多跑几个 smoke”更重要的是下面这几件事：

1. 把失败分类成 deterministic gap、fixture gap、projection gap、audit gap。
2. 每次失败只补一层证据，不把完整日志塞回 verifier。
3. GUI 只做 projection，不做第二套真相。
4. 默认只用 fixture / replay / local smoke，live Provider 只在明确授权时开。
5. 先把 Managed Objective 作为 P1 / P2 场景跑通，再决定要不要纳入 Agent QC manifest。

## 7. 下一刀

1. 先把这个场景草案挂进 `lime-agent-verification-plan` 索引和进度追踪。
2. 把 `agent-qc:objective-checklist` 作为第一个低成本门禁。
3. 继续用 `smoke:managed-objective-continuation` 和 `smoke:managed-objective-automation` 证明控制层可用。
4. 如果这三层稳定，再考虑把 Managed Objective 纳入更正式的 Agent QC 场景队列。
