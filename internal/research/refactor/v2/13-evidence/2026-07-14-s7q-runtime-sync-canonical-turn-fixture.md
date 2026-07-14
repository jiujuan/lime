# S7q Runtime Sync Canonical Turn Fixture Evidence

## 结论

runtime sync 只通过 canonical `turn/updated` 识别 terminal Turn。原测试 notification 仅包含
raw `turn.completed`，production projector 正确忽略它，因此没有登记 deferred terminal
refresh，解绑后会正常回退到 `runtimeSync.sendSettled` detail refresh。

S7q 只给该 terminal fixture 补充 identity 一致的 canonical completed Turn，使测试验证真实
current 链；没有清空 mock 调用掩盖行为，也没有修改 production hook/projector。

## 写集与协调

- 本 slice 只认领 `useAgentRuntimeSyncEffects.test.tsx` 中 completed Turn fixture hunk。
- 同文件的 retired team-listener 删除属于已完成 S6m，不归 S7q 所有。
- production runtime sync、protocol、Electron、Rust 与中央执行计划均避让。

## 分类

- `current`：canonical `turn/updated(status=completed)` terminal reconcile。
- `test-only`：completed Turn notification fixture。
- `compat / deprecated`：无新增。
- `dead / forbidden-to-restore`：raw `turn.completed` 作为 terminal current-chain 正向证据。

## 验证

- runtime sync effects：23/23 passed。
- S7l-S7q current-tree 聚合 Vitest：9 files / 86 tests passed。
- claimed files exact ESLint、Prettier 与 `git diff --check` passed。
- smart Vitest resume 已完成 batch 110，`failed_batch: null`。
- `npm run typecheck` passed；`npm run governance:legacy-report` 为 0/0/0。
