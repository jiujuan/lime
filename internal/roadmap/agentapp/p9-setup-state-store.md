# Agent App P9 Installed Setup State Store

更新时间：2026-05-15

## 一句话目标

P9 的目标是把 P8 的 `AgentAppSetupState` 从测试参数推进为本地可查询、可清理的 setup state store。Store 只保存 binding 状态和引用，不保存 Secret 明文、客户知识正文、workspace data 或 App runtime 业务数据。

## 当前落地

| 项 | 证据 |
|---|---|
| Store 类型 | `AgentAppSetupBindingKind`、`AgentAppSetupBindingRecord` 已加入 `src/features/agent-app/types.ts`。 |
| In-memory store | `src/features/agent-app/install/setupStateStore.ts` 提供 `InMemoryAgentAppSetupStateStore`。 |
| State 聚合 | `buildSetupStateFromBindings()` 把 binding records 聚合成 `AgentAppSetupState`。 |
| 查询 / 清理 | Store 支持 `upsert()`、`list()`、`getSetupState()`、`remove()`、`clearApp()`。 |
| Preview 集成 | `buildInstalledAppPreview()` 接收 `setup`，readiness 可由 store 输出消除 `needs-setup`。 |
| Cleanup 集成 | `AppCleanupPlan` 增加 `setupStatePaths`，`buildCleanupPlan()` 输出 `<LimeAppData>/agent-apps/setup/<app-id>.json`。 |
| Uninstall 集成 | Mock / Adapter host 的 delete-data 路径包含 `setupStatePaths`。 |
| UI Preview | Lab cleanup panel 把 setup state path 纳入 projection/readiness 清理组展示。 |

## 数据边界

允许保存：

```text
appId
kind
key
resolved
ref
source
updatedAt
```

禁止保存：

```text
secret value
OAuth token
API key
客户知识正文
workspace 文件内容
App storage record
Tool 调用输入输出全文
```

## 验证记录

| 命令 | 结果 |
|---|---|
| `npm run test -- src/features/agent-app/install/setupStateStore.test.ts src/features/agent-app/readiness/checkReadiness.test.ts src/features/agent-app/projection/projectApp.test.ts src/features/agent-app/ui/AgentAppLabPage.test.tsx` | 通过，14 tests。 |
| `npm run test -- src/features/agent-app/schema/schemaGate.test.ts src/features/agent-app/manifest/parseManifest.test.ts src/features/agent-app/projection/projectApp.test.ts src/features/agent-app/readiness/checkReadiness.test.ts src/features/agent-app/install/cloudBootstrap.test.ts src/features/agent-app/install/setupStateStore.test.ts src/features/agent-app/featureFlag.test.ts src/features/agent-app/sdk/MockCapabilityHost.test.ts src/features/agent-app/adapters/AdapterCapabilityHost.test.ts src/features/agent-app/runtime/contentFactoryDemo.test.ts src/features/agent-app/runtime/workflowRuntimeHost.test.ts src/features/agent-app/ui/AgentAppLabPage.test.tsx` | 通过，53 tests。 |
| `npm run typecheck` | 通过。 |
| `npm run test:contracts` | 通过。 |

## 剩余差距

| 差距 | 处理 |
|---|---|
| Store 当前已能进入 P11 installed state persistence。 | P12 已继续完成 package cache / verify / rollback。 |
| Resolver 仍由测试 records 构造。 | 后续接真实 Knowledge / Skill / Tool / Secret / Overlay resolver。 |
| setup state 删除只进入 host delete-data 目标，还没有真实文件删除。 | 等本地持久化后接真实删除。 |
| Entry-specific setup state 尚未细化。 | 后续按 entryKey 扩展 binding record。 |

## 下一刀

P9 已完成本地 setup state store 的最小闭环，后续 P10-P13 已继续完成 installed state snapshot、local persistence adapter、package cache / verify / rollback 与 runtime package loader。[P14 Entry Runtime Guard / Permission Prompt](./p14-entry-runtime-guard-permission-prompt.md) 与 [P15 Lab Install / Launch Flow](./p15-lab-install-launch-flow.md) 已完成当前实现与定向验证，P15-H 已补 Agent App Lab 专用 GUI smoke / cleanup rehearsal 证据，P16 已完成最小 Agent App Manager；P17 Gate 审计、P17.0 Formal Entry Contract、P17.1 Formal route / nav / copy hardening、P17.2.1 Source state model、P17.2.2 Install review descriptor、P17.2.3 Registration hardening 与 P17.2.4a Cloud release descriptor / verification gate、P17.2.4b-1 acquisition seam / verified cache source、P17.2.4b-2 packageUrl fetch / staging / manifest extraction 与 P17.2.5 public schema / reference CLI / standard example package cross-check 已完成，P17.3 lifecycle / cleanup contract 与 P17.4 runtime surface production hardening 已完成，当前进入 P17.5 formal entry GUI smoke。
