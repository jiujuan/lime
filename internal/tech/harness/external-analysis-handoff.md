# Lime 外部分析交接

> 状态：current
> 更新时间：2026-07-12
> 目标：把 Lime 已有的 `handoff / evidence / replay` 资产重新包装成外部 Claude Code / Codex 更容易直接消费的分析入口。

## 1. 先固定边界

这份文档只回答一个问题：

**Lime 怎样把失败现场导出为可交给外部 AI 分析的结构化分析包。**

它不负责：

- 在 Lime 内部自动分析日志
- 在 Lime 内部自动决定修什么
- 自动把修复建议写回代码库
- 跳过人工审核

正确主线是：

`Lime 导出分析包 -> Claude Code / Codex 分析 -> 人工审核 -> 决定是否修复回流`

## 2. 当前已经有哪些输入

当前 `R1` 已经打通三类结构化输入：

1. **Handoff Bundle**
   - `plan.md`
   - `progress.json`
   - `handoff.md`
   - `review-summary.md`

2. **Evidence Pack**
   - `evidence/summary.md`
   - `evidence/runtime.json`
   - `evidence/timeline.json`
   - `evidence/artifacts.json`

3. **Replay Case**
   - `replay/input.json`
   - `replay/expected.json`
   - `replay/grader.md`
   - `replay/evidence-links.json`

问题不是“没有证据”，而是：

**这些证据还没有被重新整理成一个外部 AI 一拿到就知道怎么分析的入口。**

## 3. R2 的当前入口

当前主入口：

```bash
npm run harness:analysis -- --session-id "session-123"
```

也可以直接基于 replay 目录生成：

```bash
node scripts/harness/analysis-brief.mjs \
  --replay-dir ".lime/harness/sessions/session-123/replay"
```

默认输出到：

```text
.lime/harness/sessions/<session_id>/analysis/
```

当前导出两份文件：

- `analysis-brief.md`
- `analysis-context.json`

## 4. 这两份文件各自负责什么

### `analysis-brief.md`

给人和外部 Claude Code / Codex 看的最小分析简报，默认包含：

- 当前问题摘要
- 推荐读取顺序
- replay / handoff / evidence 文件清单
- 可直接给外部 AI 的任务说明
- 人工审核检查清单
- 关键摘录

它的目标是：

**人不需要自己再手拼 prompt，就能把失败案例交给外部 AI 分析。**

### `analysis-context.json`

给外部 AI 程序化消费的机读上下文，默认包含：

- session / thread / strategy / model 摘要
- failure mode / suite tag / blocking 信息
- replay 输入与预期结果
- handoff / evidence 的机读摘要
- 推荐读取顺序
- 外部分析输出合同
- 人工审核检查清单

它的目标是：

**把当前问题的最小上下文预算固定下来，避免每次都从零解释字段含义。**

## 5. 默认读取顺序

外部 AI 默认按下面顺序读：

1. `replay/input.json`
2. `replay/expected.json`
3. `handoff/handoff.md`
4. `handoff/progress.json`
5. `evidence/summary.md`
6. `evidence/runtime.json`
7. `evidence/timeline.json`
8. `replay/grader.md`

这样做的原因是：

- 先确认任务目标和判定标准
- 再确认当前状态和阻塞
- 再看运行证据和时间线
- 最后按 grader 合同输出分析结论

## 6. 外部 AI 输出合同

当前默认要求外部 Claude Code / Codex 输出下面六部分：

1. `结论`
2. `根因判断`
3. `关键证据`
4. `修复建议`
5. `回归建议`
6. `风险与未知项`

默认约束：

- 优先引用现有证据文件，不要假装看到不存在的信息。
- 如果证据不足，必须显式列出缺口。
- 只做分析与建议，不替团队做最终批准或拒绝。
- 如果怀疑外部依赖、权限、路径或环境影响结论，标记为待人工复核。

## 7. 路径与脱敏规则

分析包默认会把工作区根路径替换为占位路径：

```text
/workspace/lime
```

这样做的目的不是隐藏所有路径，而是：

- 让外部 AI 更容易在跨机器、跨环境场景下复用同一份分析包
- 避免把本机绝对路径直接写进长期文档或外发材料

后续如果要扩展：

- 默认继续优先保留相对路径
- 不把完整 prompt、凭证、完整网页正文直接塞进 analysis brief

## 8. 当前缺口

`R2` 这一轮已经补齐了最小分析包入口，并且 GUI 也已经有主入口：

1. 已有标准 `review-decision.md/json` 模板，可把人工审核记录回挂到工作区。
2. 已有 `HarnessStatusPanel` 主链入口，可直接导出 `analysis brief / context` 并一键复制给外部 AI。

当前仍未做完的部分变成了：

1. 外部 AI 的分析结果还需要人工写回 `review-decision` 模板，而不是自动保存。
2. 还没有“审核完成后自动晋升 replay / eval 样本”的规则化入口。

所以当前状态更准确地说是：

**R2 已完成最小交接层，`R3` 正在补人工审核记录和回流决策的留痕。**

## 9. 线程级诊断入口

Harness 工作台保留一套线程级诊断入口：

- `AgentThreadReliabilityPanel`
- 按钮：`复制给 AI`
- 按钮：`复制原始 JSON`

这套入口是 **current 导出链的局部诊断视图**：

- 适合快速复制当前线程的 pending request、incident、warning、recent messages
- 适合人工临时把单个线程的运行异常丢给外部 AI 做一次诊断
- 适合作为 thread reliability 的局部观察面板继续存在

它不能替代外部分析主线事实源，原因很明确：

- 它的输入中心是 `threadRead / turns / threadItems / messages`
- 它导出的是剪贴板文本或原始 JSON，不是工作区内可版本化的交接制品
- 它不覆盖 `handoff / evidence / replay` 三类资产的统一读取顺序
- 它没有固定人工审核清单、输出合同与脱敏策略

当前分类只有一个：`current`。`handoff bundle + evidence pack + replay case + analysis-brief/context` 是可版本化的主导出物；线程级面板只是读取同一 session/thread/turn 事实的快速观察面。

后续只允许继续向同一导出合同收敛：

1. 线程级面板读取 `agentSession/read` 与 evidence/export 的 current 投影，不能维护独立 transcript 或 runtime 缓存。
2. GUI 优先导出 `analysis brief/context`；复制摘要或 JSON 只能复用已导出的字段合同与脱敏规则。
3. 任何无法映射到 session/thread/turn/evidence 的诊断字段都不是产品入口，必须删除或降为 test-only fixture。

## 10. 与当前事实源的关系

| 文档 | 作用 |
| --- | --- |
| `internal/aiprompts/harness-engine-governance.md` | 固定 evidence/export 与 `agentSession/*/export` 的导出顺序和消费边界 |
| `internal/aiprompts/state-history-telemetry.md` | 固定 session/thread/turn/request/evidence 的运行时事实源 |
| `internal/aiprompts/quality-workflow.md` | 固定 contract、Rust、GUI 与 Gate B 验证层级 |
| `internal/test/harness-evals.md` | 固定 replay case、grader、trend 与 cleanup 的评估入口 |

这份文档只负责固定：

- 外部分析交接边界
- 最小导出物
- 默认读取顺序
- 输出合同
