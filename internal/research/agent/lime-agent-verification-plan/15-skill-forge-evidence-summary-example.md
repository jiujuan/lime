# 样例：`skill-forge-register-bind-enable` structured evidence summary

> 状态：local Skill Forge deterministic / runtime transcript evidence sample
> 更新时间：2026-07-02
> 目标：证明 `skill-forge-register-bind-enable` 可以在不调用 live Provider、不启动 full qcloop 的前提下，形成低成本 Skill Forge 证据；本文不是 official Evidence Pack，不可作为 release green。

## 1. 本次运行范围

```text
Scenario: skill-forge-register-bind-enable
Risk: P0
Budget: budget:tight
Evidence depth: deterministic-smoke / runtime-transcript
Release scope: local-sidecar-only
LLM / qcloop / live Provider: not used
GUI full P0 batch: not used
```

本次只回答一个问题：

```text
在不让模型真实执行 Skill 的情况下，
能否证明 draft / discovery / binding readiness / session enable / SkillTool gate 的关键边界，
并证明 registered 不等于 executable？
```

结论：可以。`npm run test:contracts` 通过；`npm run smoke:agent-service-skill-entry` 通过，并生成 `.lime/qc/skill-forge-runtime-transcript-current.json`。该 transcript 覆盖 8 个 deterministic runtime events，其中 SkillTool allow / deny 事件都有 request、decision、result，allow 事件还包含脱敏 source metadata。

## 2. 结构化摘要

```json
{
  "schema_version": "lime-agent-qc-evidence-summary.v1",
  "generated_at": "2026-07-02T01:43:00+08:00",
  "scenario_id": "skill-forge-register-bind-enable",
  "result": "pass",
  "budget": "budget:tight",
  "evidence_depth": ["deterministic-smoke", "runtime-transcript"],
  "release_scope": {
    "official_evidence_pack": false,
    "can_gate_release": false,
    "reason": "只跑本地 contract、service skill smoke 和单场景 payload 生成；official Evidence Pack 必须来自同一批次 8/8 P0 pass。"
  },
  "commands": [
    {
      "command": "cargo check --manifest-path lime-rs/Cargo.toml -p lime-media-runtime",
      "status": "pass",
      "summary": "复核此前并发状态下出现的 media-runtime 编译阻断；正确包名下 cargo check 通过，未修改该脏文件。"
    },
    {
      "command": "npm run test:contracts",
      "status": "pass",
      "summary": "protocol types、App Server client contract、command contracts、harness contracts、modality contracts、scripts governance、Electron release workflow、harness cleanup contract、docs boundary 均通过。"
    },
    {
      "command": "npm run smoke:agent-service-skill-entry",
      "status": "pass",
      "summary": "前端 metadata / gateway 38 tests pass；app-server Skill workspace exact tests 4 passed；lime-agent SkillTool gate exact tests 12 passed；服务技能入口路由 58 tests pass；A2UI 挂起主链 7 tests pass。"
    },
    {
      "command": "npm run agent-qc:qcloop-job -- --scenario skill-forge-register-bind-enable --cwd \"$(pwd)\" --output .lime/qc/qcloop-skill-forge-register-bind-enable-payload.json --check",
      "status": "pass",
      "summary": "仅生成单场景 qcloop payload，不提交 job；payload item_count=1，max_qc_rounds=1，evidence_layers 包含 deterministic-smoke 与 runtime-transcript。"
    }
  ],
  "artifacts": [
    ".lime/qc/skill-forge-runtime-transcript-current.json",
    ".lime/qc/qcloop-skill-forge-register-bind-enable-payload.json"
  ],
  "runtime_transcript": {
    "result": "pass",
    "event_count": 8,
    "covered_phases": [
      "registered_skill_discovery",
      "registered_skill_discovery_provenance_gate",
      "runtime_binding_projection",
      "skill_tool_gate_allow",
      "skill_tool_gate_deny",
      "skill_tool_gate_allowlist_scope",
      "skill_tool_gate_permission_deny",
      "skill_tool_gate_session_enable"
    ],
    "skill_tool_gate_proof": {
      "allow": {
        "has_request": true,
        "has_decision": true,
        "has_result": true,
        "has_source_metadata": true,
        "decision_gate": "session_allowlist"
      },
      "deny": {
        "has_request": true,
        "has_decision": true,
        "has_result": true,
        "decision_gate": "session_enable_required"
      }
    }
  },
  "failure_modes_excluded": [
    "registered equals executable：runtime binding 仍停留在 ready_for_manual_enable，不自动进入 query loop / tool runtime / launch。",
    "metadata auto-enables skill：workspace_skill_bindings 只是只读规划上下文，只有 workspace_skill_runtime_enable 才创建 session allowlist。",
    "missing registration provenance：未注册 workspace Skill package 被 discovery guard 忽略。",
    "retired Rust surface：smoke matrix guard 拒绝已删除旧 Skill 链路。"
  ],
  "known_non_blocking_notes": [
    "首次 smoke 在前端测试分组中读到旧预期，随后发现测试文件已被外部改为复用实例口径；定向复跑该分组与完整 smoke 均通过。",
    "A2UI 测试输出 i18next 未初始化 warning，测试仍通过；该 warning 不是本场景 blocker。",
    "本次没有调用 live Provider，也没有让模型真实执行 Skill。"
  ],
  "missing_for_release": [
    "同一批次 8/8 P0 qcloop item success。",
    "8/8 QCLOOP_EVIDENCE_SUMMARY_JSON parseable。",
    "official .lime/qc/agent-qc-evidence.json verdict.status=pass。",
    "agent-qc:release-summary --check pass。",
    "agent-qc:audit complete。"
  ],
  "next_action": "继续选择下一个低成本 P0：tool-approval-sandbox-boundary；先跑 deterministic tool surface 与 denied-only approval evidence，live Provider 仍需明确授权。"
}
```

## 3. 这份 summary 证明了什么

- Capability Draft / registered skill discovery / runtime binding projection / explicit runtime enable metadata 的 current 链路没有 contract 漂移。
- App Server 只发现 workspace-local 且带 provenance 的 registered Skill package。
- Runtime binding readiness 不等于自动执行；ready binding 仍需要 session scope 显式 enable。
- SkillTool gate 的 allow / deny 都有结构化 request、decision、result；allow 侧带 source metadata。
- 单场景 qcloop payload 可以生成，并要求 worker 采集 runtime transcript 证据。

## 4. 这份 summary 不能证明什么

- 不能证明 full qcloop worker / verifier 已采信本次证据。
- 不能证明 live model provider 会在真实长 turn 中正确选择并执行 Skill。
- 不能证明 release 包或 GUI 深交互。
- 不能覆盖 official `.lime/qc/agent-qc-evidence.json`。

## 5. 回写规则

后续如果 `skill-forge-register-bind-enable` 失败，不进入 LLM judge，先按以下顺序回写：

1. Contract drift：补 App Server client / command / governance catalog 同步。
2. Rust exact tests running 0：修 smoke matrix，拒绝空跑。
3. Missing runtime transcript：修 `service-skill-entry-smoke.mjs` transcript artifact。
4. Registered 被误判为 executable：补 binding projection / SkillTool gate guard。
5. Live Provider 执行失败：单独升级到授权后的 live runtime transcript，不降低 deterministic gate。
