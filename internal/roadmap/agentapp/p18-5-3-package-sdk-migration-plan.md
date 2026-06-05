# P18.5.3 Package-side SDK Facade Migration Plan

更新时间：2026-05-16

状态：package-side SDK facade / verify 已完成，待 owner handoff；外部 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 的 source-side SDK facade marker 已接入，私有 bridge marker 已清零，真实 `npm run verify` 已通过，`dist/*` 已同步 SDK facade；该仓库仍处于大量 dirty / untracked 状态，需 owner 接收写集。

## 一句话结论

P18.5.3 的目标不是重写内容工厂业务，也不是把 Lime repo 的测试当成外部 package 完成证据；目标是把外部 `content-factory-app/src/ui/host-bridge.js` 从手写 Host Bridge transport 收敛为标准 SDK facade consumer，让业务 helper 继续存在，但底层只调用 `createLimeHostBridgeCapabilityInvoker + createLimeCoreCapabilityAdapters`。截至 2026-05-16 10:55，source-side facade blocker 已解除，真实 package verify 已通过，`dist/*` 已同步；剩余风险转为 owner handoff / git 写集收口。

## 迁移前只读事实

外部 package 当前状态：

```text
/Users/coso/Documents/dev/ai/limecloud/content-factory-app
```

以下为 10:33 前的迁移基线，保留用于解释为什么不能直接大范围覆盖外部 package；当前最新状态以“2026-05-16 10:33 协作复核”为准。迁移前仍有大量 dirty 文件，包含：

- `src/ui/host-bridge.js` 未跟踪。
- `dist/ui/host-bridge.js` 未跟踪。
- `src/ui/app.js`、`src/ui/index.html`、`src/ui/styles.css` 已修改。
- `tests/ui.test.mjs` 已修改。
- `package.json` 已修改。
- 多个 `docs/v1/*`、`src/core/*`、`src/integrations/*`、`tests/*` 已修改。

迁移前 `src/ui/host-bridge.js` 仍直接维护：

| 当前职责 | 说明 | P18.5.3 目标 |
|---|---|---|
| `PROTOCOL / VERSION / APP_ID / DEFAULT_ENTRY_KEY` | App 内自行定义 bridge 协议常量。 | 协议常量由 SDK client 提供；App 只传 `appId / entryKey`。 |
| `pendingRequests` / timeout / `requestHostBridge` | App 自己管理 request lifecycle。 | 由 `createLimeHostBridgeCapabilityInvoker` 统一处理。 |
| `app:ready / host:getSnapshot / host:snapshot / theme:update / host:visibility` | App 自己监听 Host 初始化与主题事件。 | 由 SDK client 的 ready、snapshot、theme、visibility API 承接。 |
| `notifyHost / requestHostDownload / navigation helper` | App 自己发送 `host:toast / host:navigate / host:openExternal / host:download`。 | 由 SDK client Host action API 承接。 |
| `invokeCapability(capability, method, input)` | App 自己构造 `capability:invoke` payload。 | App 业务 helper 调用 `lime.agent / lime.storage / lime.artifacts / lime.evidence` facade。 |
| `startHostTask / streamHostTask / getHostTask / submitHostResponse` | 对 `lime.agent` 的私有 wrapper。 | 保留业务语义，但内部改为 `lime.agent.*`。 |
| `writeHostTaskResult / syncHostConfirmation` | 内容工厂业务 helper。 | 可以保留；内部必须只调用 `lime.storage / lime.artifacts / lime.evidence / lime.agent`。 |
| `capability:subscribe / unsubscribe / event` | Host task update 的主动推送 / 轮询桥。 | 由 SDK client 的 `subscribeCapability / unsubscribeCapability` 承接；业务 helper 只消费事件 payload。 |

### 2026-05-16 迁移前只读复核

本段是 10:55 真实 verify 之前的历史复核，用于解释迁移前 blocker 和 handoff 规则。复核命令：

```bash
git -C /Users/coso/Documents/dev/ai/limecloud/content-factory-app status --short
rg -n "pendingRequests|requestHostBridge|buildMessage|postMessage|createLimeHostBridgeCapabilityInvoker|createLimeCoreCapabilityAdapters|capability:invoke|capability:subscribe|capability:event" /Users/coso/Documents/dev/ai/limecloud/content-factory-app/src/ui/host-bridge.js
```

历史结论：

| 检查项 | 当时事实 | 历史判定 |
|---|---|---|
| 外部仓库是否稳定 | `APP.md`、`README.md`、`dist/*`、`src/ui/*`、`tests/*`、docs、model-generation 等仍 dirty；`src/ui/host-bridge.js` 与 `dist/ui/host-bridge.js` 仍未跟踪。 | 不稳定；不能直接覆盖。 |
| 是否已接入标准 SDK client | `src/ui/host-bridge.js` 未出现 `createLimeHostBridgeCapabilityInvoker` 或 `createLimeCoreCapabilityAdapters`。 | 未接入。 |
| 是否存在手写 transport | 当时包含 `pendingRequests`、`buildMessage`、`window.parent.postMessage`、`requestHostBridge`、`capability:invoke`、`capability:subscribe`、`capability:event`。 | 迁移前未完成。 |
| 哪些业务 helper 可以保留 | `runHostAgentTask`、`writeHostTaskResult`、`syncHostConfirmation` 已承载内容工厂业务语义。 | 保留语义，迁移时只替换底层 transport。 |
| 是否需要改 `dist/*` | `dist/ui/host-bridge.js` 同样未跟踪且像是并行构建产物。 | 不在 owner 稳定前改写；verify 阶段再更新。 |

因此 P18.5.3 的第一刀不是重写内容工厂页面，而是建立 package-side SDK seam：

```text
当前业务 helper
  -> package-local sdk runtime handle
  -> lime.agent / lime.storage / lime.artifacts / lime.evidence facade
  -> createLimeCoreCapabilityAdapters
  -> createLimeHostBridgeCapabilityInvoker
  -> Host Bridge v1
```

迁移时应优先保留业务 helper 的导出 API，降低和隔壁 UI / tests 改动冲突；只有 `pendingRequests`、`buildMessage`、`requestHostBridge`、stable error unwrap、timeout 和 subscription transport 需要归还给 SDK client。

### 2026-05-16 协作复核

本段只做 owner lock，不接管外部 package 写集。

| 输入 | 当前状态 | P18.5.3 处理方式 |
|---|---|---|
| `/Users/coso/Documents/dev/ai/limecloud/agentapp` | 工作区干净，当前 `HEAD=4bef605 fix: quote mermaid sdk labels`；标准文档已扩展到 zh / en 的 authoring、client implementation、reference、examples、what-is-agent-app、agent-app-vs-skills-knowledge 与 mini-program analogy。 | 只作为标准事实源输入；不修改标准仓库，不把标准文档复制进 Lime 客户端计划。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` | 仍有 `APP.md`、`README.md`、`dist/*`、`src/ui/*`、`tests/*`、docs、model-generation 等大量 dirty / untracked。 | owner 未稳定，继续不改源码、不改 `dist/*`、不跑会 build 的 verify。 |
| `src/ui/host-bridge.js` | 当时包含 `pendingRequests`、`window.parent.postMessage`、`requestHostBridge`、`capability:invoke`、`capability:subscribe` 等手写 transport 标记，未出现 `createLimeHostBridgeCapabilityInvoker` 或 `createLimeCoreCapabilityAdapters`。 | 当时需替换 transport seam，不重写业务 UI；该项已在 10:55 收口。 |
| `tests/ui.test.mjs` | 仍有对 `capability:invoke / subscribe / event` 与 `postMessage` mock 的结构性断言。 | 后续迁移时保留业务闭环断言，替换为 SDK invoker / host bridge client call log。 |
| 外部 read-only tests | 2026-05-16 07:50 按 owner handoff gate 低优先级运行 `npm test` 通过，当前为 46 tests passed。 | 只能证明当前业务测试仍绿；不能替代 SDK facade 迁移，也不能替代会重写 `dist/*` 的 `npm run verify`。 |
| 外部标准只读校验 | 2026-05-16 07:11 与 08:42 低优先级运行 `npm run validate:app && npm run readiness:app` 通过；`validate:app` 为 `ok=true / status=passed`，manifest hash 仍为 `sha256:6ec3fed5f163739bcf0fd2b845c51a8e10d28aa856e8c6f90259fdab9edd1e48`；`readiness:app` 为 `ok=true / status=needs-setup`。 | 只能证明标准 manifest 与 readiness 语义仍有效；`needs-setup` 表示宿主需补齐 required 依赖，不代表 package-side SDK facade 已完成。 |

历史结论：当时 P18.5.3 被 handoff gate 阻塞；10:55 真实 verify 后，该 blocker 已解除，当前仅剩 owner 接收写集。

2026-05-16 07:39 再次只读复核：

| 检查项 | 最新事实 | P18.5.3 判定 |
|---|---|---|
| 标准仓库 | `/Users/coso/Documents/dev/ai/limecloud/agentapp` 工作区干净，`HEAD=4bef605`。 | 标准事实源稳定；无需改标准仓库。 |
| 外部 package 状态 | `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 仍有 39 个 dirty / untracked 条目，其中 36 个 tracked modified、3 个 untracked。 | owner 仍未稳定；不接管外部源码、`dist/*` 或 package verify。 |
| Host Bridge SDK marker | `src/ui/host-bridge.js` 仍包含 `pendingRequests`、`window.parent.postMessage`、`requestHostBridge`、`capability:invoke`、`capability:subscribe`、`capability:event`，未出现 `createLimeHostBridgeCapabilityInvoker` 或 `createLimeCoreCapabilityAdapters`。 | 仍是手写 transport；SDK facade 尚未完成。 |
| UI 测试 marker | `tests/ui.test.mjs` 仍直接过滤 `message.type === 'capability:invoke'`，并模拟 `postMessage`。 | 测试仍鼓励私有 message transport；迁移时需要改成 SDK invoker / Host Bridge client call log。 |
| 本轮处理方式 | 只读复核并更新客户端计划；不改外部 package、不跑 `npm run build` / `npm run verify`。 | 符合协作分工，避免和隔壁任务打架。 |

### 2026-05-16 10:33 协作复核

本段是当前最新事实，只读运行：

```bash
node scripts/agent-app-package-handoff-check.mjs --package-dir /Users/coso/Documents/dev/ai/limecloud/content-factory-app
```

输出摘要：

```text
status=needs_handoff
dirty=tracked:36,untracked:4,total:40
hostBridgePrivate=none
hostBridgeSdk=createLimeHostBridgeCapabilityInvoker:2, createLimeCoreCapabilityAdapters:2
uiTestPrivate=none
highRiskScripts=build,verify,e2e:user-flow,e2e:user-flow:fake-model
blockers=none
nextAction=Confirm owner handoff before changing or rebuilding package artifacts.
```

判定：

| 检查项 | 当前事实 | P18.5.3 判定 |
|---|---|---|
| Source-side SDK facade | `src/ui/host-bridge.js` 已出现 `createLimeHostBridgeCapabilityInvoker` 与 `createLimeCoreCapabilityAdapters` marker。 | 迁移实现 blocker 已解除。 |
| 私有 bridge marker | `hostBridgePrivate=none`，`uiTestPrivate=none`。 | `host-bridge.js` 与 `tests/ui.test.mjs` 已不再命中 handoff gate 定义的私有 transport marker。 |
| 外部仓库状态 | 仍有 36 个 tracked modified、4 个 untracked，包含 `dist/*`、UI、docs、tests、core / integrations 等并行写集。 | 仍需 owner handoff；本任务不继续写外部 package。 |
| Package verify | `build / verify / e2e:user-flow*` 仍被 gate 标为高风险脚本，因为会重建 `dist/*`。 | 未运行；不能把 P18.5.3 视为完整完成。 |
| 当前协作动作 | 只更新 Lime 客户端 roadmap，不改外部 package，不启停外部 dev 进程，不重建 `dist/*`。 | 符合“隔壁有任务在跑”的协作边界。 |

因此 10:33 时 P18.5.3 已从 `blocked` 进入 `needs_handoff`：不再需要重新设计 source-side facade，但当时仍需确认外部 package owner 接受当前写集，再决定是否运行 `npm test` / `npm run verify`，或把 verify 缺口作为带退出条件的记录。该状态已被 10:55 真实 package verify 覆盖。

### 2026-05-16 10:41 不重建 dist 验证

为避免和隔壁任务争抢 `dist/*`，本轮只跑不触发 build 的验证：

| 命令 | 结果 | 覆盖范围 | 不能替代 |
|---|---|---|---|
| `/Users/coso/Documents/dev/ai/aiclientproxy/lime: npm test -- src/features/agent-app/sdk/publicSdkSurface.test.ts src/features/agent-app/sdk/hostBridgeClient.test.ts src/features/agent-app/sdk/contentFactorySdkRegression.test.ts src/features/agent-app/index.test.ts` | 4 files / 11 tests passed。 | Lime SDK-only public surface、Host Bridge client、内容工厂 SDK regression、feature public export seam。 | 外部 package verify。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app: npm test` | 46 tests passed。 | 外部 package 当前业务测试、Host Bridge task / stream / Host response / storage / artifact / evidence 写回。 | `dist/*` 构建产物验收与真实 Host 绑定。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app: npm run validate:app && npm run readiness:app` | `validate:app` passed，manifest hash `sha256:6ec3fed5f163739bcf0fd2b845c51a8e10d28aa856e8c6f90259fdab9edd1e48`；`readiness:app` needs-setup。 | APP manifest 标准与宿主依赖 readiness 语义。 | 会重建 `dist/*` 的 `npm run verify`。 |

结论：10:41 时 package source-side facade 和标准 manifest 处于可交接状态，但还缺真实 `dist/*` 重建；该缺口已在 10:55 真实 package verify 中收口。

### 2026-05-16 10:45 dist 重建前只读预审

只读复核 `scripts/build.mjs` 后确认，`npm run build` 会先执行 `rm('dist', { recursive: true, force: true })`，再把 `src/ui`、`src/core`、`src/integrations` 和 `src/worker/index.mjs` 复制到 `dist/*`。因此 `npm run verify` 一定会重建产物，不是纯校验。

本轮未执行 build，只用 hash 对比当前 `src -> dist` 复制结果：

| 状态 | src | dist | 说明 |
|---|---|---|---|
| diff | `src/ui/host-bridge.js` | `dist/ui/host-bridge.js` | source-side facade 已迁移，但 dist 产物仍未同步。 |
| missing-dist | `src/ui/lime-app-sdk.js` | `dist/ui/lime-app-sdk.js` | package-local SDK shim 尚未出现在 dist。 |

结论：P18.5.3 的剩余缺口不是再改业务源码，而是 owner handoff 后执行一次可接受的 dist 重建 / package verify；否则当前安装包产物不会包含 SDK facade shim。

### 2026-05-16 10:47 隔离 verify 演练

为进一步降低真实仓库重建风险，本轮把外部 package 当前工作区复制到临时目录，并用 sibling symlink 保持 `../agentapp` 标准工具相对路径可用：

```text
/tmp/limecloud-content-factory-verify.uots6S/content-factory-app
```

在临时副本执行：

```bash
nice -n 10 npm run verify
```

结果：

| 阶段 | 结果 |
|---|---|
| `npm run build` | 通过；只重建临时副本的 `dist/*`。 |
| `npm test` | 46 tests passed。 |
| `npm run validate:app` | `ok=true / status=passed`，manifest hash `sha256:6ec3fed5f163739bcf0fd2b845c51a8e10d28aa856e8c6f90259fdab9edd1e48`。 |
| `npm run readiness:app` | `ok=true / status=needs-setup`，符合宿主 required 依赖待绑定状态。 |

结论：当前 source tree 在隔离环境中已经能通过完整 package verify；该结论随后已被 10:55 真实 package verify 取代。

### 2026-05-16 10:55 真实 package verify

用户确认允许重建真实外部 package 的 `dist/*` 后，在真实仓库执行：

```bash
cd /Users/coso/Documents/dev/ai/limecloud/content-factory-app
nice -n 10 npm run verify
```

结果：

| 阶段 | 结果 |
|---|---|
| `npm run build` | 通过；真实 `dist/*` 已重建。 |
| `npm test` | 46 tests passed。 |
| `npm run validate:app` | `ok=true / status=passed`，manifest hash `sha256:6ec3fed5f163739bcf0fd2b845c51a8e10d28aa856e8c6f90259fdab9edd1e48`。 |
| `npm run readiness:app` | `ok=true / status=needs-setup`，符合宿主 required 依赖待绑定状态。 |
| Handoff gate | `status=needs_handoff`，`hostBridgePrivate=none`，`uiTestPrivate=none`，SDK marker 命中 2+2，`distArtifacts=diff:0,missing:0,extra:0,total:0`，blockers 为 `none`。 |

结论：P18.5.3 package-side SDK facade / verify / dist 同步已完成；gate 仍为 `needs_handoff` 是因为真实 package 工作区仍 dirty，且 build / verify / e2e 脚本天然会重写 dist，需要 owner 接收写集。

### 外部 package verify 风险

只读检查 `content-factory-app/package.json` 与 `scripts/build.mjs` 后确认：

| 命令 | 当前行为 | P18.5.3 执行规则 |
|---|---|---|
| `npm test` | 运行 `node --test tests/*.test.mjs`，不主动重写 `dist/*`。 | 可作为只读验证先跑。 |
| `npm run build` | 执行 `scripts/build.mjs`；脚本会 `rm('dist', { recursive: true, force: true })`，再把 `src/ui`、`src/core`、`src/integrations` 和 `src/worker/index.mjs` 复制到 `dist/*`。 | 会重写外部 package `dist/*`，owner 未稳定前不能执行。 |
| `npm run verify` | 串行执行 `npm run build && npm run test && npm run validate:app && npm run readiness:app`。 | 等同会先重写 `dist/*`；只有明确认领 package 写集或 package owner 稳定后才能跑。 |
| `npm run e2e:user-flow*` | 先 `npm run build`，再跑 Playwright 用户流。 | 同样会重写 `dist/*`，不作为 P18.5.3 owner 稳定前验证。 |

因此 P18.5.3 的安全验证顺序固定为：先 `npm test` 只读确认；完成 package-side SDK facade 且允许更新 `dist/*` 后，再跑 `npm run verify` 并把 `dist` 产物纳入同一写集。

2026-05-16 07:18 再次只读复核 `package.json` 与 `scripts/build.mjs`，脚本仍为：`verify = npm run build && npm run test && npm run validate:app && npm run readiness:app`，`e2e:user-flow*` 也会先 `npm run build`；`scripts/build.mjs` 第一刀仍是 `rm('dist', { recursive: true, force: true })`，随后从 `src/ui`、`src/core`、`src/integrations` 和 `src/worker/index.mjs` 复制到 `dist/*`。因此 owner 未稳定前继续禁止运行 `npm run verify` / `npm run build` / `npm run e2e:user-flow*`。

2026-05-16 08:40 当前会话只读复核仍一致：`npm run verify` 继续等价于 `npm run build && npm run test && npm run validate:app && npm run readiness:app`；`e2e:user-flow` 与 `e2e:user-flow:fake-model` 仍会先 `npm run build`；`scripts/build.mjs` 仍先执行 `rm('dist', { recursive: true, force: true })`，再复制 `src/ui -> dist/ui`、`src/core -> dist/core`、`src/integrations -> dist/integrations` 与 `src/worker/index.mjs -> dist/worker/index.mjs`。因此 owner 未稳定且未明确接受 `dist/*` 重建前，仍禁止运行 `npm run build`、`npm run verify` 或 `npm run e2e:user-flow*`。

2026-05-16 只读补充验证：

```bash
nice -n 10 npm run validate:app
nice -n 10 npm run readiness:app
```

结果：`validate:app` 返回 `ok=true / status=passed`，manifest hash 为 `sha256:6ec3fed5f163739bcf0fd2b845c51a8e10d28aa856e8c6f90259fdab9edd1e48`；`readiness:app` 返回 `ok=true / status=needs-setup`，符合需要宿主补齐 required skill / knowledge / tool / artifact / eval / service 的状态。该验证不替代 `npm run verify`，因为后者会先重写 `dist/*`。

2026-05-16 08:42 当前会话只读复跑 `validate:app` 与 `readiness:app`，结果仍一致：`validate:app` 为 `ok=true / status=passed`，manifest hash 仍为 `sha256:6ec3fed5f163739bcf0fd2b845c51a8e10d28aa856e8c6f90259fdab9edd1e48`；`readiness:app` 为 `ok=true / status=needs-setup`。其中 `needs-setup` 来自 required skill / knowledge / tool / artifact / eval / service 仍需 Host 绑定，不能被解释为 package-side SDK facade 已完成，也不能替代会重写 `dist/*` 的 `npm run verify`。

### 外部 tests/ui.test.mjs 迁移靶点

只读检查 `tests/ui.test.mjs` 后，P18.5.3 需要区分“业务行为断言”和“手写 transport 断言”：

| 当前测试面 | 可保留 / 需调整 | 迁移目标 |
|---|---|---|
| `UI接入 Lime Agent App Host Bridge 并跟随宿主主题` | 需调整。当前直接断言 `bridge` 文本包含 `lime.agentApp.bridge`、`app:ready`、`host:getSnapshot`、`capability:invoke`、`capability:subscribe`、`capability:event` 等 transport 字符串。 | 改为断言 package 通过 SDK-style runtime handle 暴露 ready / snapshot / theme / host action / subscription 能力，不鼓励业务文件手写 message type。 |
| `主生产流程在当前页面发起 Lime AI Agent 任务并保留本地兜底` | 大部分可保留。它验证 `runHostAgentTask`、`writeHostTaskResult`、progress event、`content_factory.*` taskKind 与本地 fallback。 | 保留业务 helper 和 App 内闭环断言；只把底层 `bridge` transport 字符串断言替换为 facade 调用断言。 |
| `Host Bridge 写回只使用 manifest 已声明的资产和证据类型` | 可保留。它约束 artifact / evidence kind 不漂移。 | 继续断言 `scene_table / content_batch / script_batch / fact_grounding / publish_readiness` 与 `APP.md` 声明一致。 |
| `Host Bridge 能在确认链后完成任务、读取事件并写回项目资产` | 可保留行为，需调整 mock。当前 `installHostBridgeWindow()` 直接模拟 `postMessage` 和 `host:response`。 | 改为模拟 SDK invoker / host bridge client，仍断言 capability call sequence：`lime.agent.startTask -> streamTask -> getTask -> submitHostResponse -> storage.set -> artifacts.create -> evidence.record`。 |
| `Host Bridge 能把主生产任务结果写回声明过的资产和证据类型` | 可保留行为，需调整 mock。当前通过 `env.posts` 读取 `capability:invoke` message。 | 改为读取 SDK invoker call log，继续断言 `lime.storage.set -> lime.artifacts.create -> lime.evidence.record`。 |

迁移测试的原则：不要删除业务闭环断言，只删除“必须手写 `postMessage` transport”这类结构性断言。P18.5.3 成功后，测试应该证明同一内容工厂行为穿过标准 SDK facade，而不是证明 package 内还存在私有 bridge 实现。

2026-05-16 07:17 再次只读复核 `tests/ui.test.mjs`，当前 Host Bridge 测试仍覆盖 5 个关键用例：主题 / snapshot 接入、manifest 声明资产与证据类型、确认链写回、主生产任务写回、workspace patch 物化；其中仍直接过滤 `message.type === 'capability:invoke'`、模拟 `postMessage`，并构造 `protocol: 'lime.agentApp.bridge'`。因此后续测试迁移仍应把 mock 从私有 message transport 改成 SDK invoker / Host Bridge client call log，而不是删除这些业务断言。

### package-side facade 兼容导出

只读检查 `src/ui/app.js` 后确认，业务 UI 当前只直接 import：

```js
import {
  initHostBridge,
  notifyHost,
  runHostAgentTask,
  syncHostConfirmation,
  writeHostTaskResult,
} from './host-bridge.js';
```

P18.5.3 迁移应优先保持这 5 个业务侧导出稳定，避免同时改 UI 主流程：

2026-05-16 07:16 再次只读复核仍一致：`src/ui/app.js` 仍只直接 import 这 5 个导出；`src/ui/host-bridge.js` 还额外导出 `requestHostDownload / invokeCapability / startHostTask / subscribeHostTask / unsubscribeHostTask / streamHostTask / getHostTask / cancelHostTask / retryHostTask / submitHostResponse` 和 bridge protocol 常量，这些可作为兼容薄 wrapper 保留，但不应继续持有私有 transport lifecycle。

| 导出 | 当前 app.js 用法 | 迁移要求 |
|---|---|---|
| `initHostBridge()` | 页面加载时初始化 Host Bridge、ready / snapshot / theme / event 监听。 | 保留初始化入口；内部改为创建 SDK client / facade，并注册 Host event handler。 |
| `notifyHost(message, level)` | 确认链成功后提示 Host。 | 保留签名；内部改为 `host.notifyHost` / SDK Host action。 |
| `runHostAgentTask(input, options)` | 主生产流程先启动 Lime Agent task，再按 stream / snapshot / Host response 驱动当前页面。 | 保留业务语义；内部改为 `lime.agent.startTask / streamTask / getTask / submitHostResponse` 与 SDK subscription。 |
| `writeHostTaskResult(...)` | 主生产任务结果写回 storage / artifact / evidence。 | 保留业务语义；内部只调用 `lime.storage / lime.artifacts / lime.evidence` facade。 |
| `syncHostConfirmation(...)` | 确认链后同步项目资产、确认状态和 evidence。 | 保留业务语义；内部复用 `runHostAgentTask` 与 typed facade 写回。 |

`startHostTask / subscribeHostTask / unsubscribeHostTask / streamHostTask / getHostTask / cancelHostTask / retryHostTask / submitHostResponse` 当前只在 `host-bridge.js` 内部或 `window.limeAgentAppBridge` 调试面暴露；P18.5.3 可以继续导出它们作为兼容薄 wrapper，但不能让它们继续维护私有 request lifecycle。

### 当前 host-bridge.js 函数级迁移映射

2026-05-16 只读盘点外部 `src/ui/host-bridge.js`，当前导出 16 个函数 / 常量面。P18.5.3 实施时优先保持业务导出名稳定，只替换底层 transport owner：

| 当前导出 / 内部职责 | 当前实现事实 | 迁移目标 | 是否保留导出 |
|---|---|---|---|
| `initHostBridge()` | 注册 `message` listener，手写 `app:ready`、`host:getSnapshot`，并把调试对象挂到 `window.limeAgentAppBridge`。 | 创建 SDK Host Bridge client / adapters，注册 snapshot、theme、visibility、capability event handler；调试对象只暴露 SDK facade handle。 | 保留。 |
| `notifyHost(message, level)` | 直接 `postMessage('host:toast')`。 | 调 SDK Host action：toast / notify。 | 保留。 |
| `requestHostDownload(url, fileName)` | 通过 `requestHostBridge('host:download')` 走私有 request lifecycle。 | 调 SDK Host action：download，由 SDK 处理 requestId / timeout / stable error。 | 可保留。 |
| `invokeCapability(capability, method, input)` | 手写 `capability:invoke` payload，并 unwrap `response.result`。 | 原则上不再作为业务主入口；如保留，只做 `createLimeHostBridgeCapabilityInvoker` 的薄 wrapper。 | 兼容保留，标记 internal。 |
| `startHostTask(input)` | `invokeCapability('lime.agent', 'startTask', input)`。 | `lime.agent.startTask(input)`。 | 兼容保留。 |
| `streamHostTask(taskId)` | `lime.agent.streamTask` 的私有 wrapper。 | `lime.agent.streamTask({ taskId })` 或标准 SDK 同名 facade。 | 兼容保留。 |
| `getHostTask(taskId)` | `lime.agent.getTask` 的私有 wrapper。 | `lime.agent.getTask({ taskId })`。 | 兼容保留。 |
| `cancelHostTask(taskId)` | `lime.agent.cancelTask` 的私有 wrapper。 | `lime.agent.cancelTask({ taskId })`。 | 兼容保留。 |
| `retryHostTask(taskId)` | `lime.agent.retryTask` 的私有 wrapper。 | `lime.agent.retryTask({ taskId })`。 | 兼容保留。 |
| `submitHostResponse(input)` | `lime.agent.submitHostResponse` 的私有 wrapper。 | `lime.agent.submitHostResponse(input)`。 | 兼容保留。 |
| `subscribeHostTask(taskId, options)` | 手写 `capability:subscribe`，传 `capability=lime.agent / topic=task / pollIntervalMs / bridgeAction`。 | SDK client `subscribeCapability` / `lime.agent.subscribeTask` 等价薄 wrapper，事件分发交给 SDK。 | 兼容保留。 |
| `unsubscribeHostTask(subscriptionId)` | 手写 `capability:unsubscribe`。 | SDK client `unsubscribeCapability`。 | 兼容保留。 |
| `runHostAgentTask(input, options)` | 业务编排：start、可选 subscribe、stream/get 轮询、Host response、unsubscribe、派发 `lime:host-agent-task-update`。 | 保留业务编排；底层只调用 `lime.agent.*` facade 与 SDK subscription，不直接使用 `requestHostBridge`。 | 必须保留。 |
| `writeHostTaskResult(...)` | 依次调用 `lime.storage.set`、`lime.artifacts.create`、`lime.evidence.record`，写内容工厂 task result。 | 保留业务语义；底层改成 `lime.storage / lime.artifacts / lime.evidence` typed facade。 | 必须保留。 |
| `syncHostConfirmation(...)` | 先 `runHostAgentTask(content_factory.confirmation_sync)`，再写 confirmation storage、artifact、publish_readiness evidence。 | 保留业务语义；底层复用 SDK facade 与 `runHostAgentTask`。 | 必须保留。 |
| `AGENT_APP_BRIDGE_PROTOCOL / VERSION` | 从 package 内常量 `lime.agentApp.bridge / 1` 导出。 | 由 SDK / Host Bridge client 提供；如保留，只作为 compatibility export，不作为业务文件手写协议依据。 | 兼容保留，后续退出。 |

函数级迁移验收：改造后 `src/ui/app.js` 的 5 个直接 import 不需要变化；`host-bridge.js` 不应再出现 `pendingRequests`、`buildMessage`、`requestHostBridge` 或业务自建 `window.parent.postMessage` lifecycle。`postMessage` 只能存在于 SDK client / shim 内，且 shim 必须有退出条件。

### 2026-05-16 08:46 迁移 dry-run 设计（未应用）

本段基于当前外部 `src/ui/host-bridge.js` 只读内容提炼，仍不接管外部 package 写集。handoff 后建议按以下最小 diff 顺序做，避免重写业务 UI：

| Step | 改动 | 退出条件 |
|---|---|---|
| 1 | 新增或切换到 `src/ui/lime-app-sdk.js` runtime factory，集中创建 `createLimeHostBridgeCapabilityInvoker + createLimeCoreCapabilityAdapters` 等价 handle。 | 业务文件不 import Lime internal path；`postMessage` 只在 SDK client / shim 内。 |
| 2 | 在 `host-bridge.js` 保留 pure helpers：`toBoundedPositiveInteger`、`waitFor`、`extractTaskEvents`、`taskEventIdentity`、`mergeTaskEvents`、`isTerminalTask`、`emitHostTaskUpdate`、`resolveHostResponseRequest`、`resolveConfirmationArtifactKind`。 | 这些 helper 不直接读写 Host Bridge transport，只服务业务编排。 |
| 3 | 删除或下沉私有 transport owner：`pendingRequests`、`buildMessage`、`sendHostBridgeMessage`、`nextRequestId`、`requestHostBridge`、`settleHostBridgeRequest`、`isHostBridgeMessage`、`handleHostBridgeMessage`。 | `host-bridge.js` 不再维护 request lifecycle、timeout、targetOrigin、stable error unwrap。 |
| 4 | `initHostBridge()` 只负责初始化 SDK runtime、注册 Host snapshot/theme/visibility/capability event handler，并把调试对象挂到 `window.limeAgentAppBridge`。 | `window.limeAgentAppBridge` 暴露 facade/debug handle，不暴露 `requestHostBridge`。 |
| 5 | `notifyHost / requestHostDownload` 改成 SDK Host action wrapper。 | 不再手写 `host:toast / host:download` message。 |
| 6 | `startHostTask / streamHostTask / getHostTask / cancelHostTask / retryHostTask / submitHostResponse` 改成 `runtime.agent.*` wrapper。 | 保留导出名；底层只走 `lime.agent` facade。 |
| 7 | `subscribeHostTask / unsubscribeHostTask` 改成 SDK subscription wrapper，并继续把 task event payload 派发成 `lime:host-agent-task-update`。 | 业务仍能收到进度事件；测试不再模拟 `postMessage` transport。 |
| 8 | `writeHostTaskResult / syncHostConfirmation` 改成 `runtime.storage / artifacts / evidence / agent` facade 调用。 | artifact / evidence kind 和 APP.md 声明保持一致。 |

不应在同一刀中改 `src/ui/app.js` 的 5 个 import、页面结构、模型生成、core/integrations/server 或 `dist/*`；`dist/*` 只在明确进入 build / verify 阶段后由 `npm run build` 生成。

## 不改范围

1. 不改内容工厂业务流程、页面结构、文案和模型生成逻辑。
2. 不改外部 package 的 `dist/*`，除非明确进入 verify / build 阶段。
3. 不改 Lime `lime-rs/*`、AgentRuntime facade、GUI smoke 脚本。
4. 不新增垂直 `content_factory_*` Lime command。
5. 不把 `content-factory-app` 迁移成依赖 Lime internal path；App package 只能依赖 SDK facade。

## 目标架构

```text
content-factory-app/src/ui/app.js
  -> package-local business helpers
  -> lime.agent / lime.storage / lime.artifacts / lime.evidence
  -> createLimeCoreCapabilityAdapters
  -> createLimeHostBridgeCapabilityInvoker
  -> lime.agentApp.bridge v1
  -> Lime AgentAppHostBridge
```

业务 helper 可以继续提供：

- `runHostAgentTask`
- `writeHostTaskResult`
- `syncHostConfirmation`
- `notifyHost`
- `requestHostDownload`

但 helper 内部不得再直接维护 `pendingRequests`、`postMessage` 信封、stable error unwrap 和 timeout；这些属于 SDK client。

## 推荐写集

等待外部 package owner 稳定后，只认领以下最小写集：

| 文件 | 动作 | 原因 |
|---|---|---|
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/src/ui/host-bridge.js` | 收敛为 SDK facade consumer。 | P18.5.3 主目标。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/src/ui/lime-app-sdk.js` 或等价 package-local shim | 仅在正式 `@lime/app-sdk` 尚未可安装时新增，暴露 `createLimeHostBridgeCapabilityInvoker + createLimeCoreCapabilityAdapters` 等价最小接口。 | 当前外部 package `dependencies / devDependencies` 为空，不能 import Lime repo 内部路径；Lime-side `src/features/agent-app/index.test.ts` 已固定 public export 面，shim 仍是临时退出条件，不是第二套长期 SDK。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/tests/ui.test.mjs` | 更新断言：从“手写 bridge 包含某些字符串”改为“调用标准 facade 并产生相同 capability call 序列”。 | 防止测试继续鼓励私有 bridge。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/package.json` | 仅在需要引入正式 SDK package / 本地 workspace alias 时修改。 | 避免未声明依赖。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/dist/ui/*` | 只在明确运行 build / verify 后更新。 | 避免和隔壁 dist 产物打架。 |

不推荐同时修改 docs、core、model-generation、server API、样式或业务页面，除非它们直接阻塞迁移测试。

## Owner handoff gate

只有满足以下任一条件，才允许从“只读计划”进入“外部 package 写入实施”：

1. 外部 package owner 明确交接 P18.5.3 写集，或用户明确指定本任务接管外部 `content-factory-app` 最小写集。
2. `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 的 relevant 写集稳定：`src/ui/host-bridge.js`、`tests/ui.test.mjs`、`package.json`、`dist/ui/*` 没有新的未知改动，且当前 dirty 状态可归因。
3. 允许进入 verify / build 阶段时，必须同时接受 `dist/*` 会被 `scripts/build.mjs` 删除并重建。

接管前必须先记录：

```bash
git -C /Users/coso/Documents/dev/ai/limecloud/content-factory-app status --short
rg -n "pendingRequests|requestHostBridge|buildMessage|postMessage|createLimeHostBridgeCapabilityInvoker|createLimeCoreCapabilityAdapters|capability:invoke|capability:subscribe|capability:event" /Users/coso/Documents/dev/ai/limecloud/content-factory-app/src/ui/host-bridge.js /Users/coso/Documents/dev/ai/limecloud/content-factory-app/tests/ui.test.mjs
cd /Users/coso/Documents/dev/ai/limecloud/content-factory-app && nice -n 10 npm test
```

以下 07:50 - 09:39 为迁移前历史 gate 记录，用来追溯为什么需要 owner handoff；当前事实以 10:33 `status=needs_handoff` 为准。

2026-05-16 07:50 按 handoff gate 只读复核结果：

| 检查项 | 结果 | Gate 判定 |
|---|---|---|
| `git status --short` | 仍有 39 个 dirty / untracked 条目，其中 `src/ui/host-bridge.js` 与 `dist/ui/host-bridge.js` 仍未跟踪。 | 不满足 owner 稳定条件。 |
| 私有 bridge marker | `src/ui/host-bridge.js` 仍包含 `pendingRequests / buildMessage / window.parent.postMessage / requestHostBridge / capability:invoke / capability:subscribe / capability:event`；`tests/ui.test.mjs` 仍直接过滤 `message.type === 'capability:invoke'` 并模拟 `postMessage`。 | SDK facade 尚未完成。 |
| 外部 `npm test` | 46 tests passed。 | 只读测试绿；不能替代 package-side SDK facade / verify。 |

2026-05-16 08:19 当前会话再次按 handoff gate 只读复核：

| 检查项 | 结果 | Gate 判定 |
|---|---|---|
| 标准仓库 | `/Users/coso/Documents/dev/ai/limecloud/agentapp` 工作区干净，`HEAD=4bef605 fix: quote mermaid sdk labels`；标准资料继续固定 Agent App 是完整应用包、Expert 只是 `expert-chat` entry、能力调用走 `@lime/app-sdk` / Capability SDK。 | 标准事实源稳定；不需要改标准仓库。 |
| 外部 package 状态 | `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 仍有 39 个 dirty / untracked 条目，其中 36 个 tracked modified、3 个 untracked；`src/ui/host-bridge.js` 与 `dist/ui/host-bridge.js` 仍未跟踪。 | 不满足 owner 稳定条件；继续只读。 |
| 私有 bridge marker | `src/ui/host-bridge.js` 仍包含 `pendingRequests / buildMessage / window.parent.postMessage / requestHostBridge / capability:invoke / capability:subscribe / capability:event`，未出现 `createLimeHostBridgeCapabilityInvoker` 或 `createLimeCoreCapabilityAdapters`；`tests/ui.test.mjs` 仍直接过滤 `message.type === 'capability:invoke'` 并模拟 `postMessage`。 | SDK facade 尚未完成。 |
| 外部 `npm test` | 2026-05-16 08:19 低优先级只读运行，46 tests passed。 | 只读业务测试仍绿；不能替代 package-side SDK facade / verify。 |
| Lime-side SDK seam | 2026-05-16 08:19 低优先级运行 `npm test -- src/features/agent-app/sdk/hostBridgeClient.test.ts src/features/agent-app/sdk/contentFactorySdkRegression.test.ts src/features/agent-app/index.test.ts`，3 files / 8 tests passed。 | Lime-side Host Bridge SDK client、内容工厂 SDK regression 与 public SDK export seam 当前仍绿；不等于外部 package 已迁移。 |

2026-05-16 08:35 当前会话只读复核：

| 检查项 | 结果 | Gate 判定 |
|---|---|---|
| 外部 package 状态 | 仍有 39 个 dirty / untracked 条目，包含 `src/ui/host-bridge.js`、`dist/ui/host-bridge.js`、`src/ui/app.js`、`tests/ui.test.mjs`、`package.json`、`dist/*`、docs、model-generation 与 server / tests 改动。 | owner 仍未稳定；不进入外部写入。 |
| 私有 bridge marker | `src/ui/host-bridge.js` 仍包含 `pendingRequests / buildMessage / window.parent.postMessage / requestHostBridge / capability:invoke / capability:subscribe / capability:event`；`tests/ui.test.mjs` 仍直接过滤 `message.type === 'capability:invoke'` 并模拟 `postMessage`。 | SDK facade 仍未完成。 |
| SDK marker | 未出现 `createLimeHostBridgeCapabilityInvoker` 或 `createLimeCoreCapabilityAdapters`。 | package-side 仍不是标准 SDK facade consumer。 |
| 本轮处理方式 | 只读复核，不跑 `npm run build` / `npm run verify`，不改外部源码或 `dist/*`。 | 符合 owner handoff gate。 |

2026-05-16 09:09 当前会话补充复核：

| 检查项 | 结果 | Gate 判定 |
|---|---|---|
| 外部 package 状态 | 仍有 36 个 tracked modified、3 个 untracked；`src/ui/host-bridge.js` 与 `dist/ui/host-bridge.js` 仍未跟踪。 | owner 仍未稳定；继续只读。 |
| 外部 `npm test` | 2026-05-16 09:05 低优先级只读运行，46 tests passed。 | 只读业务测试仍绿；仍在私有 bridge transport 上通过，不能替代 SDK facade / verify。 |
| 外部标准校验 | 2026-05-16 09:06 低优先级运行 `npm run validate:app && npm run readiness:app`；`validate:app` passed，manifest hash 为 `sha256:6ec3fed5f163739bcf0fd2b845c51a8e10d28aa856e8c6f90259fdab9edd1e48`；`readiness:app` needs-setup。 | 标准 manifest 可读，readiness 正确等待 Host 绑定 required 依赖；不能替代会重建 `dist/*` 的 `npm run verify`。 |
| Lime-side 回归 | 2026-05-16 09:09 `npm test -- src/features/agent-app`，35 files / 173 tests passed；09:04 `typecheck` 与 `test:contracts` 均通过。 | Lime-side 当前绿；不等于外部 package 已迁移。 |
| SDK facade marker | 2026-05-16 09:22 只读复核：`src/ui/host-bridge.js` 当时包含 `pendingRequests / buildMessage / window.parent.postMessage / requestHostBridge / capability:invoke / capability:subscribe / capability:event`；`tests/ui.test.mjs` 当时直接过滤 `message.type === 'capability:invoke'`。 | 历史 blocker；已被 10:55 真实 verify 和 handoff gate `blockers=none` 覆盖。 |

2026-05-16 09:39 只读复核补充：

| 检查项 | 结果 | Gate 判定 |
|---|---|---|
| 外部 package 状态 | 仍有 36 个 tracked modified、3 个 untracked；`src/ui/host-bridge.js` 与 `dist/ui/host-bridge.js` 仍未跟踪。 | owner 未稳定；不能把当前 package 当作可接管写集。 |
| 外部私有 bridge marker | `src/ui/host-bridge.js` 仍命中 `pendingRequests / buildMessage / window.parent.postMessage / requestHostBridge / capability:invoke / capability:subscribe / capability:event`；`tests/ui.test.mjs` 仍直接按 `message.type === 'capability:invoke'` 过滤 / 模拟。 | package-side SDK facade 仍未实施。 |
| 外部 `npm test` | 低优先级只读重跑，46 tests passed。 | 只证明当前业务测试仍绿；测试仍基于私有 bridge transport。 |
| Lime-side SDK seam | 低优先级重跑 `npm test -- src/features/agent-app/sdk/hostBridgeClient.test.ts src/features/agent-app/sdk/contentFactorySdkRegression.test.ts src/features/agent-app/index.test.ts`，3 files / 8 tests passed；`src/features/agent-app` 越界扫描无输出。 | Lime SDK target 仍可用；仍不能替代外部 package 迁移。 |
| 运行面 | 当前未再发现 cwd 在 `content-factory-app` 的 `npm run dev` 进程，但 Lime Vite 与 `tauri:dev:headless` 仍在。 | 进程空闲不是 handoff；未获明确接管前继续只读。 |
| 机械 handoff gate | 新增 `scripts/agent-app-package-handoff-check.mjs` 与 core unit tests；对当前外部 package 只读运行输出 `status=blocked`、dirty `tracked:36 / untracked:3`、hostBridge SDK marker `none`、highRiskScripts `build / verify / e2e:user-flow / e2e:user-flow:fake-model`。 | 后续 owner 接管前可用同一脚本复核；当前仍不能执行 package-side 迁移。 |

2026-05-16 10:33 gate 已覆盖上述历史状态：当前输出为 `status=needs_handoff`，私有 marker 为 `none`，SDK marker 已出现，blockers 为 `none`；后续不再执行 source-side 迁移，只处理 owner handoff、package verify 与 `dist/*` 验收。

实施中如果出现以下任一情况，立即停止并回到只读审计：

| 停止条件 | 原因 | 处理方式 |
|---|---|---|
| `git status --short` 出现新的外部改动，且不属于推荐写集。 | 可能是隔壁任务继续写入。 | 不覆盖；先记录并请求 owner 交接。 |
| 需要修改 `src/core/*`、`src/integrations/*`、`src/server/*`、docs 或样式才能让测试过。 | 已超出 SDK facade seam，可能变成业务重写。 | 停止，把阻塞原因写回本计划。 |
| 测试只能通过保留 `pendingRequests / requestHostBridge / postMessage` 私有 transport。 | 与 P18.5.3 目标冲突。 | 停止，补 SDK seam 或回退。 |
| `npm run verify` 前未确认可重写 `dist/*`。 | build 会删除并重建 dist，容易覆盖隔壁产物。 | 只跑 `npm test`，不跑 verify。 |
| 发现正式 `@lime/app-sdk` 可安装方式和 package-local shim 设计冲突。 | 可能会形成第二套 SDK。 | 优先正式 SDK；shim 只保留临时退出条件。 |

接管后的验证顺序固定为：

1. 外部 package：`nice -n 10 npm test`。
2. 外部 package：确认允许更新 `dist/*` 后，运行 `nice -n 10 npm run verify`。
3. Lime repo：P18 SDK / Host Bridge 定向 tests。
4. Lime repo：`npm run typecheck -- --pretty false` 与 `npm run test:contracts`。
5. Lime repo：根据改动范围决定是否重跑完整 `npm run verify:local`。
6. 回填 `internal/roadmap/agentapp/p18-5-content-factory-sdk-regression.md`、`internal/roadmap/agentapp/p18-completion-audit.md` 和本计划。

## Package-local shim 实现草图（未应用）

本草图只用于后续 owner handoff 后实施，不直接写入外部 package。若正式 `@lime/app-sdk` 已可安装，应优先删除 shim，改为从正式包 import。

```js
// src/ui/lime-app-sdk.js
export {
  LIME_AGENT_APP_BRIDGE_PROTOCOL,
  LIME_AGENT_APP_BRIDGE_VERSION,
  createLimeCoreCapabilityAdapters,
  createLimeHostBridgeCapabilityInvoker,
} from '@lime/app-sdk';
```

若 P18.5.3 执行时正式包仍不可安装，package-local shim 只能临时镜像以下最小 API：

```js
// src/ui/lime-app-sdk.js，伪代码；临时退出条件：正式 @lime/app-sdk 可安装后删除。
export const LIME_AGENT_APP_BRIDGE_PROTOCOL = 'lime.agentApp.bridge';
export const LIME_AGENT_APP_BRIDGE_VERSION = 1;

export function createContentFactoryLimeRuntime({ appId, entryKey, storageNamespace }) {
  const invoker = createHostBridgeInvoker({ appId, entryKey });
  return createCoreCapabilityAdapters({ invoker, storageNamespace });
}
```

`createHostBridgeInvoker / createCoreCapabilityAdapters` 是 package-local shim 内对 `createLimeHostBridgeCapabilityInvoker / createLimeCoreCapabilityAdapters` 的最小等价实现；不得扩展出新的长期 SDK 语义。

2026-05-16 08:37 只读复核 Lime repo SDK 发布边界：根 `package.json` 仍为 private 桌面 App 包，`packages/` 下只有 `packages/lime-cli-npm`，未发现独立 `@lime/app-sdk` / `lime-app-sdk` package。P18.5.3 不能把外部 App 指向 `src/features/agent-app/*` 深路径；如果 owner handoff 时正式 SDK package 仍不可安装，package-local shim 是允许的临时手段，但必须保持退出条件：正式 SDK package 可安装后删除 shim，改为从正式包 import。

`src/ui/host-bridge.js` 迁移后的结构应收敛为：

```js
import { createContentFactoryLimeRuntime } from './lime-app-sdk.js';

let runtime;

function getRuntime() {
  if (!runtime) {
    runtime = createContentFactoryLimeRuntime({
      appId: 'content-factory-app',
      entryKey: 'dashboard',
      storageNamespace: 'content-factory-app',
    });
  }
  return runtime;
}

export function startHostTask(input, options) {
  return getRuntime().agent.startTask(input, options);
}

export async function writeHostTaskResult(input) {
  const lime = getRuntime();
  const storageEntry = await lime.storage.set({ key: input.storageKey, value: input.content });
  const artifact = await lime.artifacts.create({ kind: input.kind, title: input.title, content: input.content });
  const evidence = await lime.evidence.record({ kind: input.evidenceKind, message: input.message, refs: input.refs });
  return { storageEntry, artifact, evidence };
}
```

草图验收重点不是逐字照抄，而是保证最终外部 `host-bridge.js` 不再拥有 `pendingRequests / requestHostBridge / buildMessage / window.parent.postMessage` lifecycle；这些只能存在于正式 SDK client 或带退出条件的 shim 内。

## 迁移步骤

1. **Owner 稳定确认**：外部 package dirty 状态收敛，或用户明确指定本任务认领外部 package 写集。
2. **先备份当前行为**：只读记录当前 `tests/ui.test.mjs` 中 Host Bridge 相关断言和当前 `npm test` 结果。
3. **引入 SDK facade seam**：
   - 如果已有可安装 `@lime/app-sdk`，从 SDK package import。
   - 如果还没有发布包，先用 package-local shim 只暴露与 `createLimeHostBridgeCapabilityInvoker + createLimeCoreCapabilityAdapters` 等价的最小接口，并在文档中标记退出条件。
4. **改写 transport 层**：
   - 删除或下沉 `pendingRequests` / `requestHostBridge` / `invokeCapability` 的私有实现。
   - 用标准 invoker 负责 requestId、targetOrigin、trusted origin、timeout 和 `host:error` unwrap。
   - 用 SDK client 负责 `app:ready`、snapshot、theme、visibility、toast、navigate、openExternal 和 download。
5. **保留业务 helper**：
   - `runHostAgentTask` 继续编排 start / stream / get / submitHostResponse。
   - `writeHostTaskResult` 继续写 storage / artifact / evidence。
   - `syncHostConfirmation` 继续保留内容工厂确认链语义。
   - task update 订阅继续可用，但必须通过 SDK client 的 subscription API 注册，不直接监听 `capability:event`。
6. **更新测试**：
   - 断言 capability call sequence 不变。
   - 断言不再直接依赖私有 `requestHostBridge` / `pendingRequests` 字符串。
   - 断言 artifact kind / evidence kind 仍只使用 manifest 声明类型。
7. **运行验证**：
   - 先 `npm test`。
   - 如果允许重写 `dist/`，再 `npm run verify`。
   - 回到 Lime repo 跑 P18 SDK / Host Bridge regression。

## 验收清单

| 要求 | 验收证据 |
|---|---|
| 外部 App 不再手写 Host Bridge transport。 | `src/ui/host-bridge.js` 不再自建 `pendingRequests` / `requestHostBridge` / `buildMessage` 这类 transport 细节。 |
| Host 初始化和主题同步不再手写 window message。 | tests 断言 ready / snapshot / theme / visibility 通过 SDK client 完成。 |
| Host action 不再手写 message。 | tests 断言 `host:toast / host:navigate / host:openExternal / host:download` 通过 SDK client Host action API 完成。 |
| 内容工厂业务 helper 保留。 | `runHostAgentTask / writeHostTaskResult / syncHostConfirmation` 仍存在或由等价模块提供。 |
| Capability 调用序列不变。 | tests 仍断言 `lime.agent.startTask -> streamTask -> getTask -> submitHostResponse -> storage.set -> artifacts.create -> evidence.record`。 |
| 订阅事件不再手写 transport。 | tests 断言 `capability:subscribe / capability:event / capability:unsubscribe` 通过 SDK client subscription API 完成。 |
| Artifact / Evidence 类型不漂移。 | tests 仍断言 `content_batch / fact_grounding / publish_readiness` 等 manifest 声明类型。 |
| Package read-only tests 通过。 | 外部 `npm test` 通过。 |
| Package verify 通过。 | 外部 `npm run verify` 通过；仅在 owner 允许更新 `dist/` 时执行。 |
| Lime-side regression 通过。 | Lime P18 SDK / Host Bridge tests、typecheck、diff check 通过。 |

## 回滚点

如果外部迁移失败，只需要回滚外部 package 的 P18.5.3 写集；Lime-side `hostBridgeClient.ts`、`hostBridgeClient.test.ts` 和本计划仍可保留，因为它们是标准 SDK client 的独立 contract evidence，不依赖内容工厂 package 的改造进度。

## 完成判定

P18.5.3 只有在以下全部成立时才能标记完成：

1. 外部 `src/ui/host-bridge.js` 已收敛为 SDK facade consumer。
2. 外部 `npm test` 通过。
3. 外部 `npm run verify` 通过，或明确记录未运行原因和退出条件。
4. Lime P18 SDK / Host Bridge regression 通过。
5. `internal/roadmap/agentapp/p18-5-content-factory-sdk-regression.md` 与 `internal/roadmap/agentapp/p18-completion-audit.md` 回填最新证据。
