# Flag Differential Harness 骨架

> 目标：用同一套场景比较 feature flag 前后差异，避免“新功能到底好没好”只能靠感觉。

## 1. 基本流程

```text
flag off -> baseline run -> baseline evidence
flag on  -> candidate run -> candidate evidence
diff     -> deterministic comparison + Supervisor rubric
decision -> pass / regression / needs-human-review
```

## 2. 首批适用对象

- Claw streaming / cancel 语义
- tool selection 策略
- SkillTool gate
- approval / sandbox policy
- Managed Objective auto continuation guard
- Agent App UI runtime lifecycle
- Supervisor rubric 自身

## 3. 复用现有入口

优先复用：

```bash
npm run agent-qc:benchmark:plan
npm run agent-qc:benchmark:compare
npm run harness:eval
npm run harness:eval:trend
```

不要另起平台。

推荐执行顺序：

```text
1. benchmark:plan 生成场景、requiredEvidence、failureModes
2. baseline 复用最近 green 或最近稳定 sidecar
3. candidate 只跑受影响场景
4. benchmark:compare 产出 deterministic diff
5. Supervisor 只审 diff summary
```

## 4. Diff 输出

最小结构：

```json
{
  "scenarioId": "",
  "baseline": {
    "evidenceRef": "",
    "status": "pass"
  },
  "candidate": {
    "evidenceRef": "",
    "status": "pass"
  },
  "deterministicDiff": [],
  "semanticDiff": {
    "scoreDelta": 0,
    "regressions": []
  },
  "decision": "pass|regression|needs-human-review"
}
```

## 5. 成本控制

- baseline evidence 优先复用最近 green run。
- candidate 只跑受影响场景。
- Supervisor 只看 diff summary。
- 不为每个小改动跑 full P0。
- 没有 deterministic diff 就不启动 Supervisor。

## 6. 最小样例：Managed Objective auto continuation guard

这是当前最适合做首个 diff 样例的对象，因为它的差异可以只看三类事实：

1. 是否多出了一轮 continuation turn。
2. 是否写入了 continuation policy / guard summary。
3. 在 pending request、pause、budget_limited 这类边界下，candidate 是否保持 fail-closed。

### 6.1 为什么选它

- baseline 可以直接复用最近稳定的 `managed-objective-continuation` smoke。
- candidate 只切一个 flag，不需要另起一套 runtime。
- deterministic diff 只需要 turn 数、objective status、evidence refs，就能先判一轮，不必先上 LLM judge。

### 6.2 最小 compare 结构

```json
{
  "scenarioId": "managed-objective-auto-continuation-guard",
  "baseline": {
    "evidenceRef": "baseline-sidecar-or-recent-green",
    "status": "pass"
  },
  "candidate": {
    "evidenceRef": "candidate-flag-on-sidecar",
    "status": "pass"
  },
  "deterministicDiff": [
    "baseline.turnCount=0",
    "candidate.turnCount=1",
    "candidate.continuationSource=auto_idle"
  ],
  "semanticDiff": {
    "scoreDelta": 0.05,
    "regressions": []
  },
  "decision": "pass"
}
```

### 6.3 判定规则

- baseline 和 candidate 都通过 deterministic smoke 时，Supervisor 只看 diff summary。
- 只要 candidate 多出未预期 turn、重复消费 pending request 或突破 budget，就判 regression。
- 只改投影文案、不改 runtime 事实时，优先留给 human review，而不是继续扩 LLM prompt。

### 6.4 下一步

已完成：

1. 默认 `agent-qc:benchmark:plan` 已接入 `internal/test/agent-qc-benchmark.manifest.json`。
2. `agent-qc:benchmark:compare` 已输出 `scenarioDiffs[].deterministicDiff`。
3. Managed Objective sidecar 可以抽取 `turnCount / objectiveStatus / guardDecision / autoContinuationObserved / evidencePackExported` 等字段。

下一刀：

已完成：

1. `needs-human-review` 的 diff summary 已裁剪成 `agent-qc-supervisor-review-input-v1`。
2. Supervisor 输出已固定为 `agent-qc-supervisor-verdict-v1`。
3. 只有 deterministic diff 非空、baseline / candidate 证据完整且无法机械分类时，`supervisorReview.required=true`。

后续扩展：

1. 如需真实 LLM judge，再新增显式 opt-in 执行入口。
2. 默认 `benchmark:compare` 只生成 review input，不调用 Provider。
