# 推进进度追踪

> 状态：active tracker
> 更新时间：2026-07-02
> 目标：用低 token、可审计的方式逐步推进 Lime Agent 可验证研发体系，不把 Agent QC 重新推回高成本全量 qcloop。

## 0. 状态口径

| 状态 | 含义 |
| --- | --- |
| `done` | 文档 / 规则 / 证据已落盘，本阶段目标已达到 |
| `in-progress` | 已开始推进，有明确下一刀 |
| `blocked` | 有明确阻断，不能靠继续烧 token 解决 |
| `pending` | 已定义但尚未开始 |
| `deferred` | 有价值但当前不是主线 |

## 1. 总体进度

| 阶段 | 状态 | 完成度 | 当前结论 |
| --- | --- | --- | --- |
| S0 研究与骨架 | `done` | 100% | 原文、Lime 方案稿、计划骨架已落盘 |
| S1 Token 预算策略 | `done` | 100% | 已定义 C0-C4 成本分级和 `budget:*` 标签 |
| S2 Agent QC 分级 | `done` | 100% | 已定义日常 / 单场景 / release 三种模式 |
| S3 Verification Contract | `done` | 100% | 模板、触发规则和低风险样例已落盘 |
| S4 P0 low-cost green | `done` | 100% | Phase A preflight 通过；8 个 P0 低成本 summaries pass；release startup 分层 summary 已补齐 |
| S5 Scenario lane selector | `done` | 100% | 已跑通 deterministic contract、replay、workspace / GUI smoke、browser / adapter、Skill Forge、tool approval / sandbox、Claw current fixture、release startup lane |
| S6 Supervisor policy | `done` | 80% | 使用边界已落盘；尚未接入具体 judge prompt |
| S8 30/60/90 路线图 | `done` | 100% | 路线图已落盘 |
| S9 Managed Objective scene draft | `done` | 100% | 场景草案已落盘并挂入索引和进度追踪 |

## 2. 已完成

### 2.1 研究入口

状态：`done`

文件：

- `internal/research/agent/README.md`
- `internal/research/agent/ai-agent-verification-original.md`
- `internal/research/agent/lime-verifiable-agent-development-researched.md`

完成内容：

- 提取原视频文案。
- 补充外部主来源证据。
- 重写 Lime 方案稿，体现 Lime 已有资产和真实阻断。

### 2.2 计划骨架

状态：`done`

文件：

- `internal/research/agent/lime-agent-verification-plan/README.md`
- `00-current-assets.md`
- `01-token-budget-strategy.md`
- `02-agent-qc-triage.md`
- `03-verification-contract-template.md`
- `04-p0-green-plan.md`
- `05-scenario-lanes.md`
- `06-supervisor-and-judges.md`
- `08-30-60-90-roadmap.md`
- `11-command-bridge-evidence-summary-example.md`
- `12-harness-replay-evidence-summary-example.md`
- `13-workspace-ready-evidence-summary-example.md`
- `14-browser-runtime-site-adapter-evidence-summary-example.md`
- `15-skill-forge-evidence-summary-example.md`
- `16-tool-approval-sandbox-evidence-summary-example.md`
- `17-claw-chat-ready-streaming-evidence-summary-example.md`
- `18-release-package-startup-evidence-summary-example.md`
- `19-managed-objective-scenario-draft.md`

完成内容：

- 明确不默认跑 full qcloop。
- 明确 token 预算分级。
- 明确 Agent QC 三种运行模式。
- 明确 P0 green 的低成本推进路径。
- 新增 `command-bridge-contract` 的 structured evidence summary 示例，证明单场景 deterministic evidence 可以先落盘，不必进入 full qcloop。
- 新增 `harness-replay-regression` 的 structured evidence summary 示例，证明 replay summary / trend seed 可以作为低成本证据，而不能伪装成 release trend。
- 新增 `workspace-ready-session-restore` 的 structured evidence summary 示例，证明 workspace smoke + source-tree GUI smoke 可以作为低成本 GUI 主路径证据，而不能伪装成 release artifact。
- 新增 `browser-runtime-site-adapter` 的 structured evidence summary 示例，证明 Browser Runtime current 主链和旧 Site Adapter fail-closed guard 可低成本验证。
- 新增 `skill-forge-register-bind-enable` 的 structured evidence summary 示例，证明 Skill Forge current 链路、runtime binding readiness 与 SkillTool gate 可以用 deterministic smoke + runtime transcript 低成本验证。
- 新增 `tool-approval-sandbox-boundary` 的 structured evidence summary 示例，证明 tool surface、approval / sandbox projection 与 denied-only runtime transcript 可低成本验证；仍不替代 official Evidence Pack。
- 新增 `claw-chat-ready-streaming` 的 structured evidence summary 示例，证明 Claw GUI current fixture、真实 Electron textarea、App Server JSON-RPC、streaming 完成态和 history hydrate 矩阵可以低成本验证；仍不替代 official Evidence Pack。
- 新增 `release-package-startup-smoke` 的 structured evidence summary 示例，证明 `verify:app-version` + source-tree GUI startup smoke 可以低成本验证 release scope；仍不替代 installer artifact 验证或 official Evidence Pack。
- 新增 `19-managed-objective-scenario-draft.md`，把 Managed Objective 的 P1 / P2 骨架收敛成低 token 场景草案；明确先用 `objective-checklist`、`managed-objective-continuation`、`managed-objective-automation` 跑通控制层，再决定是否进入 Agent QC。

## 3. 当前进行中

### 3.1 Verification Contract 接入执行计划

状态：`done`

当前已有：

- research 模板已在 `03-verification-contract-template.md`。
- 执行计划主模板已在 `internal/exec-plans/templates/agent-verification-contract.md`。
- `internal/exec-plans/README.md` 已加入触发规则和低 token 默认口径。
- 低风险样例已在 `10-example-contract-command-bridge.md`。

缺口：

- 尚未绑定自动化质量入口，例如 `verify:tasks` 或人工执行计划审查。

下一刀：

1. 后续再评估是否接入 `verify:tasks` 或轻量 lint 检查。
2. 新 Agent 主链执行计划默认引用 exec-plans 模板。

预算：

- `budget:tight`
- 只需要文档编辑，不需要 qcloop / live Provider。

### 3.2 P0 Green 低成本前置检查

状态：`done`

当前已有：

- P0 green 分阶段计划已在 `04-p0-green-plan.md`。
- `agent-qc:check` 通过：scenario manifest valid，13 scenarios，8 P0，0 issues；GUI flow manifest valid，5 flows，0 issues。
- GUI owner gate 通过：`ownerCount=0`，`staleOwnerCount=0`。
- raw process owner gate 最新刷新通过：`activeGuiSmoke=0`，`cargoOrRust=0`，`qcloopRelated=0`。
- qcloop worker preflight 通过：cwd 可读、tmp 可写、DevBridge health `status=ok`。
- `command-bridge-contract` deterministic 门槛 `npm run test:contracts` 通过。
- 已生成 `command-bridge-contract` 单场景 qcloop payload sidecar，未提交 job；payload 已包含 `QCLOOP_WORKER_RESULT` 与 `QCLOOP_EVIDENCE_SUMMARY_JSON` 强约束。
- `harness-replay-regression` 低成本门槛通过：`npm run harness:eval` 与 `npm run harness:eval:trend` 通过；trend `sampleCount=1`，只能作为 seed。
- `workspace-ready-session-restore` 低成本门槛通过：`npm run smoke:workspace-ready` 与 `npm run verify:gui-smoke` 通过；已生成单场景 qcloop payload sidecar，未提交 job。
- `browser-runtime-site-adapter` 低成本门槛通过：`npm run smoke:site-adapters` 与临时 Chrome 9333 下的 `npm run smoke:browser-runtime -- --remote-debugging-port 9333` 通过；已生成单场景 qcloop payload sidecar，未提交 job。
- `skill-forge-register-bind-enable` 低成本门槛通过：`npm run test:contracts` 与 `npm run smoke:agent-service-skill-entry` 通过；`.lime/qc/skill-forge-runtime-transcript-current.json` 覆盖 deterministic-smoke 与 runtime-transcript；已生成单场景 qcloop payload sidecar，未提交 job。
- `tool-approval-sandbox-boundary` 低成本门槛通过：`npm run smoke:agent-runtime-tool-surface`、`npm run smoke:agent-runtime-approval-sandbox -- --devbridge-denied-runtime --skip-live-runtime --output .lime/qc/runtime-approval-sandbox-denied-only-current.json`、Rust permission preflight 定向测试、`npm run test:contracts` 与 `npm run agent-qc:check` 均通过；denied-only runtime transcript 证明无 live Provider 时可在模型路由前进入权限确认，拒绝后 pending 清零且 turn canceled。
- `claw-chat-ready-streaming` 低成本门槛通过：`npm run smoke:agent-runtime-current-fixture` 与 `npm run smoke:claw-chat-current-fixture` 均通过；本轮先修复 source-tree Electron fixture 下裸 `page.reload` 的 file URL 脆弱点，再证明默认新闻输入、图片命令、停止后继续、Plan hydrate、Skills Runtime、MCP structuredContent、Expert 与内容工厂 Article Editor 均走 current fixture 且 `liveProviderUsed=false`。
- `release-package-startup-smoke` 低成本门槛通过：`npm run verify:app-version` 与 `npm run verify:gui-smoke` 通过；首次 smoke 暴露 `app-server` 编译阻断，current worktree 中的 orchestration-based 修正复核后，`cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server` 与重跑 `verify:gui-smoke` 通过；当前仅证明 source-tree startup，不证明 installer artifact。
- `objective-checklist` 已支持 completion audit sidecar 缺失时 fail-closed，不再以 `ENOENT` 崩溃；缺失时会输出单项 blocker，并提示先运行 `agent-qc:audit -- --format json --output .lime/qc/objective-completion-audit-current.json`。
- `agent-qc:payload-coverage` 当前 sidecar 已刷新为 `status=ready`、`coverage=pass`、`repairGuard=pass`、`manifestP0=8`、`payloadItems=8`、`owner=pass`；只证明 ready payload 完整，不启动 qcloop。
- 新增 `agent-qc:verify-local-gate`，可运行真实 `npm run verify:local` 并写入 `.lime/qc/verify-local-current.json` / `.md`；最新结果为 `status=fail`、`exitCode=1`，失败发生在 `i18n:unused --check`，尚未进入 lint / typecheck / Rust / GUI 层。
- 最新 completion audit 为 `16/18`、`89%`；最新 objective checklist 为 `5/7`。

缺口：

- 尚未产生 official `.lime/qc/agent-qc-evidence.json`；也不应该用 ready payload、partial sidecar 或 local direct pass 覆盖它。
- `verify:local` 当前 sidecar 为 fail；失败点是当前工作树 i18n unused key 候选，不属于本轮 Agent QC 脚本主改动。
- release artifact / installer smoke 仍未单独验证。

下一刀：

1. 继续保持 `budget:tight`，不默认启用 live Provider。
2. 下一刀回到 official Evidence Pack / qcloop 批次规划，不再把 source-tree startup 误当 installer 验证。
3. 修复或等 owner 收口当前 i18n unused key 候选后，重跑 `agent-qc:verify-local-gate -- --check`。
4. official Evidence Pack 仍等待 8/8 P0 同批次 pass。

预算：

- 默认 `budget:tight`
- 禁止 full qcloop
- 禁止 live Provider

## 4. 阻断与风险

| 风险 | 当前处理 |
| --- | --- |
| Token 成本失控 | 默认 C0/C1，qcloop / LLM / live Provider 只在明确授权时启用 |
| GUI owner 并发 | P0 前必须 owner gate；busy 时只记录 sidecar |
| qcloop worker 无输出 | 必须输出 `QCLOOP_EVIDENCE_SUMMARY_JSON` |
| verifier 重试烧 token | verifier 只审结构化 summary，不吃完整日志 |
| live Provider 额度不足 | 默认 fixture / replay；live 只作为 release 或明确授权证据 |
| partial sidecar 被误用 | official evidence 只接受同一批次 8/8 P0 |

## 5. 下一步队列

| 优先级 | 任务 | 预算 | 状态 |
| --- | --- | --- | --- |
| P0 | 把 Verification Contract 模板迁入 `internal/exec-plans` | `budget:tight` | `done` |
| P0 | 定义 Agent 主链改动的合同触发规则 | `budget:tight` | `done` |
| P0 | 只读刷新 owner gate / preflight 当前状态 | `budget:tight` | `done` |
| P0 | 填写一个低风险 Verification Contract 样例 | `budget:tight` | `done` |
| P1 | 选择第一个低成本 P0 单场景补证据 | `budget:tight` | `done` |
| P1 | 给 `command-bridge-contract` 写 evidence summary 示例 | `budget:tight` | `done` |
| P1 | 生成 `command-bridge-contract` 单场景 qcloop payload，不提交 job | `budget:tight` | `done` |
| P1 | 给 `harness-replay-regression` 写 evidence summary 示例 | `budget:tight` | `done` |
| P1 | 给 `workspace-ready-session-restore` 写 evidence summary 示例 | `budget:tight` | `done` |
| P1 | 给 `browser-runtime-site-adapter` 写 evidence summary 示例 | `budget:tight` | `done` |
| P1 | 给 `skill-forge-register-bind-enable` 写 evidence summary 示例 | `budget:tight` | `done` |
| P1 | 给 `tool-approval-sandbox-boundary` 写 evidence summary 示例 | `budget:tight` | `done` |
| P1 | 修 `tool-approval-sandbox-boundary` denied-only runtime transcript | `budget:tight` | `done` |
| P1 | 给 `claw-chat-ready-streaming` 写低成本 runtime / GUI summary 示例 | `budget:tight` | `done` |
| P1 | 给 `release-package-startup-smoke` 写 source-tree startup / release-artifact 分层 summary 示例 | `budget:tight` | `done` |
| P2 | 把 Managed Objective 收成 Agent QC 场景草案 | `budget:normal` | `done` |
| P2 | 接入 Supervisor rubric 输入裁剪 | `budget:normal` | `done` |
| P2 | objective checklist 缺 audit sidecar fail-closed | `budget:tight` | `done` |
| P2 | local verify gate sidecar 脚本化 | `budget:tight` | `done` |
| P0 | 修复当前 `i18n:unused --check` 阻断并重跑 local verify gate | `budget:normal` | `blocked` |
| P0 | 生成 official 8/8 P0 qcloop Evidence Pack | `budget:high` | `blocked` |

## 6. 推进日志

### 2026-07-02

- 新增 `lime-agent-verification-plan/` 计划骨架。
- 新增 token 预算策略，明确 C0-C4 成本分层。
- 新增 Agent QC 分级策略，避免默认 full qcloop。
- 新增 P0 green 计划，按 preflight -> 单场景 -> 8/8 official evidence 推进。
- 新增本进度追踪文件。
- 将 Agent Verification Contract 主模板迁入 `internal/exec-plans/templates/agent-verification-contract.md`。
- 在 `internal/exec-plans/README.md` 增加触发规则：Agent / Runtime / Plugin / Skill / Managed Objective / Harness / GUI 主链改动应先填写合同，并默认低 token。
- 新增 `10-example-contract-command-bridge.md`，示范 `budget:tight` 下如何填写低风险 deterministic P0 合同；样例不跑 qcloop、不写 official evidence。
- 放行 `.gitignore` 中的 `internal/exec-plans/templates/*.md`，确保模板能作为 versioned artifact 纳入仓库。
- 放行 `.gitignore` 中的 `internal/research/agent/**`，确保本研究目录和计划骨架能作为 versioned artifact 纳入仓库。
- 刷新 `budget:tight` preflight：`npm run agent-qc:check` 通过，manifest valid；GUI owner gate 通过，`ownerCount=0`，`staleOwnerCount=0`；qcloop worker preflight 通过，DevBridge health `status=ok`。
- raw process owner gate 首次刷新时仍有短暂 `cargo-fmt --all --check` owner，等待后再次刷新通过：`activeGuiSmoke=0`，`cargoOrRust=0`，`qcloopRelated=0`。
- 执行 `npm run test:contracts` 通过，形成 `command-bridge-contract` 的 deterministic 单场景证据。
- 新增 `11-command-bridge-evidence-summary-example.md`，把本次命令结果整理成 structured evidence summary；明确它不是 official Evidence Pack，不能 gate release。
- 生成 `.lime/qc/qcloop-command-bridge-contract-payload.json`，只验证单场景 payload 和结构化 evidence prompt 约束，不提交 qcloop job。
- Managed Objective 场景草案已落盘并挂入索引和进度追踪，S9 从 `in-progress` 收口为 `done`。
- 修复 `agent-qc:objective-checklist` 在 `.lime/qc/objective-completion-audit-current.json` 缺失时的 `ENOENT` 崩溃；新增 `scripts/agent-qc/objective-checklist.test.mjs` 和 core 回归，缺 sidecar 时输出明确 incomplete blocker。
- 新增 `agent-qc:verify-local-gate` 与 `scripts/lib/agent-qc-local-verify-gate-core.mjs`，把真实 `npm run verify:local` 的退出结果写成 `.lime/qc/verify-local-current.json` / `.md`，供 completion audit 消费。
- 刷新 current sidecar：`objective-completion-audit-current.json/.md`、`objective-completion-checklist-current.json/.md`、`qcloop-p0-single-owner-ready-current.json`、`qcloop-p0-single-owner-ready-coverage-current.json/.md`、`verify-local-current.json/.md`。
- 最新 `agent-qc:audit -- --check` 为 `incomplete`：`16/18`，缺 `real-qcloop-evidence` 与 `local-verify-gate`；最新 `objective-checklist -- --check` 为 `5/7`，缺 official Evidence Pack 与完整 `verify:local` pass。
- `npm run agent-qc:verify-local-gate -- --check` 已真实运行完整本地门禁入口，但在 `i18n:unused --check` 失败；因此未关闭 `local-verify-gate`，也未进入后续 lint / typecheck / Rust / GUI smoke。
- 本轮新增 / 触碰脚本验证通过：`npx vitest run "scripts/lib/agent-qc-objective-checklist-core.test.ts" "scripts/agent-qc/objective-checklist.test.mjs" "scripts/lib/agent-qc-local-verify-gate-core.test.mjs" "scripts/agent-qc/verify-local-gate.test.mjs"`、`npm run agent-qc:check`、`npm run governance:scripts`、相关 ESLint、`node --check` 与 `git diff --check`。
- 执行 `npm run harness:eval` 通过：suites=3，cases=2，ready=2，invalid=0，current observability gap=0，degraded observability gap=1。
- 执行 `npm run harness:eval:trend` 通过：sampleCount=1，delta invalid=0；明确当前只能形成 trend seed，不能判断长期退化。
- 新增 `12-harness-replay-evidence-summary-example.md`，把 replay summary / trend seed 整理成 structured evidence summary；明确它不能替代 official Evidence Pack。
- 执行 `npm run smoke:workspace-ready` 通过：DevBridge ready，默认 workspace 可 ensure ready / by path 回查 / list 发现。
- 执行 `npm run verify:gui-smoke` 通过：renderer / Electron host / app-server sidecar / claw workbench shell / memory settings ready。
- 生成 `.lime/qc/qcloop-workspace-ready-session-restore-payload.json`，只验证单场景 payload 和结构化 evidence prompt 约束，不提交 qcloop job。
- 新增 `13-workspace-ready-evidence-summary-example.md`，把 workspace smoke + source-tree GUI smoke 整理成 structured evidence summary；明确它不能替代 release artifact。
- 执行 `npm run smoke:site-adapters` 通过：旧 Site Adapter 命令均 fail-closed，未回流成功路径。
- 初次执行 `npm run smoke:browser-runtime -- --remote-debugging-port 9222` 因本机 9222 `/json/list` 返回 404 阻断，归类为环境端口不匹配。
- 启动临时 headless Chrome 9333 后执行 `npm run smoke:browser-runtime -- --remote-debugging-port 9333` 通过：browser session read / console / network / events / cleanup 均有证据。
- 生成 `.lime/qc/qcloop-browser-runtime-site-adapter-payload.json`，只验证单场景 payload 和结构化 evidence prompt 约束，不提交 qcloop job。
- 新增 `14-browser-runtime-site-adapter-evidence-summary-example.md`，把 browser runtime smoke + site adapter guard 整理成 structured evidence summary；明确当前 site adapter 证据仍是 retired command fail-closed guard。
- 用正确包名执行 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-media-runtime` 通过，确认此前 `media-runtime` unclosed delimiter 阻断不是当前可复现编译错误。
- 首次执行 `npm run smoke:agent-service-skill-entry` 时，前端测试分组读到旧的 `AppPageContent.test.tsx` remount 预期并失败；随后发现当前工作树已改为复用实例口径，定向复跑该前端分组通过。
- 重新执行 `npm run smoke:agent-service-skill-entry` 通过：前端 metadata / gateway 38 tests pass；app-server Skill workspace exact tests 4 passed；lime-agent SkillTool gate exact tests 12 passed；服务技能入口路由 58 tests pass；A2UI 挂起主链 7 tests pass。
- 生成 `.lime/qc/skill-forge-runtime-transcript-current.json`，覆盖 8 个 runtime transcript events，SkillTool allow / deny 均包含 request / decision / result，allow 侧包含 source metadata。
- 执行 `npm run test:contracts` 通过，补齐 Skill Forge P0 的 contract side evidence。
- 生成 `.lime/qc/qcloop-skill-forge-register-bind-enable-payload.json`，只验证单场景 payload 和结构化 evidence prompt 约束，不提交 qcloop job。
- 新增 `15-skill-forge-evidence-summary-example.md`，把 Skill Forge deterministic smoke + runtime transcript 整理成 structured evidence summary；明确它不能替代 full qcloop 或 official Evidence Pack。
- 执行 `npm run smoke:agent-runtime-tool-surface` 通过：runtime tool surface 派生与应用层透传第一组 4 tests pass，runtime inventory 主链透传 47 tests pass，`unsafeToolExposed=false`。
- 执行 `npm run smoke:agent-runtime-approval-sandbox -- --devbridge-denied-runtime --skip-live-runtime --output .lime/qc/runtime-approval-sandbox-denied-only-current.json`，deterministic Vitest 分组通过后在 denied-only runtime transcript 阶段超时：最后线程摘要为 `threadStatus=idle`、`latestTurnStatus=idle`、`pendingRequestCount=0`、`permissionStatus=null`。
- 执行 `npm run smoke:agent-runtime-approval-sandbox -- --skip-live-runtime --output .lime/qc/runtime-approval-sandbox-projection-current.json` 通过，写出 projection evidence；`devBridgeDeniedRuntimeTranscript=false`，`liveRuntimeTranscript=false`。
- 生成 `.lime/qc/qcloop-tool-approval-sandbox-boundary-payload.json`，只验证单场景 payload 和结构化 evidence prompt 约束，不提交 qcloop job。
- 新增 `16-tool-approval-sandbox-evidence-summary-example.md`，把 tool surface + approval projection 证据整理成 partial / blocked summary；明确 denied-only runtime transcript 是当前 blocker，不能 gate release。
- 修复 `tool-approval-sandbox-boundary` denied-only runtime 主链：新增 App Server browser-control permission preflight，在 `approval_policy=on-request` + `sandbox_policy=workspace-write` + current browser assist runtime contract 命中时，模型路由前先写入 `action.required`；新增 read model `permission_state` 投影；拒绝权限后由 RuntimeCore 写入 `turn.canceled`，避免 pending 清零但 turn 卡在 running。
- 新增 Rust 定向测试 `runtime::tests::permission_preflight::browser_control_preflight_requests_permission_without_provider` 并通过，证明无 Provider 时可进入 `waitingAction`，拒绝后 `permission_state.confirmation_status=denied` 且 pending 清零。
- 重新执行 `npm run smoke:agent-runtime-approval-sandbox -- --devbridge-denied-runtime --skip-live-runtime --output .lime/qc/runtime-approval-sandbox-denied-only-current.json` 通过：`permissionRequestCreatedBeforeModel` / `deniedDecisionClearsPendingRequest` / `providerNotRequired` 均 satisfied；denied request `latestTurnStatus=waitingAction`，拒绝后 `afterThreadStatus=canceled`。
- 重新执行 `npm run smoke:agent-runtime-tool-surface` 通过，`unsafeToolExposed=false`。
- 重新执行 `npm run test:contracts` 通过；契约检查仍提示本地 ignored `scripts/__pycache__` 缓存存在，不属于本轮改动。
- 重新执行 `npm run agent-qc:check` 通过：scenario manifest valid，13 scenarios，8 P0，0 issues；GUI flow manifest valid，5 flows，0 issues。
- 更新 `16-tool-approval-sandbox-evidence-summary-example.md` 为 pass summary；明确它仍不是 official Evidence Pack，未启用 live Provider / full qcloop。
- 首次执行 `npm run smoke:agent-runtime-current-fixture` 进入 Claw 图片命令 GUI Electron fixture 时失败：`page.reload` 重新加载 `file:///.../dist/index.html?nativeStartup=1` 触发 `net::ERR_FILE_NOT_FOUND`；归类为 source-tree Electron fixture reload 脆弱点，不是 Provider 语义问题。
- 修复 Claw current fixture reload 主链：新增 `reloadRendererDocument`，保留真实 reload 语义；可恢复 Electron reload race / file URL 场景下显式恢复；若目标 file URL 不存在则 fail closed。图片命令、Plan hydrate、Expert Panel catalog reload、内容工厂 Article Editor 编辑稿恢复统一使用该 helper。
- 执行 `npx vitest run scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs` 通过：23 tests pass。
- 定向执行 `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario image-command --prefix claw-chat-current-fixture-image-command-regression --timeout-ms 180000` 通过，证明失败点已修复。
- 重新执行 `npm run smoke:agent-runtime-current-fixture` 通过：覆盖 history/cache hydration、final_done 工具收尾、failed read model、Claw 终态 UI、Coding Workbench、图片命令、停止后继续、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert、内容工厂 Article Editor；`liveProviderUsed=false`。
- 执行 `npm run smoke:claw-chat-current-fixture` 通过：真实 Electron textarea 发送“整理今天的国际新闻”，进入 `agentSession/turn/start`，GUI / read model / event read probe 均完成。
- 新增 `17-claw-chat-ready-streaming-evidence-summary-example.md`，把本次修复和低成本 GUI / runtime 证据整理成 structured evidence summary；明确它不能替代 full qcloop 或 official Evidence Pack。
- 新增 `18-release-package-startup-evidence-summary-example.md`，把 release-package-startup-smoke 的 source-tree startup / release scope 证据整理成 structured evidence summary；明确它不能替代 installer artifact 验证或 official Evidence Pack。
- 首次执行 `npm run verify:gui-smoke` 时，`electron:build:app-server` 暴露 current `app-server` Rust 编译阻断；复核 current worktree 中的 orchestration-based 修正后，`cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server` 通过，重跑 `npm run verify:gui-smoke` 自然收口。

## 7. 完成判定

第一阶段完成条件：

```text
Verification Contract 已进入 exec plan 模板
日常 Agent 改动默认不跑 full qcloop
至少 1 个低风险 Verification Contract 样例已落盘
P0 preflight 有只读 sidecar
至少 1 个 P0 场景有低成本 structured evidence summary 示例
```

第二阶段完成条件：

```text
8 个 P0 都能单场景输出 structured evidence summary
Agent QC release summary 能明确区分 pass / blocked / missing evidence
Managed Objective 至少进入 P1 场景草案
```

第三阶段完成条件：

```text
official .lime/qc/agent-qc-evidence.json 可由同一批次 8/8 P0 pass 产生
agent-qc:release-summary --check pass
agent-qc:audit complete
```
