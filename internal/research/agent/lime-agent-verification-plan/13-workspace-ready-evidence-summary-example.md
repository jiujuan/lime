# 样例：`workspace-ready-session-restore` structured evidence summary

> 状态：local workspace / GUI smoke evidence sample
> 更新时间：2026-07-02
> 目标：证明 `workspace-ready-session-restore` 可以先用 DevBridge workspace smoke + Electron GUI smoke 形成低成本 GUI 主路径证据；本文不是 official Evidence Pack，不可作为 release green。

## 1. 本次运行范围

```text
Scenario: workspace-ready-session-restore
Risk: P0
Budget: budget:tight
Evidence depth: deterministic-smoke / gui-trace
Release scope: local-sidecar-only
LLM / qcloop / live Provider: not used
GUI full P0 batch: not used
```

本次只回答一个问题：

```text
在不启动 qcloop、不调用模型的情况下，
能否证明默认 workspace ready、DevBridge 可用、Electron GUI 主壳和 app-server sidecar 能启动到 ready？
```

结论：可以。`smoke:workspace-ready` 与 `verify:gui-smoke` 均通过；但本次不是 Playwright 深交互，也没有 release installer artifact。

## 2. 结构化摘要

```json
{
  "schema_version": "lime-agent-qc-evidence-summary.v1",
  "generated_at": "2026-07-02T01:26:00+08:00",
  "scenario_id": "workspace-ready-session-restore",
  "result": "pass_with_limitations",
  "budget": "budget:tight",
  "evidence_depth": ["deterministic-smoke", "gui-trace"],
  "release_scope": {
    "official_evidence_pack": false,
    "can_gate_release": false,
    "reason": "只跑本地 workspace smoke、Electron source-tree GUI smoke 和单场景 payload 生成；official Evidence Pack 必须来自同一批次 8/8 P0 pass。"
  },
  "commands": [
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
      "command": "npm run smoke:workspace-ready",
      "status": "pass",
      "summary": "DevBridge 83ms ready；defaultWorkspaceId=240ed157-3e7a-456c-a2c2-a05bd852b71c；workspaceCount=133；repaired=false；relocated=false。"
    },
    {
      "command": "npm run verify:gui-smoke",
      "status": "pass",
      "summary": "版本一致性通过；renderer smoke build 通过；Electron host typecheck / build 通过；app-server sidecar ready protocol=appserver.v0 version=1.84.0；claw workbench shell ready；memory settings ready。"
    },
    {
      "command": "npm run agent-qc:qcloop-job -- --scenario workspace-ready-session-restore --cwd \"$(pwd)\" --output .lime/qc/qcloop-workspace-ready-session-restore-payload.json --check",
      "status": "pass",
      "summary": "仅生成单场景 qcloop payload，不提交 job；payload valid，commands 包含 smoke:workspace-ready 与 verify:gui-smoke，evidence_layers 包含 deterministic-smoke 与 gui-trace。"
    }
  ],
  "artifacts": [
    ".lime/qc/agent-verification-gui-owner-current.json",
    ".lime/qc/agent-verification-process-owner-current.json",
    ".lime/qc/agent-verification-process-owner-current.md",
    ".lime/qc/qcloop-workspace-ready-session-restore-payload.json"
  ],
  "known_non_blocking_notes": [
    "verify:gui-smoke 是 source-tree Electron GUI smoke，不是 installer / release artifact 验证。",
    "workspace-ready smoke 证明默认 workspace 与 DevBridge 路径可用，但没有覆盖深层历史会话恢复 Playwright 操作。",
    "renderer build 输出 chunksize warning 与 Browserslist 提示；命令状态仍为 pass。"
  ],
  "missing_for_release": [
    "同一批次 8/8 P0 qcloop item success。",
    "8/8 QCLOOP_EVIDENCE_SUMMARY_JSON parseable。",
    "official .lime/qc/agent-qc-evidence.json verdict.status=pass。",
    "agent-qc:release-summary --check pass。",
    "agent-qc:audit complete。",
    "若 release gate 需要 installer 证据，还必须由 release artifact smoke 单独证明。"
  ],
  "next_action": "继续选择下一个低成本 P0：browser-runtime-site-adapter；先跑 browser runtime / site adapter deterministic smokes，不进入 live Provider。"
}
```

## 3. 这份 summary 证明了什么

- 当前没有 active / stale GUI qcloop owner，也没有 active raw GUI smoke / Rust / qcloop owner。
- DevBridge health 可访问，默认 workspace 可创建 / 获取 / ensure ready / 按路径回查 / 列表发现。
- Electron source-tree GUI smoke 能构建 renderer 和 host，并启动 app-server sidecar。
- GUI 主壳至少到达 `claw workbench shell ready` 与 `memory settings ready`。
- 单场景 qcloop payload 可以生成，并且要求 worker 输出结构化 evidence summary。

## 4. 这份 summary 不能证明什么

- 不能证明完整 Playwright 深交互会话恢复。
- 不能证明 release installer artifact 能启动。
- 不能证明 Claw live streaming、tool approval、browser adapter 或 SkillTool 深证据。
- 不能覆盖 official `.lime/qc/agent-qc-evidence.json`。

## 5. 回写规则

后续如果 `workspace-ready-session-restore` 失败，不进入 LLM judge，先按以下顺序回写：

1. DevBridge unavailable：先修 Desktop Host / App Server sidecar / port health。
2. workspace ready false positive：补 workspace smoke 断言或 App Server read model fixture。
3. GUI smoke 启动失败：补 Electron host / preload / renderer smoke 回归。
4. session restore stale：升级为 Playwright 或 dedicated session history fixture，不让 workspace smoke 冒充完整恢复证据。
