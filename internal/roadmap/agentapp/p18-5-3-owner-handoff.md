# P18.5.3 Owner Handoff / Package-side SDK Facade

更新时间：2026-05-16

状态：package verify 已完成，待 owner handoff。本文是给外部 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` owner 的执行单页；详细设计仍以 [p18-5-3-package-sdk-migration-plan.md](./p18-5-3-package-sdk-migration-plan.md) 为准。

## 当前判定

P18 Lime-side SDK / Host Bridge / typed contract 已有证据；外部 `content-factory-app/src/ui/host-bridge.js` 的 source-side SDK facade marker 已接入，私有 bridge marker 已清零；用户确认后真实 package `npm run verify` 已通过，`dist/*` 已纳入验收并同步。当前剩余是外部仓库仍处于 dirty / untracked 状态，需要 owner 接收写集。

2026-05-16 分阶段只读证据：

| 检查项 | 结果 | 交接判定 |
|---|---|---|
| 外部 package 只读测试 | 2026-05-16 09:05 在 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 运行 `npm test`，46 tests passed。 | 只证明现状业务测试仍绿；不能替代 SDK facade 迁移。 |
| 外部标准只读校验 | 2026-05-16 09:06 运行 `npm run validate:app && npm run readiness:app`；`validate:app` passed，manifest hash 为 `sha256:6ec3fed5f163739bcf0fd2b845c51a8e10d28aa856e8c6f90259fdab9edd1e48`；`readiness:app` needs-setup。 | 标准 manifest 可读，readiness 正确等待宿主绑定 required 依赖；不能替代 `npm run verify`。 |
| Lime-side 回归 | 2026-05-16 09:09 `npm test -- src/features/agent-app`，35 files / 173 tests passed；09:04 `typecheck` 与 `test:contracts` 均通过。 | Lime-side SDK / feature island 当前绿；不能证明外部 `host-bridge.js` 已迁移。 |
| 外部写集 | 外部仓库仍有大量 dirty / untracked，且 `src/ui/host-bridge.js`、`dist/ui/host-bridge.js` 仍未跟踪。 | owner 未稳定前继续只读。 |
| SDK facade marker | 2026-05-16 09:22 只读复核：`src/ui/host-bridge.js` 仍包含 `pendingRequests / buildMessage / window.parent.postMessage / requestHostBridge / capability:invoke / capability:subscribe / capability:event`；`tests/ui.test.mjs` 仍直接过滤 `message.type === 'capability:invoke'`。 | 外部 package 仍不是 SDK facade consumer；P18.5.3 不可标记完成。 |
| 09:39 再复核 | 外部 `npm test` 重跑仍为 46 tests passed；Lime-side SDK seam 最小集重跑 3 files / 8 tests passed；外部仓库仍是 36 个 tracked modified、3 个 untracked，且私有 bridge marker 未消失。 | 可以继续交接准备，但还不能默认接管；确认 handoff 后再改最小写集。 |
| 10:33 机械 gate 复核 | 运行 `node scripts/agent-app/package-handoff-check.mjs --package-dir /Users/coso/Documents/dev/ai/limecloud/content-factory-app`：`status=needs_handoff`，dirty `tracked=36 / untracked=4 / total=40`，`hostBridgePrivate=none`，`uiTestPrivate=none`，SDK marker 为 `createLimeHostBridgeCapabilityInvoker:2 / createLimeCoreCapabilityAdapters:2`，blockers 为 `none`。 | source-side facade blocker 已解除；接管动作从“实现迁移”改为“确认 owner handoff、决定是否跑 verify / 重建 dist”。 |
| 10:41 不重建 dist 验证 | Lime SDK seam 4 files / 11 tests passed；外部 `npm test` 46 tests passed；外部 `validate:app` passed；`readiness:app` needs-setup。 | 可交接证据增强；仍不能替代 `npm run verify`，因为 verify 会先 build 并重建 `dist/*`。 |
| 10:45 dist 预审 | 只读解析 `scripts/build.mjs`：build 会先删除 `dist` 再复制 `src/ui`、`src/core`、`src/integrations`、`src/worker/index.mjs`；hash 预审发现 `src/ui/host-bridge.js` 与 `dist/ui/host-bridge.js` 不一致，`src/ui/lime-app-sdk.js` 缺少对应 `dist/ui/lime-app-sdk.js`。 | 说明 source-side facade 尚未进入 dist 产物；最终验收必须由 owner 确认后重建 dist，或明确保留该缺口。 |
| 10:47 隔离 verify 演练 | 临时副本 `/tmp/limecloud-content-factory-verify.uots6S/content-factory-app` 中运行 `npm run verify` 通过：build、46 tests、validate、readiness 均完成，readiness 仍为预期 `needs-setup`。 | 说明当前源码具备通过 verify 的能力；真实仓库仍需 owner 确认后把 dist 重建纳入实际写集。 |
| 10:55 真实 verify | 用户确认后在真实外部 package 运行 `npm run verify` 通过：build、46 tests、validate、readiness 均完成；随后 handoff gate 显示 `distArtifacts=0`、blockers 为 `none`。 | P18.5.3 package-side verify 已完成；当前只剩 owner handoff / git 写集收口。 |

## 接管前必须先跑

```bash
git -C /Users/coso/Documents/dev/ai/limecloud/content-factory-app status --short
rg -n "pendingRequests|requestHostBridge|buildMessage|postMessage|createLimeHostBridgeCapabilityInvoker|createLimeCoreCapabilityAdapters|capability:invoke|capability:subscribe|capability:event" /Users/coso/Documents/dev/ai/limecloud/content-factory-app/src/ui/host-bridge.js /Users/coso/Documents/dev/ai/limecloud/content-factory-app/tests/ui.test.mjs
node scripts/agent-app/package-handoff-check.mjs --package-dir /Users/coso/Documents/dev/ai/limecloud/content-factory-app
cd /Users/coso/Documents/dev/ai/limecloud/content-factory-app && nice -n 10 npm test
```

如果仍有未知 dirty / untracked，或者 owner 未明确交接，停止，不继续写外部 package。

2026-05-16 09:48 机械 handoff gate 已新增到 Lime repo：`scripts/agent-app/package-handoff-check.mjs` 只读检查外部 package 的 dirty 计数、私有 bridge marker、SDK facade marker、`scripts/build.mjs` 和会重建 `dist/*` 的高风险脚本。2026-05-16 10:33 最新输出为 `status=needs_handoff`：私有 Host Bridge transport marker 已消失，SDK facade marker 已出现；高风险脚本仍命中 `build / verify / e2e:user-flow / e2e:user-flow:fake-model`，因此下一步必须确认 owner handoff，不能直接重建 package artifacts。

## 最小写集

| 文件 | 允许动作 |
|---|---|
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/src/ui/host-bridge.js` | 已进入 SDK facade consumer 形态；后续只允许 owner 接受后的最小修正。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/src/ui/lime-app-sdk.js` | 已作为 package-local 临时 shim 出现；正式 `@lime/app-sdk` 可安装后删除该 shim。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/tests/ui.test.mjs` | 已不再命中 handoff gate 的私有 transport marker；后续只做必要的行为回归修正。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/package.json` | 仅在正式 SDK package / workspace alias 确认可用时修改。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/dist/ui/*` | 只在明确允许 build / verify 后由构建生成。 |

## 2026-05-16 11:03 Owner Acceptance Bundle

当前 P18.5.3 功能验收已完成，但两个仓库都不是 clean 状态。提交或 handoff 时必须按写集分组，避免把外部 package 的并行业务资料改动混进 Agent App SDK facade 收口。

### Lime 客户端侧应接收的 P18 写集

| 分组 | 文件 / 范围 | 接收理由 |
|---|---|---|
| SDK facade / Host Bridge contract | `src/features/agent-app/sdk/*`、`src/features/agent-app/index.ts`、`src/features/agent-app/index.test.ts`。 | typed Capability SDK、SDK-only public surface、Host Bridge SDK client 与内容工厂 SDK regression。 |
| Agent App runtime / readiness / projection 回归 | `src/features/agent-app/runtime/*`、`src/features/agent-app/readiness/*`、`src/features/agent-app/projection/*`、`src/features/agent-app/manifest/*`、`src/features/agent-app/types.ts`、`src/features/agent-app/fixtures/content-factory-app.json`。 | P18 SDK gate 与 package projection / readiness / runtime contract 的配套回归。 |
| P18 handoff gate | `scripts/agent-app/package-handoff-check.mjs`、`scripts/lib/agent-app-package-handoff-core.mjs`、`scripts/lib/agent-app-package-handoff-core.test.ts`。 | 机械检查外部 package 的私有 bridge marker、SDK marker、高风险脚本与 `src -> dist` 产物漂移。 |
| Roadmap / 审计 | `internal/roadmap/agentapp/p18-completion-audit.md`、`p18-5-content-factory-sdk-regression.md`、`p18-5-3-package-sdk-migration-plan.md`、`p18-5-3-owner-handoff.md` 及相关 P17/P18 roadmap 增量。 | 记录 P18 分阶段证据、owner 边界、验证结果与下一阶段约束。 |

### 外部 content-factory-app 的 P18.5.3 最小接收写集

| 文件 | 当前状态 | 接收理由 |
|---|---|---|
| `src/ui/host-bridge.js` | untracked。 | package-side business helper 收敛为 SDK facade consumer。 |
| `src/ui/lime-app-sdk.js` | untracked。 | 临时 package-local SDK shim；正式 `@lime/app-sdk` 可安装后删除。 |
| `tests/ui.test.mjs` | modified。 | Host Bridge 结构性断言改为 SDK facade / invoker call log 断言，保留业务闭环测试。 |
| `dist/ui/host-bridge.js` | untracked。 | 真实 `npm run verify` 后生成的 runtime 产物。 |
| `dist/ui/lime-app-sdk.js` | untracked。 | 真实 `npm run verify` 后生成的 SDK shim 产物。 |

### 外部 package 当前仍存在的非 P18 并行 dirty

以下文件同样处于 modified，但不是 P18.5.3 SDK facade 的最小必要写集；是否纳入同一提交必须由外部 package owner 决定：

```text
APP.md
README.md
RELEASE_NOTES.md
agents/content-strategist.md
docs/v1/*
docs/requirements-map.md
package.json
scripts/e2e-user-flow.mjs
src/core/*
src/integrations/*
src/server/api.mjs
src/ui/app.js
src/ui/index.html
src/ui/styles.css
tests/api.test.mjs
tests/core.test.mjs
tests/model-generation.test.mjs
dist/core/*
dist/integrations/*
dist/ui/app.js
dist/ui/index.html
dist/ui/styles.css
```

提交建议：Lime 客户端 P18 gate 与文档可以作为一个 Lime repo 变更组；外部 `content-factory-app` 至少把上表 5 个 P18.5.3 文件作为 SDK facade 验收组，其余业务 / docs / core / model-generation / server / dist 变更由 package owner 单独判断。

## 禁止项

1. 不改业务 UI、文案、样式、core、integrations、server、model-generation。
2. 不新增 Lime 垂直 `content_factory_*` command。
3. 不让外部 App import Lime repo `src/features/agent-app/*` deep path。
4. 10:55 用户已确认并完成一次真实 `npm run verify`；后续若再次运行 `npm run build`、`npm run verify`、`npm run e2e:user-flow*`，仍需确认 owner 接受 `dist/*` 再次重建。
5. 不删除业务行为断言，只替换鼓励私有 bridge 的测试 mock / 结构性断言。

## 当前目标

保留 `src/ui/app.js` 当前 5 个直接 import：

```js
initHostBridge
notifyHost
runHostAgentTask
syncHostConfirmation
writeHostTaskResult
```

当前 gate 已确认 `host-bridge.js` 不再拥有以下私有 marker；后续 owner 接手时仍需保持：

```text
pendingRequests
buildMessage
requestHostBridge
window.parent.postMessage
capability:invoke / capability:subscribe / capability:event 私有 lifecycle
```

业务 helper 底层只能调用：

```text
lime.agent
lime.storage
lime.artifacts
lime.evidence
SDK Host action / subscription wrapper
```

## 验证顺序

1. 已确认 handoff gate 为 `needs_handoff` 且 blockers 为 `none`；10:55 追加确认 `distArtifacts=0`。
2. 外部 package：10:55 `nice -n 10 npm run verify` 已通过，包含 `npm test` 46 tests passed。
3. Lime repo：10:53 SDK seam / handoff core 定向测试 5 files / 17 tests passed。
4. Lime repo：10:55 `nice -n 10 npm run typecheck -- --pretty false` 已通过。
5. Lime repo：10:53 `nice -n 10 npm run test:contracts` 已通过。
6. 后续只有在 owner 继续修改外部 package 或触及运行时边界时，才需要重跑对应 verify / GUI smoke。

## 完成条件

P18.5.3 只有在以下全部成立时才算完成：

1. 外部 `src/ui/host-bridge.js` 已收敛为 SDK facade consumer。
2. 外部 `npm test` 通过。
3. 外部 `npm run verify` 通过，或明确记录未运行原因和退出条件。
4. Lime feature island / typecheck / contracts 回归通过。
5. [p18-5-content-factory-sdk-regression.md](./p18-5-content-factory-sdk-regression.md) 与 [p18-completion-audit.md](./p18-completion-audit.md) 回填迁移后证据。

2026-05-16 10:55：以上 1-5 均已满足；本文继续保留为 owner handoff 单页，提醒真实外部 package 仍 dirty，提交 / 推送边界需由 owner 决定。
