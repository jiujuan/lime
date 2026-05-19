# Agent App v2 主干状态与发布预案

更新时间：2026-05-19
状态：Workflow landed; release blocked by missing secrets / evidence

## 目的

本预案用于复核 Agent App v2 standalone 发布门禁进入 `main` 后的当前状态，并继续记录后续补丁 / 发布执行需要遵守的 selective staging 边界，避免把当前脏工作树中的并行改动误带入主干。

本文件不授权提交；它只记录可审计的 staging 边界。执行任何 `git commit` / `git push` 前仍必须获得用户明确确认。

## 当前硬阻断

1. repo-level 仍缺 5 个 standalone release 必需名称：
   - `LIME_AGENT_APP_PREVIOUS_RELEASE_REF`
   - `LIME_AGENT_APP_RELEASE_UPLOAD_TOKEN`
   - `APPLE_INSTALLER_SIGNING_IDENTITY` 或 `APPLE_SIGNING_IDENTITY_INSTALLER`
   - `WINDOWS_SIGNING_CERTIFICATE`
   - `WINDOWS_SIGNING_CERTIFICATE_PASSWORD`
2. org-level Actions secrets / variables 当前不可只读复核：`gh secret list --org "limecloud" --app actions` 与 `gh variable list --org "limecloud"` 均返回 `HTTP 403`。
3. GitHub Environments 当前仅有 `github-pages`，没有 standalone release 专用 environment。
4. `origin/main` 已包含 `.github/workflows/agent-app-standalone-release-gate.yml`，`Agent App Standalone Release Gate` 已在 GitHub Actions 中 active；远程 run `26069161772` 已在 `main` / `c982fb643e8053e5b655c11c544fcf23933a6592` 上执行并因缺失 5 个发布配置失败，run URL 为 `https://github.com/limecloud/lime/actions/runs/26069161772`。该结果证明门禁真实阻断缺失项，但 workflow active / preflight failure 都不能替代真实 release evidence。
5. `gh api "repos/limecloud/lime/branches/main/protection"` 返回 `Branch not protected`，`gh api "repos/limecloud/lime/rulesets"` 返回空数组；远程当前没有 branch protection / ruleset 替你兜底，因此更不能跳过人工确认和 selective staging。
6. 当前工作树存在未确认并行写集；后续提交前必须只 stage 明确属于 Agent App v2 主线的文件。

## 后续补丁可纳入 Agent App v2 主线的候选写集

以下写集与当前目标直接相关；如果后续还需要提交补丁，提交前仍需逐文件复核 diff：

| 分组 | 文件 |
| --- | --- |
| v2 文档 | `docs/roadmap/agentapp/v2/README.md` |
| v2 文档 | `docs/roadmap/agentapp/v2/prd.md` |
| v2 文档 | `docs/roadmap/agentapp/v2/architecture.md` |
| v2 文档 | `docs/roadmap/agentapp/v2/interface-contracts.md` |
| v2 文档 | `docs/roadmap/agentapp/v2/code-plan.md` |
| v2 文档 | `docs/roadmap/agentapp/v2/completion-audit.md` |
| v2 文档 | `docs/roadmap/agentapp/v2/implementation-plan.md` |
| v2 文档 | `docs/roadmap/agentapp/v2/release-operator-runbook.md` |
| v2 文档 | `docs/roadmap/agentapp/v2/mainline-submission-plan.md` |
| v2 evidence | `docs/roadmap/agentapp/v2/evidence/agentapp-v0.8-release.json` |
| v2 evidence | `docs/roadmap/agentapp/v2/evidence/release-gate-run-26069161772.json` |
| release gate workflow | `.github/workflows/agent-app-standalone-release-gate.yml` |
| release CLI | `scripts/agent-app-standalone-release-secret-preflight.mjs` |
| release CLI | `scripts/agent-app-standalone-installer-verify.mjs` |
| release CLI | `scripts/agent-app-standalone-release-evidence-check.mjs` |
| release core / tests | `scripts/lib/agent-app-standalone-release-secret-preflight-core.mjs` |
| release core / tests | `scripts/lib/agent-app-standalone-release-secret-preflight-core.test.mjs` |
| release core / tests | `scripts/lib/agent-app-standalone-installer-verify-core.mjs` |
| release core / tests | `scripts/lib/agent-app-standalone-installer-verify-core.test.mjs` |
| release core / tests | `scripts/lib/agent-app-standalone-release-evidence-core.mjs` |
| release core / tests | `scripts/lib/agent-app-standalone-release-evidence-core.test.mjs` |
| delete-data executor | `src/features/agent-app/install/deleteDataExecutor.ts` |
| delete-data executor | `src/features/agent-app/install/deleteDataExecutor.test.ts` |
| Agent App shell / command | `src/features/agent-app/ui/AgentAppsPage.tsx` |
| Agent App shell / command | `src/features/agent-app/ui/AgentAppsPage.test.tsx` |
| Agent App shell / command | `src/lib/api/agentApps.ts` |
| Agent App shell / command | `src/lib/tauri-mock/agentAppMocks.ts` |
| Agent App shell / command | `src/lib/tauri-mock/agentAppMocks.d.ts` |
| Agent App shell / command | `src/lib/tauri-mock/core.test.ts` |
| Tauri Agent App command | `src-tauri/src/commands/agent_app_cmd.rs` |
| Tauri shell lifecycle | `src-tauri/src/app/runner.rs` |
| Tauri shell lifecycle | `src-tauri/src/services/agent_app_shell_window.rs` |
| i18n | `src/i18n/resources/en-US/agent.json` |
| i18n | `src/i18n/resources/ja-JP/agent.json` |
| i18n | `src/i18n/resources/ko-KR/agent.json` |
| i18n | `src/i18n/resources/zh-CN/agent.json` |
| i18n | `src/i18n/resources/zh-TW/agent.json` |

## Selective staging 模板

以下命令只是模板；只有在用户明确确认提交 / 推送后才能执行。执行前先逐文件复核 diff，执行后必须用 `git diff --cached --name-only` 确认 staged 列表没有出现未确认写集。已进入 `main` 的文件不需要重复提交。

```bash
git add -- \
  ".github/workflows/agent-app-standalone-release-gate.yml" \
  "docs/roadmap/agentapp/v2/README.md" \
  "docs/roadmap/agentapp/v2/prd.md" \
  "docs/roadmap/agentapp/v2/architecture.md" \
  "docs/roadmap/agentapp/v2/interface-contracts.md" \
  "docs/roadmap/agentapp/v2/code-plan.md" \
  "docs/roadmap/agentapp/v2/completion-audit.md" \
  "docs/roadmap/agentapp/v2/implementation-plan.md" \
  "docs/roadmap/agentapp/v2/release-operator-runbook.md" \
  "docs/roadmap/agentapp/v2/mainline-submission-plan.md" \
  "docs/roadmap/agentapp/v2/evidence/agentapp-v0.8-release.json" \
  "docs/roadmap/agentapp/v2/evidence/release-gate-run-26069161772.json" \
  "scripts/agent-app-standalone-release-secret-preflight.mjs" \
  "scripts/agent-app-standalone-installer-verify.mjs" \
  "scripts/agent-app-standalone-release-evidence-check.mjs" \
  "scripts/lib/agent-app-standalone-release-secret-preflight-core.mjs" \
  "scripts/lib/agent-app-standalone-release-secret-preflight-core.test.mjs" \
  "scripts/lib/agent-app-standalone-installer-verify-core.mjs" \
  "scripts/lib/agent-app-standalone-installer-verify-core.test.mjs" \
  "scripts/lib/agent-app-standalone-release-evidence-core.mjs" \
  "scripts/lib/agent-app-standalone-release-evidence-core.test.mjs" \
  "src/features/agent-app/install/deleteDataExecutor.ts" \
  "src/features/agent-app/install/deleteDataExecutor.test.ts" \
  "src/features/agent-app/ui/AgentAppsPage.tsx" \
  "src/features/agent-app/ui/AgentAppsPage.test.tsx" \
  "src/lib/api/agentApps.ts" \
  "src/lib/tauri-mock/agentAppMocks.ts" \
  "src/lib/tauri-mock/agentAppMocks.d.ts" \
  "src/lib/tauri-mock/core.test.ts" \
  "src-tauri/src/commands/agent_app_cmd.rs" \
  "src-tauri/src/app/runner.rs" \
  "src-tauri/src/services/agent_app_shell_window.rs" \
  "src/i18n/resources/en-US/agent.json" \
  "src/i18n/resources/ja-JP/agent.json" \
  "src/i18n/resources/ko-KR/agent.json" \
  "src/i18n/resources/zh-CN/agent.json" \
  "src/i18n/resources/zh-TW/agent.json"
```

staged 列表复核：

```bash
git diff --cached --name-only
```

禁止清单校验：

```bash
git diff --cached --name-only | rg \
  "^(docs/roadmap/agentapp/p18-|docs/roadmap/agentruntime/agent-app-runtime-completion-audit\\.md|packages/agent-app-runtime/.*|src/features/agent-app/runtime/agentRunProjectionState|src/features/agent-app/runtime/agentUiProjectionViewModel|src-tauri/src/commands/aster_agent_cmd/tool_runtime/connector_tools/(readiness|tests)\\.rs|scripts/agent-app-connector-outbox-smoke\\.mjs|scripts/agent-apps-content-factory-flow\\.mjs|scripts/claw-chat-ready-streaming-smoke\\.mjs|src-tauri/crates/agent/.*|src-tauri/crates/aster-rust/.*|src-tauri/src/agent/runtime_queue_service\\.rs|src-tauri/src/commands/agent_app_runtime_cmd/.*|src-tauri/src/commands/aster_agent_cmd/(command_api/runtime_api\\.rs|mod\\.rs)|src-tauri/src/commands/aster_agent_cmd/tool_runtime/connector_tools/cloud_overlay_outbox\\.rs)$" \
  && { echo "blocked: staged list contains unconfirmed files"; exit 1; } || true
```

## 暂不纳入的未确认写集

以下文件当前有改动，但需要用户或并行 Agent 明确归属后才能 stage：

| 文件 | 原因 |
| --- | --- |
| `src-tauri/src/commands/aster_agent_cmd/tool_runtime/connector_tools/readiness.rs` | 本轮审计中新增出现的未确认改动。 |
| `src-tauri/src/commands/aster_agent_cmd/tool_runtime/connector_tools/tests.rs` | 本轮审计中新增出现的未确认改动。 |
| `packages/agent-app-runtime/README.md` | 前序 handoff 标记为并行 / 未知写集。 |
| `packages/agent-app-runtime/src/projection.ts` | 前序 handoff 标记为并行 / 未知写集。 |
| `packages/agent-app-runtime/tests/projection-export.test.mjs` | 前序 handoff 标记为并行 / 未知写集。 |
| `src/features/agent-app/runtime/agentRunProjectionState.ts` | 前序 handoff 标记为并行 / 未知写集。 |
| `src/features/agent-app/runtime/agentRunProjectionState.test.ts` | 前序 handoff 标记为并行 / 未知写集。 |
| `src/features/agent-app/runtime/agentUiProjectionViewModel.ts` | 前序 handoff 标记为并行 / 未知写集。 |
| `src/features/agent-app/runtime/agentUiProjectionViewModel.test.ts` | 前序 handoff 标记为并行 / 未知写集。 |

## 默认不 stage 的待归类脏文件

以下文件当前也有改动，但尚未被本预案归入 release gate / delete-data / shell lifecycle 核心写集。提交前必须逐项确认是否属于当前主线；确认前默认不 stage：

| 文件 | 需要确认的问题 |
| --- | --- |
| `docs/roadmap/agentapp/p18-7-e-toolruntime-execution-gate-plan.md` | 是否属于本次 Agent App v2 发布证据同步，还是旧阶段路线图更新。 |
| `docs/roadmap/agentapp/p18-7-parallel-validation.md` | 是否属于本次 Agent App v2 发布证据同步，还是旧阶段并行验证记录。 |
| `docs/roadmap/agentapp/p18-completion-audit.md` | 是否需要与 v2 `completion-audit.md` 同步提交。 |
| `docs/roadmap/agentruntime/agent-app-runtime-completion-audit.md` | 是否属于 Agent App Runtime projection 独立任务。 |
| `scripts/agent-app-connector-outbox-smoke.mjs` | 是否属于 connector outbox 旁支 smoke，而非 standalone release gate。 |
| `scripts/agent-apps-content-factory-flow.mjs` | 是否属于 P4 Content Factory evidence 更新，需与对应 evidence 一起审计。 |
| `scripts/agent-apps-smoke.mjs` | 是否属于 delete-data exact phrase gate 主链，需与 UI / Rust 变更一起审计。 |
| `scripts/claw-chat-ready-streaming-smoke.mjs` | 是否属于 Claw Chat active gate 修复，需单独说明与 Agent App v2 的依赖关系。 |
| `src-tauri/crates/agent/src/lib.rs` | 是否属于 Claw Chat active gate 修复。 |
| `src-tauri/crates/agent/src/runtime_queue.rs` | 是否属于 Claw Chat active gate 修复。 |
| `src-tauri/crates/aster-rust/crates/aster/src/execution/manager.rs` | 是否属于 Claw Chat active gate 修复。 |
| `src-tauri/crates/aster-rust/crates/aster/src/session/runtime_queue.rs` | 是否属于 Claw Chat active gate 修复。 |
| `src-tauri/crates/aster-rust/crates/aster/src/session/runtime_store.rs` | 是否属于 Claw Chat active gate 修复。 |
| `src-tauri/src/agent/runtime_queue_service.rs` | 是否属于 Claw Chat active gate 修复。 |
| `src-tauri/src/commands/agent_app_runtime_cmd/events.rs` | 是否属于 Content Factory / connector runtime evidence 旁支。 |
| `src-tauri/src/commands/agent_app_runtime_cmd/task_snapshot.rs` | 是否属于 Content Factory / connector runtime evidence 旁支。 |
| `src-tauri/src/commands/agent_app_runtime_cmd/tests.rs` | 是否属于 Content Factory / connector runtime evidence 旁支。 |
| `src-tauri/src/commands/aster_agent_cmd/command_api/runtime_api.rs` | 是否属于 Claw Chat active gate 修复。 |
| `src-tauri/src/commands/aster_agent_cmd/mod.rs` | 是否属于 Claw Chat active gate 修复。 |
| `src-tauri/src/commands/aster_agent_cmd/tool_runtime/connector_tools/cloud_overlay_outbox.rs` | 是否属于 connector outbox 旁支。 |
| `src/features/agent-app/index.ts` | 是否只是导出新增 release/delete-data surface，需与具体实现一起 stage。 |

## 提交前验证命令

质量任务口径：用 `detectTasks([".github/workflows/agent-app-standalone-release-gate.yml", ...])` 复核，正式 workflow 变更会触发 `workflow=true`、`integrity=true`、`frontend=true`、`rust=true`、`bridge=true`、`guiSmoke=true`，`bridgeReasons=["workflow_full_suite"]`。因此不能只跑 release CLI 单测。

当前状态：2026-05-19 对当前工作树重新运行 `npm run verify:local`，最新复跑已通过；同轮输出显示版本一致性检查通过，Rust workspace 测试通过到 `1410 passed / 0 failed / 1 ignored`，全量 GUI smoke 通过到 `design-canvas` 收尾。此前同日有一次 `smoke:claw-chat-ready-streaming` timeout，但后续复跑已恢复 green。`node --check "scripts/agent-apps-smoke.mjs"`、`git diff --check` 与 `npm run harness:doc-freshness` 已通过。由于工作树仍存在未确认并行写集，后续任何提交都必须按实际 staged 文件重跑对应门禁，不能复用旧绿灯替代新 diff 验证。

在获得提交确认并完成 selective staging 前，至少执行：

```bash
npm run verify:local
npm run verify:gui-smoke -- --reuse-running --timeout-ms 300000
npm run test:contracts
npm run harness:doc-freshness
npm test -- "scripts/lib/agent-app-standalone-release-secret-preflight-core.test.mjs" "scripts/lib/agent-app-standalone-installer-verify-core.test.mjs" "scripts/lib/agent-app-standalone-release-evidence-core.test.mjs"
npm test -- "src/features/agent-app/install/deleteDataExecutor.test.ts" "src/lib/tauri-mock/core.test.ts" "src/features/agent-app/ui/AgentAppsPage.test.tsx"
cargo test --manifest-path "src-tauri/Cargo.toml" agent_app_shell -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" delete_data -- --nocapture
git diff --check
```

## 主干 release gate 已落地，但仍不代表发布完成

当前 release gate 已进入 `main`，这只能说明工程门禁入口在主干可触发。完整目标仍要求：

1. 补齐 release secrets / refs。
2. 触发远程 `Agent App Standalone Release Gate` 并取得 ready evidence。
3. 执行真实 `tauri build`。
4. 完成 Developer ID Application / Installer 签名。
5. 完成 notarization / stapler。
6. 执行 installer verify `--execute`。
7. 完成 updater remote upload 与 rollback evidence。
8. 通过 `scripts/agent-app-standalone-release-evidence-check.mjs --check`，且 `readyToRelease=true`。

当前已触发的远程 gate 证据：

| 字段 | 值 |
| --- | --- |
| Run | `26069161772` |
| URL | `https://github.com/limecloud/lime/actions/runs/26069161772` |
| 结论 | `failure`，符合预期的 release hard stop |
| Versioned evidence | `docs/roadmap/agentapp/v2/evidence/release-gate-run-26069161772.json` |
| 缺失项 | `LIME_AGENT_APP_PREVIOUS_RELEASE_REF`、`LIME_AGENT_APP_RELEASE_UPLOAD_TOKEN`、`APPLE_INSTALLER_SIGNING_IDENTITY`、`WINDOWS_SIGNING_CERTIFICATE`、`WINDOWS_SIGNING_CERTIFICATE_PASSWORD` |

因此下一次远程 gate 必须在管理员补齐上述 5 项之后触发；在它返回 ready 且后续真实 build / signing / notarization / installer verify / updater upload evidence 齐全前，不得宣布 standalone 发布完成。
