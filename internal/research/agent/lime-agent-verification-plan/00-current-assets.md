# 当前资产地图

> 目标：明确 Lime 已经拥有的验证资产，避免把已有能力重复建设一遍。

## 1. Current 主链

Lime 当前 Agent / runtime / host integration 的默认路径：

```text
组件 / Hook
  -> src/lib/api/* 网关
  -> safeInvoke / AppServerClient
  -> Electron Desktop Host bridge
  -> App Server JSON-RPC
  -> RuntimeCore / backend
  -> read model / runtime events / evidence
```

这条链已经提供了 Agent 友好的事实入口。

后续计划只强化这条链，不新增平行 runtime。

## 2. Harness Engine

已有事实链：

```text
runtime thread/session
  -> evidence pack
  -> replay / analysis / review / summary
  -> trend / cleanup / dashboard
  -> UI
```

关键约束：

- Evidence Pack 是事实源。
- replay / analysis / review 是消费层。
- UI 不能反向定义事实。

## 3. Agent QC

已有入口：

```bash
npm run agent-qc:report
npm run agent-qc:gui-flow:report
npm run agent-qc:check
npm run agent-qc:qcloop-job
npm run agent-qc:export-evidence
npm run agent-qc:release-summary
npm run agent-qc:audit
```

当前 P0 场景：

```text
command-bridge-contract
claw-chat-ready-streaming
tool-approval-sandbox-boundary
skill-forge-register-bind-enable
browser-runtime-site-adapter
workspace-ready-session-restore
harness-replay-regression
release-package-startup-smoke
```

## 4. Smoke / Fixture

已有成本较低的入口：

```bash
npm run test:contracts
npm run smoke:agent-runtime-current-fixture
npm run smoke:claw-chat-current-fixture
npm run smoke:agent-runtime-tool-surface
npm run smoke:agent-runtime-approval-sandbox
npm run smoke:agent-service-skill-entry
npm run smoke:browser-runtime
npm run smoke:site-adapters
npm run harness:eval
```

这些应该优先于 full qcloop。

## 5. Agent UI Projection

已有结构化投影：

- process / thinking / tool / text / action
- HITL / approval / confirmation
- artifact workspace
- evidence / review / replay
- Subagents / team / work board
- remote teammate
- diagnostics / metrics

下一步应把这些 projection 纳入 evidence contract，而不只是 UI 展示。

## 6. Managed Objective

已有能力：

- objective state
- manual continuation
- evidence-based audit
- automation owner binding
- controlled auto idle continuation
- objective guardrails
- unverified skill 禁止自动执行

下一步应纳入 Agent QC 场景。
