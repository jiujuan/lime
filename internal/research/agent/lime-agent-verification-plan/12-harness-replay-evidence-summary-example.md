# 样例：`harness-replay-regression` structured evidence summary

> 状态：local deterministic replay evidence sample
> 更新时间：2026-07-02
> 目标：证明 `harness-replay-regression` 可以先用本地 replay / trend summary 形成低成本证据；本文不是 official Evidence Pack，不可作为 release green。

## 1. 本次运行范围

```text
Scenario: harness-replay-regression
Risk: P0
Budget: budget:tight
Evidence depth: deterministic-smoke / replay-summary
Release scope: local-sidecar-only
LLM / qcloop / live Provider: not used
GUI full P0 batch: not used
```

本次只回答一个问题：

```text
在不启动 qcloop、不调用模型的情况下，
能否证明 harness replay manifest 可读、repo fixture 可判定、trend report 至少可形成 seed？
```

结论：可以。`harness:eval` 和 `harness:eval:trend` 均通过；但 trend 只有 1 个样本，只能作为 seed，不能判断长期退化。

## 2. 结构化摘要

```json
{
  "schema_version": "lime-agent-qc-evidence-summary.v1",
  "generated_at": "2026-07-02T01:20:00+08:00",
  "scenario_id": "harness-replay-regression",
  "result": "pass_with_limitations",
  "budget": "budget:tight",
  "evidence_depth": ["deterministic-smoke", "replay-summary"],
  "release_scope": {
    "official_evidence_pack": false,
    "can_gate_release": false,
    "reason": "只跑本地 replay summary 和 trend seed；official Evidence Pack 必须来自同一批次 8/8 P0 pass。"
  },
  "commands": [
    {
      "command": "npm run harness:eval -- --output-json .lime/qc/agent-verification-harness-eval-summary-current.json --output-markdown .lime/qc/agent-verification-harness-eval-summary-current.md",
      "status": "pass",
      "summary": "manifest v1；suites=3；cases=2；ready=2；invalid=0；pendingRequestCaseCount=1；currentObservabilityGapCaseCount=0；degradedObservabilityGapCaseCount=1；currentRecoveredVerificationCaseCount=3。"
    },
    {
      "command": "npm run harness:eval:trend -- --output-json .lime/qc/agent-verification-harness-eval-trend-current.json --output-markdown .lime/qc/agent-verification-harness-eval-trend-current.md",
      "status": "pass",
      "summary": "sampleCount=1；delta invalid=0；latest currentObservabilityGapCaseCount=0；latest degradedObservabilityGapCaseCount=1；signal=样本数不足 2，只形成 trend seed。"
    }
  ],
  "artifacts": [
    ".lime/qc/agent-verification-harness-eval-summary-current.json",
    ".lime/qc/agent-verification-harness-eval-summary-current.md",
    ".lime/qc/agent-verification-harness-eval-trend-current.json",
    ".lime/qc/agent-verification-harness-eval-trend-current.md"
  ],
  "known_non_blocking_notes": [
    "存在 1 个 pending request case；当前 harness eval 仍判 ready，不构成 invalid。",
    "存在 1 个 degraded observability gap；current observability gap 为 0。",
    "trend sampleCount=1，只能证明 trend 报告可生成，不能证明长期趋势稳定。"
  ],
  "missing_for_release": [
    "至少 2 个可比 trend 样本，才能判断长期退化。",
    "同一批次 8/8 P0 qcloop item success。",
    "8/8 QCLOOP_EVIDENCE_SUMMARY_JSON parseable。",
    "official .lime/qc/agent-qc-evidence.json verdict.status=pass。",
    "agent-qc:release-summary --check pass。",
    "agent-qc:audit complete。"
  ],
  "next_action": "继续选择下一个低成本 P0：workspace-ready-session-restore；先只做 owner/preflight + existing smoke summary，不进入 live Provider。"
}
```

## 3. 这份 summary 证明了什么

- Harness eval manifest 可读，且 strict 模式下没有 invalid case。
- 仓库固定 replay 样本 `repo-fixtures` 为 2 / 2 ready。
- 当前 observability gap 为 0；degraded observability gap 为 1，保持为已知降级基线。
- recovered verification outcome 仍有 `artifactValidator:repaired`、`browserVerification:success`、`guiSmoke:passed` 三类。
- trend report 可生成，并明确样本不足时不能冒充长期趋势判断。

## 4. 这份 summary 不能证明什么

- 不能证明长期趋势无退化，因为 `sampleCount=1`。
- 不能证明真实用户工作区 replay 已沉淀，当前 `repo-promoted-replays` 与 `workspace-replay-discovery` 都是 0 / 0。
- 不能证明 GUI P0 或 Runtime transcript 深证据。
- 不能覆盖 official `.lime/qc/agent-qc-evidence.json`。

## 5. 回写规则

后续如果 `harness-replay-regression` 失败，不进入 LLM judge，先按以下顺序回写：

1. invalid case：修 manifest / fixture schema / required field。
2. current observability gap 增加：补 export 或 projection 证据，再沉淀 fixture。
3. trend 样本不足：先积累 history summary，不把 seed 当 release 证据。
4. grader 合同漂移：补确定性 harness contract test。
