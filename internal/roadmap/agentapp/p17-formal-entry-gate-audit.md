# Agent App P17 正式入口前 Gate 审计

更新时间：2026-05-15

## 一句话结论

P16-H 已完成进入 P17 设计前的最小技术证据：多 App repository、selected launcher、持久化 lifecycle、cleanup evidence、residual audit、Agent App Lab 专用 GUI smoke、flag-off 回归、typecheck、i18n、command contracts 与边界审计均有当前证据。P17 可以进入“正式 Agent Apps 入口设计 / hardening”阶段，但不能直接升级为 marketplace、Cloud 管理台、真实 delete-data 或完整内容工厂 SaaS。

## 审计口径

本审计只回答一个问题：Lime Desktop 的 Agent App current 主链是否具备进入 P17 正式入口设计的条件。

它不等于：

1. 已经发布公开 marketplace。
2. 已经实现真实 delete-data。
3. 已经让 Cloud / LimeCore 运行 Agent 或渲染 App UI。
4. 已经完成 内容工厂完整业务系统。
5. 已经允许 Agent App 绕过 Capability SDK 调用 Lime 内部模块。

## Prompt-to-artifact checklist

| 要求 / Gate | 证据 | 状态 | 结论 |
|---|---|---|---|
| 多 App repository list | `AgentAppManagerPanel` / `AgentAppLabPage` 测试；`smoke:agent-app-lab` summary `managerRepositoryList=true`、`managerMultiApp=true`。 | 通过 | 可作为 P17 list 事实源，不需要第二套 store。 |
| selected app launcher | `AgentAppLabPage.test.tsx`；smoke summary `managerSelectedApp=true`、`selectedRuntimeApp=true`。 | 通过 | 选中 App 后 entry launcher 与 runtime appId 对齐。 |
| P14 guard 不可旁路 | `AgentAppLabPage.test.tsx`；smoke summary `guardAllowed=true`；`AgentAppRuntimePage.test.tsx`。 | 通过 | P17 entry launch 继续复用 P14 guard。 |
| disable / enable lifecycle | `installedAppState.test.ts`；smoke summary `managerDisableBlocked=true`、`managerEnableAvailable=true`、`managerReenabled=true`。 | 通过 | UI 层能证明 disabled App 不可启动并可恢复。 |
| cleanup rehearsal evidence | `cleanupRehearsalEvidence.test.ts`；smoke summary `cleanupEvidenceJson=true`、`cleanupEvidenceSelectedApp=true`、`cleanupEvidenceStrategy=true`、`cleanupEvidenceBlockedCount=true`。 | 通过 | delete-data 仍是 rehearsal，不执行真实删除。 |
| residual audit | `cleanupResidualAudit.test.ts`；smoke summary `residualAuditVisible=true`、`residualAuditPending=true`。 | 通过 | 能区分 pending / retained / blocked / repository issue。 |
| flag-off regression | `scripts/agent-app-lab-smoke.mjs`；smoke summary `flagOffLabNavHidden=true`、`flagOffLabPageHidden=true`、`flagOffAgentAppsNavVisible=true`、`flagOffNoConsoleErrors=true`。 | 通过 | 关闭 Lab flags 后实验 Lab 不进主路径；受控 Agent Apps 入口仍可见。 |
| 正式 Agent Apps 入口基本可用 | `AgentAppsPage.test.tsx`、`AgentAppRuntimePage.test.tsx`、`sidebarNav.test.ts`。 | 通过 | P17 可以基于现有 `agent-apps` 受控入口 harden，不另起页面事实源。 |
| 五语言文案覆盖 | `translation-coverage.test.ts`、`loadNamespace.test.ts`、`types.test.ts`。 | 通过 | 新增 runtime loading / empty 文案已覆盖五语言。 |
| TypeScript 类型正确 | `npm run typecheck`。 | 通过 | Agent App runtime / Agent Apps page / i18n key 类型已通过 `tsc --noEmit`。 |
| 命令契约同步 | `npm run test:contracts`。 | 通过 | frontend 399、Rust registered 555、mock priority 48、default mock 379；命令契约通过。 |
| Feature island 无直接 Tauri / raw Worker | `rg -n "safeInvoke\|invoke\\(\|tauri::\|generate_handler\|mockPriorityCommands\|defaultMocks\|new Worker\|Worker\\(" src/features/agent-app \|\| true` 无命中。 | 通过 | Agent App feature island 不直接扩展命令边界。 |
| 旧内容工程化 / SceneApp key 不复活 | `rg` legacy audit 无命中。 | 通过 | 不把旧 `contentEngineering*` / `sceneapp_*` 当 current。 |
| Cloud / LimeCore 边界 | `internal/roadmap/agentapp/README.md`、本文与 P16-H 均约束 Cloud 只做 catalog / release / tenant metadata。 | 通过 | P17 仍不能让 Cloud 运行 Agent、渲染 UI 或接管本地 storage。 |
| 失败退出方案 | cleanup rehearsal evidence + residual audit + flag-off smoke。 | 部分通过 | 已证明 rehearsal 和 Lab flag-off；真实 delete-data / namespace 清理执行器仍是 P17 之后单独 gate。 |

## 当前验证记录

| 命令 | 结果 |
|---|---|
| `npm run test -- src/features/agent-app/install/cleanupRehearsalEvidence.test.ts src/features/agent-app/install/cleanupResidualAudit.test.ts src/features/agent-app/install/installedAppState.test.ts src/features/agent-app/ui/AgentAppManagerPanel.test.tsx src/features/agent-app/ui/AgentAppLabPage.test.tsx` | 通过，5 files / 26 tests。 |
| `npm run test -- src/features/agent-app/ui/AgentAppRuntimePage.test.tsx src/features/agent-app/ui/AgentAppsPage.test.tsx src/lib/navigation/sidebarNav.test.ts` | 通过，3 files / 10 tests。 |
| `npm run test -- src/i18n/__tests__/translation-coverage.test.ts src/i18n/__tests__/loadNamespace.test.ts src/i18n/__tests__/types.test.ts` | 通过，3 files / 17 tests。 |
| `npm run smoke:agent-app-lab -- --timeout-ms 180000` | 通过；summary: `.lime/qc/gui-evidence/agent-app-lab/agent-app-lab-smoke-summary.json`。 |
| `npm run typecheck` | 通过。 |
| `npm run test:contracts` | 通过。 |
| `node --check scripts/agent-app-lab-smoke.mjs` | 通过。 |
| `git diff --check -- internal/roadmap/agentapp src/features/agent-app scripts/agent-app-lab-smoke.mjs package.json src/i18n/resources` | 通过。 |
| boundary / legacy `rg` audit | 通过。 |

## P17 进入条件判定

| 条件 | 判定 | 说明 |
|---|---|---|
| 可以进入 P17 正式入口设计 | 可以 | 现有 `agent-apps` 入口已有基础页面、runtime surface、registration、install、launch、disable、uninstall rehearsal 测试。 |
| 可以发布 marketplace | 不可以 | 还没有审核、版本渠道、支付、企业分发或公开 catalog UX。 |
| 可以执行真实 delete-data | 不可以 | P16-H 明确只做 rehearsal；真实删除必须另立 gate。 |
| 可以让 Cloud 运行 Agent App | 不可以 | Cloud / LimeCore 仍只做控制面与 metadata。 |
| 可以把 内容工厂扩成完整行业系统 | 不可以 | P17 只处理平台正式入口，不扩业务 SaaS。 |

## 计划落点

P17 第一刀已沉淀为 [p17-formal-entry-contract.md](./p17-formal-entry-contract.md)。`P17.0 Formal Entry Contract` 的目标是把已有 `agent-apps` 受控入口的产品边界写清楚：

1. 定义正式入口允许做什么：install、launch、disable、registration、uninstall rehearsal、runtime surface。
2. 定义仍禁止做什么：marketplace、Cloud 管理台、真实 delete-data、raw worker、绕过 SDK。
3. 把 `agent-apps` 与 `agent-app-lab` 的边界固定：正式入口服务用户，Lab 继续服务研发验证。
4. 为真实 delete-data、public catalog、企业控制台分别建立后续 gate，不混进 P17.0。

P17.0 完成后已继续完成 `P17.1 Formal route / nav / copy hardening`、P17.2.1 source state model、P17.2.2 install review descriptor、P17.2.3 registration hardening、P17.2.4a Cloud release descriptor / verification gate、P17.2.4b-1 acquisition seam / verified cache source、P17.2.4b-2 packageUrl fetch / staging / manifest extraction、P17.2.5 schema / reference CLI / example package cross-check 与 [P17.3 lifecycle / cleanup contract hardening](./p17-lifecycle-cleanup-contract-hardening.md)；当前下一刀进入 [P17.5 formal entry GUI smoke](./implementation-plan.md)，仍不提前扩 marketplace、Cloud 管理台或真实 delete-data。
