# P18.6 Raw Worker 前 Gate

更新时间：2026-05-16

状态：已完成。P18 明确不执行 raw worker、任意外部代码、网络、文件系统或原生 API；raw worker sandbox、资源限制、网络策略和 secret policy 统一后移到 P19 以后。

## 目标

P18.6 的目标不是实现 worker sandbox，而是在 P18 Typed Capability SDK Gate 结束前固定一条安全边界：Agent App 可以使用受控 workflow DSL 和 Host Capability SDK，但不能执行 package 自带 raw worker bundle，也不能直接创建 `Worker`、访问网络、文件系统、Tauri / Node API 或自行处理 secret。

## Prompt-to-artifact checklist

| 要求 | 代码 / 文档证据 | 判定 |
|---|---|---|
| P18 不执行 raw worker。 | `src/features/agent-app/runtime/runtimePolicy.ts` 固定 `allowRawWorker: false`；`resolveAgentAppWorkflowRuntimePolicy()` 无论 overrides 如何都强制 false。 | 通过。 |
| workflow runtime 只允许受控 DSL。 | `agentAppWorkflowStepKinds` 只包含 `storage.set / knowledge.search / agent.startTask / artifacts.create / evidence.record`。 | 通过。 |
| 未注册 raw worker / network step 被拒绝。 | `src/features/agent-app/runtime/workflowRuntimeHost.test.ts` 的“应拒绝未注册的 raw worker / network 类 step”。 | 通过。 |
| 关闭 `workerRuntimeEnabled` 时不能执行 workflow。 | `src/features/agent-app/runtime/workflowRuntimeHost.test.ts` 覆盖 `WORKFLOW_RUNTIME_DISABLED`。 | 通过。 |
| Runtime package loader 输出 raw worker / network / filesystem policy evidence。 | `src/features/agent-app/runtime/runtimePackageLoader.ts` 的 `buildPolicyEvidence()` 固定 raw worker、network、filesystem 为 false；对应 `runtimePackageLoader.test.ts` 覆盖 blocked / evidence。 | 通过。 |
| Entry runtime guard 不允许 background-task 伪装成已开放 worker sandbox。 | `src/features/agent-app/runtime/entryRuntimeGuard.ts` 对 background task entry 输出 blocked：`Background task entries require a worker sandbox, which P14 keeps disabled.` | 通过。 |
| Feature flag 不把 workerRuntimeEnabled 解释为 raw worker。 | `src/features/agent-app/featureFlag.test.ts` 固定 workerRuntimeEnabled 只进入 P4.2 workflow runtime，不自动启用 adapter / UI / raw worker。 | 通过。 |
| Agent App feature island 无直接 `new Worker` / raw `Worker(` / Tauri invoke 越界。 | 边界扫描：`rg -n "SceneApp|contentEngineering|sceneapp_|safeInvoke|invoke\\(|new Worker|Worker\\(" src/features/agent-app || true` 无输出；2026-05-16 08:33 当前会话复跑仍无输出。 | 通过。 |

## P19 后续退出条件

raw worker 只能在后续单独 gate 中开放，并且至少满足：

1. 独立 sandbox 设计：明确 iframe worker / Web Worker / WASM worker 的隔离边界。
2. Resource limits：CPU、内存、运行时长、并发数、队列和取消语义可测试。
3. Network policy：默认无网络；需要 manifest capability、用户授权、tenant policy 和审计 evidence。
4. Secret policy：App worker 永不接触 secret value，只能拿 Host broker 颁发的 scoped ref。
5. Storage / artifact / evidence：仍必须通过 SDK facade 写回，不允许 worker 直接访问宿主文件系统或 DB。
6. GUI / contract / security tests：必须覆盖禁用态、授权态、失败清理、残留审计和 feature-island boundary scan。

## 已验证

```bash
nice -n 10 npm test -- src/features/agent-app/runtime/workflowRuntimeHost.test.ts src/features/agent-app/featureFlag.test.ts src/features/agent-app/runtime/runtimePackageLoader.test.ts src/features/agent-app/runtime/entryRuntimeGuard.test.ts
rg -n "SceneApp|contentEngineering|sceneapp_|safeInvoke|invoke\\(|new Worker|Worker\\(" src/features/agent-app || true
```

最新复核：

- 2026-05-16 08:33 当前会话重跑 feature island 越界扫描，无输出。

## 判定

P18.6 已完成：P18 只保留受控 workflow DSL 和 typed capability SDK；raw worker sandbox 不进入本阶段。P18.5 package-side SDK facade / verify 已于 2026-05-16 10:55 完成；当前剩余是 owner handoff / git 写集收口，不再是 raw worker 前置 blocker。
