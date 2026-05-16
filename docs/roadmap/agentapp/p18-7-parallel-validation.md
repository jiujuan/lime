# Agent App P18.7 并行验证记录

更新时间：2026-05-16

## 主目标

推进 `docs/roadmap/agentapp/p18-7-full-lime-capability-surface.md` 中的 P18.7：先完成 P18.7-B 的 Agent App `manifestVersion: 0.6.0` 标准兼容、layered manifest 和 reference cross-check 复绿，再完成 P18.7-C `lime.capabilities` Host discovery surface、P18.7-D AgentRuntime resource projection，并继续进入 P18.7-E Tool / Integration 受控 intent 与只读运行投影。

## 并行写集

| 归属 | 写集 | 当前处理 |
| --- | --- | --- |
| 隔壁进程 | `src-tauri/**`、外部 `content-factory-app`、未确认摘要 `docs/roadmap/agentapp/lime-capability-surface.md` | 只读审阅和验证；不接管外部 App / Rust / default skills 并行写集，不合并未确认摘要。 |
| 前序本进程 | `AGENTS.md`、`docs/aiprompts/README.md`、`docs/aiprompts/parallel-agent-collaboration.md`、`src/features/agent-app/**`、本文档 | 已记录并行协作规则、P18.7-B/C/D/E first-cut 和 GUI 主路径验证证据。 |
| 2026-05-16 23:35 follow-up | `scripts/agent-apps-smoke.mjs`、`docs/roadmap/agentapp/p18-7-parallel-validation.md`、`docs/roadmap/agentapp/p18-7-full-lime-capability-surface.md` | 只修可选内容工厂真实按钮 E2E gate 的等待 / 断言与对应证据记录。 |

## 已验证

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `git diff --check` / `git diff --no-index --check`（scoped） | passed | 当前本进程写集含未跟踪 `capabilityCatalog.ts` / `p18-7-parallel-validation.md` 无空白 diff 问题。 |
| `npm test -- "src/features/agent-app/manifest/parseManifest.test.ts" "src/features/agent-app/schema/referenceCliCrossCheck.test.ts"` | passed | 覆盖 v0.6 manifest normalization、layered manifest、reference projection/readiness cross-check。 |
| `npm test -- "src/features/agent-app/readiness/checkReadiness.test.ts" "src/features/agent-app/sdk/capabilityContract.test.ts" "src/features/agent-app/sdk/capabilityAdapters.test.ts" "src/features/agent-app/sdk/publicSdkSurface.test.ts"` | passed | 覆盖 readiness、capability catalog、typed SDK adapter 和公开 SDK surface。 |
| `npm test -- "src/features/agent-app"` | passed | 36 files / 182 tests passed，覆盖 Agent App 定向套件。 |
| `npm run typecheck` | passed | 前端 TypeScript 边界通过。 |
| `npm run test:contracts` | passed | 命令契约、Harness 契约、modality runtime contract、cleanup report contract 均通过。 |
| `npm run governance:legacy-report` | passed | 边界违规 0；报告仍有既有分类漂移候选，但不阻塞本轮 P18.7-B。 |
| `npm run verify:gui-smoke` | passed | 2026-05-16 19:55 在 `AgentAppRuntimePage.tsx` 接入 `lime.capabilities` 后重跑完成；Headless Tauri、DevBridge、workspace ready、browser runtime、site adapters、Agent Apps、Claw streaming、Knowledge GUI、Design Canvas 等最小 GUI smoke 通过。 |
| `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts" "src/features/agent-app/runtime/hostBridge.test.ts" "src/features/agent-app/sdk/capabilityAdapters.test.ts"` | passed | 覆盖 P18.7-C `lime.capabilities.list/get/getProfile` Host discovery、Host Bridge 分发和 SDK adapter。 |
| `npm test -- "src/features/agent-app/ui/AgentAppRuntimePage.test.tsx" "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` | passed | 2 files / 16 tests passed；覆盖 Agent App Runtime Page 在 snapshot 中声明 `lime.capabilities`，并允许 iframe 通过 `lime.capabilities.getProfile` 读取 Host capability profile。 |
| `npm test -- "src/features/agent-app"` | passed | 36 files / 184 tests passed，新增 Runtime Page `lime.capabilities.getProfile` 回归后 Agent App 定向套件通过。 |
| `npm run typecheck` | passed | P18.7-C discovery 类型边界通过。 |
| `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts" "src/features/agent-app/ui/AgentAppRuntimePage.test.tsx" "src/features/agent-app/sdk/capabilityContract.test.ts" "src/features/agent-app/sdk/capabilityAdapters.test.ts"` | passed | 4 files / 26 tests passed；覆盖 `lime.models.list/getRouting`、`lime.usage.getTokenUsage/getCostSummary`、manifest 声明边界、catalog/profile/adapter 同步。 |
| `npm test -- "src/features/agent-app"` | passed | 36 files / 186 tests passed，新增 P18.7-D runtime resource projection 回归后 Agent App 定向套件通过。 |
| `npm run typecheck` | passed | P18.7-D `lime.models` / `lime.usage` runtime projection 类型边界通过。 |
| `npm run test:contracts` | passed | 命令契约、Harness 契约、modality runtime contract、cleanup report contract 复核通过；本轮未新增 Tauri 命令。 |
| `npm run verify:gui-smoke` | passed | 2026-05-16 20:23 在 `lime.models` / `lime.usage` Host Bridge 接入后重跑完成；Headless Tauri、DevBridge、workspace ready、browser runtime、site adapters、Agent Apps、Claw streaming、Knowledge GUI、Design Canvas 等最小 GUI smoke 通过。 |
| `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts" "src/features/agent-app/ui/AgentAppRuntimePage.test.tsx" "src/features/agent-app/sdk/capabilityContract.test.ts" "src/features/agent-app/sdk/capabilityAdapters.test.ts"` | passed | 4 files / 27 tests passed；覆盖 `lime.skills.list/resolve/getInvocation` 从 `runtimeProcess.skillNames/invokedSkillNames` 投影，并确认 `bind` 不伪造成功。 |
| `npm test -- "src/features/agent-app"` | passed | 36 files / 187 tests passed，新增 P18.7-D `lime.skills` runtime projection 回归后 Agent App 定向套件通过。 |
| `npm run typecheck` | passed | P18.7-D `lime.skills` runtime projection 类型边界通过。 |
| `npm run test:contracts` | passed | 命令契约、Harness 契约、modality runtime contract、cleanup report contract 复核通过；本轮仍未新增 Tauri 命令。 |
| `npm run verify:gui-smoke` | passed | 2026-05-16 20:45 在 `lime.skills` Host Bridge 接入后重跑完成；Headless Tauri、DevBridge、workspace ready、browser runtime、site adapters、Agent Apps、Claw streaming、Knowledge GUI、Design Canvas 等最小 GUI smoke 通过。 |
| `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts" "src/features/agent-app/ui/AgentAppRuntimePage.test.tsx" "src/features/agent-app/sdk/capabilityContract.test.ts" "src/features/agent-app/sdk/capabilityAdapters.test.ts"` | passed | 4 files / 28 tests passed；覆盖 `lime.memory.getStatus/query`、`lime.context.getSnapshot` 的只读 projection，并确认 `write/compact/attach/detach` 不伪造成功。 |
| `npm test -- "src/features/agent-app"` | passed | 36 files / 188 tests passed，新增 P18.7-D `lime.memory` / `lime.context` runtime projection 回归后 Agent App 定向套件通过。 |
| `npm run typecheck` | passed | P18.7-D `lime.memory` / `lime.context` runtime projection 类型边界通过。 |
| `npm run test:contracts` | passed | 命令契约、Harness 契约、modality runtime contract、cleanup report contract 复核通过；本轮仍未新增 Tauri 命令。 |
| `npm run verify:gui-smoke` | passed | 2026-05-16 21:01 在 `lime.memory` / `lime.context` Host Bridge 接入后重跑完成；Headless Tauri、DevBridge、workspace ready、browser runtime、site adapters、Agent Apps、Claw streaming、Knowledge GUI、Design Canvas 等最小 GUI smoke 通过。 |
| `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts" "src/features/agent-app/ui/AgentAppRuntimePage.test.tsx" "src/features/agent-app/sdk/capabilityContract.test.ts" "src/features/agent-app/sdk/capabilityAdapters.test.ts"` | passed | 4 files / 29 tests passed；覆盖 P18.7-E `lime.search.query/getRun`、`lime.browser.open`、`lime.documents.parse`、`lime.media.generateImage` 的 Host 侧受控 intent 与 runtime tool projection。 |
| `npm test -- "src/features/agent-app"` | passed | 36 files / 189 tests passed，新增 P18.7-E search/browser/documents first-cut 回归后 Agent App 定向套件通过。 |
| `npm run typecheck` | passed | P18.7-E `lime.search` / `lime.browser` / `lime.documents` Host Bridge 类型边界通过。 |
| `npm run test:contracts` | passed | 命令契约、Harness 契约、modality runtime contract、cleanup report contract 复核通过；本轮未新增 Tauri 命令。 |
| `npm run verify:gui-smoke` | passed | 2026-05-16 21:26 在 `lime.search` / `lime.browser` / `lime.documents` Host Bridge 接入后重跑完成；Headless Tauri、DevBridge、workspace ready、browser runtime、site adapters、Agent Apps、Claw streaming、Knowledge GUI、Design Canvas 等最小 GUI smoke 通过。 |
| `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts" "src/features/agent-app/ui/AgentAppRuntimePage.test.tsx" "src/features/agent-app/sdk/capabilityContract.test.ts" "src/features/agent-app/sdk/capabilityAdapters.test.ts"` | passed | 4 files / 29 tests passed；复核 P18.7-E `lime.media` first-cut：`generateImage` 返回受控 `requires_agent_task` intent，profile / Runtime Page 均暴露 `lime.media` adapter。 |
| `npm test -- "src/features/agent-app"` | passed | 36 files / 189 tests passed，新增 P18.7-E `lime.media` Host first-cut 后 Agent App 定向套件通过。 |
| `npm run typecheck` | passed | P18.7-E `lime.media` Host Bridge 类型边界通过。 |
| `npm run test:contracts` | passed | 命令契约、Harness 契约、modality runtime contract、cleanup report contract 复核通过；本轮未新增 Tauri 命令。 |
| `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts" "src/features/agent-app/ui/AgentAppRuntimePage.test.tsx" "src/features/agent-app/sdk/capabilityContract.test.ts" "src/features/agent-app/sdk/capabilityAdapters.test.ts"` | passed | 4 files / 29 tests passed；覆盖 P18.7-E `lime.mcp.listServers/invoke`、`lime.terminal.run/getRun/cancel`，确认二者只返回受控 intent / 只读投影 / not_available cancellation。 |
| `npm test -- "src/features/agent-app"` | passed | 37 files / 193 tests passed；在隔壁新增 `agentRuntimeProcess.test.ts` 与 v0.6 manifest 测试后，Agent App 定向套件整体通过。 |
| `npm run typecheck` | passed | P18.7-E `lime.mcp` / `lime.terminal` Host Bridge 类型边界通过。 |
| `npm run test:contracts` | passed | 命令契约、Harness 契约、modality runtime contract、cleanup report contract 复核通过；本轮仍未新增 Tauri 命令。 |
| `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts" "src/features/agent-app/ui/AgentAppRuntimePage.test.tsx" "src/features/agent-app/sdk/capabilityContract.test.ts" "src/features/agent-app/sdk/capabilityAdapters.test.ts"` | passed | 4 files / 29 tests passed；覆盖 P18.7-E `lime.connectors.list/getStatus/requestAuth/invoke`，确认外部连接器只返回只读投影、Host 授权需求或受控 intent。 |
| `npm test -- "src/features/agent-app"` | passed | 37 files / 193 tests passed；新增 `lime.connectors` Host first-cut 后 Agent App 定向套件整体通过。 |
| `npm run lint` | passed | ESLint `src --max-warnings 0` 通过。 |
| `npm run typecheck` | passed | P18.7-E `lime.connectors` Host Bridge 类型边界通过。 |
| `npm run test:contracts` | passed | 命令契约、Harness 契约、modality runtime contract、cleanup report contract 复核通过；本轮仍未新增 Tauri 命令。 |
| `node --check "scripts/agent-apps-smoke.mjs"` | passed | `smoke:agent-apps` failure diagnostics 脚本语法通过；后续失败会写 `*-failure.json` / `*-failure.png`，便于定位 Runtime 打开链路。 |
| `npm run smoke:agent-apps -- --app-url http://127.0.0.1:9/ --health-url http://127.0.0.1:3030/health --timeout-ms 1000 --interval-ms 100 --prefix agent-apps-smoke-diagnostics-selftest` | expected failure with diagnostics | 使用无效 app URL 触发早期失败，确认已落 `.lime/qc/gui-evidence/agent-apps/agent-apps-smoke-diagnostics-selftest-failure.json` 与 `*-failure.png`；JSON 覆盖 pageState、bridgeHealth、runtimeStatus、consoleErrors、failedRequests。 |
| `npm run smoke:agent-apps -- --app-url http://127.0.0.1:9/ --health-url http://127.0.0.1:3039/health --timeout-ms 1000 --interval-ms 100 --prefix agent-apps-smoke-diagnostics-process-selftest` | expected failure with diagnostics | 使用本命令内临时 fake DevBridge 和无效 app URL 触发早期失败，不触碰外部 `content-factory-app` dev server；确认 failure JSON 新增 `processSnapshot`，包含平台、进程总数、cwd 探测数量、匹配进程和 match reason。 |
| `npm run bridge:health -- --timeout-ms 15000` | passed | 2026-05-16 23:00 DevBridge 恢复 ready，`http://127.0.0.1:3030/health` 返回 `status=ok`。 |
| `npm run smoke:agent-apps -- --timeout-ms 180000 --prefix agent-apps-smoke-p18-7-refocus` | passed | focused Agent Apps smoke 通过；`agent_app_start_ui_runtime` 可打开 Runtime surface，summary 证明 install / disable-enable / launch / uninstall dry-run / flag-off regression 均为 true。 |
| `npm run verify:gui-smoke` | passed | 2026-05-16 23:05 完整 GUI smoke 通过；覆盖 workspace ready、browser runtime、site adapters、Skill Forge entry、runtime tool surface、runtime surface page、`@` command registry、Agent Apps、Claw streaming、Knowledge GUI、Design Canvas。 |
| `npm run smoke:agent-apps -- --timeout-ms 180000 --prefix agent-apps-smoke-p18-7-runtime-frame-profile` | passed | 增强后的 Agent Apps smoke 通过；除 Runtime frame 可见外，还断言 iframe 内内容工厂已加载并展示 Host capability profile/运行事实提示，summary 中 `runtimeFrameContentFactoryLoaded=true`、`runtimeFrameHostProfileVisible=true`。 |
| `npm run smoke:agent-apps -- --timeout-ms 180000 --prefix agent-apps-smoke-p18-7-content-action-e2e --include-content-factory-action-e2e` | failed at deep gate | 新增可选深水位 E2E：iframe 内点击“知识库底座 -> 整理知识库”，已观察到 App 发出 `lime.agent.startTask` 并展示运行现场；failure JSON 后续复盘证明 task id 已出现在 SDK call log，但 host task record 顶层未携带 task id。 |
| `node --check "scripts/agent-apps-smoke.mjs"` | passed | 修正可选 gate 等待逻辑后，脚本语法通过。 |
| `npm run smoke:agent-apps -- --timeout-ms 180000 --prefix agent-apps-smoke-p18-7-content-action-e2e-fixed5 --include-content-factory-action-e2e` | passed | 最小真实按钮 E2E 通过；iframe 内“知识库底座 -> 整理知识库”发出 `lime.agent.startTask`，从 task-scoped host run record 确认 Host task id / runtimeFacts container / required Skills 投影，且已触发 `lime.models.getRouting`、`lime.usage.getTokenUsage/getCostSummary`、`lime.skills.list`、`lime.agent.streamTask`，无 Host fallback。 |
| `npm run smoke:agent-apps -- --timeout-ms 180000 --prefix agent-apps-smoke-p18-7-completion-gate-current --include-content-factory-completion-e2e --completion-timeout-ms 30000` | expected failure | 新增完成态可选 gate；30s 内未达到完成态，failure JSON 显示 `modelReady=false / usageReady=false / costReady=false / skillInvocationReady=false / artifactReady=false / evidenceReady=false`，但 `workspacePatchReady=true`。 |
| `agent_runtime_get_thread_read` / `agent_runtime_get_session` for `agent-app-runtime-1afdd73f-7bb9-4bfb-9204-3268fa08930d` | diagnostic | DevBridge 返回 idle、queued_turns=0、turns=0、messages=0；证明 completion gate 失败不是页面单纯没等够。 |
| `git diff --check -- "scripts/agent-apps-smoke.mjs"` | passed | 本轮脚本补丁无空白 diff 问题。 |
| `npm run smoke:agent-apps -- --timeout-ms 180000 --prefix agent-apps-smoke-p18-7-default-after-action-gate-fixed4` | passed | 复核默认 Agent Apps smoke 未被可选深水位 gate 影响；默认 install / launch / iframe profile / uninstall dry-run / flag-off 仍通过。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app`: `npm test` | passed | 外部内容工厂 56 tests passed；覆盖 Host Bridge 调用 `lime.capabilities.getProfile`、`lime.models.getRouting`、`lime.usage.getTokenUsage/getCostSummary`、`lime.skills.list`，以及主生产按钮 Host connected 时只走 `lime.agent.startTask`、运行过程/Skill/Token/费用展示和 workspace patch 写回。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app`: `npm run validate:app` | passed | reference CLI validate 返回 `ok=true / status=passed`，manifest hash `sha256:22d23772240c038ffe27b58ee3da298fac412d2e6b82f0a9c6659d98fecad9d1`。 |
| `/Users/coso/Documents/dev/ai/limecloud/content-factory-app`: `npm run readiness:app` | expected needs-setup | reference CLI readiness 返回 `ok=true / status=needs-setup`；剩余 warnings 是 host 运行前必须满足的 skills / knowledge / tool / artifact / eval / service 绑定，不是 manifest schema failure。 |

## 验证备注

- 2026-05-16 21:50 前后，旧 `npm run verify:local` 进程停在 `verify:gui-smoke` 的 `smoke:agent-apps` 子流程，未产生新的 GUI evidence；为避免占用并行 GUI / DevBridge 环境，已终止该验证链，不计为通过证据。
- 2026-05-16 21:57 重新执行 `npm run verify:gui-smoke`，workspace / browser runtime / site adapters / agent-service-skill-entry / runtime tool surface / `@` command registry 已通过；随后 `smoke:agent-apps` 在打开 Agent App Runtime 时触发 `agent_app_start_ui_runtime` DevBridge `/invoke` 5s timeout。该命令面位于隔壁持有的 `src-tauri/**` 写集，本进程不接管；本轮 GUI smoke 因并行 Tauri runtime 命令阻塞未计入通过证据。
- 2026-05-16 22:30 前后，focused `npm run smoke:agent-apps -- --timeout-ms 180000 --prefix agent-apps-smoke-p18-7-refocus` 复测仍停在 `stage=launch-runtime-surface`；复测期间 `http://127.0.0.1:3030/health` 曾从最初 ready 变为 connection refused，随后 `npm run bridge:health -- --timeout-ms 30000` 又恢复 ready，但直接 POST `agent_app_start_ui_runtime` 到 `/invoke` 仍 10s timeout。该 smoke 已终止，不计为通过证据。
- 2026-05-16 22:40 前后，`agent_app_get_ui_runtime_status` 返回 `status=stopped / message=Agent App UI runtime 未启动`，但系统进程表仍有多条 cwd 为 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 的 `npm run dev`。这说明 Tauri runtime registry 与外部 App dev server 进程状态已经不一致；清理这些外部进程属于外部 App / Tauri runtime 写集，本进程不直接 kill。
- 已补 `scripts/agent-apps-smoke.mjs` failure diagnostics：`try/catch` 会在 GUI smoke 失败时保存页面状态、DevBridge health、`agent_app_get_ui_runtime_status`、console errors、failed requests、failure screenshot 和外部 dev process snapshot；已用无效 app URL 自测确认 failure JSON / screenshot 会落盘，避免后续 Agent 再次人工复现才能定位 `launch-runtime-surface` 卡点。
- 2026-05-16 22:58 复查 `npm run bridge:health -- --timeout-ms 30000` 仍超时，当前本机没有可用 `http://127.0.0.1:3030/health` DevBridge；为避免与隔壁 Tauri runtime 写集抢占，本进程未继续启动完整 `npm run verify:gui-smoke`。
- 2026-05-16 23:00 后 DevBridge 恢复，focused Agent Apps smoke 与完整 `npm run verify:gui-smoke` 均已通过；此前 `agent_app_start_ui_runtime` timeout / registry stopped 的 GUI blocker 当前解除。
- 2026-05-16 23:08 增强 `smoke:agent-apps`，新增 iframe 内内容工厂断言：Runtime frame 必须加载业务 App，并在“内容战役”页展示 Host capability profile / 模型、Token、费用和 Skills 统一回写提示。focused 复跑已通过。
- 2026-05-16 23:20 前后继续补可选 `--include-content-factory-action-e2e` gate，用来验证真实业务按钮是否能进入 Host AgentRuntime。首轮失败后读取 failure JSON，确认 task id 实际已出现在 `lime.models/getRouting`、`lime.usage/*`、`lime.skills.list`、`lime.agent.streamTask/getTask` 等 SDK 后续调用中，只是 host task record 顶层未携带 task id。
- 2026-05-16 23:35 修正 `scripts/agent-apps-smoke.mjs` 等待逻辑：task id 同时从 host task record 和 SDK call log 提取，并新增 runtime facts / stream-or-getTask 断言。
- 2026-05-16 23:48 继续修正 smoke 诊断：读取 task-scoped host run record，而不只读 bridgeAction record；`agent-apps-smoke-p18-7-content-action-e2e-fixed5` 通过，默认 smoke `agent-apps-smoke-p18-7-default-after-action-gate-fixed4` 也通过。该证据把 P18.7-F 从“按钮只发出 startTask”推进到“最小真实按钮 E2E 已进入 Host AgentRuntime、可读取 runtimeFacts container，并能投影 required Skills”。
- 2026-05-16 23:55 新增 `--include-content-factory-completion-e2e` 可选完成态 gate；当前运行 `agent-apps-smoke-p18-7-completion-gate-current` 预期失败，缺口明确为模型路由、Token、费用、Skill invocation、artifact、evidence 未完成，task record 仍显示 `active_turn_id=null / profile_status=idle`。
- 2026-05-17 00:02 对同一 task 做只读根因探针：`agent_runtime_get_thread_read` 与 `agent_runtime_get_session` 均返回 `profile_status=idle / queued_turns_len=0 / turns_len=0 / messages_len=0`；SQLite `agent_sessions` 有 session 行，但 `agent_thread_turns`、`agent_messages`、`agent_runs` 均无对应记录；尝试 `agent_runtime_promote_queued_turn` 使用 `agent-app-queued-{taskId}` 返回 `false`。当前更像 accepted 后 runtime turn 未落库 / 未执行，而不是内容工厂 UI 未读取。

## Prompt-to-artifact 完成审计

| 显式要求 / gate | 对应 artifact / evidence | 覆盖结论 |
| --- | --- | --- |
| 多 Agent 并行时先切写集、避免夹写 | `AGENTS.md` 新增并行协作规则；`docs/aiprompts/parallel-agent-collaboration.md`；本文“并行写集”表 | 已覆盖；后续 Agent 应先读并声明写集 |
| 固定全量 `lime.*` capability surface 单一事实源 | `src/features/agent-app/sdk/capabilityCatalog.ts`；`capabilityContract.test.ts`；`capabilityAdapters.test.ts`；`publicSdkSurface.test.ts` | 已覆盖；catalog / adapter / profile 从同一事实源派生 |
| Agent App `manifestVersion: 0.6.0` 标准兼容 | `normalizeManifest.ts`、`checkReadiness.ts`、`parseManifest.test.ts`、`referenceCliCrossCheck.test.ts` | 已覆盖；v0.6 新字段和 runtime policy 深投影仍按 accepted divergence 退出条件跟踪 |
| `lime.capabilities` Host discovery | `capabilityDispatcher.test.ts`、`AgentAppRuntimePage.test.tsx` 覆盖 `list/get/getProfile` 与 iframe profile | Host 侧已覆盖；外部 App UI 消费未覆盖 |
| P18.7-D AgentRuntime resources | `capabilityDispatcher.test.ts` 覆盖 `models/usage/skills/memory/context` 只读投影与 mutation 拦截 | first-cut 已覆盖；真实预算、模型约束、memory query、context attach gate 未覆盖 |
| P18.7-E Tool / Integration | `capabilityDispatcher.test.ts` 覆盖 `search/browser/documents/media/mcp/terminal/connectors` 受控 intent / 只读投影 / not_available | Host first-cut 已覆盖；真实 ToolRuntime / Connector execution gate 未覆盖 |
| Agent Apps GUI 主路径可交付 | 2026-05-16 23:05 `npm run verify:gui-smoke` 通过；2026-05-16 23:08 focused `smoke:agent-apps` 新增 iframe 内 Host profile 断言后通过 | 已覆盖最新工作树；GUI 主路径当前复绿 |
| P18.7-F 内容工厂产品闭环 | 外部 `content-factory-app` tests / Host iframe profile smoke 已覆盖 typed Agent task、Host runtime facts、运行过程展示和写回路径；可选真实按钮 E2E 已证明 `lime.agent.startTask`、Host task accepted / runtimeFacts observed、models/usage/skills runtime facts 拉取和 stream 订阅启动 | first-cut 与最小真实按钮 E2E 已覆盖；真实业务 AI 动作完成态 / artifact / workspace patch 长链路未完成 |
| 验证失败可诊断 | `scripts/agent-apps-smoke.mjs` failure diagnostics；`agent-apps-smoke-diagnostics-selftest-failure.json/png` 与 `agent-apps-smoke-diagnostics-process-selftest-failure.json/png` 自测证据 | 已覆盖；后续失败应直接读取 failure JSON / screenshot，其中 `processSnapshot` 可直接确认是否存在 cwd 为 `content-factory-app` 的残留 dev server |

## P18.7-F 完成度审计（2026-05-16 23:48）

| 完成标准 | 当前证据 | 审计结论 |
| --- | --- | --- |
| 1. “整理知识库”真实通过 `lime.agent` 进入 AgentRuntime | `agent-apps-smoke-p18-7-content-action-e2e-fixed5-summary.json`：`contentFactoryActionStarted=true`、`contentFactoryActionTaskAccepted=true`、task id 来自 task-scoped host run record | 已覆盖最小按钮；其他页面按钮未覆盖 |
| 2. 运行过程展示来自 Host `runtimeProcess`，过程不消失 | 同一 summary：`contentFactoryActionProcessVisible=true`；host run record `runtimeProcess.timelineCount=1`，页面展示 `Lime AI 运行现场` | first-cut 覆盖；完成后折叠保持尚未覆盖 |
| 3. 模型、Token、费用、Skill、工具、引用、artifact、evidence 均可见 | `agent-apps-smoke-p18-7-completion-gate-current-failure.json`：`modelReady=false`、`usageReady=false`、`costReady=false`、`skillInvocationReady=false`、`artifactReady=false`、`evidenceReady=false`；task record 显示 `active_turn_id=null / profile_status=idle`；DevBridge/SQLite 探针显示该 session 无 turn/message/run | 未完成；已有可选 gate 固定该缺口，根因偏 runtime turn 未执行/未落库 |
| 4. 最终业务结果写回 App storage / artifacts / evidence | 完成态 gate 当前 `workspacePatchReady=true`，但 `artifactReady=false / evidenceReady=false`；外部 App 单测只能证明写回逻辑存在 | 未完成，不能用单测替代真实 Host iframe 完成态 |
| 5. 不跳回 Lime 通用 Chat，不直接调用模型 API | 当前 E2E 留在内容工厂 iframe，未出现 Host fallback；外部 App tests 覆盖 Host connected 时禁止本地生成 API | 当前按钮覆盖；全页面仍需逐个验证 |
| 6. standalone 页面不可替代 Host iframe 证据 | 现有 passing gate 均从 Lime Host iframe 触发；standalone 只作为外部 App 单测 / validate 辅证 | 已按口径执行 |


## 当前结论

- `current`：`lime.* capability catalog`、typed SDK、profile 派生、Agent App v0.6 reference cross-check、`lime.capabilities` Host discovery first-cut、`lime.models` / `lime.usage` / `lime.skills` / `lime.memory` / `lime.context` AgentRuntime 只读资源投影 first-cut、P18.7-E `lime.search` / `lime.browser` / `lime.documents` / `lime.media` / `lime.mcp` / `lime.terminal` / `lime.connectors` 受控工具 intent 与运行投影 first-cut，以及内容工厂 Host iframe profile / runtime facts 消费 first-cut。
- `compat`：mock / adapter profile 和当前 Host Bridge preview 接线，仍服务测试与渐进接入。
- `deprecated`：手写 capability 数组、App 自己解析 runtime 事件、复制底层工具执行逻辑。
- `dead`：内容工厂专用后端命令、App 裸调模型 API、复制 Claw Skill launch。

## 完成度审计

| 目标 / 要求 | 当前证据 | 结论 |
| --- | --- | --- |
| P18.7-A：全量 `lime.*` catalog、typed SDK、profile 派生为单一事实源 | `capabilityCatalog.ts`、`capabilityContract.test.ts`、`capabilityAdapters.test.ts`、`publicSdkSurface.test.ts`；定向与 Agent App 全套通过 | 已完成 |
| P18.7-B：`manifestVersion: 0.6.0` 标准兼容、layered manifest 和 reference cross-check 复绿 | `normalizeManifest.ts`、`checkReadiness.ts`、`parseManifest.test.ts`、`referenceCliCrossCheck.test.ts`；v0.6 reference 相关定向通过 | 已完成 |
| P18.7-C：`lime.capabilities.list/get/getProfile` Host discovery，不泄露 internal path | `capabilityDispatcher.test.ts` 覆盖 list/get/getProfile、unknown capability、无 `path/sourceFile/internal`；Runtime Page test 覆盖 iframe 调用 `getProfile` | Host 侧 first-cut 已完成 |
| P18.7-C：业务 App UI 根据 profile 降级 | 只读审计外部 `content-factory-app`，当前未发现 `lime.capabilities` / `getProfile` 消费；外部仓库有大量并行脏写集 | 未完成，需外部 App 写集持有者接 |
| P18.7-D：`lime.usage` 投影 model、token、cost、budget | `capabilityDispatcher.test.ts` 覆盖 `getTokenUsage/getCostSummary` 从 `runtimeProcess` 投影 Token 与成本；`getBudget` 明确 `not_configured` | Token / cost first-cut 已完成；budget 未完成 |
| P18.7-D：`lime.models` 读取模型事实源、路由结果和约束 | `capabilityDispatcher.test.ts` 覆盖 `list/getRouting` 从 `runtimeProcess.model` 投影；`select/estimateCost` 为 runtime projection first-cut | first-cut 已完成，模型约束仍需接真实模型事实源 |
| P18.7-D：`lime.skills` | `capabilityDispatcher.test.ts` 覆盖 `list/resolve/getInvocation` 从 `runtimeProcess.skillNames/invokedSkillNames` 投影；`bind/invoke` 返回 `not_available`，不打开 mutation | first-cut 已完成，真实 workspace binding / Skill runtime gate 仍需后续主链接入 |
| P18.7-D：`lime.memory`、`lime.context` | `capabilityDispatcher.test.ts` 覆盖 `getStatus/query/getSnapshot` 从 App-scoped task、knowledge bindings、threadRead diagnostics、thread/turn ids 投影；`write/compact/attach/detach` 返回 `not_available`，不打开 mutation | first-cut 已完成，真实 memory runtime query / context attach gate 仍需后续主链接入 |
| P18.7-E：`lime.search/browser/documents/media/mcp/terminal/connectors` 工具集成 | `capabilityDispatcher.test.ts` 覆盖 `lime.search.query/getRun`、`lime.browser.open`、`lime.documents.parse`、`lime.media.generateImage`、`lime.mcp.listServers/invoke`、`lime.terminal.run/getRun/cancel`、`lime.connectors.list/getStatus/requestAuth/invoke`；Host Bridge 对工具执行只返回受控 `requires_agent_task` intent、只读投影、Host 授权需求或明确 `not_available`，不直接执行工具 / MCP / 终端 / 外部连接器 | Host 侧 first-cut 已完成；真实 ToolRuntime / Connector execution gate 仍未完成 |
| P18.7-F：内容工厂产品闭环复核 | Lime Host 侧已有 `lime.agent`、runtimeProcess、models/usage first-cut；外部 App `npm test` 覆盖 profile/usage/skills runtime facts、运行过程展示、workspace patch 写回、Host connected 时禁止本地生成 API；focused Agent Apps smoke 断言 iframe 内 Host profile 可见；可选真实按钮 E2E 已确认知识库整理按钮进入 Host AgentRuntime、拿到 task id、启动 runtime facts 拉取与 stream 订阅 | first-cut 与最小真实按钮 E2E 已完成；逐页面真实 AI 动作完成态 / artifact / workspace patch 长链路仍是后续深水位 |
| GUI 主路径可交付 | 2026-05-16 23:05 完整 `npm run verify:gui-smoke` 通过；2026-05-16 23:08 增强后 focused Agent Apps smoke 通过 `runtimeFrameContentFactoryLoaded/runtimeFrameHostProfileVisible` 断言 | 当前工作树已复绿 |

## 剩余缺口

1. `docs/roadmap/agentapp/lime-capability-surface.md` 与 `p18-7-full-lime-capability-surface.md` 同时未跟踪，需由文档写集持有者决定是保留摘要还是合并入口。
2. P18.7-B 的 v0.6 代码验证已通过当前工作树，但路线图文档还应补一条验证证据，避免后续 Agent 误判仍未复绿。
3. P18.7-C first-cut 已可通过 Host Bridge 投影 catalog 摘要、stage、owner、enabled、implementation 和 unavailable reason；Agent App Runtime Page 已把 `lime.capabilities` 暴露给 iframe，并补了 `getProfile` 回归。只读审计外部 `content-factory-app` 后确认业务 App UI 尚未调用 `lime.capabilities` 做降级展示；该外部仓库当前有大量并行脏写集，本进程不接管。
4. P18.7-D first-cut 已可通过 Host Bridge 为声明了 `lime.models` / `lime.usage` / `lime.skills` / `lime.memory` / `lime.context` 的 App 投影 `runtimeProcess`、App-scoped task、threadRead diagnostics、thread/turn ids 中的模型、Token、成本、Skill、记忆/上下文状态；预算尚无 AgentRuntime 事实源，当前明确返回 `status=not_configured / reason=no_agent_runtime_budget_facts`，`lime.skills.bind/invoke`、`lime.memory.write/compact`、`lime.context.attach/detach` 也明确返回 `not_available`，不伪造可变更或执行成功。
5. P18.7-E 已完成 `search/browser/documents/media/mcp/terminal/connectors` Host first-cut，但真实 ToolRuntime / Connector execution gate 仍未完成；P18.7-D 深水位仍缺真实 memory runtime query、context attach gate、模型约束事实源、workspace skill binding ready 状态和预算事实。
6. P18.7-F first-cut 已覆盖内容工厂 Host profile / runtime facts 消费和 GUI iframe 加载；当前可选深水位 smoke 已证明“整理知识库”按钮能发出 `lime.agent.startTask`、拿到 Host task id（taskIdSource=hostTaskRunRecord）、启动 runtime facts 拉取和 stream 订阅。但还缺 Host iframe 内逐个真实点击“生成场景 / 生成内容 / 只重写 / 生成脚本 / 交付 / 复盘”的长链路 E2E，以及完成态 artifact / evidence / workspace patch 回写证据。

## 下一刀归属

- 若隔壁仍持有外部 `content-factory-app`：业务 App UI 的 profile 降级展示应由隔壁接；本进程继续做 Lime Host 侧验证和小补丁。
- 下一刀进入 P18.7-F 深水位：继续从已通过的 `--include-content-factory-action-e2e` 往后推进，补 runtimeProcess 中模型 / Token / 费用 / Skill invocation 的真实回写断言，再推进 artifact / evidence / workspace patch 完成态；若要覆盖更多页面，应按“生成场景 -> 生成内容 -> 交付 / 复盘”的顺序逐个加可选 gate。
