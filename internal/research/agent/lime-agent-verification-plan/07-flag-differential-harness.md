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
