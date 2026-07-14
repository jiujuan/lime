# S6m raw SubAgent channel retirement evidence

## 结论

`agent_subagent_status:*` 与 `agent_subagent_stream:*` 已退出 Renderer 生产链：

- status sync effect、`listenToTeamEvents` adapter alias 和 status API 由首段 owner 删除。
- continuation 删除零 consumer 的 stream name/listener API 与 DevBridge truth prefix。
- stale `ChatModelSelector` adapter fixture 已收口。
- repository negative guard 同时禁止两个 prefix、专用 getter/listener 和 adapter alias 回流。

current transport 仍是 generic `agentSession/event` / `agent_stream_`、App Server notification、thread/read refresh 与 canonical child roster；没有新增 compat、fallback 或 mock producer。

## Producer / consumer 证据

- Rust、Electron 和 App Server 对两个专用 prefix 均为零 producer。
- stream helper 删除前全仓零生产 consumer；status 唯一 consumer 只触发 detail refresh，且其 channel 本身无 producer。
- canonical SubAgent GUI 由 SubAgent Item notification 与 thread item projection承接，成员状态由 `thread/list` child lifecycle 承接。

## 验证

- continuation focused：25/25。
- `npm run typecheck`：通过。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移 0、边界违规 0。
- `npm run test:contracts`：protocol types、App Server client 290 checks、command/harness/modality/scripts/release/cleanup gates 通过；最终 docs boundary 因并行索引的 `internal/exec-plans/release-v1.102.0-plan.md` 失败，与本切片无关。
- claimed write set Prettier 与 `git diff --check`：通过。
- `agentRuntimeEvents.test.ts` 完整 4/6；两条失败是 handoff 已记录的 sequence-gate 陈旧 raw fixture，本切片相关 generic listener/source 2/2 通过，未放宽 current gate。
- `npm run smoke:agent-runtime-current-fixture`：历史/stream/UI guard、首页、Workbench、图片、停止继续、Approval 与 Inputbar rich restore 均通过；聚合在 pending-steer 首跑等待 controlled input value 时超时。随后精确复跑 `inputbar-pending-steer-rich-restore` Electron 场景通过，判定为瞬时输入稳定时序，不是本切片回归。

## 分类

- `current`：generic App Server runtime event transport、local fanout/sequence gate、canonical read refresh、child roster。
- `dead`：status/stream 专用 event channel、helper/listener、adapter alias 与 bridge truth prefix。
- `test-only`：negative guard 中的 retired 名称。
