# 样例：`tool-approval-sandbox-boundary` structured evidence summary

> 状态：local deterministic + denied-only runtime evidence sample
> 更新时间：2026-07-02
> 目标：证明 `tool-approval-sandbox-boundary` 可以在不调用 live Provider、不启动 full qcloop 的前提下，形成低成本 runtime 证据；本文不是 official Evidence Pack，不可作为 release green。

## 1. 本次运行范围

```text
Scenario: tool-approval-sandbox-boundary
Risk: P0
Budget: budget:tight
Evidence depth: deterministic-smoke / projection-summary / devbridge-denied-runtime-transcript
Release scope: local-sidecar-only
LLM / qcloop / live Provider: not used
GUI full P0 batch: not used
```

本次只回答三个问题：

```text
1. tool surface / approval / sandbox 的确定性投影证据是否能生成？
2. denied-only DevBridge runtime transcript 是否能在无 live Provider 的本地低成本路径中稳定生成？
3. 拒绝权限后，pending request 是否清零，turn 是否进入明确终态，而不是卡在 running？
```

结论：三项均通过。`tool-approval-sandbox-boundary` 的低成本证据已从 `partial_pass_blocked` 推进到 `pass_local_low_cost`。它仍不是 official Evidence Pack，因为没有启动 full qcloop、没有同批次 8/8 P0，也没有 live Provider 长任务证据。

## 2. 结构化摘要

```json
{
  "schema_version": "lime-agent-qc-evidence-summary.v1",
  "generated_at": "2026-07-02T02:18:00+08:00",
  "scenario_id": "tool-approval-sandbox-boundary",
  "result": "pass_local_low_cost",
  "budget": "budget:tight",
  "evidence_depth": [
    "deterministic-smoke",
    "projection-summary",
    "devbridge-denied-runtime-transcript",
    "rust-runtime-preflight-test",
    "contract-check"
  ],
  "release_scope": {
    "official_evidence_pack": false,
    "can_gate_release": false,
    "reason": "本次只证明低成本 current 主链；release 仍要求同一批次 8/8 P0 qcloop item success 与 official evidence pack。"
  },
  "commands": [
    {
      "command": "cargo test --manifest-path \"lime-rs/Cargo.toml\" -p app-server permission_preflight -- --nocapture",
      "status": "pass",
      "summary": "新增 Rust 定向测试通过：无 Provider 时 browser-control permission preflight 先进入 waitingAction；拒绝后 permission_state.confirmation_status=denied，pending_requests=0，thread status=canceled。"
    },
    {
      "command": "npm run smoke:agent-runtime-approval-sandbox -- --devbridge-denied-runtime --skip-live-runtime --output .lime/qc/runtime-approval-sandbox-denied-only-current.json",
      "status": "pass",
      "summary": "denied-only runtime transcript 通过：request 阶段 permissionStatus=requires_confirmation、confirmationStatus=requested、pendingRequestCount=1、latestTurnStatus=waitingAction；拒绝后 afterConfirmationStatus=denied、afterPendingRequestCount=0、afterThreadStatus=canceled；providerNotRequired=satisfied。"
    },
    {
      "command": "npm run smoke:agent-runtime-tool-surface",
      "status": "pass",
      "summary": "runtime tool surface 派生与应用层透传通过；runtime inventory 主链透传通过；unsafeToolExposed=false。"
    },
    {
      "command": "npm run test:contracts",
      "status": "pass",
      "summary": "App Server client / command / harness / modality / scripts / electron release / docs boundary 合同通过；scripts governance 仅提示本地 ignored __pycache__ 缓存，不属于本轮改动。"
    },
    {
      "command": "npm run agent-qc:check",
      "status": "pass",
      "summary": "Agent QC scenario manifest valid，13 scenarios，8 P0，0 issues；GUI flow manifest valid，5 flows，0 issues。"
    }
  ],
  "artifacts": [
    ".lime/qc/runtime-approval-sandbox-denied-only-current.json",
    ".lime/qc/runtime-approval-sandbox-projection-current.json",
    ".lime/qc/qcloop-tool-approval-sandbox-boundary-payload.json"
  ],
  "runtime_fix": {
    "current_fact_source": "App Server RuntimeBackend + RuntimeCore read model",
    "changes": [
      "RuntimeBackend 在 current browser assist runtime contract + approval_policy=on-request + sandbox_policy=workspace-write 命中时，模型路由前写入 action.required。",
      "read model 正式投影 permission_state，smoke 不再靠私有猜测判断权限状态。",
      "RuntimeCore 对 preflight permission action 的 denied 响应写入 turn.canceled，避免 pending 清零后 turn 卡在 running。"
    ],
    "compat_policy": "开发期无用户，不新增旧协议兼容层；只修 current App Server 主链。"
  },
  "runtime_transcript": {
    "kind": "devbridge-runtime-permission-confirmation-denied-only",
    "request": {
      "permissionStatus": "requires_confirmation",
      "confirmationStatus": "requested",
      "pendingRequestCount": 1,
      "latestTurnStatus": "waitingAction",
      "approvalPolicy": "on-request",
      "sandboxPolicy": "workspace-write",
      "providerRequired": false
    },
    "decision": {
      "confirmed": false,
      "afterConfirmationStatus": "denied",
      "afterPendingRequestCount": 0,
      "afterThreadStatus": "canceled"
    }
  },
  "missing_for_release": [
    "同一批次 8/8 P0 qcloop item success。",
    "official .lime/qc/agent-qc-evidence.json verdict.status=pass。",
    "agent-qc:release-summary --check pass。",
    "agent-qc:audit complete。",
    "如 release 风险要求，还需要显式授权后再跑 live Provider 长任务 transcript。"
  ],
  "next_action": "继续保持 budget:tight，优先补 claw-chat-ready-streaming 的低成本 runtime / GUI summary；不要因为 tool-approval 已 pass 就升级 full qcloop。"
}
```

## 3. 这份 summary 证明了什么

- Runtime tool surface 的前端派生、strip、inventory 与 workspace harness inventory 可以低成本验证。
- Approval / sandbox 的前端提交参数、projection、UI 时间线、Harness 面板和 timeout recovery 有确定性投影证据。
- App Server current 主链可以在模型路由前创建 permission confirmation request，不需要真实 Provider。
- 拒绝权限后 pending request 会清零，并且 turn 进入 `canceled` 终态，不会卡在 `running`。
- 单场景 qcloop payload 可以生成，并保留 runtime-transcript 作为 verifier 要求。

## 4. 这份 summary 不能证明什么

- 不能证明 full qcloop worker / verifier 已采信本次证据。
- 不能证明 live Provider 长任务 resolved 路径。
- 不能覆盖 official `.lime/qc/agent-qc-evidence.json`。
- 不能 gate release。

## 5. 回写规则

后续如果继续推进本场景，按以下顺序处理：

1. 日常开发默认继续用 `--devbridge-denied-runtime --skip-live-runtime`，不要开 live Provider。
2. 如果权限状态再退化，优先检查 App Server preflight / read model / RuntimeCore action respond 三处 current 主链。
3. 只有发布或明确授权时，才升级 `--allow-live-provider`。
4. official Evidence Pack 只能来自同一批次 8/8 P0 pass，不拼接 partial sidecar。
