# 样例：`release-package-startup-smoke` structured evidence summary

> 状态：source-tree startup + release scope evidence sample
> 更新时间：2026-07-02
> 目标：证明 `release-package-startup-smoke` 可以在不构建 / 不安装 release artifact 的前提下，用 `verify:app-version` + source-tree GUI startup smoke 形成低成本证据；本文不是 official Evidence Pack，不可作为 release green。

## 1. 本次运行范围

```text
Scenario: release-package-startup-smoke
Risk: P0
Budget: budget:tight
Evidence depth: source-guard / app-version-check / electron-source-tree-startup / app-server-sidecar-build
Release scope: source-tree-startup-smoke
Installer artifact verified: false
LLM / qcloop / live Provider: not used
GUI full P0 batch: not used
```

本次只回答四个问题：

```text
1. 版本是否一致，能否证明 current workspace 与 Electron / app-server 版本线没有漂移？
2. source-tree 启动是否能真正把 renderer、App Server sidecar、Claw workbench shell 拉起来？
3. 这次 smoke 是否明确停留在 source-tree startup 范围，而没有伪装成 installer artifact 验证？
4. release gate 还缺什么，不能被这次低成本 smoke 误判为 green？
```

结论：前两项通过，第三项通过且明确是 source-tree scope，第四项仍不通过。首次执行 `verify:gui-smoke` 时，`electron:build:app-server` 暴露 `lime-rs/crates/app-server/src/runtime/plugin_worker_turn.rs` 的编译阻断；当前工作树中的 orchestration-based 修正已存在，`cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server` 通过后，`verify:gui-smoke` 重跑通过。

## 2. 结构化摘要

```json
{
  "schema_version": "lime-agent-qc-evidence-summary.v1",
  "generated_at": "2026-07-02T07:33:33+08:00",
  "scenario_id": "release-package-startup-smoke",
  "result": "pass_local_low_cost",
  "budget": "budget:tight",
  "evidence_depth": [
    "source-guard",
    "app-version-check",
    "app-server-sidecar-build",
    "electron-source-tree-startup"
  ],
  "release_scope": {
    "official_evidence_pack": false,
    "can_gate_release": false,
    "installer_artifact_verified": false,
    "source_tree_startup_verified": true,
    "reason": "本次只验证 source-tree startup smoke 与版本一致性；未安装 release artifact，不能伪装 installer 验证，也不能作为官方发布证据。"
  },
  "commands": [
    {
      "command": "npm run agent-qc:gui-owner-check -- --check",
      "status": "pass",
      "summary": "active GUI qcloop owner=0，未超过上限。"
    },
    {
      "command": "npm run agent-qc:process-owner-check -- --check",
      "status": "pass",
      "summary": "activeGuiSmoke=0, cargoOrRust=0, qcloopRelated=0，未发现并发干扰。"
    },
    {
      "command": "npm run verify:app-version",
      "status": "pass",
      "summary": "workspace version 1.85.0 一致。"
    },
    {
      "command": "cargo check --manifest-path \"lime-rs/Cargo.toml\" -p app-server",
      "status": "pass",
      "summary": "app-server crate 可编译；首次 GUI smoke 暴露的 current 编译阻断已在当前工作树修正后消失。"
    },
    {
      "command": "npm run verify:gui-smoke",
      "status": "pass",
      "summary": "source-tree Electron smoke pass：renderer loaded，app-server initialized，claw workbench shell ready，memory settings ready。"
    }
  ],
  "artifacts": [],
  "initial_blocker": {
    "command": "npm run verify:gui-smoke",
    "failure": "electron:build:app-server 阶段因 app-server Rust 编译失败中断，错误集中在 lime-rs/crates/app-server/src/runtime/plugin_worker_turn.rs 的 PaneActionWorkerTurn 初始化缺字段，以及缺少 manifest_workflow_hook_policy。",
    "resolution": "current worktree 中的 orchestration-based 修正已存在；`cargo check --manifest-path \"lime-rs/Cargo.toml\" -p app-server` 通过后，重新执行 `verify:gui-smoke` 通过。"
  },
  "runtime_fix": {
    "current_fact_source": "Electron source-tree smoke + App Server sidecar + App Server JSON-RPC",
    "changes": [
      "本次只验证 source-tree startup 证据，不构建 installer artifact。",
      "不引入旧发布兼容层；开发期直接修 current 编译阻断。",
      "release gate 仍需 official evidence pack。"
    ],
    "compat_policy": "开发期无用户，不新增旧发布兼容层；只修 current Electron / App Server 主链证据。"
  },
  "missing_for_release": [
    "同一批次 8/8 P0 qcloop item success。",
    "official .lime/qc/agent-qc-evidence.json verdict.status=pass。",
    "agent-qc:release-summary --check pass。",
    "agent-qc:audit complete。",
    "installer artifact smoke 的显式证据。"
  ],
  "next_action": "继续保持 budget:tight，别把 source-tree startup smoke 误当 installer 验证；下一刀回到 official Evidence Pack 或 qcloop 批次规划。"
}
```

## 3. 这份 summary 证明了什么

- `verify:app-version` 通过，版本线与 workspace 一致。
- source-tree Electron smoke 能把 renderer、App Server sidecar、Claw workbench shell、memory settings 拉起来。
- 当前 release scope 明确是 `source-tree-startup-smoke`，没有伪装成 installer artifact 验证。
- 首次 smoke 暴露的 current Rust 编译阻断已经被复核后清掉。

## 4. 这份 summary 不能证明什么

- 不能证明 release artifact 已安装、已启动或已签名。
- 不能证明 official `.lime/qc/agent-qc-evidence.json` 已通过。
- 不能证明 8/8 P0 qcloop 已完成。
- 不能 gate release。

## 5. 回写规则

后续如果继续推进本场景，按以下顺序处理：

1. 日常开发默认先跑 `npm run verify:app-version`，再跑 `npm run verify:gui-smoke`。
2. 如果 `verify:gui-smoke` 再次卡在编译，先修 `app-server` / Electron 当前事实源，不要绕路写 installer 伪证据。
3. 如果要证明真实安装包，必须单独补 installer artifact smoke，不能拿 source-tree startup 代替。
4. official Evidence Pack 只能来自同一批次 8/8 P0 pass，不拼接 partial sidecar。
5. release gate 之外，仍保持 `budget:tight`，不默认升级 live Provider。
