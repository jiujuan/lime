# P17.5 Formal Entry GUI Smoke

更新时间：2026-05-16

状态：已完成；正式 `agent-apps` 入口已具备独立 smoke 证据。

## 一句话结论

P17.5 已用 `smoke:agent-apps` 证明正式 Agent Apps 入口可以独立跑通 install、registration、launch、disable、uninstall rehearsal、runtime surface 和 flag-off；Lab smoke 继续只作为研发辅助证据，不再替代正式入口证据。

## 范围

本阶段只验证正式 `agent-apps` 用户入口，不新增 marketplace、Cloud 管理台、真实 delete-data、Workspace pin、命令面板入口或完整行业系统。

| 验证项 | 证据 |
|---|---|
| 正式入口可达 | 账号菜单中的 `Agent Apps` 可打开正式页面，页面根节点提供 `data-testid="agent-apps-page"` 稳定锚点。 |
| registration blocker | seeded Cloud catalog 显示 `registration required`，安装按钮保持 disabled。 |
| active bootstrap install | smoke 注入受控 OEM Cloud runtime 与 active bootstrap catalog，Cloud install review 可打开并确认。 |
| lifecycle disable / enable | disable 后 dashboard launch 被阻断，enable 后恢复。 |
| runtime surface | dashboard entry 启动到 `agent-app` runtime surface，iframe 指向受控 runtime URL。 |
| uninstall rehearsal | delete-data 只导出 cleanup evidence；`warningCodes` 包含 `DRY_RUN_ONLY`，不执行真实删除。 |
| flag-off regression | 关闭 Lab flag 后，正式 `Agent Apps` 仍可见，`Agent App Lab` 隐藏。 |

## 关键修复

1. `AgentAppsPage` 根节点补 `data-testid="agent-apps-page"`，避免 smoke 已进入页面却误判不可见。
2. `scripts/agent-app/apps-smoke.mjs` 在 active bootstrap 阶段注入受控 `__LIME_OEM_CLOUD__` / `__LIME_SESSION_TOKEN__`，并用 Playwright route mock `/client/agent-apps`，避免访问真实网络。
3. active bootstrap 的 `packageHash` / `manifestHash` 改为合法 `sha256:<64 hex>`，符合 P17.2 Cloud release descriptor 校验。
4. cleanup rehearsal 断言从 lifecycle descriptor 的 `completionEffect` 调整为 cleanup evidence 的 `DRY_RUN_ONLY` 警告，符合 UI 当前导出的事实源。

## 验证记录

| 命令 | 结果 |
|---|---|
| `node --check scripts/agent-app/apps-smoke.mjs` | 通过。 |
| `git diff --check -- scripts/agent-app/apps-smoke.mjs src/features/agent-app/ui/AgentAppsPage.tsx` | 通过。 |
| `nice -n 10 npm run smoke:agent-apps -- --timeout-ms 300000 --interval-ms 1000` | 通过。 |

证据产物：

- Summary：`.lime/qc/gui-evidence/agent-apps/agent-apps-smoke-summary.json`
- 主截图：`.lime/qc/gui-evidence/agent-apps/agent-apps-smoke.png`
- Flag-off 截图：`.lime/qc/gui-evidence/agent-apps/agent-apps-smoke-flag-off.png`

## Summary 断言

`agent-apps-smoke-summary.json` 当前全部核心断言为 `true`：

- `formalPageVisible`
- `installedVisible`
- `registrationRequiredBlocked`
- `cloudInstallReviewVisible`
- `disabledLaunchBlocked`
- `runtimeSurfaceVisible`
- `cleanupEvidenceSelectedApp`
- `cleanupEvidenceStrategy`
- `cleanupEvidenceDryRunOnly`
- `cleanupEvidenceBlockedCount`
- `flagOffAgentAppsNavVisible`
- `flagOffLabNavHidden`
- `flagOffNoConsoleErrors`

## 下一刀

P17.5 已完成。下一刀进入 P18 Typed Capability SDK：先把 P18.0 gap matrix 与上游 `agentapp-ref@0.4.0` / Host Bridge v1 / AgentRuntime artifact projection 对齐，再实施 P18.1 SDK facade、stable error 和 mock host；仍不进入 raw worker、marketplace 或真实 delete-data。
