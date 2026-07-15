# S6t Parent Thread Residual Closeout

> 2026-07-15 后续纠正：本文件中的 41/41 `multi-agent-team` Electron run 包装了 external
> synthetic Team events，只是当时 fixture 结果，不再作为产品 Gate B。current canonical
> AgentControl visible DOM Gate B 见 S4ah evidence；S6t parent Thread 字段收口结论仍有效。

## 事实源

Multi-Agent parent identity 的唯一 current owner 是 canonical Thread / AgentGraph：
projection、Evidence Pack 和 Electron fixture 统一使用 `parentThreadId` / `parentThreadIds`。
session roster 不再承载产品 parent identity。

## 本轮收口

- Agent UI projection contract 删除 `parentSessionId`，Team control、subagent collaboration facts 与 App Server facts 改为 `parentThreadId`。
- App Server `team_facts` summary 和 Evidence Pack 测试改为输出、断言 `parentThreadIds`。
- Multi-Agent fixture 的 backend payload、smoke guard、scenario registry 和 runtime assertion 改为 canonical Thread identity；删除旧 `includesParentSession` 断言。
- current roadmap / execution plan 文案改为 child Thread、`parent_thread_id` 与 `parentThreadId`，移除已删除 `team_runtime_governor` 的 current 函数名。

## 分类

- `current`：canonical Thread / AgentGraph parent identity、`parentThreadId` projection facts、`parentThreadIds` Evidence Pack summary。
- `compat`：无新增。
- `deprecated`：无新增。
- `dead / deleted / forbidden-to-restore`：Agent UI `parentSessionId` 字段、Evidence Pack `parentSessionIds` 输出、Multi-Agent fixture 旧 assertion。
- 保留边界：`lime-rs/crates/app-server/src/runtime/agent_control.rs` 与 gateway 的 `parent_session_id` 仅用于 AgentControl session lookup，不进入 projection 或 Evidence facts。

## 验证

- `npm --prefix "packages/agent-runtime-projection" run build`：通过。
- `node --test "packages/agent-runtime-projection/tests/appServerFacts.test.mjs"`：10/10 通过。
- `npm exec vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" "src/lib/governance/projectThreadFirstBoundary.test.ts"`：32/32 通过。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --lib export_evidence_pack_includes_multi_agent_team_facts`：1/1 通过。
- fixture guards：71/71 通过；相关脚本 syntax check 通过。
- `npm run typecheck`：通过。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移 0、边界违规 0。
- `npm run smoke:claw-chat-current-fixture -- --scenario multi-agent-team --timeout-ms 180000`：真实 Electron Gate B 通过；parent Thread、thread、turn、handoff、worker notification、review lane 全部命中，actionable console errors 为空。
- fresh exact rerun `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario multi-agent-team --prefix claw-chat-current-fixture-multi-agent-team-s6t-rerun --timeout-ms 240000`：总断言 41/41、场景断言 11/11、`evidencePackMultiAgentTeamParentThreadBound=true`、actionable console errors 0；summary 位于 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-multi-agent-team-s6t-rerun-summary.json`。
- `npm run verify:gui-smoke`：通过。
- `npm run verify:local`：通过；smart Vitest 110/110、changed-scope Rust 与 GUI smoke 全部通过。
- `npm run test:contracts`：通过；protocol types 无漂移、app-server-client 288 checks、command/Harness/modality/scripts/release/docs boundary 全部通过。

首次 residual Gate B 在共享树改动期间报告 parent-thread assertion 失败，但失败 summary 已包含
`includesParentThread=true`，且以落盘源码复算全部 assertion 为 true。稳定源码下 fresh exact
rerun 通过，因此首次结果不作为产品失败证据；现象与长跑进程加载旧 assertion、随后落盘新
summary shape 的版本漂移一致。

## 下一刀

由 coordinator 在真实 PR context 完成 architecture confirmation；本 slice 不新增协议 owner 或兼容层。
