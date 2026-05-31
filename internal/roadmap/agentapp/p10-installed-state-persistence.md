# Agent App P10 Installed App State / Persistence

更新时间：2026-05-15

## 一句话目标

P10 的目标是把 Agent App 的 installed preview、setup state、projection、readiness 汇总为可恢复的 installed state snapshot。当前只实现可序列化状态模型和 in-memory store，不写真实文件、不下载 package、不进入正式主路径。

## 当前落地

| 项 | 证据 |
|---|---|
| State 类型 | `InstalledAgentAppState` 已加入 `src/features/agent-app/types.ts`。 |
| State 构造 | `buildInstalledAgentAppState()` 可从 `InstalledAppPreview` 和 `AgentAppSetupState` 构造 snapshot。 |
| In-memory store | `InMemoryInstalledAgentAppStateStore` 支持 `upsert()`、`get()`、`list()`、`setDisabled()`、`remove()`、`clear()`。 |
| Cleanup 集成 | `AppCleanupPlan` 增加 `installedStatePaths`，路径为 `<LimeAppData>/agent-apps/installed/<app-id>.json`。 |
| Uninstall 集成 | Mock / Adapter host delete-data 目标包含 installed state path。 |
| UI Preview | Lab cleanup panel 把 installed state path 纳入 package 清理组展示。 |
| 导出入口 | `src/features/agent-app/index.ts` 导出 installed state API。 |

## 数据边界

Installed state 允许保存：

```text
package identity
normalized manifest
projection snapshot
readiness snapshot
setup binding refs
disabled flag
installedAt / updatedAt
```

禁止保存：

```text
secret value
API key / OAuth token
客户知识正文
workspace 文件内容
App storage 业务记录
Tool 调用输入输出全文
raw package code
```

## 当前状态模型

```ts
type InstalledAgentAppState = {
  appId: string
  identity: PackageIdentity
  manifest: NormalizedAppManifest
  projection: AgentAppProjection
  readiness: ReadinessResult
  setup: AgentAppSetupState
  disabled: boolean
  installedAt: string
  updatedAt: string
}
```

## 验证记录

| 命令 | 结果 |
|---|---|
| `npm run test -- src/features/agent-app/install/installedAppState.test.ts src/features/agent-app/install/setupStateStore.test.ts src/features/agent-app/projection/projectApp.test.ts src/features/agent-app/ui/AgentAppLabPage.test.tsx` | 通过，14 tests。 |
| `npm run test -- src/features/agent-app/schema/schemaGate.test.ts src/features/agent-app/manifest/parseManifest.test.ts src/features/agent-app/projection/projectApp.test.ts src/features/agent-app/readiness/checkReadiness.test.ts src/features/agent-app/install/cloudBootstrap.test.ts src/features/agent-app/install/setupStateStore.test.ts src/features/agent-app/install/installedAppState.test.ts src/features/agent-app/featureFlag.test.ts src/features/agent-app/sdk/MockCapabilityHost.test.ts src/features/agent-app/adapters/AdapterCapabilityHost.test.ts src/features/agent-app/runtime/contentFactoryDemo.test.ts src/features/agent-app/runtime/workflowRuntimeHost.test.ts src/features/agent-app/ui/AgentAppLabPage.test.tsx` | 通过，56 tests。 |
| `npm run typecheck` | 通过。 |
| `npm run test:contracts` | 通过。 |

## 剩余差距

| 差距 | 处理 |
|---|---|
| P11 已补本地 persistence adapter。 | P12 已继续完成 package cache / verify / rollback。 |
| 未加载 package runtime / UI bundle。 | P13 已处理 runtime package loader / UI bundle loader。 |
| Installed state 尚未与 Cloud bootstrap refresh 合并。 | P16 评估 App Manager refresh / migration policy，不在 P10 内补第二套同步。 |
| 未做 GUI smoke。 | P15-H 已补 Agent App Lab 专用 GUI smoke；正式主路径前仍需全局 GUI smoke 结论。 |

## 下一刀

P10 已完成 installed state snapshot 和 in-memory store，P11-P13 已继续完成 [Local Persistence Adapter](./p11-local-persistence-adapter.md)、[Package Cache / Verify / Rollback](./p12-package-cache-verify-rollback.md) 与 [Runtime Package Loader / UI Bundle Loader](./p13-runtime-package-loader.md)。[P14 Entry Runtime Guard / Permission Prompt](./p14-entry-runtime-guard-permission-prompt.md) 与 [P15 Lab Install / Launch Flow](./p15-lab-install-launch-flow.md) 已完成当前实现与定向验证，P15-H 已补 Agent App Lab 专用 GUI smoke / cleanup rehearsal 证据，P16 已完成最小 Agent App Manager；P17 Gate 审计、P17.0 Formal Entry Contract、P17.1 Formal route / nav / copy hardening、P17.2.1 Source state model、P17.2.2 Install review descriptor、P17.2.3 Registration hardening 与 P17.2.4a Cloud release descriptor / verification gate、P17.2.4b-1 acquisition seam / verified cache source、P17.2.4b-2 packageUrl fetch / staging / manifest extraction 与 P17.2.5 public schema / reference CLI / standard example package cross-check 已完成，P17.3 lifecycle / cleanup contract 与 P17.4 runtime surface production hardening 已完成，当前进入 P17.5 formal entry GUI smoke。
