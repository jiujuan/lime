# Token 预算策略

> 目标：让 Agent QC 和验证闭环长期可运行，而不是因为 token 成本过高被迫停用。

## 1. 基本原则

1. **默认不用 LLM**
   - schema、contract、bridge、mock、read model、evidence 是否存在，全部用确定性检查。

2. **默认不用 live Provider**
   - 优先 fixture backend、localhost OpenAI-compatible fixture、离线 replay、deterministic smoke。

3. **默认不跑 full qcloop**
   - 日常开发只跑相关场景和低成本 lane。

4. **LLM judge 只审模糊语义**
   - 最终回答质量、artifact 质量、路径合理性、用户意图满足度。

5. **失败必须降本**
   - 每次高成本失败都要沉淀成更便宜的回归：unit / fixture / replay / deterministic smoke / contract guard。

## 2. 验证成本分级

| 级别 | 成本 | 默认场景 | 示例 |
| --- | --- | --- | --- |
| C0 | 极低 | 文档 / schema / manifest / 静态检查 | `agent-qc:check`、`test:contracts` |
| C1 | 低 | fixture / unit / deterministic smoke | `smoke:agent-runtime-current-fixture` |
| C2 | 中 | GUI smoke / Playwright trace | `verify:gui-smoke -- --reuse-running` |
| C3 | 高 | qcloop 多 worker / LLM verifier | `agent-qc:qcloop-job` |
| C4 | 最高 | live Provider / 长程 Agent / release full P0 | `claw-chat-ready-streaming --allow-live-provider` |

默认策略：

```text
普通改动：C0 + C1
GUI 主路径：C0 + C1 + C2
Agent runtime 高风险：C0 + C1 + targeted C2
发布候选：C0 + C1 + C2 + selected C3
正式发布：8/8 P0 official evidence，必要时 C4
```

## 3. Token 预算阈值

建议引入三档预算标签：

| 标签 | 可用验证 |
| --- | --- |
| `budget:tight` | 只允许 C0 / C1；禁止 qcloop、live Provider、开放式 LLM judge |
| `budget:normal` | 允许 targeted C2；LLM judge 只审一个明确 rubric |
| `budget:release` | 允许 selected C3 / C4，但必须有 owner、场景、上限和产物路径 |

每次 Agent QC 运行前必须声明预算标签。

## 4. 降本动作

优先做这些，而不是继续烧 token：

1. 把自然语言 verifier 改成 JSON schema verifier。
2. 把 live Provider 场景改成 fixture backend。
3. 把 GUI E2E 的重复点击改成 single-owner trace 复用。
4. 把长程 qcloop 拆成 P0 单场景验证。
5. 把 Supervisor 输出限制为 JSON rubric，不允许长篇解释。
6. 把失败 transcript 裁剪成摘要，不把完整 stderr 塞给 verifier。
7. 每个 P0 场景维护最小 evidence artifact，而不是让 worker 重新探索。

## 5. 不该做

- 不用 LLM judge 审 schema。
- 不用 qcloop 做“帮我看看还有什么问题”的开放探索。
- 不把完整日志直接塞进 verifier prompt。
- 不让多个 GUI worker 抢同一个 GUI session。
- 不把 live Provider 当日常 smoke 前提。
