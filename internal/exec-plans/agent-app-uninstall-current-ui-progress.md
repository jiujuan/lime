# Agent App Uninstall Current UI Progress

## 2026-06-09 11:05 CST

主计划：`internal/exec-plans/production-command-current-migration-plan.md` 的 P12 Agent App install / package / shell。

本刀写集：

- `src/features/agent-app/ui/AgentAppsPage.tsx`
- `src/features/agent-app/ui/AgentAppsPage.test.tsx`

主计划文件当前为 `MM` shared staged / working-tree 分歧，本刀不在主计划中夹写，避免覆盖并行进程内容。

## 目标

应用中心已安装 Agent App 的卸载入口必须清楚地落在 current 产品路径上：

`AgentAppsPage -> src/lib/api/agentApps.ts -> AppServerClient.request("agentAppInstalled/uninstall*") -> App Server JSON-RPC`

旧 `agent_app_uninstall_rehearsal` / `agent_app_uninstall` Tauri lifecycle facade 不允许重新接回前端生产路径。当前阶段真实可执行的卸载能力是 `keep-data`，只移除 installed / setup 引用并保留 App 本地数据；`delete-data` 仍保持演练与门禁。

## 改动

- 将已安装 Agent App 的 lifecycle 操作区从“更多信息”折叠面提升到详情页主区域。
- `卸载，保留数据` 现在无需展开“更多信息”即可触发 current `agentAppInstalled/uninstall/rehearsal` 预览，再经 `agentAppInstalled/uninstall` 确认卸载。
- `删除数据演练` 继续展示 cleanup evidence / residual audit / confirmation phrase，但真实 delete-data 执行仍由 current phase gate 阻断。
- 组件回归断言详情页直接暴露 `agent-apps-lifecycle-actions` 和 `agent-apps-uninstall-keep-data`，并确认未展开更多信息时也可完成 keep-data 卸载流程。

## 分类

- Agent App installed lifecycle frontend UI：`current`
- `agentAppInstalled/uninstall/rehearsal`、`agentAppInstalled/uninstall`：`current App Server JSON-RPC`
- `agent_app_uninstall_rehearsal`、`agent_app_uninstall`：`dead / deprecated replacement only`
- `delete-data` 真删除：`gated pending phase`
- `keep-data` 卸载：`current executable`

## 验证

- `npx vitest run "src/features/agent-app/ui/AgentAppsPage.test.tsx" "src/lib/api/agentApps.test.ts" "scripts/agent-app/apps-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept` 通过，3 files / 51 tests。
- `npx eslint --max-warnings 0 "src/features/agent-app/ui/AgentAppsPage.tsx" "src/features/agent-app/ui/AgentAppsPage.test.tsx"` 通过。
- `node "scripts/check-command-contracts.mjs"` 通过，frontend commands `52`、Electron host commands `92`、mock priority `0`、DevBridge truth `72`。

未完成：

- 未直接运行真实 Electron GUI smoke；本刀只调整应用中心 UI 暴露位置与组件级交互回归，不触碰 Electron Host / App Server 协议热写集。
- `src/lib/api/agentApps.ts`、App Server protocol/runtime/client、Electron Host 相关文件当前由并行进程占用，本刀不夹写。

## 剩余退出条件

1. 等共享 App Server / Electron Host / `agentApps.ts` 写集释放后，复跑 `npm run test:contracts` 与真实 Agent App GUI smoke。
2. 继续确认 `agent_app_uninstall_rehearsal` / `agent_app_uninstall` 只停留在 replacement、负向守卫和历史记录中，不回流前端生产路径、Electron Host 或 DevBridge truth。
3. delete-data 真删除若进入后续阶段，必须补 evidence / residual audit / confirmation gate 与真实文件删除回归；当前不得绕过 gate。

## 2026-06-09 12:09 CST

补充验证写集：

- `scripts/agent-app/apps-smoke.mjs`
- `scripts/agent-app/apps-smoke.test.mjs`

本刀仍不夹写 `production-command-current-migration-plan.md`，因为主计划当前是 `MM` shared 热区。

### 结果

- Agent Apps 正式 GUI smoke 已用真实 Electron / DevBridge / App Server current 链路复跑通过。
- `apps-smoke` 不再为了禁用 / 卸载展开 `agent-apps-more-info`，而是在打开详情后直接等待 `agent-apps-lifecycle-actions`。这证明用户可见详情页主区域已经直接暴露 `卸载，保留数据` 和 `删除数据演练`，不会被旧折叠路径掩盖。
- keep-data 卸载 smoke 继续证明 `agentAppInstalled/uninstall` 后 installed state 被移除，并在测试结束时通过 current `agentAppInstalled/save` 恢复 fixture 状态。
- delete-data 仍只做演练，`DRY_RUN_ONLY` / confirmation gate 继续阻断真删除。
- 本轮启动的 `npm run electron:dev`、Vite、Electron Lime 与 App Server sidecar 已在验证后停止，`127.0.0.1:1420` / `127.0.0.1:3030` 已释放。

### 补充验证

- `npx vitest run "scripts/agent-app/apps-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept` 通过，1 file / 3 tests。
- `node "scripts/check-command-contracts.mjs"` 通过，frontend commands `52`、Electron host commands `90`、mock priority `0`、DevBridge truth `64`。
- `git diff --check -- "scripts/agent-app/apps-smoke.mjs" "scripts/agent-app/apps-smoke.test.mjs"` 通过。
- `npm run smoke:agent-apps -- --timeout-ms 120000` 通过；summary：`.lime/qc/gui-evidence/agent-apps/agent-apps-smoke-summary.json`。

### 当前分类

- Agent App 应用中心卸载 UI：`current / verified by GUI smoke`
- `agentAppInstalled/uninstall/rehearsal`、`agentAppInstalled/uninstall`：`current App Server JSON-RPC`
- `agent_app_uninstall_rehearsal`、`agent_app_uninstall`：`dead / guard-only / negative-test-only`
- `delete-data` 真删除：`gated pending phase`

### 剩余退出条件更新

1. `delete-data` 真删除进入后续阶段前，不得绕过现有 phase gate；必须补真实文件删除、post-delete residual audit 与失败回滚证据。
2. 主计划 `production-command-current-migration-plan.md` 写集释放后，再把本专用计划的 GUI smoke 证据合并回 P12 章节。
3. 继续守住旧 `agent_app_uninstall*` 不回流 Rust Tauri runner、DevBridge truth、Electron Host 或前端 production gateway。
