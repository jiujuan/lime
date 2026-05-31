# P18.5 内容工厂 SDK 化回归

更新时间：2026-05-16

状态：P18.5.1 Lime-side SDK regression 已完成；P18.5.2 package-side read-only tests 已通过；P18.5-S Lime-side Host Bridge SDK client 已补齐 capability invoke、subscription、Host action 和 Host event contract；外部 `content-factory-app` package-side source seam 已迁到 SDK facade 形态，真实 package `npm run verify` 已通过，`dist/*` 已同步 SDK facade。当前只剩 owner handoff / dirty 写集收口。

## 目标

P18.5 要证明内容工厂这类 product-level Agent App 可以只依赖 Lime 公开 SDK facade 完成 App 内闭环：App 发起 Agent task、响应缺上下文 / 人工确认、消费 artifact / evidence / workspace patch，再把业务状态、artifact 和 evidence 写回 Host；不能回跳通用 Chat，也不能自建模型网关、凭证、权限、证据或工具调度系统。

## 本轮范围

本阶段先完成 Lime repo 内的消费侧 contract regression 和 SDK transport 目标收敛：用 `createLimeCoreCapabilityAdapters` 模拟内容工厂主链，并证明 task / write-back / evidence 全部通过 `lime.agent / lime.storage / lime.artifacts / lime.evidence` typed facade；再用 `createLimeHostBridgeCapabilityInvoker` 证明同一主链可以穿过 Host Bridge v1。外部 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 只记录当前 gate 结果，不在本轮继续改源码或重建 `dist/*`，避免与隔壁任务打架。

## Prompt-to-artifact checklist

| 要求 | 本轮证据 | 判定 |
|---|---|---|
| 内容工厂发起业务 Agent task 时必须走 `lime.agent.startTask`。 | `src/features/agent-app/sdk/contentFactorySdkRegression.test.ts` 构造 `content.copy.generate` task，带 `expectedOutput.artifactKind = content_batch` 和 `workspacePatch` 约束。 | 通过 Lime-side contract。 |
| 缺上下文 / 人工确认必须通过 Host response 回写，不要求用户跳回 Chat。 | 同一测试从 `task:missingContextRequested` 提取 requestId，并调用 `lime.agent.submitHostResponse`。 | 通过 Lime-side contract。 |
| App 内进度 / 结果必须能消费 task stream / snapshot。 | 同一测试调用 `lime.agent.streamTask` 和 `lime.agent.getTask`，断言 `artifact:created`、`evidence:recorded`、`contentFactoryWorkspacePatch` 不丢失。 | 通过 Lime-side contract；主动 push subscribe 仍归 AgentRuntime owner。 |
| 内容批次业务状态必须写入 App namespace storage。 | 同一测试调用 `lime.storage.set`，并断言 `storage.namespace = content-factory-app`。 | 通过。 |
| 内容批次 artifact 必须通过 Host artifact facade 创建。 | 同一测试调用 `lime.artifacts.create({ kind: "content_batch" })`。 | 通过。 |
| fact grounding / publish readiness 这类证据必须通过 Host evidence facade 记录。 | 同一测试调用 `lime.evidence.record({ kind: "fact_grounding" })`，refs 连接 artifact / task / Host response。 | 通过。 |
| 内容工厂主链必须能穿过 Host Bridge v1，而不是只在 mock transport 里成立。 | `src/features/agent-app/sdk/hostBridgeClient.test.ts` 通过 `createLimeHostBridgeCapabilityInvoker + createLimeCoreCapabilityAdapters` 覆盖 `lime.agent.startTask / streamTask / getTask / submitHostResponse / storage.set / artifacts.create / evidence.record`。 | 通过 Lime-side Host Bridge SDK client contract。 |
| package-side 不应继续手写 ready / snapshot / theme / visibility / Host action。 | `hostBridgeClient.test.ts` 覆盖 `app:ready`、`host:getSnapshot`、`host:snapshot`、`theme:update`、`host:visibility`、`host:toast`、`host:navigate`、`host:openExternal`、`host:download`；2026-05-16 10:55 外部 handoff gate 显示 `hostBridgePrivate=none` 且 `distArtifacts=0`。 | Lime-side contract 通过；外部 source-side 与 dist 私有 marker / 产物同步均已收口。 |
| package-side 不应继续手写 capability subscription transport。 | `hostBridgeClient.test.ts` 覆盖 `capability:subscribe / capability:event / capability:unsubscribe`，并断言 unsubscribe 后不再分发旧事件；2026-05-16 10:33 外部 handoff gate 显示 `uiTestPrivate=none`。 | Lime-side contract 通过；外部测试结构性私有 marker 已清零，但仍需 owner handoff。 |
| 外部 package 后续迁移不应依赖 Lime 内部深路径。 | `src/features/agent-app/index.test.ts` 断言 public feature entry 导出 `createLimeCoreCapabilityAdapters`、`createLimeHostBridgeCapabilityInvoker`、`LIME_AGENT_APP_BRIDGE_PROTOCOL` 与 `LIME_AGENT_APP_BRIDGE_VERSION`；外部 package 当前用 package-local shim，不 import Lime internal path。 | 通过；正式 SDK package 可安装后再替换 shim。 |
| 不能绕过 SDK 调私有 bridge / Tauri / raw Worker。 | 测试只依赖 `createLimeCoreCapabilityAdapters`；边界扫描继续覆盖 `src/features/agent-app`。 | Lime repo 通过；外部 package 仍需后续单独验。 |
| 不覆盖隔壁 package 改动。 | 2026-05-16 10:55 用户确认后已运行真实 `npm run verify`；外部 package 当前仍 dirty：36 个 tracked modified、5 个 untracked；高风险脚本仍会重建 `dist/*`。 | 真实 verify 已完成；后续不再继续改外部 repo，等待 owner 接收写集。 |
| Typecheck 不被 HostBridge timer 类型阻塞。 | `src/features/agent-app/runtime/hostBridge.ts` 将 task subscription `timerId` 收敛为浏览器 `number`。 | 通过；不改变订阅轮询行为。 |
| 外部 package 现状测试可读。 | 2026-05-16 10:55 真实 `npm run verify` 内运行 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app: npm test`，46 tests passed，覆盖 Host Bridge task、stream、Host response、storage、artifact、evidence 写回。 | package-side 测试通过。 |
| 外部 package 标准校验可读。 | 2026-05-16 10:55 真实 `npm run verify` 内运行 `validate:app` 与 `readiness:app`；`validate:app` 为 `ok=true / status=passed`，manifest hash 为 `sha256:6ec3fed5f163739bcf0fd2b845c51a8e10d28aa856e8c6f90259fdab9edd1e48`；`readiness:app` 为 `ok=true / status=needs-setup`。 | 标准校验通过且 readiness 正确停在宿主依赖待绑定状态。 |
| 外部 package SDK facade marker。 | 2026-05-16 10:55 在 Lime repo 运行 `node scripts/agent-app-package-handoff-check.mjs --package-dir /Users/coso/Documents/dev/ai/limecloud/content-factory-app`，输出 `status=needs_handoff`，SDK marker 命中 2+2，`hostBridgePrivate=none`，`uiTestPrivate=none`，`distArtifacts=0`，`blockers=none`。 | SDK facade / dist 同步已完成；`needs_handoff` 仅表示 dirty 写集需 owner 接收。 |

## 已知缺口

| 缺口 | 原因 | 下一刀 |
|---|---|---|
| 外部 `content-factory-app/src/ui/host-bridge.js` source-side facade 已迁移。 | 10:55 handoff gate 已无私有 bridge marker，并命中 SDK facade marker；真实 verify 后 `distArtifacts=0`。 | package-side SDK facade 已通过当前验收；仍需 owner 接收 dirty 写集。 |
| P18.5 真实内容工厂 package verify。 | 10:55 在真实 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 运行 `npm run verify`，build、46 tests、validate、readiness 全部通过。 | 已完成；readiness 保持 `needs-setup` 是宿主 required 依赖待绑定的正确状态。 |
| 外部 dist 产物同步 SDK facade。 | 10:55 verify 后 handoff gate 显示 `distArtifacts=diff:0,missing:0,extra:0,total:0`。 | 已完成；dist 产物已同步，不再作为 blocker。 |
| 隔离 verify 已通过但不替代真实 dist。 | 10:47 在临时副本 `/tmp/limecloud-content-factory-verify.uots6S/content-factory-app` 运行 `npm run verify` 通过，build、46 tests、validate、readiness 均完成。 | 证明当前源码可通过完整 package verify；真实仓库仍需 owner 允许后重建 `dist/*`。 |
| 外部 package 迁移后仍需补回归验证。 | 2026-05-16 07:33 完整 Lime `verify:local` 已端到端通过；10:55 外部真实 package verify 已通过；10:53 Lime SDK seam / handoff core 5 files / 17 tests passed，typecheck 与 contracts 均通过。 | 当前回归已补齐；如后续 owner 再改外部 package 或触及运行时边界，需要重跑对应验证。 |
| 真实 Agent / Skill 端到端产出 patch artifact 仍不是 P18 消费侧已完成项。 | P18.4-H 已把该缺口归 AgentRuntime / Skill owner。 | P18.5 只消费已有 payload，不伪造生产级 producer 完成。 |

## 已验证

```bash
nice -n 10 npm test -- src/features/agent-app/sdk/contentFactorySdkRegression.test.ts src/features/agent-app/sdk/capabilityAdapters.test.ts src/features/agent-app/sdk/capabilityContract.test.ts src/features/agent-app/sdk/MockCapabilityHost.test.ts src/features/agent-app/runtime/hostBridge.test.ts src/features/agent-app/runtime/capabilityDispatcher.test.ts src/features/agent-app/runtime/agentRuntimeCapabilityHost.test.ts src/features/agent-app/ui/AgentAppRuntimePage.test.tsx
nice -n 10 npm test -- src/features/agent-app/sdk/hostBridgeClient.test.ts src/features/agent-app/sdk/contentFactorySdkRegression.test.ts src/features/agent-app/sdk/capabilityAdapters.test.ts src/features/agent-app/sdk/capabilityContract.test.ts src/features/agent-app/sdk/MockCapabilityHost.test.ts src/features/agent-app/runtime/hostBridge.test.ts src/features/agent-app/runtime/capabilityDispatcher.test.ts src/features/agent-app/runtime/agentRuntimeCapabilityHost.test.ts src/features/agent-app/ui/AgentAppRuntimePage.test.tsx
nice -n 10 npm run typecheck -- --pretty false
nice -n 10 npm run test:contracts
nice -n 10 npm test -- src/features/agent-app/index.test.ts
nice -n 10 npm test -- src/features/agent-app/sdk/hostBridgeClient.test.ts src/features/agent-app/sdk/contentFactorySdkRegression.test.ts src/features/agent-app/index.test.ts
nice -n 10 npm run verify:local
cd /Users/coso/Documents/dev/ai/limecloud/content-factory-app && nice -n 10 npm test
git diff --check -- src/features/agent-app/sdk src/features/agent-app/runtime/hostBridge.ts src/features/agent-app/index.ts src/features/agent-app/index.test.ts internal/roadmap/agentapp
rg -n "SceneApp|contentEngineering|sceneapp_|safeInvoke|invoke\(|new Worker|Worker\(" src/features/agent-app || true
```

### 验证结果与覆盖边界

| 验证项 | 当前结果 | 覆盖到的要求 | 不能覆盖的要求 |
|---|---|---|---|
| P18 SDK / Host Bridge 定向测试 | 2026-05-16 07:14：9 files / 43 tests passed。 | typed SDK facade、stable error、MockCapabilityHost、Host Bridge router、capability dispatcher、AgentRuntime capability host 与 RuntimePage SDK surface。 | 不能证明外部 package 已停止手写 bridge wrapper。 |
| Lime-side P18 SDK 最小 contract | 2026-05-16 07:03：4 files / 13 tests passed。 | `hostBridgeClient`、`capabilityContract`、`capabilityAdapters`、`contentFactorySdkRegression` 的最小 SDK contract。 | 不能替代 GUI / Rust / 外部 package verify。 |
| Agent App feature island 全量定向测试 | 2026-05-16 09:09：35 files / 173 tests passed。 | `src/features/agent-app` 内当前 feature island 回归，包含 public SDK export regression。 | 不能证明外部 `content-factory-app` package-side SDK facade 已迁移。 |
| Agent App public SDK export test | 2026-05-16 09:01：已随 SDK seam 最小复跑通过，3 files / 8 tests passed。 | `src/features/agent-app/index.ts` 公共入口继续导出 Host Bridge SDK client、core adapters 与 bridge protocol constants。 | 不能替代正式 `@lime/app-sdk` 发布或外部 package 迁移。 |
| App version consistency | 2026-05-16 09:07：`npm run verify:app-version` passed，版本一致性为 `1.40.0`。 | 新增 public SDK export test 后，应用版本事实源仍一致。 | 不能替代外部 package verify。 |
| Lime typecheck | 2026-05-16 09:04：`npm run typecheck -- --pretty false` passed。 | 当前会话文档复核后，TypeScript 全仓类型检查仍通过。 | 不能替代外部 package verify。 |
| Lime lint | 2026-05-16 09:08：`npm run lint` passed。 | 当前 `src` ESLint 全仓检查仍通过。 | 不能替代外部 package verify。 |
| Lime contracts | 2026-05-16 09:04：`npm run test:contracts` passed。 | 命令、harness、modality runtime 和 cleanup report contracts 仍通过。 | 不能替代外部 package verify。 |
| 外部 package read-only tests | 2026-05-16 09:05：46 tests passed。 | 当时外部 package 业务测试仍绿，包含 Host Bridge task / stream / Host response / storage / artifact / evidence 写回。 | 该次测试早于 10:33 source-side facade gate；不能替代迁移后 package verify。 |
| Lime-side SDK seam 最小复跑 | 2026-05-16 10:41：`publicSdkSurface.test.ts`、`hostBridgeClient.test.ts`、`contentFactorySdkRegression.test.ts`、`index.test.ts`，4 files / 11 tests passed。 | Host Bridge SDK client、SDK-only public surface、内容工厂 SDK regression、public SDK export seam 当前仍绿。 | 不能替代外部 package verify。 |
| 外部标准只读校验 | 2026-05-16 10:41：`validate:app` 为 `passed`，manifest hash 为 `sha256:6ec3fed5f163739bcf0fd2b845c51a8e10d28aa856e8c6f90259fdab9edd1e48`；`readiness:app` 为 `needs-setup`。 | Manifest / APP 标准可读，readiness 能正确表达宿主依赖未绑定。 | `needs-setup` 不是运行闭环完成；也不替代会重写 `dist/*` 的 package verify。 |
| 完整 Lime `verify:local` | 2026-05-16 07:33：端到端通过。 | app version、lint、typecheck、Vitest smart 58 batches、contracts、Rust tests 与全套 GUI smoke。 | 只覆盖当前 Lime repo 状态；外部 package 后续迁移后仍需补回归。 |
| Feature island boundary scan | 2026-05-16 09:00：无输出。 | 当前 `src/features/agent-app` 未复活 `SceneApp`、未直接 `safeInvoke / invoke`、未执行 raw Worker。 | 不扫描外部 package；外部私有 bridge 仍由 P18.5.3 处理。 |
| 外部 package verify | 2026-05-16 10:55：真实 `npm run verify` 通过，包含 build、46 tests、validate passed、readiness needs-setup。 | package-side SDK facade 与 dist 产物已进入当前验收。 | 不代表宿主 required skill / knowledge / tool 已在真实 workspace 绑定。 |
| 外部 package handoff gate | 2026-05-16 10:55：`status=needs_handoff`，`hostBridgePrivate=none`，`uiTestPrivate=none`，SDK marker 命中 2+2，`distArtifacts=0`，blockers 为 `none`。 | 证明 source-side SDK facade marker 已接入，业务测试不再命中私有 marker，且 dist 产物已同步。 | 仍需 owner handoff；dirty 写集不是功能 blocker。 |

## 判定

P18.5 已完成 Lime-side SDK 化回归、Host Bridge SDK client contract、外部 package-side tests / validate / readiness、真实 package verify、dist 产物同步，以及外部 source-side SDK facade marker 收敛：内容工厂主链可以用通用 typed SDK facade 表达，也可以穿过 Host Bridge v1，不需要新增垂直 `content_factory_*` Host API；完整 `verify:local` 也已于 2026-05-16 07:33 端到端通过。当前剩余不是 P18.5 功能缺口，而是外部 package owner 接收 dirty 写集并决定提交边界。
