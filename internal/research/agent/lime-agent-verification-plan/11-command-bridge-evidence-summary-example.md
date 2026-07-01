# 样例：`command-bridge-contract` structured evidence summary

> 状态：local deterministic evidence sample
> 更新时间：2026-07-02
> 目标：证明 `command-bridge-contract` 可以先用低 token、确定性证据形成单场景 summary；本文不是 official Evidence Pack，不可作为 release green。

## 1. 本次运行范围

```text
Scenario: command-bridge-contract
Risk: P0
Budget: budget:tight
Evidence depth: deterministic-smoke
Release scope: local-sidecar-only
LLM / qcloop / live Provider: not used
GUI full P0 batch: not used
```

本次只回答一个问题：

```text
在不启动 qcloop、不消耗模型 token 的情况下，
能否证明 Agent QC manifest、owner gate、qcloop worker preflight、命令桥接合同处于可继续推进状态？
```

结论：可以。该结论只覆盖 deterministic lane，不覆盖 GUI trace、runtime transcript 或 release artifact。

## 2. 结构化摘要

```json
{
  "schema_version": "lime-agent-qc-evidence-summary.v1",
  "generated_at": "2026-07-02T01:16:00+08:00",
  "scenario_id": "command-bridge-contract",
  "result": "pass",
  "budget": "budget:tight",
  "evidence_depth": ["deterministic-smoke"],
  "release_scope": {
    "official_evidence_pack": false,
    "can_gate_release": false,
    "reason": "只跑单场景 deterministic summary；official Evidence Pack 必须来自同一批次 8/8 P0 pass。"
  },
  "commands": [
    {
      "command": "npm run agent-qc:check",
      "status": "pass",
      "summary": "scenario manifest valid；13 scenarios；8 P0；GUI flow manifest valid；5 flows；0 issues。"
    },
    {
      "command": "npm run agent-qc:gui-owner-check -- --check --format json --output .lime/qc/agent-verification-gui-owner-current.json --watch-history-output .lime/qc/agent-verification-stale-owner-watch-history.jsonl",
      "status": "pass",
      "summary": "active GUI qcloop owner=0；stale owner=0。"
    },
    {
      "command": "npm run agent-qc:process-owner-check -- --format json --output .lime/qc/agent-verification-process-owner-current.json --markdown-output .lime/qc/agent-verification-process-owner-current.md",
      "status": "pass",
      "summary": "activeGuiSmoke=0；cargoOrRust=0；qcloopRelated=0；passive Electron dev runtime 存在但不阻断本场景。"
    },
    {
      "command": "npm run agent-qc:qcloop-preflight -- --require-devbridge --format json --check",
      "status": "pass",
      "summary": "cwd 可读；tmp 可写；DevBridge health status=ok。"
    },
    {
      "command": "npm run test:contracts",
      "status": "pass",
      "summary": "protocol types no drift；app-server-client contract 283 checks ok；command contracts ok；harness contracts ok；modality contracts ok；scripts governance ok；electron release workflow ok；docs boundary ok。"
    },
    {
      "command": "npm run agent-qc:qcloop-job -- --scenario command-bridge-contract --cwd \"$(pwd)\" --output .lime/qc/qcloop-command-bridge-contract-payload.json --check",
      "status": "pass",
      "summary": "仅生成单场景 qcloop payload，不提交 job；payload valid，且 worker prompt / verifier prompt 均要求 QCLOOP_WORKER_RESULT 与 QCLOOP_EVIDENCE_SUMMARY_JSON。"
    }
  ],
  "artifacts": [
    ".lime/qc/agent-verification-gui-owner-current.json",
    ".lime/qc/agent-verification-process-owner-current.json",
    ".lime/qc/agent-verification-process-owner-current.md",
    ".lime/qc/agent-verification-stale-owner-watch-history.jsonl",
    ".lime/qc/qcloop-command-bridge-contract-payload.json"
  ],
  "known_non_blocking_notes": [
    "scripts-governance 报告本地存在 ignored Python cache files；命令状态仍为 pass，不应提交这些 ignored cache。",
    "passive Electron dev runtime 存在；不是 active GUI smoke / qcloop owner，不阻断 deterministic command-bridge-contract。"
  ],
  "missing_for_release": [
    "同一批次 8/8 P0 qcloop item success。",
    "8/8 QCLOOP_EVIDENCE_SUMMARY_JSON parseable。",
    "official .lime/qc/agent-qc-evidence.json verdict.status=pass。",
    "agent-qc:release-summary --check pass。",
    "agent-qc:audit complete。"
  ],
  "next_action": "把同样的 summary 形状复用到 harness-replay-regression；仍保持单场景 deterministic / replay 优先，不进入 live Provider。"
}
```

## 3. 这份 summary 证明了什么

- Agent QC manifest 和 GUI flow manifest 本身有效。
- 当前机器没有 active / stale GUI qcloop owner。
- 当前机器没有 active raw GUI smoke、Cargo/Rust 或 qcloop owner。
- qcloop worker 的基础运行环境可用，且 DevBridge health 可访问。
- `command-bridge-contract` 的确定性合同门槛通过。
- 单场景 qcloop payload 可以生成，并且已带结构化 evidence summary 硬约束；但本次没有提交 job。

## 4. 这份 summary 不能证明什么

- 不能证明 GUI P0 真实交互通过。
- 不能证明 Runtime transcript、tool timeline、approval / sandbox 深证据通过。
- 不能证明 release artifact 或安装包启动通过。
- 不能覆盖 official `.lime/qc/agent-qc-evidence.json`。
- 不能让 `agent-qc:release-summary --check` 绿色。

## 5. 成本控制规则

后续把本样例推广到其他 P0 场景时，必须保持以下顺序：

```text
manifest / owner / preflight
  -> deterministic command or replay
  -> structured summary
  -> 发现缺口再决定是否升级 qcloop
  -> release 候选才跑 full 8/8 P0 official evidence
```

任何场景如果需要 LLM judge，必须先给出：

- deterministic 层为什么不够。
- 预计 token 上限。
- 输入给 judge 的裁剪后 summary，而不是完整 stdout / stderr。
- 失败时如何回写成更便宜的 deterministic check。
