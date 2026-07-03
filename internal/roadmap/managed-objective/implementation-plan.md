# Managed Objective 实施计划

> 状态：in-progress
> 更新时间：2026-05-26
> 目标：把 Managed Objective 拆成可验证阶段，先做受控目标续跑闭环，再扩展到长期业务任务。

依赖文档：

- [./README.md](./README.md)
- [./architecture.md](./architecture.md)
- [./diagrams.md](./diagrams.md)
- [../../aiprompts/query-loop.md](../../aiprompts/query-loop.md)
- [../../aiprompts/task-agent-taxonomy.md](../../aiprompts/task-agent-taxonomy.md)
- [../../aiprompts/state-history-telemetry.md](../../aiprompts/state-history-telemetry.md)

## 1. 实施总原则

1. **不新增 runtime taxonomy**
   - 任何执行都必须落到 `agent turn / subagent turn / automation job`。

2. **先状态，后自动**
   - 先把 objective state 和 audit 写清楚，再允许自动 continuation。

3. **先手动续跑，后空闲续跑**
   - 首期用手动 continue 验证链路，避免一上来就做后台自动循环。

4. **先 evidence audit，后模型总结**
   - 完成判断必须优先消费 artifact / thread_read / evidence pack。

5. **先低风险任务**
   - 首期只做只读 skill / 本地 artifact 产出，不做外部写操作自动化。

## 1.1 进度日志

- 2026-05-25：P1/P2 已接入 GUI current 主链，支持 session-scoped objective 保存、暂停、恢复、清除和手动继续；P3 第一刀已落地 `agent_runtime_audit_objective`，复用 `agent_runtime_export_evidence_pack` 事实源回写 `last_audit_summary / last_evidence_pack_ref / last_artifact_refs`，并在目标面板展示审计结果。
- 2026-05-25：P3 审计 guard 已补实：`completed` 决策必须同时具备 artifact / timeline / tool call / controlled evidence 之一；带 `success_criteria` 的目标必须有 `checkedCriteria / criteriaChecks` 等 satisfied 证据；存在 pending user request 时强制进入 `needs_input`。GUI 面板按 controller / current view / empty form / shared model 拆分，避免继续扩大单文件职责。验证已覆盖 Rust 定向审计测试、Managed Objective 前端回归与 `npm run test:contracts`。
- 2026-05-25：P4 第一刀已接入 automation owner binding：`agent_turn` automation payload 中的 `harness.managed_objective` 会持久化为 `owner_kind=automation_job` 的 objective，并回填 `objective_id / owner_id / completion_audit` 等 metadata；非 `active` objective 会阻断 due run，job pause / resume 会同步 objective pause / active，连续失败达到阈值后 objective 进入 `blocked` 并停用 job。验证已覆盖 Rust 定向绑定测试；due job 集成、app 重启恢复和 GUI job card projection 仍留在后续刀。
- 2026-05-25：P4 第二刀补齐 due job scheduler 回归：active objective 绑定的 due job 会由 automation scheduler 推进并写入 automation run metadata，`needs_input` objective 会在 scheduler 层停用 job 且不创建 run；同时修复 `execute_due_jobs` 内部 status 写锁重入导致的轮询卡死问题。验证已覆盖 `managed_objective_binding` 定向测试 9 条；真实 `agent_runtime_submit_turn` 队列与 GUI job card projection 仍留在后续刀。
- 2026-05-25：P5 第一刀已接入 automation job 列表投影：自动化设置页从现有 `agent_turn.request_metadata.harness.managed_objective` 解析 automation-owned objective，展示目标、状态、成功标准数量和 artifact / evidence 审计要求；解析与展示拆到 `managedObjectiveAutomationProjection.ts` 与 `AutomationManagedObjectiveSummary.tsx`，避免继续扩大自动化主文件。仍未完成详情弹窗里的 audit evidence backlink、artifact 回跳和 GUI smoke。
- 2026-05-25：P5 第二刀已接入持续流程详情投影：详情弹窗复用 automation objective projection，展示绑定目标、状态、成功标准和 evidence-based audit 要求；状态色抽到 `managedObjectiveAutomationStatus.ts`，详情展示拆到 `AutomationManagedObjectiveDetails.tsx`。当前仍只展示后端 payload projection，不在前端猜测 evidence pack / artifact 回链；下一刀应补真实证据入口与 GUI smoke。
- 2026-05-25：P5 第三刀修正 automation objective projection 的事实源：`get_automation_jobs / get_automation_job` 改为走 `AutomationService`，读取时刷新 `harness.managed_objective`，并从 Managed Objective 仓库回填真实 `state / last_audit_summary / last_evidence_pack_ref / last_artifact_refs / blocker_reason`；详情弹窗开始展示最近审计证据、证据包引用和产物引用。仍未新增 artifact 打开动作或导出 evidence pack 的 GUI action，最终验收仍需 GUI smoke。
- 2026-05-25：P5 第四刀补齐 automation objective 的 GUI 审计动作：持续流程详情可用最新 automation run 的 `session_id` 触发现有 `agent_runtime_audit_objective`，但写回目标 owner 为 `automation_job / job.id`；证据包与产物引用支持按 workspace root 打开或定位。命令仍复用 `agent_runtime_*` current 主链，前端复杂解析拆到 `managedObjectiveAutomationEvidence.ts`，避免继续扩大自动化设置页和详情弹窗文件。仍需 GUI smoke 验证真实桌面链路。
- 2026-05-25：P5 第五刀补齐会话目标面板的 projection-only 回归：`ManagedObjectivePanel` 明确以后端 `status` 为展示事实源，即使 `last_audit_summary` 中出现 `decision=completed` 也不会自行推断为完成；同时覆盖 `needs_input / blocked / budget_limited` 高风险状态和后端 `blocker_reason` 展示。验证已覆盖 `ManagedObjectivePanel.test.tsx` 定向回归与默认 `npm run verify:gui-smoke -- --reuse-running --timeout-ms 180000`；GUI smoke 已确认 `claw-chat-ready-streaming` 默认跳过、`@配图` 默认不提交，未触发真实 Provider。
- 2026-05-25：P6 第一刀已接入 agent session 的受控 idle 自动 continuation：runtime queue turn 成功结束后会读取 `owner_kind=agent_session` 的 active objective，只有 `continuation_policy` 显式允许 `autoIdle / auto_continue / controlled_auto` 等模式且无 queued turn、pending request、running turn、interrupt marker、风险阻断时，才复用现有 `agent_runtime_submit_turn` 队列投递下一轮标准 turn；自动续跑 metadata 写入 `continuation_source=auto_idle` 和 `auto_continuation_guard` 摘要，达到最大自动轮数、最大耗时或最大估算成本会把目标置为 `budget_limited`。本刀不新增 `objective_scheduler / objective_queue`，也不覆盖 automation owner 的 due job 调度；已完成 GUI smoke，仍需多轮端到端验证。
- 2026-05-25：P6 第二刀补齐自动续跑 guard 的 objective projection：allow / skip / budget_limited 决策会写回 `last_audit_summary`，并保留最近 evidence pack 与 artifact refs；pending request 会把目标置为 `needs_input`，预算耗尽会置为 `budget_limited`，未启用自动续跑或非 active owner 不写入噪声审计。guard audit 回写拆到 `objective_continuation_guard_audit.rs`，避免继续扩大 continuation 主文件。仍需多轮 continuation 端到端 smoke 证明每轮继续或停止都能被 evidence pack 解释。
- 2026-05-25：P6 第三刀补齐 focused continuation smoke 入口，并同步收紧 live Provider 测试门禁：`scripts/managed-objective-continuation-smoke.mjs` 默认拒绝真实 Provider 调用，必须显式传入 `--allow-live-provider` 或设置 `LIME_ALLOW_LIVE_PROVIDER_SMOKE=1 / LIME_REAL_API_TEST=1` 才会提交真实 `agent_runtime_submit_turn`。当前本地 Deepseek live 续跑因 `402 Payment Required: Insufficient Balance` 未作为通过证据；P6 仍不能标记完成，后续需要在明确授权且 provider 余额可用时补多轮端到端 smoke。
- 2026-05-25：P6 第四刀补齐 continuation smoke evidence core 的非 live fixture 回归：`buildSmokeEvidence` 不再无条件标记 `status=pass`，只有 `budget_limited`、guard summary、completion audit summary 和至少两轮 turn 四项断言同时满足才算通过；外层 smoke 也显式要求 evidence pack 能解释最终状态。验证已覆盖 `managed-objective-continuation-smoke-core` fixture 单测与 Rust `objective_continuation` 定向测试；真实多轮 live smoke 仍受 Provider 显式授权与余额限制。
- 2026-05-25：P6 第五刀补齐自动续跑 guard 的停止条件确定性回归：completed objective 会直接停在 `objective_not_active` 且不写入新的 auto guard 噪声审计；running turn 与 interrupt marker 会阻断空闲自动续跑；`runtime_turn_running` 这类 transient skip 会保留 guard audit 轨迹但不改目标状态。验证已覆盖 `cargo test --manifest-path "lime-rs/Cargo.toml" objective_continuation --lib`，14 条 objective continuation 定向测试全部通过。真实多轮 live smoke 仍需显式授权和可用 Provider 额度。
- 2026-05-25：P6 第六刀扩展 continuation smoke evidence core 的非 live 停止态证据：fixture 现在分别覆盖 `budget_limited / completed / needs_input`，并要求 `completed` 必须由 evidence pack 的 completion audit 明确解释，不能只凭 objective guard summary 自报完成；`needs_input` 可由 pending request / known gap / audit decision 解释。默认 live smoke 仍保持 `budget_limited` 预期，不放宽真实 Provider E2E 验收。验证已覆盖 `npx vitest run "scripts/lib/managed-objective-continuation-smoke-core.test.mjs"`、`node --check scripts/lib/managed-objective-continuation-smoke-core.mjs scripts/managed-objective-continuation-smoke.mjs` 与相关 `git diff --check`。
- 2026-05-25：第 9 节最小验收场景补齐非 live automation due job fixture：`completion_audit` policy 现在可声明 `required_successes / failure_block_after / evidence_pack_ref / artifact_refs / blocked_user_prompt`，LogOnly due job 在连续第 7 次成功且具备 evidence / artifact 引用时会把 automation-owned objective 标记为 `completed` 并停用 job；失败达到 policy 阈值 2 次会进入 `blocked` 并提示检查配置。验证已覆盖 `daily_report` due job 定向测试，不触发真实 Provider；真实 `Skill/Intelligent` 通过 `agent_runtime_submit_turn` 的 live 多轮 smoke 仍需显式授权和可用 Provider 额度。
- 2026-05-25：第 9 节第 4 条补齐 automation `AgentTurn` 的非 live queue contract：`executor.rs` 不再直接组装 runtime request，组包逻辑拆到 `agent_turn_runtime_request.rs`；测试反序列化 `build_queued_turn_task` 的标准 payload，断言 `queue_if_busy=false`、`auto_continue=None`、`queued_turn_id/turn_id` 由 runtime queue materialize、access policy 正规化，并保留 `harness.managed_objective.continuation_policy.dispatch=agent_runtime_submit_turn`。这只证明 `Skill/Intelligent` automation due job 走标准 `agent_runtime_submit_turn` 队列形态，不触发真实 Provider；真实 Markdown artifact / evidence pack 多轮验收仍需显式授权和可用 Provider 额度。
- 2026-05-25：第 9 节第 5 条补齐 automation `AgentTurn` 与 evidence pack owner run 的 session 关联：`ExecutionTracker` 新增终态回填 runtime `session_id` 的 finish 路径，automation `AgentTurn` 在拿到真实 runtime session 后会把 `agent_runs.session_id` 写入终态 run；这样 `agent_runtime_export_evidence_pack(session_id)` 按 session 查询 owner runs 时能读到 automation owner 与 `harness.managed_objective` audit 输入，不再只把 session id 藏在 metadata 里。验证已覆盖 `execution_tracker_service` 与 `managed_objective` Rust 定向测试，不触发真实 Provider；live 多轮 smoke 仍需显式授权和可用 Provider 额度。
- 2026-05-26：第 9 节第 6 条补齐 automation due job 重启恢复契约：同一数据库中已持久化的 automation job / managed objective，在新的 `AutomationService` 实例执行 due job 时会复用原 `objective_id`，不会重建目标或丢失 owner 关系；执行后的 automation run metadata 仍保留 `harness.managed_objective.owner_id / objective_id`，为 evidence pack owner run 审计提供稳定事实源。验证已覆盖 `due_job_should_recover_bound_objective_after_service_restart_without_replacing_it`，不触发真实 Provider。
- 2026-05-26：第 9 节第 7 条补齐 automation owner run 进入 evidence pack 的 DB session 查询契约：新增拆分后的 `runtime_evidence_pack_owner_session_tests.rs`，用 `ExecutionTracker` 在内存 DB 写入 automation run，并通过 `AgentRunDao::list_runs_by_session` 取出 owner runs 后导出 evidence pack；断言 runtime evidence 中含 `automationOwners`、`managedObjective.objective_id`，且 completion audit 由 automation owner + workspace skill tool call + Markdown artifact 判定为 `completed`。验证不触发真实 Provider；真实 GUI/live 多轮 smoke 仍需显式授权和可用 Provider 额度。
- 2026-05-26：P5 第六刀补齐 automation job 列表 summary 的 projection-only 回归：新增拆分后的 `AutomationManagedObjectiveSummary.test.tsx`，覆盖列表摘要只展示后端 `projection.status`，即使 `last_audit_summary` 自称 `completed` 也不会由前端推断完成；同时覆盖无成功标准 / 无 artifact-evidence 要求时不渲染 footer 噪声，避免继续扩大 1300+ 行的 automation 主测试文件。验证已覆盖 summary、projection 与详情弹窗定向 Vitest，不触发真实 Provider。
- 2026-05-26：第 10 节实现守卫补齐机械回归：新增 `managed-objective-guardrails-core`，默认 Vitest 会扫描 `src / lime-rs / scripts / packages` 的实现文件，禁止出现 `goal_runtime / objective_scheduler / objective_queue / objective_evidence_pack` 这些 parallel objective runtime 命名；文档仍可解释这些 dead direction，测试文件本身也不计入实现面。验证已覆盖当前仓库扫描和临时 fixture 违规检测，不触发真实 Provider。
- 2026-05-26：第 10 节补齐 “model 不能自行创建后台 objective” 的工具面守卫：`managed-objective-guardrails-core` 现在会单独扫描 `lime-rs/src/agent_tools`、`tool_runtime` 与 `agent_runtime_get_tool_inventory` 构建路径，禁止 `agent_runtime_get/set/update/clear/continue/audit_objective` 进入模型可见 tool surface；GUI/API/DevBridge current 命令面仍允许持有这些命令。验证已覆盖当前仓库扫描和临时 fixture 违规检测，不触发真实 Provider。
- 2026-05-26：第 10 节补齐 “unverified skill 不能被 managed objective 自动执行” 的 runtime enable 回归：新增拆分测试 `runtime_skill_binding_service_tests.rs`，覆盖 `harness.managed_objective + workspace_skill_runtime_enable` 自动路径必须拒绝缺少 `source_verification_report_id` 的 workspace Skill；已验证 skill 会保留 `managed_objective_due_job / automation_objective_policy` 来源并投影到 `allowed_skill_names`。验证已覆盖 `cargo test --manifest-path "lime-rs/Cargo.toml" runtime_skill_binding --lib`，9 条本地测试通过，不触发真实 Provider。
- 2026-05-26：补跑默认离线 GUI smoke 作为 current 桌面主路径证据：`env -u LIME_ALLOW_LIVE_PROVIDER_SMOKE -u LIME_REAL_API_TEST npm run verify:gui-smoke -- --reuse-running --timeout-ms 180000` 已通过，覆盖 DevBridge health、前端壳、workspace-ready、browser-runtime、site-adapters、agent-service-skill-entry、agent-runtime-tool-surface、agent-runtime-tool-surface-page、Plugins、Knowledge GUI、i18n patch retirement gate 与 Design Canvas。日志明确 `claw-chat-ready-streaming` 默认跳过，`@配图` smoke `submitRequest.routeMode=not_submitted / reason=live-provider-smoke-disabled`，未触发真实 Provider；该证据证明 GUI 主路径和 live Provider 门禁可用，但仍不替代 P6 真实多轮 continuation smoke。
- 2026-05-26：复跑 P6 非 live continuation 守卫与命令边界：`env -u LIME_ALLOW_LIVE_PROVIDER_SMOKE -u LIME_REAL_API_TEST npx vitest run "scripts/lib/managed-objective-continuation-smoke-core.test.mjs" "scripts/lib/managed-objective-guardrails-core.test.mjs"` 13 条通过，`cargo test --manifest-path "lime-rs/Cargo.toml" objective_continuation --lib` 14 条通过，`npm run test:contracts` 通过。该组证据覆盖自动续跑 allow / skip / budget_limited / needs_input / completed 停止、模型工具面禁用 objective 命令，以及 current 命令契约同步；仍不声称真实 Provider 多轮 smoke 已完成。
- 2026-05-26：P6 continuation smoke 默认改为 localhost OpenAI-compatible fixture：`scripts/managed-objective-continuation-smoke.mjs` 未显式授权时不再使用 `LIME_AGENT_QC_PROVIDER / LIME_E2E_PROVIDER / LIME_DEFAULT_PROVIDER` 选择真实 Provider，显式传 `--provider-preference` / `--model-preference` 但缺少 `--allow-live-provider` 会立即失败；首轮 `agent_runtime_submit_turn` 带 Direct `providerConfig` 指向 fixture。自动续跑会继承当前 provider/model/base_url，避免第二轮退回真实 Provider 池，同时不把 `api_key` 写入持久化队列 payload。该证据把 P6 多轮 smoke 从“必须消耗 live Provider”收敛为默认离线可验证；是否额外要求 live Provider 证据仍由发布验收口径单独决定。
- 2026-05-26：第 9 节补齐 automation `AgentTurn` owner-session evidence 回归：新增拆分后的 `automation_owner_session_evidence_tests.rs`，证明 `Skill/Intelligent` automation due job 的 finish metadata 会保留 `harness.managed_objective`、workspace skill runtime enable、`continuation_policy.dispatch=agent_runtime_submit_turn` 与 runtime `session_id`，并可通过 `AgentRunDao::list_runs_by_session` 查询到 automation owner run。验证已覆盖 `cargo test --manifest-path "lime-rs/Cargo.toml" automation_owner_session_evidence --lib`，不触发真实 Provider。
- 2026-05-26：第 9 节补齐默认离线 automation owner smoke 入口：新增 `npm run smoke:managed-objective-automation`，脚本启动 localhost OpenAI-compatible fixture，先把 Aster 全局 Provider 临时切到 fixture，再创建 enabled automation job 和未来一次性 schedule，避免创建时把 managed objective 同步成 paused。2026-06-08 自动化命令迁移后，该 smoke 已改为只通过 App Server `automationJob/create` / `automationJob/runNow` / `automationJob/runHistory` 验证；由于 App Server 自动化执行器尚未迁完，当前遇到 `automationJob/runNow` 执行器缺口时 fail closed，不能再回退旧 Tauri 自动化命令。后续完成 App Server 执行器迁移后，再恢复 owner run history、managed objective owner metadata 与 evidence pack owner audit 的离线 fixture 通过证据。

## 2. P0：文档与边界落盘

目标：固定 Managed Objective 的定义和禁止项。

任务：

1. 新增 `internal/roadmap/managed-objective/`。
2. 在 `internal/aiprompts/query-loop.md` 中声明 continuation 仍走 Query Loop。
3. 在 `internal/aiprompts/task-agent-taxonomy.md` 中声明 objective 不是第四类执行实体。
4. 在 `internal/aiprompts/state-history-telemetry.md` 中声明 objective projection 只消费 current 读模型。
5. 在 `internal/aiprompts/harness-engine-governance.md` 中声明 audit 只消费 evidence pack。

完成标准：

1. 文档能解释 `/goal` 与 Managed Objective 的区别。
2. 文档能解释 Managed Objective 与 Skill Forge / Skill Forge 的区别。
3. 文档明确 `goal_runtime / objective_evidence / objective_scheduler` 这些方向是 dead。

## 3. P1：Objective state scaffold

目标：让系统能保存和读取目标状态，但不自动续跑。

范围：

1. 定义 objective state 最小结构。
2. 绑定 `owner_kind / owner_id`。
3. 支持创建、暂停、恢复、完成、清除。
4. 在 thread read 或 workspace projection 中显示 objective 摘要。
5. 记录 `success_criteria / budget_policy / risk_policy`。

非目标：

1. 不启动下一轮 turn。
2. 不创建 automation job。
3. 不做后台 idle continuation。
4. 不执行任何工具。

完成标准：

1. 一个 agent session 能挂一个 active objective。
2. app 重启后 objective state 可恢复。
3. pause / resume 能改变状态，但不影响 Query Loop 主链。
4. 没有 owner 的 objective 不能进入 active。

建议验证：

1. objective create / read / pause / resume / clear 单测。
2. owner 不存在时拒绝 active 的边界测试。
3. thread read / workspace projection 快照测试。

## 4. P2：Manual continuation turn

目标：让用户手动触发“继续推进目标”，并确保仍走 Query Loop。

范围：

1. 从 objective 生成 continuation metadata。
2. 手动 continue 调用 `agent_runtime_submit_turn`。
3. `TurnInputEnvelope` 记录 objective snapshot。
4. continuation prompt 要求检查目标和已知证据。
5. 执行结果进入 timeline / artifact / thread_read。

非目标：

1. 不做自动 idle continuation。
2. 不做定时后台任务。
3. 不做模型自动 complete 工具。

完成标准：

1. 用户点击继续后，只产生一轮标准 agent turn。
2. 这轮 turn 可在 runtime evidence 中追踪到 objective id。
3. 若有 pending user input 或 paused 状态，手动 continue 被拒绝。
4. `auto_continue` 文稿续写语义不会被误识别为 objective continuation。

建议验证：

1. continuation metadata 组包测试。
2. paused / needs_input 拒绝续跑测试。
3. Query Loop 入口没有新增旁路的契约测试。

## 5. P3：Evidence-based completion audit

目标：把“是否完成”从模型自报升级为 evidence-based audit。

范围：

1. 生成 audit checklist。
2. 读取 `SessionDetail / AgentRuntimeThreadReadModel`。
3. 读取相关 artifact refs。
4. 读取 `agent_runtime_export_evidence_pack`。
5. 输出 `ObjectiveAuditResult`。
6. 根据 audit result 更新 objective status。

完成标准：

1. 没有 evidence refs 时不能标记 `completed`。
2. criteria 为 `unknown` 时不能标记 `completed`。
3. 缺用户输入时进入 `needs_input`。
4. 外部依赖失败时进入 `blocked` 或 `failed`。
5. audit result 能在 Workspace 看到摘要和证据入口。

建议验证：

1. satisfied / unsatisfied / unknown checklist 单测。
2. evidence 缺失阻断 complete 测试。
3. needs_input / blocked 状态转换测试。
4. evidence pack 导出引用测试。

## 6. P4：Automation owner binding

目标：让 durable 后台任务可以绑定 objective，但调度仍属于 automation job。

范围：

1. automation job payload 引用 objective id。
2. due job 触发 continuation policy。
3. continuation policy 通过后投递标准 agent turn。
4. job run 和 objective audit 互相引用，但不复制事实。
5. job pause / resume 与 objective pause / resume 行为一致。

非目标：

1. 不新增 objective scheduler。
2. 不新增 objective queue。
3. 不新增 objective run history。
4. 不允许 objective 绕过 automation service。

完成标准：

1. 定时任务能推进 active objective。
2. app 重启后 due job 能恢复或明确 blocked。
3. 用户输入未处理时不会自动续跑。
4. 连续失败会停止并进入 `blocked / failed`。
5. evidence pack 能导出 automation owner 与 objective audit 关系。

建议验证：

1. due job -> continuation policy -> runtime queue 集成测试。
2. pause / resume 同步测试。
3. 连续失败 cutoff 测试。
4. app 重启恢复测试。

## 7. P5：Workspace projection

目标：让用户能理解目标进度、阻塞点和证据。

范围：

1. Objective card：目标、状态、成功标准、下一步。
2. Job card：owner、最近运行、下次运行、失败次数。
3. Audit view：criteria、证据引用、产物引用、决策原因。
4. 操作：pause、resume、manual continue、clear、reopen。
5. 高风险状态提示：needs_input、blocked、budget_limited。

完成标准：

1. 用户能从 objective 看到 evidence。
2. 用户能从 automation job 看到 objective。
3. 用户能从 artifact 回到 objective audit。
4. UI 不自行推断完成状态，只展示后端 projection。

建议验证：

1. Objective card 组件测试。
2. paused / blocked / completed 文案快照测试。
3. GUI smoke：创建目标、手动继续、查看 audit。

## 8. P6：受控自动 continuation

目标：在 P1-P5 稳定后，允许系统在空闲时自动推进目标。

范围：

1. turn finished 后检查 active objective。
2. 通过 guard 后投递下一轮 continuation。
3. 尊重 queued input、pending elicitation、pause、budget、risk。
4. 自动 continuation 有最大轮数、最大耗时、最大成本。
5. 每轮 continuation 都写入 audit 或 run summary。

完成标准：

1. active objective 能在多轮 turn 中继续推进。
2. 用户输入插队时自动续跑停止。
3. budget 耗尽时进入 `budget_limited`。
4. 完成时进入 `completed`，不再续跑。
5. evidence pack 能解释每一轮为什么继续或停止。

建议验证：

1. idle continuation guard 单测。
2. queued input 阻断测试。
3. budget limit 测试。
4. completion 停止续跑测试。
5. 多轮 continuation 端到端 smoke。

## 9. 最小验收场景

### 场景：只读每日报告目标

输入：

```text
为这个已验证的只读 skill 设置一个目标：每天 9 点生成 Markdown 趋势摘要，连续 7 次成功后完成。失败时最多重试 2 次，之后提醒我检查配置。
```

系统应完成：

1. 创建 automation job。
2. 创建并绑定 Managed Objective。
3. 每次 due job 通过 continuation policy。
4. 每次执行走 `agent_runtime_submit_turn`。
5. 产出 Markdown artifact。
6. evidence pack 记录调用、产物、失败、预算与 audit。
7. 满足 7 次成功后 audit 标记 `completed`。
8. 失败超过阈值后进入 `blocked`，并要求用户输入。

不要求：

1. 外部发布。
2. 跨 workspace 共享。
3. 多 agent 自主扩队。
4. 外部写操作自动执行。

## 10. 实现守卫

实现时必须守住：

1. 不新增 `goal_runtime`。
2. 不新增 `objective_scheduler`。
3. 不新增 `objective_queue`。
4. 不新增 `objective_evidence_pack`。
5. 不让 UI 自行判定 completed。
6. 不让 model 自行创建后台 objective。
7. 不让 `auto_continue` 冒充 persistent objective。
8. 不让 unverified skill 被 managed objective 自动执行。

## 11. 推荐落地顺序

1. P0 文档。
2. P1 objective state scaffold。
3. P2 manual continuation。
4. P3 evidence audit。
5. P5 workspace projection。
6. P4 automation owner binding。
7. P6 自动 continuation。

顺序解释：

**先让目标可见、可停、可审计，再让它自动跑。**
